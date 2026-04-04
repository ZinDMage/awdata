import { useMemo } from 'react';
import EmptyState from '@/components/EmptyState';
import DonutChart from '@/components/DonutChart';
import LineChart from '@/components/LineChart';
import DualAxisChart from '@/components/DualAxisChart';
import { F } from '@/utils/formatters';

// FR101-FR103, UX-DR7: 4 gráficos SVG puros — Donut + Line + DualAxis x2
// Story 3.5: substitui stub por gráficos reais, mantém loading/error da Story 3.4

const MONTH_LABELS = { '01':'Jan','02':'Fev','03':'Mar','04':'Abr','05':'Mai','06':'Jun','07':'Jul','08':'Ago','09':'Set','10':'Out','11':'Nov','12':'Dez' };

function formatMonthLabel(isoMonth, years) {
  const [y, m] = isoMonth.split('-');
  const label = MONTH_LABELS[m] || m;
  return years.length > 1 ? `${label}/${y.slice(-2)}` : label;
}

// P5: guard NaN/Infinity
const fmtPct = (v) => (v == null || !isFinite(v)) ? '—' : v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';

// P2: safe max that handles empty arrays (avoids Math.max(...[]) → -Infinity)
const safeMax = (arr) => {
  const valid = arr.filter(v => v != null && isFinite(v));
  return valid.length ? Math.max(...valid) : 0;
};

const PLATFORM_SOURCES = ['Meta', 'Google'];

