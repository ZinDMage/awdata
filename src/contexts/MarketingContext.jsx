import { createContext, useContext, useState, useMemo, useCallback } from 'react';
import { useMetrics } from './MetricsContext';

const MarketingContext = createContext(null);

export function MarketingProvider({ children }) {
  const { sourceFilter } = useMetrics();
  
  // Tab/Sub-view state
  const [activeSubView, setActiveSubView] = useState('marketing-kpis'); // 'marketing-kpis' | 'marketing-performance'
  const [analysisMode, setAnalysisMode] = useState('analysis'); // 'analysis' | 'charts'
  const [activePerformanceTab, setActivePerformanceTab] = useState('overview'); // 'overview' | 'campaign' | 'ad' | 'daily'
  
  // AD-V3-8: comparisonMode is derived from sourceFilter
  const comparisonMode = useMemo(() => {
    return sourceFilter.includes('todos') || sourceFilter.length > 1;
  }, [sourceFilter]);

  const value = useMemo(() => ({
    activeSubView, setActiveSubView,
    analysisMode, setAnalysisMode,
    activePerformanceTab, setActivePerformanceTab,
    comparisonMode
  }), [activeSubView, analysisMode, activePerformanceTab, comparisonMode]);

  return (
    <MarketingContext.Provider value={value}>
      {children}
    </MarketingContext.Provider>
  );
}

export function useMarketing() {
  const ctx = useContext(MarketingContext);
  if (!ctx) throw new Error('useMarketing must be used within MarketingProvider');
  return ctx;
}
