import { Suspense, lazy, useState, useCallback, useMemo } from 'react';
import { useMarketing } from '@/contexts/MarketingContext';
import MarketingHeader from '@/components/MarketingHeader';
import SourceMappingPanel from '@/components/marketing/SourceMappingPanel';
import LinkedInPlaceholder from '@/components/marketing/LinkedInPlaceholder';
import SkeletonLoader from '@/components/SkeletonLoader';

// Hooks — each epic's dev implements their hook internals
import { useMarketingKPIs } from '@/hooks/marketing/useMarketingKPIs';
import { usePerformanceOverview } from '@/hooks/marketing/usePerformanceOverview';
import { usePerformanceCampaign } from '@/hooks/marketing/usePerformanceCampaign';
import { usePerformanceAdDaily } from '@/hooks/marketing/usePerformanceAdDaily';
import { useSyncStatus } from '@/hooks/marketing/useSyncStatus';

// Lazy load sub-views
const KPIsADSView = lazy(() => import('@/components/KPIsADSView'));
const PerformanceADSView = lazy(() => import('@/components/PerformanceADSView'));

// FR93: Performance ADS tabs — definido aqui pois MarketingView é o orquestrador (AD-V3-6)
const PERFORMANCE_TABS = [
  { id: 'overview',  label: 'Overview' },
  { id: 'campaign',  label: 'Por Campanha' },
  { id: 'ad',        label: 'Por Anúncio' },
  { id: 'daily',     label: 'Diário' },
];

// AD-V3-6: MarketingView é o ÚNICO consumidor do MarketingContext
// D2: MarketingProvider lifted to Dashboard — this component consumes context directly
// FR92, FR93
export default function MarketingView({ dk }) {
  const {
    activeSubView,
    analysisMode,
    setAnalysisMode,
    activePerformanceTab,
    setActivePerformanceTab,
    comparisonMode,
    sourceFilter,
    years,
    sM,
    selectedFunnels,
    performanceDateRange,
    setPerformanceDateRange,
  } = useMarketing();

  // ── Data hooks — each dev implements their hook's useEffect ──
  const kpisData = useMarketingKPIs();                  // Epic 3
  const overviewData = usePerformanceOverview();         // Epic 4
  const campaignData = usePerformanceCampaign();         // Epic 5
  const adDailyData = usePerformanceAdDaily();           // Epic 6
  const syncData = useSyncStatus();                      // Epic 7

  // FR93, UX-DR2: props dinâmicas do MarketingHeader baseadas em activeSubView
  const headerTitle = activeSubView === 'marketing-kpis' ? 'KPIs ADS' : 'Performance ADS';
  const headerToggle = activeSubView === 'marketing-kpis'
    ? { mode: analysisMode, onChange: setAnalysisMode }
    : undefined;
  const headerTabs = activeSubView === 'marketing-performance'
    ? { active: activePerformanceTab, items: PERFORMANCE_TABS, onChange: setActivePerformanceTab }
    : undefined;

  // Epic 7: sync status — passed as-is, MarketingHeader handles nulls
  const syncStatus = { meta: syncData.meta, google: syncData.google, linkedin: syncData.linkedin };

  // FR122, UX-DR14: LinkedIn-only → placeholder (Story 7.5)
  const isLinkedinOnly = useMemo(() =>
    sourceFilter?.length === 1 && sourceFilter[0] === 'linkedin',
    [sourceFilter]
  );

  // FR125: Source Mapping ConfigPanel state (Story 7.4)
  const [showSourceMapping, setShowSourceMapping] = useState(false);
  const handleMappingChange = useCallback(() => {
    // Notify hooks/consumers that source mapping changed — opt-in via event listener
    window.dispatchEvent(new CustomEvent('source-mapping-changed'));
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <MarketingHeader
        title={headerTitle}
        toggle={headerToggle}
        tabs={headerTabs}
        syncStatus={syncStatus}
        onSettingsClick={() => setShowSourceMapping(true)}
      />
      <SourceMappingPanel
        open={showSourceMapping}
        onClose={() => setShowSourceMapping(false)}
        onMappingChange={handleMappingChange}
      />
      {/* FR122, UX-DR14: LinkedIn-only intercepta ANTES das sub-views (Story 7.5) */}
      {isLinkedinOnly ? (
        <LinkedInPlaceholder />
      ) : (
        <Suspense fallback={<SkeletonLoader />}>
          {activeSubView === 'marketing-kpis' && (
            <KPIsADSView
              analysisMode={analysisMode}
              comparisonMode={comparisonMode}
              sourceFilter={sourceFilter}
              years={years}
              sM={sM}
              selectedFunnels={selectedFunnels}
              data={kpisData.data}
              loading={kpisData.loading}
              error={kpisData.error}
              dk={dk}
            />
          )}
          {activeSubView === 'marketing-performance' && (
            <PerformanceADSView
              activePerformanceTab={activePerformanceTab}
              comparisonMode={comparisonMode}
              sourceFilter={sourceFilter}
              years={years}
              sM={sM}
              selectedFunnels={selectedFunnels}
              performanceDateRange={performanceDateRange}
              setPerformanceDateRange={setPerformanceDateRange}
              overviewData={overviewData}
              campaignData={campaignData}
              adDailyData={adDailyData}
            />
          )}
        </Suspense>
      )}
    </div>
  );
}
