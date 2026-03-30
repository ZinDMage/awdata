import { supabase } from './supabaseClient';
import { STAGE_TABS, STAGE_IDS, CUSTOM_FIELDS, PIPELINE_FUNNELS, FUNNEL_LABELS, parseCustomFields } from '@/config/pipedrive';
import { resolveBatch } from '@/utils/dataPrecedence';
import { classifyLead } from '@/services/classificationService';
import { normalizeEmail, deduplicateYayforms, fetchAll } from '@/services/fetchService';

// ── Data mínima: só trabalhamos com dados a partir de 2026 ──
const DATA_START_DATE = '2026-01-01';

/**
 * Helper: executa query Supabase paginada (batches de 1000).
 * Recebe um "query builder" fn que retorna a query base com todos os filtros.
 * Retorna array completo sem truncamento.
 */
async function paginatedQuery(buildQuery) {
  let all = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await buildQuery().range(from, from + PAGE - 1);
    if (error) { console.error('[paginatedQuery] error:', error); break; }
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

// ── Bowtie funnel stages (7 stages, cumulative progression) ──
const BOWTIE_STAGES = [
  { key: 'lead',          label: 'Lead' },
  { key: 'mql',           label: 'MQL' },
  { key: 'sql',           label: 'SQL' },
  { key: 'reuniao_ag',    label: 'R. Agendada' },
  { key: 'reuniao_real',  label: 'R. Realizada' },
  { key: 'vendas',        label: 'Pagamentos Realizados' },
  { key: 'contrato',      label: 'Contrato Enviado' },
];

// ── Helper: aplica filtro de funil na query ──
function applyFunnelFilter(query, funnel) {
  if (!funnel || funnel === 'todos') return query;
  const pipelineIds = PIPELINE_FUNNELS[funnel];
  if (!pipelineIds?.length) return query;
  return query.in('pipeline_id', pipelineIds);
}

/**
 * Query analítica por período — Bowtie (AD-V2-1).
 * Deals agrupados por stage, com contagens, conversões e tempos médios.
 */
export async function fetchBowtieData(startMonth, endMonth, funnel) {
  try {
    const deals = await paginatedQuery(() => {
      let q = supabase
        .from('crm_deals')
        .select('id, stage_id, stage_name, status, deal_created_at, close_time, value, pipeline_id, custom_fields, person_email')
        .gte('deal_created_at', `${startMonth}-01`)
        .lt('deal_created_at', getNextMonth(endMonth));
      return applyFunnelFilter(q, funnel);
    });
    if (!deals?.length) return { stages: [], conversions: [], avgTimes: [] };

    // Contagem cumulativa: quantos deals do período passaram por cada etapa
    const counts = { lead: 0, mql: 0, sql: 0, reuniao_ag: 0, reuniao_real: 0, vendas: 0, contrato: 0 };

    // ── Lead e MQL: fonte primária é yayforms_responses (inbound) ──
    const isInboundScope = !funnel || funnel === 'todos' || funnel === 'inbound';
    if (isInboundScope) {
      const yayData = await paginatedQuery(() =>
        supabase
          .from('yayforms_responses')
          .select('lead_email, lead_revenue_range, lead_monthly_volume, lead_segment, lead_market, submitted_at')
          .gte('submitted_at', `${startMonth}-01`)
          .lt('submitted_at', getNextMonth(endMonth))
      );

      if (yayData.length) {
        // Normalizar emails e deduplicar (mesma lógica do fetchService)
        const normalized = yayData.map(r => ({ ...r, lead_email: normalizeEmail(r.lead_email) }));
        const deduped = deduplicateYayforms(normalized);
        counts.lead = deduped.length;
        counts.mql = deduped.filter(l =>
          classifyLead(l.lead_revenue_range, l.lead_monthly_volume, l.lead_segment, l.lead_market) === 'MQL'
        ).length;
      }
    }

    // Para funis não-inbound (indicação, wordwild), leads vêm do CRM
    if (funnel && funnel !== 'todos' && funnel !== 'inbound') {
      counts.lead = deals.length;
      counts.mql = deals.length; // Todos os deals nesses funis são considerados MQL
    }

    // Se 'todos', somar leads de funis não-inbound aos do yayforms
    if (funnel === 'todos') {
      const nonInboundPipelines = [
        ...(PIPELINE_FUNNELS.indicacao || []),
        ...(PIPELINE_FUNNELS.wordwild || []),
        ...(PIPELINE_FUNNELS.revenueleakage || []),
      ];
      const nonInboundDeals = deals.filter(d => nonInboundPipelines.includes(d.pipeline_id));
      counts.lead += nonInboundDeals.length;
      counts.mql += nonInboundDeals.length;
    }

    // ── SQL+ stages: contados a partir de crm_deals ──
    for (const deal of deals) {
      const cf = parseCustomFields(deal.custom_fields);
      const isSQL = cf[CUSTOM_FIELDS.SQL_FLAG.key] == CUSTOM_FIELDS.SQL_FLAG.values.SIM;
      const hasReuniao = !!(cf[CUSTOM_FIELDS.DATA_REUNIAO.key]);
      const reuniaoRealizada = cf[CUSTOM_FIELDS.REUNIAO_REALIZADA.key] == CUSTOM_FIELDS.REUNIAO_REALIZADA.values.SIM;
      const inContratoStage = STAGE_IDS.CONTRATO_ENVIADO.includes(deal.stage_id);

      // SQL: custom field SQL_FLAG = SIM
      if (isSQL) counts.sql++;

      // Reunião Agendada: exige isSQL + data_reuniao preenchido (cumulativo)
      if (isSQL && hasReuniao) counts.reuniao_ag++;

      // Reunião Realizada: exige isSQL + REUNIAO_REALIZADA = SIM (cumulativo)
      if (isSQL && reuniaoRealizada) counts.reuniao_real++;

      // Contrato Enviado: apenas deals no stage de contrato (por data de criação)
      if (inContratoStage) counts.contrato++;
    }

    // Pagamentos Realizados: contar via tabela sales (join por email)
    const dealEmails = deals
      .map(d => d.person_email?.trim()?.toLowerCase())
      .filter(Boolean);

    if (dealEmails.length > 0) {
      const uniqueEmails = [...new Set(dealEmails)];
      const salesData = await paginatedQuery(() =>
        supabase
          .from('sales')
          .select('email_pipedrive')
          .in('email_pipedrive', uniqueEmails)
          .gte('data_fechamento', `${startMonth}-01`)
          .lt('data_fechamento', getNextMonth(endMonth))
      );

      const salesEmails = new Set(salesData.map(s => s.email_pipedrive?.trim()?.toLowerCase()).filter(Boolean));
      counts.vendas = deals.filter(d => {
        const email = d.person_email?.trim()?.toLowerCase();
        return email && salesEmails.has(email);
      }).length;
    } else {
      counts.vendas = 0;
    }

    const stages = BOWTIE_STAGES.map(s => ({
      name: s.label,
      count: counts[s.key] || 0,
    }));

    // Conversões entre etapas sequenciais
    const conversions = [];
    for (let i = 1; i < stages.length; i++) {
      const prev = stages[i - 1].count;
      conversions.push(prev > 0 ? Math.round((stages[i].count / prev) * 100) : 0);
    }

    // Tempo médio por stage via transitions
    const dealIds = deals.map(d => d.id);
    const transitions = await paginatedQuery(() =>
      supabase
        .from('crm_stage_transitions')
        .select('deal_id, to_stage_id, time_in_previous_stage_sec')
        .in('deal_id', dealIds)
        .gte('transitioned_at', `${startMonth}-01`)
        .lt('transitioned_at', getNextMonth(endMonth))
    );
    const avgTimes = computeBowtieAvgTimes(transitions);

    const perda = deals.filter(d => d.status === 'lost').length;
    const resultado = deals.filter(d => d.status === 'won').length;

    return { stages, conversions, avgTimes, perda, resultado };
  } catch (err) {
    console.error('[gerencialService] fetchBowtieData error:', err);
    return { stages: [], conversions: [], avgTimes: [], perda: 0, resultado: 0 };
  }
}

/**
 * Snapshot de deals por stageIds ou status (AD-V2-1).
 * Enriquece com dados YayForms via dataPrecedence (FR75).
 * tabKey: chave da STAGE_TABS (para identificar perda/resultado)
 */
export async function fetchStageDeals(stageIds, funnel, tabKey) {
  try {
    let query = supabase.from('crm_deals').select('*');

    // perda/resultado: buscar por status ao invés de stage_id
    if (tabKey === 'perda') {
      query = query.eq('status', 'lost');
    } else if (tabKey === 'resultado') {
      query = query.eq('status', 'won');
    } else {
      if (!stageIds?.length) return [];
      query = query.eq('status', 'open').in('stage_id', stageIds);
    }

    // Filtro temporal: apenas dados a partir de 2026
    query = query.gte('deal_created_at', DATA_START_DATE);

    query = applyFunnelFilter(query, funnel);

    const { data: deals, error } = await query;
    if (error) throw error;
    if (!deals?.length) return [];

    // Enriquecer com dados YayForms (FR75)
    return await resolveBatch(deals, supabase);
  } catch (err) {
    console.error('[gerencialService] fetchStageDeals error:', err);
    return [];
  }
}

/**
 * Contagens agrupadas por aba lógica via STAGE_TABS.
 */
export async function fetchPillCounts(funnel) {
  try {
    const deals = await paginatedQuery(() => {
      let q = supabase
        .from('crm_deals')
        .select('id, stage_id, status, person_email, person_phone, custom_fields')
        .eq('status', 'open')
        .gte('deal_created_at', DATA_START_DATE);
      return applyFunnelFilter(q, funnel);
    });

    const sqlKey = CUSTOM_FIELDS.SQL_FLAG.key;
    const sqlSimVal = CUSTOM_FIELDS.SQL_FLAG.values.SIM;
    const reuniaoKey = CUSTOM_FIELDS.DATA_REUNIAO.key;
    const reuniaoRealizadaKey = CUSTOM_FIELDS.REUNIAO_REALIZADA.key;
    const reuniaoRealizadaSim = CUSTOM_FIELDS.REUNIAO_REALIZADA.values.SIM;

    // Usar STAGE_IDS (mesma fonte do ForecastPanel) em vez de STAGE_TABS
    const stageMap = [
      { key: 'mql', ids: new Set(STAGE_IDS.MQL) },
      { key: 'sql', ids: new Set(STAGE_IDS.SQL) },
      { key: 'reuniao', ids: new Set(STAGE_IDS.REUNIAO_AGENDADA) },
      { key: 'proposta', ids: new Set(STAGE_IDS.PROPOSTA) },
      { key: 'contrato', ids: new Set(STAGE_IDS.CONTRATO_ENVIADO) },
    ];

    const counts = { mql: 0, sql: 0, reuniao: 0, proposta: 0, contrato: 0, perda: 0, resultado: 0 };

    // MQL: enriquecer + classifyLead (mesma regra da aba MQL e ForecastPanel)
    const mqlIds = new Set(STAGE_IDS.MQL);
    const mqlDeals = deals.filter(d => mqlIds.has(d.stage_id));
    const enrichedMql = await resolveBatch(mqlDeals, supabase);
    const classifiedMqlIds = new Set(
      enrichedMql
        .filter(d => classifyLead(d.faturamento_anual, d.volume_mensal, d.segmento, d.mercado) === 'MQL')
        .map(d => d.id)
    );

    for (const deal of deals) {
      const cf = parseCustomFields(deal.custom_fields);
      const isSQL = cf[sqlKey] == sqlSimVal;
      const hasEmailPhone = !!(deal.person_email?.trim() && deal.person_phone?.trim());
      const hasDataReuniao = !!cf[reuniaoKey];
      const reuniaoRealizada = cf[reuniaoRealizadaKey] == reuniaoRealizadaSim;

      for (const group of stageMap) {
        if (!group.ids.has(deal.stage_id)) continue;

        // Mesmos filtros do ForecastPanel
        if (group.key === 'mql' && !classifiedMqlIds.has(deal.id)) break;
        if (group.key === 'sql' && !(hasEmailPhone && isSQL)) break;
        if (group.key === 'reuniao' && !(isSQL && hasDataReuniao)) break;
        if (group.key === 'proposta' && !(isSQL && reuniaoRealizada)) break;

        counts[group.key]++;
        break;
      }
    }

    // perda e resultado: contagens separadas por status (com filtro de funil)
    let lostQuery = supabase
      .from('crm_deals')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'lost')
      .gte('deal_created_at', DATA_START_DATE);
    lostQuery = applyFunnelFilter(lostQuery, funnel);

    let wonQuery = supabase
      .from('crm_deals')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'won')
      .gte('deal_created_at', DATA_START_DATE);
    wonQuery = applyFunnelFilter(wonQuery, funnel);

    const [{ count: lostCount }, { count: wonCount }] = await Promise.all([lostQuery, wonQuery]);
    counts.perda = lostCount || 0;
    counts.resultado = wonCount || 0;

    return counts;
  } catch (err) {
    console.error('[gerencialService] fetchPillCounts error:', err);
    return { mql: 0, sql: 0, reuniao: 0, proposta: 0, perda: 0, resultado: 0 };
  }
}

