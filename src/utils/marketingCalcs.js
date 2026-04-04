/**
 * Marketing Calculations for AwData V3
 * Funções puras de cálculo para métricas de marketing.
 * @see AD-V3-9
 */

import { SOURCE_OPTIONS } from '@/config/sourceMapping';

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
 * @param {string|string[]|null} months — month key ("abr") ou array de keys. Narrows range quando fornecido.
 * @returns {{ startDate: string, endDate: string }}
 */
const MONTH_KEY_TO_NUM = {
  jan: '01', fev: '02', mar: '03', abr: '04', mai: '05', jun: '06',
  jul: '07', ago: '08', set: '09', out: '10', nov: '11', dez: '12',
};

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
  let startDate = startYear === '2025' ? '2025-03-01' : `${startYear}-01-01`;

  // Ano corrente usa hoje (local timezone), anos passados usam 31/dez
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  let endDate = endYear === String(today.getFullYear())
    ? todayStr
    : `${endYear}-12-31`;

  // Narrow range por mês quando fornecido (sM = "abr" ou ["abr","jun"])
  if (months) {
    const monthKeys = typeof months === 'string' ? [months] : months;
    // MetricsContext multi-year: sM vira "2026-abr" → strip year prefix
    const monthNums = monthKeys.map(k => {
      const bare = k.includes('-') ? k.split('-').pop() : k;
      return MONTH_KEY_TO_NUM[bare] || bare;
    }).filter(Boolean).sort();
    if (monthNums.length > 0) {
      const minMonth = monthNums[0];
      const maxMonth = monthNums[monthNums.length - 1];
      const narrowStart = `${startYear}-${minMonth}-01`;
      if (narrowStart > startDate) startDate = narrowStart;
      const lastDay = new Date(Number(endYear), Number(maxMonth), 0).getDate();
      const narrowEnd = `${endYear}-${maxMonth}-${String(lastDay).padStart(2, '0')}`;
      if (narrowEnd < endDate) endDate = narrowEnd;
    }
  }

  return { startDate, endDate };
}

// ── Daily Anomaly Detection ──────────────────────────────────────

/**
 * Detecta anomalias nos dados diários de performance. // FR119
 * Agrega por data, calcula médias do período, e classifica cada dia.
 *
 * Tipos de anomalia:
 * - 'high-spend-no-conversion': spend > média E zero landing page views
 * - 'low-cpl': custo por landing page view significativamente abaixo da média (>1.5 stddev)
 *
 * @param {object[]} daily — rows do RPC rpc_ads_daily
 * @returns {Array<{ date: string, type: string, message: string }>}
 */
export function detectDailyAnomalies(daily) {
  if (!daily || daily.length === 0) return [];

  // 1. Agregar por data (sum across sources) — skip rows sem date
  const byDate = {};
  for (const row of daily) {
    if (!row.date) continue;
    if (!byDate[row.date]) byDate[row.date] = { spend: 0, lpv: 0 };
    byDate[row.date].spend += row.total_spend || 0;
    byDate[row.date].lpv += row.unique_landing_page_view || 0;
  }

  const dates = Object.entries(byDate);
  if (dates.length < 3) return []; // média sem sentido com < 3 pontos

  // 2. Calcular média de spend
  const avgSpend = dates.reduce((s, [, d]) => s + d.spend, 0) / dates.length;
  if (avgSpend <= 0) return []; // sem gastos, sem anomalias

  // 3. Calcular média e desvio padrão de CPL — apenas datas com lpv > 0
  const datesWithLPV = dates.filter(([, d]) => d.lpv > 0);
  let avgCPL = null;
  let stddevCPL = null;
  if (datesWithLPV.length > 0) {
    const cpls = datesWithLPV.map(([, d]) => d.spend / d.lpv);
    avgCPL = cpls.reduce((s, v) => s + v, 0) / cpls.length;
    const variance = cpls.reduce((s, v) => s + (v - avgCPL) ** 2, 0) / cpls.length;
    stddevCPL = Math.sqrt(variance);
  }

  // 4. Classificar cada data
  const anomalies = [];
  for (const [date, d] of dates) {
    if (d.spend > avgSpend && d.lpv === 0) {
      anomalies.push({
        date,
        type: 'high-spend-no-conversion',
        message: `Spend de R$${d.spend.toFixed(2)} (média: R$${avgSpend.toFixed(2)}) com zero conversões`,
      });
    } else if (avgCPL !== null && stddevCPL !== null && d.lpv > 0) {
      const cpl = d.spend / d.lpv;
      const threshold = avgCPL - 1.5 * stddevCPL;
      if (cpl < threshold) {
        anomalies.push({
          date,
          type: 'low-cpl',
          message: `CPL R$${cpl.toFixed(2)} abaixo do esperado (média: R$${avgCPL.toFixed(2)})`,
        });
      }
    }
  }

  return anomalies;
}

// ── Source Empty Message ──────────────────────────────────────────

/**
 * Retorna mensagem source-aware para empty states.
 * Quando sourceFilter é uma única source (não 'todos'), retorna mensagem customizada.
 * @param {string[]|null} sourceFilter — array de sourceIds do FilterBar
 * @param {string|null} defaultMsg — mensagem fallback quando não é single-source
 * @returns {{ message: string, suggestion: string|null }|null}
 * @see FR122, AC#2
 */
export function getSourceEmptyMessage(sourceFilter, defaultMsg) {
  if (!sourceFilter || sourceFilter.length !== 1 || sourceFilter[0] === 'todos') {
    return defaultMsg ? { message: defaultMsg, suggestion: null } : null;
  }

  const sourceId = sourceFilter[0];
  const option = SOURCE_OPTIONS.find(s => s.id === sourceId);
  const label = option?.label ?? sourceId;

  return {
    message: `Nenhum dado de ${label} para o período selecionado`,
    suggestion: 'Tente expandir o range de datas ou selecionar outra fonte',
  };
}
