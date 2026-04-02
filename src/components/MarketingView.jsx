import { Suspense, lazy } from 'react';
import { MarketingProvider, useMarketing } from '@/contexts/MarketingContext';
import SkeletonLoader from './SkeletonLoader';

// Lazy load sub-views
const KPIsADSView = lazy(() => import('./KPIsADSView'));
const PerformanceADSView = lazy(() => import('./PerformanceADSView'));

function MarketingViewContent() {
  const { activeSubView } = useMarketing();
  
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <Suspense fallback={<SkeletonLoader />}>
        {activeSubView === 'marketing-kpis' && <KPIsADSView />}
        {activeSubView === 'marketing-performance' && <PerformanceADSView />}
      </Suspense>
    </div>
  );
}

export default function MarketingView() {
  return (
    <MarketingProvider>
      <MarketingViewContent />
    </MarketingProvider>
  );
}
