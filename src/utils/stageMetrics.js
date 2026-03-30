/**
 * stageMetrics.js
 * Computes KPIs and chart data for each stage tab from an array of deals.
 * Usage: computeStageData(tabKey, deals) → { kpis: [], charts: { donut, bar } }
 */

import { F } from '@/utils/formatters';
import { CUSTOM_FIELDS, parseCustomFields } from '@/config/pipedrive';


// ── Constants ───────────────────────────────────────────────────────────────

const DONUT_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6',
  '#EF4444', '#06B6D4', '#EC4899', '#8E8E93',
];

const AGING_COLORS = {
  '0-7d':   '#34C759',
  '8-14d':  '#FFD60A',
  '15-30d': '#FF9500',
  '30d+':   '#FF453A',
};

const AGING_BUCKETS = ['0-7d', '8-14d', '15-30d', '30d+'];

// ── Helpers ─────────────────────────────────────────────────────────────────

const TODAY_MS = Date.now();

/** Parse a date string safely, return Date or null */
function parseDate(v) {
  if (!v) return null;
  const s = String(v);
  const d = new Date(s.length === 10 && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s + 'T00:00:00' : s);
  return isNaN(d.getTime()) ? null : d;
}

/** Days between two date values (or from d to now if toDate omitted) */
function daysBetween(fromDate, toDate = null) {
  const from = parseDate(fromDate);
  if (!from) return null;
  const toMs = toDate ? (parseDate(toDate)?.getTime() ?? null) : TODAY_MS;
  if (toMs == null) return null;
  return Math.max(0, Math.round((toMs - from.getTime()) / 86_400_000));
}

/**
 * Resolve days_in_stage for a deal.
 * Prefers deal.days_in_stage if present and numeric, else computes from deal_created_at.
 */
function getDaysInStage(deal) {
  if (deal.days_in_stage != null && !isNaN(Number(deal.days_in_stage))) {
    return Number(deal.days_in_stage);
  }
  return daysBetween(deal.deal_created_at) ?? 0;
}

/** Classify a days value into an aging bucket key */
function agingBucket(days) {
  if (days <= 7)  return '0-7d';
  if (days <= 14) return '8-14d';
  if (days <= 30) return '15-30d';
  return '30d+';
}

/** Average of a numeric array, or null if empty */
function avg(arr) {
  const valid = arr.filter(v => v != null && !isNaN(v));
  if (!valid.length) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

/** Sum of a numeric array */
function sum(arr) {
  return arr.filter(v => v != null && !isNaN(v)).reduce((a, b) => a + b, 0);
}

/** Most frequent value in an array, returns { value, count } or null */
function mostFrequent(arr) {
  if (!arr.length) return null;
  const freq = {};
  for (const v of arr) {
    if (v == null || v === '') continue;
    freq[v] = (freq[v] ?? 0) + 1;
  }
  const entries = Object.entries(freq);
  if (!entries.length) return null;
  entries.sort((a, b) => b[1] - a[1]);
  return { value: entries[0][0], count: entries[0][1] };
}

/**
 * Build donut chart data grouped by a string field on each deal.
 * Max 7 named segments, remainder grouped as "Outros".
 */
function buildDonut(deals, field, title, subtitle = '') {
  if (!deals.length) return null;

  const freq = {};
  for (const d of deals) {
    const raw = d[field];
    const trimmed = raw == null ? '' : String(raw).trim();
    const v = (trimmed === '' || /^outros?$/i.test(trimmed)) ? 'Outros' : trimmed;
    freq[v] = (freq[v] ?? 0) + 1;
  }

  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 7);
  const rest = sorted.slice(7);
  const otrosCount = rest.reduce((acc, [, c]) => acc + c, 0);

  const segments = top.map(([label, value], i) => ({
    label,
    value,
    color: DONUT_COLORS[i],
  }));

  if (otrosCount > 0) {
    segments.push({ label: 'Outros', value: otrosCount, color: DONUT_COLORS[7] });
  }

  return { segments, title, subtitle };
}

/**
 * Build aging bar chart grouped by days_in_stage buckets.
 */
function buildAgingBar(deals, title = 'Aging') {
  if (!deals.length) return null;

  const counts = { '0-7d': 0, '8-14d': 0, '15-30d': 0, '30d+': 0 };
  for (const d of deals) {
    counts[agingBucket(getDaysInStage(d))]++;
  }

  const bars = AGING_BUCKETS.map(label => ({
    label,
    value: counts[label],
    color: AGING_COLORS[label],
  }));

  return { bars, title, subtitle: 'Distribuição por tempo no stage', mode: 'aging' };
}

