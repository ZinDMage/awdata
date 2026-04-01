/**
 * queryColumns.js — Selects aprovados por tabela e contexto.
 * Governa quais colunas cada query pode pedir ao Supabase.
 * Reduz egress eliminando select('*') e custom_fields desnecessário.
 * AD-V2-9
 *
 * Contextos:
 *   list    — listagem/snapshot (tabelas, sub-abas)
 *   detail  — modal individual (1 deal por vez, lazy)
 *   aggregate — contagens, bowtie, analytics
 *
 * REGRA: Nenhuma query deve usar select('*'). Consultar este config.
 * Story 5.2 substitui os selects nos services por estas referências.
 */

import { CUSTOM_FIELDS } from '@/config/pipedrive'

// ── Campos JSONB de custom_fields usados pelo sistema ─────────────
// Chaves SHA-like do Pipedrive — extraídas via PostgREST JSON path
// Story 5.2 spike decide se extração JSONB funciona no Supabase JS
const CF = CUSTOM_FIELDS

/**
 * Extração JSONB via PostgREST com aliases (spike positivo — Story 5.2).
 * Formato: `alias:custom_fields->>hash_key` retorna valor como text em propriedade `alias`.
 * Operador ->> retorna text (seguro para comparações com ==).
 * AD-V2-9
 */
export const JSONB_FIELDS = {
  SQL_FLAG:             `cf_sql_flag:custom_fields->>${CF.SQL_FLAG.key}`,
  DATA_REUNIAO:         `cf_data_reuniao:custom_fields->>${CF.DATA_REUNIAO.key}`,
  REUNIAO_REALIZADA:    `cf_reuniao_realizada:custom_fields->>${CF.REUNIAO_REALIZADA.key}`,
  DATA_QUALIFICACAO:    `cf_data_qualificacao:custom_fields->>${CF.DATA_QUALIFICACAO.key}`,
  PROPOSTA_FEITA:       `cf_proposta_feita:custom_fields->>${CF.PROPOSTA_FEITA.key}`,
  DATA_PROPOSTA:        `cf_data_proposta:custom_fields->>${CF.DATA_PROPOSTA.key}`,
  OBJECOES_POS_CONTATO: `cf_objecoes:custom_fields->>${CF.OBJECOES_POS_CONTATO.key}`,
}

/**
 * Selects aprovados por tabela e contexto.
 * Story 5.2 substitui os selects nos services por estas referências.
 */
