import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchPillCounts } from '@/services/gerencialService';

export default function usePillCounts(selectedFunnel, sourceFilter) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const [error, setError] = useState(null);
  const dataRef = useRef(data);
  dataRef.current = data;
  const versionRef = useRef(0);
  const sourceKey = JSON.stringify(sourceFilter); // FR89: stabilize array ref

  const fetchData = useCallback(async () => {
    const version = ++versionRef.current;
    setError(null);
    const isFirstLoad = dataRef.current === null;
    if (isFirstLoad) setLoading(true);
    else setIsRefetching(true);
    try {
      const result = await fetchPillCounts(selectedFunnel, sourceFilter);
      if (version !== versionRef.current) return;
      setData(result);
    } catch (err) {
      if (version !== versionRef.current) return;
      console.error('[usePillCounts] error:', err);
      setError(err);
    } finally {
      if (version === versionRef.current) {
        setLoading(false);
        setIsRefetching(false);
      }
    }
  }, [selectedFunnel, sourceKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, loading, isRefetching, error, refetch: fetchData };
}