/** Empty KPI card with dashes */
function emptyCard(icon, iconColor, label) {
  return { icon, iconColor, label, value: '—', detail: '—', description: '' };
}

// ── Per-tab KPI builders ────────────────────────────────────────────────────

const STAGNATION_THRESHOLD_DAYS = 14;

function mqlKpis(deals, context = {}) {
  const total = deals.length;

  // Context: bowtie (período) + all-time yayforms
  const { totalLeads, totalMql, mqlsNotInPipe, avgCompletionMin, mqlCount: mqlPeriodo } = context;
  const mqlPct = (totalLeads != null && totalLeads > 0) ? totalMql / totalLeads : null;

  // Formatar tempo médio de conclusão
  let avgTimeLabel = '—';
  let avgTimeDetail = '—';
  if (avgCompletionMin != null) {
    if (avgCompletionMin < 1) {
      avgTimeLabel = `${Math.round(avgCompletionMin * 60)}s`;
      avgTimeDetail = `${Math.round(avgCompletionMin * 60)} segundos em média`;
    } else if (avgCompletionMin < 60) {
      avgTimeLabel = `${Math.round(avgCompletionMin)}min`;
      avgTimeDetail = `${avgCompletionMin.toFixed(1)} minutos em média`;
    } else {
      const hrs = avgCompletionMin / 60;
      avgTimeLabel = `${hrs.toFixed(1)}h`;
      avgTimeDetail = `${hrs.toFixed(1)} horas em média`;
    }
  }

  return [
    {
      icon: '📨', iconColor: 'info',
      label: 'Volume de Entrada',
      value: mqlPeriodo != null ? F.n(mqlPeriodo) : F.n(total),
      detail: mqlPeriodo != null ? `${total} deals open no pipe` : `${total} deals open`,
      description: 'MQLs no período selecionado',
    },
    {
      icon: '⚠️', iconColor: 'warning',
      label: 'MQLs sem Pipedrive',
      value: mqlsNotInPipe != null ? F.n(mqlsNotInPipe) : '—',
      detail: totalMql != null && totalMql > 0 ? F.p(mqlsNotInPipe / totalMql) + ' dos MQLs' : '—',
      description: 'Leads qualificados ainda sem deal no CRM',
    },
    {
      icon: '🕐', iconColor: 'warning',
      label: 'Tempo Médio Formulário',
      value: avgTimeLabel,
      detail: avgTimeDetail,
      description: 'Tempo médio de conclusão (created→submitted)',
    },
    {
      icon: '📈', iconColor: 'positive',
      label: '% Qualificados MQL',
      value: mqlPct != null ? F.p(mqlPct) : '—',
      detail: totalLeads != null ? `${totalMql} de ${totalLeads} leads` : '—',
      description: 'MQLs sobre total de leads YayForms (all-time)',
    },
  ];
}

function sqlKpis(deals, context = {}) {
  const total = deals.length;
  const pipeline = sum(deals.map(d => d.value ?? d.deal_value ?? 0));

  const revisarVal = CUSTOM_FIELDS.SQL_FLAG.values.A_REVISAR;
  const aRevisar = deals.filter(d => {
    const cf = parseCustomFields(d.custom_fields);
    return cf[CUSTOM_FIELDS.SQL_FLAG.key] === revisarVal;
  }).length;

  // avg days from deal_created_at to data_qualificacao
  const qualKey = CUSTOM_FIELDS.DATA_QUALIFICACAO.key;
  const cyclesDays = deals.map(d => {
    const cf = parseCustomFields(d.custom_fields);
    const qualDate = cf[qualKey];
    return daysBetween(d.deal_created_at, qualDate);
  }).filter(v => v != null);
  const avgCycle = avg(cyclesDays);

  // % MQL→SQL: all-time (totalSql / totalMql do yayforms+CRM)
  const totalMqlAllTime = context.totalMql;
  const totalSqlAllTime = context.totalSql;
  const sqlPct = (totalMqlAllTime != null && totalMqlAllTime > 0 && totalSqlAllTime != null)
    ? totalSqlAllTime / totalMqlAllTime
    : null;

  return [
    {
      icon: '💲', iconColor: 'info',
      label: 'Pipeline em Avaliação',
      value: F.ri(pipeline),
      detail: `${total} deals`,
      description: 'Valor total em negociação SQL',
    },
    {
      icon: '⚠️', iconColor: 'warning',
      label: 'A Revisar',
      value: F.n(aRevisar),
      detail: total ? F.p(aRevisar / total) + ' do total' : '—',
      description: 'SQL FLAG = A_REVISAR',
    },
    {
      icon: '🕐', iconColor: 'warning',
      label: 'Tempo Médio Criação→Qualificação',
      value: avgCycle != null ? F.d(avgCycle) : '—',
      detail: avgCycle != null ? `${Math.round(avgCycle)} dias em média` : '—',
      description: 'Da criação até data_qualificacao',
    },
    {
      icon: '📈', iconColor: 'positive',
      label: '% MQL→SQL',
      value: sqlPct != null ? F.p(sqlPct) : '—',
      detail: totalMqlAllTime != null ? `${totalSqlAllTime} de ${totalMqlAllTime} MQLs` : '—',
      description: 'Conversão de MQL para SQL (all-time)',
    },
  ];
}

