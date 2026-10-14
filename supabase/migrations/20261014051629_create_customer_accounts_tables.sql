/*
# Cuentas Corrientes - Tablas de clientes y movimientos

1. Nuevas Tablas
  - `customer_accounts` - Cuentas corrientes de clientes
    - `id` (uuid, primary key)
    - `customer_name` (text, not null) - Nombre del cliente
    - `customer_lot` (text, not null default '') - Lote del cliente
    - `total_debt` (numeric(12,2), not null default 0) - Deuda total actual
    - `created_at` (timestamptz, default now())
    - `updated_at` (timestamptz, default now())
  - `current_account_transactions` - Movimientos de cuentas corrientes
    - `id` (uuid, primary key)
    - `customer_account_id` (uuid, not null, references customer_accounts(id))
    - `customer_name` (text, not null)
    - `customer_lot` (text, not null default '')
    - `type` (text, not null, check in 'cargo','pago')
    - `amount` (numeric(12,2), not null)
    - `balance_after` (numeric(12,2), not null)
    - `sale_id` (uuid, nullable)
    - `sale_number` (text, nullable)
    - `payment_method` (text, nullable)
    - `description` (text, not null default '')
    - `user_name` (text, not null default '')
    - `shift_id` (uuid, nullable)
    - `created_at` (timestamptz, default now())

2. Seguridad
  - RLS habilitado en ambas tablas.
  - El sistema usa anon key (sin login de Supabase), por lo que las politicas
    permiten SELECT, INSERT, UPDATE a anon y authenticated.
  - customer_accounts: SELECT, INSERT, UPDATE (USING true / WITH CHECK true)
  - current_account_transactions: SELECT, INSERT

3. Indices
  - customer_accounts(customer_name)
  - current_account_transactions(customer_account_id)
  - current_account_transactions(created_at)

4. Notas
  - No se usan triggers; toda la logica de saldo se maneja desde la aplicacion.
  - Las tablas sales y cash_transactions ya tienen las columnas necesarias
    (customer_name, customer_lot, payments, category, payment_method).
*/

CREATE TABLE IF NOT EXISTS customer_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name text NOT NULL,
  customer_lot text NOT NULL DEFAULT '',
  total_debt numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS current_account_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_account_id uuid NOT NULL REFERENCES customer_accounts(id),
  customer_name text NOT NULL,
  customer_lot text NOT NULL DEFAULT '',
  type text NOT NULL CHECK (type IN ('cargo','pago')),
  amount numeric(12,2) NOT NULL,
  balance_after numeric(12,2) NOT NULL,
  sale_id uuid,
  sale_number text,
  payment_method text,
  description text NOT NULL DEFAULT '',
  user_name text NOT NULL DEFAULT '',
  shift_id uuid,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE customer_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE current_account_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_customer_accounts" ON customer_accounts;
CREATE POLICY "anon_select_customer_accounts" ON customer_accounts FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_customer_accounts" ON customer_accounts;
CREATE POLICY "anon_insert_customer_accounts" ON customer_accounts FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_customer_accounts" ON customer_accounts;
CREATE POLICY "anon_update_customer_accounts" ON customer_accounts FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_select_current_account_transactions" ON current_account_transactions;
CREATE POLICY "anon_select_current_account_transactions" ON current_account_transactions FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_current_account_transactions" ON current_account_transactions;
CREATE POLICY "anon_insert_current_account_transactions" ON current_account_transactions FOR INSERT
  TO anon, authenticated WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_customer_accounts_name ON customer_accounts(customer_name);
CREATE INDEX IF NOT EXISTS idx_current_account_transactions_account ON current_account_transactions(customer_account_id);
CREATE INDEX IF NOT EXISTS idx_current_account_transactions_created ON current_account_transactions(created_at);
