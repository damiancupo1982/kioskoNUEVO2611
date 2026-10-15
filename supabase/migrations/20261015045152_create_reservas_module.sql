/*
# Módulo de Reservas de canchas

1. Nuevas tablas
- `court_reservations`: reservas futuras (cancha 0-3, fecha, hora, titular lote/nombre, observación,
  estado reservada|abierta|cerrada|cancelada, session_id del turno que se abrió desde la reserva).
- `court_sessions`: turnos de cancha (número de turno correlativo, cancha, reserva de origen, estado
  abierta|cerrada|cancelada, apertura/cierre, jugadores en JSON con lote/nombre/condición, titular,
  total, medio de pago, venta generada, usuarios que abrieron/cerraron).
- `court_session_items`: consumos del turno (producto, nombre, precio, cantidad).

2. Cambios en tablas existentes
- `sales.court_session_id` (uuid, opcional): indica de qué turno de cancha se originó la venta.
  Índice único: un turno solo puede generar UNA venta.

3. Lógica en el servidor
- `open_court_session(...)`: abre un turno de forma atómica (no permite dos turnos abiertos en la misma cancha)
  y marca la reserva de origen como abierta.
- `close_court_session_free(id, user)`: cierra un turno sin consumos (total $0).
- Trigger en `sales`: al registrar una venta con court_session_id, cierra el turno en la misma operación;
  si el turno ya no está abierto la venta se rechaza (evita doble cobro / doble cierre).

4. Seguridad
- RLS en las 3 tablas; la app no usa login de Supabase, por eso las políticas son para anon y authenticated.
- Los turnos no se pueden modificar directamente: solo por las funciones/trigger anteriores.
- Los consumos solo se pueden agregar/quitar mientras el turno esté abierto.
- Reservas: lectura, alta y modificación (cancelar = cambiar estado). Sin borrado.
*/

CREATE TABLE IF NOT EXISTS court_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  court smallint NOT NULL CHECK (court BETWEEN 0 AND 3),
  reservation_date date NOT NULL,
  start_time time NOT NULL,
  titular_lot text NOT NULL DEFAULT '',
  titular_name text NOT NULL,
  notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'reservada' CHECK (status IN ('reservada','abierta','cerrada','cancelada')),
  session_id uuid,
  created_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_court_reservation_slot
  ON court_reservations(court, reservation_date, start_time) WHERE status <> 'cancelada';
CREATE INDEX IF NOT EXISTS idx_court_reservations_date ON court_reservations(reservation_date);

CREATE TABLE IF NOT EXISTS court_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_number bigint GENERATED ALWAYS AS IDENTITY,
  court smallint NOT NULL CHECK (court BETWEEN 0 AND 3),
  reservation_id uuid REFERENCES court_reservations(id),
  status text NOT NULL DEFAULT 'abierta' CHECK (status IN ('abierta','cerrada','cancelada')),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  players jsonb NOT NULL DEFAULT '[]'::jsonb,
  titular_name text NOT NULL,
  titular_lot text NOT NULL DEFAULT '',
  titular_socio_id uuid,
  total numeric(12,2) NOT NULL DEFAULT 0,
  payment_method text,
  sale_id uuid,
  opened_by text NOT NULL DEFAULT '',
  closed_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_court_open_session ON court_sessions(court) WHERE status = 'abierta';
CREATE INDEX IF NOT EXISTS idx_court_sessions_opened ON court_sessions(opened_at);

CREATE TABLE IF NOT EXISTS court_session_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES court_sessions(id),
  product_id uuid NOT NULL,
  product_name text NOT NULL,
  price numeric(12,2) NOT NULL CHECK (price >= 0),
  quantity integer NOT NULL CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_court_session_items_session ON court_session_items(session_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sales' AND column_name='court_session_id') THEN
    ALTER TABLE sales ADD COLUMN court_session_id uuid REFERENCES court_sessions(id);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_court_session ON sales(court_session_id) WHERE court_session_id IS NOT NULL;

ALTER TABLE court_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE court_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE court_session_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_court_reservations" ON court_reservations;
CREATE POLICY "read_court_reservations" ON court_reservations FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "insert_court_reservations" ON court_reservations;
CREATE POLICY "insert_court_reservations" ON court_reservations FOR INSERT TO anon, authenticated
  WITH CHECK (status = 'reservada' AND session_id IS NULL);
DROP POLICY IF EXISTS "update_court_reservations" ON court_reservations;
CREATE POLICY "update_court_reservations" ON court_reservations FOR UPDATE TO anon, authenticated
  USING (status = 'reservada')
  WITH CHECK (status IN ('reservada','cancelada') AND session_id IS NULL);

DROP POLICY IF EXISTS "read_court_sessions" ON court_sessions;
CREATE POLICY "read_court_sessions" ON court_sessions FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "read_court_session_items" ON court_session_items;
CREATE POLICY "read_court_session_items" ON court_session_items FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "insert_court_session_items" ON court_session_items;
CREATE POLICY "insert_court_session_items" ON court_session_items FOR INSERT TO anon, authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM court_sessions s WHERE s.id = session_id AND s.status = 'abierta'));
DROP POLICY IF EXISTS "update_court_session_items" ON court_session_items;
CREATE POLICY "update_court_session_items" ON court_session_items FOR UPDATE TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM court_sessions s WHERE s.id = session_id AND s.status = 'abierta'))
  WITH CHECK (EXISTS (SELECT 1 FROM court_sessions s WHERE s.id = session_id AND s.status = 'abierta'));
