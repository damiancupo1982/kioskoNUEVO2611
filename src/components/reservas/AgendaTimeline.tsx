import { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { CourtReservation } from '../../lib/supabase';
import { EVENT_META, EventType, hhmmOf, minutesOf, nowTimeHHMM, todayISO } from './reservasUtils';

export interface AgendaBlock {
  key: string;
  kind: EventType | 'en_juego' | 'jugado';
  court: number;
  date: string;
  startMin: number;
  endMin: number;
  headline: string;
  detail: string;
  reservation?: CourtReservation;
  sessionId?: string;
}

export interface AgendaColumn {
  key: string;
  label: string;
  highlight?: boolean;
  court: number;
  date: string;
}

interface AgendaTimelineProps {
  columns: AgendaColumn[];
  blocks: AgendaBlock[];
  onBlockClick: (block: AgendaBlock) => void;
  onEmptyClick: (court: number, date: string, time: string) => void;
}

const PX_PER_HOUR = 64;
const END_HOUR = 24;
const DEFAULT_START_HOUR = 7;

export default function AgendaTimeline({ columns, blocks, onBlockClick, onEmptyClick }: AgendaTimelineProps) {
  const [nowMin, setNowMin] = useState(() => minutesOf(nowTimeHHMM()));
  useEffect(() => {
    const t = setInterval(() => setNowMin(minutesOf(nowTimeHHMM())), 60000);
    return () => clearInterval(t);
  }, []);

  const earliest = blocks.reduce((m, b) => Math.min(m, b.startMin), DEFAULT_START_HOUR * 60);
  const startHour = Math.floor(earliest / 60);
  const hours = Array.from({ length: END_HOUR - startHour }, (_, i) => startHour + i);
  const height = (END_HOUR - startHour) * PX_PER_HOUR;
  const top = (min: number) => ((min - startHour * 60) / 60) * PX_PER_HOUR;
  const today = todayISO();

  const handleEmpty = (e: React.MouseEvent<HTMLDivElement>, col: AgendaColumn) => {
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    const minute = startHour * 60 + Math.floor((y / PX_PER_HOUR) * 2) * 30;
    onEmptyClick(col.court, col.date, hhmmOf(minute));
  };

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        <div className="flex sticky top-0 z-20 bg-white border-b border-slate-200">
          <div className="w-14 shrink-0" />
          {columns.map((col) => (
            <div
              key={col.key}
              className={`flex-1 text-center py-3 text-sm font-bold capitalize ${col.highlight ? 'text-sky-700' : 'text-slate-700'}`}
            >
              {col.label}
            </div>
          ))}
        </div>

        <div className="flex relative" style={{ height }}>
          <div className="w-14 shrink-0 relative">
            {hours.map((h) => (
              <span
                key={h}
                className="absolute right-2 -translate-y-1/2 text-[11px] font-semibold text-slate-400"
                style={{ top: top(h * 60) }}
              >
                {h > startHour && `${String(h).padStart(2, '0')}:00`}
              </span>
            ))}
          </div>

          {columns.map((col) => (
            <div
              key={col.key}
              onClick={(e) => handleEmpty(e, col)}
              className="flex-1 relative border-l border-slate-200 cursor-pointer hover:bg-sky-50/40 transition-colors"
            >
              {hours.map((h) => (
                <div key={h} className="absolute inset-x-0 border-t border-slate-100" style={{ top: top(h * 60) }}>
                  <div className="border-t border-dashed border-slate-100" style={{ marginTop: PX_PER_HOUR / 2 }} />
                </div>
              ))}

              {col.date === today && nowMin >= startHour * 60 && (
                <div className="absolute inset-x-0 z-10 pointer-events-none" style={{ top: top(nowMin) }}>
                  <div className="h-0.5 bg-red-500" />
                  <div className="absolute -left-1 -top-1 w-2.5 h-2.5 rounded-full bg-red-500" />
                </div>
              )}

              {blocks
                .filter((b) => b.court === col.court && b.date === col.date)
                .map((b) => {
                  const meta = EVENT_META[b.kind];
                  const blockHeight = Math.max(top(b.endMin) - top(b.startMin), 22);
                  const readOnly = b.kind === 'jugado';
                  const compact = blockHeight <= 34;
                  return (
                    <div
                      key={b.key}
                      role="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onBlockClick(b);
                      }}
                      title={`${hhmmOf(b.startMin)} - ${hhmmOf(b.endMin)} ${meta.label}\n${b.headline}${b.detail ? `\n${b.detail}` : ''}`}
                      className={`absolute left-1 right-1 rounded-lg border-l-4 px-2 py-1 overflow-hidden shadow-sm text-[11px] leading-tight transition-all cursor-pointer hover:shadow-md hover:z-10 ${meta.block}`}
                      style={{ top: top(b.startMin) + 1, height: blockHeight - 2 }}
                    >
                      <p className="font-bold flex items-center gap-1 truncate">
                        {compact ? (
                          <>
                            {readOnly && <Lock size={10} className="shrink-0 opacity-60" />}
                            <span className="font-black truncate">{b.headline}</span>
                            <span className="font-semibold opacity-70 shrink-0">
                              {hhmmOf(b.startMin)}-{hhmmOf(b.endMin)}
                            </span>
                          </>
                        ) : (
                          <>
                            {hhmmOf(b.startMin)} - {hhmmOf(b.endMin)}
                            <span className="font-black tracking-wide">{meta.label}</span>
                            {readOnly && <Lock size={10} className="shrink-0 opacity-60" />}
                          </>
                        )}
                      </p>
                      {!compact && <p className="truncate font-semibold">{b.headline}</p>}
                      {blockHeight > 50 && b.detail && <p className="truncate opacity-80">{b.detail}</p>}
                    </div>
                  );
                })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
