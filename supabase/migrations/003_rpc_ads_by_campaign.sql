-- ============================================================================
-- RPC: rpc_ads_by_campaign -- Campanhas Agregadas com Paginacao Server-Side
-- Story v3-5-1 -- Epic 5: Performance ADS -- Drill-down, Atribuicao e Paginacao
-- ============================================================================
-- Tabelas consultadas:
--   meta_ads_costs     (date_start, campaign_id, campaign_name, spend, impressions)
--   NOTA: meta_ads_costs NAO tem coluna reach/frequency — usar impressions como proxy
--   meta_ads_actions   (date_start, campaign_id, action_type, value)
--   google_ads_costs   (date, campaign_id, campaign_name, spend, impressions, clicks, conversions)
--
-- Parametro p_source: IDs logicos do FilterBar ('meta', 'google', 'todos')
--   Decide QUAIS tabelas consultar, nao filtra coluna utm_source.
--
-- Retorno: JSON { data: [...], total_count: N }
--   Cada item: source, campaign_id, campaign_name, date_start, date_end,
--              total_spend, impressions, reach, frequency,
--              cpm, cpc, ctr, unique_clicks, unique_landing_page_view
--
-- Paginacao: LIMIT p_page_size OFFSET (p_page - 1) * p_page_size
-- ORDER BY: total_spend DESC
--
-- Decisao arquitetural: AD-V3-5 -- RPCs (nao .range()) para paginacao com
-- agregacao server-side. CTE pre-agregada para meta_ads_actions (nao LATERAL
-- JOIN) para performance <200ms com 10k+ registros.
-- ============================================================================


-- ── Indices de Performance (AC4) ────────────────────────────────────────────
-- Criar ANTES das RPCs para garantir Index Scan nas queries.
-- FR114, NFR25

CREATE INDEX IF NOT EXISTS idx_meta_ads_costs_date_campaign
  ON meta_ads_costs(date_start, campaign_id);

CREATE INDEX IF NOT EXISTS idx_google_ads_costs_date_campaign
  ON google_ads_costs(date, campaign_id);

CREATE INDEX IF NOT EXISTS idx_meta_ads_actions_date_campaign_type
  ON meta_ads_actions(date_start, campaign_id, action_type);


-- ── rpc_ads_by_campaign ─────────────────────────────────────────────────────
-- Agrega dados de ads por campanha com paginacao server-side.
-- Pattern: CTE pre-agregada + UNION ALL + json_build_object
-- Segue padrao de get_pill_counts/get_bowtie_stats (001_rpc_pill_counts_bowtie_stats.sql)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION rpc_ads_by_campaign(
  p_source text[] DEFAULT NULL,
  p_start_date date DEFAULT CURRENT_DATE - INTERVAL '30 days',
  p_end_date date DEFAULT CURRENT_DATE,
  p_page int DEFAULT 1,
  p_page_size int DEFAULT 25
)
RETURNS json
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  include_meta boolean := p_source IS NULL OR cardinality(p_source) = 0 OR 'todos' = ANY(p_source) OR 'meta' = ANY(p_source);
  include_google boolean := p_source IS NULL OR cardinality(p_source) = 0 OR 'todos' = ANY(p_source) OR 'google' = ANY(p_source);
  result json;