/**
 * Detalhes de 1 deal: transitions + calls + tasks (AD-V2-4).
 */
export async function fetchDealDetails(dealId) {
  if (!dealId) return { transitions: [], calls: [], tasks: [] };
  try {
    const [transResult, activResult] = await Promise.all([
      supabase
        .from('crm_stage_transitions')
        .select('deal_id, from_stage_name, to_stage_name, to_stage_id, transitioned_at, time_in_previous_stage_sec, direction')
        .eq('deal_id', dealId)
        .order('transitioned_at', { ascending: true }),
      supabase
        .from('crm_deal_activities')
        .select('activity_id, activity_type, subject, due_date, due_time, duration, done, owner_name, assigned_to_user_id')
        .eq('deal_id', dealId)
        .order('due_date', { ascending: false }),
    ]);

    const transitions = transResult.data || [];
    const activities = activResult.data || [];

    const calls = activities.filter(a => a.activity_type === 'call');
    const tasks = activities.filter(a => a.activity_type !== 'call');

    return { transitions, calls, tasks };
  } catch (err) {
    console.error('[gerencialService] fetchDealDetails error:', err);
    return { transitions: [], calls: [], tasks: [] };
  }
}

/**
 * Taxa de conversão histórica: reunião realizada → vendas (jan 2026 até hoje).
 * Retorna { reuniaoRealizadaCount, vendasCount, convRate }.
 */
