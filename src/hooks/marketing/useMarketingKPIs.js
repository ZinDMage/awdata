import { useState, useEffect, useMemo } from 'react';
import { useMarketing } from '@/contexts/MarketingContext';
import { fetchKPIsADS } from '@/services/marketing/kpisAdsService';

/**
 * Hook for KPIs ADS data (Epic 3).
 * Fetches and processes KPIs data based on current filters.
 * @returns {{ data: object|null, loading: boolean, error: string|null }}
 */
export function useMarketingKPIs() {
  const { sourceFilter, years, sM, selectedFunnels } = useMarketing();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);

    fetchKPIsADS(sourceFilter, years, sM ? [sM] : [], selectedFunnels)
      .then(result => {
        if (!cancelled) setData(result);
      })
      .catch(err => {
        console.error('[useMarketingKPIs] fetch failed:', err);
        if (!cancelled) setError(err.message || 'Erro ao carregar KPIs ADS');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [sourceFilter, years, sM, selectedFunnels]);

  return useMemo(() => ({ data, loading, error }), [data, loading, error]);
}
