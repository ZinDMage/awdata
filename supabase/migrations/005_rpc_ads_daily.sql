-- ============================================================================
-- RPC: rpc_ads_daily -- Dados Diarios por Date Range (sem paginacao)
-- Story v3-5-1 -- Epic 5: Performance ADS -- Drill-down, Atribuicao e Paginacao
-- ============================================================================
-- Dados agrupados por data (dia a dia). SEM paginacao (date ranges sao
-- naturalmente limitados -- max ~365 rows/ano).
--
-- Filtro p_campaign_id opcional: quando informado, filtra por campanha.
-- Consumidor: Epic 6 (Story 6.3)
-- ORDER BY: date ASC
-- ============================================================================


CREATE OR REPLACE FUNCTION rpc_ads_daily(
  p_source text[] DEFAULT NULL,
  p_start_date date DEFAULT CURRENT_DATE - INTERVAL '30 days',
  p_end_date date DEFAULT CURRENT_DATE,
  p_campaign_id text DEFAULT NULL
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
  -- NOTE: When include_meta/include_google = false, PG constant-folds WHERE false
  -- to a zero-cost Result node (no table scan). Do not restructure to dynamic SQL.
  WITH
  -- Pre-agregar actions do Meta por date no periodo
  meta_actions_daily AS (
    SELECT
      date_start,
      SUM(CASE WHEN action_type = 'unique_link_click' THEN value ELSE 0 END) AS unique_clicks,
      SUM(CASE WHEN action_type = 'unique_landing_page_view' THEN value ELSE 0 END) AS unique_landing_page_view
    FROM meta_ads_actions
    WHERE include_meta
      AND date_start >= p_start_date
      AND date_start <= p_end_date
      AND (p_campaign_id IS NULL OR campaign_id = p_campaign_id)
    GROUP BY date_start
  ),
  -- Pre-agregar meta_ads_costs por date (evita fan-out no JOIN com actions)
  meta_costs_daily AS (
    SELECT
      date_start,
      COALESCE(SUM(spend), 0) AS total_spend,
      COALESCE(SUM(impressions), 0) AS impressions
    FROM meta_ads_costs
    WHERE include_meta
      AND date_start >= p_start_date
      AND date_start <= p_end_date
      AND (p_campaign_id IS NULL OR campaign_id = p_campaign_id)
    GROUP BY date_start
  ),
  -- Meta diario: JOIN de costs e actions ja pre-agregados por date (1:1)
  meta_daily AS (
    SELECT
      c.date_start AS date,
      'meta'::text AS source,
      c.total_spend,
      c.impressions,
      c.impressions AS reach,          -- proxy: meta_ads_costs nao tem coluna reach
      1.0::numeric AS frequency,       -- proxy: sem reach, nao ha como calcular
      COALESCE(a.unique_clicks, 0)::numeric AS unique_clicks,
      COALESCE(a.unique_landing_page_view, 0)::numeric AS unique_landing_page_view
    FROM meta_costs_daily c
    LEFT JOIN meta_actions_daily a ON a.date_start = c.date_start
  ),
  -- Google diario agrupado por data
  google_daily AS (
    SELECT
      date,
      'google'::text AS source,
      COALESCE(SUM(spend), 0) AS total_spend,
      COALESCE(SUM(impressions), 0) AS impressions,
      COALESCE(SUM(impressions), 0) AS reach,       -- proxy
      1.0::numeric AS frequency,       -- proxy
      COALESCE(SUM(clicks), 0)::numeric AS unique_clicks,
      COALESCE(SUM(conversions), 0)::numeric AS unique_landing_page_view
    FROM google_ads_costs
    WHERE include_google
      AND date >= p_start_date
      AND date <= p_end_date
      AND (p_campaign_id IS NULL OR campaign_id = p_campaign_id)
    GROUP BY date
  ),
  -- UNION ALL por dia
  all_daily AS (
    SELECT * FROM meta_daily
    UNION ALL
    SELECT * FROM google_daily
  )
  SELECT COALESCE((
    SELECT json_agg(json_build_object(
      'date', d.date,
      'source', d.source,
      'total_spend', ROUND(d.total_spend::numeric, 2),
      'impressions', d.impressions,
      'reach', d.reach,
      'frequency', ROUND(d.frequency::numeric, 2),
      'unique_clicks', d.unique_clicks,
      'unique_landing_page_view', d.unique_landing_page_view,
      'cpm', ROUND(d.total_spend::numeric / NULLIF(d.impressions, 0) * 1000, 2),
      'cpc', ROUND(d.total_spend::numeric / NULLIF(d.unique_clicks, 0), 2),
      'ctr', ROUND(d.unique_clicks / NULLIF(d.impressions::numeric, 0), 4)
    ) ORDER BY d.date ASC, d.source) FROM all_daily d
  ), '[]'::json) INTO result;

  RETURN result;
END;
$$;
