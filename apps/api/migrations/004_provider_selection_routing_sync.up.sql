WITH active_model_counts AS (
  SELECT provider_key, COUNT(*) AS active_model_count, MIN(model_key) AS only_model_key
  FROM model_catalog
  WHERE status = 'active'
  GROUP BY provider_key
), default_routes AS (
  SELECT
    r.workspace_id,
    r.connection_id,
    pc.provider_key,
    pc.created_by,
    r.updated_at,
    r.model_key AS routed_model_key,
    explicit_model.model_key AS explicit_model_key,
    active_model_counts.active_model_count,
    active_model_counts.only_model_key
  FROM provider_routing r
  JOIN provider_connections pc ON pc.id = r.connection_id AND pc.workspace_id = r.workspace_id
  LEFT JOIN model_catalog explicit_model
    ON explicit_model.model_key = r.model_key
   AND explicit_model.provider_key = pc.provider_key
   AND explicit_model.status = 'active'
  LEFT JOIN active_model_counts ON active_model_counts.provider_key = pc.provider_key
  LEFT JOIN workspace_provider_selection existing ON existing.workspace_id = r.workspace_id
  WHERE existing.workspace_id IS NULL
    AND r.is_default = 1
    AND r.enabled = 1
    AND r.health_state IN ('unknown', 'healthy', 'degraded')
    AND pc.status = 'active'
)
INSERT INTO workspace_provider_selection(workspace_id, connection_id, model_key, selected_by, selected_at)
SELECT
  workspace_id,
  connection_id,
  CASE
    WHEN routed_model_key IS NOT NULL AND explicit_model_key IS NOT NULL THEN explicit_model_key
    WHEN routed_model_key IS NULL AND active_model_count = 1 THEN only_model_key
  END AS model_key,
  created_by,
  updated_at
FROM default_routes
WHERE (routed_model_key IS NOT NULL AND explicit_model_key IS NOT NULL)
   OR (routed_model_key IS NULL AND active_model_count = 1);
