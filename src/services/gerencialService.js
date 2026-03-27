import { supabase } from './supabaseClient';
import { STAGE_TABS, STAGE_IDS, CUSTOM_FIELDS, PIPELINE_FUNNELS, parseCustomFields } from '@/config/pipedrive';
import { resolveBatch } from '@/utils/dataPrecedence';
import { classifyLead } from '@/services/classificationService';
import { normalizeEmail, deduplicateYayforms } from '@/services/fetchService';

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
    let query = supabase
      .from('crm_deals')
      .select('id, stage_id, stage_name, status, deal_created_at, close_time, value, pipeline_id, custom_fields, person_email')
      .gte('deal_created_at', `${startMonth}-01`)
      .lt('deal_created_at', getNextMonth(endMonth));

    query = applyFunnelFilter(query, funnel);

    const { data: deals, error } = await query;
    if (error) throw error;
    if (!deals?.length) return { stages: [], conversions: [], avgTimes: [] };

    // Contagem cumulativa: quantos deals do período passaram por cada etapa
    const counts = { lead: 0, mql: 0, sql: 0, reuniao_ag: 0, reuniao_real: 0, vendas: 0, contrato: 0 };

    // ── Lead e MQL: fonte primária é yayforms_responses (inbound) ──
    const isInboundScope = !funnel || funnel === 'todos' || funnel === 'inbound';
    if (isInboundScope) {
      const { data: yayData } = await supabase
        .from('yayforms_responses')
        .select('lead_email, lead_revenue_range, lead_monthly_volume, lead_segment, lead_market, submitted_at')
        .gte('submitted_at', `${startMonth}-01`)
        .lt('submitted_at', getNextMonth(endMonth));

      if (yayData) {
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
      const { data: salesData, error: salesError } = await supabase
        .from('sales')
        .select('email_pipedrive')
        .in('email_pipedrive', [...new Set(dealEmails)])
        .gte('data_fechamento', `${startMonth}-01`)
        .lt('data_fechamento', getNextMonth(endMonth));

      if (salesError) console.error('[gerencialService] sales query error:', salesError);

      const salesEmails = new Set((salesData || []).map(s => s.email_pipedrive?.trim()?.toLowerCase()).filter(Boolean));
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
    const transQuery = supabase
      .from('crm_stage_transitions')
      .select('deal_id, to_stage_id, time_in_previous_stage_sec')
      .in('deal_id', dealIds)
      .gte('transitioned_at', `${startMonth}-01`)
      .lt('transitioned_at', getNextMonth(endMonth));

    const { data: transitions } = await transQuery;
    const avgTimes = computeBowtieAvgTimes(transitions || []);

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
    let query = supabase
      .from('crm_deals')
      .select('stage_id, status')
      .eq('status', 'open');

    query = applyFunnelFilter(query, funnel);

    const { data: deals, error } = await query;
    if (error) throw error;

    const counts = {};
    for (const key of Object.keys(STAGE_TABS)) {
      counts[key] = 0;
    }

    let unmatched = 0;
    for (const deal of (deals || [])) {
      let matched = false;
      for (const [key, tab] of Object.entries(STAGE_TABS)) {
        if (tab.stageIds.includes(deal.stage_id)) {
          counts[key]++;
          matched = true;
          break;
        }
      }
      if (!matched) unmatched++;
    }
    if (unmatched > 0) console.warn(`[fetchPillCounts] ${unmatched} deals sem stage_tab match`);

    // perda e resultado: contagens separadas por status (com filtro de funil)
    let lostQuery = supabase
      .from('crm_deals')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'lost');
    lostQuery = applyFunnelFilter(lostQuery, funnel);

    let wonQuery = supabase
      .from('crm_deals')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'won');
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
