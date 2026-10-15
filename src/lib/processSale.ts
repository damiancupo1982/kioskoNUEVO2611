import { supabase, SaleItem, Shift } from './supabase';

export type PaymentMethod = 'efectivo' | 'transferencia' | 'qr' | 'expensas' | 'cuenta_corriente';
export type PaymentAmounts = Record<PaymentMethod, number>;
export interface Payment {
  method: PaymentMethod;
  amount: number;
}

export const EMPTY_PAYMENTS: PaymentAmounts = {
  efectivo: 0,
  transferencia: 0,
  qr: 0,
  expensas: 0,
  cuenta_corriente: 0,
};

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  qr: 'QR',
  expensas: 'Expensas',
  cuenta_corriente: 'Cta. Corriente',
};

export const LOTE_INCORRECTO_MSG =
  'Lote incorrecto, por favor ingrese el lote correcto, es importante en ventas en cuenta corriente';

export const isInvalidCcLot = (lot: string) => /^0+$/.test(lot.trim());

export function preparePayments(
  amounts: PaymentAmounts,
  total: number,
  customerName: string,
  customerLot: string
): { payments: Payment[] } | { error: string } {
  let payments = (Object.keys(EMPTY_PAYMENTS) as PaymentMethod[])
    .map((method) => ({ method, amount: amounts[method] }))
    .filter((p) => p.amount > 0.009);

  if (payments.length === 0) {
    payments = [{ method: 'efectivo', amount: total }];
  }

  const paymentsTotal = payments.reduce((sum, p) => sum + p.amount, 0);
  if (Math.abs(paymentsTotal - total) > 0.01) {
    return {
      error: `La suma de los montos de pago (${paymentsTotal.toFixed(2)}) no coincide con el total (${total.toFixed(2)}).`,
    };
  }

  const hasCuentaCorriente = payments.some((p) => p.method === 'cuenta_corriente');
  if (hasCuentaCorriente && (!customerName.trim() || !customerLot.trim())) {
    return { error: 'Para ventas en cuenta corriente es obligatorio ingresar el nombre y el número de lote del cliente.' };
  }
  if (hasCuentaCorriente && isInvalidCcLot(customerLot)) {
    return { error: LOTE_INCORRECTO_MSG };
  }
  if (payments.some((p) => p.method !== 'efectivo') && (!customerName.trim() || !customerLot.trim())) {
    return { error: 'Para pagos que no son en efectivo debés completar el nombre y el lote del cliente.' };
  }

  return { payments };
}

interface ProcessSaleInput {
  shift: Shift;
  items: SaleItem[];
  payments: Payment[];
  customerName: string;
  customerLot: string;
  courtSessionId?: string;
}

type ProcessSaleResult =
  | { ok: true; saleId: string; saleNumber: string }
  | { ok: false; error: string };

export async function processSale({
  shift,
  items,
  payments,
  customerName,
  customerLot,
  courtSessionId,
}: ProcessSaleInput): Promise<ProcessSaleResult> {
  const name = customerName.trim();
  const lot = customerLot.trim();
  const total = items.reduce((sum, i) => sum + i.subtotal, 0);
  const hasCuentaCorriente = payments.some((p) => p.method === 'cuenta_corriente');

  let storedPaymentMethod: PaymentMethod = payments[0].method;
  if (payments.some((p) => p.method === 'efectivo')) storedPaymentMethod = 'efectivo';
  if (hasCuentaCorriente && payments.length === 1) storedPaymentMethod = 'cuenta_corriente';

  const saleNumber = `V-${Date.now()}`;
  const { data: saleResult, error: saleError } = await supabase
    .from('sales')
    .insert([{
      sale_number: saleNumber,
      user_id: shift.user_id,
      user_name: shift.user_name,
      shift_id: shift.id,
      items,
      subtotal: total,
      discount: 0,
      total,
      payment_method: storedPaymentMethod,
      customer_name: name || null,
      customer_lot: lot || null,
      payments,
      court_session_id: courtSessionId ?? null,
    }])
    .select()
    .single();

  if (saleError || !saleResult) {
    console.error('Error insertando venta:', saleError);
    const msg = saleError?.message ?? '';
    if (msg.includes('court_session_not_open') || msg.includes('uq_sales_court_session')) {
      return { ok: false, error: 'Este turno ya fue cerrado y cobrado. No se generó una nueva venta.' };
    }
    return { ok: false, error: `Error al registrar la venta: ${msg}` };
  }

  const productIds = Array.from(new Set(items.map((i) => i.product_id).filter(Boolean)));
  const { data: stockRows } = await supabase.from('products').select('id, stock').in('id', productIds);
  for (const item of items) {
    const prod = (stockRows || []).find((p) => p.id === item.product_id);
    if (prod) {
      const { error: stockError } = await supabase
        .from('products')
        .update({ stock: prod.stock - item.quantity })
        .eq('id', item.product_id);
      if (stockError) console.error('Error actualizando stock:', stockError);
      prod.stock -= item.quantity;
    }
  }

  const customerSuffix = name || lot ? ` - ${name} (Lote ${lot || '-'})` : '';
  const cashRows = payments
    .filter((p) => p.method !== 'cuenta_corriente')
    .map((p) => ({
      shift_id: shift.id,
      type: 'income',
      category: 'venta',
      amount: p.amount,
      payment_method: p.method,
      description: `Venta ${saleNumber}${customerSuffix}`,
    }));

  if (hasCuentaCorriente) {
    const ccAmount = payments.find((p) => p.method === 'cuenta_corriente')!.amount;
    cashRows.push({
      shift_id: shift.id,
      type: 'income',
      category: 'venta',
      amount: ccAmount,
      payment_method: 'cuenta_corriente',
      description: `Venta ${saleNumber} - ${name} (Lote ${lot || '-'}) [Cuenta Corriente]`,
    });

    const { data: existingAccount } = await supabase
      .from('customer_accounts')
      .select('*')
      .eq('customer_name', name)
      .eq('customer_lot', lot)
      .maybeSingle();

    let accountId: string;
    let currentDebt = 0;

    if (existingAccount) {
      accountId = existingAccount.id;
      currentDebt = Number(existingAccount.total_debt);
    } else {
      const { data: newAccount, error: accountError } = await supabase
        .from('customer_accounts')
        .insert([{ customer_name: name, customer_lot: lot, total_debt: 0 }])
        .select()
        .single();

      if (accountError || !newAccount) {
        console.error('Error creando cuenta corriente:', accountError);
        return { ok: false, error: 'Error al registrar la cuenta corriente.' };
      }
      accountId = newAccount.id;
    }

    const newBalance = currentDebt + ccAmount;

    await supabase
      .from('customer_accounts')
      .update({ total_debt: newBalance, updated_at: new Date().toISOString() })
      .eq('id', accountId);

    await supabase.from('current_account_transactions').insert([{
      customer_account_id: accountId,
      customer_name: name,
      customer_lot: lot,
      type: 'cargo',
      amount: ccAmount,
      balance_after: newBalance,
      sale_id: saleResult.id,
      sale_number: saleNumber,
      description: `Venta ${saleNumber}`,
      user_name: shift.user_name,
      shift_id: shift.id,
    }]);
  }

  if (cashRows.length > 0) {
    const { error: cashError } = await supabase.from('cash_transactions').insert(cashRows);
    if (cashError) {
      console.error('Error insertando caja:', cashError);
      return { ok: false, error: 'La venta se registró, pero hubo un error al registrar el movimiento en caja.' };
    }
  }

  return { ok: true, saleId: saleResult.id, saleNumber };
}
