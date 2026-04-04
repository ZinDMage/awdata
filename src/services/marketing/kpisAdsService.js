import { fetchAll } from '../fetchService';
import { classifyLead } from '../classificationService';
import { cachedQuery } from '@/services/queryCache';
import { buildDateRange } from '@/utils/marketingCalcs';
import { getSourceGroup } from '@/config/sourceMapping';
import { STAGE_IDS, PIPELINE_FUNNELS, CUSTOM_FIELDS } from '@/config/pipedrive';
import { JSONB_FIELDS } from '@/config/queryColumns';

/**
 * Marketing Service — KPIs ADS (Epic 3)
 * Handles KPI cards and funnel metrics for the Marketing ADS view.
 * @see AD-V3-3, FR96, FR97, FR127, FR128
 */

const SOURCES = ['Meta', 'Google', 'LinkedIn', 'Orgânico', 'S/Track'];

const RAW_KEYS = ['spend', 'impressions', 'clicks', 'pageViews', 'leads', 'mqls', 'sqls', 'reunioes', 'propostas', 'sales', 'revenue'];

// Pill id → source group name
const SOURCE_ID_MAP = { meta: 'Meta', google: 'Google', linkedin: 'LinkedIn', organico: 'Orgânico', strack: 'S/Track' };

// ── Fetch ────────────────────────────────────────────────────────

/**
 * Fetches data for the KPIs ADS view.
 * @param {string[]} sourceFilter — pill ids: ['todos'] ou ['meta'], ['google'], etc.
 * @param {string[]} years
 * @param {string[]} months
 * @param {string[]} funnels
 */
export async function fetchKPIsADS(sourceFilter, years, months, funnels) {
  const sf = (sourceFilter && sourceFilter.length > 0) ? sourceFilter : ['todos'];
  const cacheKey = `mkt-kpis-${[...sf].sort().join(',')}-${[...(years || [])].sort().join(',')}-${[...(months || [])].sort().join(',')}-${[...(funnels || [])].sort().join(',')}`;

  return cachedQuery(cacheKey, async () => {
    const { startDate, endDate } = buildDateRange(years, months);

    // Filters — array of { op, field, value } objects (fetchService format) // FR85
    const adsDateFilter = [
      { op: 'gte', field: 'date_start', value: startDate },
      { op: 'lte', field: 'date_start', value: endDate },
    ];
    const googleAdsDateFilter = [
      { op: 'gte', field: 'date', value: startDate },
      { op: 'lte', field: 'date', value: endDate },
    ];
    const leadsDateFilter = [
      { op: 'gte', field: 'submitted_at', value: startDate },
      { op: 'lte', field: 'submitted_at', value: endDate },
    ];
    const dealsDateFilter = [
      { op: 'gte', field: 'deal_created_at', value: startDate },
      { op: 'lte', field: 'deal_created_at', value: endDate },
    ];

    const fetchMeta = sf.includes('todos') || sf.includes('meta');
    const fetchGoogle = sf.includes('todos') || sf.includes('google');

    // Parallel fetch — NFR22: colunas explícitas
    const [metaCosts, googleCosts, metaActions, leads, deals] = await Promise.all([
      fetchMeta
        ? fetchAll('meta_ads_costs', 'spend, impressions, date_start', adsDateFilter)
        : { data: [] },
      fetchGoogle
        ? fetchAll('google_ads_costs', 'spend, impressions, clicks, conversions, date, campaign_id', googleAdsDateFilter)
        : { data: [] },
      fetchMeta
        ? fetchAll('meta_ads_actions', 'action_type, value, date_start, campaign_id, adset_id, ad_id', adsDateFilter)
        : { data: [] },
      fetchAll('yayforms_responses', 'submitted_at, lead_email, lead_revenue_range, lead_monthly_volume, lead_segment, lead_market, utm_source, utm_campaign, utm_medium, utm_content', leadsDateFilter),
      fetchAll('crm_deals', `deal_created_at, stage_id, pipeline_id, status, value, person_email, won_time, deal_id, ${JSONB_FIELDS.SQL_FLAG}`, dealsDateFilter),
    ]);

    // Verificar erros de fetch — não cachear dados parciais
    const fetchErrors = [
      metaCosts.error && 'meta_ads_costs',
      googleCosts.error && 'google_ads_costs',
      metaActions.error && 'meta_ads_actions',
      leads.error && 'yayforms_responses',
      deals.error && 'crm_deals',
    ].filter(Boolean);
    if (fetchErrors.length > 0) {
      throw new Error(`Falha ao buscar: ${fetchErrors.join(', ')}`);
    }

    return processKPIsADS(metaCosts.data, googleCosts.data, metaActions.data, leads.data, deals.data, sf, funnels);
  }, 5 * 60 * 1000); // 5min TTL
}

