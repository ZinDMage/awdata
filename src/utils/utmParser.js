/**
 * UTM Parser for AwData V3
 * Funções puras de parsing para atribuição UTM→Ads.
 * Meta usa pipe-separated ("Nome | ID"), Google usa ID direto.
 * Retorno null = modo degradado FR129 — componentes UI ignoram UTM.
 * @see AD-V3-4
 */

// ── Meta UTM Parsing ──────────────────────────────────────────────

/**
 * Parseia valores UTM Meta no formato pipe-separated "Name | ID" ou "Name|ID".
 * Extrai o último segmento após pipe como ID (deve ser numérico — dados reais Meta sempre
 * usam IDs numéricos, validado via preflight 2026-04-01. IDs alfanuméricos retornam null).
 * Múltiplos pipes são suportados: "A | B | 12345" → name="A | B", id="12345".
 *
 * Retorna null para valores inválidos (null, sem pipe, ID não numérico),
 * acionando modo degradado FR129 — a UI exibe dados sem atribuição de campanha.
 *
 * @param {string|null|undefined} utmValue — valor bruto de utm_campaign ou utm_medium
 * @returns {{ name: string, id: string } | null} parsed ou null (modo degradado FR129)
 */
export function parseMetaUTM(utmValue) {
  if (!utmValue || typeof utmValue !== 'string') return null;

  const parts = utmValue.split('|');
  if (parts.length < 2) return null;

  const id = parts[parts.length - 1].trim();
  const name = parts.slice(0, -1).join('|').trim();

  return /^\d+$/.test(id) ? { name, id } : null; // FR129
}

// ── Google UTM Parsing ────────────────────────────────────────────

/**
 * Parseia valores UTM Google (IDs diretos, podem ser alfanuméricos).
 * Google não usa pipe-separated — o valor inteiro é o identificador.
 *
 * Retorna null para valores inválidos, acionando modo degradado FR129.
 *
 * @param {string|null|undefined} utmValue — valor bruto de utm_campaign
 * @returns {{ name: string, id: string } | null} parsed ou null (modo degradado FR129)
 */
export function parseGoogleUTM(utmValue) {
  if (!utmValue || typeof utmValue !== 'string') return null;
  return { name: utmValue, id: utmValue };
}