export async function fetchHistoricalConvRate() {
  try {
    const { data: deals, error } = await supabase
      .from('crm_deals')
      .select('id, person_email, custom_fields, status')
      .gte('deal_created_at', DATA_START_DATE);

    if (error) throw error;
    if (!deals?.length) return { reuniaoRealizadaCount: 0, vendasCount: 0, convRate: null };

    let reuniaoReal = 0;
    for (const deal of deals) {
      const cf = parseCustomFields(deal.custom_fields);
      const isSQL = cf[CUSTOM_FIELDS.SQL_FLAG.key] == CUSTOM_FIELDS.SQL_FLAG.values.SIM;
      const rrFlag = cf[CUSTOM_FIELDS.REUNIAO_REALIZADA.key] == CUSTOM_FIELDS.REUNIAO_REALIZADA.values.SIM;
      if (isSQL && rrFlag) reuniaoReal++;
    }

    // Vendas: via tabela sales (join por email)
    const dealEmails = deals
      .map(d => d.person_email?.trim()?.toLowerCase())
      .filter(Boolean);

    let vendasCount = 0;
    if (dealEmails.length > 0) {
      const { data: salesData } = await supabase
        .from('sales')
        .select('email_pipedrive')
        .in('email_pipedrive', [...new Set(dealEmails)])
        .gte('data_fechamento', DATA_START_DATE);

      const salesEmails = new Set((salesData || []).map(s => s.email_pipedrive?.trim()?.toLowerCase()).filter(Boolean));
      vendasCount = deals.filter(d => {
        const email = d.person_email?.trim()?.toLowerCase();
        return email && salesEmails.has(email);
      }).length;
    }

    const convRate = reuniaoReal > 0 ? vendasCount / reuniaoReal : null;
    return { reuniaoRealizadaCount: reuniaoReal, vendasCount, convRate };
  } catch (err) {
    console.error('[gerencialService] fetchHistoricalConvRate error:', err);
    return { reuniaoRealizadaCount: 0, vendasCount: 0, convRate: null };
  }
}

/**
 * Soma spend das tabelas de ads (google + meta + linkedin) a partir de 2026.
 * Retorna número (total em reais).
 */
