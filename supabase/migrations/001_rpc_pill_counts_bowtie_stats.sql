-- ============================================================================
-- RPCs para Agregações: Pill Counts + Bowtie Stats
-- Story 5.4 — Mover contagens para PostgreSQL, reduzir egress
-- ============================================================================
-- STAGE_IDS (source of truth: src/config/pipedrive.js):
--   MQL:                   1, 49
--   SQL:                   19, 50, 53, 35
--   REUNIAO_AGENDADA:      3, 11, 45, 51, 37, 55, 58, 64, 65
--   REAGENDAMENTO_PENDENTE: 6, 38, 48, 56
--   PROPOSTA:              4, 46, 39, 59, 66
--   CONTRATO_ENVIADO:      41, 47, 40, 60, 67
--
-- CUSTOM_FIELDS keys (hash do Pipedrive):
--   SQL_FLAG:           2e17191cfb8e6f4a58359adc42a08965a068e8bc  (SIM='75')
--   DATA_REUNIAO:       8eff24b00226da8dfb871caaf638b62af68bf16b
--   REUNIAO_REALIZADA:  baf2724fcbeec84a36e90f9dc3299431fe1b0dd3  (SIM='47')
--
-- DATA_START_DATE: '2026-01-01'
--
-- NOTA: custom_fields é armazenado como JSONB mas com dual-format:
--   - Alguns deals: jsonb_typeof = 'object' → extração ->> funciona direto
--   - Outros deals: jsonb_typeof = 'string' → JSON double-encoded, precisa unwrap
--   O helper cf_val() lida com ambos os formatos (equivalente ao parseCustomFields() do JS).
-- ============================================================================


