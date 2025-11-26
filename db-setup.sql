-- Kiosco POS System Database Setup
-- Run this SQL in your Supabase SQL Editor

-- Enable extension for gen_random_uuid (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create products table
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  description text DEFAULT '',
  category text DEFAULT '',
  price numeric(10,2) NOT NULL DEFAULT 0,
  cost numeric(10,2) NOT NULL DEFAULT 0,
  stock integer NOT NULL DEFAULT 0,
  min_stock integer NOT NULL DEFAULT 0,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create sales table
CREATE TABLE IF NOT EXISTS sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_number text UNIQUE NOT NULL,
  date timestamptz DEFAULT now(),
  user_id uuid NOT NULL,
  user_name text NOT NULL,
  shift_id uuid NOT NULL,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal numeric(10,2) NOT NULL DEFAULT 0,
  discount numeric(10,2) NOT NULL DEFAULT 0,
  total numeric(10,2) NOT NULL DEFAULT 0,
  payment_method text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create cash_transactions table
CREATE TABLE IF NOT EXISTS cash_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid NOT NULL,
  type text NOT NULL CHECK (type IN ('income', 'expense')),
  category text NOT NULL,
  amount numeric(10,2) NOT NULL DEFAULT 0,
  payment_method text NOT NULL,
  description text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- Create shifts table
CREATE TABLE IF NOT EXISTS shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  user_name text NOT NULL,
  start_date timestamptz DEFAULT now(),
  end_date timestamptz,
  opening_cash numeric(10,2) NOT NULL DEFAULT 0,
  closing_cash numeric(10,2),
  total_sales numeric(10,2) NOT NULL DEFAULT 0,
  total_expenses numeric(10,2) NOT NULL DEFAULT 0,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Create configuration table
CREATE TABLE IF NOT EXISTS configuration (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name text DEFAULT 'Mi Negocio',
  address text DEFAULT '',
  phone text DEFAULT '',
  tax_id text DEFAULT '',
  currency text DEFAULT '$',
  receipt_message text DEFAULT 'Gracias por su compra',
  updated_at timestamptz DEFAULT now()
);

-- Insert default configuration
INSERT INTO configuration (business_name, currency, receipt_message)
VALUES ('Kiosco Damian', '$', 'Gracias por su compra')
ON CONFLICT DO NOTHING;

-- Insert default shift for the default user
INSERT INTO shifts (user_id, user_name, opening_cash, active)
VALUES (gen_random_uuid(), 'Damian', 0, true)
ON CONFLICT DO NOTHING;

-- Enable RLS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuration ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Anyone can manage products" ON products;
DROP POLICY IF EXISTS "Anyone can read sales" ON sales;
DROP POLICY IF EXISTS "Anyone can insert sales" ON sales;
DROP POLICY IF EXISTS "Anyone can read cash_transactions" ON cash_transactions;
DROP POLICY IF EXISTS "Anyone can insert cash_transactions" ON cash_transactions;
DROP POLICY IF EXISTS "Anyone can read shifts" ON shifts;
DROP POLICY IF EXISTS "Anyone can insert shifts" ON shifts;
DROP POLICY IF EXISTS "Anyone can update shifts" ON shifts;
DROP POLICY IF EXISTS "Anyone can read configuration" ON configuration;
DROP POLICY IF EXISTS "Anyone can update configuration" ON configuration;

--------------------------------------------------
-- RLS Policies
--------------------------------------------------

-- Products: permitir todo (lectura y escritura) a anon y authenticated
CREATE POLICY "Anyone can manage products"
  ON products FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Sales
CREATE POLICY "Anyone can read sales"
  ON sales FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can insert sales"
  ON sales FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Cash transactions
CREATE POLICY "Anyone can read cash_transactions"
  ON cash_transactions FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can insert cash_transactions"
  ON cash_transactions FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Shifts
CREATE POLICY "Anyone can read shifts"
  ON shifts FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can insert shifts"
  ON shifts FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update shifts"
  ON shifts FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Configuration
CREATE POLICY "Anyone can read configuration"
  ON configuration FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can update configuration"
  ON configuration FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

--------------------------------------------------
-- Indexes
--------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_products_code ON products(code);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(date);
CREATE INDEX IF NOT EXISTS idx_sales_shift_id ON sales(shift_id);
CREATE INDEX IF NOT EXISTS idx_cash_transactions_shift_id ON cash_transactions(shift_id);
CREATE INDEX IF NOT EXISTS idx_shifts_active ON shifts(active);

--------------------------------------------------
-- Sample products
--------------------------------------------------

INSERT INTO products (code, name, description, category, price, cost, stock, min_stock)
VALUES
  ('001', 'Coca Cola 500ml', 'Gaseosa Coca Cola 500ml', 'Bebidas', 2.50, 1.50, 50, 10),
  ('002', 'Agua Mineral 500ml', 'Agua mineral sin gas', 'Bebidas', 1.50, 0.80, 100, 20),
  ('003', 'Alfajor Havanna', 'Alfajor de dulce de leche', 'Golosinas', 3.00, 2.00, 30, 10),
  ('004', 'Galletitas Oreo', 'Galletitas Oreo pack 6', 'Golosinas', 4.50, 3.00, 40, 15),
  ('005', 'Caramelos Sugus', 'Caramelos Sugus bolsa', 'Golosinas', 2.00, 1.20, 60, 20)
ON CONFLICT (code) DO NOTHING;
