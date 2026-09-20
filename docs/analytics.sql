-- Run through the Node provisioning script or Databricks SQL.
CREATE TABLE IF NOT EXISTS workspace.default.gobbler_interactions (
  id STRING, pseudonym STRING, kind STRING, event_id STRING, occurred_at TIMESTAMP
) USING DELTA;

-- Dashboard: daily engagement. No raw scheduling or announcement content.
SELECT date_trunc('DAY', occurred_at) AS day, kind, count(*) AS interactions
FROM workspace.default.gobbler_interactions
WHERE occurred_at >= current_timestamp() - INTERVAL 30 DAYS
GROUP BY 1, 2 ORDER BY 1;

-- Dashboard: events students act on.
SELECT event_id,
  count_if(kind = 'recommendation_impression') AS impressions,
  count_if(kind = 'event_view') AS views,
  count_if(kind = 'save') AS saves,
  count_if(kind = 'recommendation_feedback') AS feedback
FROM workspace.default.gobbler_interactions
WHERE occurred_at >= current_timestamp() - INTERVAL 30 DAYS
GROUP BY 1 ORDER BY saves DESC LIMIT 20;
