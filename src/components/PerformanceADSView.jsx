import { Suspense, lazy, useMemo } from 'react';
import EmptyState from '@/components/EmptyState';
import { getSourceEmptyMessage } from '@/utils/marketingCalcs';

// FR93, AD-V3-6: props puras — NÃO consome context diretamente
// Pre-wired: each tab routes to its own lazy component (Epics 4-6)

// Lazy load tab components — each dev implements their component independently
const PerformanceOverview = lazy(() => import('@/components/marketing/PerformanceOverview'));
const PerformanceByCampaign = lazy(() => import('@/components/marketing/PerformanceByCampaign'));
const PerformanceByAd = lazy(() => import('@/components/marketing/PerformanceByAd'));
const PerformanceDaily = lazy(() => import('@/components/marketing/PerformanceDaily'));

export default function PerformanceADSView({
  activePerformanceTab,
  comparisonMode,
  sourceFilter,
  years,
  sM,
  selectedFunnels,
  performanceDateRange,
  setPerformanceDateRange,
  overviewData,
  campaignData,
  adDailyData,
}) {
  // FR122, AC#2: Detectar empty state por tab e aplicar mensagem source-aware (Story 7.5)
  const sourceEmptyMsg = useMemo(
    () => getSourceEmptyMessage(sourceFilter, null),
    [sourceFilter]
  );

  const isTabEmpty = useMemo(() => {
    switch (activePerformanceTab) {
      case 'overview':
        // cards é objeto (não array) — checar campos-chave zerados
        return !overviewData.loading && (!overviewData.cards || (!overviewData.cards.investimento && !overviewData.cards.impressoes));
      case 'campaign':
        return !campaignData.loading && (!campaignData.campaigns || campaignData.campaigns.length === 0);
      case 'ad':
        return !adDailyData.loading && (!adDailyData.ads || adDailyData.ads.length === 0);
      case 'daily':
        return !adDailyData.loading && (!adDailyData.daily || adDailyData.daily.length === 0);
      default:
        return false;
    }
  }, [
    activePerformanceTab,
    overviewData.loading, overviewData.cards,
    campaignData.loading, campaignData.campaigns,
    adDailyData.loading, adDailyData.ads, adDailyData.daily,
  ]);

  // Quando source-aware empty e dados vazios, renderizar mensagem antes da sub-view
  if (isTabEmpty && sourceEmptyMsg) {
    return (
      <div className="flex flex-col gap-6">
        <EmptyState message={sourceEmptyMsg.message} />
        {sourceEmptyMsg.suggestion && (
          <p className="text-xs text-content-tertiary/60 mt-2 text-center">{sourceEmptyMsg.suggestion}</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<div className="animate-pulse h-64 bg-surface-secondary/50 rounded-xl" />}>
        {activePerformanceTab === 'overview' && (
          <PerformanceOverview
            cards={overviewData.cards}
            score={overviewData.score}
            dailyChart={overviewData.dailyChart}
            campaignChart={overviewData.campaignChart}
            totalCampaigns={overviewData.totalCampaigns}
            comparisonMode={comparisonMode}
            sourceFilter={sourceFilter}
            loading={overviewData.loading}
            error={overviewData.error}
          />
        )}
        {activePerformanceTab === 'campaign' && (
          <PerformanceByCampaign
            campaigns={campaignData.campaigns}
            total={campaignData.total}
            page={campaignData.page}
            setPage={campaignData.setPage}
            comparisonMode={comparisonMode}
            sourceFilter={sourceFilter}
            loading={campaignData.loading}
            degradedCount={campaignData.degradedCount}
            expandedCampaigns={campaignData.expandedCampaigns}
            expandedAdSets={campaignData.expandedAdSets}
            toggleCampaign={campaignData.toggleCampaign}
            toggleAdSet={campaignData.toggleAdSet}
          />
        )}
        {activePerformanceTab === 'ad' && (
          <PerformanceByAd
            ads={adDailyData.ads}
            totalAds={adDailyData.totalAds}
            pageAds={adDailyData.pageAds}
            setPageAds={adDailyData.setPageAds}
            comparisonMode={comparisonMode}
            sourceFilter={sourceFilter}
            loading={adDailyData.loading}
          />
        )}
        {activePerformanceTab === 'daily' && (
          <PerformanceDaily
            daily={adDailyData.daily}
            anomalies={adDailyData.anomalies}
            performanceDateRange={performanceDateRange}
            setPerformanceDateRange={setPerformanceDateRange}
            comparisonMode={comparisonMode}
            sourceFilter={sourceFilter}
            loading={adDailyData.loading}
          />
        )}
      </Suspense>
    </div>
  );
}
