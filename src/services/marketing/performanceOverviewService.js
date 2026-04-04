import { fetchAll } from '../fetchService'
import { cachedQuery } from '@/services/queryCache'
import { buildDateRange, calcEfficiencyScore } from '@/utils/marketingCalcs'
import { getSourceGroup, SOURCE_OPTIONS } from '@/config/sourceMapping'
import { parseMetaUTM, parseGoogleUTM } from '@/utils/utmParser'
import { classifyLead } from '@/services/classificationService'
import { JSONB_FIELDS } from '@/config/queryColumns'
import { CUSTOM_FIELDS } from '@/config/pipedrive'

// ── Helpers ──────────────────────────────────────────────────────

/** @param {string[]|null} sf */
const isNoFilter = (sf) => !sf || sf.length === 0 || sf.includes('todos')

// pill id → group label (derivado de SOURCE_OPTIONS — single source of truth)
const SOURCE_ID_TO_GROUP = Object.fromEntries(
  SOURCE_OPTIONS.filter(o => o.id !== 'todos').map(o => [o.id, o.label])
)

/** Checa se utm_source está incluído no filtro selecionado */
function isSourceIncluded(utmSource, sourceFilter) {
  if (isNoFilter(sourceFilter)) return true
  const group = getSourceGroup(utmSource)
  return sourceFilter.some(sf => SOURCE_ID_TO_GROUP[sf] === group)
}

// ── Main Service ─────────────────────────────────────────────────

/**
 * Busca e agrega dados para Performance ADS Overview.
 * 9 KPI cards + Score Eficiência + gráficos evolução e comparação.
 * @param {string[]} sourceFilter — pill IDs (ex: ['todos'], ['meta'])
 * @param {string[]} years — anos selecionados
 * @param {string[]} months — meses (reservado)
 * @returns {Promise<object>} FR105, FR106, FR107, FR108
 */
