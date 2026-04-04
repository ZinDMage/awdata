import { supabase } from '../supabaseClient'
import { fetchAll } from '../fetchService'
import { cachedQuery } from '@/services/queryCache'
import { buildDateRange } from '@/utils/marketingCalcs'
import { getSourceGroup, SOURCE_OPTIONS } from '@/config/sourceMapping'
import { parseMetaUTM, parseGoogleUTM } from '@/utils/utmParser'
import { classifyLead } from '@/services/classificationService'
import { JSONB_FIELDS } from '@/config/queryColumns'
import { CUSTOM_FIELDS } from '@/config/pipedrive'

// ── Helpers ──────────────────────────────────────────────────────

const isDev = import.meta.env.DEV
/** Log sanitizado — detalhes internos só em dev */
const logError = (prefix, err) => isDev ? console.error(prefix, err) : console.error(prefix)

// FR113, AC1: colunas exatas para atribuição (pattern kpisAdsService)
const LEADS_COLUMNS = 'submitted_at, lead_email, lead_revenue_range, lead_monthly_volume, lead_segment, lead_market, utm_source, utm_campaign, utm_medium, utm_content'
// crm_deals não tem colunas utm_* — atribuição via email→lead fallback (linhas 83-89)
const DEALS_COLUMNS = `deal_created_at, stage_id, pipeline_id, status, value, person_email, won_time, deal_id, ${JSONB_FIELDS.SQL_FLAG}`

/** @param {string[]|null} sf */
const isNoFilter = (sf) => !sf || sf.length === 0 || sf.includes('todos')

// pill id → group label (derivado de SOURCE_OPTIONS — single source of truth) // FR109
const SOURCE_ID_TO_GROUP = Object.fromEntries(
  SOURCE_OPTIONS.filter(o => o.id !== 'todos').map(o => [o.id, o.label])
)

/** Checa se utm_source está incluído no filtro selecionado (performanceOverviewService:20-24) */
function isSourceIncluded(utmSource, sourceFilter) {
  if (isNoFilter(sourceFilter)) return true
  const group = getSourceGroup(utmSource)
  return sourceFilter.some(sf => SOURCE_ID_TO_GROUP[sf] === group)
}

// ── Attribution ──────────────────────────────────────────────────

/**
 * Função pura: atribui MQL, SQL, Vendas e Receita por campaign_id via UTM.
 * Pattern: performanceOverviewService:107-249 adaptado para per-campaign map.
 * @param {object[]} leads — yayforms_responses
 * @param {object[]} deals — crm_deals
 * @param {string[]} sourceFilter
 * @returns {Map<string, { mql: number, sql: number, vendas: number, receita: number }>}
 */
function buildAttributionMap(leads, deals, sourceFilter) {
  // leadsByEmail para fallback deal→lead UTM (performanceOverviewService:107-115)
  const leadsByEmail = new Map()
  for (const lead of leads) {
    if (!lead.lead_email) continue
    const email = lead.lead_email.toLowerCase().trim()
    const existing = leadsByEmail.get(email)
    // Preferir lead com utm_campaign preenchido (fallback UTM mais confiável)
    if (!existing || (!existing.utm_campaign && lead.utm_campaign)) {
      leadsByEmail.set(email, lead)
    }
  }

  const attrMap = new Map()
  let failedCount = 0 // FR129: rastreia leads/deals com parsing UTM falho
  const getAttr = (id) => {
    if (!attrMap.has(id)) attrMap.set(id, { mql: 0, sql: 0, vendas: 0, receita: 0 })
    return attrMap.get(id)
  }

  // AC3: Leads → MQL por campanha via classifyLead (FR127)
  for (const lead of leads) {
    if (!isSourceIncluded(lead.utm_source, sourceFilter)) continue
    const group = getSourceGroup(lead.utm_source)
    const parsed = group === 'Meta'
      ? parseMetaUTM(lead.utm_campaign) // AC2: pipe-separated
      : group === 'Google'
        ? parseGoogleUTM(lead.utm_campaign) // AC2: ID direto
        : null
    if (!parsed) { if (group === 'Meta' || group === 'Google') failedCount++; continue } // FR129: só conta falha de parsing real
    if (classifyLead(lead.lead_revenue_range, lead.lead_monthly_volume,
                     lead.lead_segment, lead.lead_market) === 'MQL') {
      getAttr(String(parsed.id)).mql++
    }
  }

  // AC4: Deals → SQL + Vendas por campanha
  // Atribuição via email JOIN — crm_deals não tem campos UTM
  for (const deal of deals) {
    const email = deal.person_email ? deal.person_email.toLowerCase().trim() : null
    const lead = email ? leadsByEmail.get(email) : null
    const utmSource = lead?.utm_source || null
    const utmCampaign = lead?.utm_campaign || null
    if (!isSourceIncluded(utmSource, sourceFilter)) continue
    const group = getSourceGroup(utmSource)
    const parsed = group === 'Meta'
      ? parseMetaUTM(utmCampaign)
      : group === 'Google'
        ? parseGoogleUTM(utmCampaign)
        : null
    if (!parsed) { if (group === 'Meta' || group === 'Google') failedCount++; continue } // FR129: só conta falha de parsing real
    const attr = getAttr(String(parsed.id))
    // SQL: custom field check (AD-V2-9 pattern) — ambos são strings via JSONB ->> extraction
    if (String(deal.cf_sql_flag ?? '') === CUSTOM_FIELDS.SQL_FLAG.values.SIM) {
      attr.sql++
    }
    // Vendas: won deals
    if (deal.status === 'won') {
      attr.vendas++
      attr.receita += Number(deal.value) || 0
    }
  }

  return { map: attrMap, failedCount }
}

