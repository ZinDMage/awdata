/**
 * MQL Classification Service
 * Rules for qualifying leads as Lead or MQL (FR17, FR18, FR19).
 *
 * classifyLead() is a pure function — no side effects, no fetch calls.
 * All inputs may be null, undefined, or empty string; the function always
 * returns 'Lead' when data is insufficient to confirm qualification.
 */

// FR17: Revenue ranges that do NOT meet MQL threshold
const disqualifiedRanges = [
  'Zero até o momento',
  'Menos de R$100 mil',
  'Entre R$100 mil e R$500 mil',
  'Entre R$500 mil e R$1 milhão'
];

// FR17: Revenue ranges that meet MQL threshold (whitelist — anything else is disqualified)
const qualifiedRanges = [
  'Entre R$1 milhão a R$5 milhões',
  'Entre R$5 milhões a R$10 milhões',
  'Entre R$10 milhões a R$25 milhões',
  'Entre R$25 milhões a R$50 milhões',
  'Acima de R$50 milhões',
  'Acima de R$10 milhões'
];

// FR17 / General: Monthly volume ranges that disqualify a non-e-commerce lead
const disqualifiedTicketVolumes = [
  'Menos de 1.000 por mês',
  'Entre 1.000 e 3.000 por mês',
  'Entre 1.000 e 5.000 por mês',
  'Entre 3.000 e 5.000 por mês'
];

// FR18: E-commerce applies a stricter volume threshold (>10k tickets/month required)
// Volumes at or below 10k/month disqualify an e-commerce lead
const disqualifiedEcommerceVolumes = [
  'Menos de 1.000 por mês',
  'Entre 1.000 e 3.000 por mês',
  'Entre 1.000 e 5.000 por mês',
  'Entre 3.000 e 5.000 por mês',
  'Entre 5.000 e 10.000 por mês'
];

// FR19: These segments are automatically disqualified — always return 'Lead'
const disqualifiedSegments = [
  '🩺 Clínica / consultório',
  '⚖️ Escritório de advocacia'
];

/**
 * Classify a lead as 'Lead' or 'MQL' based on business rules.
 *
 * @param {string|null|undefined} fat    - Revenue range (lead_revenue_range)
 * @param {string|null|undefined} vol    - Monthly volume (lead_monthly_volume)
 * @param {string|null|undefined} seg    - Segment (lead_segment)
 * @param {string|null|undefined} market - Market (lead_market); null/undefined = not e-commerce
 * @returns {'Lead'|'MQL'}
 */
export function classifyLead(fat, vol, seg, market = null) {
  // AC4: Missing or empty revenue range → insufficient data → stay as Lead
  if (!fat || typeof fat !== 'string' || fat.trim() === '') return 'Lead';

  // FR17: Explicitly disqualified revenue range → Lead
  if (disqualifiedRanges.includes(fat)) return 'Lead';

  // FR17: Revenue range not in the qualified whitelist → unknown value → Lead
  if (!qualifiedRanges.includes(fat)) return 'Lead';

  // FR19: Clínica and Advocacia segments are always disqualified
  if (seg && typeof seg === 'string' && disqualifiedSegments.includes(seg)) return 'Lead';

  // FR18: E-commerce requires >10k tickets/month; other segments require >5k
  const isEcommerce = typeof market === 'string' && market === '🛒 Ecommerce';

  if (isEcommerce) {
    // AC4: If vol is missing for e-commerce, we cannot confirm >10k threshold → Lead
    if (!vol || typeof vol !== 'string' || vol.trim() === '') return 'Lead';
    if (disqualifiedEcommerceVolumes.includes(vol)) return 'Lead';
  } else {
    // AC4: For non-e-commerce, vol null/undefined = insufficient data → stay as Lead (conservative)
    if (!vol || typeof vol !== 'string' || vol.trim() === '') return 'Lead';
    if (disqualifiedTicketVolumes.includes(vol)) return 'Lead';
  }

  return 'MQL';
}
