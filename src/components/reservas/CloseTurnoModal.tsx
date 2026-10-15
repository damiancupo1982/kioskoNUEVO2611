import { useState } from 'react';
import { CreditCard, Loader2, X } from 'lucide-react';
import { CourtSession, SaleItem, Shift } from '../../lib/supabase';
import { EMPTY_PAYMENTS, PaymentAmounts, preparePayments, processSale } from '../../lib/processSale';
import PaymentFields from '../PaymentFields';
import { courtLabel, money } from './reservasUtils';

interface CloseTurnoModalProps {
  session: CourtSession;
  items: SaleItem[];
  shift: Shift;
  onClose: () => void;
  onPaid: (saleNumber: string) => void;
}

export default function CloseTurnoModal({ session, items, shift, onClose, onPaid }: CloseTurnoModalProps) {
  const total = items.reduce((s, i) => s + i.subtotal, 0);
  const [amounts, setAmounts] = useState<PaymentAmounts>({ ...EMPTY_PAYMENTS, efectivo: total });
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  const handleConfirm = async () => {
    if (processing) return;
    setError('');
    const prepared = preparePayments(amounts, total, session.titular_name, session.titular_lot);
    if ('error' in prepared) return setError(prepared.error);

    if (
      amounts.cuenta_corriente > 0.009 &&
      !window.confirm(`Esta deuda se cargará a:\n${session.titular_name}\nLote ${session.titular_lot}\n¿Confirmar?`)
    ) {
      return;
    }

    setProcessing(true);
    const result = await processSale({
      shift,
      items,
      payments: prepared.payments,
      customerName: session.titular_name,
      customerLot: session.titular_lot,
      courtSessionId: session.id,
    });
    setProcessing(false);
    if (!result.ok) return setError(result.error);
    onPaid(result.saleNumber);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h3 className="text-lg font-bold text-slate-800">Cobrar turno #{session.session_number}</h3>
            <p className="text-xs text-slate-500">
              {courtLabel(session.court)} · Titular: {session.titular_name} (Lote {session.titular_lot || '-'})
            </p>
          </div>
          <button onClick={onClose} disabled={processing} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          <PaymentFields
            amounts={amounts}
            onChange={(method, amount) => setAmounts((prev) => ({ ...prev, [method]: amount }))}
          />
          {amounts.cuenta_corriente > 0.009 && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              La cuenta corriente se carga siempre al titular del turno.
            </p>
          )}
          <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl p-4 flex justify-between items-center border-2 border-emerald-300">
            <span className="text-lg font-bold text-slate-800">Total</span>
            <span className="text-3xl font-bold text-emerald-600">{money(total)}</span>
          </div>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-medium">{error}</div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100">
          <button
            onClick={handleConfirm}
            disabled={processing}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 disabled:from-slate-300 disabled:to-slate-400 text-white font-bold shadow-lg transition-all"
          >
            {processing ? <Loader2 size={22} className="animate-spin" /> : <CreditCard size={22} />}
            Completar venta y cerrar turno
          </button>
        </div>
      </div>
    </div>
  );
}