// Story 3.6: donutFilter + onDonutClick para drill-down (FR104, UX-DR18)
export default function KPIsADSCharts({ data, loading, error, comparisonMode, sourceFilter, years, donutFilter, onDonutClick }) {
  // P1: ALL hooks BEFORE early returns (React Rules of Hooks)

  // ── Single-source data extraction ──
  const donutData = useMemo(() => {
    if (!data?.totals) return null;
    // P6: consistent null guards with || 0
    const mqls = data.totals.mqls || 0;
    const sqls = data.totals.sqls || 0;
    const leads = data.totals.leads || 0;
    const naoQual = Math.max(0, leads - mqls - sqls);
    return [
      { label: 'MQL', value: mqls, color: '#007AFF' },
      { label: 'SQL', value: sqls, color: '#34C759' },
      { label: 'Não Qualificados', value: naoQual, color: '#8E8E93' },
    ].filter(s => s.value > 0 && isFinite(s.value));
  }, [data]);

  // Story 3.6: derive selectedIndex from donutFilter label → index in donutData
  const selectedDonutIndex = useMemo(() => {
    if (!donutFilter || !donutData) return null;
    const idx = donutData.findIndex(s => s.label === donutFilter);
    return idx >= 0 ? idx : null;
  }, [donutFilter, donutData]);

  const lineData = useMemo(() => {
    if (!data?.monthly?.length) return null;
    return {
      series: [{ label: 'Investimento', color: '#007AFF', data: data.monthly.map(m => m.spend) }],
      xLabels: data.monthly.map(m => formatMonthLabel(m.month, years)),
    };
  }, [data, years]);

  const conversionData = useMemo(() => {
    if (!data?.monthly?.length) return null;
    return {
      bars: { label: 'Convertidos (SQL)', color: '#34C759', data: data.monthly.map(m => m.sqls) },
      line: { label: '% Qualif. Marketing', color: '#FF9500', data: data.monthly.map(m => (m.qm ?? 0) * 100) },
      xLabels: data.monthly.map(m => formatMonthLabel(m.month, years)),
    };
  }, [data, years]);

  const cplCacData = useMemo(() => {
    if (!data?.monthly?.length) return null;
    return {
      bars: { label: 'CAC', color: '#FF453A', data: data.monthly.map(m => m.cac) },
      line: { label: 'CPL', color: '#AF52DE', data: data.monthly.map(m => m.cpl) },
      xLabels: data.monthly.map(m => formatMonthLabel(m.month, years)),
    };
  }, [data, years]);

  // ── Comparison mode data extraction (FR102) ──
  const comparisonCharts = useMemo(() => {
    if (!comparisonMode || !data?.timeline?.length || !data?.bySource) return null;
    const xLabels = data.timeline.map(t => formatMonthLabel(t.month, years));

    return PLATFORM_SOURCES.filter(s => data.bySource[s]).map(source => {
      const sourceTimeline = data.timeline.map(t => t.bySource?.[source] || {});
      const st = data.bySource[source];
      const naoQual = Math.max(0, (st.leads || 0) - (st.mqls || 0) - (st.sqls || 0));
      return {
        source,
        donut: [
          { label: 'MQL', value: st.mqls || 0, color: '#007AFF' },
          { label: 'SQL', value: st.sqls || 0, color: '#34C759' },
          { label: 'Não Qualificados', value: naoQual, color: '#8E8E93' },
        ].filter(s => s.value > 0 && isFinite(s.value)),
        line: { series: [{ label: 'Investimento', color: '#007AFF', data: sourceTimeline.map(m => m.spend ?? 0) }], xLabels },
        conversion: {
          bars: { label: 'SQL', color: '#34C759', data: sourceTimeline.map(m => m.sqls ?? 0) },
          line: { label: '% QM', color: '#FF9500', data: sourceTimeline.map(m => (m.qm ?? 0) * 100) },
          xLabels,
        },
        cplCac: {
          bars: { label: 'CAC', color: '#FF453A', data: sourceTimeline.map(m => m.cac ?? 0) },
          line: { label: 'CPL', color: '#AF52DE', data: sourceTimeline.map(m => m.cpl ?? 0) },
          xLabels,
        },
      };
    });
  }, [data, comparisonMode, years]);

  // Story 3.6: derive selectedIndex per platform for comparison mode
  // Review fix: moved after comparisonCharts declaration to avoid TDZ forward-reference
  const comparisonSelectedIndices = useMemo(() => {
    if (!donutFilter || !comparisonCharts?.length) return {};
    return Object.fromEntries(
      comparisonCharts.map(c => [
        c.source,
        c.donut.findIndex(s => s.label === donutFilter),
      ]).map(([src, idx]) => [src, idx >= 0 ? idx : null])
    );
  }, [donutFilter, comparisonCharts]);

  // P2: Global Y max for comparison (FR102 — mesma escala) — safe against empty arrays
  const globalMax = useMemo(() => {
    if (!comparisonCharts?.length) return {};
    return {
      spend: safeMax(comparisonCharts.flatMap(c => c.line.series[0].data)) || 1,
      sqls: safeMax(comparisonCharts.flatMap(c => c.conversion.bars.data)) || 1,
      qm: safeMax(comparisonCharts.flatMap(c => c.conversion.line.data)) || 1,
      cac: safeMax(comparisonCharts.flatMap(c => c.cplCac.bars.data)) || 1,
      cpl: safeMax(comparisonCharts.flatMap(c => c.cplCac.line.data)) || 1,
    };
  }, [comparisonCharts]);

  // P1: Early returns AFTER all hooks
  if (loading) return (
    <div className="min-h-[400px] flex items-center justify-center animate-pulse">
      <div className="h-8 w-48 rounded bg-surface-tertiary" />
    </div>
  );
  if (error) return (
    <div className="min-h-[400px] flex items-center justify-center">
      <EmptyState message={error} />
    </div>
  );

  // P7: Comparison mode ativo mas sem dados de plataformas disponíveis
  if (comparisonMode && comparisonCharts !== null && !comparisonCharts.length) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <EmptyState message="Dados por source indisponíveis para comparação" />
      </div>
    );
  }

  // D2: Comparison mode layout — agrupado por plataforma (AC #3)
  if (comparisonMode && comparisonCharts?.length) {
    return (
      <div className="grid grid-cols-1 gap-6">
        {comparisonCharts.map(({ source, donut, line, conversion, cplCac }) => (
          <div key={source}>
            <p className="text-sm font-semibold text-content-primary mb-3">{source}</p>
            <div className="grid grid-cols-2 gap-3">
              <ChartCard title="Composição de Leads">
                {donut.length ? <DonutChart segments={donut} onSegmentClick={onDonutClick} selectedIndex={comparisonSelectedIndices[source]} /> : <EmptyState message="Nenhum dado disponível" />}
              </ChartCard>
              <ChartCard title="Evolução Investimento" legend={[{ label: 'Investimento', color: '#007AFF' }]}>
                <LineChart {...line} yFormat={v => F.ri(v)} yMax={globalMax.spend} />
              </ChartCard>
              <ChartCard title="Conversão" legend={[{ label: 'SQL', color: '#34C759' }, { label: '% QM', color: '#FF9500' }]}>
                <DualAxisChart {...conversion} yLeftFormat={v => F.n(v)} yRightFormat={fmtPct} yLeftMax={globalMax.sqls} yRightMax={globalMax.qm} />
              </ChartCard>
              <ChartCard title="CPL / CAC" legend={[{ label: 'CAC', color: '#FF453A' }, { label: 'CPL', color: '#AF52DE' }]}>
                <DualAxisChart {...cplCac} yLeftFormat={v => F.ri(v)} yRightFormat={v => F.ri(v)} yLeftMax={globalMax.cac} yRightMax={globalMax.cpl} />
              </ChartCard>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ── Single-source layout (AC #1) — grid 2x2 ──
  return (
    <div className="grid grid-cols-2 gap-4">
      <ChartCard title="Composição de Leads">
        {donutData?.length ? <DonutChart segments={donutData} onSegmentClick={onDonutClick} selectedIndex={selectedDonutIndex} /> : <EmptyState message="Nenhum dado disponível" />}
      </ChartCard>

      <ChartCard title="Evolução Investimento" legend={[{ label: 'Investimento', color: '#007AFF' }]}>
        {lineData ? <LineChart {...lineData} yFormat={v => F.ri(v)} /> : <EmptyState message="Nenhum dado disponível" />}
      </ChartCard>

      <ChartCard title="Conversão" legend={[{ label: 'Convertidos (SQL)', color: '#34C759' }, { label: '% Qualif. Marketing', color: '#FF9500' }]}>
        {conversionData ? <DualAxisChart {...conversionData} yLeftFormat={v => F.n(v)} yRightFormat={fmtPct} /> : <EmptyState message="Nenhum dado disponível" />}
      </ChartCard>

      <ChartCard title="CPL / CAC" legend={[{ label: 'CAC', color: '#FF453A' }, { label: 'CPL', color: '#AF52DE' }]}>
        {cplCacData ? <DualAxisChart {...cplCacData} yLeftFormat={v => F.ri(v)} yRightFormat={v => F.ri(v)} /> : <EmptyState message="Nenhum dado disponível" />}
      </ChartCard>
    </div>
  );
}

// ── ChartCard wrapper — card container + título + legenda (AC #1) ──
function ChartCard({ title, legend, children }) {
  return (
    <div className="bg-surface-secondary rounded-card p-6 border border-border-subtle/20">
      <p className="text-sm font-medium text-content-primary mb-4">{title}</p>
      {children}
      {legend && (
        <div className="flex items-center gap-4 mt-3 text-xs text-content-tertiary">
          {legend.map(({ label, color }) => (
            <span key={label} className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
              {label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
