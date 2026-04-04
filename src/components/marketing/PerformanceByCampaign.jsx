import { Fragment } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { F } from '@/utils/formatters'
import EmptyState from '@/components/EmptyState'
import { PAGE_SIZE } from '@/hooks/marketing/usePerformanceCampaign'

// ── Column Definitions — UX-DR10 Progressive Columns ────────────────
// Level 0 = Campaign (8 cols), Level 1 = AdSet (12), Level 2 = Ad (16) // FR109-FR112
const COLS = [
  { key: 'name',                     label: 'Nome',           minLevel: 0 },
  { key: 'source',                   label: 'Source',         minLevel: 0 },
  { key: 'period',                   label: 'Período',        minLevel: 0 },
  { key: 'total_spend',              label: 'Investido',      minLevel: 0, fmt: F.r2,  num: true },
  { key: 'impressions',              label: 'Impressões',     minLevel: 0, fmt: F.n,   num: true },
  { key: 'cpc',                      label: 'CPC',            minLevel: 0, fmt: F.r2,  num: true },
  { key: 'ctr',                      label: 'CTR',            minLevel: 0, fmt: F.p,   num: true },
  { key: 'unique_clicks',            label: 'Cliques Únicos', minLevel: 0, fmt: F.n,   num: true },
  { key: 'reach',                    label: 'Alcance',        minLevel: 1, fmt: F.n,   num: true },
  { key: 'frequency',                label: 'Frequência',     minLevel: 1, fmt: F.x,   num: true },
  { key: 'cpm',                      label: 'CPM',            minLevel: 1, fmt: F.r2,  num: true },
  { key: 'unique_landing_page_view', label: 'Views Página',   minLevel: 1, fmt: F.n,   num: true },
  { key: 'mql',                      label: 'MQL',            minLevel: 2, fmt: F.n,   num: true },
  { key: 'sql',                      label: 'SQL',            minLevel: 2, fmt: F.n,   num: true },
  { key: 'custoMQL',                 label: 'Custo MQL',      minLevel: 2, fmt: F.r2,  num: true },
  { key: 'custoSQL',                 label: 'Custo SQL',      minLevel: 2, fmt: F.r2,  num: true },
]

const EASE = [0.4, 0, 0.2, 1] // UX-DR20: cubic-bezier Apple
const T300 = { duration: 0.3, ease: EASE }

// ── Helpers ─────────────────────────────────────────────────────────

function entityName(row, level) {
  if (level === 2) return row.ad_name
  if (level === 1) return row.adset_name
  return row.campaign_name
}

function fmtPeriod(row) {
  if (!row.date_start) return null
  const s = F.date(row.date_start)
  const e = F.date(row.date_end)
  return s === e ? s : `${s} — ${e}`
}

function cellValue(col, row, level) {
  if (col.minLevel > level) return null // column not applicable at this level
  if (col.key === 'name') return entityName(row, level)
  if (col.key === 'source') return row.source ? row.source.charAt(0).toUpperCase() + row.source.slice(1) : null
  if (col.key === 'period') return fmtPeriod(row)
  const v = row[col.key]
  return col.fmt ? col.fmt(v) : v
}

// AC4: Keyboard navigation — Arrow Right/Left expand/collapse, Enter/Space toggle
function handleKeyDown(e, toggleFn, isExpanded) {
  if (e.key === 'ArrowRight' && !isExpanded) { e.preventDefault(); toggleFn() }
  else if (e.key === 'ArrowLeft' && isExpanded) { e.preventDefault(); toggleFn() }
  else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleFn() }
}

// ── Sub-components ──────────────────────────────────────────────────

/** Renders all 16 data cells for a row at the given level */
function renderCells(row, level) {
  return COLS.map(col => {
    const val = cellValue(col, row, level)
    const hidden = col.minLevel > level
    const isName = col.key === 'name'
    const indent = isName ? (level === 2 ? 'pl-12' : level === 1 ? 'pl-6' : '') : ''

    return (
      <td
        key={col.key}
        className={`px-3 py-2.5 text-sm whitespace-nowrap ${indent} ${
          col.num ? 'text-right tabular-nums font-mono' : 'text-left'
        } ${hidden ? 'invisible' : ''} ${
          isName ? 'font-medium' : ''
        } ${(val == null || val === '—') && !hidden ? 'text-content-tertiary' : 'text-content-primary'}`}
      >
        {hidden ? '' : (val ?? '—')}
      </td>
    )
  })
}

/** Skeleton placeholder rows during drill-down loading — AC5 */
function SkeletonRows({ count = 2 }) {
  return Array.from({ length: count }, (_, i) => (
    <tr key={`skel-${i}`}>
      <td colSpan={COLS.length + 1} className="px-3 py-2">
        <div className="h-9 animate-pulse bg-surface-secondary/50 rounded" />
      </td>
    </tr>
  ))
}

