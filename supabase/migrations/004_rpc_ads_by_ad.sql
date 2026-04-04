-- ============================================================================
-- RPC: rpc_ads_by_ad -- Anuncios Individuais com Paginacao Server-Side
-- Story v3-5-1 -- Epic 5: Performance ADS -- Drill-down, Atribuicao e Paginacao
-- ============================================================================
-- Granularidade: por ad individual (GROUP BY ad_id)
-- Inclui campaign_id, campaign_name, adset_id/ad_group_id, adset_name/ad_group_name
--
-- Mesma logica de p_source, paginacao e metricas derivadas da rpc_ads_by_campaign.
-- Consumidor: Epic 6 (Story 6.2)
-- ============================================================================


-- ── Indice adicional para ad-level granularity ──────────────────────────────
CREATE INDEX IF NOT EXISTS idx_meta_ads_actions_date_ad_type
  ON meta_ads_actions(date_start, ad_id, action_type);


-- ── rpc_ads_by_ad ───────────────────────────────────────────────────────────
-- Agrega dados de ads por anuncio individual com paginacao server-side.
-- Pattern: CTE pre-agregada + UNION ALL + json_build_object
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION rpc_ads_by_ad(
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
  -- to a zero-cost Result node (no table scan). Do not restructure to dynamic SQL.
  WITH
  -- Pre-agregar actions do Meta por ad_id no periodo
  meta_actions_agg AS (
    SELECT
      ad_id,
      SUM(CASE WHEN action_type = 'unique_link_click' THEN value ELSE 0 END) AS unique_clicks,
      SUM(CASE WHEN action_type = 'unique_landing_page_view' THEN value ELSE 0 END) AS unique_landing_page_view
    FROM meta_ads_actions
    WHERE include_meta
      AND date_start >= p_start_date
      AND date_start <= p_end_date
    GROUP BY ad_id
  ),
  -- Agregar meta_ads_costs por ad (GROUP BY IDs, MAX para nomes)
  meta_costs_agg AS (
    SELECT
      campaign_id,
      MAX(campaign_name) AS campaign_name,
      adset_id,
      MAX(adset_name) AS adset_name,
      ad_id,
      MAX(ad_name) AS ad_name,
      COALESCE(SUM(spend), 0) AS total_spend,
      COALESCE(SUM(impressions), 0) AS impressions,
      MIN(date_start) AS date_start,
      MAX(date_start) AS date_end
    FROM meta_ads_costs
    WHERE include_meta
      AND date_start >= p_start_date
      AND date_start <= p_end_date
    GROUP BY campaign_id, adset_id, ad_id
  ),
  -- JOIN costs + actions pre-agregados
  meta_ads AS (
    SELECT
      'meta'::text AS source,
      c.campaign_id,
      c.campaign_name,
      c.adset_id,
      c.adset_name,
      c.ad_id,
      c.ad_name,
      c.total_spend,
      c.impressions,
      COALESCE(a.unique_clicks, 0)::numeric AS unique_clicks,
      COALESCE(a.unique_landing_page_view, 0)::numeric AS unique_landing_page_view,
      c.date_start,
      c.date_end
    FROM meta_costs_agg c
    LEFT JOIN meta_actions_agg a ON a.ad_id = c.ad_id
  ),
  -- Agregar google_ads_costs por ad (GROUP BY IDs, MAX para nomes)
  google_ads AS (
    SELECT
      'google'::text AS source,
      campaign_id,
      MAX(campaign_name) AS campaign_name,
      ad_group_id AS adset_id,
      MAX(ad_group_name) AS adset_name,
      ad_group_id AS ad_id,            -- Google nao tem ad_id; granularidade max = ad_group
      MAX(ad_group_name) AS ad_name,   -- Google nao tem ad_name; usar ad_group_name
      COALESCE(SUM(spend), 0) AS total_spend,
      COALESCE(SUM(impressions), 0) AS impressions,
      COALESCE(SUM(clicks), 0)::numeric AS unique_clicks,
      COALESCE(SUM(conversions), 0)::numeric AS unique_landing_page_view,
      MIN(date) AS date_start,
      MAX(date) AS date_end
    FROM google_ads_costs
    WHERE include_google
      AND date >= p_start_date
      AND date <= p_end_date
    GROUP BY campaign_id, ad_group_id
  ),
  -- UNION ALL
  all_ads AS (
    SELECT * FROM meta_ads
    UNION ALL
    SELECT * FROM google_ads
  ),
  paged AS (
    SELECT *, COUNT(*) OVER() AS total_count
    FROM all_ads
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
        'adset_id', p.adset_id,
        'adset_name', p.adset_name,
        'ad_id', p.ad_id,
        'ad_name', p.ad_name,
        'date_start', p.date_start,
        'date_end', p.date_end,
        'total_spend', ROUND(p.total_spend::numeric, 2),
        'impressions', p.impressions,
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

-- Restringir acesso: apenas usuarios autenticados podem chamar esta RPC
REVOKE EXECUTE ON FUNCTION rpc_ads_by_ad FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rpc_ads_by_ad TO authenticated;
