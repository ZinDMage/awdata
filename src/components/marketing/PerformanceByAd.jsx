import { useMemo } from 'react';
import EmptyState from '@/components/EmptyState';
import ScoreBadge from '@/components/marketing/ScoreBadge';
import { F } from '@/utils/formatters';

// FR115-FR116: Listagem flat de anúncios + Score Eficiência
// AD-V3-6: props puras — NÃO consome context diretamente

// ── Definição de Colunas ──

const COLUMNS = [
  { key: 'ad_name',                  label: 'Anúncio',        fmt: null,  sticky: true },
  { key: 'campaign_name',            label: 'Campanha',       fmt: null },
  { key: 'source',                   label: 'Source',         fmt: null,  badge: true },
  { key: '_period',                  label: 'Período',        fmt: null },
  { key: 'total_spend',              label: 'Investido',      fmt: F.r2,  defaultSort: true },
  { key: 'impressions',              label: 'Impressões',     fmt: F.n },
  { key: 'cpm',                      label: 'CPM',            fmt: F.r2 },
  { key: 'cpc',                      label: 'CPC',            fmt: F.r2 },
  { key: 'ctr',                      label: 'CTR',            fmt: F.p },
  { key: 'unique_clicks',            label: 'Cliques Únicos', fmt: F.n },
  { key: 'unique_landing_page_view', label: 'Landing Pages',  fmt: F.n },
  { key: 'mql',                      label: 'MQL',            fmt: F.n },
  { key: 'sql',                      label: 'SQL',            fmt: F.n },
  { key: 'custoMQL',                 label: 'Custo/MQL',      fmt: F.r2 },
  { key: 'custoSQL',                 label: 'Custo/SQL',      fmt: F.r2 },
  { key: '_score',                   label: 'Score',          fmt: null },
];

// ── Helpers ──

function SourceBadge({ source }) {
  const isMeta = source === 'meta';
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
      isMeta ? 'bg-blue-500/15 text-blue-400' : 'bg-emerald-500/15 text-emerald-400'
    }`}>
      {isMeta ? 'Meta' : 'Google'}
    </span>
  );
}

function ScoreCell({ ad }) {
  const { score } = ad.scoreEficiencia ?? { score: 0 };
  const spend = ad.total_spend ?? 0;
  const sql = ad.sql ?? 0;
  const vendas = 0; // vendas ainda não atribuídas nesta fase

  return (
    <div className="group relative inline-flex">
      <ScoreBadge score={score} showTooltip={false} />
      <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-20
        bg-surface-primary border border-border-subtle/30 rounded-lg shadow-lg px-3 py-2
        text-xs text-content-secondary whitespace-nowrap">
        <p className="font-medium text-content-primary mb-1">Score: {score.toFixed(1)}</p>
        <p className="opacity-70">(SQL × 0.4 + Vendas × 0.6) / Investido × 1000</p>
        <p className="opacity-70">= ({sql} × 0.4 + {vendas} × 0.6) / {F.r2(spend)} × 1000</p>
      </div>
    </div>
  );
}

function getCellValue(ad, col) {
  if (col.key === '_period') {
    return `${F.date(ad.date_start)} – ${F.date(ad.date_end)}`;
  }
  if (col.key === '_score' || col.key === 'source') return null; // rendered specially
  const val = ad[col.key];
  if (col.fmt) return col.fmt(val);
  return val ?? '—';
}

// ── Componente Principal ──

export default function PerformanceByAd({
  ads,
  totalAds,
  pageAds,
  setPageAds,
  comparisonMode,
  sourceFilter,
  loading,
}) {
  // AC #5: Paginação server-side com 25 por página
  const totalPages = useMemo(() => Math.ceil((totalAds ?? 0) / 25), [totalAds]);

  // Loading skeleton (já implementado no stub — manter pattern exato)
  if (loading) return <div className="animate-pulse h-64 bg-surface-secondary/50 rounded-xl" />;

  // AC #7: Empty state contextual
  if (!ads || ads.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <EmptyState message="Nenhum anúncio encontrado para os filtros selecionados" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* AC #1, #2: Tabela flat com todas as colunas */}
      <div className="overflow-x-auto rounded-xl border border-border-subtle/20">
        <table
          className="w-full text-sm text-left"
          aria-label="Tabela de performance por anúncio"
        >
          <thead>
            <tr className="sticky top-0 bg-surface-primary z-10">
              {COLUMNS.map(col => (
                <th
                  key={col.key}
                  className="px-4 py-3 whitespace-nowrap text-xs uppercase text-content-tertiary font-medium"
                  {...(col.defaultSort ? { 'aria-sort': 'descending' } : {})}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ads.map((ad, i) => (
              <tr
                key={`${ad.source}-${ad.ad_id ?? i}`}
                className="border-t border-border-subtle/10 hover:bg-surface-secondary/50 transition-colors duration-150"
              >
                {COLUMNS.map(col => (
                  <td
                    key={col.key}
                    className={`px-4 py-3 whitespace-nowrap ${
                      col.sticky
                        ? 'text-content-primary font-medium max-w-[200px] truncate'
                        : col.key === 'campaign_name'
                          ? 'text-content-primary font-medium max-w-[200px] truncate'
                          : 'text-content-primary tabular-nums'
                    }`}
                  >
                    {col.key === '_score' ? (
                      <ScoreCell ad={ad} />
                    ) : col.badge ? (
                      <SourceBadge source={ad.source} />
                    ) : (
                      getCellValue(ad, col)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* AC #5: Paginação server-side */}
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm text-content-secondary">
          {F.n(totalAds)} anúncios
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPageAds(pageAds - 1)}
            disabled={pageAds <= 1}
            className="px-3 py-1.5 text-sm rounded-lg bg-surface-secondary hover:bg-surface-secondary/80 text-content-primary transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Página anterior"
            aria-disabled={pageAds <= 1}
          >
            Anterior
          </button>
          <span className="text-sm text-content-secondary tabular-nums">
            {pageAds} / {totalPages}
          </span>
          <button
            onClick={() => setPageAds(pageAds + 1)}
            disabled={pageAds >= totalPages}
            className="px-3 py-1.5 text-sm rounded-lg bg-surface-secondary hover:bg-surface-secondary/80 text-content-primary transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Próxima página"
            aria-disabled={pageAds >= totalPages}
          >
            Próxima
          </button>
        </div>
      </div>
    </div>
  );
}
