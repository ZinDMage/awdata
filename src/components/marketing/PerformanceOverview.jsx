import { useMemo, useState, useEffect, useRef } from 'react'
import { F } from '@/utils/formatters'
import EmptyState from '@/components/EmptyState'
import ScoreBadge from '@/components/marketing/ScoreBadge'
import LineChart from '@/components/marketing/LineChart'

// FR105-FR108: Performance Overview — 9 KPI cards + Score + charts
// AD-V3-6: props puras — NÃO consome context

// ── Config declarativa dos 9 cards (UX-DR9) ──

const ROW1_CARDS = [
  { key: 'investimento', label: 'Investimento', format: 'ri' },
  { key: 'melhorAnuncio', label: 'Melhor Anúncio', format: 'special' },
  { key: 'cpc', label: 'CPC', format: 'r2' },
  { key: 'mql', label: 'MQL', format: 'n' },
  { key: 'sql', label: 'SQL', format: 'n' },
]

const ROW2_CARDS = [
  { key: 'vendas', label: 'Vendas', format: 'n' },
  { key: 'custoMQL', label: 'Custo MQL', format: 'ri' },
  { key: 'custoSQL', label: 'Custo SQL', format: 'ri' },
  { key: 'custoVenda', label: 'Custo Venda', format: 'ri' },
]

const FORMAT_FN = { ri: F.ri, r2: F.r2, n: F.n }

// ── Config declarativa das 3 séries do gráfico diário (AC #1, Task 3) ──

const SERIES_CONFIG = [
  { key: 'spend', label: 'Investimento', color: '#007AFF', formatValue: F.ri },
  { key: 'uniqueClicks', label: 'Cliques Únicos', color: '#FF9500', formatValue: F.n },
  { key: 'vendas', label: 'Vendas', color: '#34C759', formatValue: F.n },
]

// ── Card genérico ──

function KpiCard({ label, value }) {
  return (
    <div className="bg-surface-secondary rounded-card p-6 border border-border-subtle/20">
      <p className="text-xs text-content-tertiary uppercase tracking-wide mb-2">{label}</p>
      <p className="text-2xl font-bold tabular-nums text-content-primary">{value}</p>
    </div>
  )
}

// ── Card "Melhor Anúncio" (special) — FR105, UX-DR9 ──

function BestAdCard({ melhorAnuncio }) {
  const ad = melhorAnuncio || {}
  const nome = ad.nome || '—'
  const spend = ad.spend
  const vendas = ad.vendas
  const adScore = ad.score // per-ad score from service (AC #3)

  return (
    <div className="bg-surface-secondary rounded-card p-6 border border-border-subtle/20 flex flex-col gap-2">
      <p className="text-xs text-content-tertiary uppercase tracking-wide">Melhor Anúncio</p>
      <p className="text-lg font-bold tabular-nums text-content-primary truncate max-w-[180px]" title={nome}>
        {nome}
      </p>
      <div className="flex items-center gap-3 text-xs text-content-secondary">
        <span>{F.ri(spend)}</span>
        <span>{F.n(vendas)} vendas</span>
        {adScore != null && (
          <ScoreBadge
            score={adScore.score}
            tier={adScore.tier}
            sql={ad.sql}
            vendas={vendas}
            spend={spend}
            showTooltip
            size="sm"
          />
        )}
      </div>
    </div>
  )
}

// ── Skeleton loader (AC #8) ──

function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="animate-pulse bg-surface-secondary/50 rounded-card h-28" />
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="animate-pulse bg-surface-secondary/50 rounded-card h-28" />
        ))}
      </div>
    </div>
  )
}

// ── Config declarativa das 3 métricas do gráfico comparativo (FR108) ──

const CAMPAIGN_METRICS = [
  { key: 'spend', label: 'Investimento', color: '#007AFF', format: F.ri },
  { key: 'clicks', label: 'Cliques', color: '#FF9500', format: F.n },
  { key: 'vendas', label: 'Vendas', color: '#34C759', format: F.n },
]

