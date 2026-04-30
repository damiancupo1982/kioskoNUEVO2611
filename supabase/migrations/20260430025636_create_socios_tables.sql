/*
  # Create Socios (Members) Module Tables

  ## New Tables

  1. **neighborhoods** (barrios)
     - id, name, active, created_at

  2. **carnet_prices** (precios de carnet)
     - id, individual_price, family_price, adherent_extra_price, updated_at

  3. **members** (socios)
     - id, lot_number, neighborhood_id, first_name, last_name, dni, phone, email,
       category (titular/familiar_1/familiar_2/familiar_3/adherente),
       carnet_status (activo/pausado), created_at, updated_at

  ## Security
  - RLS enabled on all tables
  - Public read/write policies (matching existing system pattern)
*/

-- Barrios (Neighborhoods)
CREATE TABLE IF NOT EXISTS neighborhoods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE neighborhoods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read neighborhoods"
  ON neighborhoods FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow public insert neighborhoods"
  ON neighborhoods FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Allow public update neighborhoods"
  ON neighborhoods FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow public delete neighborhoods"
  ON neighborhoods FOR DELETE
  TO anon, authenticated
  USING (true);

-- Carnet prices configuration
CREATE TABLE IF NOT EXISTS carnet_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  individual_price numeric(10,2) DEFAULT 0,
  family_price numeric(10,2) DEFAULT 0,
  adherent_extra_price numeric(10,2) DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE carnet_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read carnet_prices"
  ON carnet_prices FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow public insert carnet_prices"
  ON carnet_prices FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Allow public update carnet_prices"
  ON carnet_prices FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Insert default prices row
INSERT INTO carnet_prices (individual_price, family_price, adherent_extra_price)
SELECT 0, 0, 0
WHERE NOT EXISTS (SELECT 1 FROM carnet_prices);

-- Members (Socios)
CREATE TABLE IF NOT EXISTS members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_number text NOT NULL,
  neighborhood_id uuid REFERENCES neighborhoods(id) ON DELETE SET NULL,
  first_name text NOT NULL DEFAULT '',
  last_name text NOT NULL DEFAULT '',
  dni text DEFAULT '',
  phone text DEFAULT '',
  email text DEFAULT '',
  category text NOT NULL DEFAULT 'titular'
    CHECK (category IN ('titular', 'familiar_1', 'familiar_2', 'familiar_3', 'adherente')),
  carnet_status text NOT NULL DEFAULT 'activo'
    CHECK (carnet_status IN ('activo', 'pausado')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read members"
  ON members FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow public insert members"
  ON members FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Allow public update members"
  ON members FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow public delete members"
  ON members FOR DELETE
  TO anon, authenticated
  USING (true);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_members_lot_number ON members(lot_number);
CREATE INDEX IF NOT EXISTS idx_members_neighborhood ON members(neighborhood_id);
CREATE INDEX IF NOT EXISTS idx_members_category ON members(category);
CREATE INDEX IF NOT EXISTS idx_members_carnet_status ON members(carnet_status);