// ── Main Service ─────────────────────────────────────────────────

/**
 * Fetches hierarchical campaign data with drill-down and UTM attribution (Epic 5).
 * Uses RPC paginada rpc_ads_by_campaign — AD-V3-5.
 * Atribuição MQL/SQL/Vendas/Receita via buildAttributionMap — Story 5.2b.
 * @param {string[]} sourceFilter
 * @param {string[]} years
 * @param {string[]} months
 * @param {number} page
 * @param {number} pageSize
 * @returns {Promise<{ campaigns: object[], total: number, page: number }>}
 */
export async function fetchPerformanceByCampaign(sourceFilter, years, months, page = 1, pageSize = 25) {
  // FR109: normalizar sourceFilter — null/vazio → ['todos']
  const sf = (sourceFilter && sourceFilter.length > 0) ? sourceFilter : ['todos']
  const { startDate, endDate } = buildDateRange(years, months)

  // AC1: cache key SEM page para atribuição (leads+deals reutilizados entre páginas)
  const attrKey = `perf-campaign-attr-${[...sf].sort().join(',')}-${[...(years || [])].sort().join(',')}-${[...(months || [])].sort().join(',')}`
  // Cache key COM page para campanhas da RPC
  const key = `perf-campaign-${[...sf].sort().join(',')}-${[...(years || [])].sort().join(',')}-${[...(months || [])].sort().join(',')}-${page}-${pageSize}`

  try {
    // AC1: Fetch leads+deals cacheado separadamente (1x, reutilizado entre páginas)
    let leadsData = []
    let dealsData = []
    let attrFetchFailed = false
    try {
      const attrData = await cachedQuery(attrKey, async () => {
        const leadsDateFilter = [
          { op: 'gte', field: 'submitted_at', value: startDate },
          { op: 'lte', field: 'submitted_at', value: endDate },
        ]
        const dealsDateFilter = [
          { op: 'gte', field: 'deal_created_at', value: startDate },
          { op: 'lte', field: 'deal_created_at', value: endDate },
        ]
        const [leads, deals] = await Promise.all([
          fetchAll('yayforms_responses', LEADS_COLUMNS, leadsDateFilter),
          fetchAll('crm_deals', DEALS_COLUMNS, dealsDateFilter),
        ])
        // Verificar erros parciais — não cachear dados incompletos (pattern performanceOverviewService:87-88)
        if (leads.error || deals.error) throw new Error('Fetch parcial: leads/deals incompleto')
        return { leads: leads.data || [], deals: deals.data || [] }
      }, 5 * 60 * 1000)
      leadsData = attrData.leads
      dealsData = attrData.deals
    } catch (attrErr) {
      // AC6/FR129: continue with zero attribution — don't crash
      // Sinalizar que atribuição falhou (não é zero genuíno)
      attrFetchFailed = true
      logError('[performanceCampaignService] attribution fetch failed', attrErr)
    }

    // AC3/AC4: Build attribution map (MQL, SQL, Vendas, Receita por campaign_id)
    const { map: attrMap, failedCount } = buildAttributionMap(leadsData, dealsData, sf)

    // Fetch campaigns da RPC (paginado, cache por página)
    const rpcResult = await cachedQuery(key, async () => {
      const { data, error } = await supabase.rpc('rpc_ads_by_campaign', {
        p_source: sf,
        p_start_date: startDate,
        p_end_date: endDate,
        p_page: page,
        p_page_size: pageSize,
      })
      if (error) throw error
      return { rawCampaigns: data?.data || [], total: data?.total_count || 0 }
    }, 5 * 60 * 1000)

    // AC5: Merge atribuição nos resultados paginados
    // Google UTM fallback: parseGoogleUTM retorna valor literal de utm_campaign,
    // que pode ser nome ou ID. Tentar match por campaign_name como fallback (pattern performanceOverviewService:245)
    const campaigns = rpcResult.rawCampaigns.map(c => {
      const id = String(c.campaign_id)
      const attr = attrMap.get(id) || (c.campaign_name && attrMap.get(c.campaign_name)) || { mql: 0, sql: 0, vendas: 0, receita: 0 }
      // FR129: distinguir zero genuíno de zero por falha (parsing ou fetch)
      const isDegraded = (attrFetchFailed || failedCount > 0) && attr.mql === 0 && attr.sql === 0
      return {
        ...c,
        mql: isDegraded ? null : attr.mql,
        sql: isDegraded ? null : attr.sql,
        vendas: attr.vendas,
        receita: attr.receita,
        custoMQL: attr.mql > 0 ? (Number(c.total_spend) || 0) / attr.mql : null,
        custoSQL: attr.sql > 0 ? (Number(c.total_spend) || 0) / attr.sql : null,
      }
    })
    const degradedCount = campaigns.filter(c => c.mql === null).length // FR129

    return { campaigns, total: rpcResult.total, page, degradedCount }
  } catch (err) {
    logError('[performanceCampaignService] rpc_ads_by_campaign failed', err)
    return { campaigns: [], total: 0, page, degradedCount: 0, error: err.message || String(err) }
  }
}