// ── Gráfico comparativo por campanha — FR108, AC #1, #2, #3 ──

function CampaignBarChart({ campaigns, totalCampaigns }) {
  // Mount animation — V2 BarChart pattern
  const [mounted, setMounted] = useState(false)
  const [hoveredCampaign, setHoveredCampaign] = useState(null)
  const [tooltipSide, setTooltipSide] = useState('right')
  const chartRef = useRef(null)

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])

  // Normalização independente por métrica (AC #1) — useMemo (project-context)
  const maxes = useMemo(() => ({
    spend: Math.max(0, ...campaigns.map(c => Number.isFinite(c.spend) ? c.spend : 0)),
    clicks: Math.max(0, ...campaigns.map(c => Number.isFinite(c.clicks) ? c.clicks : 0)),
    vendas: Math.max(0, ...campaigns.map(c => Number.isFinite(c.vendas) ? c.vendas : 0)),
  }), [campaigns])

  if (campaigns.length === 0) return null

  return (
    <div ref={chartRef} className="relative">
      <div className="flex flex-col gap-3">
        {campaigns.map((camp, idx) => {
          const isHovered = hoveredCampaign === idx
          return (
            <div
              key={camp.campaignName || idx}
              className="border-b border-border-subtle/10 last:border-b-0 pb-3 last:pb-0 relative"
              onMouseEnter={() => {
                setHoveredCampaign(idx)
                if (chartRef.current) {
                  const rect = chartRef.current.getBoundingClientRect()
                  setTooltipSide(rect.right > window.innerWidth - 250 ? 'left' : 'right')
                }
              }}
              onMouseLeave={() => setHoveredCampaign(null)}
            >
              {/* Campaign name */}
              <p className="text-xs text-content-secondary truncate max-w-[120px] mb-1.5" title={camp.campaignName}>
                {camp.campaignName}
              </p>
              {/* 3 bars per campaign */}
              <div className="flex flex-col gap-1">
                {CAMPAIGN_METRICS.map(metric => {
                  const val = Number.isFinite(camp[metric.key]) ? camp[metric.key] : 0
                  const max = maxes[metric.key]
                  const widthPercent = max > 0 ? (val / max) * 100 : 0
                  return (
                    <div key={metric.key} className="flex items-center gap-2">
                      <div className="flex-1 bg-surface-tertiary/30 rounded-full h-2">
                        <div
                          className="h-2 rounded-full transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]"
                          style={{
                            width: mounted ? `${widthPercent}%` : '0%',
                            backgroundColor: metric.color,
                          }}
                        />
                      </div>
                      <span className="text-[10px] tabular-nums text-content-tertiary ml-0 whitespace-nowrap min-w-[48px] text-right">
                        {metric.format(val)}
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* Tooltip hover — AC #1, Task 4 */}
              {isHovered && (
                <div className={`absolute z-10 bg-surface-secondary border border-border-subtle/20 rounded-control p-3 shadow-lg text-sm pointer-events-none max-w-[220px] ${tooltipSide === 'right' ? 'right-0 top-0 -translate-y-1/2 translate-x-[calc(100%+8px)]' : 'left-0 top-0 -translate-y-1/2 -translate-x-[calc(100%+8px)]'}`}>
                  <p className="font-medium text-content-primary text-xs mb-2 truncate">{camp.campaignName}</p>
                  {CAMPAIGN_METRICS.map(metric => (
                    <div key={metric.key} className="flex items-center gap-2 text-xs text-content-secondary mb-1 last:mb-0">
                      <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: metric.color }} />
                      <span>{metric.label}:</span>
                      <span className="font-medium tabular-nums">{metric.format(Number.isFinite(camp[metric.key]) ? camp[metric.key] : 0)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Label "e mais N campanhas" — AC #2, Task 5 */}
      {totalCampaigns > campaigns.length && (
        <p className="text-xs text-content-tertiary italic mt-2">
          e mais {totalCampaigns - campaigns.length} campanhas
        </p>
      )}

      {/* Legenda — AC #3, Task 7 */}
      <div className="flex items-center gap-4 mt-3 text-xs text-content-tertiary">
        {CAMPAIGN_METRICS.map(metric => (
          <div key={metric.key} className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: metric.color }} />
            <span>{metric.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Seção de gráficos — AC #1, #3, #4 ──

function DailyChartSection({ dailyChart, campaignChart, totalCampaigns }) {
  // AC #4: graceful fallback — não renderizar se vazio
  const hasDaily = dailyChart && dailyChart.length > 0

  // useMemo para transformar dailyChart → series/xLabels (project-context: nunca useEffect para cálculos)
  const { chartSeries, chartXLabels } = useMemo(() => {
    if (!hasDaily) return { chartSeries: [], chartXLabels: [] }
    return {
      chartXLabels: dailyChart.map(d => F.date(d.date)),
      chartSeries: SERIES_CONFIG.map(cfg => ({
        label: cfg.label,
        color: cfg.color,
        data: dailyChart.map(d => d[cfg.key]),
        formatValue: cfg.formatValue,
      })),
    }
  }, [dailyChart])

  if (!hasDaily) return null

  return (
    <div className={`grid grid-cols-1 ${campaignChart && campaignChart.length > 0 ? 'md:grid-cols-2' : ''} gap-4`}>
      {/* Coluna esquerda — Story 4.3: Evolução Diária */}
      <div className="bg-surface-secondary rounded-card p-6 border border-border-subtle/20">
        <p className="text-sm font-medium text-content-primary mb-4">Evolução Diária</p>
        <LineChart series={chartSeries} xLabels={chartXLabels} yFormat={F.ri} height={240} />
      </div>
      {/* Coluna direita — Story 4.4: Comparativo por Campanha */}
      {campaignChart && campaignChart.length > 0 && (
        <div className="bg-surface-secondary rounded-card p-6 border border-border-subtle/20">
          <p className="text-sm font-medium text-content-primary mb-4">Comparativo por Campanha</p>
          <CampaignBarChart campaigns={campaignChart} totalCampaigns={totalCampaigns} />
        </div>
      )}
    </div>
  )
}

// ── Componente principal ──

export default function PerformanceOverview({
  cards,
  score,
  dailyChart,
  campaignChart,
  totalCampaigns,
  comparisonMode,
  sourceFilter,
  loading,
  error,
}) {
  // AC #8: skeleton loader
  if (loading) return <OverviewSkeleton />

  // AC #9: error state
  if (error) {
    return <EmptyState message={error} />
  }

  // AC #9: empty state
  if (!cards || cards.investimento == null) {
    return <EmptyState message="Sem dados de Performance para o período selecionado" />
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Score Eficiência geral — AC #4, Task 2.5 */}
      {score && score.score != null && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-content-secondary font-medium">Eficiência Geral</span>
          <ScoreBadge
            score={score.score}
            tier={score.tier}
            sql={cards.sql}
            vendas={cards.vendas}
            spend={cards.investimento}
            showTooltip
            size="md"
          />
        </div>
      )}

      {/* Row 1: 5 cards — AC #1 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {ROW1_CARDS.map(cfg =>
          cfg.format === 'special' ? (
            <BestAdCard key={cfg.key} melhorAnuncio={cards.melhorAnuncio} />
          ) : (
            <KpiCard
              key={cfg.key}
              label={cfg.label}
              value={(FORMAT_FN[cfg.format] || F.n)(cards[cfg.key])}
            />
          )
        )}
      </div>

      {/* Row 2: 4 cards — AC #1 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {ROW2_CARDS.map(cfg => (
          <KpiCard
            key={cfg.key}
            label={cfg.label}
            value={(FORMAT_FN[cfg.format] || F.n)(cards[cfg.key])}
          />
        ))}
      </div>

      {/* Gráficos — FR107, FR108 */}
      <DailyChartSection dailyChart={dailyChart} campaignChart={campaignChart} totalCampaigns={totalCampaigns} />
    </div>
  )
}
