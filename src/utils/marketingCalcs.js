/**
 * Marketing Calculations for AwData V3
 * Funções puras de cálculo para métricas de marketing.
 * @see AD-V3-9
 */

// ── Efficiency Score ──────────────────────────────────────────────

/**
 * Calcula o Score de Eficiência ponderado para um anúncio/campanha.
 * Fórmula: (SQL × 0.4 + Vendas × 0.6) / Spend × 1000
 * Thresholds: >=5.0 verde, >=2.0 amarelo, <2.0 vermelho.
 * Spend zero ou negativo retorna score 0, tier 'red'.
 *
 * @param {number} sql — quantidade de SQLs atribuídos
 * @param {number} sales — quantidade de vendas atribuídas
 * @param {number} spend — gasto total em R$
 * @returns {{ score: number, tier: 'green'|'yellow'|'red' }}
 * @see AD-V3-9
 */
export function calcEfficiencyScore(sql, sales, spend) {
  if (!spend || spend <= 0) return { score: 0, tier: 'red' };
  sql = Number(sql) || 0;
  sales = Number(sales) || 0;

  const score = (((sql * 0.4) + (sales * 0.6)) / spend) * 1000;

  let tier = 'red';
  if (score >= 5.0) tier = 'green';
  else if (score >= 2.0) tier = 'yellow';

  return { score: Number(score.toFixed(2)), tier };
}

// ── Date Range Builder ────────────────────────────────────────────

/**
 * Constrói range de datas (ISO strings) baseado em seleção de anos e meses.
 * 2025 começa em Mar (dados disponíveis a partir de mar/2025).
 * Ano corrente usa data de hoje como endDate.
 *
 * @param {string[]} years — ex: ['2025', '2026']
 * @param {string[]|null} months — meses selecionados (reservado para uso futuro)
 * @returns {{ startDate: string, endDate: string }}
 */
export function buildDateRange(years, months) {
  const sortedYears = [...(years || [])].map(String).filter(Boolean).sort();
  if (sortedYears.length === 0) {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return { startDate: `${today.getFullYear()}-01-01`, endDate: todayStr };
  }

  const startYear = sortedYears[0];
  const endYear = sortedYears[sortedYears.length - 1];

  // 2025 inicia em Mar (dados disponíveis a partir de mar/2025)
  const startDate = startYear === '2025' ? '2025-03-01' : `${startYear}-01-01`;

  // Ano corrente usa hoje (local timezone), anos passados usam 31/dez
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const endDate = endYear === String(today.getFullYear())
    ? todayStr
    : `${endYear}-12-31`;

  return { startDate, endDate };
}