// ── Drill-down Helpers ──────────────────────────────────────────────

/**
 * Fetches (or retrieves cached) leads+deals for sub-level attribution.
 * Same cache key as fetchPerformanceByCampaign — data is shared. // FR127
 */
async function fetchAttributionData(sf, years, months) {
  const attrKey = `perf-campaign-attr-${[...sf].sort().join(',')}-${[...(years || [])].sort().join(',')}-${[...(months || [])].sort().join(',')}`
  try {
    return await cachedQuery(attrKey, async () => {
      const { startDate, endDate } = buildDateRange(years, months)
      const [leads, deals] = await Promise.all([
        fetchAll('yayforms_responses', LEADS_COLUMNS, [
          { op: 'gte', field: 'submitted_at', value: startDate },
          { op: 'lte', field: 'submitted_at', value: endDate },
        ]),
        fetchAll('crm_deals', DEALS_COLUMNS, [
          { op: 'gte', field: 'deal_created_at', value: startDate },
          { op: 'lte', field: 'deal_created_at', value: endDate },
        ]),
      ])
      if (leads.error || deals.error) throw new Error('Fetch parcial: leads/deals incompleto')
      return { leads: leads.data || [], deals: deals.data || [] }
    }, 5 * 60 * 1000)
  } catch (err) {
    logError('[performanceCampaignService] attribution data failed', err)
    return { leads: [], deals: [], error: err.message || String(err) }
  }
}

/**
 * Builds attribution Map for ALL entities in a single pass — O(L+D) instead of O(N*(L+D)).
 * Returns Map<entityId, { mql, sql, vendas, receita }>.
 * Used for AdSet (utm_medium) and Ad (utm_content) levels. // FR127, FR129
 */
