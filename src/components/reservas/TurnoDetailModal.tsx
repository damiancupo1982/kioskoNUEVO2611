import { useEffect, useState } from 'react';
import { CalendarCheck, Clock, Loader2, Receipt, ShoppingBag, Users, X } from 'lucide-react';
import { supabase, CourtReservation, CourtSession, CourtSessionItem } from '../../lib/supabase';
import { PAYMENT_LABELS, Payment } from '../../lib/processSale';
import { EVENT_META, courtLabel, formatClock, formatDateTime, formatDuration, formatTime, money } from './reservasUtils';

interface SaleDetail {
  sale_number: string;
  created_at: string;
  user_name: string;
  total: number;
  payments: Payment[] | null;
  payment_method: Payment['method'];
  customer_name: string | null;
  customer_lot: string | null;
}

interface Detail {
  session: CourtSession;
  items: CourtSessionItem[];
  reservation: CourtReservation | null;
  sale: SaleDetail | null;
}

const sectionTitle = 'flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500 mb-3';

export default function TurnoDetailModal({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const { data: session, error: sErr } = await supabase.from('court_sessions').select('*').eq('id', sessionId).maybeSingle();
      if (sErr || !session) {
        setError('No se pudo cargar el detalle del turno.');
        return;
      }
      const s = session as CourtSession;
      const [itemsRes, resRes, saleRes] = await Promise.all([
        supabase.from('court_session_items').select('*').eq('session_id', s.id).order('created_at'),
        s.reservation_id
          ? supabase.from('court_reservations').select('*').eq('id', s.reservation_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        s.sale_id
          ? supabase
              .from('sales')
              .select('sale_number, created_at, user_name, total, payments, payment_method, customer_name, customer_lot')
              .eq('id', s.sale_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (itemsRes.error || resRes.error || saleRes.error) {
        setError('No se pudo cargar el detalle del turno.');
        return;
      }
      setDetail({
        session: s,
        items: (itemsRes.data as CourtSessionItem[]) || [],
        reservation: (resRes.data as CourtReservation | null) ?? null,
        sale: (saleRes.data as SaleDetail | null) ?? null,
      });
    })();
  }, [sessionId]);

  const s = detail?.session;
  const reservation = detail?.reservation;
  const sale = detail?.sale;
  const itemsTotal = detail?.items.reduce((a, i) => a + Number(i.price) * i.quantity, 0) ?? 0;
  const payments: Payment[] = sale
    ? sale.payments?.length
      ? sale.payments
      : [{ method: sale.payment_method, amount: Number(sale.total) }]
    : [];
  const responsible = reservation ?? s;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3 min-w-0">
            <span className={`px-2.5 py-1 rounded-lg text-xs font-black tracking-wide ${EVENT_META.jugado.chip}`}>
              {EVENT_META.jugado.label}
            </span>
            <h3 className="text-lg font-bold text-slate-800 truncate">
              {s ? `Turno #${s.session_number} · ${courtLabel(s.court)}` : 'Detalle del turno'}
            </h3>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
            <X size={20} />
          </button>
        </div>

        {error ? (
          <p className="m-6 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</p>
        ) : !s || !detail ? (
          <div className="flex justify-center py-16">
            <Loader2 className="animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="p-6 space-y-6 overflow-y-auto">
            <div className="bg-slate-50 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-[11px] font-bold uppercase text-slate-500">
                  {reservation ? 'Responsable de la reserva' : 'Responsable del turno'}
                </p>
                <p className="text-xl font-bold text-slate-900">{responsible!.titular_name}</p>
                <p className="text-sm text-slate-500">Lote {responsible!.titular_lot || '-'}</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-bold uppercase text-slate-500">Total cobrado</p>
                <p className="text-2xl font-bold text-emerald-600">{money(Number(s.total ?? itemsTotal))}</p>
              </div>
            </div>

            <section>
              <p className={sectionTitle}>
                <Clock size={14} /> Horario
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                {[
                  ['Fecha', formatDateTime(s.opened_at)],
                  ['Apertura', formatClock(s.opened_at)],
                  ['Cierre', s.closed_at ? formatClock(s.closed_at) : '-'],
                  ['Duración', formatDuration(s.opened_at, s.closed_at)],
                ].map(([label, value]) => (
                  <div key={label} className="border border-slate-200 rounded-xl p-2.5">
                    <p className="text-[11px] text-slate-500 uppercase">{label}</p>
                    <p className="font-bold text-slate-800">{value}</p>
                  </div>
                ))}
              </div>
              {reservation && (
                <p className="mt-2 text-sm text-slate-600 flex items-center gap-2">
                  <CalendarCheck size={14} className="text-sky-600" />
                  Reservado de {formatTime(reservation.start_time)} a {formatTime(reservation.end_time)}
                  {reservation.notes && ` · ${reservation.notes}`}
                </p>
              )}
            </section>

            <section>
              <p className={sectionTitle}>
                <Users size={14} /> Jugadores
              </p>
              <ul className="grid sm:grid-cols-2 gap-2">
                {s.players.map((p, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 border border-slate-200 rounded-xl px-3 py-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800 truncate">
                        J{i + 1}: {p.name}
                      </p>
                      <p className="text-xs text-slate-500">Lote {p.lot || '-'}</p>
                    </div>
                    <span
                      className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                        p.is_socio ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {p.is_socio ? 'SOCIO' : 'INVITADO'}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <p className={sectionTitle}>
                <ShoppingBag size={14} /> Consumos
              </p>
              {detail.items.length === 0 ? (
                <p className="text-sm text-slate-400">Sin consumos.</p>
              ) : (
                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 text-sm">
                  {detail.items.map((i) => (
                    <div key={i.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span className={i.kind === 'invitado' ? 'font-semibold text-red-700' : 'text-slate-800'}>
                        {i.product_name} x{i.quantity}
                        <span className="text-slate-400 font-normal"> · {money(Number(i.price))} c/u</span>
                      </span>
                      <span className="font-semibold">{money(Number(i.price) * i.quantity)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between px-3 py-2 bg-slate-50 font-bold">
                    <span>Total</span>
                    <span>{money(itemsTotal)}</span>
                  </div>
                </div>
              )}
            </section>

            <section>
              <p className={sectionTitle}>
                <Receipt size={14} /> Pago
              </p>
              {sale ? (
                <div className="space-y-2 text-sm">
                  <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
                    {payments.map((p, i) => (
                      <div key={i} className="flex justify-between px-3 py-2">
                        <span className="font-medium text-slate-700">{PAYMENT_LABELS[p.method] ?? p.method}</span>
                        <span className="font-semibold">{money(Number(p.amount))}</span>
                      </div>
                    ))}
                  </div>
                  {payments.some((p) => p.method === 'cuenta_corriente') && (
                    <p className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-3 py-2">
                      Cargado a cuenta corriente de <strong>{sale.customer_name || '-'}</strong> · Lote {sale.customer_lot || '-'}
                    </p>
                  )}
                  <p className="text-slate-500">
                    Venta {sale.sale_number} · {formatDateTime(sale.created_at)} {formatClock(sale.created_at)} · Cobró: {sale.user_name || '-'}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-slate-500">{s.status === 'cerrada' ? 'Sin cobro ($0).' : 'Turno sin cobrar.'}</p>
              )}
              <p className="mt-2 text-xs text-slate-400">
                Abrió: {s.opened_by || '-'} · Cerró: {s.closed_by || '-'}
              </p>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
