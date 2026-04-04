import { createContext, useContext, useState, useMemo } from 'react';
import { useMetrics } from '@/contexts/MetricsContext'; // FR89: source filter propagation
import usePillCounts from '@/hooks/usePillCounts';
import useBowtieData from '@/hooks/useBowtieData';
import useTabData from '@/hooks/useTabData';
import useDealModal from '@/hooks/useDealModal';

function getCurrentMonth() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

const GerencialContext = createContext(null);

export function GerencialProvider({ children }) {
  // ── Source filter from MetricsContext (FR89) ──
  const { sourceFilter } = useMetrics();

  // ── State ──
  const [activeTab, setActiveTab] = useState('bowtie');
  const [selectedFunnel, setSelectedFunnel] = useState('todos');
  const [bowtiePeriod, setBowtiePeriod] = useState(() => {
    const current = getCurrentMonth();
    return { startMonth: '2026-01', endMonth: current };
  });

  // ── Hooks (stale-while-revalidate) ──
  const pillCounts = usePillCounts(selectedFunnel, sourceFilter);
  const bowtieData = useBowtieData(bowtiePeriod, selectedFunnel, sourceFilter);
  const tabData = useTabData(activeTab, selectedFunnel, sourceFilter);
  const dealModal = useDealModal();

  // ── Memoize hook results to stabilize context value ──
  const stablePillCounts = useMemo(() => pillCounts, [pillCounts.data, pillCounts.loading, pillCounts.isRefetching, pillCounts.error]);
  const stableBowtieData = useMemo(() => bowtieData, [bowtieData.data, bowtieData.loading, bowtieData.isRefetching, bowtieData.error]);
  const stableTabData = useMemo(() => tabData, [tabData.data, tabData.loading, tabData.isRefetching, tabData.error]);
  const stableDealModal = useMemo(() => dealModal, [dealModal.selectedDealId, dealModal.data, dealModal.loading, dealModal.error]);

  // ── Context value (memoized) ──
  const value = useMemo(() => ({
    // State
    activeTab,
    selectedFunnel,
    bowtiePeriod,
    sourceFilter, // FR89: exposed for components that need it

    // Setters
    setActiveTab,
    setSelectedFunnel,
    setBowtiePeriod,

    // Hook results
    pillCounts: stablePillCounts,
    bowtieData: stableBowtieData,
    tabData: stableTabData,
    dealModal: stableDealModal,
  }), [activeTab, selectedFunnel, bowtiePeriod, sourceFilter, stablePillCounts, stableBowtieData, stableTabData, stableDealModal]);

  return (
    <GerencialContext.Provider value={value}>
      {children}
    </GerencialContext.Provider>
  );
}

export function useGerencial() {
  const ctx = useContext(GerencialContext);
  if (!ctx) throw new Error('useGerencial must be used within GerencialProvider');
  return ctx;
}