DROP POLICY IF EXISTS "delete_court_session_items" ON court_session_items;
CREATE POLICY "delete_court_session_items" ON court_session_items FOR DELETE TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM court_sessions s WHERE s.id = session_id AND s.status = 'abierta'));

CREATE OR REPLACE FUNCTION public.open_court_session(
  p_court smallint, p_reservation_id uuid, p_players jsonb,
  p_titular_name text, p_titular_lot text, p_titular_socio_id uuid, p_user text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF btrim(coalesce(p_titular_name,'')) = '' THEN
    RAISE EXCEPTION 'titular_required';
  END IF;
  IF jsonb_typeof(p_players) <> 'array' OR jsonb_array_length(p_players) NOT BETWEEN 1 AND 4 THEN
    RAISE EXCEPTION 'invalid_players';
  END IF;
  IF EXISTS (SELECT 1 FROM public.court_sessions WHERE court = p_court AND status = 'abierta') THEN
    RAISE EXCEPTION 'court_already_open';
  END IF;

  IF p_reservation_id IS NOT NULL THEN
    PERFORM 1 FROM public.court_reservations WHERE id = p_reservation_id AND status = 'reservada' FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'reservation_not_available';
    END IF;
  END IF;

  INSERT INTO public.court_sessions(court, reservation_id, players, titular_name, titular_lot, titular_socio_id, opened_by)
  VALUES (p_court, p_reservation_id, p_players, btrim(p_titular_name), btrim(coalesce(p_titular_lot,'')), p_titular_socio_id, coalesce(p_user,''))
  RETURNING id INTO v_id;

  IF p_reservation_id IS NOT NULL THEN
    UPDATE public.court_reservations
    SET status = 'abierta', session_id = v_id, court = p_court, updated_at = now()
    WHERE id = p_reservation_id;
  END IF;

  RETURN v_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'court_already_open';
END;
$$;

CREATE OR REPLACE FUNCTION public.close_court_session_free(p_session_id uuid, p_user text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_res uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.court_session_items WHERE session_id = p_session_id) THEN
    RAISE EXCEPTION 'session_has_items';
  END IF;

  UPDATE public.court_sessions
  SET status = 'cerrada', closed_at = now(), total = 0, closed_by = coalesce(p_user,'')
  WHERE id = p_session_id AND status = 'abierta'
  RETURNING reservation_id INTO v_res;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_open';
  END IF;

  IF v_res IS NOT NULL THEN
    UPDATE public.court_reservations SET status = 'cerrada', updated_at = now() WHERE id = v_res;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_court_session_on_sale()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_res uuid;
BEGIN
  IF NEW.court_session_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.court_sessions
  SET status = 'cerrada', closed_at = now(), total = NEW.total,
      payment_method = NEW.payment_method, sale_id = NEW.id, closed_by = coalesce(NEW.user_name,'')
  WHERE id = NEW.court_session_id AND status = 'abierta'
  RETURNING reservation_id INTO v_res;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'court_session_not_open';
  END IF;

  IF v_res IS NOT NULL THEN
    UPDATE public.court_reservations SET status = 'cerrada', updated_at = now() WHERE id = v_res;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_close_court_session_on_sale ON sales;
CREATE TRIGGER trg_close_court_session_on_sale
  BEFORE INSERT ON sales FOR EACH ROW EXECUTE FUNCTION public.close_court_session_on_sale();

REVOKE ALL ON FUNCTION public.open_court_session(smallint, uuid, jsonb, text, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.open_court_session(smallint, uuid, jsonb, text, text, uuid, text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.close_court_session_free(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_court_session_free(uuid, text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.close_court_session_on_sale() FROM PUBLIC;