// ── Main Component ──────────────────────────────────────────────────
// FR109-FR114: Drill-down Campanha → AdSet → Ad
// AD-V3-6: props puras — NÃO consome context diretamente
export default function PerformanceByCampaign({
  campaigns,
  total,
  page,
  setPage,
  comparisonMode,
  sourceFilter,
  loading,
  error, // S5: erro de RPC/rede para exibir ao usuário
  degradedCount, // FR129: campanhas com atribuição UTM falha
  expandedCampaigns,
  expandedAdSets,
  toggleCampaign,
  toggleAdSet,
}) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // AC5: Loading state — initial load only (no campaigns yet)
  if (loading && !campaigns?.length) return <div className="animate-pulse h-64 bg-surface-secondary/50 rounded-xl" />

  // S5: Error state — falha de RPC/rede exibida ao usuário
  if (error && !campaigns?.length) {
    return (
      <div className="bg-surface-secondary rounded-2xl border border-border-subtle/20 p-6">
        <div role="alert" className="px-4 py-3 rounded-lg bg-red-500/15 border border-red-500/30 flex items-start gap-2">
          <span className="text-sm text-red-400 leading-relaxed">
            Erro ao carregar campanhas — verifique sua conexão e tente novamente
          </span>
        </div>
      </div>
    )
  }

  // AC5: Empty state
  if (!campaigns?.length) {
    return <EmptyState message="Nenhuma campanha encontrada para o período selecionado" />
  }

  return (
    <div className="bg-surface-secondary rounded-2xl border border-border-subtle/20 overflow-hidden">
      {/* FR129: Warning amarelo — atribuição indisponível (UX-DR14) */}
      {degradedCount > 0 && (
        <div
          role="alert"
          className="mx-4 mt-4 px-4 py-3 rounded-lg bg-[#FFD60A]/15 border border-[#FFD60A]/30 flex items-start gap-2"
        >
          <span className="text-sm text-[#FFD60A] leading-relaxed">
            Atribuição indisponível para {degradedCount} {degradedCount === 1 ? 'campanha' : 'campanhas'} — métricas de funil não disponíveis
          </span>
        </div>
      )}
      {/* AC2: Stale-while-revalidate — keep content visible with reduced opacity during page change */}
      <div className={`overflow-x-auto transition-opacity duration-200 ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
        <table role="treegrid" className="w-full">
          {/* AC1: Sticky header with all 16 column names */}
          <thead>
            <tr className="bg-surface-tertiary/30 sticky top-0 z-10 border-b border-border-subtle/20">
              <th className="w-10 px-2 py-3" aria-label="Expandir" />
              {COLS.map(col => (
                <th
                  key={col.key}
                  className={`px-3 py-3 text-[10px] font-bold uppercase tracking-wider text-content-tertiary whitespace-nowrap ${
                    col.num ? 'text-right' : 'text-left'
                  }`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {campaigns.map(campaign => {
              const cId = String(campaign.campaign_id)
              const cState = expandedCampaigns?.[cId]
              const cOpen = !!cState
              const cToggle = () => toggleCampaign?.(campaign.campaign_id, campaign.source)

              return (
                <Fragment key={cId}>
                  {/* ── Campaign Row — Level 0 ── */}
                  <tr
                    role="row"
                    aria-level={1}
                    aria-expanded={cOpen}
                    tabIndex={0}
                    onClick={cToggle}
                    onKeyDown={e => handleKeyDown(e, cToggle, cOpen)}
                    className={`border-b border-border-subtle/10 transition-colors cursor-pointer hover:bg-surface-secondary/30 ${
                      cOpen ? 'bg-surface-secondary/20' : ''
                    }`}
                  >
                    <td className="w-10 px-2 py-2.5 text-center">
                      <motion.div animate={{ rotate: cOpen ? 90 : 0 }} transition={T300}>
                        <ChevronRight className="h-4 w-4 text-content-tertiary mx-auto" />
                      </motion.div>
                    </td>
                    {renderCells(campaign, 0)}
                  </tr>

                  {/* AC5: Loading skeleton while fetching adsets */}
                  {cOpen && cState.loading && <SkeletonRows />}

                  {/* AC5: Empty state — no adsets found */}
                  {cOpen && !cState.loading && !cState.adsets?.length && (
                    <tr>
                      <td />
                      <td colSpan={COLS.length} className="pl-6 py-3 text-sm text-content-tertiary italic">
                        Nenhum ad set encontrado
                      </td>
                    </tr>
                  )}

                  {/* AC2: AdSet rows + AC3: Ad rows (flattened for AnimatePresence) */}
                  <AnimatePresence initial={false}>
                    {cOpen && !cState.loading && (cState.adsets ?? []).flatMap(adset => {
                      const aId = String(adset.adset_id)
                      const aKey = `${cId}-${aId}`
                      const aState = expandedAdSets?.[aKey]
                      const aOpen = !!aState
                      const canDrill = adset.source === 'meta' // Google max granularity = ad_group
                      const aToggle = () => toggleAdSet?.(campaign.campaign_id, adset.adset_id, adset.source)

                      const rows = [
                        // ── AdSet Row — Level 1 ──
                        <motion.tr
                          key={`as-${cId}-${aId}`}
                          role="row"
                          aria-level={2}
                          aria-expanded={canDrill ? aOpen : undefined}
                          tabIndex={canDrill ? 0 : -1}
                          onClick={canDrill ? aToggle : undefined}
                          onKeyDown={canDrill ? e => handleKeyDown(e, aToggle, aOpen) : undefined}
                          className={`border-b border-border-subtle/10 transition-colors hover:bg-surface-secondary/30 ${
                            canDrill ? 'cursor-pointer' : ''
                          } ${aOpen ? 'bg-surface-secondary/20' : ''}`}
                          style={{ borderLeft: '2px solid var(--color-border-secondary)' }}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={T300}
                        >
                          <td className="w-10 px-2 py-2.5 text-center">
                            {canDrill ? (
                              <motion.div animate={{ rotate: aOpen ? 90 : 0 }} transition={T300} className="pl-2">
                                <ChevronRight className="h-3.5 w-3.5 text-content-tertiary mx-auto" />
                              </motion.div>
                            ) : <span className="inline-block w-5 pl-2" />}
                          </td>
                          {renderCells(adset, 1)}
                        </motion.tr>,
                      ]

                      // AC5: Ad loading skeleton
                      if (aOpen && aState.loading) {
                        rows.push(
                          <motion.tr key={`skel-a-${cId}-${aId}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={T300}>
                            <td colSpan={COLS.length + 1} className="px-3 py-2">
                              <div className="h-9 animate-pulse bg-surface-secondary/50 rounded ml-12" />
                            </td>
                          </motion.tr>
                        )
                      }

                      // AC5: No ads found
                      if (aOpen && !aState.loading && !aState.ads?.length) {
                        rows.push(
                          <motion.tr key={`empty-a-${cId}-${aId}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={T300}>
                            <td />
                            <td colSpan={COLS.length} className="pl-12 py-3 text-sm text-content-tertiary italic">
                              Nenhum anúncio encontrado
                            </td>
                          </motion.tr>
                        )
                      }

                      // AC3: Ad Rows — Level 2
                      if (aOpen && !aState.loading && aState.ads) {
                        for (const ad of aState.ads) {
                          // FR129/AC5: drill-down herda modo degradado do pai
                          const adRow = campaign.mql === null
                            ? { ...ad, mql: null, sql: null, custoMQL: null, custoSQL: null }
                            : ad
                          rows.push(
                            <motion.tr
                              key={`ad-${cId}-${aId}-${ad.ad_id}`}
                              role="row"
                              aria-level={3}
                              className="border-b border-border-subtle/10 transition-colors hover:bg-surface-secondary/30"
                              style={{ borderLeft: '4px solid var(--color-border-secondary)' }}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={T300}
                            >
                              <td className="w-10 px-2 py-2.5">
                                <span className="inline-block w-5 pl-4" />
                              </td>
                              {renderCells(adRow, 2)}
                            </motion.tr>
                          )
                        }
                      }

                      return rows
                    })}
                  </AnimatePresence>
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* FR114: Pagination controls — AC1, AC4, AC5 */}
      <nav
        role="navigation"
        aria-label="Paginação de campanhas"
        className={`flex items-center justify-between mt-0 px-4 py-3 border-t border-border-primary transition-opacity duration-200 ${
          loading ? 'opacity-50 pointer-events-none' : ''
        }`}
      >
        <span className="text-sm text-content-secondary">
          {total} {total === 1 ? 'campanha' : 'campanhas'}
        </span>

        {/* AC4: Hide controls when totalPages <= 1 */}
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(page - 1)}
              disabled={page <= 1}
              aria-label="Página anterior"
              aria-disabled={page <= 1}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors duration-150 inline-flex items-center gap-1 ${
                page <= 1
                  ? 'opacity-40 cursor-not-allowed pointer-events-none'
                  : 'bg-surface-secondary hover:bg-surface-tertiary text-content-primary'
              }`}
            >
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </button>

            <span className="text-sm text-content-secondary tabular-nums" aria-live="polite">
              Página {page} de {totalPages}
            </span>

            <button
              onClick={() => setPage(page + 1)}
              disabled={page >= totalPages}
              aria-label="Próxima página"
              aria-disabled={page >= totalPages}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors duration-150 inline-flex items-center gap-1 ${
                page >= totalPages
                  ? 'opacity-40 cursor-not-allowed pointer-events-none'
                  : 'bg-surface-secondary hover:bg-surface-tertiary text-content-primary'
              }`}
            >
              Próxima
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </nav>
    </div>
  )
}
