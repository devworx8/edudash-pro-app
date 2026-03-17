// ─── Platform Error Monitoring Types ─────────────────────────

export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';
export type ErrorStatus =
  | 'detected'
  | 'classifying'
  | 'auto_resolved'
  | 'diagnosing'
  | 'escalated'
  | 'acknowledged'
  | 'resolved'
  | 'ignored';
export type IncidentStatus = 'open' | 'investigating' | 'mitigating' | 'resolved' | 'postmortem';
export type ErrorCategory = 'auth' | 'data' | 'payment' | 'ai' | 'communication' | 'infrastructure';
export type TeamAssignment = 'backend' | 'frontend' | 'auth' | 'payments' | 'ai' | 'devops';

export interface PlatformError {
  id: string;
  source: string;
  source_log_id: string | null;
  error_type: string;
  http_status: number | null;
  http_method: string | null;
  request_path: string | null;
  error_message: string;
  error_details: Record<string, unknown>;
  severity: ErrorSeverity;
  status: ErrorStatus;
  category: ErrorCategory | null;
  ai_diagnosis: string | null;
  ai_model_used: string | null;
  ai_confidence: number | null;
  ai_suggested_fix: string | null;
  auto_fix_applied: boolean;
  incident_id: string | null;
  assigned_team: TeamAssignment | null;
  assigned_to: string | null;
  affected_user_id: string | null;
  affected_org_id: string | null;
  user_agent: string | null;
  ip_country: string | null;
  occurred_at: string;
  classified_at: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface PlatformIncident {
  id: string;
  title: string;
  description: string | null;
  status: IncidentStatus;
  severity: ErrorSeverity;
  error_type: string;
  error_pattern: string | null;
  category: string | null;
  error_count: number;
  affected_users: number;
  first_seen_at: string;
  last_seen_at: string;
  ai_root_cause: string | null;
  ai_impact: string | null;
  ai_recommended_fix: string | null;
  ai_model_used: string | null;
  assigned_team: string | null;
  assigned_to: string | null;
  escalated_by: string;
  resolution_notes: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlatformErrorResolution {
  id: string;
  error_log_id: string | null;
  incident_id: string | null;
  resolution_type: string;
  description: string;
  resolved_by: string;
  resolver_model: string | null;
  verified: boolean;
  verified_by: string | null;
  verified_at: string | null;
  fix_details: Record<string, unknown>;
  created_at: string;
}

export interface ErrorMonitorStats {
  total_errors: number;
  by_severity: Record<ErrorSeverity, number>;
  by_status: Record<string, number>;
  by_category: Record<string, number>;
  by_team: Record<string, number>;
  auto_resolved_count: number;
  open_incidents: number;
  avg_resolution_time_hours: number | null;
}

export interface ErrorMonitorFilters {
  severity?: ErrorSeverity[];
  status?: ErrorStatus[];
  category?: ErrorCategory[];
  assigned_team?: TeamAssignment[];
  time_range?: 'last_hour' | 'last_6h' | 'last_24h' | 'last_7d' | 'last_30d';
  search?: string;
}
