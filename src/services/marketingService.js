import { supabase } from './supabaseClient';
import { fetchAll } from './fetchService';
import { classifyLead } from './classificationService';
import { cachedQuery } from '@/services/queryCache';
import { buildDateRange } from '@/utils/marketingCalcs';
import { getSourceGroup, SOURCE_GROUPS } from '@/config/sourceMapping';
import { parseMetaUTM, parseGoogleUTM } from '@/utils/utmParser';

/**
 * Marketing Service for AwData V3
 * Handles all marketing-specific queries and data processing.
 */

/**
 * Fetches data for the KPIs ADS view.
 * @param {string[]} sourceFilter 
 * @param {string[]} years 
 * @param {string[]} months 
 * @param {string[]} funnels 
 */
export async function fetchKPIsADS(sourceFilter, years, months, funnels) {
  const cacheKey = `mkt-kpis-${sourceFilter.join(',')}-${years.join(',')}-${months.join(',')}-${funnels.join(',')}`;
  
  return cachedQuery(cacheKey, async () => {
    const { startDate, endDate } = buildDateRange(years, months);
    
    // Filters for date range
    const adsDateFilter = { gte: ['date_start', startDate], lte: ['date_start', endDate] };
    const googleAdsDateFilter = { gte: ['date', startDate], lte: ['date', endDate] };
    const yearFilter = { gte: ['submitted_at', startDate], lte: ['submitted_at', endDate] };
    const dealsDateFilter = { gte: ['deal_created_at', startDate], lte: ['deal_created_at', endDate] };

    // Parallel fetch
    const [metaCosts, googleCosts, metaActions, leads, deals] = await Promise.all([
      sourceFilter.includes('todos') || sourceFilter.includes('meta')
        ? fetchAll('meta_ads_costs', 'spend, impressions, date_start, campaign_id, adset_id, ad_id', adsDateFilter)
        : { data: [] },
      sourceFilter.includes('todos') || sourceFilter.includes('google')
        ? fetchAll('google_ads_costs', 'spend, impressions, clicks, conversions, date, campaign_id', googleAdsDateFilter)
        : { data: [] },
      sourceFilter.includes('todos') || sourceFilter.includes('meta')
        ? fetchAll('meta_ads_actions', 'action_type, value, date_start, campaign_id, adset_id, ad_id', adsDateFilter)
        : { data: [] },
      fetchAll('yayforms_responses', 'submitted_at, lead_email, lead_revenue_range, lead_monthly_volume, lead_segment, lead_market, utm_source, utm_campaign, utm_medium, utm_content', yearFilter),
      fetchAll('crm_deals', 'deal_created_at, stage_id, status, value, person_email, won_time, deal_id, utm_source, utm_campaign, utm_medium, utm_content', dealsDateFilter)
    ]);

    return processKPIsADS(metaCosts.data, googleCosts.data, metaActions.data, leads.data, deals.data, sourceFilter);
  }, 5 * 60 * 1000); // 5min TTL
}

/**
 * Processes raw data into KPIs ADS format.
 */
function processKPIsADS(metaCosts, googleCosts, metaActions, leads, deals, sourceFilter) {
  const sources = ['Meta', 'Google', 'LinkedIn', 'Orgânico', 'S/Track'];
  
  // Initialize result structure
  const result = {
    totals: initSourceMetrics(),
    bySource: Object.fromEntries(sources.map(s => [s, initSourceMetrics()])),
    timeline: [] // For charts later
  };

  // 1. Process Ad Spend & Reach (Meta)
  metaCosts.forEach(row => {
    const s = 'Meta';
    result.bySource[s].spend += Number(row.spend || 0);
    result.bySource[s].impressions += Number(row.impressions || 0);
    result.totals.spend += Number(row.spend || 0);
    result.totals.impressions += Number(row.impressions || 0);
  });

  // 2. Process Ad Actions (Meta)
  metaActions.forEach(act => {
    const s = 'Meta';
    if (act.action_type === 'unique_outbound_outbound_click') {
      result.bySource[s].clicks += Number(act.value || 0);
      result.totals.clicks += Number(act.value || 0);
    }
    if (act.action_type === 'landing_page_view') {
      result.bySource[s].pageViews += Number(act.value || 0);
      result.totals.pageViews += Number(act.value || 0);
    }
  });

  // 3. Process Ad Spend & Clicks (Google)
  googleCosts.forEach(row => {
    const s = 'Google';
    result.bySource[s].spend += Number(row.spend || 0);
    result.bySource[s].impressions += Number(row.impressions || 0);
    result.bySource[s].clicks += Number(row.clicks || 0);
    result.bySource[s].pageViews += Number(row.conversions || 0);
    result.totals.spend += Number(row.spend || 0);
    result.totals.impressions += Number(row.impressions || 0);
    result.totals.clicks += Number(row.clicks || 0);
    result.totals.pageViews += Number(row.conversions || 0);
  });

  // 4. Process Leads (MQL)
  leads.forEach(l => {
    const s = getSourceGroup(l.utm_source);
    result.bySource[s].leads += 1;
    result.totals.leads += 1;

    const classification = classifyLead(
      l.lead_revenue_range,
      l.lead_monthly_volume,
      l.lead_segment,
      l.lead_market
    );
    if (classification === 'MQL') {
      result.bySource[s].mqls += 1;
      result.totals.mqls += 1;
    }
  });

  // 5. Process Deals (SQL & Sales)
  deals.forEach(d => {
    const s = getSourceGroup(d.utm_source);
    // This is a simplified attribution. In Performance view, we'll use UTM parsing.
    
    // Check if SQL (Using a simplified check here, should match dataService)
    // Actually, SQL is usually a stage or a flag.
    // For V3 KPIs view, we'll count them by source.
    
    // result.bySource[s].sqls += ...
    // result.bySource[s].sales += ...
    // result.bySource[s].revenue += ...
  });

  // Calculate percentages and costs
  sources.concat(['totals']).forEach(sKey => {
    const target = sKey === 'totals' ? result.totals : result.bySource[sKey];
    calculateDerivedMetrics(target);
  });

  return result;
}

function initSourceMetrics() {
  return {
    spend: 0, impressions: 0, clicks: 0, pageViews: 0, leads: 0, mqls: 0, sqls: 0, sales: 0, revenue: 0,
    // Derived
    ctr: 0, cr: 0, cc: 0, qm: 0, qs: 0, 
    cpl: 0, cpmql: 0, cpsql: 0, cac: 0, roas: 0
  };
}

function calculateDerivedMetrics(m) {
  const calcP = (num, den) => den > 0 ? num / den : 0;
  m.ctr = calcP(m.clicks, m.impressions);
  m.cr = calcP(m.pageViews, m.clicks);
  m.cc = calcP(m.leads, m.pageViews);
  m.qm = calcP(m.mqls, m.leads);
  m.qs = calcP(m.sqls, m.mqls);
  
  m.cpl = calcP(m.spend, m.leads);
  m.cpmql = calcP(m.spend, m.mqls);
  m.cpsql = calcP(m.spend, m.sqls);
  m.cac = calcP(m.spend, m.sales);
  m.roas = calcP(m.revenue, m.spend);
}

// Additional functions for Performance view will be added here.
