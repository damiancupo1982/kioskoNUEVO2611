/*
  # Sistema POS - Creación de tablas principales

  1. Nuevas Tablas
    - `products` - Catálogo de productos
      - `id` (uuid, primary key)
      - `code` (text, unique) - Código del producto
      - `name` (text) - Nombre del producto
      - `description` (text) - Descripción
      - `category` (text) - Categoría
      - `price` (numeric) - Precio de venta
      - `cost` (numeric) - Costo
      - `stock` (integer) - Stock actual
      - `min_stock` (integer) - Stock mínimo
      - `active` (boolean) - Producto activo
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `users` - Usuarios del sistema
      - `id` (uuid, primary key)
      - `username` (text, unique) - Usuario
      - `password` (text) - Contraseña
      - `full_name` (text) - Nombre completo
      - `role` (text) - Rol (admin/vendedor)
      - `active` (boolean) - Usuario activo
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `shifts` - Turnos de trabajo
      - `id` (uuid, primary key)
      - `user_id` (uuid) - ID del usuario
      - `user_name` (text) - Nombre del usuario
      - `start_date` (timestamptz) - Fecha de inicio
      - `end_date` (timestamptz) - Fecha de cierre
      - `opening_cash` (numeric) - Efectivo inicial
      - `closing_cash` (numeric) - Efectivo final
      - `total_sales` (numeric) - Total de ventas
      - `total_expenses` (numeric) - Total de gastos
      - `active` (boolean) - Turno activo
      - `created_at` (timestamptz)
    
    - `sales` - Ventas realizadas
      - `id` (uuid, primary key)
      - `sale_number` (text, unique) - Número de venta
      - `user_id` (uuid) - ID del usuario
      - `user_name` (text) - Nombre del usuario
      - `shift_id` (uuid) - ID del turno
      - `items` (jsonb) - Artículos vendidos
      - `subtotal` (numeric) - Subtotal
      - `discount` (numeric) - Descuento
      - `total` (numeric) - Total
      - `payment_method` (text) - Método de pago
      - `customer_name` (text) - Nombre del cliente
      - `customer_lot` (text) - Lote del cliente
      - `payments` (jsonb) - Pagos realizados
      - `created_at` (timestamptz)
    
    - `cash_transactions` - Movimientos de caja
      - `id` (uuid, primary key)
      - `shift_id` (uuid) - ID del turno
      - `type` (text) - Tipo (income/expense)
      - `category` (text) - Categoría
      - `amount` (numeric) - Monto
      - `payment_method` (text) - Método de pago
      - `description` (text) - Descripción
      - `created_at` (timestamptz)
    
    - `configuration` - Configuración del negocio
      - `id` (uuid, primary key)
      - `business_name` (text) - Nombre del negocio
      - `address` (text) - Dirección
      - `phone` (text) - Teléfono
      - `tax_id` (text) - RUC/NIT
      - `currency` (text) - Moneda
      - `receipt_message` (text) - Mensaje del ticket
      - `updated_at` (timestamptz)

  2. Seguridad
    - Enable RLS en todas las tablas
    - Políticas permisivas para acceso público (sin autenticación de usuarios)
*/

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  description text DEFAULT '',
  category text NOT NULL,
  price numeric(10,2) NOT NULL DEFAULT 0,
  cost numeric(10,2) NOT NULL DEFAULT 0,
  stock integer NOT NULL DEFAULT 0,
  min_stock integer NOT NULL DEFAULT 0,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text UNIQUE NOT NULL,
  password text NOT NULL,
  full_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'vendedor')),
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  user_name text NOT NULL,
  start_date timestamptz NOT NULL DEFAULT now(),
  end_date timestamptz,
  opening_cash numeric(10,2) NOT NULL DEFAULT 0,
  closing_cash numeric(10,2),
  total_sales numeric(10,2) DEFAULT 0,
  total_expenses numeric(10,2) DEFAULT 0,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_number text UNIQUE NOT NULL,
  user_id uuid NOT NULL,
  user_name text NOT NULL,
  shift_id uuid NOT NULL,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal numeric(10,2) NOT NULL DEFAULT 0,
  discount numeric(10,2) DEFAULT 0,
  total numeric(10,2) NOT NULL DEFAULT 0,
  payment_method text NOT NULL,
  customer_name text,
  customer_lot text,
  payments jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

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

CREATE TABLE IF NOT EXISTS configuration (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name text NOT NULL,
  address text DEFAULT '',
  phone text DEFAULT '',
  tax_id text DEFAULT '',
  currency text DEFAULT 'USD',
  receipt_message text DEFAULT '',
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuration ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public access to products"
  ON products FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow public access to users"
  ON users FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow public access to shifts"
  ON shifts FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow public access to sales"
  ON sales FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow public access to cash_transactions"
  ON cash_transactions FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow public access to configuration"
  ON configuration FOR ALL
  USING (true)
  WITH CHECK (true);

INSERT INTO configuration (business_name, address, phone, tax_id, currency, receipt_message)
VALUES ('Mi Negocio', '', '', '', 'USD', 'Gracias por su compra')
ON CONFLICT DO NOTHING;

INSERT INTO users (username, password, full_name, role, active)
VALUES ('admin', 'admin123', 'Administrador', 'admin', true)
ON CONFLICT DO NOTHING;