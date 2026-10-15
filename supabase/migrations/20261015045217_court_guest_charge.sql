/*
# Cargo automático de INVITADOS en turnos de cancha

1. Cambios en tablas
- `court_session_items`:
  - `kind` (text, 'producto' | 'invitado', default 'producto'): tipo de ítem del turno.
  - `product_id` pasa a ser opcional (el ítem INVITADO no es un producto de stock).
  - Regla: los ítems 'producto' siempre tienen product_id.
  - Índice único: un solo ítem INVITADO por turno.
- `court_sessions`:
  - `guest_charge_manual` (boolean, default false): se vuelve true cuando el operador modifica o elimina
    el cargo INVITADO a mano. Desde ese momento el sistema ya no lo recalcula.

2. Lógica en el servidor
- `sync_court_guest_charge(session)` (interna): si el cargo sigue en modo automático, deja el ítem INVITADO
  con cantidad = jugadores invitados (precio predeterminado $12.000, o el precio actual si ya existe);
  si no hay invitados, quita el ítem.
- `open_court_session(...)`: igual que antes, y además genera el cargo INVITADO al abrir.
- `update_court_session_players(...)`: permite corregir jugadores de un turno abierto y recalcula el cargo
  si sigue automático.
- `set_court_guest_charge(session, cantidad, precio)`: edición manual (cantidad 0 = eliminar). Marca el
  cargo como manual.
- `close_court_session_free`: ahora permite cerrar sin cobro cuando el total es $0 (aunque haya ítems en $0).

3. Seguridad
- Los ítems INVITADO solo se crean/modifican/eliminan mediante las funciones anteriores:
  las políticas de la app para agregar/modificar/quitar consumos quedan limitadas a ítems 'producto'.
- La función interna de sincronización no puede llamarse desde la app.
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='court_session_items' AND column_name='kind') THEN
    ALTER TABLE court_session_items ADD COLUMN kind text NOT NULL DEFAULT 'producto'
      CHECK (kind IN ('producto','invitado'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='court_sessions' AND column_name='guest_charge_manual') THEN
    ALTER TABLE court_sessions ADD COLUMN guest_charge_manual boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'court_session_items_product_required') THEN
    ALTER TABLE court_session_items ALTER COLUMN product_id DROP NOT NULL;
    ALTER TABLE court_session_items ADD CONSTRAINT court_session_items_product_required
      CHECK (kind = 'invitado' OR product_id IS NOT NULL);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_court_session_guest_item
  ON court_session_items(session_id) WHERE kind = 'invitado';

DROP POLICY IF EXISTS "insert_court_session_items" ON court_session_items;
CREATE POLICY "insert_court_session_items" ON court_session_items FOR INSERT TO anon, authenticated
  WITH CHECK (kind = 'producto' AND EXISTS (SELECT 1 FROM court_sessions s WHERE s.id = session_id AND s.status = 'abierta'));
DROP POLICY IF EXISTS "update_court_session_items" ON court_session_items;
CREATE POLICY "update_court_session_items" ON court_session_items FOR UPDATE TO anon, authenticated
  USING (kind = 'producto' AND EXISTS (SELECT 1 FROM court_sessions s WHERE s.id = session_id AND s.status = 'abierta'))
  WITH CHECK (kind = 'producto' AND EXISTS (SELECT 1 FROM court_sessions s WHERE s.id = session_id AND s.status = 'abierta'));
DROP POLICY IF EXISTS "delete_court_session_items" ON court_session_items;
CREATE POLICY "delete_court_session_items" ON court_session_items FOR DELETE TO anon, authenticated
  USING (kind = 'producto' AND EXISTS (SELECT 1 FROM court_sessions s WHERE s.id = session_id AND s.status = 'abierta'));

CREATE OR REPLACE FUNCTION public.sync_court_guest_charge(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_manual boolean;
  v_players jsonb;
  v_guests integer;
BEGIN
  SELECT guest_charge_manual, players INTO v_manual, v_players
  FROM public.court_sessions WHERE id = p_session_id AND status = 'abierta';
  IF NOT FOUND OR v_manual THEN
    RETURN;
  END IF;

  SELECT count(*) INTO v_guests
  FROM jsonb_array_elements(v_players) p
  WHERE coalesce((p->>'is_socio')::boolean, false) = false;

  IF v_guests = 0 THEN
    DELETE FROM public.court_session_items WHERE session_id = p_session_id AND kind = 'invitado';
  ELSE
    INSERT INTO public.court_session_items(session_id, product_id, product_name, price, quantity, kind)
    VALUES (p_session_id, NULL, 'INVITADO', 12000, v_guests, 'invitado')
    ON CONFLICT (session_id) WHERE kind = 'invitado'
    DO UPDATE SET quantity = EXCLUDED.quantity;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_court_guest_charge(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_court_guest_charge(uuid) FROM anon, authenticated;

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

  PERFORM public.sync_court_guest_charge(v_id);

  RETURN v_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'court_already_open';
END;
$$;

CREATE OR REPLACE FUNCTION public.update_court_session_players(
  p_session_id uuid, p_players jsonb, p_titular_name text, p_titular_lot text, p_titular_socio_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF btrim(coalesce(p_titular_name,'')) = '' THEN
    RAISE EXCEPTION 'titular_required';
  END IF;
  IF jsonb_typeof(p_players) <> 'array' OR jsonb_array_length(p_players) NOT BETWEEN 1 AND 4 THEN
    RAISE EXCEPTION 'invalid_players';
  END IF;

  UPDATE public.court_sessions
  SET players = p_players,
      titular_name = btrim(p_titular_name),
      titular_lot = btrim(coalesce(p_titular_lot,'')),
      titular_socio_id = p_titular_socio_id
  WHERE id = p_session_id AND status = 'abierta';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_open';
  END IF;

  PERFORM public.sync_court_guest_charge(p_session_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_court_guest_charge(p_session_id uuid, p_quantity integer, p_price numeric)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF p_quantity IS NULL OR p_price IS NULL OR p_quantity < 0 OR p_quantity > 99 OR p_price < 0 THEN
    RAISE EXCEPTION 'invalid_guest_charge';
  END IF;

  UPDATE public.court_sessions SET guest_charge_manual = true
  WHERE id = p_session_id AND status = 'abierta';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_open';
  END IF;

  IF p_quantity = 0 THEN
    DELETE FROM public.court_session_items WHERE session_id = p_session_id AND kind = 'invitado';
  ELSE
    INSERT INTO public.court_session_items(session_id, product_id, product_name, price, quantity, kind)
    VALUES (p_session_id, NULL, 'INVITADO', round(p_price, 2), p_quantity, 'invitado')
    ON CONFLICT (session_id) WHERE kind = 'invitado'
    DO UPDATE SET quantity = EXCLUDED.quantity, price = EXCLUDED.price;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_court_session_free(p_session_id uuid, p_user text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_res uuid;
BEGIN
  IF (SELECT coalesce(sum(price * quantity), 0) FROM public.court_session_items WHERE session_id = p_session_id) > 0 THEN
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

REVOKE ALL ON FUNCTION public.update_court_session_players(uuid, jsonb, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_court_session_players(uuid, jsonb, text, text, uuid) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.set_court_guest_charge(uuid, integer, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_court_guest_charge(uuid, integer, numeric) TO anon, authenticated;
