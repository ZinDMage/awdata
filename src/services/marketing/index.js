// Marketing Service — barrel re-export for backwards compatibility
// Each epic's dev modifies ONLY their service file.
export { fetchKPIsADS } from './kpisAdsService';
export { fetchPerformanceOverview } from './performanceOverviewService';
export { fetchPerformanceByCampaign } from './performanceCampaignService';
export { fetchPerformanceByAd, fetchPerformanceDaily } from './performanceAdDailyService';
export { fetchSyncStatus } from './syncService';
