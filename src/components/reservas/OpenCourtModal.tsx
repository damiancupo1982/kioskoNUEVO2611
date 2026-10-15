import { useState } from 'react';
import { Loader2, PlayCircle, Save, Users, X } from 'lucide-react';
import { supabase, CourtPlayer, CourtReservation, CourtSession } from '../../lib/supabase';
import LotPersonInput from './LotPersonInput';
import { courtLabel, rpcErrorMessage } from './reservasUtils';

interface OpenCourtModalProps {
  court: number;
  reservation?: CourtReservation;
  session?: CourtSession;
  userName: string;
  onClose: () => void;
  onDone: (sessionId: string) => void;
}

const emptyPlayer = (): CourtPlayer => ({ lot: '', name: '', socio_id: null, is_socio: false });

export default function OpenCourtModal({ court, reservation, session, userName, onClose, onDone }: OpenCourtModalProps) {
  const [players, setPlayers] = useState<CourtPlayer[]>(
    session
      ? [0, 1, 2, 3].map((i) => session.players[i] ?? emptyPlayer())
      : [
          reservation
            ? { lot: reservation.titular_lot, name: reservation.titular_name, socio_id: null, is_socio: false }
            : emptyPlayer(),
          emptyPlayer(),
          emptyPlayer(),
          emptyPlayer(),
        ]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const updatePlayer = (index: number, player: CourtPlayer) =>
    setPlayers((prev) => prev.map((p, i) => (i === index ? player : p)));

  const handleOpen = async () => {
    setError('');
    const titular = players[0];
    if (!titular.name.trim()) return setError('El Jugador 1 (titular) es obligatorio.');
    const incomplete = players.findIndex((p) => p.lot.trim() && !p.name.trim());
    if (incomplete >= 0) return setError(`Complete el nombre del Jugador ${incomplete + 1} o borre su lote.`);

    const filled = players
      .filter((p) => p.name.trim())
      .map((p) => ({ ...p, lot: p.lot.trim(), name: p.name.trim() }));

    setSaving(true);
    const titularFields = {
      p_players: filled,
      p_titular_name: titular.name.trim(),
      p_titular_lot: titular.lot.trim(),
      p_titular_socio_id: titular.is_socio ? titular.socio_id : null,
    };

    if (session) {
      const { error: rpcError } = await supabase.rpc('update_court_session_players', {
        p_session_id: session.id,
        ...titularFields,
      });
      setSaving(false);
      if (rpcError) return setError(rpcErrorMessage(rpcError.message));
      onDone(session.id);
      return;
    }

    const { data, error: rpcError } = await supabase.rpc('open_court_session', {
      p_court: court,
      p_reservation_id: reservation?.id ?? null,
      ...titularFields,
      p_user: userName,
    });
    setSaving(false);
    if (rpcError || !data) return setError(rpcErrorMessage(rpcError?.message));
    onDone(data as string);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700">
              {session ? <Users size={20} /> : <PlayCircle size={20} />}
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">
                {session ? `Jugadores - ${courtLabel(court)}` : `Abrir ${courtLabel(court)}`}
              </h3>
              <p className="text-xs text-slate-500">Hasta 4 jugadores. El Jugador 1 es el titular.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-3 overflow-y-auto">
          {players.map((p, i) => (
            <LotPersonInput
              key={i}
              label={i === 0 ? 'Jugador 1 - Titular' : `Jugador ${i + 1}`}
              value={p}
              onChange={(player) => updatePlayer(i, player)}
              highlight={i === 0}
            />
          ))}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 space-y-3">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-medium">{error}</div>
          )}
          <button
            onClick={handleOpen}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold shadow-lg transition-colors"
          >
            {saving ? <Loader2 size={20} className="animate-spin" /> : session ? <Save size={20} /> : <PlayCircle size={20} />}
            {session ? 'GUARDAR JUGADORES' : 'ABRIR CANCHA'}
          </button>
        </div>
      </div>
    </div>
  );
}
