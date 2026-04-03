import { useState, useCallback, useEffect } from 'react';
import EmptyState from '@/components/EmptyState';
import KPIsADSTable from '@/components/KPIsADSTable';
import KPIsADSCharts from '@/components/KPIsADSCharts';

// FR92, AD-V3-6: props puras — NÃO consome context diretamente
// Story 3-2: signature atualizada para receber data/loading/error (já passadas pelo MarketingView)
// Story 2-4: toggle Análise/Gráficos migrou para MarketingHeader
// Story 3-4: fade transition 150ms entre analysis/charts, KPIsADSCharts stub
// Story 3-6: donutFilter state — owner do drill-down (FR104, UX-DR18)
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

        {/* Story 3.3: Single-source breakdown (comparisonMode=false) — placeholder */}
        {analysisMode === 'analysis' && !comparisonMode && (
          <EmptyState message="Análise por source individual — disponível em breve" />
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
