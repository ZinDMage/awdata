import { useState, useCallback, useRef } from 'react';
import { fetchDealDetails } from '@/services/gerencialService';

export default function useDealModal() {
  const [selectedDealId, setSelectedDealId] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const versionRef = useRef(0);

  const openModal = useCallback(async (dealId) => {
    const version = ++versionRef.current;
    setSelectedDealId(dealId);
    setLoading(true);
    setError(null);
    try {
      const result = await fetchDealDetails(dealId);
      if (version !== versionRef.current) return;
      setData(result);
    } catch (err) {
      if (version !== versionRef.current) return;
      console.error('[useDealModal] error:', err);
      setError(err);
    } finally {
      if (version === versionRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const closeModal = useCallback(() => {
    setSelectedDealId(null);
    setData(null);
    setError(null);
  }, []);

  return { selectedDealId, data, loading, error, openModal, closeModal };
}
