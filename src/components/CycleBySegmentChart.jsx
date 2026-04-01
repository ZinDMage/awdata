import { useMemo, useState } from 'react';
import BarChart from './BarChart';
import { F } from '@/utils/formatters';

/** Generate month options for the last 24 months */
function generateMonthOptions() {
  const opts = [];
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    opts.push({ value: `${y}-${m}`, label: d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }) });
  }
  return opts;
}

const MONTH_OPTIONS = generateMonthOptions();

const BAR_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1',
];

function isInPeriod(deal, startMonth, endMonth) {
  const dateStr = deal.won_time || deal.close_time;
  if (!dateStr) return false;
  const mk = String(dateStr).slice(0, 7);
  return mk >= startMonth && mk <= endMonth;
}

function daysBetween(dateA, dateB) {
  const a = new Date(dateA);
  const b = new Date(dateB);
  if (isNaN(a) || isNaN(b)) return null;
  return Math.round(Math.abs(b - a) / (1000 * 60 * 60 * 24));
}

/**
 * CycleBySegmentChart — Ciclo médio de venda por segmento
 * Groups won deals by segment and shows average days to close.
 */
export default function CycleBySegmentChart({ deals }) {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [startMonth, setStartMonth] = useState(currentMonth);
  const [endMonth, setEndMonth] = useState(currentMonth);

  const handleStartChange = (v) => {
    if (v > endMonth) { setStartMonth(v); setEndMonth(v); }
    else setStartMonth(v);
  };
  const handleEndChange = (v) => {
    if (v < startMonth) { setEndMonth(v); setStartMonth(v); }
    else setEndMonth(v);
  };

  const filteredDeals = useMemo(() => {
    if (!deals?.length) return [];
    return deals.filter(d => isInPeriod(d, startMonth, endMonth));
  }, [deals, startMonth, endMonth]);

  const periodLabel = useMemo(() => {
    const fmt = (ym) => {
      const [y, m] = ym.split('-');
      const d = new Date(Number(y), Number(m) - 1, 1);
      return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    };
    if (startMonth === endMonth) return fmt(startMonth);
    return `${fmt(startMonth)} — ${fmt(endMonth)}`;
  }, [startMonth, endMonth]);

  const { bars, totalDeals } = useMemo(() => {
    if (!filteredDeals.length) return { bars: [], totalDeals: 0 };

    const groups = {};
    let count = 0;

    for (const d of filteredDeals) {
      const wonDate = d.won_time || d.close_time;
      if (!wonDate || !d.deal_created_at) continue;

      const days = daysBetween(d.deal_created_at, wonDate);
      if (days === null) continue;

      const seg = d.segmento || 'Sem segmento';
      if (!groups[seg]) groups[seg] = { total: 0, count: 0 };
      groups[seg].total += days;
      groups[seg].count++;
      count++;
    }

    const sorted = Object.entries(groups)
      .map(([label, { total, count }], i) => ({
        label,
        value: Math.round(total / count),
        color: BAR_COLORS[i % BAR_COLORS.length],
      }))
      .sort((a, b) => b.value - a.value);

    return { bars: sorted, totalDeals: count };
  }, [filteredDeals]);

  return (
    <div className="bg-surface-secondary rounded-card border border-border-subtle/20 overflow-hidden">
      {/* Header with period filter */}
      <div className="px-6 py-4 border-b border-border-subtle/20 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-content-primary">Ciclo Médio de Venda por Segmento</h3>
          <p className="text-xs text-content-tertiary mt-0.5">
            {totalDeals} vendas analisadas · {periodLabel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-content-tertiary">Início:</label>
          <select
            value={startMonth}
            onChange={(e) => handleStartChange(e.target.value)}
            className="bg-surface-tertiary rounded-lg px-3 py-1.5 text-sm text-content-primary border border-border-subtle/20 outline-none focus:ring-2 focus:ring-info"
          >
            {MONTH_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <label className="text-xs text-content-tertiary">Fim:</label>
          <select
            value={endMonth}
            onChange={(e) => handleEndChange(e.target.value)}
            className="bg-surface-tertiary rounded-lg px-3 py-1.5 text-sm text-content-primary border border-border-subtle/20 outline-none focus:ring-2 focus:ring-info"
          >
            {MONTH_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Chart */}
      <div className="p-4">
        <BarChart
          bars={bars}
          title=""
          subtitle=""
          formatValue={(v) => F.d(v)}
        />
      </div>
    </div>
  );
}
