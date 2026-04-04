import { useState, useEffect } from 'react'
import { useMarketing } from '@/contexts/MarketingContext'
import { fetchPerformanceOverview } from '@/services/marketing/performanceOverviewService'

/**
 * Hook for Performance ADS Overview data (Epic 4).
 * Fetches 9 KPI cards + score + charts via fetchPerformanceOverview.
 * Re-fetches when global filters change (sourceFilter, years, sM).
 * @returns {{ cards: object, score: object, dailyChart: object[], campaignChart: object[], loading: boolean, error: string|null }}
 */
export function usePerformanceOverview() {
  const { sourceFilter, years, sM } = useMarketing()
  const [data, setData] = useState({
    cards: {
      investimento: 0, impressoes: 0, alcance: 0, receita: 0,
      melhorAnuncio: { nome: '\u2014', spend: 0, vendas: 0, sql: 0, score: null },
      cpc: 0, mql: 0, sql: 0, vendas: 0,
      custoMQL: 0, custoSQL: 0, custoVenda: 0,
    },
    score: { score: 0, tier: 'red' },
    dailyChart: [],
    campaignChart: [],
    totalCampaigns: 0,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // 2.1 — useEffect com deps [sourceFilter, years, sM] + debounce 300ms (D5 retro v3-epic-4)
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    const timer = setTimeout(() => {
      fetchPerformanceOverview(sourceFilter, years, sM)
        .then(result => {
          if (cancelled) return
          // 2.2 — Map service shape → UI shape consumed by PerformanceADSView
          setData({
            cards: result,                    // KPI fields: investimento, melhorAnuncio, cpc, mql, sql, vendas, custoMQL, custoSQL, custoVenda
            score: result.scoreEficiencia,    // { score, tier } — FR106
            dailyChart: result.dailyEvolution,      // [{date, spend, uniqueClicks, vendas}] — FR107
            campaignChart: result.campaignComparison, // [{campaignName, spend, clicks, vendas}] — FR108
            totalCampaigns: result.totalCampaigns || 0, // FR108 — total para label "e mais N"
          })
        })
        .catch(err => { if (!cancelled) setError(err.message) })
        .finally(() => { if (!cancelled) setLoading(false) })
    }, 300)

    return () => { cancelled = true; clearTimeout(timer) }
  }, [sourceFilter, years, sM])

  return { ...data, loading, error }
}
