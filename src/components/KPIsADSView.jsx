import { useState, useCallback, useEffect, useMemo } from 'react';
import EmptyState from '@/components/EmptyState';
import KPIsADSTable from '@/components/KPIsADSTable';
import KPIsADSCharts from '@/components/KPIsADSCharts';
import MetricsTable from '@/components/MetricsTable';
import { res } from '@/utils/formatters';
import { prevM } from '@/utils/calculations';

// ── Story 3.3: Adapter flat → nested para MetricsTable ──
const ISO_TO_PTBR = { '01':'jan','02':'fev','03':'mar','04':'abr','05':'mai','06':'jun','07':'jul','08':'ago','09':'set','10':'out','11':'nov','12':'dez' };
const PTBR_LABELS = { jan:'Jan',fev:'Fev',mar:'Mar',abr:'Abr',mai:'Mai',jun:'Jun',jul:'Jul',ago:'Ago',set:'Set',out:'Out',nov:'Nov',dez:'Dez' };

function toPtBrKey(isoMonth) {
  const [y, m] = isoMonth.split('-');
  return `${y}-${ISO_TO_PTBR[m]}`;
}

function flatToNested(m) {
  return {
    g: {
      rec: m.revenue || 0,
      gAds: m.spend || 0,
      roi: m.roas || 0,
      mc: null,
      pipe: null,
      fatP: null,
      recP: null,
      vendas: m.sales || 0,
      tmf: m.sales > 0 ? (m.revenue || 0) / m.sales : null,
    },
    p: {
      ctr: m.ctr || null,
      cr: m.cr || null,
      cc: m.cc || null,
      qm: m.qm || null,
      qs: null,
      ag: null,
      su: null,
      fc: null,
      fs: null,
    },
    n: {
      imp: m.impressions || 0,
      cli: m.clicks || 0,
      vp: m.pageViews || 0,
      ld: m.leads || 0,
      mql: m.mqls || 0,
      sql: m.sqls || 0,
      rAg: m.reunioes || 0,
      rRe: null,
      v: m.sales || 0,
    },
    f: {
      gAds: m.spend || 0,
      cpL: m.cpl || null,
      cpM: m.cpmql || null,
      cpS: m.cpsql || null,
      cpRA: m.cpreuniao || null,
      cpRR: null,
      cpV: m.cac || null,
    },
    dt: {
      ms: null,
      sr: null,
      rv: null,
      lv: null,
    },
  };
}

// FR92, AD-V3-6: props puras — NÃO consome context diretamente
// Story 3-2: signature atualizada para receber data/loading/error (já passadas pelo MarketingView)
// Story 2-4: toggle Análise/Gráficos migrou para MarketingHeader
// Story 3-4: fade transition 150ms entre analysis/charts, KPIsADSCharts stub
// Story 3-6: donutFilter state — owner do drill-down (FR104, UX-DR18)
// Story 3-3: MetricsTable reuso single-source com adapter (FR98, AD-V3-7)
export default function KPIsADSView({
  analysisMode,
  comparisonMode,
  sourceFilter,
  years,
  sM,
  selectedFunnels,
  data,
  loading,
  error,
  dk,
}) {
  // Story 3.6: Donut drill-down filter state
  const [donutFilter, setDonutFilter] = useState(null);

  // AC #2: toggle — clicar mesmo segmento remove filtro
  const handleDonutClick = useCallback((label) => {
    setDonutFilter(prev => prev === label ? null : label);
  }, []);

  // AC #3: reset ao entrar em modo Gráficos (estado limpo)
  useEffect(() => {
    if (analysisMode === 'charts') setDonutFilter(null);
  }, [analysisMode]);

  // Review fix: reset donutFilter when data context changes to prevent stale filter
  useEffect(() => {
    setDonutFilter(null);
  }, [comparisonMode, sourceFilter]);

  // Story 3.3: adapter flat → nested para MetricsTable (FR98, AD-V3-7)
  const adapted = useMemo(() => {
    if (!data || comparisonMode) return null;
    const { totals, monthly } = data;
    if (!monthly || !totals) return null;

    const tableData = {};
    for (const entry of monthly) {
      const key = toPtBrKey(entry.month);
      tableData[key] = flatToNested(entry);
    }

    const isMultiYear = years.length > 1;
    const colKeys = monthly.map(e => toPtBrKey(e.month));
    const colLabels = monthly.map(e => {
      const [y, m] = e.month.split('-');
      const ptbr = ISO_TO_PTBR[m];
      return isMultiYear ? `${PTBR_LABELS[ptbr]}/${y.slice(-2)}` : PTBR_LABELS[ptbr];
    });

    const aggData = flatToNested(totals);
    const getCV = (colKey, rowPath) => res(tableData[colKey], rowPath);

    return { tableData, aggData, colKeys, colLabels, getCV };
  }, [data, comparisonMode, years]);

  return (
    <div className="flex flex-col gap-6 min-h-[400px]">
      <div key={analysisMode} className="animate-fade-in">
        {/* FR96, FR97: Tabela comparativa quando analysisMode=analysis e comparisonMode=true */}
        {analysisMode === 'analysis' && comparisonMode && (
          <KPIsADSTable
            data={data}
            loading={loading}
            error={error}
            donutFilter={donutFilter}
            onClearDonutFilter={() => setDonutFilter(null)}
          />
        )}

        {/* Story 3.3: Single-source breakdown mensal via MetricsTable (FR98, AD-V3-7) */}
        {analysisMode === 'analysis' && !comparisonMode && adapted && (
          <MetricsTable
            data={adapted.tableData}
            aggData={adapted.aggData}
            colKeys={adapted.colKeys}
            colLabels={adapted.colLabels}
            mode="multi"
            sM={sM}
            year={years[0]}
            dk={dk}
            getCV={adapted.getCV}
            prevM={prevM}
          />
        )}
        {analysisMode === 'analysis' && !comparisonMode && !adapted && !loading && (
          <EmptyState message="Sem dados de ads para o período selecionado" />
        )}

        {/* FR101-FR103, UX-DR7: Gráficos mode */}
        {analysisMode === 'charts' && (
          <KPIsADSCharts
            data={data}
            loading={loading}
            error={error}
            comparisonMode={comparisonMode}
            sourceFilter={sourceFilter}
            years={years}
            donutFilter={donutFilter}
            onDonutClick={handleDonutClick}
          />
        )}
      </div>
    </div>
  );
}
