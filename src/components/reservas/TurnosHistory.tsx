import { Fragment, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { supabase, CourtReservation, CourtSession, CourtSessionItem } from '../../lib/supabase';
import { PAYMENT_LABELS, PaymentMethod } from '../../lib/processSale';
import { EVENT_META, addDaysISO, eventSummary, formatClock, formatDateTime, formatDuration, formatTime, money, todayISO } from './reservasUtils';

interface SaleRef {
  id: string;
  sale_number: string;
  payments: { method: PaymentMethod; amount: number }[] | null;
  payment_method: PaymentMethod;
}

type Estado = 'Reservada' | 'Abierta' | 'Cerrada' | 'Cancelada';

interface Row {
  key: string;
  id: string;
  court: number;
  date: string;
  apertura: string;
  cierre: string;
  duracion: string;
  estado: Estado;
  session?: CourtSession;
  reservation?: CourtReservation;
}

const estadoStyle: Record<Estado, string> = {
  Reservada: 'bg-sky-100 text-sky-800',
  Abierta: 'bg-amber-100 text-amber-800',
  Cerrada: 'bg-emerald-100 text-emerald-800',
  Cancelada: 'bg-red-100 text-red-700',
};

const ARG_DAY_START = (iso: string) => `${iso}T03:00:00Z`;

export default function TurnosHistory({ refreshKey }: { refreshKey: number }) {
  const [from, setFrom] = useState(addDaysISO(todayISO(), -30));
  const [to, setTo] = useState(todayISO());
  const [rows, setRows] = useState<Row[]>([]);
  const [items, setItems] = useState<CourtSessionItem[]>([]);
  const [sales, setSales] = useState<SaleRef[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [sessionsRes, reservationsRes] = await Promise.all([
        supabase
          .from('court_sessions')
          .select('*')
          .gte('opened_at', ARG_DAY_START(from))
          .lt('opened_at', ARG_DAY_START(addDaysISO(to, 1)))
          .order('opened_at', { ascending: false }),
        supabase
          .from('court_reservations')
          .select('*')
          .gte('reservation_date', from)
          .lte('reservation_date', to)
          .in('status', ['reservada', 'cancelada']),
      ]);
      if (sessionsRes.error || reservationsRes.error) {
        setError('No se pudo cargar el historial.');
        setLoading(false);
        return;
      }
      const sessions = (sessionsRes.data as CourtSession[]) || [];
      const reservations = (reservationsRes.data as CourtReservation[]) || [];
      const sessionIds = sessions.map((s) => s.id);
      const saleIds = sessions.map((s) => s.sale_id).filter((id): id is string => !!id);

      const [itemsRes, salesRes] = await Promise.all([
        sessionIds.length
          ? supabase.from('court_session_items').select('*').in('session_id', sessionIds)
          : Promise.resolve({ data: [] }),
        saleIds.length
          ? supabase.from('sales').select('id, sale_number, payments, payment_method').in('id', saleIds)
          : Promise.resolve({ data: [] }),
      ]);

      const sessionRows: Row[] = sessions.map((s) => ({
        key: s.id,
        id: `#${s.session_number}`,
        court: s.court,
        date: s.opened_at,
        apertura: formatClock(s.opened_at),
        cierre: s.closed_at ? formatClock(s.closed_at) : '-',
        duracion: formatDuration(s.opened_at, s.closed_at),
        estado: s.status === 'abierta' ? 'Abierta' : s.status === 'cerrada' ? 'Cerrada' : 'Cancelada',
        session: s,
      }));
      const reservationRows: Row[] = reservations.map((r) => ({
        key: r.id,
        id: EVENT_META[r.event_type].label,
        court: r.court,
        date: `${r.reservation_date}T${formatTime(r.start_time)}:00-03:00`,
        apertura: formatTime(r.start_time),
        cierre: formatTime(r.end_time),
        duracion: '-',
        estado: r.status === 'cancelada' ? 'Cancelada' : 'Reservada',
        reservation: r,
      }));

      setRows([...sessionRows, ...reservationRows].sort((a, b) => b.date.localeCompare(a.date)));
      setItems((itemsRes.data as CourtSessionItem[]) || []);
      setSales((salesRes.data as SaleRef[]) || []);
      setError('');
      setLoading(false);
    })();
  }, [from, to, refreshKey]);

  const paymentText = (s: CourtSession) => {
    const sale = sales.find((x) => x.id === s.sale_id);
    if (!sale) return s.status === 'cerrada' ? 'Sin cobro ($0)' : '-';
    const list = sale.payments?.length ? sale.payments : [{ method: sale.payment_method, amount: Number(s.total) }];
    return list.map((p) => PAYMENT_LABELS[p.method] ?? p.method).join(' + ');
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
      <div className="flex flex-wrap items-end gap-3 p-4 border-b border-slate-100">
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Desde</label>
          <input type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Hasta</label>
          <input type="date" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm" />
        </div>
        <p className="text-sm text-slate-500 ml-auto">{rows.length} registros</p>
      </div>

      {error && <p className="p-4 text-sm text-red-600">{error}</p>}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-slate-400" />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="text-left text-xs uppercase text-slate-500 bg-slate-50">
                <th className="px-3 py-3 w-8" />
                <th className="px-3 py-3">ID</th>
                <th className="px-3 py-3">Cancha</th>
                <th className="px-3 py-3">Fecha</th>
                <th className="px-3 py-3">Apertura</th>
                <th className="px-3 py-3">Cierre</th>
                <th className="px-3 py-3">Duración</th>
                <th className="px-3 py-3">Titular</th>
                <th className="px-3 py-3 text-right">Total</th>
                <th className="px-3 py-3">Pago</th>
                <th className="px-3 py-3">Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={11} className="text-center py-10 text-slate-400">
                    No hay turnos en el período.
                  </td>
                </tr>
              )}
              {rows.map((row) => {
                const s = row.session;
                const isOpen = expanded === row.key;
                const rowItems = s ? items.filter((i) => i.session_id === s.id) : [];
                const sale = s ? sales.find((x) => x.id === s.sale_id) : undefined;
                return (
                  <Fragment key={row.key}>
                    <tr
                      onClick={() => setExpanded(isOpen ? null : row.key)}
                      className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer"
                    >
                      <td className="px-3 py-3 text-slate-400">{isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</td>
                      <td className="px-3 py-3 font-semibold text-slate-700">{row.id}</td>
                      <td className="px-3 py-3 font-bold">{row.court}</td>
                      <td className="px-3 py-3">
                        {s ? formatDateTime(s.opened_at) : row.reservation!.reservation_date.split('-').reverse().join('/')}
                      </td>
                      <td className="px-3 py-3">{row.apertura}</td>
                      <td className="px-3 py-3">{row.cierre}</td>
                      <td className="px-3 py-3">{row.duracion}</td>
                      <td className="px-3 py-3">
                        <p className="font-semibold text-slate-800">
                          {s?.titular_name ?? (row.reservation!.event_type === 'reserva' ? row.reservation!.titular_name : eventSummary(row.reservation!) || '-')}
                        </p>
                        {(s || row.reservation!.event_type === 'reserva') && (
                          <p className="text-xs text-slate-500">Lote {(s?.titular_lot ?? row.reservation?.titular_lot) || '-'}</p>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right font-bold">{s ? money(s.status === 'cerrada' ? s.total : rowItems.reduce((a, i) => a + Number(i.price) * i.quantity, 0)) : '-'}</td>
                      <td className="px-3 py-3 text-xs">{s ? paymentText(s) : '-'}</td>
                      <td className="px-3 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${estadoStyle[row.estado]}`}>{row.estado}</span>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-slate-50/70">
                        <td />
                        <td colSpan={10} className="px-3 py-4">
                          {s ? (
                            <div className="grid md:grid-cols-3 gap-4">
                              <div>
                                <p className="text-xs font-bold uppercase text-slate-500 mb-2">Jugadores</p>
                                <ul className="space-y-1">
                                  {s.players.map((p, i) => (
                                    <li key={i} className="flex items-center gap-2">
                                      <span className={`w-2 h-2 rounded-full ${p.is_socio ? 'bg-emerald-500' : 'bg-red-500'}`} />
                                      <span className="font-medium">J{i + 1}: {p.name}</span>
                                      <span className="text-slate-500">Lote {p.lot || '-'}</span>
                                      <span className={`text-xs font-bold ${p.is_socio ? 'text-emerald-700' : 'text-red-600'}`}>
                                        {p.is_socio ? 'Socio' : 'Invitado'}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                              <div>
                                <p className="text-xs font-bold uppercase text-slate-500 mb-2">Productos</p>
                                {rowItems.length === 0 ? (
                                  <p className="text-slate-400">Sin consumos</p>
                                ) : (
                                  <ul className="space-y-1">
                                    {rowItems.map((i) => (
                                      <li key={i.id} className="flex justify-between gap-4">
                                        <span>{i.product_name} x{i.quantity}</span>
                                        <span className="font-semibold">{money(Number(i.price) * i.quantity)}</span>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                              <div className="space-y-1">
                                <p className="text-xs font-bold uppercase text-slate-500 mb-2">Cobro</p>
                                <p>Venta: <span className="font-semibold">{sale?.sale_number ?? '-'}</span></p>
                                <p>Abrió: {s.opened_by || '-'}</p>
                                <p>Cerró: {s.closed_by || '-'}</p>
                              </div>
                            </div>
                          ) : (
                            <div className="text-slate-600 space-y-1">
                              <p>
                                {EVENT_META[row.reservation!.event_type].label} de {formatTime(row.reservation!.start_time)} a{' '}
                                {formatTime(row.reservation!.end_time)}
                                {row.reservation!.event_type === 'reserva' && ' (sin turno abierto)'}.
                              </p>
                              {row.reservation!.notes && <p>Observación: {row.reservation!.notes}</p>}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