export async function fetchAdSpend() {
  try {
    const queries = [
      supabase.from('google_ads_costs').select('spend').gte('date', DATA_START_DATE),
      supabase.from('meta_ads_costs').select('spend').gte('date', DATA_START_DATE),
    ];

    // linkedin_ads_costs: catch graceful se não existir
    const linkedinPromise = supabase.from('linkedin_ads_costs').select('spend').gte('date', DATA_START_DATE)
      .then(res => res)
      .catch(() => ({ data: null }));
    queries.push(linkedinPromise);

    const results = await Promise.all(queries);

    let total = 0;
    for (const { data } of results) {
      if (!data) continue;
      for (const row of data) {
        const v = Number(row.spend);
        if (!isNaN(v)) total += v;
      }
    }

    return total;
  } catch (err) {
    console.error('[gerencialService] fetchAdSpend error:', err);
    return null;
  }
}

/**
 * Busca dados para cálculo do ciclo médio de proposta.
 * Retorna deals com data_reuniao + data de resolução:
 *   Won/Open: data_fechamento (sales, join por email)
 *   Lost: close_time (crm_deals)
 * Deals sem data de resolução são excluídos.
 */
export async function fetchPropostaCycleData() {
  try {
    // Buscar deals a partir de 2026 com custom_fields (para extrair data_reuniao e SQL_FLAG)
    const { data: deals, error } = await supabase
      .from('crm_deals')
      .select('id, status, person_email, custom_fields, close_time')
      .gte('deal_created_at', DATA_START_DATE);
    if (error) throw error;
    if (!deals?.length) return [];

    // Filtrar: SQL_FLAG=SIM e data_reuniao preenchida
    const sqlSimVal = CUSTOM_FIELDS.SQL_FLAG.values.SIM;
    const sqlKey = CUSTOM_FIELDS.SQL_FLAG.key;
    const reuniaoKey = CUSTOM_FIELDS.DATA_REUNIAO.key;

    const qualified = deals.filter(d => {
      const cf = parseCustomFields(d.custom_fields);
      return cf[sqlKey] == sqlSimVal && cf[reuniaoKey];
    }).map(d => {
      const cf = parseCustomFields(d.custom_fields);
      return {
        ...d,
        data_reuniao: cf[reuniaoKey],
        person_email: d.person_email?.trim()?.toLowerCase() || null,
      };
    });

    if (!qualified.length) return [];

    // Buscar sales a partir de 2026 para join por email (won + open)
    const emails = [...new Set(qualified.map(d => d.person_email).filter(Boolean))];
    let salesByEmail = {};
    if (emails.length) {
      const { data: salesData } = await supabase
        .from('sales')
        .select('email_pipedrive, email_stripe, data_fechamento')
        .gte('data_fechamento', DATA_START_DATE)
        .order('data_fechamento', { ascending: false });
      if (salesData) {
        for (const s of salesData) {
          const ep = s.email_pipedrive?.trim()?.toLowerCase();
          const es = s.email_stripe?.trim()?.toLowerCase();
          // Primeiro encontrado = mais recente (ordenado desc), não sobrescreve
          if (ep && s.data_fechamento && !salesByEmail[ep]) salesByEmail[ep] = s.data_fechamento;
          if (es && s.data_fechamento && !salesByEmail[es]) salesByEmail[es] = s.data_fechamento;
        }
      }
    }

    // Construir pares { data_reuniao, resolution_date }
    const cycleData = [];
    for (const d of qualified) {
      if (d.status === 'lost') {
        // Lost: usar close_time
        if (d.close_time) {
          cycleData.push({ data_reuniao: d.data_reuniao, resolution_date: d.close_time });
        }
      } else {
        // Won + Open: usar data_fechamento da sales
        const fechamento = d.person_email ? salesByEmail[d.person_email] : null;
        if (fechamento) {
          cycleData.push({ data_reuniao: d.data_reuniao, resolution_date: fechamento });
        }
      }
    }

    return cycleData;
  } catch (err) {
    console.error('[gerencialService] fetchPropostaCycleData error:', err);
    return [];
  }
}

/**
 * Contexto MQL: contagens do yayforms a partir de 2026 (paginado) + match com CRM.
 * Retorna { totalLeads, totalMql, mqlsNotInPipe }.
 */
export async function fetchMqlContext() {
  try {
    // Buscar yayforms a partir de 2026 (paginado, normalizado, deduplicado)
    const { data: yayDataRaw } = await fetchAll(
      'yayforms_responses',
      'lead_email, lead_revenue_range, lead_monthly_volume, lead_segment, lead_market, created_at, submitted_at'
    );
    const yayData = (yayDataRaw || []).filter(r => r.submitted_at >= DATA_START_DATE);
    if (!yayData.length) return { totalLeads: 0, totalMql: 0, mqlsNotInPipe: 0 };

    const totalLeads = yayData.length;

    // Classificar MQLs
    const mqls = yayData.filter(l =>
      classifyLead(l.lead_revenue_range, l.lead_monthly_volume, l.lead_segment, l.lead_market) === 'MQL'
    );
    const totalMql = mqls.length;

    // Match com CRM emails para contar MQLs sem Pipedrive (a partir de 2026)
    const { data: crmDeals } = await supabase
      .from('crm_deals')
      .select('person_email')
      .gte('deal_created_at', DATA_START_DATE);
    const crmEmails = new Set(
      (crmDeals || []).map(d => normalizeEmail(d.person_email)).filter(Boolean)
    );

    const mqlsNotInPipe = mqls.filter(l => !l.lead_email || !crmEmails.has(l.lead_email)).length;

    // Tempo médio de conclusão do formulário (created_at → submitted_at)
    const completionMs = yayData
      .map(l => {
        if (!l.created_at || !l.submitted_at) return null;
        const created = new Date(l.created_at).getTime();
        const submitted = new Date(l.submitted_at).getTime();
        if (isNaN(created) || isNaN(submitted) || submitted <= created) return null;
        return submitted - created;
      })
      .filter(v => v != null);
    const avgCompletionMs = completionMs.length
      ? completionMs.reduce((a, b) => a + b, 0) / completionMs.length
      : null;
    const avgCompletionMin = avgCompletionMs != null ? avgCompletionMs / 60000 : null;

    return { totalLeads, totalMql, mqlsNotInPipe, avgCompletionMin };
  } catch (err) {
    console.error('[gerencialService] fetchMqlContext error:', err);
    return { totalLeads: 0, totalMql: 0, mqlsNotInPipe: 0 };
  }
}