function reuniaoKpis(deals) {
  const total = deals.length;
  const pipeline = sum(deals.map(d => d.value ?? d.deal_value ?? 0));

  // Taxa de confirmação: REUNIAO_REALIZADA = SIM
  const reuniaoRealizadaKey = CUSTOM_FIELDS.REUNIAO_REALIZADA.key;
  const reuniaoSimVal = CUSTOM_FIELDS.REUNIAO_REALIZADA.values.SIM;
  const confirmed = deals.filter(d => {
    const cf = parseCustomFields(d.custom_fields);
    return cf[reuniaoRealizadaKey] == reuniaoSimVal;
  }).length;
  const confirmPct = total ? confirmed / total : null;

  // Tempo médio: data_qualificacao → data_reuniao
  const qualReuDays = deals.map(d => daysBetween(d.data_qualificacao, d.data_reuniao)).filter(v => v != null);
  const avgQualToReuniao = avg(qualReuDays);

  const maxDeal = deals.reduce((best, d) => {
    const v = d.value ?? d.deal_value ?? 0;
    return v > (best?.v ?? -Infinity) ? { name: d.title ?? d.deal_name ?? '—', v } : best;
  }, null);

  return [
    {
      icon: '💲', iconColor: 'info',
      label: 'R$ Pipeline',
      value: F.ri(pipeline),
      detail: `${total} deals`,
      description: 'Valor total em reunião',
    },
    {
      icon: '📈', iconColor: 'positive',
      label: 'Progresso',
      value: confirmPct != null ? F.p(confirmPct) : '—',
      detail: `${confirmed} de ${total} confirmaram`,
      description: 'Taxa de confirmação de reunião',
    },
    {
      icon: '🕐', iconColor: 'warning',
      label: 'Tempo Médio',
      value: avgQualToReuniao != null ? F.d(avgQualToReuniao) : '—',
      detail: avgQualToReuniao != null ? `${Math.round(avgQualToReuniao)} dias em média` : '—',
      description: 'Da qualificação até a reunião',
    },
    {
      icon: '🏆', iconColor: 'content-tertiary',
      label: 'Maior Deal',
      value: maxDeal ? F.ri(maxDeal.v) : '—',
      detail: maxDeal ? maxDeal.name : '—',
      description: 'Deal de maior valor em Reunião',
    },
  ];
}

function propostaKpis(deals, context = {}) {
  const total = deals.length;
  const pipeline = sum(deals.map(d => d.value ?? d.deal_value ?? 0));
  const ticket = total ? pipeline / total : null;

  // Ciclo médio histórico: data_reuniao → resolution_date (from context.cycleData)
  const cycleData = context.cycleData || [];
  const cycleDays = cycleData
    .map(c => daysBetween(c.data_reuniao, c.resolution_date))
    .filter(v => v != null);
  const avgCycle = avg(cycleDays);

  // Conversão reunião realizada → vendas (from bowtie context)
  const rrCount = context.reuniaoRealizadaCount;
  const vCount = context.vendasCount;
  const convRate = (rrCount > 0 && vCount != null) ? vCount / rrCount : null;
  const receitaProjetada = convRate != null ? pipeline * convRate : null;

  return [
    {
      icon: '💲', iconColor: 'info',
      label: 'Faturamento do Pipe',
      value: F.ri(pipeline),
      detail: `${total} deals`,
      description: 'Valor total em proposta',
    },
    {
      icon: '📈', iconColor: 'positive',
      label: 'Receita Projetada',
      value: receitaProjetada != null ? F.ri(receitaProjetada) : '—',
      detail: convRate != null ? `${Math.round(convRate * 100)}% conv. R. Realizada` : '—',
      description: 'Faturamento × conversão reunião realizada',
    },
    {
      icon: '💰', iconColor: 'positive',
      label: 'Ticket Médio',
      value: ticket != null ? F.ri(ticket) : '—',
      detail: ticket != null ? F.ri(ticket) + ' por deal' : '—',
      description: 'Valor médio das propostas',
    },
    {
      icon: '🕐', iconColor: 'warning',
      label: 'Ciclo Médio',
      value: avgCycle != null ? F.d(avgCycle) : '—',
      detail: avgCycle != null
        ? `${Math.round(avgCycle)} dias (${cycleDays.length} deals)`
        : '—',
      description: 'Da reunião até fechamento',
    },
  ];
}

