/**
 * dailyService.js
 * Data fetching for the Daily view — daily breakdown + funnel comparison.
 */
import { fetchAll } from '@/services/fetchService';
import { classifyLead } from '@/services/classificationService';
import { CUSTOM_FIELDS, PIPELINE_FUNNELS, getFunnelKey } from '@/config/pipedrive';
import { JSONB_FIELDS } from '@/config/queryColumns';
import { cachedQuery } from '@/services/queryCache';
import { getUtmValuesForSource } from '@/config/sourceMapping';

// ── Helpers ──────────────────────────────────────────────────────

function buildSourceFilters(sourceFilter, utmField) {
  if (!sourceFilter || sourceFilter.includes('todos')) return [];
  const allUtmValues = [];
  let includesStrack = false;
  for (const sourceId of sourceFilter) {
    if (sourceId === 'strack') { includesStrack = true; const sv = getUtmValuesForSource('strack'); if (sv) allUtmValues.push(...sv); continue; }
    const vals = getUtmValuesForSource(sourceId);
    if (vals) allUtmValues.push(...vals);
  }
  if (includesStrack) {
    const validValues = allUtmValues.filter(v => v !== '' && v != null);
    const quoted = validValues.map(v => `"${v.replace(/"/g, '""')}"`).join(',');
    const parts = [`${utmField}.is.null`];
    if (validValues.length > 0) parts.push(`${utmField}.in.(${quoted})`);
    parts.push(`${utmField}.eq.""`);
    return [{ op: 'or', field: parts.join(',') }];
  }
  if (allUtmValues.length > 0) return [{ op: 'in', field: utmField, value: allUtmValues }];
  return [];
}

/** Get day string YYYY-MM-DD from a date string */
function toDay(dateStr) {
  if (!dateStr) return null;
  return String(dateStr).slice(0, 10);
}

/** Next month string for exclusive range (e.g., '2026-03' → '2026-04-01') */
function nextMonthStart(ym) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m, 1); // m is already 1-indexed, Date treats as next month
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

// ── Daily Breakdown ──────────────────────────────────────────────

/**
 * Fetch daily metrics for a date range.
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate   - YYYY-MM-DD (inclusive)
 * @param {string[]} sourceFilter
 * @returns {{ days: Array<{ date, leads, mqls, sqls, rAg, rRe, vendas, spend, impressions, clicks }> }}
 */
