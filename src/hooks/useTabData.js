import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchStageDeals } from '@/services/gerencialService';
import { STAGE_TABS } from '@/config/pipedrive';

export default function useTabData(activeTab, selectedFunnel, sourceFilter) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const [error, setError] = useState(null);
  const dataRef = useRef(data);
  dataRef.current = data;
  const versionRef = useRef(0);
  const sourceKey = JSON.stringify(sourceFilter); // FR89: stabilize array ref

  const fetchData = useCallback(async () => {
    const tab = STAGE_TABS[activeTab];
    if (!tab || activeTab === 'bowtie') {
      setData(null);
      setLoading(false);
      setIsRefetching(false);
      return;
    }

    const version = ++versionRef.current;
    setError(null);
    const isFirstLoad = dataRef.current === null;
    if (isFirstLoad) setLoading(true);
    else setIsRefetching(true);
    try {
      const result = await fetchStageDeals(tab.stageIds, selectedFunnel, activeTab, sourceFilter);
      if (version !== versionRef.current) return;
      setData(result);
    } catch (err) {
      if (version !== versionRef.current) return;
      console.error('[useTabData] error:', err);
      setError(err);
    } finally {
      if (version === versionRef.current) {
        setLoading(false);
        setIsRefetching(false);
      }
    }
  }, [activeTab, selectedFunnel, sourceKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, loading, isRefetching, error, refetch: fetchData };
}