/**
 * Contexto SQL: contagens de MQLs (yayforms) e SQLs (crm_deals SQL_FLAG=SIM) a partir de 2026.
 * Retorna { totalMql, totalSql }.
 */
export async function fetchSqlContext() {
  try {
    // Total MQLs a partir de 2026 (yayforms)
    const { data: yayDataRaw } = await fetchAll(
      'yayforms_responses',
      'lead_email, lead_revenue_range, lead_monthly_volume, lead_segment, lead_market, submitted_at'
    );
    const totalMql = (yayDataRaw || []).filter(l =>
      l.submitted_at >= DATA_START_DATE &&
      classifyLead(l.lead_revenue_range, l.lead_monthly_volume, l.lead_segment, l.lead_market) === 'MQL'
    ).length;

    // Total SQLs a partir de 2026 (deals com SQL_FLAG=SIM) — paginado
    const { data: deals } = await fetchAll('crm_deals', 'custom_fields, deal_created_at');
    const sqlSimVal = CUSTOM_FIELDS.SQL_FLAG.values.SIM;
    const sqlKey = CUSTOM_FIELDS.SQL_FLAG.key;
    const totalSql = (deals || []).filter(d => {
      if (d.deal_created_at < DATA_START_DATE) return false;
      const cf = parseCustomFields(d.custom_fields);
      return cf[sqlKey] == sqlSimVal;
    }).length;

    return { totalMql, totalSql };
  } catch (err) {
    console.error('[gerencialService] fetchSqlContext error:', err);
    return { totalMql: 0, totalSql: 0 };
  }
}

/**
 * Dados para previsibilidade de receita: taxas de conversão e ciclos médios entre etapas.
 * Retorna { transitions, stages, bottleneckIdx }.
 */
