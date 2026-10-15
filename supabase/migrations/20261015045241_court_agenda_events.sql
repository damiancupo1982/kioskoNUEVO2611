/*
# Agenda de canchas: hora de fin, tipos de evento y control de superposición

1. Cambios en `court_reservations` (ahora representa cualquier evento de agenda)
- `end_time` (time): hora de finalización. Las filas existentes reciben inicio + 1:30.
- `event_type` (text): 'reserva' | 'clase' | 'torneo' | 'mantenimiento' (default 'reserva').
- `event_group` (uuid): agrupa un mismo evento en varias canchas (torneo / mantenimiento).
- `title` (text): nombre del torneo o motivo del mantenimiento.
- `professor`, `student` (text): datos opcionales de las clases.
- Regla: la hora de fin debe ser posterior a la de inicio.
- Se elimina el índice de "misma hora de inicio" (`uq_court_reservation_slot`): lo reemplaza el control
  de superposición, que es más completo. No se borran datos.

2. Control de superposición (trigger `check_court_event_overlap`)
- Al guardar un evento activo, verifica que en la misma cancha no exista superposición con:
  otros eventos activos (reservada/abierta), turnos en juego (desde su apertura hasta ahora)
  ni turnos jugados (apertura a cierre).
- Si hay conflicto, el error informa el horario ocupado (court_busy:HH:MM-HH:MM).
- Usa un bloqueo por cancha para evitar que dos operadores reserven el mismo horario a la vez.

3. Funciones
- `save_court_event(...)`: crea o edita un evento (una o varias canchas) de forma atómica.
- `cancel_court_event(group)`: cancela un evento futuro (todas sus canchas).
- `open_court_session(...)`: al abrir sin reserva, verifica que la cancha no esté ocupada en este momento
  por otro evento (clase, torneo, mantenimiento o reserva).

4. Seguridad
- Los eventos ya no se crean ni modifican directamente desde la app: solo con las funciones anteriores,
  que validan los datos. Se quitan las políticas directas de alta/modificación; la lectura sigue igual.
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='court_reservations' AND column_name='end_time') THEN
    ALTER TABLE court_reservations ADD COLUMN end_time time;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='court_reservations' AND column_name='event_type') THEN
    ALTER TABLE court_reservations ADD COLUMN event_type text NOT NULL DEFAULT 'reserva'
      CHECK (event_type IN ('reserva','clase','torneo','mantenimiento'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='court_reservations' AND column_name='event_group') THEN
    ALTER TABLE court_reservations ADD COLUMN event_group uuid;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='court_reservations' AND column_name='title') THEN
    ALTER TABLE court_reservations ADD COLUMN title text NOT NULL DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='court_reservations' AND column_name='professor') THEN
    ALTER TABLE court_reservations ADD COLUMN professor text NOT NULL DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='court_reservations' AND column_name='student') THEN
    ALTER TABLE court_reservations ADD COLUMN student text NOT NULL DEFAULT '';
  END IF;
END $$;

UPDATE court_reservations SET end_time = least(start_time + interval '90 minutes', time '23:59') WHERE end_time IS NULL;
UPDATE court_reservations SET event_group = id WHERE event_group IS NULL;

ALTER TABLE court_reservations ALTER COLUMN end_time SET NOT NULL;
ALTER TABLE court_reservations ALTER COLUMN event_group SET NOT NULL;
ALTER TABLE court_reservations ALTER COLUMN event_group SET DEFAULT gen_random_uuid();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'court_reservations_time_order') THEN
    ALTER TABLE court_reservations ADD CONSTRAINT court_reservations_time_order CHECK (end_time > start_time);
  END IF;
END $$;

DROP INDEX IF EXISTS uq_court_reservation_slot;
CREATE INDEX IF NOT EXISTS idx_court_reservations_group ON court_reservations(event_group);
CREATE INDEX IF NOT EXISTS idx_court_reservations_court_date ON court_reservations(court, reservation_date);

DROP POLICY IF EXISTS "insert_court_reservations" ON court_reservations;
DROP POLICY IF EXISTS "update_court_reservations" ON court_reservations;

CREATE OR REPLACE FUNCTION public.find_court_conflict(
  p_court smallint, p_start timestamp, p_end timestamp, p_exclude_id uuid
) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT to_char(x.s, 'HH24:MI') || '-' || to_char(x.e, 'HH24:MI')
  FROM (
    SELECT (r.reservation_date + r.start_time) AS s, (r.reservation_date + r.end_time) AS e
    FROM public.court_reservations r
    WHERE r.court = p_court AND r.status IN ('reservada','abierta')
      AND r.id IS DISTINCT FROM p_exclude_id
    UNION ALL
    SELECT (cs.opened_at AT TIME ZONE 'America/Argentina/Buenos_Aires'),
           (coalesce(cs.closed_at, greatest(now(), cs.opened_at) + interval '1 minute') AT TIME ZONE 'America/Argentina/Buenos_Aires')
    FROM public.court_sessions cs
    WHERE cs.court = p_court AND cs.status IN ('abierta','cerrada')
      AND cs.reservation_id IS DISTINCT FROM p_exclude_id
  ) x
  WHERE x.s < p_end AND x.e > p_start
  ORDER BY x.s
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.find_court_conflict(smallint, timestamp, timestamp, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.find_court_conflict(smallint, timestamp, timestamp, uuid) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.check_court_event_overlap()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_conflict text;
BEGIN
  IF NEW.status <> 'reservada' THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('court_agenda'), NEW.court);
  v_conflict := public.find_court_conflict(
    NEW.court, NEW.reservation_date + NEW.start_time, NEW.reservation_date + NEW.end_time, NEW.id);
  IF v_conflict IS NOT NULL THEN
    RAISE EXCEPTION 'court_busy:%', v_conflict;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.check_court_event_overlap() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_court_event_overlap() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_check_court_event_overlap ON court_reservations;
CREATE TRIGGER trg_check_court_event_overlap
  BEFORE INSERT OR UPDATE ON court_reservations
  FOR EACH ROW EXECUTE FUNCTION public.check_court_event_overlap();

CREATE OR REPLACE FUNCTION public.save_court_event(
  p_group_id uuid, p_event_type text, p_courts smallint[], p_date date, p_start time, p_end time,
  p_titular_name text, p_titular_lot text, p_title text, p_professor text, p_student text,
  p_notes text, p_user text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_group uuid := coalesce(p_group_id, gen_random_uuid());
  v_courts smallint[];
  v_free_rows uuid[];
  v_new_courts smallint[];
  v_row record;
  v_court smallint;
  i integer;
BEGIN
  IF p_event_type NOT IN ('reserva','clase','torneo','mantenimiento') THEN
    RAISE EXCEPTION 'invalid_event';
  END IF;
  SELECT array_agg(DISTINCT c ORDER BY c) INTO v_courts FROM unnest(p_courts) c WHERE c BETWEEN 0 AND 3;
  IF v_courts IS NULL OR array_length(v_courts, 1) <> coalesce(array_length(p_courts, 1), 0) THEN
    RAISE EXCEPTION 'invalid_courts';
  END IF;
  IF p_event_type IN ('reserva','clase') AND array_length(v_courts, 1) <> 1 THEN
    RAISE EXCEPTION 'invalid_courts';
  END IF;
  IF p_date IS NULL OR p_start IS NULL OR p_end IS NULL OR p_end <= p_start THEN
    RAISE EXCEPTION 'invalid_time';
  END IF;
  IF p_event_type = 'reserva' AND btrim(coalesce(p_titular_name,'')) = '' THEN
    RAISE EXCEPTION 'titular_required';
  END IF;
  IF p_event_type = 'torneo' AND btrim(coalesce(p_title,'')) = '' THEN
    RAISE EXCEPTION 'title_required';
  END IF;

  IF p_group_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.court_reservations WHERE event_group = p_group_id AND status = 'reservada') THEN
      RAISE EXCEPTION 'event_not_editable';
    END IF;
    IF EXISTS (SELECT 1 FROM public.court_reservations WHERE event_group = p_group_id AND status = 'abierta') THEN
      RAISE EXCEPTION 'event_not_editable';
    END IF;
  END IF;

  -- Rows whose court is no longer selected are reused for newly selected courts; leftovers are cancelled.
  SELECT coalesce(array_agg(id), '{}') INTO v_free_rows FROM public.court_reservations
  WHERE event_group = v_group AND status = 'reservada' AND NOT (court = ANY (v_courts));
  SELECT coalesce(array_agg(c), '{}') INTO v_new_courts FROM unnest(v_courts) c
  WHERE NOT EXISTS (SELECT 1 FROM public.court_reservations r WHERE r.event_group = v_group AND r.status = 'reservada' AND r.court = c);

  FOR i IN 1 .. coalesce(array_length(v_free_rows, 1), 0) LOOP
    IF i <= coalesce(array_length(v_new_courts, 1), 0) THEN
      UPDATE public.court_reservations SET court = v_new_courts[i] WHERE id = v_free_rows[i];
    ELSE
      UPDATE public.court_reservations SET status = 'cancelada', updated_at = now() WHERE id = v_free_rows[i];
    END IF;
  END LOOP;

  FOR v_row IN SELECT id FROM public.court_reservations WHERE event_group = v_group AND status = 'reservada' LOOP
    UPDATE public.court_reservations SET
      event_type = p_event_type, reservation_date = p_date, start_time = p_start, end_time = p_end,
      titular_name = btrim(coalesce(p_titular_name,'')), titular_lot = btrim(coalesce(p_titular_lot,'')),
      title = btrim(coalesce(p_title,'')), professor = btrim(coalesce(p_professor,'')),
      student = btrim(coalesce(p_student,'')), notes = btrim(coalesce(p_notes,'')), updated_at = now()
    WHERE id = v_row.id;
  END LOOP;

  FOR i IN coalesce(array_length(v_free_rows, 1), 0) + 1 .. coalesce(array_length(v_new_courts, 1), 0) LOOP
    v_court := v_new_courts[i];
    INSERT INTO public.court_reservations(
      court, reservation_date, start_time, end_time, titular_lot, titular_name, notes, status,
      created_by, event_type, event_group, title, professor, student)
    VALUES (
      v_court, p_date, p_start, p_end, btrim(coalesce(p_titular_lot,'')), btrim(coalesce(p_titular_name,'')),
      btrim(coalesce(p_notes,'')), 'reservada', coalesce(p_user,''), p_event_type, v_group,
      btrim(coalesce(p_title,'')), btrim(coalesce(p_professor,'')), btrim(coalesce(p_student,'')));
  END LOOP;

  RETURN v_group;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_court_event(p_group_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  UPDATE public.court_reservations SET status = 'cancelada', updated_at = now()
  WHERE event_group = p_group_id AND status = 'reservada';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'event_not_editable';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.open_court_session(
  p_court smallint, p_reservation_id uuid, p_players jsonb,
  p_titular_name text, p_titular_lot text, p_titular_socio_id uuid, p_user text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_now timestamp := now() AT TIME ZONE 'America/Argentina/Buenos_Aires';
  v_busy text;
BEGIN
  IF btrim(coalesce(p_titular_name,'')) = '' THEN
    RAISE EXCEPTION 'titular_required';
  END IF;
  IF jsonb_typeof(p_players) <> 'array' OR jsonb_array_length(p_players) NOT BETWEEN 1 AND 4 THEN
    RAISE EXCEPTION 'invalid_players';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('court_agenda'), p_court);
  IF EXISTS (SELECT 1 FROM public.court_sessions WHERE court = p_court AND status = 'abierta') THEN
    RAISE EXCEPTION 'court_already_open';
  END IF;

  IF p_reservation_id IS NOT NULL THEN
    PERFORM 1 FROM public.court_reservations
    WHERE id = p_reservation_id AND status = 'reservada' AND event_type = 'reserva' FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'reservation_not_available';
    END IF;
  END IF;

  SELECT to_char(r.reservation_date + r.start_time, 'HH24:MI') || '-' || to_char(r.reservation_date + r.end_time, 'HH24:MI')
  INTO v_busy
  FROM public.court_reservations r
  WHERE r.court = p_court AND r.status = 'reservada' AND r.id IS DISTINCT FROM p_reservation_id
    AND (r.reservation_date + r.start_time) <= v_now AND (r.reservation_date + r.end_time) > v_now
  LIMIT 1;
  IF v_busy IS NOT NULL THEN
    RAISE EXCEPTION 'court_busy:%', v_busy;
  END IF;

  INSERT INTO public.court_sessions(court, reservation_id, players, titular_name, titular_lot, titular_socio_id, opened_by)
  VALUES (p_court, p_reservation_id, p_players, btrim(p_titular_name), btrim(coalesce(p_titular_lot,'')), p_titular_socio_id, coalesce(p_user,''))
  RETURNING id INTO v_id;

  IF p_reservation_id IS NOT NULL THEN
    UPDATE public.court_reservations
    SET status = 'abierta', session_id = v_id, updated_at = now()
    WHERE id = p_reservation_id;
  END IF;

  PERFORM public.sync_court_guest_charge(v_id);

  RETURN v_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'court_already_open';
END;
$$;

REVOKE ALL ON FUNCTION public.save_court_event(uuid, text, smallint[], date, time, time, text, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_court_event(uuid, text, smallint[], date, time, time, text, text, text, text, text, text, text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_court_event(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_court_event(uuid) TO anon, authenticated;
