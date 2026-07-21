export const AR_TZ = 'America/Argentina/Buenos_Aires';

interface DateParts {
  year: number;
  month: number; // 0-indexed (JS convention)
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function getArgentinaParts(date: Date = new Date()): DateParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: AR_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '0';
  return {
    year: parseInt(get('year'), 10),
    month: parseInt(get('month'), 10) - 1,
    day: parseInt(get('day'), 10),
    hour: parseInt(get('hour'), 10) % 24,
    minute: parseInt(get('minute'), 10),
    second: parseInt(get('second'), 10),
  };
}

// Argentina is UTC-3 (no DST since 2009). Midnight AR = 03:00 UTC.
function argentinaToUTC(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  ms = 0
): Date {
  return new Date(Date.UTC(year, month, day, hour + 3, minute, second, ms));
}

export function startOfDayAR(date: Date = new Date()): Date {
  const p = getArgentinaParts(date);
  return argentinaToUTC(p.year, p.month, p.day, 0, 0, 0, 0);
}

export function endOfDayAR(date: Date = new Date()): Date {
  const p = getArgentinaParts(date);
  return argentinaToUTC(p.year, p.month, p.day, 23, 59, 59, 999);
}

export function startOfWeekAR(date: Date = new Date()): Date {
  const start = startOfDayAR(date);
  const p = getArgentinaParts(start);
  const dayOfWeek = new Date(Date.UTC(p.year, p.month, p.day)).getUTCDay();
  const diff = p.day - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
  return argentinaToUTC(p.year, p.month, diff, 0, 0, 0, 0);
}

export function startOfMonthAR(date: Date = new Date()): Date {
  const p = getArgentinaParts(date);
  return argentinaToUTC(p.year, p.month, 1, 0, 0, 0, 0);
}

export function endOfMonthAR(year: number, month: number): Date {
  // month is 0-indexed; last day of that month
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return argentinaToUTC(year, month, lastDay, 23, 59, 59, 999);
}

export function startOfPrevMonthAR(date: Date = new Date()): Date {
  const p = getArgentinaParts(date);
  const prevMonth = p.month === 0 ? 11 : p.month - 1;
  const prevYear = p.month === 0 ? p.year - 1 : p.year;
  return argentinaToUTC(prevYear, prevMonth, 1, 0, 0, 0, 0);
}

export function endOfPrevMonthAR(date: Date = new Date()): Date {
  const p = getArgentinaParts(date);
  return endOfMonthAR(p.year, p.month - 1 < 0 ? 11 : p.month - 1);
}

// Parse a "YYYY-MM-DD" date input string as an Argentina calendar date
export function parseDateInputAR(input: string, endOfDay = false): Date | null {
  if (!input) return null;
  const [y, m, d] = input.split('-').map(Number);
  if (!y || !m || !d) return null;
  return argentinaToUTC(y, m - 1, d, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
}