export async function fetchForecastData(funnel, startMonth, endMonth) {
  try {
    // 1. Deals filtrados por período (ou all-time desde 2026)
    const dateFrom = startMonth ? `${startMonth}-01` : DATA_START_DATE;
    const dateTo = endMonth ? getNextMonth(endMonth) : null;
    const allDeals = await paginatedQuery(() => {
      let q = supabase.from('crm_deals')
        .select('id, stage_id, status, deal_created_at, close_time, won_time, lost_time, value, pipeline_id, custom_fields, person_email, person_phone')
        .gte('deal_created_at', dateFrom);
      if (dateTo) q = q.lt('deal_created_at', dateTo);
      return applyFunnelFilter(q, funnel);
    });
    if (!allDeals?.length) return null;

    // Parse custom fields
    const sqlKey = CUSTOM_FIELDS.SQL_FLAG.key;
    const sqlSimVal = CUSTOM_FIELDS.SQL_FLAG.values.SIM;
    const qualKey = CUSTOM_FIELDS.DATA_QUALIFICACAO.key;
    const reuniaoKey = CUSTOM_FIELDS.DATA_REUNIAO.key;
    const reuniaoRealizadaKey = CUSTOM_FIELDS.REUNIAO_REALIZADA.key;
    const reuniaoRealizadaSim = CUSTOM_FIELDS.REUNIAO_REALIZADA.values.SIM;
    const propostaKey = CUSTOM_FIELDS.DATA_PROPOSTA.key;

    const deals = allDeals.map(d => {
      const cf = parseCustomFields(d.custom_fields);
      return {
        ...d,
        _isSQL: cf[sqlKey] == sqlSimVal,
        _hasEmailAndPhone: !!(d.person_email?.trim() && d.person_phone?.trim()),
        _dataQualificacao: cf[qualKey] || null,
        _dataReuniao: cf[reuniaoKey] || null,
        _reuniaoRealizada: cf[reuniaoRealizadaKey] == reuniaoRealizadaSim,
        _dataProposta: cf[propostaKey] || null,
      };
    });

    // 2. Transitions + Sales em paralelo (ambas dependem apenas de dealIds/emails)
    const dealIds = deals.map(d => d.id);
    const contratoStageSet = new Set(STAGE_IDS.CONTRATO_ENVIADO);
    const dealEmails = [...new Set(deals.map(d => d.person_email?.trim()?.toLowerCase()).filter(Boolean))];

    const [allTransitions, salesData] = await Promise.all([
      paginatedQuery(() =>
        supabase
          .from('crm_stage_transitions')
          .select('deal_id, to_stage_id, transitioned_at, time_in_previous_stage_sec')
          .in('deal_id', dealIds)
      ),
      dealEmails.length
        ? paginatedQuery(() =>
            supabase
              .from('sales')
              .select('email_pipedrive')
              .in('email_pipedrive', dealEmails)
              .gte('data_fechamento', DATA_START_DATE)
          )
        : Promise.resolve([]),
    ]);
    const dealsWithContrato = new Set();
    const contratoEntryTime = {};
    for (const t of allTransitions) {
      if (contratoStageSet.has(t.to_stage_id)) {
        dealsWithContrato.add(t.deal_id);
        if (!contratoEntryTime[t.deal_id] || t.transitioned_at > contratoEntryTime[t.deal_id]) {
          contratoEntryTime[t.deal_id] = t.transitioned_at;
        }
      }
    }
    for (const d of deals) {
      if (contratoStageSet.has(d.stage_id)) dealsWithContrato.add(d.id);
    }

    // 3. Montar wonEmailSet a partir do resultado paralelo
    const wonEmailSet = new Set();
    for (const s of salesData) {
      const e = s.email_pipedrive?.trim()?.toLowerCase();
      if (e) wonEmailSet.add(e);
    }

    // Marcar milestones
    for (const d of deals) {
      d._passedContrato = dealsWithContrato.has(d.id);
      d._isWon = d.status === 'won' || (d.person_email && wonEmailSet.has(d.person_email.trim().toLowerCase()));
    }

    // 4. Classificação MQL: enriquecer deals em stage MQL com resolveBatch + classifyLead
    const mqlStageIds = new Set(STAGE_IDS.MQL);
    const mqlStageDeals = deals.filter(d => mqlStageIds.has(d.stage_id) && d.status === 'open');
    const enrichedMql = await resolveBatch(mqlStageDeals, supabase);
    const classifiedMqlIds = new Set(
      enrichedMql
        .filter(d => classifyLead(d.faturamento_anual, d.volume_mensal, d.segmento, d.mercado) === 'MQL')
        .map(d => d.id)
    );

    // 5. Contagens por milestone (cumulativas)
    // Funil: MQL → SQL → Reunião → Proposta → Venda → Contrato
    // MQL: apenas deals que passam na classificação classifyLead
    const total = deals.filter(d => !mqlStageIds.has(d.stage_id) || classifiedMqlIds.has(d.id)).length;
    const sqlCount = deals.filter(d => d._isSQL).length;
    const reuniaoCount = deals.filter(d => d._isSQL && d._dataReuniao).length;
    const propostaCount = deals.filter(d => d._isSQL && d._dataProposta).length;
    const wonCount = deals.filter(d => d._isWon).length;
    const contratoCount = deals.filter(d => d._passedContrato).length;

    const safe = (num, den) => den > 0 ? num / den : null;

    // 5. Taxas de conversão — 5 transições (funil linear)
    const convRates = [
      safe(sqlCount, total),              // MQL→SQL
      safe(reuniaoCount, sqlCount),       // SQL→Reunião
      safe(propostaCount, reuniaoCount),  // Reunião→Proposta
      safe(wonCount, propostaCount),      // Proposta→Venda
      safe(contratoCount, wonCount),      // Venda→Contrato
    ];

    // 6. Ciclos médios entre etapas
    function parseDateSafe(v) {
      if (!v) return null;
      const s = String(v);
      const d = new Date(s.length === 10 ? s + 'T00:00:00' : s);
      return isNaN(d.getTime()) ? null : d;
    }
    function daysDiff(from, to) {
      const f = parseDateSafe(from);
      const t = parseDateSafe(to);
      if (!f || !t) return null;
      const diff = Math.round((t - f) / 86400000);
      return diff >= 0 ? diff : null;
    }
    function avgValid(arr) {
      const valid = arr.filter(v => v != null);
      return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
    }

    const cycleTimes = [
      // MQL→SQL: deal_created_at → data_qualificacao
      avgValid(deals.filter(d => d._isSQL && d._dataQualificacao)
        .map(d => daysDiff(d.deal_created_at, d._dataQualificacao))),
      // SQL→Reunião: data_qualificacao → data_reuniao
      avgValid(deals.filter(d => d._dataQualificacao && d._dataReuniao)
        .map(d => daysDiff(d._dataQualificacao, d._dataReuniao))),
      // Reunião→Proposta: data_reuniao → data_proposta
      avgValid(deals.filter(d => d._dataReuniao && d._dataProposta)
        .map(d => daysDiff(d._dataReuniao, d._dataProposta))),
      // Proposta→Venda: data_fechamento (close_time) - data_proposta (apenas deals won)
      avgValid(deals.filter(d => d._isWon && d._dataProposta && d.close_time)
        .map(d => daysDiff(d._dataProposta, d.close_time))),
      // Venda→Contrato: close_time → contrato entry
      avgValid(
        deals.filter(d => d._isWon && d._passedContrato && contratoEntryTime[d.id] && d.close_time)
          .map(d => daysDiff(d.close_time, contratoEntryTime[d.id]))
      ),
    ];

    // Retorno Sobre Proposta: data_proposta → (lost_time ou close_time) — qualquer desfecho
    const cycleRetornoProposta = avgValid(
      deals.filter(d => d._dataProposta && (d.lost_time || d.close_time))
        .map(d => daysDiff(d._dataProposta, d.lost_time || d.close_time))
    );

    // 7. Transitions array — 5 transições do funil principal
    const transitionLabels = [
      { from: 'MQL', to: 'SQL' },
      { from: 'SQL', to: 'Reunião' },
      { from: 'Reunião', to: 'Proposta' },
      { from: 'Proposta', to: 'Venda' },
      { from: 'Venda', to: 'Contrato' },
    ];
    const milestoneCounts = [total, sqlCount, reuniaoCount, propostaCount, wonCount, contratoCount];

    const transitions = transitionLabels.map((t, i) => ({
      ...t,
      convRate: convRates[i],
      avgCycleDays: cycleTimes[i],
      fromCount: milestoneCounts[i],
      toCount: milestoneCounts[i + 1],
    }));

    // 8. Open deals por stage (5 linhas na tabela)
    const openDeals = deals.filter(d => d.status === 'open');
    const stageGroups = [
      { key: 'mql', label: 'MQL', ids: new Set(STAGE_IDS.MQL), transIdx: 0 },
      { key: 'sql', label: 'SQL', ids: new Set(STAGE_IDS.SQL), transIdx: 1 },
      { key: 'reuniao', label: 'Reunião Agendada', ids: new Set(STAGE_IDS.REUNIAO_AGENDADA), transIdx: 2 },
      { key: 'proposta', label: 'Proposta Feita', ids: new Set(STAGE_IDS.PROPOSTA), transIdx: 3 },
      { key: 'contrato', label: 'Contrato Enviado', ids: new Set(STAGE_IDS.CONTRATO_ENVIADO), transIdx: 4 },
    ];

    const stages = stageGroups.map((group) => {
      let stageDeals = openDeals.filter(d => group.ids.has(d.stage_id));

      // Mesmos filtros por etapa
      if (group.key === 'mql') {
        // MQL: apenas deals que passam na classificação classifyLead
        stageDeals = stageDeals.filter(d => classifiedMqlIds.has(d.id));
      } else if (group.key === 'sql') {
        // SQL: apenas deals com email + telefone + SQL?=Sim
        stageDeals = stageDeals.filter(d => d._hasEmailAndPhone && d._isSQL);
      } else if (group.key === 'reuniao') {
        // Reunião: apenas SQL?=Sim + data_reuniao preenchida
        stageDeals = stageDeals.filter(d => d._isSQL && d._dataReuniao);
      } else if (group.key === 'proposta') {
        // Proposta: apenas SQL?=Sim + Reunião Realizada=Sim
        stageDeals = stageDeals.filter(d => d._isSQL && d._reuniaoRealizada);
      }

      const count = stageDeals.length;
      const value = stageDeals.reduce((acc, d) => acc + (d.value || 0), 0);

      // Cascata: multiplica taxas a partir do transIdx deste stage
      let cascadingConv = 1;
      let cascadingDays = 0;
      let hasNull = false;
      for (let i = group.transIdx; i < convRates.length; i++) {
        if (convRates[i] == null) { hasNull = true; break; }
        cascadingConv *= convRates[i];
        cascadingDays += cycleTimes[i] ?? 0;
      }

      return {
        key: group.key,
        label: group.label,
        openDeals: count,
        pipelineValue: value,
        convToSale: hasNull ? null : cascadingConv,
        daysToSale: hasNull ? null : Math.round(cascadingDays),
        expectedSales: hasNull ? null : count * cascadingConv,
        expectedRevenue: hasNull ? null : value * cascadingConv,
        stepConvRate: convRates[group.transIdx] ?? null,
        // Proposta: ciclo = retorno sobre proposta (tempo até qualquer desfecho)
        stepCycleDays: group.key === 'proposta' ? (cycleRetornoProposta ?? null) : (cycleTimes[group.transIdx] ?? null),
      };
    });

    // 9. Bottleneck: menor taxa de conversão entre as 4 transições
    let bottleneckIdx = -1;
    for (let i = 0; i < transitions.length; i++) {
      if (transitions[i].convRate == null) continue;
      if (bottleneckIdx === -1 || transitions[i].convRate < transitions[bottleneckIdx].convRate) {
        bottleneckIdx = i;
      }
    }

    return { transitions, stages, bottleneckIdx, cycleRetornoProposta };
  } catch (err) {
    console.error('[gerencialService] fetchForecastData error:', err);
    return null;
  }
}

