import { useState, useMemo } from 'react';
// FR120: Date range picker independente do filtro global
import EmptyState from '@/components/EmptyState';
import LineChart from '@/components/marketing/LineChart';
import { F } from '@/utils/formatters';

// FR117-FR118: Tabela day-by-day + gráfico de tendência diária
// AD-V3-6: props puras — NÃO consome context diretamente

// ── Definição de Colunas (FR117) ──

const COLUMNS = [
  { key: 'date',                      label: 'Data',            fmt: F.date },
  { key: 'source',                    label: 'Source',          fmt: null, badge: true },
  { key: 'total_spend',               label: 'Investido',      fmt: F.r2 },
  { key: 'impressions',               label: 'Impressões',     fmt: F.n },
  { key: 'reach',                     label: 'Alcance',        fmt: F.n },
  { key: 'frequency',                 label: 'Frequência',     fmt: F.x },
  { key: 'cpm',                       label: 'CPM',            fmt: F.r2 },
  { key: 'cpc',                       label: 'CPC',            fmt: F.r2 },
  { key: 'ctr',                       label: 'CTR',            fmt: F.p },
  { key: 'unique_clicks',             label: 'Cliques Únicos', fmt: F.n },
  { key: 'unique_landing_page_view',  label: 'Landing Pages',  fmt: F.n },
];

const PAGE_SIZE = 30;

// ── Helpers ──

function SourceBadge({ source }) {
  if (source === 'meta') return (
    <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-blue-500/15 text-blue-400">Meta</span>
  );
  if (source === 'google') return (
    <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/15 text-emerald-400">Google</span>
  );
  return (
    <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-gray-500/15 text-gray-400">{source ?? '—'}</span>
  );
}

function getCellValue(row, col) {
  if (col.badge) return null; // rendered specially
  const val = row[col.key];
  if (col.fmt) return col.fmt(val);
  return val ?? '—';
}

// ── Componente Principal ──