export const QUERY_COLUMNS = {
  // ── crm_deals ──────────────────────────────────────────────────
  crm_deals: {
    // fetchStageDeals (gerencialService) — listagem de deals nas sub-abas
    // Colunas diretas + JSONB extraído (se spike positivo na Story 5.2)
    list: 'id, title, person_name, person_email, person_phone, value, stage_id, stage_name, status, pipeline_id, deal_created_at, close_time, lost_time, lost_reason',

    // Campos JSONB para append ao list se spike positivo
    list_jsonb: Object.values(JSONB_FIELDS).join(', '),
    // Fallback se spike negativo — append custom_fields inteiro
    list_with_cf: 'id, title, person_name, person_email, person_phone, value, stage_id, stage_name, status, pipeline_id, deal_created_at, close_time, lost_time, lost_reason, custom_fields',

    // fetchBowtieData (gerencialService) — bowtie chart + classificação
    // Colunas diretas + custom_fields para classificação SQL/reunião
    aggregate: 'id, stage_id, stage_name, status, deal_created_at, close_time, value, pipeline_id, person_email, custom_fields',
    // Versão JSONB (se spike positivo) — só campos usados na classificação
    aggregate_jsonb: [JSONB_FIELDS.SQL_FLAG, JSONB_FIELDS.DATA_REUNIAO, JSONB_FIELDS.REUNIAO_REALIZADA].join(', '),

    // fetchPillCounts (gerencialService) — contagens por stage
    pills: 'id, stage_id, status, person_email, person_phone, custom_fields',

    // fetchMonthlyMetrics (dataService) — métricas mensais batch
    metrics: 'deal_created_at, stage_id, pipeline_id, status, value, custom_fields, person_email, won_time, deal_id, lost_reason',

    // fetchDealDetails (gerencialService) — modal individual, ÚNICO que precisa de tudo
    detail: 'title, person_name, person_email, person_phone, value, stage_id, stage_name, status, pipeline_id, deal_created_at, close_time, lost_time, custom_fields',

    // fetchLossMatrix / fetchForecastDeals (gerencialService) — análise de perda/forecast
    forecast: 'id, stage_id, status, deal_created_at, close_time, won_time, lost_time, value, pipeline_id, custom_fields, person_email, person_phone',

    // fetchLossMatrix (gerencialService) — contagem e emails para loss analysis
    loss: 'id, status, person_email, custom_fields, close_time, lost_time',

    // fetchHistoricalConvRate (gerencialService) — conversão histórica
    historical: 'id, person_email, custom_fields, status',

    // fetchMqlEmails (gerencialService) — lookup de emails MQL
    emails: 'person_email',

    // Contagens puras (head: true) — mínimo absoluto
    count: 'id',
  },

  // ── crm_stage_transitions ──────────────────────────────────────
  crm_stage_transitions: {
    // fetchMonthlyMetrics (dataService) — delta calculations
    aggregate: 'deal_id, to_stage_id, time_in_previous_stage_sec',
    // fetchDealDetails modal — transições completas do deal
    list: 'deal_id, from_stage_name, to_stage_name, to_stage_id, transitioned_at, time_in_previous_stage_sec, direction',
    // fetchForecastDeals (gerencialService) — transições para forecast
    forecast: 'deal_id, to_stage_id, transitioned_at, time_in_previous_stage_sec',
  },

  // ── crm_deal_activities ────────────────────────────────────────
  crm_deal_activities: {
    // fetchDealDetails modal — atividades do deal
    list: 'activity_id, activity_type, subject, due_date, due_time, duration, done, owner_name, assigned_to_user_id',
  },

  // ── yayforms_responses ─────────────────────────────────────────
  yayforms_responses: {
    // fetchMonthlyMetrics (dataService) — leads inbound
    list: 'submitted_at, lead_email, lead_revenue_range, lead_monthly_volume, lead_segment, lead_market',
  },

  // ── sales ──────────────────────────────────────────────────────
  sales: {
    // fetchMonthlyMetrics (dataService) — KPIs financeiros
    list: 'id, receita_gerada, data_fechamento, status, email_pipedrive, email_stripe',
    // lookups de email (gerencialService) — match deal→venda
    aggregate: 'email_pipedrive, email_stripe, data_fechamento',
    // contagem de emails apenas
    emails: 'email_pipedrive',
  },

  // ── meta_ads_costs ─────────────────────────────────────────────
  meta_ads_costs: {
    // fetchMonthlyMetrics (dataService) — custos Meta
    list: 'spend, impressions, date_start',
    // fetchAdSpendSummary (gerencialService) — total spend
    aggregate: 'spend',
  },

  // ── google_ads_costs ───────────────────────────────────────────
  google_ads_costs: {
    // fetchMonthlyMetrics (dataService) — custos Google
    list: 'spend, impressions, clicks, conversions, date',
    // fetchAdSpendSummary (gerencialService) — total spend
    aggregate: 'spend',
  },

  // ── meta_ads_actions ───────────────────────────────────────────
  meta_ads_actions: {
    // fetchMonthlyMetrics (dataService) — ações Meta (clicks, landing page views)
    list: 'action_type, value, date_start',
  },

  // ── linkedin_ads_costs ─────────────────────────────────────────
  linkedin_ads_costs: {
    // fetchAdSpendSummary (gerencialService) — total spend
    aggregate: 'spend',
  },
}