/**
 * Extrai base de deals ativos por etapa do forecast.
 * Retorna { mql: [...], sql: [...], reuniao: [...], proposta: [...], contrato: [...] }
 * Cada deal: { title, person_name, person_email, person_phone, value, stage_name, etapa }
 */
export async function fetchForecastStageDeals(funnel, startMonth, endMonth) {
  try {
    const dateFrom = startMonth ? `${startMonth}-01` : DATA_START_DATE;
    const dateTo = endMonth ? getNextMonth(endMonth) : null;
    let query = supabase.from('crm_deals')
      .select('title, person_name, person_email, person_phone, value, stage_id, stage_name, status, pipeline_id, deal_created_at, close_time, lost_time, custom_fields')
      .eq('status', 'open')
      .gte('deal_created_at', dateFrom);
    if (dateTo) query = query.lt('deal_created_at', dateTo);
    query = applyFunnelFilter(query, funnel);
    const { data: deals, error } = await query;
    if (error) throw error;
    if (!deals?.length) return {};

    // Inverter PIPELINE_FUNNELS para pipeline_id → label
    const pipelineToFunnel = {};
    for (const [key, ids] of Object.entries(PIPELINE_FUNNELS)) {
      const label = FUNNEL_LABELS[key] ?? key;
      for (const id of ids) pipelineToFunnel[id] = label;
    }

    const stageMap = [
      { key: 'mql', label: 'MQL', ids: new Set(STAGE_IDS.MQL) },
      { key: 'sql', label: 'SQL', ids: new Set(STAGE_IDS.SQL) },
      { key: 'reuniao', label: 'Reunião Agendada', ids: new Set(STAGE_IDS.REUNIAO_AGENDADA) },
      { key: 'proposta', label: 'Proposta Feita', ids: new Set(STAGE_IDS.PROPOSTA) },
      { key: 'contrato', label: 'Contrato Enviado', ids: new Set(STAGE_IDS.CONTRATO_ENVIADO) },
    ];

    const sqlKey = CUSTOM_FIELDS.SQL_FLAG.key;
    const sqlSimVal = CUSTOM_FIELDS.SQL_FLAG.values.SIM;
    const sqlNaoVal = CUSTOM_FIELDS.SQL_FLAG.values.NAO;
    const sqlRevisarVal = CUSTOM_FIELDS.SQL_FLAG.values.A_REVISAR;
    const reuniaoKey = CUSTOM_FIELDS.DATA_REUNIAO.key;
    const reuniaoRealizadaKey = CUSTOM_FIELDS.REUNIAO_REALIZADA.key;
    const reuniaoRealizadaSim = CUSTOM_FIELDS.REUNIAO_REALIZADA.values.SIM;
    const reuniaoRealizadaNao = CUSTOM_FIELDS.REUNIAO_REALIZADA.values.NAO;
    const propostaKey = CUSTOM_FIELDS.DATA_PROPOSTA.key;

    // Mapeamento correto dos valores do campo SQL?
    function mapSqlFlag(val) {
      if (val == sqlSimVal) return 'Sim';
      if (val == sqlNaoVal) return 'Não';
      if (val == sqlRevisarVal) return 'A Revisar';
      return '—';
    }
    // Mapeamento correto dos valores do campo Reunião Realizada
    function mapReuniaoRealizada(val) {
      if (val == reuniaoRealizadaSim) return 'Sim';
      if (val == reuniaoRealizadaNao) return 'Não';
      return '—';
    }

    // Enrich deals com custom fields parseados
    const enriched = deals.map(d => {
      const cf = parseCustomFields(d.custom_fields);
      return { ...d, _cf: cf };
    });

    const result = {};
    for (const group of stageMap) {
      let filtered = enriched.filter(d => group.ids.has(d.stage_id));

      // Filtros por etapa:
      if (group.key === 'sql') {
        // SQL: apenas deals com email E telefone E SQL? = Sim
        filtered = filtered.filter(d =>
          d.person_email && d.person_email.trim() &&
          d.person_phone && d.person_phone.trim() &&
          d._cf[sqlKey] == sqlSimVal
        );
      } else if (group.key === 'reuniao') {
        // Reunião: apenas SQL? = Sim E data_reuniao preenchida
        filtered = filtered.filter(d =>
          d._cf[sqlKey] == sqlSimVal &&
          d._cf[reuniaoKey]
        );
      } else if (group.key === 'proposta') {
        // Proposta: apenas SQL? = Sim E Reunião Realizada = Sim
        filtered = filtered.filter(d =>
          d._cf[sqlKey] == sqlSimVal &&
          d._cf[reuniaoRealizadaKey] == reuniaoRealizadaSim
        );
      }

      result[group.key] = filtered.map(d => ({
        person_email: d.person_email ?? '—',
        person_phone: d.person_phone ?? '—',
        etapa: group.label,
        funil: pipelineToFunnel[d.pipeline_id] ?? `Pipeline ${d.pipeline_id}`,
        stage_name: d.stage_name ?? '—',
        status: d.status ?? '—',
        value: d.value ?? 0,
        deal_created_at: d.deal_created_at ?? '—',
        is_sql: mapSqlFlag(d._cf[sqlKey]),
        data_reuniao: d._cf[reuniaoKey] ? String(d._cf[reuniaoKey]).slice(0, 10) : '—',
        reuniao_realizada: mapReuniaoRealizada(d._cf[reuniaoRealizadaKey]),
        data_proposta: d._cf[propostaKey] ? String(d._cf[propostaKey]).slice(0, 10) : '—',
        data_fechamento: d.close_time ? String(d.close_time).slice(0, 10) : '—',
        lost_time: d.lost_time ? String(d.lost_time).slice(0, 10) : '—',
      }));
    }
    return result;
  } catch (err) {
    console.error('[gerencialService] fetchForecastStageDeals error:', err);
    return {};
  }
}

