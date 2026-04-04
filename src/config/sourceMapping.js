/**
 * Source Mapping Configuration for AwData V3
 * Centralizes the grouping and options for utm_source filtering.
 * Cross-cutting: consumido por marketingService, MetricsContext e FilterBar.
 * Suporta overrides dinâmicos via localStorage (FR125, Story 7.4).
 * @see AD-V3-1
 */

// ── Constants ─────────────────────────────────────────────────────

const STORAGE_KEY = 'awdata-source-mapping-custom'; // FR125
const RESERVED_KEYS = new Set(['_removed', '__proto__', 'constructor', 'prototype']); // F6: keys reservados

// ── Safe localStorage helpers ─────────────────────────────────────
// Pattern from MetricsContext/MarketingContext (project-context.md)

const safeGet = (key, fallback) => {
  try { return typeof window !== 'undefined' ? localStorage.getItem(key) ?? fallback : fallback; } catch { return fallback; }
};
const safeSet = (key, val) => {
  try { if (typeof window !== 'undefined') localStorage.setItem(key, val); } catch { /* ignore */ }
};
const safeRemove = (key) => {
  try { if (typeof window !== 'undefined') localStorage.removeItem(key); } catch { /* ignore */ }
};

// ── Source Groups ─────────────────────────────────────────────────
// Cada grupo mapeia utm_source values reais (Supabase) para uma plataforma.
// Valores validados via v3-preflight-validate-utm.mjs (2026-04-01).
// NOTA: Este objeto é MUTADO por rebuildSourceGroups() — referência estável para consumidores.

export const SOURCE_GROUPS = {
  Meta: ['fb', 'ig', 'meta', 'facebook', 'instagram'],
  Google: ['google', 'gads', 'google_ads'],
  LinkedIn: ['linkedin-ads', 'linkedin_ads', 'linkedin'],
  'Orgânico': ['bio-insta', 'bio_insta', 'organic', 'instagram_profile', 'linkedin_profile', 'evento'],
  'S/Track': ['', 'none', '(direct)', 'awsales'], // null/undefined handled by guard clauses in getSourceGroup/isSourceIncluded
};

/** Snapshot imutável dos defaults — usado por resetToDefaults() e rebuildSourceGroups() */
const DEFAULT_SOURCE_GROUPS = JSON.parse(JSON.stringify(SOURCE_GROUPS)); // FR125

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
// Convertido de const para função getter — garante que retorna estado atualizado após mutação (FR125)

/** @returns {Record<string, string[]>} */
function getPillToUtm() {
  return {
    meta: SOURCE_GROUPS.Meta,
    google: SOURCE_GROUPS.Google,
    linkedin: SOURCE_GROUPS.LinkedIn,
    organico: SOURCE_GROUPS['Orgânico'],
    strack: SOURCE_GROUPS['S/Track'],
  };
}

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
  return getPillToUtm()[sourceId]?.slice() ?? null;
}

// ── CRUD Functions (FR125 — Story 7.4) ────────────────────────────

/**
 * Lê mapeamentos customizados do localStorage.
 * @returns {Object} customMap — ex: { "tiktok": "Meta", "_removed": ["evento"] }
 */