export async function fetchDailyBreakdown(startDate, endDate, sourceFilter) {
  const endExclusive = addDay(endDate);
  const cacheKey = `daily:${startDate}:${endDate}:${JSON.stringify(sourceFilter || ['todos'])}`;

  return cachedQuery(cacheKey, async () => {
    const sourceYayFilters = buildSourceFilters(sourceFilter || ['todos'], 'utm_source');

    const [yayRes, dealsRes, metaRes, googleRes] = await Promise.all([
      fetchAll('yayforms_responses', 'submitted_at, lead_email, lead_revenue_range, lead_monthly_volume, lead_segment, lead_market', [
        { op: 'gte', field: 'submitted_at', value: startDate },
        { op: 'lt', field: 'submitted_at', value: endExclusive },
        ...sourceYayFilters,
      ]),
      fetchAll('crm_deals', `deal_created_at, stage_id, status, pipeline_id, person_email, value, won_time, ${JSONB_FIELDS.SQL_FLAG}, ${JSONB_FIELDS.DATA_REUNIAO}, ${JSONB_FIELDS.REUNIAO_REALIZADA}`, [
        { op: 'gte', field: 'deal_created_at', value: startDate },
        { op: 'lt', field: 'deal_created_at', value: endExclusive },
      ]),
      fetchAll('meta_ads_costs', 'spend, impressions, date_start', [
        { op: 'gte', field: 'date_start', value: startDate },
        { op: 'lt', field: 'date_start', value: endExclusive },
      ]),
      fetchAll('google_ads_costs', 'spend, impressions, clicks, date', [
        { op: 'gte', field: 'date', value: startDate },
        { op: 'lt', field: 'date', value: endExclusive },
      ]),
    ]);

    const leads = yayRes.data || [];
    const deals = dealsRes.data || [];
    const meta = metaRes.data || [];
    const google = googleRes.data || [];

    // Source filter for deals via email cross-ref
    const hasSourceFilter = sourceFilter && !sourceFilter.includes('todos');
    let filteredDeals = deals;
    if (hasSourceFilter && leads.length) {
      const leadEmails = new Set(leads.map(l => l.lead_email).filter(Boolean));
      filteredDeals = deals.filter(d => {
        const email = d.person_email?.toLowerCase().trim();
        return email && leadEmails.has(email);
      });
    }

    // Build daily buckets
    const dayMap = {};
    const ensureDay = (d) => {
      if (!dayMap[d]) dayMap[d] = { date: d, leads: 0, mqls: 0, sqls: 0, rAg: 0, rRe: 0, vendas: 0, spend: 0, impressions: 0, clicks: 0 };
      return dayMap[d];
    };

    // Fill all days in range
    let cursor = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');
    while (cursor <= end) {
      const dayStr = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
      ensureDay(dayStr);
      cursor.setDate(cursor.getDate() + 1);
    }

    // Leads + MQLs
    for (const l of leads) {
      const d = toDay(l.submitted_at);
      if (!d || !dayMap[d]) continue;
      dayMap[d].leads++;
      if (classifyLead(l.lead_revenue_range, l.lead_monthly_volume, l.lead_segment, l.lead_market) === 'MQL') {
        dayMap[d].mqls++;
      }
    }

    // Deals: SQLs, reuniões, vendas — apenas deals com SQL_FLAG=SIM
    const sqlSimVal = CUSTOM_FIELDS.SQL_FLAG.values.SIM;
    const reuniaoSimVal = CUSTOM_FIELDS.REUNIAO_REALIZADA.values.SIM;
    for (const deal of filteredDeals) {
      const d = toDay(deal.deal_created_at);
      if (!d || !dayMap[d]) continue;
      const isSQL = deal.cf_sql_flag == sqlSimVal;
      if (isSQL) {
        dayMap[d].sqls++;
        if (deal.cf_data_reuniao) dayMap[d].rAg++;
        if (deal.cf_reuniao_realizada == reuniaoSimVal) dayMap[d].rRe++;
        if (deal.status === 'won') dayMap[d].vendas++;
      }
    }

    // Ads: spend + impressions + clicks
    const includeMetaAds = !hasSourceFilter || sourceFilter.includes('meta') || sourceFilter.includes('todos');
    const includeGoogleAds = !hasSourceFilter || sourceFilter.includes('google') || sourceFilter.includes('todos');

    if (includeMetaAds) {
      for (const row of meta) {
        const d = toDay(row.date_start);
        if (!d || !dayMap[d]) continue;
        dayMap[d].spend += Number(row.spend || 0);
        dayMap[d].impressions += Number(row.impressions || 0);
      }
    }
    if (includeGoogleAds) {
      for (const row of google) {
        const d = toDay(row.date);
        if (!d || !dayMap[d]) continue;
        dayMap[d].spend += Number(row.spend || 0);
        dayMap[d].impressions += Number(row.impressions || 0);
        dayMap[d].clicks += Number(row.clicks || 0);
      }
    }

    const days = Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date));
    return { days };
  }, 10 * 60 * 1000);
}

function addDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

// ── Funnel Comparison ────────────────────────────────────────────

/**
 * Fetch funnel data for a single month.
 * Returns totals + breakdown by market and revenue range.
 */