// ── Helpers internos ──

function getNextMonth(yearMonth) {
  const [y, m] = yearMonth.split('-').map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  return `${next}-01`;
}

function computeBowtieAvgTimes(transitions) {
  // Map BOWTIE_STAGES to stage ID sets for time computation
  const stageSets = {
    mql:         STAGE_IDS.MQL,
    sql:         STAGE_IDS.SQL,
    reuniao_ag:  STAGE_IDS.REUNIAO_AGENDADA,
    reuniao_real: [],
    vendas:      [],
    contrato:    STAGE_IDS.CONTRATO_ENVIADO,
  };
  const bowtieKeys = ['lead', 'mql', 'sql', 'reuniao_ag', 'reuniao_real', 'vendas', 'contrato'];
  const stageSeconds = {};
  for (const key of bowtieKeys) stageSeconds[key] = [];

  for (const t of transitions) {
    if (t.time_in_previous_stage_sec == null) continue;
    for (const key of bowtieKeys) {
      const ids = stageSets[key] || [];
      if (ids.includes(t.to_stage_id)) {
        stageSeconds[key].push(Number(t.time_in_previous_stage_sec));
        break;
      }
    }
  }

  return bowtieKeys.map(key => {
    const arr = stageSeconds[key];
    if (!arr?.length) return 0;
    const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
    return Math.round(avg / 86400);
  });
}

function computeAvgTimes(transitions, tabKeys) {
  const stageSeconds = {};
  for (const key of tabKeys) {
    stageSeconds[key] = [];
  }

  for (const t of transitions) {
    if (t.time_in_previous_stage_sec == null) continue;
    for (const key of tabKeys) {
      if (STAGE_TABS[key].stageIds.includes(t.to_stage_id)) {
        stageSeconds[key].push(Number(t.time_in_previous_stage_sec));
        break;
      }
    }
  }

  return tabKeys
    .map(key => {
      const arr = stageSeconds[key];
      if (!arr?.length) return 0;
      const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
      return Math.round(avg / 86400); // seconds → days
    });
}