export function loadCustomMappings() {
  const raw = safeGet(STORAGE_KEY, null);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Persiste mapeamentos customizados no localStorage e reconstrói SOURCE_GROUPS.
 * @param {Object} customMap
 */
export function saveCustomMappings(customMap) {
  safeSet(STORAGE_KEY, JSON.stringify(customMap));
  rebuildSourceGroups(customMap);
}

/**
 * Reconstrói SOURCE_GROUPS in-place a partir de DEFAULT_SOURCE_GROUPS + customMap.
 * Mantém a referência do objeto para que consumidores (getSourceGroup, etc.) peguem estado atual.
 * @param {Object} customMap — overrides do localStorage
 */
export function rebuildSourceGroups(customMap) {
  if (!customMap) return;

  // 1. Restaurar arrays a partir dos defaults (cópia profunda dos arrays)
  for (const group of Object.keys(DEFAULT_SOURCE_GROUPS)) {
    SOURCE_GROUPS[group] = [...DEFAULT_SOURCE_GROUPS[group]];
  }
  // Remover grupos extras que possam ter sido adicionados anteriormente
  for (const group of Object.keys(SOURCE_GROUPS)) {
    if (!(group in DEFAULT_SOURCE_GROUPS)) {
      delete SOURCE_GROUPS[group];
    }
  }

  // 2. Processar _removed — remover utm_source dos grupos
  const removed = Array.isArray(customMap._removed) ? customMap._removed : [];
  for (const utm of removed) {
    for (const group of Object.keys(SOURCE_GROUPS)) {
      const idx = SOURCE_GROUPS[group].indexOf(utm);
      if (idx !== -1) SOURCE_GROUPS[group].splice(idx, 1);
    }
  }

  // 3. Processar overrides — adicionar utm_source ao grupo correto
  for (const [utmSource, group] of Object.entries(customMap)) {
    if (utmSource === '_removed') continue;
    if (!SOURCE_GROUPS[group]) continue; // grupo inválido — ignorar

    // Remover de qualquer grupo anterior (evita duplicados)
    for (const g of Object.keys(SOURCE_GROUPS)) {
      const idx = SOURCE_GROUPS[g].indexOf(utmSource);
      if (idx !== -1) SOURCE_GROUPS[g].splice(idx, 1);
    }
    // Adicionar ao grupo target
    SOURCE_GROUPS[group].push(utmSource);
  }
}

/**
 * Adiciona um novo mapeamento utm_source → grupo.
 * @param {string} utmSource — valor utm_source (será lowercased/trimmed)
 * @param {string} group — nome do grupo (Meta, Google, LinkedIn, Orgânico, S/Track)
 * @returns {{ ok: boolean, error?: string }}
 */
export function addMapping(utmSource, group) {
  if (!utmSource || typeof utmSource !== 'string' || !utmSource.trim()) {
    return { ok: false, error: 'utm_source não pode ser vazio' };
  }
  const normalized = utmSource.toLowerCase().trim();
  // F6: bloquear nomes reservados
  if (RESERVED_KEYS.has(normalized)) {
    return { ok: false, error: `"${normalized}" é um nome reservado` };
  }
  // Verificar duplicata — já existe em algum grupo?
  const existingGroup = getSourceGroup(normalized);
  if (existingGroup !== 'S/Track') {
    return { ok: false, error: `"${normalized}" já está mapeado para ${existingGroup}` };
  }
  // Verificar se já é um value default de S/Track
  if (DEFAULT_SOURCE_GROUPS['S/Track'].includes(normalized)) {
    // Está em S/Track por default — trata como "mover" para novo grupo
  }

  const customMap = loadCustomMappings();
  customMap[normalized] = group;
  // Remover de _removed se estava lá
  if (Array.isArray(customMap._removed)) {
    customMap._removed = customMap._removed.filter(u => u !== normalized);
    if (customMap._removed.length === 0) delete customMap._removed;
  }
  saveCustomMappings(customMap);
  return { ok: true };
}

/**
 * Remove um mapeamento — utm_source passará a cair em S/Track.
 * @param {string} utmSource
 */
export function removeMapping(utmSource) {
  const normalized = utmSource.toLowerCase().trim();
  const customMap = loadCustomMappings();

  // Se é um override customizado, deletar
  if (normalized in customMap) {
    delete customMap[normalized];
  }

  // Se é um default, adicionar em _removed
  const isDefault = Object.values(DEFAULT_SOURCE_GROUPS).some(arr => arr.includes(normalized));
  if (isDefault) {
    if (!Array.isArray(customMap._removed)) customMap._removed = [];
    if (!customMap._removed.includes(normalized)) {
      customMap._removed.push(normalized);
    }
  }

  saveCustomMappings(customMap);
}

/**
 * Atualiza o grupo de um mapeamento existente.
 * @param {string} utmSource
 * @param {string} newGroup
 */
export function updateMapping(utmSource, newGroup) {
  if (!utmSource || typeof utmSource !== 'string' || !utmSource.trim()) return;
  if (!newGroup || !SOURCE_GROUPS[newGroup]) return; // F5: validar grupo
  const normalized = utmSource.toLowerCase().trim();
  if (RESERVED_KEYS.has(normalized)) return; // F6
  const customMap = loadCustomMappings();

  // Remover de _removed se estava lá
  if (Array.isArray(customMap._removed)) {
    customMap._removed = customMap._removed.filter(u => u !== normalized);
    if (customMap._removed.length === 0) delete customMap._removed;
  }

  customMap[normalized] = newGroup;
  saveCustomMappings(customMap);
}

/**
 * Reseta todos os mapeamentos customizados — restaura SOURCE_GROUPS original.
 */
export function resetToDefaults() {
  safeRemove(STORAGE_KEY);
  rebuildSourceGroups({});
}

/**
 * Retorna array flat de todos os mapeamentos atuais para renderizar na tabela.
 * @returns {Array<{ utmSource: string, group: string }>}
 */
export function getAllMappingsFlat() {
  const result = [];
  for (const [group, values] of Object.entries(SOURCE_GROUPS)) {
    for (const utmSource of values) {
      result.push({ utmSource, group });
    }
  }
  return result;
}

// ── Module init: aplicar overrides do localStorage no load ────────
// FR125: mapeamentos customizados são aplicados automaticamente
rebuildSourceGroups(loadCustomMappings());
