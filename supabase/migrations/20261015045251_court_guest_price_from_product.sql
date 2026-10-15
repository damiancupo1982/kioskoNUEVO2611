/*
# Precio del cargo INVITADO tomado del producto "Invitado / Prop sin carnet"

1. Nueva función interna `court_guest_price()`: devuelve el precio actual del producto de venta
   "Invitado / Prop sin carnet" (si no existe, 12000).
2. `sync_court_guest_charge` usa ese precio al crear el cargo automático de invitados.
   No se descuenta stock del producto: solo se toma su precio como sugerencia.
3. Ambas funciones son internas y no pueden ejecutarse directamente desde la app.
*/

CREATE OR REPLACE FUNCTION public.court_guest_price()
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT coalesce(
    (SELECT price FROM public.products
     WHERE name ILIKE 'invitado%sin carnet%'
     ORDER BY active DESC, created_at
     LIMIT 1),
    12000);
$$;

REVOKE ALL ON FUNCTION public.court_guest_price() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.court_guest_price() FROM anon, authenticated;

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
    VALUES (p_session_id, NULL, 'INVITADO', public.court_guest_price(), v_guests, 'invitado')
    ON CONFLICT (session_id) WHERE kind = 'invitado'
    DO UPDATE SET quantity = EXCLUDED.quantity;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_court_guest_charge(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_court_guest_charge(uuid) FROM anon, authenticated;