function buildSubAttributionMap(leads, deals, sourceFilter, utmField) {
  const attrMap = new Map()
  const getAttr = (id) => {
    if (!attrMap.has(id)) attrMap.set(id, { mql: 0, sql: 0, vendas: 0, receita: 0 })
    return attrMap.get(id)
  }

  // Build email→lead lookup once
  const leadsByEmail = new Map()
  for (const lead of leads) {
    if (!lead.lead_email) continue
    const email = lead.lead_email.toLowerCase().trim()
    const existing = leadsByEmail.get(email)
    if (!existing || (!existing[utmField] && lead[utmField])) {
      leadsByEmail.set(email, lead)
    }
  }

  // Single pass: Leads → MQL by entityId
  for (const lead of leads) {
    if (!isSourceIncluded(lead.utm_source, sourceFilter)) continue
    const group = getSourceGroup(lead.utm_source)
    const parsed = group === 'Meta' ? parseMetaUTM(lead[utmField])
      : group === 'Google' ? parseGoogleUTM(lead[utmField])
      : null
    if (!parsed) continue
    if (classifyLead(lead.lead_revenue_range, lead.lead_monthly_volume,
                     lead.lead_segment, lead.lead_market) === 'MQL') {
      getAttr(String(parsed.id)).mql++
    }
  }

  // Single pass: Deals → SQL + Vendas by entityId
  // Atribuição via email JOIN — crm_deals não tem campos UTM
  for (const deal of deals) {
    const email = deal.person_email ? deal.person_email.toLowerCase().trim() : null
    const lead = email ? leadsByEmail.get(email) : null
    const utmSource = lead?.utm_source || null
    const utmValue = lead?.[utmField] || null
    if (!isSourceIncluded(utmSource, sourceFilter)) continue
    const group = getSourceGroup(utmSource)
    const parsed = group === 'Meta' ? parseMetaUTM(utmValue)
      : group === 'Google' ? parseGoogleUTM(utmValue)
      : null
    if (!parsed) continue
    const attr = getAttr(String(parsed.id))
    if (String(deal.cf_sql_flag ?? '') === CUSTOM_FIELDS.SQL_FLAG.values.SIM) attr.sql++
    if (deal.status === 'won') {
      attr.vendas++
      attr.receita += Number(deal.value) || 0
    }
  }

  return attrMap
}

/** Merges attribution into an array of entities, adding mql/sql/custoMQL/custoSQL */
function mergeAttribution(entities, leads, deals, sf, utmField, idField) {
  const attrMap = buildSubAttributionMap(leads, deals, sf, utmField)
  const empty = { mql: 0, sql: 0, vendas: 0, receita: 0 }
  return entities.map(e => {
    const attr = attrMap.get(String(e[idField])) || empty
    return {
      ...e,
      mql: attr.mql,
      sql: attr.sql,
      vendas: attr.vendas,
      receita: attr.receita,
      custoMQL: attr.mql > 0 ? (Number(e.total_spend) || 0) / attr.mql : null,
      custoSQL: attr.sql > 0 ? (Number(e.total_spend) || 0) / attr.sql : null,
    }
  })
}

// ── Drill-down: AdSets by Campaign ──────────────────────────────────

/** Aggregates Meta ads costs by adset_id (client-side). Volume small per campaign. */
async function fetchMetaAdSets(campaignId, startDate, endDate) {
  const [{ data: costs, error: e1 }, { data: actions, error: e2 }] = await Promise.all([
    supabase
      .from('meta_ads_costs')
      .select('adset_id, adset_name, spend, impressions, date_start')
      .eq('campaign_id', campaignId)
      .gte('date_start', startDate)
      .lte('date_start', endDate),
    supabase
      .from('meta_ads_actions')
      .select('adset_id, action_type, value')
      .eq('campaign_id', campaignId)
      .gte('date_start', startDate)
      .lte('date_start', endDate)
      .in('action_type', ['unique_link_click', 'unique_landing_page_view']),
  ])
  if (e1) throw e1
  if (e2) throw e2

  const map = new Map()
  for (const r of (costs || [])) {
    if (!r.adset_id) continue
    const id = String(r.adset_id)
    if (!map.has(id)) {
      map.set(id, {
        adset_id: id, adset_name: r.adset_name || '—', source: 'meta',
        total_spend: 0, impressions: 0, date_start: r.date_start, date_end: r.date_start,
      })
    }
    const a = map.get(id)
    a.total_spend += Number(r.spend) || 0
    a.impressions += Number(r.impressions) || 0
    if (r.date_start < a.date_start) a.date_start = r.date_start
    if (r.date_start > a.date_end) a.date_end = r.date_start
    if (r.adset_name) a.adset_name = r.adset_name
  }

  const actMap = new Map()
  for (const r of (actions || [])) {
    if (!r.adset_id) continue
    const id = String(r.adset_id)
    if (!actMap.has(id)) actMap.set(id, { unique_clicks: 0, unique_landing_page_view: 0 })
    const a = actMap.get(id)
    if (r.action_type === 'unique_link_click') a.unique_clicks += Number(r.value) || 0
    if (r.action_type === 'unique_landing_page_view') a.unique_landing_page_view += Number(r.value) || 0
  }

  return Array.from(map.values()).map(a => {
    const act = actMap.get(a.adset_id) || { unique_clicks: 0, unique_landing_page_view: 0 }
    return {
      ...a,
      reach: a.impressions, // proxy — meta_ads_costs não tem coluna reach
      frequency: 1.0, // proxy — sem reach real
      unique_clicks: act.unique_clicks,
      unique_landing_page_view: act.unique_landing_page_view,
      cpm: a.impressions > 0 ? (a.total_spend / a.impressions) * 1000 : null,
      cpc: act.unique_clicks > 0 ? a.total_spend / act.unique_clicks : null,
      ctr: a.impressions > 0 ? act.unique_clicks / a.impressions : null,
    }
  }).sort((a, b) => b.total_spend - a.total_spend)
}

