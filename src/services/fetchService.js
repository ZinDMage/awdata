import { supabase } from './supabaseClient';

/**
 * Generic paginated fetch from Supabase.
 * Batches of 1000 records. Normalizes emails with trim() + toLowerCase() (AD-6, FR20).
 * Errors per table don't crash the app (NFR12).
 */
export async function fetchAll(table, selectStr) {
  // AD-V2-1: Nunca select('*') — NFR22
  if (!selectStr || selectStr.includes('*')) {
    console.warn(`[fetchAll] ⚠️ select("*") detectado para tabela "${table}" — use colunas explícitas (QUERY_COLUMNS)`);
  }
  let all = [];
  let from = 0;
  const size = 1000;
  while (true) {
    const { data, error } = await supabase.from(table).select(selectStr).range(from, from + size - 1);
    if (error) {
      console.error(`Supabase Error on ${table}:`, error);
      console.warn(`[fetchAll] Tabela "${table}" falhou — retornando dados parciais`);
      return { data: all.length > 0 ? all : [], error: true };
    }
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < size) break;
    from += size;
  }

  if (table === 'yayforms_responses') {
    // FR20: normalize emails at fetch time
    all = all.map(row => ({
      ...row,
      lead_email: normalizeEmail(row.lead_email),
    }));
    // FR21: deduplicate by email + 5-minute timestamp window
    all = deduplicateYayforms(all);
  }

  return { data: all, error: false };
}

/**
 * Normalize email: trim + toLowerCase (FR20).
 */
export function normalizeEmail(email) {
  if (!email) return null;
  return email.toLowerCase().trim();
}

/**
 * Deduplicate yayforms_responses by normalized email.
 * Within each email group, records are sorted ascending by timestamp.
 * If two consecutive records are within a 5-minute window, only the first is kept (FR21).
 */
export function deduplicateYayforms(rows) {
  const FIVE_MINUTES_MS = 5 * 60 * 1000;

  const groups = {};
  for (const row of rows) {
    const key = row.lead_email || '__no_email__';
    if (!groups[key]) groups[key] = [];
    groups[key].push(row);
  }

  const result = [];
  for (const key of Object.keys(groups)) {
    const group = groups[key];
    group.sort((a, b) => {
      const tA = new Date(a.submitted_at || 0).getTime();
      const tB = new Date(b.submitted_at || 0).getTime();
      return tA - tB;
    });

    let lastKept = group[0];
    result.push(lastKept);
    for (let i = 1; i < group.length; i++) {
      const tKept = new Date(lastKept.submitted_at || 0).getTime();
      const tCurr = new Date(group[i].submitted_at || 0).getTime();
      if (tCurr - tKept >= FIVE_MINUTES_MS) {
        result.push(group[i]);
        lastKept = group[i];
      }
    }
  }

  return result;
}
