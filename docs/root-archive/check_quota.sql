-- Check current user AI usage and quota
SELECT 
  p.id,
  p.role,
  p.full_name,
  uat.tier_name,
  uat.monthly_request_limit,
  COALESCE(COUNT(aue.id), 0) as requests_this_month,
  uat.monthly_request_limit - COALESCE(COUNT(aue.id), 0) as remaining_requests
FROM profiles p
LEFT JOIN user_ai_tiers uat ON p.id = uat.user_id
LEFT JOIN ai_usage_events aue ON p.id = aue.user_id 
  AND aue.created_at >= date_trunc('month', CURRENT_TIMESTAMP)
WHERE p.id = auth.uid()
GROUP BY p.id, p.role, p.full_name, uat.tier_name, uat.monthly_request_limit;
