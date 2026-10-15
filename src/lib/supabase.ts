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

export interface Neighborhood {
  id: string;
  name: string;
  active: boolean;
  created_at: string;
}

export interface CarnetPrices {
  id: string;
  individual_price: number;
  family_price: number;
  adherent_extra_price: number;
  updated_at: string;
}

export type MemberCategory = 'titular' | 'familiar_1' | 'familiar_2' | 'familiar_3' | 'adherente';
export type CarnetStatus = 'activo' | 'pausado';

export interface CustomerAccount {
  id: string;
  customer_name: string;
  customer_lot: string;
  total_debt: number;
  created_at: string;
  updated_at: string;
}

export interface CurrentAccountTransaction {
  id: string;
  customer_account_id: string;
  customer_name: string;
  customer_lot: string;
  type: 'cargo' | 'pago';
  amount: number;
  balance_after: number;
  sale_id?: string | null;
  sale_number?: string | null;
  payment_method?: string | null;
  description: string;
  user_name: string;
  shift_id?: string | null;
  created_at: string;
}

export interface Member {
  id: string;
  lot_number: string;
  neighborhood_id: string | null;
  first_name: string;
  last_name: string;
  dni: string;
  phone: string;
  email: string;
  category: MemberCategory;
  carnet_status: CarnetStatus;
  tenis: boolean;
  created_at: string;
  updated_at: string;
  neighborhood?: Neighborhood;
}

export interface CourtPlayer {
  lot: string;
  name: string;
  socio_id: string | null;
  is_socio: boolean;
}

export interface CourtReservation {
  id: string;
  court: number;
  reservation_date: string;
  start_time: string;
  end_time: string;
  event_type: 'reserva' | 'clase' | 'torneo' | 'mantenimiento';
  event_group: string;
  title: string;
  professor: string;
  student: string;
  titular_lot: string;
  titular_name: string;
  notes: string;
  status: 'reservada' | 'abierta' | 'cerrada' | 'cancelada';
  session_id: string | null;
  created_by: string;
  created_at: string;
}

export interface CourtSession {
  id: string;
  session_number: number;
  court: number;
  reservation_id: string | null;
  status: 'abierta' | 'cerrada' | 'cancelada';
  opened_at: string;
  closed_at: string | null;
  players: CourtPlayer[];
  titular_name: string;
  titular_lot: string;
  titular_socio_id: string | null;
  total: number;
  payment_method: string | null;
  sale_id: string | null;
  opened_by: string;
  closed_by: string;
  guest_charge_manual: boolean;
}

export interface CourtSessionItem {
  id: string;
  session_id: string;
  product_id: string | null;
  kind: 'producto' | 'invitado';
  product_name: string;
  price: number;
  quantity: number;
  created_at: string;
}