export async function fetchPerformanceOverview(sourceFilter, years, months) {
  // 1.1 — Cache key composta (normalizada: sort + 'todos' canônico)
  const sf = isNoFilter(sourceFilter) ? ['todos'] : [...sourceFilter].sort()
  const ms = typeof months === 'string' ? [months] : [...(months || [])]
  const key = `perf-overview-${sf.join(',')}-${[...(years || [])].sort().join(',')}-${ms.sort().join(',')}`

  return cachedQuery(key, async () => { // 1.12 — cachedQuery wrapper
    // 1.2 — Date range
    const { startDate, endDate } = buildDateRange(years, months)

    // 1.4 — Condicional Meta/Google por sourceFilter
    // LinkedIn: sem tabela de custos dedicada — leads/deals contados, custos=0 (v3-7-5 trata empty states)
    const noFilter = isNoFilter(sourceFilter)
    const includesMeta = noFilter || sourceFilter.includes('meta')
    const includesGoogle = noFilter || sourceFilter.includes('google')

    // 1.3 — Fetch paralelo das 5 tabelas com colunas explícitas
    const [metaCosts, googleCosts, metaActions, leads, deals] = await Promise.all([
      includesMeta
        ? fetchAll('meta_ads_costs',
            'spend,impressions,date_start',
            [{ op: 'gte', field: 'date_start', value: startDate },
             { op: 'lte', field: 'date_start', value: endDate }])
        : { data: [] },
      includesGoogle
        ? fetchAll('google_ads_costs',
            'spend,impressions,clicks,conversions,date',
            [{ op: 'gte', field: 'date', value: startDate },
             { op: 'lte', field: 'date', value: endDate }])
        : { data: [] },
      includesMeta
        ? fetchAll('meta_ads_actions',
            'action_type,value,date_start,campaign_id,adset_id,ad_id',
            [{ op: 'gte', field: 'date_start', value: startDate },
             { op: 'lte', field: 'date_start', value: endDate },
             { op: 'eq', field: 'action_type', value: 'unique_link_click' }])
        : { data: [] },
      fetchAll('yayforms_responses',
        'submitted_at,lead_email,lead_revenue_range,lead_monthly_volume,lead_segment,lead_market,utm_source,utm_campaign,utm_medium,utm_content',
        [{ op: 'gte', field: 'submitted_at', value: startDate },
         { op: 'lte', field: 'submitted_at', value: endDate }]),
      fetchAll('crm_deals',
        `deal_created_at,stage_id,pipeline_id,status,value,person_email,won_time,deal_id,${JSONB_FIELDS.SQL_FLAG}`,
        [{ op: 'gte', field: 'deal_created_at', value: startDate },
         { op: 'lte', field: 'deal_created_at', value: endDate }]),
    ])

    // Verificar erros parciais — não cachear dados incompletos
    const _results = [metaCosts, googleCosts, metaActions, leads, deals]
    const hasPartialFailure = _results.some(r => r.error)
    if (hasPartialFailure) throw new Error('Falha ao buscar dados de performance. Tente novamente.')

    const metaCostsData = metaCosts.data || []
    const googleCostsData = googleCosts.data || []
    const metaActionsData = metaActions.data || []
    const leadsData = leads.data || []
    const dealsData = deals.data || []

    // ── Lookups ────────────────────────────────────────────────
    // campaign_id → campaign_name (para atribuição UTM→campaign)
    const campaignNames = new Map()
    for (const row of metaCostsData) {
      if (row.campaign_id) campaignNames.set(String(row.campaign_id), row.campaign_name)
    }
    for (const row of googleCostsData) {
      if (row.campaign_id) campaignNames.set(String(row.campaign_id), row.campaign_name)
    }

    // lead_email → lead (já deduplicated pelo fetchAll FR20/FR21)
    const leadsByEmail = new Map()
    for (const lead of leadsData) {
      if (!lead.lead_email) continue
      const existing = leadsByEmail.get(lead.lead_email)
      // Preferir lead com utm_campaign preenchido (fallback UTM mais confiável)
      if (!existing || (!existing.utm_campaign && lead.utm_campaign)) {
        leadsByEmail.set(lead.lead_email, lead)
      }
    }

    // ── Aggregation maps ───────────────────────────────────────
    const dailyMap = new Map()    // date → { spend, uniqueClicks, vendas }
    const campaignMap = new Map() // campaignName → { spend, clicks, vendas }
    const adMap = new Map()       // ad_id → { nome, spend, vendas }

    const getDaily = (d) => {
      if (!dailyMap.has(d)) dailyMap.set(d, { spend: 0, uniqueClicks: 0, vendas: 0 })
      return dailyMap.get(d)
    }
    const getCampaign = (n) => {
      if (!campaignMap.has(n)) campaignMap.set(n, { spend: 0, clicks: 0, vendas: 0 })
      return campaignMap.get(n)
    }
    const getAd = (id, nome) => {
      if (!adMap.has(id)) adMap.set(id, { nome: nome || id, spend: 0, vendas: 0, sql: 0 })
      return adMap.get(id)
    }

    // ── Ads costs aggregation ──────────────────────────────────
    let investimento = 0
    let impressoes = 0
    let alcance = 0

    for (const row of metaCostsData) {
      const spend = Number(row.spend) || 0
      investimento += spend
      impressoes += Number(row.impressions) || 0
      alcance += Number(row.reach) || 0
      if (row.date_start) getDaily(row.date_start).spend += spend
      if (row.campaign_name) getCampaign(row.campaign_name).spend += spend
      if (row.ad_id) getAd(row.ad_id, row.ad_name).spend += spend
    }

    for (const row of googleCostsData) {
      const spend = Number(row.spend) || 0
      const clicks = Number(row.clicks) || 0 // FR112: Google clicks = unique
      investimento += spend
      impressoes += Number(row.impressions) || 0
      if (row.date) {
        getDaily(row.date).spend += spend
        getDaily(row.date).uniqueClicks += clicks
      }
      if (row.campaign_name) {
        const c = getCampaign(row.campaign_name)
        c.spend += spend
        c.clicks += clicks
      }
      if (row.ad_id) getAd(row.ad_id, row.ad_name).spend += spend
    }

    // ── 1.5 Unique clicks ──────────────────────────────────────
    // Meta: meta_ads_actions (action_type=unique_link_click) — FR111
    // Google: google_ads_costs.clicks (unique por definição) — FR112
    let metaUniqueClicks = 0
    for (const action of metaActionsData) {
      const val = Number(action.value) || 0
      metaUniqueClicks += val
      if (action.date_start) getDaily(action.date_start).uniqueClicks += val
      const campName = campaignNames.get(String(action.campaign_id))
      if (campName) getCampaign(campName).clicks += val
    }
    const googleUniqueClicks = googleCostsData.reduce((s, r) => s + (Number(r.clicks) || 0), 0)
    const uniqueClicks = metaUniqueClicks + googleUniqueClicks

    // ── 1.6 MQL attribution (FR111-FR113, FR127) ────────────────
    let mql = 0

    for (const lead of leadsData) {
      if (!isSourceIncluded(lead.utm_source, sourceFilter)) continue

      const cls = classifyLead( // FR127 — nunca reimplementar
        lead.lead_revenue_range,
        lead.lead_monthly_volume,
        lead.lead_segment,
        lead.lead_market
      )
      if (cls === 'MQL') mql++
    }

    // ── SQL + Vendas + Receita attribution ─────────────────────
    let sql = 0
    let vendas = 0
    let receita = 0

    for (const deal of dealsData) {
      // Atribuição via email JOIN — crm_deals não tem campos UTM
      const email = deal.person_email ? deal.person_email.toLowerCase().trim() : null
      const lead = email ? leadsByEmail.get(email) : null
      const utmSource = lead?.utm_source || null
      const utmCampaign = lead?.utm_campaign || null
      const utmContent = lead?.utm_content || null

      if (!isSourceIncluded(utmSource, sourceFilter)) continue

      // Campaign + ad attribution — parsed before won check for SQL per-ad
      const group = getSourceGroup(utmSource)
      let parsedCampaign = null
      let parsedAd = null

      if (group === 'Meta') {
        parsedCampaign = parseMetaUTM(utmCampaign) // FR129: null = sem atribuição
        parsedAd = parseMetaUTM(utmContent)
      } else if (group === 'Google') {
        parsedCampaign = parseGoogleUTM(utmCampaign)
        parsedAd = parseGoogleUTM(utmContent)
      }

      // SQL: custom field SQL? = Sim (AD-V2-9 pattern)
      if ((deal.cf_sql_flag ?? null) == CUSTOM_FIELDS.SQL_FLAG.values.SIM) {
        sql++
        if (parsedAd) getAd(parsedAd.id, parsedAd.name).sql++
      }

      if (deal.status !== 'won') continue
      vendas++
      receita += Number(deal.value) || 0

      if (parsedCampaign) {
        const campName = campaignNames.get(parsedCampaign.id) || parsedCampaign.name
        getCampaign(campName).vendas++
      }

      if (parsedAd) {
        getAd(parsedAd.id, parsedAd.name).vendas++
      }

      // Daily vendas — clamped ao range para evitar pontos fora do gráfico
      const vendaDate = (deal.won_time || deal.deal_created_at || '').split('T')[0]
      if (vendaDate && vendaDate >= startDate && vendaDate <= endDate) {
        getDaily(vendaDate).vendas++
      }
    }

    // ── 1.7 KPIs ──────────────────────────────────────────────
    const cpc = uniqueClicks > 0 ? investimento / uniqueClicks : 0
    const custoMQL = mql > 0 ? investimento / mql : 0
    const custoSQL = sql > 0 ? investimento / sql : 0
    const custoVenda = vendas > 0 ? investimento / vendas : 0

    // ── 1.8 Melhor anúncio (mais vendas, desempate: menor spend) + per-ad score
    let melhorAnuncio = { nome: '\u2014', spend: 0, vendas: 0, sql: 0, score: null }
    for (const [, ad] of adMap) {
      if (ad.vendas > melhorAnuncio.vendas
        || (ad.vendas === melhorAnuncio.vendas && ad.vendas > 0 && ad.spend < melhorAnuncio.spend)) {
        const adScore = calcEfficiencyScore(ad.sql, ad.vendas, ad.spend)
        melhorAnuncio = { nome: ad.nome, spend: ad.spend, vendas: ad.vendas, sql: ad.sql, score: adScore }
      }
    }

    // ── 1.9 Score Eficiência ──────────────────────────────────
    const scoreEficiencia = calcEfficiencyScore(sql, vendas, investimento) // AD-V3-9

    // ── 1.10 dailyEvolution — sorted by date ──────────────────
    const dailyEvolution = Array.from(dailyMap.entries())
      .map(([date, d]) => ({ date, spend: d.spend, uniqueClicks: d.uniqueClicks, vendas: d.vendas }))
      .sort((a, b) => a.date.localeCompare(b.date))

    // ── 1.11 campaignComparison — top 10 by spend desc ────────
    const totalCampaigns = campaignMap.size // FR108 — total antes do slice
    const campaignComparison = Array.from(campaignMap.entries())
      .map(([campaignName, c]) => ({ campaignName, spend: c.spend, clicks: c.clicks, vendas: c.vendas }))
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 10)

    return {
      investimento,
      impressoes,
      alcance,
      receita,
      melhorAnuncio,
      cpc,
      mql,
      sql,
      vendas,
      custoMQL,
      custoSQL,
      custoVenda,
      scoreEficiencia,
      dailyEvolution,
      campaignComparison,
      totalCampaigns, // FR108 — count total para label "e mais N"
    }
  }, 5 * 60 * 1000) // 1.12 — TTL 5min
}
