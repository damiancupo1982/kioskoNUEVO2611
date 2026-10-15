/*
# Restrict internal trigger function

1. Security
- `close_court_session_on_sale()` is only used internally by the trigger on `sales`.
  Revoke direct EXECUTE from anon and authenticated (the trigger keeps working).
*/
REVOKE EXECUTE ON FUNCTION public.close_court_session_on_sale() FROM anon, authenticated;
