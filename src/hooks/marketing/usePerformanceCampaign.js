import { useState, useEffect, useRef, useCallback } from 'react';
import { useMarketing } from '@/contexts/MarketingContext';
import {
  fetchPerformanceByCampaign,
  fetchAdSetsByCampaign,
  fetchAdsByAdSet,
} from '@/services/marketing/performanceCampaignService';

export const PAGE_SIZE = 25; // FR114: fixed page size matching RPC default

/**
 * Hook for Performance by Campaign with pagination and drill-down (Epic 5).
 * Supports drill-down Campaign → AdSet → Ad.
 * @returns {{ campaigns, total, page, setPage, loading, error, expandedCampaigns, expandedAdSets, toggleCampaign, toggleAdSet }}
 */
export function usePerformanceCampaign() {
  const { sourceFilter, years, sM } = useMarketing();
  const [campaigns, setCampaigns] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [degradedCount, setDegradedCount] = useState(0); // FR129

  // AC2, AC3: Drill-down state — Map id → { adsets/ads, loading, error }
  const [expandedCampaigns, setExpandedCampaigns] = useState({});
  const [expandedAdSets, setExpandedAdSets] = useState({});

  // AC(5.4)-2: Collapse drill-downs when page changes (not on initial render)
  const prevPage = useRef(page);
  useEffect(() => {
    if (prevPage.current !== page) {
      setExpandedCampaigns({});
      setExpandedAdSets({});
    }
    prevPage.current = page;
  }, [page]);

  // AC3: Reset page to 1 when filters change + AC4: Fetch data
  const prevFilters = useRef({ sourceFilter, years, sM });
  useEffect(() => {
    // Detect filter change → reset page synchronously before fetch
    const prev = prevFilters.current;
    const filtersChanged =
      JSON.stringify(prev.sourceFilter) !== JSON.stringify(sourceFilter) ||
      JSON.stringify(prev.years) !== JSON.stringify(years) ||
      prev.sM !== sM;
    if (filtersChanged) {
      prevFilters.current = { sourceFilter, years, sM };
      // AC(5.4): Reset drill-down when filters change
      setExpandedCampaigns({});
      setExpandedAdSets({});
    }
    const effectivePage = filtersChanged ? 1 : page;
    if (filtersChanged && page !== 1) {
      setPage(1);
      return; // delegate fetch to re-render with page=1
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchPerformanceByCampaign(sourceFilter, years, sM, effectivePage)
      .then(result => {
        if (cancelled) return;
        if (result.error) {
          setError(result.error);
          setCampaigns([]);
          setTotal(0);
          setDegradedCount(0);
        } else {
          setCampaigns(result.campaigns);
          setTotal(result.total);
          setDegradedCount(result.degradedCount || 0); // FR129
          // AC4-guard: clamp page if beyond total results
          const maxPage = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
          if (effectivePage > maxPage && result.total > 0) {
            setPage(maxPage);
            return; // delegate re-fetch to re-render with clamped page
          }
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [sourceFilter, years, sM, page]);

  // AC2: Toggle campaign drill-down (expand/collapse adsets)
  const toggleCampaign = useCallback(async (campaignId, source) => {
    const id = String(campaignId);

    // Functional updater: check & toggle atomically, avoiding stale closure
    let wasExpanded = false;
    setExpandedCampaigns(prev => {
      if (prev[id]) {
        wasExpanded = true;
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: { adsets: [], loading: true, error: null } };
    });

    if (wasExpanded) return;

    const result = await fetchAdSetsByCampaign(campaignId, source, sourceFilter, years, sM);
    // Only update if still expanded (user might have collapsed during fetch)
    setExpandedCampaigns(prev => {
      if (!prev[id]) return prev;
      return { ...prev, [id]: { adsets: result.adsets || [], loading: false, error: result.error || null } };
    });
  }, [sourceFilter, years, sM]);

  // AC3: Toggle adset drill-down (expand/collapse ads)
  const toggleAdSet = useCallback(async (campaignId, adsetId, source) => {
    const id = `${campaignId}-${adsetId}`;

    let wasExpanded = false;
    setExpandedAdSets(prev => {
      if (prev[id]) {
        wasExpanded = true;
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: { ads: [], loading: true, error: null } };
    });

    if (wasExpanded) return;

    const result = await fetchAdsByAdSet(campaignId, adsetId, source, sourceFilter, years, sM);
    setExpandedAdSets(prev => {
      if (!prev[id]) return prev;
      return { ...prev, [id]: { ads: result.ads || [], loading: false, error: result.error || null } };
    });
  }, [sourceFilter, years, sM]);

  return {
    campaigns, total, page, setPage, loading, error, degradedCount,
    expandedCampaigns, expandedAdSets, toggleCampaign, toggleAdSet,
  };
}
