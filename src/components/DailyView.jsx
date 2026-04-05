import { useMemo, useState, useEffect, useCallback } from 'react';
import { useMetrics } from '@/contexts/MetricsContext';
import { fetchDailyBreakdown, fetchFunnelComparison } from '@/services/dailyService';
import { F } from '@/utils/formatters';
import PillTabs from './ui/pill-tabs';
import SkeletonLoader from './SkeletonLoader';
import EmptyState from './EmptyState';

// ── Constants ──────────────────────────────────────────────────

const MESES_LIST = [
  { key: 'jan', label: 'Jan', idx: 0 }, { key: 'fev', label: 'Fev', idx: 1 },
  { key: 'mar', label: 'Mar', idx: 2 }, { key: 'abr', label: 'Abr', idx: 3 },
  { key: 'mai', label: 'Mai', idx: 4 }, { key: 'jun', label: 'Jun', idx: 5 },
  { key: 'jul', label: 'Jul', idx: 6 }, { key: 'ago', label: 'Ago', idx: 7 },
  { key: 'set', label: 'Set', idx: 8 }, { key: 'out', label: 'Out', idx: 9 },
  { key: 'nov', label: 'Nov', idx: 10 }, { key: 'dez', label: 'Dez', idx: 11 },
];

const WEEKS = [
  { key: 's1', label: 'Semana 1', startDay: 1, endDay: 7 },
  { key: 's2', label: 'Semana 2', startDay: 8, endDay: 14 },
  { key: 's3', label: 'Semana 3', startDay: 15, endDay: 21 },
  { key: 's4', label: 'Semana 4', startDay: 22, endDay: null }, // null = last day of month
];

const SUB_VIEWS = [
  { key: 'diario', label: 'Visão Diária' },
  { key: 'funil', label: 'Comparativo de Funil' },
];

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

function getWeekDateRange(year, monthIdx, weekKey) {
  const week = WEEKS.find(w => w.key === weekKey);
  if (!week) return null;
  const lastDay = new Date(year, monthIdx + 1, 0).getDate();
  const endDay = week.endDay ?? lastDay;
  const pad = (n) => String(n).padStart(2, '0');
  const m = pad(monthIdx + 1);
  return {
    startDate: `${year}-${m}-${pad(week.startDay)}`,
    endDate: `${year}-${m}-${pad(Math.min(endDay, lastDay))}`,
  };
}

function formatDayShort(dateStr) {
  const [, m, d] = dateStr.split('-');
  return `${d}/${m}`;
}

const METRIC_ROWS = [
  { key: 'spend', label: 'Gasto em Ads', fmt: (v) => F.r2(v) },
  { key: 'impressions', label: 'Impressões', fmt: (v) => F.n(v) },
  { key: 'leads', label: 'Leads', fmt: (v) => F.n(v) },
  { key: 'mqls', label: 'MQLs', fmt: (v) => F.n(v) },
  { key: 'sqls', label: 'SQLs', fmt: (v) => F.n(v) },
  { key: 'rAg', label: 'Reuniões Agendadas', fmt: (v) => F.n(v) },
  { key: 'rRe', label: 'Reuniões Realizadas', fmt: (v) => F.n(v) },
  { key: 'vendas', label: 'Vendas', fmt: (v) => F.n(v) },
];

// ── Daily Breakdown Sub-View ───────────────────────────────────