export default function PerformanceDaily({
  daily,
  anomalies,
  performanceDateRange,
  setPerformanceDateRange,
  comparisonMode,
  sourceFilter,
  loading,
}) {
  const [page, setPage] = useState(1);

  // FR120: Display range — usa performanceDateRange se setado, senão ultimos 30 dias
  const displayRange = useMemo(() => {
    if (performanceDateRange?.startDate && performanceDateRange?.endDate) {
      return performanceDateRange;
    }
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - 30);
    const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { startDate: fmt(start), endDate: fmt(now) };
  }, [performanceDateRange]);

  // Reset page to 1 when daily data changes (e.g., date range picker changed)
  const dailyLen = daily?.length ?? 0;
  const [prevDailyLen, setPrevDailyLen] = useState(dailyLen);
  if (dailyLen !== prevDailyLen) {
    setPrevDailyLen(dailyLen);
    setPage(1);
  }

  // AC #2: Reverter ordem (mais recente primeiro) + paginação client-side (AC #5)
  // Clamp page para evitar flicker de 1 frame quando daily muda (AC #6)
  const { paginatedData, totalPages, totalRows, safePage } = useMemo(() => {
    if (!daily || daily.length === 0) return { paginatedData: [], totalPages: 0, totalRows: 0 };
    const reversed = [...daily].reverse();
    const tp = Math.ceil(reversed.length / PAGE_SIZE);
    const safePage = Math.min(page, Math.max(1, tp));
    const start = (safePage - 1) * PAGE_SIZE;
    return {
      paginatedData: reversed.slice(start, start + PAGE_SIZE),
      totalPages: tp,
      totalRows: reversed.length,
      safePage,
    };
  }, [daily, page]);

  // AC #3, #4: Agregar daily por data para o gráfico de tendência (FR118)
  const { chartSeries, chartLabels } = useMemo(() => {
    if (!daily || daily.length === 0) return { chartSeries: [], chartLabels: [] };
    const byDate = {};
    for (const row of daily) {
      if (!byDate[row.date]) {
        byDate[row.date] = { spend: 0, clicks: 0, landingPages: 0 };
      }
      byDate[row.date].spend += row.total_spend || 0;
      byDate[row.date].clicks += row.unique_clicks || 0;
      byDate[row.date].landingPages += row.unique_landing_page_view || 0;
    }
    const sorted = Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b));
    return {
      chartSeries: [
        {
          data: sorted.map(([, v]) => v.spend),
          color: '#007AFF',
          label: 'Investido',
          formatValue: F.r2,
        },
        {
          data: sorted.map(([, v]) => v.clicks),
          color: '#FF9500',
          label: 'Cliques',
          formatValue: F.n,
        },
        {
          data: sorted.map(([, v]) => v.landingPages),
          color: '#34C759',
          label: 'Landing Pages',
          formatValue: F.n,
        },
      ],
      chartLabels: sorted.map(([date]) => F.date(date)),
    };
  }, [daily]);

  // FR119: Anomaly lookup map (date → anomaly)
  const anomalyMap = useMemo(() => {
    if (!anomalies || anomalies.length === 0) return new Map();
    return new Map(anomalies.map(a => [a.date, a]));
  }, [anomalies]);

  const { totalAnomalies, redCount, greenCount } = useMemo(() => {
    if (anomalyMap.size === 0) return { totalAnomalies: 0, redCount: 0, greenCount: 0 };
    let red = 0, green = 0;
    for (const a of anomalyMap.values()) {
      if (a.type === 'high-spend-no-conversion') red++;
      else if (a.type === 'low-cpl') green++;
    }
    return { totalAnomalies: red + green, redCount: red, greenCount: green };
  }, [anomalyMap]);

  // Loading skeleton
  if (loading) return <div className="animate-pulse h-64 bg-surface-secondary/50 rounded-xl" />;

  // AC #7: Empty state
  if (!daily || daily.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <EmptyState message="Nenhum dado diário encontrado para os filtros selecionados" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* FR120, UX-DR16: Date range picker independente do filtro global */}
      <div
        className="flex items-center gap-3"
        role="group"
        aria-label="Seletor de periodo"
      >
        <span className="text-sm text-content-secondary font-medium">Período:</span>
        <input
          type="date"
          value={displayRange.startDate}
          onChange={e => {
            const newStart = e.target.value;
            if (!newStart) return; // guard: user cleared the input
            const end = displayRange.endDate;
            setPerformanceDateRange({
              startDate: newStart,
              endDate: newStart > end ? newStart : end,
            });
          }}
          className="bg-surface-secondary border border-border-subtle/20 rounded-lg px-3 py-1.5 text-sm text-content-primary"
          aria-label="Data inicio"
        />
        <span className="text-content-tertiary mx-1">→</span>
        <input
          type="date"
          value={displayRange.endDate}
          onChange={e => {
            const newEnd = e.target.value;
            if (!newEnd) return; // guard: user cleared the input
            const start = displayRange.startDate;
            setPerformanceDateRange({
              startDate: newEnd < start ? newEnd : start,
              endDate: newEnd,
            });
          }}
          className="bg-surface-secondary border border-border-subtle/20 rounded-lg px-3 py-1.5 text-sm text-content-primary"
          aria-label="Data fim"
        />
      </div>

      {/* FR119: Anomaly summary banner */}
      {totalAnomalies > 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-surface-secondary border border-border-subtle/20 text-sm">
          <span className="text-content-secondary">
            {totalAnomalies} {totalAnomalies === 1 ? 'dia com anomalia detectada' : 'dias com anomalias detectadas'}
          </span>
          {redCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-500/10 text-red-400 text-xs font-medium">
              {redCount} {redCount === 1 ? 'vermelho' : 'vermelhos'}
            </span>
          )}
          {greenCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-green-500/10 text-green-400 text-xs font-medium">
              {greenCount} {greenCount === 1 ? 'verde' : 'verdes'}
            </span>
          )}
        </div>
      )}

      {/* AC #3, #4: Gráfico de tendência diária (FR118) */}
      <div className="h-64 bg-surface-secondary rounded-xl p-4 border border-border-subtle/20 relative">
        <LineChart
          series={chartSeries}
          xLabels={chartLabels}
          yFormat={F.r2}
          height={224}
        />
      </div>

      {/* AC #1, #2: Tabela day-by-day (FR117) */}
      <div className="overflow-x-auto rounded-xl border border-border-subtle/20">
        <table
          className="w-full text-sm text-left"
          aria-label="Tabela de performance diária"
        >
          <thead>
            <tr className="sticky top-0 bg-surface-primary z-10">
              <th className="px-2 py-3 w-8" aria-label="Status de anomalia" />
              {COLUMNS.map(col => (
                <th
                  key={col.key}
                  className="px-4 py-3 whitespace-nowrap text-xs uppercase text-content-tertiary font-medium"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedData.map((row, i) => {
              const anomaly = anomalyMap.get(row.date);
              const isRed = anomaly?.type === 'high-spend-no-conversion';
              const isGreen = anomaly?.type === 'low-cpl';
              const isFirstRowForDate = i === 0 || paginatedData[i - 1]?.date !== row.date;
              return (
                <tr
                  key={`${row.date}-${row.source}-${i}`}
                  className={`border-t border-border-subtle/10 transition-colors duration-150 motion-reduce:transition-none ${
                    isRed ? 'bg-red-500/10' :
                    isGreen ? 'bg-green-500/10 hover:bg-green-500/15' :
                    'hover:bg-surface-secondary/50'
                  }`}
                  {...(isRed && isFirstRowForDate ? { role: 'alert' } : {})}
                >
                  {/* FR119: Coluna Status (ícone anomalia) — UX-DR15 */}
                  <td className="px-2 py-3 w-8 text-center">
                    {isRed && isFirstRowForDate && (
                      <svg className="w-4 h-4 text-red-400 inline-block" viewBox="0 0 20 20" fill="currentColor" role="img">
                        <title>{anomaly.message}</title>
                        <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                      </svg>
                    )}
                    {isGreen && isFirstRowForDate && (
                      <svg className="w-4 h-4 text-green-400 inline-block" viewBox="0 0 20 20" fill="currentColor" role="img">
                        <title>{anomaly.message}</title>
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                      </svg>
                    )}
                  </td>
                  {COLUMNS.map(col => (
                    <td
                      key={col.key}
                      className={`px-4 py-3 whitespace-nowrap ${
                        col.key === 'date'
                          ? 'text-content-primary font-medium'
                          : 'text-content-primary tabular-nums'
                      }`}
                    >
                      {col.badge ? (
                        <SourceBadge source={row.source} />
                      ) : (
                        getCellValue(row, col)
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* AC #5: Paginação client-side */}
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm text-content-secondary">
          {F.n(totalRows)} registros
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="px-3 py-1.5 text-sm rounded-lg bg-surface-secondary hover:bg-surface-tertiary transition-colors duration-150 motion-reduce:transition-none disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Página anterior"
              aria-disabled={safePage <= 1}
            >
              Anterior
            </button>
            <span className="text-sm text-content-secondary tabular-nums">
              {safePage} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="px-3 py-1.5 text-sm rounded-lg bg-surface-secondary hover:bg-surface-tertiary transition-colors duration-150 motion-reduce:transition-none disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Próxima página"
              aria-disabled={safePage >= totalPages}
            >
              Próxima
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