// ── Process ──────────────────────────────────────────────────────

/**
 * Processes raw data into KPIs ADS format.
 * Output shape depends on sourceFilter: comparativo (todos/multi) vs single-source.
 * @see FR128 — totals = soma exata de todas as sources
 */
function processKPIsADS(metaCosts, googleCosts, metaActions, leads, deals, sourceFilter, funnels) {
  const isComparison = sourceFilter.includes('todos') || sourceFilter.length > 1;

  // Filtro por funil (AC1): filtrar deals por pipeline_id quando funnels especificados
  if (funnels && funnels.length > 0) {
    const allowedPipelines = funnels.flatMap(f => PIPELINE_FUNNELS[f] || []);
    if (allowedPipelines.length > 0) {
      deals = deals.filter(d => allowedPipelines.includes(d.pipeline_id));
    }
  }

  // Monthly buckets: { 'YYYY-MM': { Meta: metrics, Google: metrics, ... } }
  const monthlyData = {};

  const ensureBucket = (month, source) => {
    if (!month) return null;
    if (!monthlyData[month]) {
      monthlyData[month] = Object.fromEntries(SOURCES.map(s => [s, initSourceMetrics()]));
    }
    return monthlyData[month][source];
  };

  // ── 1. Meta ad costs ──
  for (const row of metaCosts) {
    const bucket = ensureBucket(toMonth(row.date_start), 'Meta');
    if (!bucket) continue;
    bucket.spend += Number(row.spend || 0);
    bucket.impressions += Number(row.impressions || 0);
  }

  // ── 2. Meta ad actions (FR111: unique_link_click, unique_landing_page_view) ──
  for (const act of metaActions) {
    const bucket = ensureBucket(toMonth(act.date_start), 'Meta');
    if (!bucket) continue;
    if (act.action_type === 'unique_link_click') {
      bucket.clicks += Number(act.value || 0);
    }
    if (act.action_type === 'unique_landing_page_view') {
      bucket.pageViews += Number(act.value || 0);
    }
  }

  // ── 3. Google ad costs ──
  for (const row of googleCosts) {
    const bucket = ensureBucket(toMonth(row.date), 'Google');
    if (!bucket) continue;
    bucket.spend += Number(row.spend || 0);
    bucket.impressions += Number(row.impressions || 0);
    bucket.clicks += Number(row.clicks || 0);
    bucket.pageViews += Number(row.conversions || 0);
  }

  // ── 4. Leads + MQL classification ──
  for (const l of leads) {
    const source = getSourceGroup(l.utm_source);
    const bucket = ensureBucket(toMonth(l.submitted_at), source);
    if (!bucket) continue;
    bucket.leads += 1;
    if (classifyLead(l.lead_revenue_range, l.lead_monthly_volume, l.lead_segment, l.lead_market) === 'MQL') {
      bucket.mqls += 1;
    }
  }

  // ── 5. Deals — cumulative stage counting (Bowtie V2 pattern) ──
  // Atribuição via email JOIN: crm_deals não tem utm_source, usar lead_email→utm_source
  const emailSourceMap = {};
  for (const l of leads) {
    if (l.lead_email) {
      emailSourceMap[l.lead_email.trim().toLowerCase()] = getSourceGroup(l.utm_source);
    }
  }

  for (const d of deals) {
    if (d.status === 'deleted') continue;
    const dealEmail = d.person_email?.trim().toLowerCase();
    const source = emailSourceMap[dealEmail] || 'S/Track';
    const bucket = ensureBucket(toMonth(d.deal_created_at), source);
    if (!bucket) continue;

    // SQL: cf_sql_flag check (AD-V2-9 pattern — alinhado V1/V2)
    const isSQL = (d.cf_sql_flag ?? null) == CUSTOM_FIELDS.SQL_FLAG.values.SIM;
    if (isSQL) bucket.sqls += 1;

    // Reunião/Proposta/Venda: stage_id cumulative (Bowtie pattern)
    const isVenda = d.status === 'won';
    const inProposta = STAGE_IDS.PROPOSTA.includes(d.stage_id) || STAGE_IDS.CONTRATO_ENVIADO.includes(d.stage_id);
    const inReuniao = STAGE_IDS.REUNIAO_AGENDADA.includes(d.stage_id);

    if (isVenda) {
      bucket.sales += 1;
      bucket.revenue += Number(d.value || 0);
    }
    if (inReuniao || inProposta || isVenda) bucket.reunioes += 1;
    if (inProposta || isVenda) bucket.propostas += 1;
  }

  // ── 6. Aggregate bySource totals ──
  const bySource = Object.fromEntries(SOURCES.map(s => [s, initSourceMetrics()]));
  const sortedMonths = Object.keys(monthlyData).sort();

  for (const month of sortedMonths) {
    for (const source of SOURCES) {
      sumRawMetrics(monthlyData[month][source], bySource[source]);
    }
  }

  // ── 7. Totals = sum of all sources (FR128: garante paridade exata) ──
  const totals = initSourceMetrics();
  for (const source of SOURCES) {
    sumRawMetrics(bySource[source], totals);
  }

  // ── 8. Derived metrics for all buckets ──
  for (const source of SOURCES) calculateDerivedMetrics(bySource[source]);
  calculateDerivedMetrics(totals);
  for (const month of sortedMonths) {
    for (const source of SOURCES) calculateDerivedMetrics(monthlyData[month][source]);
  }

  // ── 9. Output shape ──
  if (isComparison) {
    // Modo comparativo: { totals, bySource, timeline }
    const timeline = sortedMonths.map(month => {
      const monthTotals = initSourceMetrics();
      for (const source of SOURCES) sumRawMetrics(monthlyData[month][source], monthTotals);
      calculateDerivedMetrics(monthTotals);
      return {
        month,
        bySource: Object.fromEntries(SOURCES.map(s => [s, { ...monthlyData[month][s] }])),
        totals: monthTotals,
      };
    });
    return { totals, bySource, timeline };
  }

  // Modo single-source: { totals, monthly }
  const sourceName = SOURCE_ID_MAP[sourceFilter[0]] || 'S/Track';
  const monthly = sortedMonths.map(month => ({
    month,
    ...monthlyData[month][sourceName],
  }));

  return { totals: bySource[sourceName], monthly };
}

