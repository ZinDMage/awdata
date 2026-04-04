import { supabase } from '../supabaseClient';

/**
 * Fetches sync status timestamps per source (Epic 7). // AD-V3-10
 * Checks MAX(date_start) / MAX(date) per ads table — 1x no mount, sem polling.
 * @returns {Promise<{ meta: Date|null, google: Date|null, linkedin: null }>}
 */
export async function fetchSyncStatus() {
  const [metaResult, googleResult] = await Promise.allSettled([
    supabase
      .from('meta_ads_costs')
      .select('date_start')
      .order('date_start', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('google_ads_costs')
      .select('date')
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const meta = parseResult(metaResult, 'date_start', 'meta');
  const google = parseResult(googleResult, 'date', 'google');

  return { meta, google, linkedin: null };
}

/** Extrai Date de um resultado settled, logando erros individuais */
function parseResult(settled, column, label) {
  if (settled.status === 'rejected') {
    console.error(`[syncService] ${label}:`, settled.reason);
    return null;
  }
  const { data, error } = settled.value;
  if (error) {
    console.error(`[syncService] ${label}:`, error.message);
    return null;
  }
  return data?.[column] ? new Date(data[column] + 'T00:00:00') : null;
}