/** Aggregates Google ads costs by ad_group_id (normalized to adset_id) */
async function fetchGoogleAdSets(campaignId, startDate, endDate) {
  const { data: costs, error } = await supabase
    .from('google_ads_costs')
    .select('ad_group_id, ad_group_name, spend, impressions, clicks, conversions, date')
    .eq('campaign_id', campaignId)
    .gte('date', startDate)
    .lte('date', endDate)
  if (error) throw error

  const map = new Map()
  for (const r of (costs || [])) {
    if (!r.ad_group_id) continue
    const id = String(r.ad_group_id)
    if (!map.has(id)) {
      map.set(id, {
        adset_id: id, adset_name: r.ad_group_name || '—', source: 'google',
        total_spend: 0, impressions: 0, unique_clicks: 0, unique_landing_page_view: 0,
        date_start: r.date, date_end: r.date,
      })
    }
    const a = map.get(id)
    a.total_spend += Number(r.spend) || 0
    a.impressions += Number(r.impressions) || 0
    a.unique_clicks += Number(r.clicks) || 0
    a.unique_landing_page_view += Number(r.conversions) || 0
    if (r.date < a.date_start) a.date_start = r.date
    if (r.date > a.date_end) a.date_end = r.date
    if (r.ad_group_name) a.adset_name = r.ad_group_name
  }

  return Array.from(map.values()).map(a => ({
    ...a,
    reach: a.impressions, // proxy
    frequency: 1.0, // proxy
    cpm: a.impressions > 0 ? (a.total_spend / a.impressions) * 1000 : null,
    cpc: a.unique_clicks > 0 ? a.total_spend / a.unique_clicks : null,
    ctr: a.impressions > 0 ? a.unique_clicks / a.impressions : null,
  })).sort((a, b) => b.total_spend - a.total_spend)
}

/**
 * Fetches AdSets for a campaign drill-down (AC2, AC6). // FR110
 * Query direta Supabase + agregação client-side — volume pequeno per campaign.
 * @param {string} campaignId
 * @param {string} source — 'meta' | 'google'
 * @param {string[]} sourceFilter
 * @param {string[]} years
 * @param {string} months
 * @returns {Promise<{ adsets: object[], loading: false, error?: string }>}
 */
export async function fetchAdSetsByCampaign(campaignId, source, sourceFilter, years, months) {
  const sf = (sourceFilter && sourceFilter.length > 0) ? sourceFilter : ['todos']
  const { startDate, endDate } = buildDateRange(years, months)
  const drillKey = `drill-adset-${campaignId}-${source}-${startDate}-${endDate}`

  try {
    const [rawAdsets, { leads, deals }] = await Promise.all([
      cachedQuery(drillKey, () =>
        source === 'meta' ? fetchMetaAdSets(campaignId, startDate, endDate)
          : source === 'google' ? fetchGoogleAdSets(campaignId, startDate, endDate)
          : Promise.resolve([]),
        5 * 60 * 1000
      ),
      fetchAttributionData(sf, years, months),
    ])

    return {
      adsets: mergeAttribution(rawAdsets, leads, deals, sf, 'utm_medium', 'adset_id'),
      loading: false,
    }
  } catch (err) {
    logError('[performanceCampaignService] fetchAdSetsByCampaign failed', err)
    return { adsets: [], loading: false, error: err.message || String(err) }
  }
}

