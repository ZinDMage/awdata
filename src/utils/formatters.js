/**
 * Formatting utilities for pt-BR display (UX-DR24).
 * All dashboard numbers pass through these formatters.
 */

const _nil = v => v == null || Number.isNaN(Number(v));

export const F = {
  n: v => _nil(v) ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 }),
  ri: v => _nil(v) ? "—" : "R$ " + Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 }),
  r2: v => _nil(v) ? "—" : "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  p: v => _nil(v) ? "—" : (v * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%",
  x: v => _nil(v) ? "—" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "x",
  d: v => _nil(v) ? "—" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " dias",
};

const _months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Parse date string safely, treating date-only strings as local time (not UTC) */
function _parseDate(v) {
  if (!v) return null;
  try {
    // Date-only strings ("2026-03-25") are parsed as UTC by spec — force local time
    const s = String(v);
    const d = new Date(s.length === 10 && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s + 'T00:00:00' : s);
    return isNaN(d.getTime()) ? null : d;
  } catch { return null; }
}

/** Returns true if original string has time component */
function _hasTime(v) {
  return v != null && String(v).includes('T');
}

Object.assign(F, {
  /** Format date pt-BR: "25/mar" or "25/mar, 14:30" if time present */
  date: v => {
    const d = _parseDate(v);
    if (!d) return '—';
    const day = d.getDate().toString().padStart(2, '0');
    const month = _months[d.getMonth()];
    if (!_hasTime(v)) return `${day}/${month}`;
    const h = d.getHours(), m = d.getMinutes();
    if (h === 0 && m === 0 && !_hasTime(v)) return `${day}/${month}`;
    return `${day}/${month}, ${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  },

  /** Format datetime compact pt-BR: "25/mar 14:30" */
  datetime: v => {
    const d = _parseDate(v);
    if (!d) return '—';
    const day = d.getDate().toString().padStart(2, '0');
    const month = _months[d.getMonth()];
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    return `${day}/${month} ${h}:${m}`;
  },

  /** Format duration from seconds (number) or "HH:MM:SS" (string) */
  duration: v => {
    if (v == null) return null;
    let sec;
    if (typeof v === 'string' && v.includes(':')) {
      const parts = v.split(':').map(Number);
      sec = (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
    } else {
      sec = Number(v);
    }
    if (isNaN(sec) || sec <= 0) return null;
    if (sec < 60) return `${sec}s`;
    if (sec < 3600) {
      const min = Math.floor(sec / 60);
      const s = sec % 60;
      return s > 0 ? `${min}min ${s}s` : `${min}min`;
    }
    const hrs = Math.floor(sec / 3600);
    const min = Math.floor((sec % 3600) / 60);
    return min > 0 ? `${hrs}h ${min}min` : `${hrs}h`;
  },

  /** Format time between stages: seconds → "3min", "4h", "2 dias" */
  timeBetween: v => {
    if (v == null || v <= 0) return null;
    const hours = Math.floor(v / 3600);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days} dia${days > 1 ? 's' : ''}`;
    if (hours > 0) return `${hours}h`;
    const mins = Math.floor(v / 60);
    return mins > 0 ? `${mins}min` : `${v}s`;
  },
});

/** Resolve nested property by dot path: res(obj, "g.rec") */
export const res = (o, p) => {
  const k = p.split(".");
  let v = o;
  for (const s of k) v = v?.[s];
  return v ?? null;
};

/** Calculate delta percentage between current and previous values */
export function dlt(c, p) {
  if (c == null || p == null || p === 0) return null;
  if (!Number.isFinite(c) || !Number.isFinite(p)) return null;
  const d = ((c - p) / Math.abs(p)) * 100;
  return Math.abs(d) > 10000 ? null : d;
}
