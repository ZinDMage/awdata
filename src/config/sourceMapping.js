/**
 * Source Mapping Configuration for AwData V3
 * Centralizes the grouping and options for utm_source filtering.
 * Cross-cutting: consumido por marketingService, MetricsContext e FilterBar.
 * @see AD-V3-1
 */

// ── Source Groups ─────────────────────────────────────────────────
// Cada grupo mapeia utm_source values reais (Supabase) para uma plataforma.
// Valores validados via v3-preflight-validate-utm.mjs (2026-04-01).

export const SOURCE_GROUPS = {
  Meta: ['fb', 'ig', 'meta', 'facebook', 'instagram'],
  Google: ['google', 'gads', 'google_ads'],
  LinkedIn: ['linkedin-ads', 'linkedin_ads', 'linkedin'],
  'Orgânico': ['bio-insta', 'bio_insta', 'organic', 'instagram_profile', 'linkedin_profile', 'evento'],
  'S/Track': ['', 'none', '(direct)', 'awsales'], // null/undefined handled by guard clauses in getSourceGroup/isSourceIncluded
};

// ── Source Options (FilterBar pills) ──────────────────────────────
// Ordem fixa: Todos, Meta, Google, LinkedIn, Orgânico, S/Track  // FR81

export const SOURCE_OPTIONS = [
  { id: 'todos', label: 'Todos' },
  { id: 'meta', label: 'Meta' },
  { id: 'google', label: 'Google' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'organico', label: 'Orgânico' },
  { id: 'strack', label: 'S/Track' },
];

// ── Lookup: utm_source → grupo ────────────────────────────────────

/**
 * Retorna o grupo lógico para um valor de utm_source.
 * @param {string|null|undefined} utmSource — valor bruto do Supabase
 * @returns {string} Um de: 'Meta', 'Google', 'LinkedIn', 'Orgânico', 'S/Track'
 */
export function getSourceGroup(utmSource) {
  if (utmSource == null || typeof utmSource !== 'string' || !utmSource.trim()) return 'S/Track';

  const source = utmSource.toLowerCase().trim();

  for (const [group, values] of Object.entries(SOURCE_GROUPS)) {
    if (group === 'S/Track') continue; // checar por último
    if (values.includes(source)) return group;
  }

  return 'S/Track';
}

// ── Lookup inverso: pill id → array de utm_source ─────────────────

/** @type {Record<string, string[]>} */
const PILL_TO_UTM = {
  meta: SOURCE_GROUPS.Meta,
  google: SOURCE_GROUPS.Google,
  linkedin: SOURCE_GROUPS.LinkedIn,
  organico: SOURCE_GROUPS['Orgânico'],
  strack: SOURCE_GROUPS['S/Track'],
};

/**
 * Retorna array de utm_source values para um sourceId do FilterBar.
 * Usado para montar `.in('utm_source', [...])` nas queries Supabase.
 * Nota: S/Track inclui null — a query precisa de `.or('utm_source.is.null')` adicional (story 1.4).
 * @param {string} sourceId — id do SOURCE_OPTIONS (ex: 'meta', 'todos')
 * @returns {string[]|null} array para .in() ou null quando sem filtro ('todos')
 * @see AD-V3-1
 */
export function getUtmValuesForSource(sourceId) {
  if (!sourceId || sourceId === 'todos') return null;
  return PILL_TO_UTM[sourceId]?.slice() ?? null;
}