function perdaKpis(deals) {
  const total = deals.length;
  const totalValue = sum(deals.map(d => d.value ?? d.deal_value ?? 0));

  const reasons = deals.map(d => d.lost_reason ?? d.loss_reason ?? null).filter(Boolean);
  const topReason = mostFrequent(reasons);

  const mercados = deals.map(d => d.mercado ?? d.segmento ?? null).filter(Boolean);
  const topMercado = mostFrequent(mercados);

  return [
    {
      icon: '❌', iconColor: 'negative',
      label: 'Total Perdido',
      value: F.n(total),
      detail: `${total} deals perdidos`,
      description: 'Quantidade de perdas no período',
    },
    {
      icon: '❌', iconColor: 'negative',
      label: 'Principal Motivo',
      value: topReason ? topReason.value : '—',
      detail: topReason
        ? `${topReason.count} × ${total ? F.p(topReason.count / total) : '—'}`
        : '—',
      description: 'Motivo de perda mais frequente',
    },
    {
      icon: '💲', iconColor: 'negative',
      label: 'Valor Perdido',
      value: F.ri(totalValue),
      detail: `${total} deals`,
      description: 'Receita total não convertida',
    },
    {
      icon: '⚠️', iconColor: 'warning',
      label: 'Concentração',
      value: topMercado ? topMercado.value : '—',
      detail: topMercado ? `${topMercado.count} deals` : '—',
      description: 'Mercado/segmento mais perdido',
    },
  ];
}

function resultadoKpis(deals) {
  const total = deals.length;
  const totalValue = sum(deals.map(d => d.value ?? d.deal_value ?? 0));
  const ticket = total ? totalValue / total : null;

  // avg days from deal_created_at to won_time
  const cycles = deals.map(d => daysBetween(d.deal_created_at, d.won_time)).filter(v => v != null);
  const avgCycle = avg(cycles);

  return [
    {
      icon: '🏆', iconColor: 'positive',
      label: 'Total Ganho',
      value: F.n(total),
      detail: `${total} deals ganhos`,
      description: 'Deals convertidos no período',
    },
    {
      icon: '💲', iconColor: 'info',
      label: 'Receita Total',
      value: F.ri(totalValue),
      detail: `${total} deals`,
      description: 'Receita total gerada',
    },
    {
      icon: '💰', iconColor: 'positive',
      label: 'Ticket Médio',
      value: ticket != null ? F.ri(ticket) : '—',
      detail: ticket != null ? F.ri(ticket) + ' por deal' : '—',
      description: 'Valor médio dos deals ganhos',
    },
    {
      icon: '🕐', iconColor: 'warning',
      label: 'Ciclo Médio',
      value: avgCycle != null ? F.d(avgCycle) : '—',
      detail: avgCycle != null ? `${Math.round(avgCycle)} dias` : '—',
      description: 'Criação até won_time',
    },
  ];
}

// ── Per-tab Chart builders ──────────────────────────────────────────────────

function perdaCharts(deals) {
  // Donut by mercado/segmento
  const donut = buildDonut(deals, 'mercado', 'Distribuição por Mercado', 'Perdas por segmento');

  // Bar by stage_name
  if (!deals.length) return { donut, bar: null };

  const freq = {};
  for (const d of deals) {
    const sn = d.stage_name ?? 'Desconhecido';
    freq[sn] = (freq[sn] ?? 0) + 1;
  }
  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
  const bars = sorted.map(([label, value], i) => ({
    label,
    value,
    color: DONUT_COLORS[i % DONUT_COLORS.length],
  }));

  const bar = {
    bars,
    title: 'Perdas por Etapa',
    subtitle: 'Distribuição de perdas por stage',
    mode: 'default',
  };

  return { donut, bar };
}

