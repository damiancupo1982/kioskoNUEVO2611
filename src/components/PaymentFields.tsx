import { BookOpen } from 'lucide-react';
import { EMPTY_PAYMENTS, PAYMENT_LABELS, PaymentAmounts, PaymentMethod } from '../lib/processSale';

interface PaymentFieldsProps {
  amounts: PaymentAmounts;
  onChange: (method: PaymentMethod, amount: number) => void;
}

const parseAmount = (value: string) => {
  if (!value) return 0;
  const n = parseFloat(value.replace(',', '.'));
  return isNaN(n) ? 0 : n;
};

export default function PaymentFields({ amounts, onChange }: PaymentFieldsProps) {
  return (
    <div className="space-y-2">
      {(Object.keys(EMPTY_PAYMENTS) as PaymentMethod[]).map((method) => {
        const isCc = method === 'cuenta_corriente';
        return (
          <div
            key={method}
            className={`flex items-center justify-between border-2 rounded-xl px-3 py-2.5 transition-all ${
              isCc
                ? 'bg-amber-50 border-amber-200 hover:border-amber-400'
                : 'bg-white border-slate-200 hover:border-emerald-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {isCc && <BookOpen size={16} className="text-amber-600" />}
              <span className={`text-sm font-semibold ${isCc ? 'text-amber-700' : 'text-slate-700'}`}>
                {PAYMENT_LABELS[method]}
              </span>
            </div>
            <input
              type="number"
              min={0}
              step="0.01"
              value={amounts[method] || ''}
              onChange={(e) => onChange(method, parseAmount(e.target.value))}
              className={`w-28 px-2 py-1 border-2 rounded-lg text-sm text-right focus:ring-2 ${
                isCc
                  ? 'bg-white border-amber-200 focus:ring-amber-500'
                  : 'bg-slate-50 border-slate-200 focus:ring-emerald-500'
              }`}
              placeholder="0"
            />
          </div>
        );
      })}
    </div>
  );
}
