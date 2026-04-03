// Backwards compatibility — re-exports from modular services
// New code should import directly from '@/services/marketing/...'
export { fetchKPIsADS } from './marketing/kpisAdsService';
export { fetchPerformanceOverview } from './marketing/performanceOverviewService';
export { fetchPerformanceByCampaign } from './marketing/performanceCampaignService';
export { fetchPerformanceByAd, fetchPerformanceDaily } from './marketing/performanceAdDailyService';
export { fetchSyncStatus } from './marketing/syncService';
