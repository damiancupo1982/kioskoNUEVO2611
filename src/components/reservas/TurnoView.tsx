import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, Clock, Loader2, Lock, Minus, Plus, Search, Trash2, UserPlus, Users, UserX } from 'lucide-react';
import { supabase, CourtSession, CourtSessionItem, Product, SaleItem, Shift } from '../../lib/supabase';
import CloseTurnoModal from './CloseTurnoModal';
import GuestChargeRow from './GuestChargeRow';
import OpenCourtModal from './OpenCourtModal';
import { courtLabel, formatClock, formatDuration, isGuestProduct, money, rpcErrorMessage } from './reservasUtils';

interface TurnoViewProps {
  sessionId: string;
  shift: Shift | null;
  onBack: () => void;
  onClosed: () => void;
}

export default function TurnoView({ sessionId, shift, onBack, onClosed }: TurnoViewProps) {
  const [session, setSession] = useState<CourtSession | null>(null);
  const [items, setItems] = useState<CourtSessionItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [showCheckout, setShowCheckout] = useState(false);
  const [showPlayers, setShowPlayers] = useState(false);
  const [, setTick] = useState(0);

  const loadItems = useCallback(async () => {
    const { data } = await supabase
      .from('court_session_items')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at');
    setItems((data as CourtSessionItem[]) || []);
  }, [sessionId]);

  const loadProducts = useCallback(async () => {
    const { data } = await supabase.from('products').select('*').eq('active', true).order('name');
    setProducts((data as Product[]) || []);
  }, []);

  const loadSession = useCallback(async () => {
    const { data, error } = await supabase.from('court_sessions').select('*').eq('id', sessionId).maybeSingle();
    if (error || !data) {
      setLoadError('No se pudo cargar el turno.');
      return;
    }
    setSession(data as CourtSession);
  }, [sessionId]);

  useEffect(() => {
    loadSession();
    loadItems();
    loadProducts();
    const timer = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(timer);
  }, [loadSession, loadItems, loadProducts]);

  const isOpen = session?.status === 'abierta';
  const total = items.reduce((s, i) => s + Number(i.price) * i.quantity, 0);
  const guestItem = items.find((i) => i.kind === 'invitado');
  const productItems = items.filter((i) => i.kind !== 'invitado');

  const qtyInTurno = (productId: string) =>
    items.filter((i) => i.product_id === productId).reduce((s, i) => s + i.quantity, 0);

  const filtered = useMemo(
    () =>
      products.filter(
        (p) => p.stock > 0 && !isGuestProduct(p.name) && p.name.toLowerCase().includes(search.toLowerCase())
      ),
    [products, search]
  );

  const saleItems: SaleItem[] = useMemo(() => {
    const map = new Map<string, SaleItem>();
    for (const i of items) {
      const price = Number(i.price);
      const key = `${i.kind}|${i.product_id}|${price}`;
      const prev = map.get(key);
      map.set(key, {
        product_id: i.product_id ?? '',
        product_name: i.product_name,
        price,
        quantity: (prev?.quantity ?? 0) + i.quantity,
        subtotal: (prev?.subtotal ?? 0) + price * i.quantity,
      });
    }
    return Array.from(map.values());
  }, [items]);

  const withBusy = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    await fn();
    setBusy(false);
  };

  const addProduct = (product: Product) =>
    withBusy(async () => {
      const fresh = await supabase.from('products').select('stock, price').eq('id', product.id).maybeSingle();
      const stock = fresh.data?.stock ?? product.stock;
      const price = Number(fresh.data?.price ?? product.price);
      if (qtyInTurno(product.id) + 1 > stock) {
        alert('Stock insuficiente');
        return;
      }
      const existing = items.find((i) => i.product_id === product.id && Number(i.price) === price);
      const { error } = existing
        ? await supabase.from('court_session_items').update({ quantity: existing.quantity + 1 }).eq('id', existing.id)
        : await supabase.from('court_session_items').insert([
            { session_id: sessionId, product_id: product.id, product_name: product.name, price, quantity: 1 },
          ]);
      if (error) alert('No se pudo agregar el producto. Verifique que el turno siga abierto.');
      await Promise.all([loadItems(), loadProducts()]);
    });

  const changeQty = (item: CourtSessionItem, qty: number) =>
    withBusy(async () => {
      if (qty > item.quantity) {
        const product = products.find((p) => p.id === item.product_id);
        if (product && qtyInTurno(product.id) + 1 > product.stock) {
          alert('Stock insuficiente');
          return;
        }
      }
      const { error } =
        qty <= 0
          ? await supabase.from('court_session_items').delete().eq('id', item.id)
          : await supabase.from('court_session_items').update({ quantity: qty }).eq('id', item.id);
      if (error) alert('No se pudo modificar el consumo.');
      await loadItems();
    });

  const setGuestCharge = (quantity: number, price: number) =>
    withBusy(async () => {
      const { error } = await supabase.rpc('set_court_guest_charge', {
        p_session_id: sessionId,
        p_quantity: Math.max(0, quantity),
        p_price: price,
      });
      if (error) alert(rpcErrorMessage(error.message));
      await Promise.all([loadItems(), loadSession()]);
    });

  const handleCloseTurno = () =>
    withBusy(async () => {
      if (!session) return;
      await loadItems();
      const { data: latest } = await supabase
        .from('court_session_items')
        .select('price, quantity')
        .eq('session_id', sessionId);
      const latestTotal = (latest || []).reduce((s, i) => s + Number(i.price) * i.quantity, 0);
      if (latestTotal > 0) {
        if (!shift) {
          alert('No hay un turno de caja abierto. Abra la caja para poder cobrar.');
          return;
        }
        setShowCheckout(true);
        return;
      }
      if (!window.confirm('El turno no tiene consumos ($0). ¿Cerrar la cancha?')) return;
      const { error } = await supabase.rpc('close_court_session_free', {
        p_session_id: session.id,
        p_user: shift?.user_name ?? '',
      });
      if (error) {
        alert(rpcErrorMessage(error.message));
        await loadSession();
        return;
      }
      onClosed();
    });

  if (loadError) {
    return (
      <div className="bg-white rounded-2xl p-8 text-center space-y-4">
        <p className="text-red-600 font-semibold">{loadError}</p>
        <button onClick={onBack} className="px-4 py-2 rounded-xl bg-slate-800 text-white">Volver</button>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin text-slate-400" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 font-semibold text-slate-700 shadow-sm"
        >
          <ArrowLeft size={18} /> Canchas
        </button>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">Turno #{session.session_number}</span>
          <span
            className={`px-3 py-1 rounded-full text-xs font-bold ${
              isOpen ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-700'
            }`}
          >
            {isOpen ? 'EN JUEGO' : session.status.toUpperCase()}
          </span>
        </div>
      </div>

      <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-2xl p-5 shadow-xl grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400">Cancha</p>
          <p className="text-2xl font-bold">{courtLabel(session.court)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400">Apertura</p>
          <p className="text-2xl font-bold">{formatClock(session.opened_at)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400">Tiempo</p>
          <p className="text-2xl font-bold flex items-center gap-2">
            <Clock size={18} className="text-amber-400" />
            {formatDuration(session.opened_at, session.closed_at)}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400">Consumo</p>
          <p className="text-2xl font-bold text-emerald-400">{money(total)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-bold text-slate-700">Jugadores</h4>
              {isOpen && (
                <button
                  onClick={() => setShowPlayers(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-sky-700 hover:bg-sky-50 border border-sky-200"
                >
                  <Users size={14} /> Editar jugadores
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {session.players.map((p, i) => (
                <div
                  key={i}
                  className={`flex items-center justify-between rounded-xl px-3 py-2.5 border-2 ${
                    p.is_socio ? 'border-emerald-300 bg-emerald-50' : 'border-red-200 bg-red-50'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase text-slate-500">
                      Jugador {i + 1}
                      {i === 0 && ' · Titular'}
                    </p>
                    <p className="font-semibold text-slate-800 truncate">{p.name}</p>
                    <p className="text-xs text-slate-500">Lote {p.lot || '-'}</p>
                  </div>
                  {p.is_socio ? (
                    <span className="flex items-center gap-1 text-xs font-bold text-emerald-700">
                      <CheckCircle2 size={14} /> SOCIO
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs font-bold text-red-700">
                      <UserX size={14} /> INVITADO
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {isOpen && (
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  placeholder="Buscar producto..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-[360px] overflow-y-auto pr-1">
                {filtered.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => addProduct(p)}
                    disabled={busy}
                    className="text-left p-3 rounded-xl border-2 border-slate-200 hover:border-emerald-500 hover:shadow-lg bg-gradient-to-br from-white to-slate-50 transition-all active:scale-95 disabled:opacity-60"
                  >
                    <p className="font-bold text-sm text-slate-800 leading-tight">{p.name}</p>
                    <p className="text-lg font-bold text-emerald-600 mt-1">{money(p.price)}</p>
                    <p className="text-[10px] text-slate-500">Stock: {p.stock}</p>
                  </button>
                ))}
                {filtered.length === 0 && (
                  <p className="col-span-full text-center text-sm text-slate-400 py-6">No hay productos con stock.</p>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border-2 border-emerald-200 p-5 shadow-xl h-fit space-y-4">
          <h4 className="text-lg font-bold text-slate-800">Consumos</h4>
          <div className="space-y-2 max-h-[340px] overflow-y-auto">
            {items.length === 0 && <p className="text-sm text-slate-400 text-center py-6">Sin consumos</p>}
            {guestItem && (
              <GuestChargeRow
                item={guestItem}
                manual={session.guest_charge_manual}
                editable={isOpen}
                busy={busy}
                onSet={setGuestCharge}
              />
            )}
            {productItems.map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex justify-between gap-2 text-sm">
                  <span className="font-semibold text-slate-800">
                    {item.product_name} x{item.quantity}
                  </span>
                  <span className="font-bold text-slate-800">{money(Number(item.price) * item.quantity)}</span>
                </div>
                {isOpen && (
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => changeQty(item, item.quantity - 1)}
                        disabled={busy}
                        className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="w-6 text-center font-bold">{item.quantity}</span>
                      <button
                        onClick={() => changeQty(item, item.quantity + 1)}
                        disabled={busy}
                        className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    <button
                      onClick={() => changeQty(item, 0)}
                      disabled={busy}
                      className="p-2 rounded-lg text-red-500 hover:bg-red-50"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
          {isOpen && !guestItem && (
            <button
              onClick={() => setGuestCharge(1, Number(products.find((p) => isGuestProduct(p.name))?.price ?? 12000))}
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border-2 border-dashed border-red-200 text-red-700 hover:bg-red-50 text-sm font-semibold"
            >
              <UserPlus size={16} /> Agregar cargo INVITADO
            </button>
          )}
          <div className="flex justify-between items-center border-t-2 border-emerald-200 pt-4">
            <span className="text-xl font-bold text-slate-800">TOTAL</span>
            <span className="text-3xl font-bold text-emerald-600">{money(total)}</span>
          </div>
          {isOpen ? (
            <button
              onClick={handleCloseTurno}
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold shadow-lg transition-colors"
            >
              <Lock size={20} /> CERRAR TURNO
            </button>
          ) : (
            <p className="text-center text-sm text-slate-500">Turno cerrado {session.closed_at && `a las ${formatClock(session.closed_at)}`}</p>
          )}
        </div>
      </div>

      {showPlayers && (
        <OpenCourtModal
          court={session.court}
          session={session}
          userName={shift?.user_name ?? ''}
          onClose={() => setShowPlayers(false)}
          onDone={async () => {
            setShowPlayers(false);
            await Promise.all([loadSession(), loadItems()]);
          }}
        />
      )}

      {showCheckout && shift && (
        <CloseTurnoModal
          session={session}
          items={saleItems}
          shift={shift}
          onClose={() => setShowCheckout(false)}
          onPaid={(saleNumber) => {
            setShowCheckout(false);
            alert(`Venta ${saleNumber} completada. Turno cerrado.`);
            onClosed();
          }}
        />
      )}
    </div>
  );
}
