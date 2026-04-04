import { createContext, useContext, useState, useMemo, useEffect } from 'react';
import { useMetrics } from '@/contexts/MetricsContext'; // P4: alias @/

const MarketingContext = createContext(null);

// P5: module-scope — no re-creation per render
const safeGet = (storage, key, fallback) => {
  try { if (typeof window !== 'undefined') return storage.getItem(key) ?? fallback; } catch { /* ignore */ } // P2: ?? instead of ||
  return fallback;
};
const safeSet = (storage, key, val) => {
  try { if (typeof window !== 'undefined') storage.setItem(key, val); } catch { /* ignore */ }
};

const VALID_SUBVIEWS = ['marketing-kpis', 'marketing-performance'];
const VALID_ANALYSIS_MODES = ['analysis', 'charts'];
const VALID_PERF_TABS = ['overview', 'campaign', 'ad', 'daily'];

export function MarketingProvider({ children }) {
  // FR94: herança de filtros globais do MetricsContext (leitura only)
  const { sourceFilter, years, sM, selectedFunnels } = useMetrics();

  // ── Tab/Sub-view state with sessionStorage persistence ── // FR95
  // D2: MarketingContext é o owner único de activeSubView
  const [activeSubView, setActiveSubView] = useState(() => {
    const stored = safeGet(sessionStorage, 'awdata-mkt-subview', null);
    return VALID_SUBVIEWS.includes(stored) ? stored : 'marketing-kpis';
  });

  const [analysisMode, setAnalysisMode] = useState(() => {
    const stored = safeGet(sessionStorage, 'awdata-mkt-analysis', null);
    return VALID_ANALYSIS_MODES.includes(stored) ? stored : 'analysis';
  });
  const [activePerformanceTab, setActivePerformanceTab] = useState(() => {
    const stored = safeGet(sessionStorage, 'awdata-mkt-perftab', null);
    return VALID_PERF_TABS.includes(stored) ? stored : 'overview';
  });

  // ── Performance date range (AC #4 — default null, Epic 6 resolverá) ──
  const [performanceDateRange, setPerformanceDateRange] = useState(() => {
    const stored = safeGet(sessionStorage, 'awdata-mkt-daterange', null);
    if (stored) { try { return JSON.parse(stored); } catch { /* ignore */ } }
    return null;
  });

  // React useState setters are already stable references — no useCallback needed

  // ── SessionStorage persistence ──
  useEffect(() => { safeSet(sessionStorage, 'awdata-mkt-subview', activeSubView); }, [activeSubView]);
  useEffect(() => { safeSet(sessionStorage, 'awdata-mkt-analysis', analysisMode); }, [analysisMode]);
  useEffect(() => { safeSet(sessionStorage, 'awdata-mkt-perftab', activePerformanceTab); }, [activePerformanceTab]);
  // P1: persist date range — remove key when null to avoid storing "null" string
  useEffect(() => {
    if (performanceDateRange !== null) {
      safeSet(sessionStorage, 'awdata-mkt-daterange', JSON.stringify(performanceDateRange));
    } else {
      try { sessionStorage.removeItem('awdata-mkt-daterange'); } catch { /* ignore */ }
    }
  }, [performanceDateRange]);

  // AD-V3-8: comparisonMode is derived from sourceFilter
  const comparisonMode = useMemo(() => {
    const sf = sourceFilter ?? ['todos'];
    return sf.includes('todos') || sf.length > 1;
  }, [sourceFilter]);

  // Split memos: local state changes don't re-create filters object and vice-versa
  const filters = useMemo(() => ({
    comparisonMode, sourceFilter, years, sM, selectedFunnels,
  }), [comparisonMode, sourceFilter, years, sM, selectedFunnels]);

  const value = useMemo(() => ({
    activeSubView, setActiveSubView,
    analysisMode, setAnalysisMode,
    activePerformanceTab, setActivePerformanceTab,
    performanceDateRange, setPerformanceDateRange,
    // FR95: filtros herdados do MetricsContext (conveniência para consumidores)
    ...filters,
  }), [activeSubView, analysisMode, activePerformanceTab, performanceDateRange, filters]);

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