function resultadoCharts(deals) {
  const donut = buildDonut(deals, 'mercado', 'Distribuição por Mercado', 'Resultado por mercado');

  if (!deals.length) return { donut, bar: null };

  const MONTHS_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const freq = {};
  for (const d of deals) {
    const dt = parseDate(d.won_time);
    if (!dt) continue;
    const label = `${MONTHS_PT[dt.getMonth()]}/${String(dt.getFullYear()).slice(2)}`;
    freq[label] = (freq[label] ?? 0) + 1;
  }

  // Sort chronologically by parsing the label back (simple lexicographic on year/month key)
  const sorted = Object.entries(freq).sort((a, b) => a[0].localeCompare(b[0]));
  const bars = sorted.map(([label, value], i) => ({
    label,
    value,
    color: DONUT_COLORS[i % DONUT_COLORS.length],
  }));

  const bar = {
    bars,
    title: 'Resultados por Mês',
    subtitle: 'Deals ganhos por mês',
    mode: 'default',
  };

  return { donut, bar };
}

// ── Null/empty guard ────────────────────────────────────────────────────────

function emptyResult(tabKey) {
  const TAB_LABELS = {
    mql:       ['Volume de Entrada', 'MQLs sem Pipedrive', 'Tempo Médio Formulário', '% Qualificados MQL'],
    sql:       ['Pipeline em Avaliação', 'A Revisar', 'Tempo Médio Criação→Qualificação', '% MQL→SQL'],
    reuniao:   ['R$ Pipeline', 'Progresso', 'Tempo Médio', 'Maior Deal'],
    proposta:  ['Valor Esperado', 'Gasto em Ads', 'Ticket Médio', 'Ciclo Médio'],
    perda:     ['Total Perdido', 'Principal Motivo', 'Valor Perdido', 'Concentração'],
    resultado: ['Total Ganho', 'Receita Total', 'Ticket Médio', 'Ciclo Médio'],
  };
  const labels = TAB_LABELS[tabKey] ?? ['—', '—', '—', '—'];
  return {
    kpis: labels.map(label => emptyCard('—', 'info', label)),
    charts: { donut: null, bar: null },
  };
}

// ── Main export ─────────────────────────────────────────────────────────────

/**
 * Compute KPIs and charts for a stage tab.
 *
 * @param {string} tabKey - One of: 'mql' | 'sql' | 'reuniao' | 'proposta' | 'perda' | 'resultado'
 * @param {Array}  deals  - Raw deal objects from Supabase/Pipedrive
 * @param {Object} [context={}] - Cross-tab data (e.g. { leadCount, mqlCount } from Bowtie)
 * @returns {{ kpis: Array, charts: { donut: object|null, bar: object|null } }}
 */
export function computeStageData(tabKey, deals, context = {}) {
  if (!deals || !Array.isArray(deals)) return emptyResult(tabKey);

  switch (tabKey) {
    case 'mql': {
      const kpis = deals.length ? mqlKpis(deals, context) : emptyResult('mql').kpis;
      const donut = buildDonut(deals, 'segmento', 'Distribuição por Segmento', 'MQLs por segmento');
      const revenueDonut = deals.length
        ? buildDonut(deals, 'faturamento_anual', 'Faturamento', 'Distribuição por faixa de faturamento')
        : null;
      return { kpis, charts: { donut, bar: revenueDonut } };
    }

    case 'sql': {
      const kpis = deals.length ? sqlKpis(deals, context) : emptyResult('sql').kpis;
      const donut = buildDonut(deals, 'mercado', 'Distribuição por Mercado', 'SQLs por mercado');
      const bar = deals.length ? buildAgingBar(deals, 'Aging SQL') : null;
      return { kpis, charts: { donut, bar } };
    }

    case 'reuniao': {
      const kpis = deals.length ? reuniaoKpis(deals) : emptyResult('reuniao').kpis;
      const donut = buildDonut(deals, 'mercado', 'Distribuição por Mercado', 'Reuniões por mercado');
      const bar = deals.length ? buildAgingBar(deals, 'Aging Reunião') : null;
      return { kpis, charts: { donut, bar } };
    }

    case 'proposta': {
      const kpis = deals.length ? propostaKpis(deals, context) : emptyResult('proposta').kpis;
      const donut = buildDonut(deals, 'mercado', 'Distribuição por Mercado', 'Propostas por mercado');
      const bar = deals.length ? buildAgingBar(deals, 'Aging Proposta') : null;
      return { kpis, charts: { donut, bar } };
    }

    case 'perda': {
      const kpis = deals.length ? perdaKpis(deals) : emptyResult('perda').kpis;
      const { donut, bar } = deals.length ? perdaCharts(deals) : { donut: null, bar: null };
      return { kpis, charts: { donut, bar } };
    }

    case 'resultado': {
      const kpis = deals.length ? resultadoKpis(deals) : emptyResult('resultado').kpis;
      const { donut, bar } = deals.length ? resultadoCharts(deals) : { donut: null, bar: null };
      return { kpis, charts: { donut, bar } };
    }

    default:
      return emptyResult(tabKey);
  }
}
