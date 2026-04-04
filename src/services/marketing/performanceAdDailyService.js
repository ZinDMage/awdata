import { supabase } from '../supabaseClient';
import { cachedQuery } from '@/services/queryCache';
import { buildDateRange, calcEfficiencyScore, detectDailyAnomalies } from '@/utils/marketingCalcs';

// ── Source Filter → RPC p_source mapper ──────────────────────── // AD-V3-3
// RPCs filtram por tabela-fonte ('meta' → meta_ads_costs, 'google' → google_ads_costs).
// sourceFilter pill ids mapeiam 1:1 para os source ids suportados pelo RPC.
const ADS_SOURCE_IDS = ['meta', 'google'];

/** @param {string[]} sourceFilter — pill ids do FilterBar (ex: ['todos'], ['meta']) */
function mapSourceFilter(sourceFilter) {
  if (!sourceFilter || sourceFilter.includes('todos')) return null;
  const sources = sourceFilter.filter(s => ADS_SOURCE_IDS.includes(s));
  return sources.length > 0 ? sources : null;
}

/**
 * Fetches individual ad performance data (Epic 6). // FR115
 * Chama RPC rpc_ads_by_ad com paginação server-side.
 * Calcula scoreEficiencia via calcEfficiencyScore(). // AD-V3-9
 * @param {string[]} sourceFilter
 * @param {string[]} years
 * @param {string[]} months
 * @param {number} page
 * @param {number} pageSize
 * @returns {Promise<{ ads: object[], total: number, page: number }>}
 */
export async function fetchPerformanceByAd(sourceFilter, years, months, page = 1, pageSize = 25) {
  // F8: retornar vazio se source filter explícito não tem match válido em ADS_SOURCE_IDS
  const hasExplicitFilter = sourceFilter && !sourceFilter.includes('todos');
  const sources = mapSourceFilter(sourceFilter);
  if (hasExplicitFilter && !sources) return { ads: [], total: 0, page };

  const { startDate, endDate } = buildDateRange(years, months);
  const key = `mkt-ads-by-ad-${(sources || ['todos']).join(',')}-${startDate}-${endDate}-${page}-${pageSize}`;

  return await cachedQuery(key, async () => {
    const { data, error } = await supabase.rpc('rpc_ads_by_ad', {
      p_source: sources,
      p_start_date: startDate,
      p_end_date: endDate,
      p_page: page,
      p_page_size: pageSize,
    });
    if (error) throw error;

    const ads = data?.data || [];
    // MQL/SQL por anúncio: 0 nesta story (atribuição UTM é cross-cutting, Story 5.2b)
    const enriched = ads.map(ad => ({
      ...ad,
      mql: 0,
      sql: 0,
      custoMQL: 0,
      custoSQL: 0,
      // F1: nested sob scoreEficiencia (consistente com performanceOverviewService)
      scoreEficiencia: calcEfficiencyScore(0, 0, ad.total_spend || 0),
    }));

    return { ads: enriched, total: data?.total_count || 0, page };
  }, 5 * 60 * 1000);
}

/**
 * Fetches daily performance data with date range (Epic 6). // FR117
 * Chama RPC rpc_ads_daily. Suporta filtro opcional por campaignId.
 * @param {string[]} sourceFilter
 * @param {string} startDate
 * @param {string} endDate
 * @param {string} [campaignId]
 * @returns {Promise<{ daily: object[], anomalies: object[] }>}
 */
export async function fetchPerformanceDaily(sourceFilter, startDate, endDate, campaignId) {
  // F8: retornar vazio se source filter explícito não tem match válido
  const hasExplicitFilter = sourceFilter && !sourceFilter.includes('todos');
  const sources = mapSourceFilter(sourceFilter);
  if (hasExplicitFilter && !sources) return { daily: [], anomalies: [] };

  const key = `mkt-ads-daily-${(sources || ['todos']).join(',')}-${startDate}-${endDate}-${campaignId || 'all'}`;

  return await cachedQuery(key, async () => {
    const { data, error } = await supabase.rpc('rpc_ads_daily', {
      p_source: sources,
      p_start_date: startDate,
      p_end_date: endDate,
      p_campaign_id: campaignId || null,
    });
    if (error) throw error;

    // FR119: Anomaly detection (Story 6.5)
    const rows = data || [];
    return { daily: rows, anomalies: detectDailyAnomalies(rows) };
  }, 5 * 60 * 1000);
}