BEGIN
  -- Input validation: prevent negative OFFSET and unbounded result sets
  IF p_page < 1 THEN p_page := 1; END IF;
  IF p_page_size < 1 OR p_page_size > 100 THEN p_page_size := 25; END IF;

  -- NOTE: When include_meta/include_google = false, PG constant-folds WHERE false
  -- to a zero-cost Result node (no table scan, no index scan, ~50us overhead).
  -- Verified via EXPLAIN ANALYZE. Do not restructure to dynamic SQL — plan cache
  -- loss would increase latency.
  WITH
  -- Pre-agregar actions do Meta por campaign_id no periodo (evita LATERAL JOIN N+1)
  meta_actions_agg AS (
    SELECT
      campaign_id,
      SUM(CASE WHEN action_type = 'unique_link_click' THEN value ELSE 0 END) AS unique_clicks,
      SUM(CASE WHEN action_type = 'unique_landing_page_view' THEN value ELSE 0 END) AS unique_landing_page_view
    FROM meta_ads_actions
    WHERE include_meta
      AND date_start >= p_start_date
      AND date_start <= p_end_date
    GROUP BY campaign_id
  ),
  -- Agregar meta_ads_costs por campanha
  meta_costs_agg AS (
    SELECT
      campaign_id,
      MAX(campaign_name) AS campaign_name,
      COALESCE(SUM(spend), 0) AS total_spend,
      COALESCE(SUM(impressions), 0) AS impressions,
      MIN(date_start) AS date_start,
      MAX(date_start) AS date_end
    FROM meta_ads_costs
    WHERE include_meta
      AND date_start >= p_start_date
      AND date_start <= p_end_date
    GROUP BY campaign_id
  ),
  -- JOIN costs + actions pre-agregados
  meta_campaigns AS (
    SELECT
      'meta'::text AS source,
      c.campaign_id,
      c.campaign_name,
      c.total_spend,
      c.impressions,
      c.impressions AS reach,          -- proxy: meta_ads_costs nao tem coluna reach
      1.0::numeric AS frequency,       -- proxy: sem reach, nao ha como calcular
      COALESCE(a.unique_clicks, 0)::numeric AS unique_clicks,
      COALESCE(a.unique_landing_page_view, 0)::numeric AS unique_landing_page_view,
      c.date_start,
      c.date_end
    FROM meta_costs_agg c
    LEFT JOIN meta_actions_agg a ON a.campaign_id = c.campaign_id
  ),
  -- Agregar google_ads_costs por campanha
  google_campaigns AS (
    SELECT
      'google'::text AS source,
      campaign_id,
      MAX(campaign_name) AS campaign_name,
      COALESCE(SUM(spend), 0) AS total_spend,
      COALESCE(SUM(impressions), 0) AS impressions,
      COALESCE(SUM(impressions), 0) AS reach,       -- proxy: Google nao tem reach
      1.0::numeric AS frequency,       -- proxy: Google nao tem frequency
      COALESCE(SUM(clicks), 0)::numeric AS unique_clicks,
      COALESCE(SUM(conversions), 0)::numeric AS unique_landing_page_view,
      MIN(date) AS date_start,
      MAX(date) AS date_end
    FROM google_ads_costs
    WHERE include_google
      AND date >= p_start_date
      AND date <= p_end_date
    GROUP BY campaign_id
  ),
  -- UNION ALL das duas fontes
  all_campaigns AS (
    SELECT * FROM meta_campaigns
    UNION ALL
    SELECT * FROM google_campaigns
  ),
  -- Pagina atual ordenada por spend DESC, com total_count via window function
  paged AS (
    SELECT *, COUNT(*) OVER() AS total_count
    FROM all_campaigns
    ORDER BY total_spend DESC
    LIMIT p_page_size
    OFFSET (p_page - 1) * p_page_size
  )
  SELECT json_build_object(
    'data', COALESCE((
      SELECT json_agg(json_build_object(
        'source', p.source,
        'campaign_id', p.campaign_id,
        'campaign_name', p.campaign_name,
        'date_start', p.date_start,
        'date_end', p.date_end,
        'total_spend', ROUND(p.total_spend::numeric, 2),
        'impressions', p.impressions,
        'reach', p.reach,
        'frequency', ROUND(p.frequency::numeric, 2),
        'unique_clicks', p.unique_clicks,
        'unique_landing_page_view', p.unique_landing_page_view,
        'cpm', ROUND(p.total_spend::numeric / NULLIF(p.impressions, 0) * 1000, 2),
        'cpc', ROUND(p.total_spend::numeric / NULLIF(p.unique_clicks, 0), 2),
        'ctr', ROUND(p.unique_clicks / NULLIF(p.impressions::numeric, 0), 4)
      ) ORDER BY p.total_spend DESC) FROM paged p
    ), '[]'::json),
    'total_count', COALESCE((SELECT p.total_count FROM paged p LIMIT 1), 0)
  ) INTO result;

  RETURN result;
END;
$$;