-- ── Helper: cf_val — extrai valor de custom_fields com suporte a dual-format ──
-- Equivalente SQL do parseCustomFields(deal.custom_fields) do JS.
-- Quando custom_fields é string-encoded JSON, faz unwrap antes de extrair.
CREATE OR REPLACE FUNCTION cf_val(cf jsonb, k text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE jsonb_typeof(cf)
    WHEN 'string' THEN (cf #>> '{}')::jsonb->>k
    ELSE cf->>k
  END;
$$;


-- ── get_pill_counts ─────────────────────────────────────────────────────────
-- Retorna contagens por grupo lógico para as pills do Gerencial.
-- MQL retorna count raw (sem classifyLead — feito client-side).
-- Perda/resultado contam por status (não por stage).
-- p_pipeline_ids: array de pipeline IDs ou NULL para todos os funis.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_pill_counts(p_pipeline_ids int[] DEFAULT NULL)
RETURNS TABLE(tab text, count bigint)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- MQL: count raw (classificação qualificada é feita client-side via classifyLead)
  SELECT 'mql'::text AS tab, count(*) FROM crm_deals
  WHERE status = 'open'
    AND stage_id IN (1, 49)
    AND deal_created_at >= '2026-01-01'
    AND (p_pipeline_ids IS NULL OR pipeline_id = ANY(p_pipeline_ids))

  UNION ALL

  -- SQL: stage_id IN SQL + SQL_FLAG = SIM ('75')
  SELECT 'sql'::text, count(*) FROM crm_deals
  WHERE status = 'open'
    AND stage_id IN (19, 50, 53, 35)
    AND cf_val(custom_fields, '2e17191cfb8e6f4a58359adc42a08965a068e8bc') = '75'
    AND deal_created_at >= '2026-01-01'
    AND (p_pipeline_ids IS NULL OR pipeline_id = ANY(p_pipeline_ids))

  UNION ALL

  -- Reuniao: stage_id IN REUNIAO_AGENDADA + SQL_FLAG=SIM + DATA_REUNIAO preenchido
  SELECT 'reuniao'::text, count(*) FROM crm_deals
  WHERE status = 'open'
    AND stage_id IN (3, 11, 45, 51, 37, 55, 58, 64, 65)
    AND cf_val(custom_fields, '2e17191cfb8e6f4a58359adc42a08965a068e8bc') = '75'
    AND cf_val(custom_fields, '8eff24b00226da8dfb871caaf638b62af68bf16b') IS NOT NULL
    AND deal_created_at >= '2026-01-01'
    AND (p_pipeline_ids IS NULL OR pipeline_id = ANY(p_pipeline_ids))

  UNION ALL

  -- Proposta: stage_id IN PROPOSTA + SQL_FLAG=SIM + REUNIAO_REALIZADA=SIM ('47')
  SELECT 'proposta'::text, count(*) FROM crm_deals
  WHERE status = 'open'
    AND stage_id IN (4, 46, 39, 59, 66)
    AND cf_val(custom_fields, '2e17191cfb8e6f4a58359adc42a08965a068e8bc') = '75'
    AND cf_val(custom_fields, 'baf2724fcbeec84a36e90f9dc3299431fe1b0dd3') = '47'
    AND deal_created_at >= '2026-01-01'
    AND (p_pipeline_ids IS NULL OR pipeline_id = ANY(p_pipeline_ids))

  UNION ALL

  -- Contrato: stage_id IN CONTRATO_ENVIADO (sem filtro JSONB adicional)
  SELECT 'contrato'::text, count(*) FROM crm_deals
  WHERE status = 'open'
    AND stage_id IN (41, 47, 40, 60, 67)
    AND deal_created_at >= '2026-01-01'
    AND (p_pipeline_ids IS NULL OR pipeline_id = ANY(p_pipeline_ids))

  UNION ALL

  -- Perda: status = 'lost'
  SELECT 'perda'::text, count(*) FROM crm_deals
  WHERE status = 'lost'
    AND deal_created_at >= '2026-01-01'
    AND (p_pipeline_ids IS NULL OR pipeline_id = ANY(p_pipeline_ids))

  UNION ALL

  -- Resultado: status = 'won'
  SELECT 'resultado'::text, count(*) FROM crm_deals
  WHERE status = 'won'
    AND deal_created_at >= '2026-01-01'
    AND (p_pipeline_ids IS NULL OR pipeline_id = ANY(p_pipeline_ids));
$$;


-- ── get_bowtie_stats ────────────────────────────────────────────────────────
-- Retorna contagens + avg_time_days por etapa do bowtie (SQL-only stages).
-- Etapas lead/mql/vendas continuam client-side (dependem de yayforms/sales/classifyLead).
-- p_start_month, p_end_month: formato 'YYYY-MM' (ex: '2026-01', '2026-03')
-- p_pipeline_ids: array de pipeline IDs ou NULL para todos os funis.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_bowtie_stats(
  p_start_month text,
  p_end_month text,
  p_pipeline_ids int[] DEFAULT NULL
)
RETURNS TABLE(stage text, count bigint, avg_time_days numeric)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH date_bounds AS (
    SELECT
      (p_start_month || '-01')::date AS start_date,
      (
        CASE
          WHEN split_part(p_end_month, '-', 2)::int = 12
          THEN (split_part(p_end_month, '-', 1)::int + 1) || '-01-01'
          ELSE split_part(p_end_month, '-', 1) || '-' ||
               lpad((split_part(p_end_month, '-', 2)::int + 1)::text, 2, '0') || '-01'
        END
      )::date AS end_date
  ),
  filtered_deals AS (
    SELECT id, stage_id, status, custom_fields, pipeline_id
    FROM crm_deals, date_bounds db
    WHERE deal_created_at >= db.start_date
      AND deal_created_at < db.end_date
      AND (p_pipeline_ids IS NULL OR pipeline_id = ANY(p_pipeline_ids))
  ),
  -- Avg times via crm_stage_transitions
  transitions AS (
    SELECT t.to_stage_id, t.time_in_previous_stage_sec
    FROM crm_stage_transitions t
    JOIN filtered_deals fd ON t.deal_id = fd.id
    JOIN date_bounds db ON true
    WHERE t.transitioned_at >= db.start_date
      AND t.transitioned_at < db.end_date
      AND t.time_in_previous_stage_sec IS NOT NULL
  ),
  avg_times AS (
    SELECT
      CASE
        WHEN to_stage_id IN (19, 50, 53, 35) THEN 'sql'
        WHEN to_stage_id IN (3, 11, 45, 51, 37, 55, 58, 64, 65) THEN 'reuniao_ag'
        WHEN to_stage_id IN (41, 47, 40, 60, 67) THEN 'contrato'
        ELSE NULL
      END AS stage,
      round(avg(time_in_previous_stage_sec) / 86400.0, 1) AS avg_time_days
    FROM transitions
    WHERE to_stage_id IN (19, 50, 53, 35, 3, 11, 45, 51, 37, 55, 58, 64, 65, 41, 47, 40, 60, 67)
    GROUP BY 1
  )

  -- SQL: deals com SQL_FLAG = SIM
  SELECT 'sql'::text, count(*),
    COALESCE((SELECT avg_time_days FROM avg_times WHERE stage = 'sql'), 0)
  FROM filtered_deals
  WHERE cf_val(custom_fields, '2e17191cfb8e6f4a58359adc42a08965a068e8bc') = '75'

  UNION ALL

  -- Reuniao Agendada: SQL_FLAG=SIM + DATA_REUNIAO preenchido
  SELECT 'reuniao_ag'::text, count(*),
    COALESCE((SELECT avg_time_days FROM avg_times WHERE stage = 'reuniao_ag'), 0)
  FROM filtered_deals
  WHERE cf_val(custom_fields, '2e17191cfb8e6f4a58359adc42a08965a068e8bc') = '75'
    AND cf_val(custom_fields, '8eff24b00226da8dfb871caaf638b62af68bf16b') IS NOT NULL

  UNION ALL

  -- Reuniao Realizada: SQL_FLAG=SIM + REUNIAO_REALIZADA=SIM
  -- avg_time_days = 0 (sem stage IDs mapeados para transitions — mesmo comportamento do JS)
  SELECT 'reuniao_real'::text, count(*), 0
  FROM filtered_deals
  WHERE cf_val(custom_fields, '2e17191cfb8e6f4a58359adc42a08965a068e8bc') = '75'
    AND cf_val(custom_fields, 'baf2724fcbeec84a36e90f9dc3299431fe1b0dd3') = '47'

  UNION ALL

  -- Contrato Enviado: stage_id IN CONTRATO_ENVIADO
  SELECT 'contrato'::text, count(*),
    COALESCE((SELECT avg_time_days FROM avg_times WHERE stage = 'contrato'), 0)
  FROM filtered_deals
  WHERE stage_id IN (41, 47, 40, 60, 67)

  UNION ALL

  -- Perda
  SELECT 'perda'::text, count(*), 0
  FROM filtered_deals WHERE status = 'lost'

  UNION ALL

  -- Resultado
  SELECT 'resultado'::text, count(*), 0
  FROM filtered_deals WHERE status = 'won';
$$;
