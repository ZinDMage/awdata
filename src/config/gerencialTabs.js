/**
 * gerencialTabs.js — Story 4.2
 * Definição de colunas por sub-aba para DealsTable.
 * Colunas são dinâmicas: cada sub-aba exibe colunas relevantes ao contexto. (FR61, FR64-FR66)
 */

import { F } from '@/utils/formatters';

/**
 * TAB_CONFIG — Colunas por sub-aba
 * Cada coluna: { key, label, format }
 *   - key: campo do deal (snake_case Supabase)
 *   - label: header da coluna
 *   - format: função de formatação opcional (F.ri, F.r2, F.d, etc.) ou null
 *   - filterable: true se coluna aparece no dropdown de filtro avançado
 */
export const TAB_CONFIG = {
  mql: {
    label: 'MQL',
    columns: [
      { key: 'person_name',       label: 'Pessoa',         format: null },
      { key: 'person_email',      label: 'Email',          format: null },
      { key: 'person_phone',      label: 'Telefone',       format: null },
      { key: 'mercado',           label: 'Mercado',         format: null,   filterable: true },
      { key: 'segmento',          label: 'Segmento',       format: null,   filterable: true },
      { key: 'faturamento_anual', label: 'Faturamento',    format: null },
      { key: 'volume_mensal',     label: 'Ticket Médio',   format: null },
      { key: 'deal_created_at',   label: 'Data Criação',   format: (v) => F.date(v) },
    ],
  },

  sql: {
    label: 'SQL',
    columns: [
      { key: 'title',              label: 'Deal',                format: null },
      { key: 'person_email',       label: 'Email',               format: null },
      { key: 'person_phone',       label: 'Telefone',            format: null },
      { key: 'deal_created_at',    label: 'Data de Criação',     format: (v) => F.date(v) },
      { key: 'data_qualificacao',  label: 'Data Qualificação',   format: (v) => F.date(v) },
      { key: 'data_reuniao',       label: 'Data Reunião',        format: (v) => F.date(v) },
      { key: 'reuniao_realizada_label', label: 'Reunião Confirmada', format: null },
      { key: 'tem_reuniao',   label: 'Tem Reunião?', format: null, filterable: true },
    ],
  },

  reuniao_agendada: {
    label: 'Reunião Agendada',
    columns: [
      { key: 'title',           label: 'Deal',           format: null },
      { key: 'person_name',     label: 'Pessoa',         format: null },
      { key: 'person_email',    label: 'Email',          format: null },
      { key: 'person_phone',    label: 'Telefone',       format: null },
      { key: 'mercado',         label: 'Mercado',         format: null,   filterable: true },
      { key: 'value',           label: 'Valor',           format: (v) => F.ri(v) },
      { key: 'stage_name',      label: 'Stage',           format: null },
      { key: 'days_in_stage',   label: 'Dias no Stage',   format: null },
      { key: 'data_reuniao',    label: 'Data Reunião',    format: (v) => F.date(v) },
    ],
  },

  reuniao_confirmada: {
    label: 'Reunião Confirmada',
    columns: [
      { key: 'title',           label: 'Deal',           format: null },
      { key: 'person_name',     label: 'Pessoa',         format: null },
      { key: 'person_email',    label: 'Email',          format: null },
      { key: 'person_phone',    label: 'Telefone',       format: null },
      { key: 'mercado',         label: 'Mercado',         format: null,   filterable: true },
      { key: 'value',           label: 'Valor',           format: (v) => F.ri(v) },
      { key: 'stage_name',      label: 'Stage',           format: null },
      { key: 'days_in_stage',   label: 'Dias no Stage',   format: null },
      { key: 'data_reuniao',    label: 'Data Reunião',    format: (v) => F.date(v) },
    ],
  },

  proposta: {
    label: 'Proposta',
    columns: [
      { key: 'title',           label: 'Deal',            format: null },
      { key: 'person_email',    label: 'Email',           format: null },
      { key: 'person_phone',    label: 'Telefone',        format: null },
      { key: 'value',           label: 'Valor',            format: (v) => F.ri(v) },
      { key: 'data_proposta',   label: 'Data Proposta',    format: (v) => F.date(v) },
      { key: 'stage_name',      label: 'Etapa',            format: null },
    ],
  },

  perda: {
    label: 'Perda',
    columns: [
      { key: 'title',           label: 'Deal',           format: null },
      { key: 'person_name',     label: 'Pessoa',         format: null },
      { key: 'person_email',    label: 'Email',          format: null },
      { key: 'person_phone',    label: 'Telefone',       format: null },
      { key: 'mercado',         label: 'Mercado',         format: null,   filterable: true },
      { key: 'value',           label: 'Valor',           format: (v) => F.ri(v) },
      { key: 'stage_name',      label: 'Stage',           format: null },
      { key: 'days_in_stage',   label: 'Dias no Stage',   format: null },
      { key: 'lost_reason',     label: 'Motivo',          format: null,   filterable: true },
    ],
    /** Pills de filtro por etapa onde o deal foi perdido (FR64) */
    stagePills: [
      { key: 'all',      label: 'Todas' },
      { key: 'mql',      label: 'MQL' },
      { key: 'sql',      label: 'SQL' },
      { key: 'reuniao',  label: 'Reunião' },
      { key: 'proposta', label: 'Proposta' },
    ],
  },

  resultado: {
    label: 'Resultado',
    columns: [
      { key: 'title',           label: 'Deal',            format: null },
      { key: 'person_name',     label: 'Pessoa',          format: null },
      { key: 'person_email',    label: 'Email',           format: null },
      { key: 'mercado',         label: 'Mercado',          format: null,   filterable: true },
      { key: 'faturamento',     label: 'Faturamento',      format: (v) => F.ri(v) },
      { key: 'valor_pago',      label: 'Valor Pago',       format: (v) => F.r2(v) },
      { key: 'mrr',             label: 'MRR',              format: (v) => F.r2(v) },  // FR76: graceful degradation — F.r2 retorna "—" para null
      { key: 'close_time',      label: 'Data Fechamento',  format: (v) => F.date(v) },
    ],
  },
};

/**
 * Retorna config de colunas para uma sub-aba.
 */
export function getTabColumns(tabId) {
  return TAB_CONFIG[tabId]?.columns || [];
}

/**
 * Retorna pills de filtro por stage (apenas para aba Perda).
 */
export function getStagePills(tabId) {
  return TAB_CONFIG[tabId]?.stagePills || null;
}
