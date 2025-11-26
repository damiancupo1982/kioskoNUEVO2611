import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface Product {
  id: string;
  code: string;
  name: string;
  description: string;
  category: string;
  price: number;
  cost: number;
  stock: number;
  min_stock: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Sale {
  id: string;
  sale_number: string;
  user_id: string;
  user_name: string;
  shift_id: string;
  items: SaleItem[];
  subtotal: number;
  discount: number;
  total: number;
  payment_method: string;
  customer_name?: string;
  customer_lot?: string;
  payments?: { method: string; amount: number }[];
  created_at: string;
}

export interface SaleItem {
  product_id: string;
  product_name: string;
  quantity: number;
  price: number;
  subtotal: number;
}

export interface CashTransaction {
  id: string;
  shift_id: string;
  type: 'income' | 'expense';
  category: string;
  amount: number;
  payment_method: string;
  description: string;
  created_at: string;
}

export interface Shift {
  id: string;
  user_id: string;
  user_name: string;
  start_date: string;
  end_date: string | null;
  opening_cash: number;
  closing_cash: number | null;
  total_sales: number;
  total_expenses: number;
  active: boolean;
  created_at: string;
}

export interface User {
  id: string;
  username: string;
  password: string;
  full_name: string;
  role: 'admin' | 'vendedor';
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Configuration {
  id: string;
  business_name: string;
  address: string;
  phone: string;
  tax_id: string;
  currency: string;
  receipt_message: string;
  updated_at: string;
}
