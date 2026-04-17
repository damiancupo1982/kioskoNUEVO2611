/*
  # Create Purchase Management Tables

  ## New Tables
    - `purchase_invoices`: Stores purchase invoice headers
      - id, invoice_number (unique), supplier, total, paid_amount, status, created_at
    - `purchase_invoice_items`: Line items for each purchase invoice
      - id, invoice_id (FK), product_id (FK), quantity, purchase_price, sale_price, subtotal
    - `purchase_payments`: Payments made against invoices
      - id, invoice_id (FK), amount, payment_method, created_at

  ## Security
    - RLS enabled on all three tables
    - Policies allow anon and authenticated users to read/insert/update as needed

  ## Indexes
    - On created_at, status, invoice_id, product_id for performance
*/

CREATE TABLE IF NOT EXISTS purchase_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text UNIQUE NOT NULL,
  supplier text NOT NULL,
  total numeric DEFAULT 0 NOT NULL,
  paid_amount numeric DEFAULT 0 NOT NULL,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'paid')),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  quantity numeric NOT NULL,
  purchase_price numeric NOT NULL,
  sale_price numeric NOT NULL,
  subtotal numeric NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  payment_method text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE purchase_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read purchase_invoices"
  ON purchase_invoices FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can insert purchase_invoices"
  ON purchase_invoices FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update purchase_invoices"
  ON purchase_invoices FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can delete purchase_invoices"
  ON purchase_invoices FOR DELETE
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can read purchase_invoice_items"
  ON purchase_invoice_items FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can insert purchase_invoice_items"
  ON purchase_invoice_items FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can delete purchase_invoice_items"
  ON purchase_invoice_items FOR DELETE
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can read purchase_payments"
  ON purchase_payments FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can insert purchase_payments"
  ON purchase_payments FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_purchase_invoices_created_at ON purchase_invoices(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_status ON purchase_invoices(status);
CREATE INDEX IF NOT EXISTS idx_purchase_invoice_items_invoice_id ON purchase_invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_purchase_invoice_items_product_id ON purchase_invoice_items(product_id);
CREATE INDEX IF NOT EXISTS idx_purchase_payments_invoice_id ON purchase_payments(invoice_id);
