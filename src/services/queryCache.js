/**
 * queryCache.js — Cache em memória com TTL para queries Supabase.
 * Reduz egress evitando re-fetches desnecessários intra-sessão.
 * AD-V2-8
 */

// ── Cache Store ──────────────────────────────────────────────────
const cache = new Map()
let hits = 0
let misses = 0

/**
 * Retorna cache se válido, senão executa fetchFn e armazena.
 * @param {string} key - Chave única da query
 * @param {() => Promise<any>} fetchFn - Função que executa a query
 * @param {number} ttlMs - Time-to-live em milissegundos
 * @returns {Promise<any>} Dados do cache ou resultado fresh
 */
export async function cachedQuery(key, fetchFn, ttlMs) {
  const cached = cache.get(key)
  if (cached && (Date.now() - cached.ts < ttlMs)) {
    hits++
    return cached.data
  }
  misses++
  try {
    const data = await fetchFn()
    cache.set(key, { data, ts: Date.now() })
    return data
  } catch (err) {
    console.error('[queryCache] fetchFn failed for key:', key, err)
    throw err
  }
}

/**
 * Limpa todo o cache e zera contadores (ex: logout, reset).
 */
export function clearCache() {
  cache.clear()
  hits = 0
  misses = 0
}

/**
 * Stats para debug no console.
 * @returns {{ size: number, hits: number, misses: number }}
 */
export function cacheStats() {
  return { size: cache.size, hits, misses }
}
