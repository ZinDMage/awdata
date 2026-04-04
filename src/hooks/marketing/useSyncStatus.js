import { useState, useEffect } from 'react';
import { fetchSyncStatus } from '@/services/marketing/syncService';

/**
 * Hook for sync status indicators (Epic 7). // AD-V3-10
 * Fetches last sync timestamp per source — 1x no mount, sem polling.
 * @returns {{ meta: Date|null, google: Date|null, linkedin: null, loading: boolean }}
 */
export function useSyncStatus() {
  const [status, setStatus] = useState({ meta: null, google: null, linkedin: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchSyncStatus().then((result) => {
      if (!cancelled) {
        setStatus(result);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  return { ...status, loading };
}
