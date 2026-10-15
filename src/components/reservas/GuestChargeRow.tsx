import { useEffect, useState } from 'react';
import { Minus, Plus, Trash2, UserPlus } from 'lucide-react';
import { CourtSessionItem } from '../../lib/supabase';
import { money } from './reservasUtils';

interface GuestChargeRowProps {
  item: CourtSessionItem;
  manual: boolean;
  editable: boolean;
  busy: boolean;
  onSet: (quantity: number, price: number) => void;
}

export default function GuestChargeRow({ item, manual, editable, busy, onSet }: GuestChargeRowProps) {
  const price = Number(item.price);
  const [priceInput, setPriceInput] = useState(String(price));

  useEffect(() => setPriceInput(String(price)), [price]);

  const commitPrice = () => {
    const n = parseFloat(priceInput.replace(',', '.'));
    if (isNaN(n) || n < 0) {
      setPriceInput(String(price));
      return;
    }
    if (n !== price) onSet(item.quantity, n);
  };

  return (
    <div className="rounded-xl border-2 border-red-200 bg-red-50/60 p-3">
      <div className="flex justify-between gap-2 text-sm">
        <span className="flex items-center gap-2 font-bold text-red-800">
          <UserPlus size={15} /> INVITADO x{item.quantity}
        </span>
        <span className="font-bold text-slate-800">{money(price * item.quantity)}</span>
      </div>
      <p className="text-[11px] text-red-700/80 mt-0.5">
        {manual ? 'Ajustado manualmente' : 'Automático según jugadores invitados'}
      </p>
      {editable && (
        <div className="flex items-center justify-between gap-2 mt-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onSet(item.quantity - 1, price)}
              disabled={busy}
              className="w-8 h-8 rounded-lg bg-white hover:bg-red-100 border border-red-200 flex items-center justify-center"
            >
              <Minus size={14} />
            </button>
            <span className="w-6 text-center font-bold">{item.quantity}</span>
            <button
              onClick={() => onSet(item.quantity + 1, price)}
              disabled={busy}
              className="w-8 h-8 rounded-lg bg-white hover:bg-red-100 border border-red-200 flex items-center justify-center"
            >
              <Plus size={14} />
            </button>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-slate-600">$</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={priceInput}
              disabled={busy}
              onChange={(e) => setPriceInput(e.target.value)}
              onBlur={commitPrice}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              className="w-24 px-2 py-1 text-sm border-2 border-red-200 rounded-lg text-right bg-white focus:ring-2 focus:ring-red-400"
            />
            <button
              onClick={() => window.confirm('¿Quitar el cargo INVITADO de este turno?') && onSet(0, price)}
              disabled={busy}
              className="p-2 rounded-lg text-red-500 hover:bg-red-100"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
