import { useState, useEffect, useRef } from 'react';
import { useMarketing } from '@/contexts/MarketingContext';
import { fetchPerformanceByAd, fetchPerformanceDaily } from '@/services/marketing/performanceAdDailyService';

// ── Default date range (últimos 30 dias) para view Diário ────── // AD-V3-3
function defaultLast30Days() {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - 30);
  const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { startDate: fmt(start), endDate: fmt(now) };
}

/**
 * Hook for Performance by Ad + Daily data (Epic 6).
 * Supports independent date range for daily view. // FR115, FR117
 * @returns {{ ads: object[], daily: object[], anomalies: object[], totalAds: number, pageAds: number, setPageAds: function, loading: boolean, error: string|null }}
 */
export function usePerformanceAdDaily() {
  const { sourceFilter, years, sM, performanceDateRange } = useMarketing();
  const [ads, setAds] = useState([]);
  const [daily, setDaily] = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  const [totalAds, setTotalAds] = useState(0);
  const [pageAds, setPageAds] = useState(1);
  // F2: loading states separados para cada fetch
  const [loadingAds, setLoadingAds] = useState(false);
  const [loadingDaily, setLoadingDaily] = useState(false);
  // F4: error states separados para cada fetch
  const [errorAds, setErrorAds] = useState(null);
  const [errorDaily, setErrorDaily] = useState(null);

  // F3: ref para detectar mudança de filtro e resetar page atomicamente
  const prevFiltersRef = useRef({ sourceFilter, years, sM });

  // Fetch ads (paginado, usa filtros globais) // AC #1
  useEffect(() => {
    // F3: se filtros mudaram e page não é 1, resetar e re-trigger
    const prev = prevFiltersRef.current;
    const filtersChanged = prev.sourceFilter !== sourceFilter || prev.years !== years || prev.sM !== sM;
    if (filtersChanged) {
      prevFiltersRef.current = { sourceFilter, years, sM };
      if (pageAds !== 1) {
        setPageAds(1);
        return;
      }
    }

    let cancelled = false;
    setLoadingAds(true);
    setErrorAds(null);
    fetchPerformanceByAd(sourceFilter, years, sM, pageAds, 25)
      .then(result => {
        if (!cancelled) { setAds(result.ads); setTotalAds(result.total); }
      })
      .catch(err => {
        // F5: guard err.message contra null/undefined
        if (!cancelled) setErrorAds(err?.message || String(err) || 'Erro desconhecido');
        console.error('[usePerformanceAdDaily] fetchPerformanceByAd:', err);
      })
      .finally(() => {
        if (!cancelled) setLoadingAds(false);
      });
    return () => { cancelled = true; };
  }, [sourceFilter, years, sM, pageAds]);

  // Fetch daily (usa performanceDateRange, independente do filtro global) // AC #2
  useEffect(() => {
    let cancelled = false;
    // F6: validar shape de performanceDateRange antes de usar
    const range = (performanceDateRange?.startDate && performanceDateRange?.endDate)
      ? performanceDateRange
      : defaultLast30Days();
    setLoadingDaily(true);
    setErrorDaily(null);
    fetchPerformanceDaily(sourceFilter, range.startDate, range.endDate)
      .then(result => {
        if (!cancelled) { setDaily(result.daily); setAnomalies(result.anomalies); }
      })
      .catch(err => {
        // F5: guard err.message contra null/undefined
        if (!cancelled) setErrorDaily(err?.message || String(err) || 'Erro desconhecido');
        console.error('[usePerformanceAdDaily] fetchPerformanceDaily:', err);
      })
      .finally(() => {
        if (!cancelled) setLoadingDaily(false);
      });
    return () => { cancelled = true; };
  }, [sourceFilter, performanceDateRange]);

  // F2: loading derivado de ambos os fetches
  const loading = loadingAds || loadingDaily;
  // F4: error combinado (prioridade: ads > daily)
  const error = errorAds || errorDaily;

  return { ads, daily, anomalies, totalAds, pageAds, setPageAds, loading, error };
}