async function fetchMonthFunnelData(month, sourceFilter) {
  const startDate = `${month}-01`;
  const endDate = nextMonthStart(month);
  const sourceYayFilters = buildSourceFilters(sourceFilter || ['todos'], 'utm_source');

  const [yayRes, dealsRes] = await Promise.all([
    fetchAll('yayforms_responses', 'submitted_at, lead_email, lead_revenue_range, lead_monthly_volume, lead_segment, lead_market', [
      { op: 'gte', field: 'submitted_at', value: startDate },
      { op: 'lt', field: 'submitted_at', value: endDate },
      ...sourceYayFilters,
    ]),
    fetchAll('crm_deals', `deal_created_at, stage_id, status, pipeline_id, person_email, value, won_time, ${JSONB_FIELDS.SQL_FLAG}, ${JSONB_FIELDS.DATA_REUNIAO}, ${JSONB_FIELDS.REUNIAO_REALIZADA}`, [
      { op: 'gte', field: 'deal_created_at', value: startDate },
      { op: 'lt', field: 'deal_created_at', value: endDate },
    ]),
  ]);

  const leads = yayRes.data || [];
  const deals = dealsRes.data || [];

  // Source filter for deals
  const hasSourceFilter = sourceFilter && !sourceFilter.includes('todos');
  let filteredDeals = deals;
  if (hasSourceFilter && leads.length) {
    const leadEmails = new Set(leads.map(l => l.lead_email).filter(Boolean));
    filteredDeals = deals.filter(d => {
      const email = d.person_email?.toLowerCase().trim();
      return email && leadEmails.has(email);
    });
  }

  // Build email→lead lookup for enriching deals with market/revenue
  const leadByEmail = {};
  for (const l of leads) {
    if (l.lead_email) leadByEmail[l.lead_email] = l;
  }

  // Classify leads
  const classifiedLeads = leads.map(l => ({
    ...l,
    classification: classifyLead(l.lead_revenue_range, l.lead_monthly_volume, l.lead_segment, l.lead_market),
    market: l.lead_market || 'Não informado',
    revenue: l.lead_revenue_range || 'Não informado',
    volume: l.lead_monthly_volume || 'Não informado',
  }));

  const sqlSimVal = CUSTOM_FIELDS.SQL_FLAG.values.SIM;
  const reuniaoSimVal = CUSTOM_FIELDS.REUNIAO_REALIZADA.values.SIM;

  // Enrich deals with market/revenue from yayforms
  const enrichedDeals = filteredDeals.map(d => {
    const email = d.person_email?.toLowerCase().trim();
    const lead = email ? leadByEmail[email] : null;
    return {
      ...d,
      market: lead?.lead_market || 'Não informado',
      revenue: lead?.lead_revenue_range || 'Não informado',
      volume: lead?.lead_monthly_volume || 'Não informado',
      isSQL: d.cf_sql_flag == sqlSimVal,
      hasReuniao: !!d.cf_data_reuniao,
      reuniaoRealizada: d.cf_reuniao_realizada == reuniaoSimVal,
    };
  });

  // Aggregate totals — cohort view: vendas = deals criados no mês que foram ganhos (SQL only)
  const wonSqlDeals = enrichedDeals.filter(d => d.isSQL && d.status === 'won');
  const totals = {
    leads: classifiedLeads.length,
    mqls: classifiedLeads.filter(l => l.classification === 'MQL').length,
    sqls: enrichedDeals.filter(d => d.isSQL).length,
    rAg: enrichedDeals.filter(d => d.isSQL && d.hasReuniao).length,
    rRe: enrichedDeals.filter(d => d.isSQL && d.reuniaoRealizada).length,
    vendas: wonSqlDeals.length,
    receita: wonSqlDeals.reduce((s, d) => s + Number(d.value || 0), 0),
  };

  // Breakdown by market
  const byMarket = {};
  const ensureMarket = (m) => {
    if (!byMarket[m]) byMarket[m] = { leads: 0, mqls: 0, sqls: 0, rAg: 0, rRe: 0, vendas: 0 };
    return byMarket[m];
  };

  for (const l of classifiedLeads) {
    const bucket = ensureMarket(l.market);
    bucket.leads++;
    if (l.classification === 'MQL') bucket.mqls++;
  }
  for (const d of enrichedDeals) {
    if (!d.isSQL) continue;
    const bucket = ensureMarket(d.market);
    bucket.sqls++;
    if (d.hasReuniao) bucket.rAg++;
    if (d.reuniaoRealizada) bucket.rRe++;
    if (d.status === 'won') bucket.vendas++;
  }

  // Breakdown by revenue range
  const byRevenue = {};
  const ensureRevenue = (r) => {
    if (!byRevenue[r]) byRevenue[r] = { leads: 0, mqls: 0, sqls: 0 };
    return byRevenue[r];
  };
  for (const l of classifiedLeads) {
    const bucket = ensureRevenue(l.revenue);
    bucket.leads++;
    if (l.classification === 'MQL') bucket.mqls++;
  }
  for (const d of enrichedDeals) {
    if (d.isSQL) ensureRevenue(d.revenue).sqls++;
  }

  // Breakdown by monthly ticket volume
  const byVolume = {};
  const ensureVolume = (v) => {
    if (!byVolume[v]) byVolume[v] = { leads: 0, mqls: 0, sqls: 0 };
    return byVolume[v];
  };
  for (const l of classifiedLeads) {
    const bucket = ensureVolume(l.volume);
    bucket.leads++;
    if (l.classification === 'MQL') bucket.mqls++;
  }
  for (const d of enrichedDeals) {
    if (d.isSQL) ensureVolume(d.volume).sqls++;
  }

  return { totals, byMarket, byRevenue, byVolume };
}

/**
 * Compare two months' funnel data.
 * @param {string} monthA - YYYY-MM
 * @param {string} monthB - YYYY-MM
 * @param {string[]} sourceFilter
 */
export async function fetchFunnelComparison(monthA, monthB, sourceFilter) {
  const cacheKey = `funnel-cmp:${monthA}:${monthB}:${JSON.stringify(sourceFilter || ['todos'])}`;
  return cachedQuery(cacheKey, async () => {
    const [dataA, dataB] = await Promise.all([
      fetchMonthFunnelData(monthA, sourceFilter),
      fetchMonthFunnelData(monthB, sourceFilter),
    ]);
    return { monthA: dataA, monthB: dataB };
  }, 10 * 60 * 1000);
}