function DailyBreakdown({ sourceFilter }) {
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [monthKey, setMonthKey] = useState(MESES_LIST[now.getMonth()].key);
  const [weekKey, setWeekKey] = useState('s1');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const monthIdx = MESES_LIST.findIndex(m => m.key === monthKey);
  const dateRange = useMemo(() => getWeekDateRange(Number(year), monthIdx, weekKey), [year, monthIdx, weekKey]);

  useEffect(() => {
    if (!dateRange) return;
    let cancelled = false;
    setLoading(true);
    fetchDailyBreakdown(dateRange.startDate, dateRange.endDate, sourceFilter).then(res => {
      if (!cancelled) { setData(res); setLoading(false); }
    }).catch(err => {
      console.error('[DailyBreakdown] fetch error:', err);
      if (!cancelled) { setData(null); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [dateRange, sourceFilter]);

  const totals = useMemo(() => {
    if (!data?.days?.length) return null;
    return data.days.reduce((acc, d) => {
      acc.leads += d.leads; acc.mqls += d.mqls; acc.sqls += d.sqls;
      acc.rAg += d.rAg; acc.rRe += d.rRe; acc.vendas += d.vendas;
      acc.spend += d.spend; acc.impressions += d.impressions; acc.clicks += d.clicks;
      return acc;
    }, { leads: 0, mqls: 0, sqls: 0, rAg: 0, rRe: 0, vendas: 0, spend: 0, impressions: 0, clicks: 0 });
  }, [data]);

  const yearOptions = useMemo(() => {
    const current = now.getFullYear();
    return [current, current - 1].map(y => ({ value: String(y), label: String(y) }));
  }, []);

  return (
    <div>
      {/* Selectors */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <select value={year} onChange={e => setYear(e.target.value)}
          className="bg-surface-tertiary rounded-lg px-3 py-1.5 text-sm text-content-primary border border-border-subtle/20 outline-none focus:ring-2 focus:ring-info">
          {yearOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <PillTabs options={MESES_LIST.map(m => ({ key: m.key, label: m.label }))} activeKey={monthKey} onKeyChange={setMonthKey} size="sm" />
        <PillTabs options={WEEKS.map(w => ({ key: w.key, label: w.label }))} activeKey={weekKey} onKeyChange={setWeekKey} size="sm" />
      </div>

      {loading ? <SkeletonLoader /> : !data?.days?.length ? (
        <EmptyState icon="📅" message="Nenhum dado encontrado para o período selecionado" />
      ) : (
        <div className="bg-surface-secondary rounded-card border border-border-subtle/20 overflow-hidden">
          <div className="px-6 py-4 border-b border-border-subtle/20">
            <h3 className="text-sm font-semibold text-content-primary">Métricas Diárias</h3>
            <p className="text-xs text-content-tertiary mt-0.5">
              {dateRange.startDate.split('-').reverse().join('/')} — {dateRange.endDate.split('-').reverse().join('/')}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-info/10">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-info border-b border-border-subtle/30 sticky left-0 bg-info/10 z-10 min-w-[160px]">Métrica</th>
                  {data.days.map(day => (
                    <th key={day.date} className="text-center px-3 py-2.5 text-xs font-semibold text-info border-b border-border-subtle/30 whitespace-nowrap">
                      {formatDayShort(day.date)}
                    </th>
                  ))}
                  <th className="text-center px-3 py-2.5 text-xs font-bold text-info border-b border-border-subtle/30 border-l border-border-subtle/20">Total</th>
                </tr>
              </thead>
              <tbody>
                {METRIC_ROWS.map((row, i) => (
                  <tr key={row.key} className={`border-b border-border-subtle/10 transition-colors hover:bg-white/[0.03] ${i % 2 === 0 ? 'bg-transparent' : 'bg-white/[0.015]'}`}>
                    <td className="px-4 py-2 text-xs font-medium text-content-secondary sticky left-0 bg-surface-secondary z-10 border-r border-border-subtle/10">
                      {row.label}
                    </td>
                    {data.days.map(day => (
                      <td key={day.date} className={`text-center px-3 py-2 tabular-nums text-xs ${day[row.key] > 0 ? 'text-content-primary font-medium' : 'text-content-tertiary/50'}`}>
                        {row.fmt(day[row.key])}
                      </td>
                    ))}
                    <td className="text-center px-3 py-2 tabular-nums text-xs font-bold text-content-primary border-l border-border-subtle/20">
                      {row.fmt(totals[row.key])}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Funnel Comparison Sub-View ─────────────────────────────────

function FunnelComparison({ sourceFilter }) {
  const now = new Date();
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevPrevMonth = new Date(now.getFullYear(), now.getMonth() - 2, 1);

  const toYM = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

  const [monthA, setMonthA] = useState(toYM(prevPrevMonth));
  const [monthB, setMonthB] = useState(toYM(prevMonth));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchFunnelComparison(monthA, monthB, sourceFilter).then(res => {
      if (!cancelled) { setData(res); setLoading(false); }
    }).catch(err => {
      console.error('[FunnelComparison] fetch error:', err);
      if (!cancelled) { setData(null); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [monthA, monthB, sourceFilter]);

  const fmtMonth = (ym) => {
    const [y, m] = ym.split('-');
    const d = new Date(Number(y), Number(m) - 1, 1);
    return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  };

  const pct = (n, d) => d > 0 ? ((n / d) * 100).toFixed(1) + '%' : '—';
  const delta = (a, b) => {
    if (a == null || b == null || b === 0) return null;
    return ((a - b) / b * 100).toFixed(1);
  };

  // Merge keys from both months
  const allMarkets = useMemo(() => {
    if (!data) return [];
    const keys = new Set([...Object.keys(data.monthA?.byMarket || {}), ...Object.keys(data.monthB?.byMarket || {})]);
    return [...keys].sort();
  }, [data]);

  const allRevenues = useMemo(() => {
    if (!data) return [];
    const keys = new Set([...Object.keys(data.monthA?.byRevenue || {}), ...Object.keys(data.monthB?.byRevenue || {})]);
    return [...keys].sort();
  }, [data]);

  const allVolumes = useMemo(() => {
    if (!data) return [];
    const keys = new Set([...Object.keys(data.monthA?.byVolume || {}), ...Object.keys(data.monthB?.byVolume || {})]);
    return [...keys].sort();
  }, [data]);

  return (
    <div>
      {/* Month selectors */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex items-center gap-2">
          <label className="text-xs text-content-tertiary">Mês A:</label>
          <select value={monthA} onChange={e => setMonthA(e.target.value)}
            className="bg-surface-tertiary rounded-lg px-3 py-1.5 text-sm text-content-primary border border-border-subtle/20 outline-none focus:ring-2 focus:ring-info">
            {MONTH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <span className="text-content-tertiary text-sm">vs</span>
        <div className="flex items-center gap-2">
          <label className="text-xs text-content-tertiary">Mês B:</label>
          <select value={monthB} onChange={e => setMonthB(e.target.value)}
            className="bg-surface-tertiary rounded-lg px-3 py-1.5 text-sm text-content-primary border border-border-subtle/20 outline-none focus:ring-2 focus:ring-info">
            {MONTH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {loading ? <SkeletonLoader /> : !data ? (
        <EmptyState icon="📊" message="Selecione dois meses para comparar" />
      ) : (
        <div className="space-y-6">
          {/* Totals comparison */}
          <div className="bg-surface-secondary rounded-card border border-border-subtle/20 overflow-hidden">
            <div className="px-6 py-4 border-b border-border-subtle/20">
              <h3 className="text-sm font-semibold text-content-primary">Visão Geral do Funil</h3>
              <p className="text-xs text-content-tertiary mt-0.5">{fmtMonth(monthA)} vs {fmtMonth(monthB)}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-info/10">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-info border-b border-border-subtle/30 min-w-[140px]">Etapa</th>
                    <th className="text-center px-3 py-2.5 text-xs font-semibold text-info border-b border-border-subtle/30">{fmtMonth(monthA)}</th>
                    <th className="text-center px-3 py-2.5 text-xs font-semibold text-info border-b border-border-subtle/30">{fmtMonth(monthB)}</th>
                    <th className="text-center px-3 py-2.5 text-xs font-semibold text-info border-b border-border-subtle/30">Δ%</th>
                    <th className="text-center px-3 py-2.5 text-xs font-semibold text-info border-b border-border-subtle/30">Conv. A</th>
                    <th className="text-center px-3 py-2.5 text-xs font-semibold text-info border-b border-border-subtle/30">Conv. B</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: 'Leads', key: 'leads', convFrom: null },
                    { label: 'MQLs', key: 'mqls', convFrom: 'leads' },
                    { label: 'SQLs', key: 'sqls', convFrom: 'mqls' },
                    { label: 'Reuniões Agendadas', key: 'rAg', convFrom: 'sqls' },
                    { label: 'Reuniões Realizadas', key: 'rRe', convFrom: 'rAg' },
                    { label: 'Vendas', key: 'vendas', convFrom: 'rRe' },
                  ].map((row, i) => {
                    const vA = data.monthA?.totals?.[row.key] ?? 0;
                    const vB = data.monthB?.totals?.[row.key] ?? 0;
                    const d = delta(vB, vA);
                    const convA = row.convFrom ? pct(vA, data.monthA?.totals?.[row.convFrom] ?? 0) : '—';
                    const convB = row.convFrom ? pct(vB, data.monthB?.totals?.[row.convFrom] ?? 0) : '—';
                    return (
                      <tr key={row.key} className={`border-b border-border-subtle/10 ${i % 2 !== 0 ? 'bg-white/[0.015]' : ''}`}>
                        <td className="px-4 py-2 text-xs font-medium text-content-primary">{row.label}</td>
                        <td className="text-center px-3 py-2 tabular-nums text-xs text-content-primary">{F.n(vA)}</td>
                        <td className="text-center px-3 py-2 tabular-nums text-xs text-content-primary">{F.n(vB)}</td>
                        <DeltaCell value={d} />
                        <td className="text-center px-3 py-2 tabular-nums text-xs text-content-secondary">{convA}</td>
                        <td className="text-center px-3 py-2 tabular-nums text-xs text-content-secondary">{convB}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Market breakdown */}
          <div className="bg-surface-secondary rounded-card border border-border-subtle/20 overflow-hidden">
            <div className="px-6 py-4 border-b border-border-subtle/20">
              <h3 className="text-sm font-semibold text-content-primary">Breakdown por Mercado</h3>
              <p className="text-xs text-content-tertiary mt-0.5">MQLs e SQLs gerados por mercado — identifica se marketing gerou leads piores ou se o comercial perdeu eficiência</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#b8860b]/20">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#d4a634] border-b border-border-subtle/30 min-w-[160px] sticky left-0 bg-[#b8860b]/20 z-10">Mercado</th>
                    <th colSpan="3" className="text-center px-2 py-2.5 text-xs font-semibold text-[#d4a634] border-b border-border-subtle/30 border-l border-border-subtle/20">MQLs</th>
                    <th colSpan="3" className="text-center px-2 py-2.5 text-xs font-semibold text-[#d4a634] border-b border-border-subtle/30 border-l border-border-subtle/20">SQLs</th>
                    <th colSpan="2" className="text-center px-2 py-2.5 text-xs font-semibold text-[#d4a634] border-b border-border-subtle/30 border-l border-border-subtle/20">Conv. MQL→SQL</th>
                  </tr>
                  <tr className="bg-[#b8860b]/10">
                    <th className="sticky left-0 bg-[#b8860b]/10 z-10 border-b border-border-subtle/20"></th>
                    <th className="text-center px-2 py-1.5 text-[10px] font-medium text-[#d4a634]/80 border-b border-border-subtle/20 border-l border-border-subtle/20">A</th>
                    <th className="text-center px-2 py-1.5 text-[10px] font-medium text-[#d4a634]/80 border-b border-border-subtle/20">B</th>
                    <th className="text-center px-2 py-1.5 text-[10px] font-medium text-[#d4a634]/80 border-b border-border-subtle/20">Δ%</th>
                    <th className="text-center px-2 py-1.5 text-[10px] font-medium text-[#d4a634]/80 border-b border-border-subtle/20 border-l border-border-subtle/20">A</th>
                    <th className="text-center px-2 py-1.5 text-[10px] font-medium text-[#d4a634]/80 border-b border-border-subtle/20">B</th>
                    <th className="text-center px-2 py-1.5 text-[10px] font-medium text-[#d4a634]/80 border-b border-border-subtle/20">Δ%</th>
                    <th className="text-center px-2 py-1.5 text-[10px] font-medium text-[#d4a634]/80 border-b border-border-subtle/20 border-l border-border-subtle/20">A</th>
                    <th className="text-center px-2 py-1.5 text-[10px] font-medium text-[#d4a634]/80 border-b border-border-subtle/20">B</th>
                  </tr>
                </thead>
                <tbody>
                  {allMarkets.map((market, i) => {
                    const mA = data.monthA?.byMarket?.[market] || {};
                    const mB = data.monthB?.byMarket?.[market] || {};
                    const mqA = mA.mqls || 0, mqB = mB.mqls || 0;
                    const sqA = mA.sqls || 0, sqB = mB.sqls || 0;
                    const convA = mqA > 0 ? ((sqA / mqA) * 100).toFixed(1) + '%' : '—';
                    const convB = mqB > 0 ? ((sqB / mqB) * 100).toFixed(1) + '%' : '—';
                    return (
                      <tr key={market} className={`border-b border-border-subtle/10 ${i % 2 !== 0 ? 'bg-white/[0.015]' : ''}`}>
                        <td className="px-4 py-2 text-xs font-medium text-content-secondary sticky left-0 bg-surface-secondary z-10 border-r border-border-subtle/10">{market}</td>
                        <td className="text-center px-2 py-2 tabular-nums text-xs text-content-primary border-l border-border-subtle/10">{mqA}</td>
                        <td className="text-center px-2 py-2 tabular-nums text-xs text-content-primary">{mqB}</td>
                        <DeltaCell value={delta(mqB, mqA)} />
                        <td className="text-center px-2 py-2 tabular-nums text-xs text-content-primary border-l border-border-subtle/10">{sqA}</td>
                        <td className="text-center px-2 py-2 tabular-nums text-xs text-content-primary">{sqB}</td>
                        <DeltaCell value={delta(sqB, sqA)} />
                        <td className="text-center px-2 py-2 tabular-nums text-xs text-content-secondary border-l border-border-subtle/10">{convA}</td>
                        <td className="text-center px-2 py-2 tabular-nums text-xs text-content-secondary">{convB}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Revenue breakdown */}
          <BreakdownTable
            title="Breakdown por Faturamento"
            subtitle="Distribuição de Leads, MQLs e SQLs por faixa de faturamento anual"
            dataA={data.monthA?.byRevenue}
            dataB={data.monthB?.byRevenue}
            allKeys={allRevenues}
            delta={delta}
          />

          {/* Volume breakdown */}
          <BreakdownTable
            title="Breakdown por Tickets Mensais"
            subtitle="Distribuição de Leads, MQLs e SQLs por volume de tickets/mês"
            dataA={data.monthA?.byVolume}
            dataB={data.monthB?.byVolume}
            allKeys={allVolumes}
            delta={delta}
          />
        </div>
      )}
    </div>
  );
}

function BreakdownTable({ title, subtitle, dataA, dataB, allKeys, delta }) {
  return (
    <div className="bg-surface-secondary rounded-card border border-border-subtle/20 overflow-hidden">
      <div className="px-6 py-4 border-b border-border-subtle/20">
        <h3 className="text-sm font-semibold text-content-primary">{title}</h3>
        <p className="text-xs text-content-tertiary mt-0.5">{subtitle}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#b8860b]/20">
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#d4a634] border-b border-border-subtle/30 min-w-[200px] sticky left-0 bg-[#b8860b]/20 z-10">Faixa</th>
              <th colSpan="3" className="text-center px-2 py-2.5 text-xs font-semibold text-[#d4a634] border-b border-border-subtle/30 border-l border-border-subtle/20">Leads</th>
              <th colSpan="3" className="text-center px-2 py-2.5 text-xs font-semibold text-[#d4a634] border-b border-border-subtle/30 border-l border-border-subtle/20">MQLs</th>
              <th colSpan="3" className="text-center px-2 py-2.5 text-xs font-semibold text-[#d4a634] border-b border-border-subtle/30 border-l border-border-subtle/20">SQLs</th>
            </tr>
            <tr className="bg-[#b8860b]/10">
              <th className="sticky left-0 bg-[#b8860b]/10 z-10 border-b border-border-subtle/20"></th>
              <th className="text-center px-2 py-1.5 text-[10px] font-medium text-[#d4a634]/80 border-b border-border-subtle/20 border-l border-border-subtle/20">A</th>
              <th className="text-center px-2 py-1.5 text-[10px] font-medium text-[#d4a634]/80 border-b border-border-subtle/20">B</th>
              <th className="text-center px-2 py-1.5 text-[10px] font-medium text-[#d4a634]/80 border-b border-border-subtle/20">Δ%</th>
              <th className="text-center px-2 py-1.5 text-[10px] font-medium text-[#d4a634]/80 border-b border-border-subtle/20 border-l border-border-subtle/20">A</th>
              <th className="text-center px-2 py-1.5 text-[10px] font-medium text-[#d4a634]/80 border-b border-border-subtle/20">B</th>
              <th className="text-center px-2 py-1.5 text-[10px] font-medium text-[#d4a634]/80 border-b border-border-subtle/20">Δ%</th>
              <th className="text-center px-2 py-1.5 text-[10px] font-medium text-[#d4a634]/80 border-b border-border-subtle/20 border-l border-border-subtle/20">A</th>
              <th className="text-center px-2 py-1.5 text-[10px] font-medium text-[#d4a634]/80 border-b border-border-subtle/20">B</th>
              <th className="text-center px-2 py-1.5 text-[10px] font-medium text-[#d4a634]/80 border-b border-border-subtle/20">Δ%</th>
            </tr>
          </thead>
          <tbody>
            {allKeys.map((key, i) => {
              const a = dataA?.[key] || {};
              const b = dataB?.[key] || {};
              return (
                <tr key={key} className={`border-b border-border-subtle/10 ${i % 2 !== 0 ? 'bg-white/[0.015]' : ''}`}>
                  <td className="px-4 py-2 text-xs font-medium text-content-secondary sticky left-0 bg-surface-secondary z-10 border-r border-border-subtle/10">{key}</td>
                  <td className="text-center px-2 py-2 tabular-nums text-xs text-content-primary border-l border-border-subtle/10">{a.leads || 0}</td>
                  <td className="text-center px-2 py-2 tabular-nums text-xs text-content-primary">{b.leads || 0}</td>
                  <DeltaCell value={delta(b.leads || 0, a.leads || 0)} />
                  <td className="text-center px-2 py-2 tabular-nums text-xs text-content-primary border-l border-border-subtle/10">{a.mqls || 0}</td>
                  <td className="text-center px-2 py-2 tabular-nums text-xs text-content-primary">{b.mqls || 0}</td>
                  <DeltaCell value={delta(b.mqls || 0, a.mqls || 0)} />
                  <td className="text-center px-2 py-2 tabular-nums text-xs text-content-primary border-l border-border-subtle/10">{a.sqls || 0}</td>
                  <td className="text-center px-2 py-2 tabular-nums text-xs text-content-primary">{b.sqls || 0}</td>
                  <DeltaCell value={delta(b.sqls || 0, a.sqls || 0)} />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DeltaCell({ value }) {
  if (value == null) return <td className="text-center px-2 py-2 text-xs text-content-tertiary/50">—</td>;
  const num = parseFloat(value);
  const color = num > 0 ? 'text-positive' : num < 0 ? 'text-negative' : 'text-content-tertiary';
  const prefix = num > 0 ? '+' : '';
  return <td className={`text-center px-2 py-2 tabular-nums text-xs font-medium ${color}`}>{prefix}{value}%</td>;
}

// ── Main DailyView ─────────────────────────────────────────────

export default function DailyView() {
  const { sourceFilter } = useMetrics();
  const [subView, setSubView] = useState('diario');

  return (
    <div>
      <div className="mb-6 flex justify-center">
        <PillTabs options={SUB_VIEWS} activeKey={subView} onKeyChange={setSubView} size="sm" />
      </div>

      {subView === 'diario' ? (
        <DailyBreakdown sourceFilter={sourceFilter} />
      ) : (
        <FunnelComparison sourceFilter={sourceFilter} />
      )}
    </div>
  );
}