// ── Helpers ──────────────────────────────────────────────────────

/** Extract 'YYYY-MM' from a date string. */
function toMonth(dateStr) {
  return dateStr ? dateStr.slice(0, 7) : null;
}

function initSourceMetrics() {
  return {
    // # Números (9 raw + spend + revenue)
    spend: 0, impressions: 0, clicks: 0, pageViews: 0,
    leads: 0, mqls: 0, sqls: 0, reunioes: 0, propostas: 0, sales: 0, revenue: 0,
    // % Premissas (4 derived)
    ctr: 0, cr: 0, cc: 0, qm: 0,
    // R$ Financeiro (10 derived — inclui spend como raw base)
    cpm: 0, cpc: 0, cpv: 0, cpl: 0, cpmql: 0, cpsql: 0, cpreuniao: 0, cpproposta: 0, cac: 0, roas: 0,
  };
}

/** Sum raw metric keys from src into dst (mutates dst). */
function sumRawMetrics(src, dst) {
  for (const key of RAW_KEYS) dst[key] += src[key];
}

/** Calculate derived metrics (% Premissas + R$ Financeiro). Division by zero → 0. */
function calculateDerivedMetrics(m) {
  const safe = (num, den) => den > 0 ? num / den : 0;
  // % Premissas (4 rows)
  m.ctr = safe(m.clicks, m.impressions);
  m.cr = safe(m.pageViews, m.clicks);
  m.cc = safe(m.leads, m.pageViews);
  m.qm = safe(m.mqls, m.leads);
  // R$ Financeiro (10 rows)
  m.cpm = safe(m.spend, m.impressions) * 1000; // CPM = spend/impressions × 1000
  m.cpc = safe(m.spend, m.clicks);
  m.cpv = safe(m.spend, m.pageViews);
  m.cpl = safe(m.spend, m.leads);
  m.cpmql = safe(m.spend, m.mqls);
  m.cpsql = safe(m.spend, m.sqls);
  m.cpreuniao = safe(m.spend, m.reunioes);
  m.cpproposta = safe(m.spend, m.propostas);
  m.cac = safe(m.spend, m.sales);
  m.roas = m.spend > 0 ? safe(m.revenue, m.spend) : null;
}