// ── Drill-down: Ads by AdSet ────────────────────────────────────────

/** Aggregates Meta ads costs by ad_id within an adset */
async function fetchMetaAds(campaignId, adsetId, startDate, endDate) {
  const [{ data: costs, error: e1 }, { data: actions, error: e2 }] = await Promise.all([
    supabase
      .from('meta_ads_costs')
      .select('ad_id, ad_name, spend, impressions, date_start')
      .eq('campaign_id', campaignId)
      .eq('adset_id', adsetId)
      .gte('date_start', startDate)
      .lte('date_start', endDate),
    supabase
      .from('meta_ads_actions')
      .select('ad_id, action_type, value')
      .eq('campaign_id', campaignId)
      .eq('adset_id', adsetId)
      .gte('date_start', startDate)
      .lte('date_start', endDate)
      .in('action_type', ['unique_link_click', 'unique_landing_page_view']),
  ])
  if (e1) throw e1
  if (e2) throw e2

  // Collect ad_ids from this adset
  const adIds = new Set()
  const map = new Map()
  for (const r of (costs || [])) {
    if (!r.ad_id) continue
    const id = String(r.ad_id)
    adIds.add(id)
    if (!map.has(id)) {
      map.set(id, {
        ad_id: id, ad_name: r.ad_name || '—', source: 'meta',
        adset_id: String(adsetId),
        total_spend: 0, impressions: 0, date_start: r.date_start, date_end: r.date_start,
      })
    }
    const a = map.get(id)
    a.total_spend += Number(r.spend) || 0
    a.impressions += Number(r.impressions) || 0
    if (r.date_start < a.date_start) a.date_start = r.date_start
    if (r.date_start > a.date_end) a.date_end = r.date_start
    if (r.ad_name) a.ad_name = r.ad_name
  }

  // Filter actions to only ad_ids in this adset
  const actMap = new Map()
  for (const r of (actions || [])) {
    if (!r.ad_id) continue
    const id = String(r.ad_id)
    if (!adIds.has(id)) continue
    if (!actMap.has(id)) actMap.set(id, { unique_clicks: 0, unique_landing_page_view: 0 })
    const a = actMap.get(id)
    if (r.action_type === 'unique_link_click') a.unique_clicks += Number(r.value) || 0
    if (r.action_type === 'unique_landing_page_view') a.unique_landing_page_view += Number(r.value) || 0
  }

  return Array.from(map.values()).map(a => {
    const act = actMap.get(a.ad_id) || { unique_clicks: 0, unique_landing_page_view: 0 }
    return {
      ...a,
      reach: a.impressions,
      frequency: 1.0,
      unique_clicks: act.unique_clicks,
      unique_landing_page_view: act.unique_landing_page_view,
      cpm: a.impressions > 0 ? (a.total_spend / a.impressions) * 1000 : null,
      cpc: act.unique_clicks > 0 ? a.total_spend / act.unique_clicks : null,
      ctr: a.impressions > 0 ? act.unique_clicks / a.impressions : null,
    }
  }).sort((a, b) => b.total_spend - a.total_spend)
}

/**
 * Fetches Ads for an AdSet drill-down (AC3, AC6). // FR111
 * Google has no ad-level granularity below ad_group — returns empty.
 * @returns {Promise<{ ads: object[], loading: false, error?: string }>}
 */
export async function fetchAdsByAdSet(campaignId, adsetId, source, sourceFilter, years, months) {
  const sf = (sourceFilter && sourceFilter.length > 0) ? sourceFilter : ['todos']
  const { startDate, endDate } = buildDateRange(years, months)
  const drillKey = `drill-ad-${adsetId}-${source}-${startDate}-${endDate}`

  try {
    // Google max granularity = ad_group — no ad-level drill-down
    if (source === 'google') return { ads: [], loading: false }

    const [rawAds, { leads, deals }] = await Promise.all([
      cachedQuery(drillKey, () =>
        fetchMetaAds(campaignId, adsetId, startDate, endDate),
        5 * 60 * 1000
      ),
      fetchAttributionData(sf, years, months),
    ])

    return {
      ads: mergeAttribution(rawAds, leads, deals, sf, 'utm_content', 'ad_id'),
      loading: false,
    }
  } catch (err) {
    logError('[performanceCampaignService] fetchAdsByAdSet failed', err)
    return { ads: [], loading: false, error: err.message || String(err) }
  }
}
