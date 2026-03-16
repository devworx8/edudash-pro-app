/**
 * CAPS Curriculum Tools for Dash AI
 * 
 * Tools for searching and retrieving CAPS curriculum content
 */

import { logger } from '@/lib/logger';
import { getFeatureFlagsSync } from '@/lib/featureFlags';
import { DASH_TELEMETRY_EVENTS, trackDashTelemetry } from '@/lib/telemetry/events';
import type { DashToolOutcome } from '@/services/tools/types';
import type { AgentTool } from '../DashToolRegistry';
import {
  checkCAPSRpcHealth,
  checkFoundationPhaseCoverage,
  isCAPSSearchRow,
  logCAPSHealthWarnings,
} from './capsHealth';

type CAPSSearchArgs = {
  query: string;
  grade?: string;
  subject?: string;
  limit?: number;
};

type CAPSSearchSource = 'rpc.search_caps_curriculum' | 'table.caps_documents' | 'degraded';

interface CAPSSearchExecutionResult {
  rows: Record<string, unknown>[];
  source: CAPSSearchSource;
  outcome: DashToolOutcome;
  fatal: boolean;
}

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const CAPS_QUERY_TIMEOUT_MS = 4500;
const CAPS_HEALTH_CHECK_INTERVAL_MS = 15 * 60 * 1000;

let lastCAPSHealthCheckAt = 0;
let pendingCAPSHealthCheck: Promise<void> | null = null;

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorCode: string
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(errorCode)), timeoutMs);
  });
  const guarded = promise.finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
  return Promise.race([guarded, timeoutPromise]);
}

function normalizeLimit(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(parsed), MAX_LIMIT);
}

function mapGradeToRpcRange(grade?: string): string | null {
  const value = String(grade || '').trim();
  if (!value) return null;
  const lower = value.toLowerCase();

  if (/(foundation|grade\s*r|grade\s*1|grade\s*2|grade\s*3|r-3)/i.test(lower)) return 'R-3';
  if (/(grade\s*4|grade\s*5|grade\s*6|4-6|intermediate)/i.test(lower)) return '4-6';
  if (/(grade\s*7|grade\s*8|grade\s*9|7-9|senior)/i.test(lower)) return '7-9';
  if (/(grade\s*10|grade\s*11|grade\s*12|10-12|fet)/i.test(lower)) return '10-12';

  const explicitRange = value.match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
  if (explicitRange) {
    return `${explicitRange[1]}-${explicitRange[2]}`;
  }

  const gradeNumberMatch = lower.match(/grade\s*(\d{1,2})/);
  if (gradeNumberMatch?.[1]) {
    const gradeNumber = Number(gradeNumberMatch[1]);
    if (gradeNumber <= 3) return 'R-3';
    if (gradeNumber <= 6) return '4-6';
    if (gradeNumber <= 9) return '7-9';
    return '10-12';
  }

  return value;
}

function toErrorCode(error: unknown, fallback: string): string {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  if (typeof (error as any).code === 'string' && (error as any).code.trim().length > 0) {
    return String((error as any).code);
  }
  if (typeof (error as Error).message === 'string' && (error as Error).message.trim().length > 0) {
    return String((error as Error).message);
  }
  return fallback;
}

function applyCapsSearchFilters(query: any, args: CAPSSearchArgs): any {
  if (args.grade) {
    query = query.ilike('grade', `%${args.grade}%`);
  }
  if (args.subject) {
    query = query.ilike('subject', `%${args.subject}%`);
  }
  return query;
}

async function runCAPSHealthChecksIfNeeded(supabase: any): Promise<void> {
  const now = Date.now();
  if (pendingCAPSHealthCheck) {
    return pendingCAPSHealthCheck;
  }
  if (now - lastCAPSHealthCheckAt < CAPS_HEALTH_CHECK_INTERVAL_MS) {
    return;
  }

  pendingCAPSHealthCheck = (async () => {
    try {
      const [rpcHealth, coverage] = await Promise.all([
        checkCAPSRpcHealth(supabase),
        checkFoundationPhaseCoverage(supabase),
      ]);
      logCAPSHealthWarnings(rpcHealth, coverage);
      if (!rpcHealth.ok || !coverage.ok) {
        trackDashTelemetry(DASH_TELEMETRY_EVENTS.TOOL_CAPS_DEGRADED, {
          source: 'caps_runtime',
          rpc_ok: rpcHealth.ok,
          rpc_error_code: rpcHealth.errorCode || null,
          coverage_ok: coverage.ok,
          coverage_missing_subjects: coverage.missingSubjects,
        });
      }
    } catch (error) {
      logger.warn('[CAPS Health] Runtime check failed', error);
    } finally {
      lastCAPSHealthCheckAt = Date.now();
      pendingCAPSHealthCheck = null;
    }
  })();

  return pendingCAPSHealthCheck;
}

function buildDegradedOutcome(source: DashToolOutcome['source'], errorCode: string): DashToolOutcome {
  return {
    status: 'degraded',
    source,
    errorCode,
    userSafeNote:
      'CAPS lookup is temporarily limited. Dash will continue with best available guidance.',
  };
}

export class CAPSQueryAdapter {
  constructor(
    private readonly supabase: any,
    private readonly timeoutMs: number = CAPS_QUERY_TIMEOUT_MS
  ) {}

  async searchByRPC(args: CAPSSearchArgs): Promise<{ rows: Record<string, unknown>[]; source: CAPSSearchSource }> {
    const { data, error } = await withTimeout(
      this.supabase.rpc('search_caps_curriculum', {
        search_query: args.query,
        search_grade: mapGradeToRpcRange(args.grade),
        search_subject: args.subject || null,
        result_limit: normalizeLimit(args.limit),
      }),
      this.timeoutMs,
      'caps_rpc_timeout'
    ) as any;

    if (error) {
      throw error;
    }
    if (!Array.isArray(data)) {
      throw new Error('caps_rpc_shape_invalid');
    }
    if (data.length > 0 && !isCAPSSearchRow(data[0])) {
      throw new Error('caps_rpc_shape_invalid');
    }
    return {
      rows: (data || []) as Record<string, unknown>[],
      source: 'rpc.search_caps_curriculum',
    };
  }

  async searchByDocumentsFallback(
    args: CAPSSearchArgs
  ): Promise<{ rows: Record<string, unknown>[]; source: CAPSSearchSource }> {
    const limit = normalizeLimit(args.limit);
    const safeQuery = String(args.query || '').replace(/[,]/g, ' ').trim();

    const textSearchBase = applyCapsSearchFilters(
      this.supabase.from('caps_documents').select('*'),
      args
    );
    const textSearchResult = await withTimeout(
      textSearchBase.textSearch('content', safeQuery, { type: 'websearch' }).limit(limit),
      this.timeoutMs,
      'caps_documents_timeout'
    ) as any;

    if (!textSearchResult.error) {
      return {
        rows: (textSearchResult.data || []) as Record<string, unknown>[],
        source: 'table.caps_documents',
      };
    }

    const ilikeBase = applyCapsSearchFilters(
      this.supabase.from('caps_documents').select('*'),
      args
    );
    const ilikeResult = await withTimeout(
      ilikeBase
        .or(`title.ilike.%${safeQuery}%,subject.ilike.%${safeQuery}%,preview.ilike.%${safeQuery}%`)
        .limit(limit),
      this.timeoutMs,
      'caps_documents_timeout'
    ) as any;

    if (!ilikeResult.error) {
      return {
        rows: (ilikeResult.data || []) as Record<string, unknown>[],
        source: 'table.caps_documents',
      };
    }

    const broadBase = applyCapsSearchFilters(
      this.supabase.from('caps_documents').select('*'),
      args
    );
    const broadResult = await withTimeout(
      broadBase.limit(limit),
      this.timeoutMs,
      'caps_documents_timeout'
    ) as any;

    if (broadResult.error) {
      throw broadResult.error;
    }

    return {
      rows: (broadResult.data || []) as Record<string, unknown>[],
      source: 'table.caps_documents',
    };
  }

  async search(args: CAPSSearchArgs): Promise<CAPSSearchExecutionResult> {
    try {
      const rpc = await this.searchByRPC(args);
      return {
        rows: rpc.rows,
        source: rpc.source,
        outcome: {
          status: 'success',
          source: 'caps_rpc',
        },
        fatal: false,
      };
    } catch (rpcError) {
      const rpcCode = toErrorCode(rpcError, 'caps_rpc_failed');
      logger.warn('[search_caps_curriculum] RPC search failed, falling back to caps_documents', {
        errorCode: rpcCode,
      });

      try {
        const fallback = await this.searchByDocumentsFallback(args);
        return {
          rows: fallback.rows,
          source: fallback.source,
          outcome: buildDegradedOutcome('caps_documents_fallback', rpcCode),
          fatal: false,
        };
      } catch (fallbackError) {
        const fallbackCode = toErrorCode(fallbackError, 'caps_documents_failed');
        logger.warn('[search_caps_curriculum] CAPS fallback search failed', {
          rpcCode,
          fallbackCode,
        });
        return {
          rows: [],
          source: 'degraded',
          outcome: buildDegradedOutcome('caps_runtime', `${rpcCode}|${fallbackCode}`),
          fatal: true,
        };
      }
    }
  }
}

export function registerCAPSTools(register: (tool: AgentTool) => void): void {
  
  // Search CAPS curriculum
  register({
    name: 'search_caps_curriculum',
    description: 'Search the CAPS curriculum database for topics, learning outcomes, or content standards. Returns matched curriculum content with grade levels and subjects.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (topic, concept, or keyword)'
        },
        grade: {
          type: 'string',
          description: 'Optional: Specific grade level (e.g., "Grade R", "Grade 1")'
        },
        subject: {
          type: 'string',
          description: 'Optional: Subject area (e.g., "Mathematics", "Life Skills", "English Home Language")'
        },
        limit: {
          type: 'number',
          description: 'Maximum results to return (default: 10)'
        }
      },
      required: ['query']
    },
    risk: 'low',
    execute: async (args) => {
      try {
        const supabase = (await import('@/lib/supabase')).assertSupabase();

        void runCAPSHealthChecksIfNeeded(supabase);
        const adapter = new CAPSQueryAdapter(supabase, CAPS_QUERY_TIMEOUT_MS);
        const failOpen = getFeatureFlagsSync().dash_caps_fail_open_v1 !== false;
        const result = await adapter.search(args as CAPSSearchArgs);
        const degraded = result.outcome.status !== 'success';
        const userSafeNote = result.outcome.userSafeNote || null;

        if (degraded) {
          trackDashTelemetry(DASH_TELEMETRY_EVENTS.TOOL_CAPS_DEGRADED, {
            source: result.outcome.source,
            errorCode: result.outcome.errorCode || null,
            fatal: result.fatal,
            fail_open: failOpen,
          });
        }

        if (result.fatal && !failOpen) {
          return {
            success: false,
            error: 'CAPS curriculum search failed',
            details: result.outcome.errorCode || 'caps_runtime_unavailable',
            outcome: result.outcome,
          };
        }

        return {
          success: true,
          results: result.rows,
          count: result.rows.length,
          query: args.query,
          source: result.source,
          degraded,
          outcome: result.outcome,
          user_safe_note: userSafeNote,
          filters: {
            grade: args.grade,
            subject: args.subject,
          },
        };
      } catch (error) {
        logger.error('[search_caps_curriculum] Error:', error);
        const failOpen = getFeatureFlagsSync().dash_caps_fail_open_v1 !== false;
        const outcome = buildDegradedOutcome('caps_runtime', toErrorCode(error, 'caps_search_exception'));
        trackDashTelemetry(DASH_TELEMETRY_EVENTS.TOOL_CAPS_DEGRADED, {
          source: outcome.source,
          errorCode: outcome.errorCode || null,
          fatal: true,
          fail_open: failOpen,
        });
        if (failOpen) {
          return {
            success: true,
            results: [],
            count: 0,
            source: 'degraded',
            degraded: true,
            outcome,
            user_safe_note: outcome.userSafeNote,
          };
        }
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Search failed'
        };
      }
    }
  });

  // Get CAPS documents
  register({
    name: 'get_caps_documents',
    description: 'Retrieve CAPS curriculum documents for a specific grade and subject. Returns official curriculum guidelines and content.',
    parameters: {
      type: 'object',
      properties: {
        grade: {
          type: 'string',
          description: 'Grade level (e.g., "Grade R", "Grade 1", "Grade 2")'
        },
        subject: {
          type: 'string',
          description: 'Subject name (e.g., "Mathematics", "English Home Language", "Life Skills")'
        },
        term: {
          type: 'number',
          description: 'Optional: School term (1-4)'
        }
      },
      required: ['grade', 'subject']
    },
    risk: 'low',
    execute: async (args) => {
      try {
        const supabase = (await import('@/lib/supabase')).assertSupabase();
        const failOpen = getFeatureFlagsSync().dash_caps_fail_open_v1 !== false;
        
        let query = supabase
          .from('caps_documents')
          .select('*')
          .ilike('grade', `%${args.grade}%`)
          .ilike('subject', `%${args.subject}%`);
        
        if (args.term) {
          query = query.eq('term', args.term);
        }
        
        const { data, error } = await query;
        
        if (error) {
          logger.error('[get_caps_documents] Error:', error);
          if (failOpen) {
            const outcome = buildDegradedOutcome(
              'caps_runtime',
              toErrorCode(error, 'caps_documents_failed')
            );
            trackDashTelemetry(DASH_TELEMETRY_EVENTS.TOOL_CAPS_DEGRADED, {
              source: outcome.source,
              errorCode: outcome.errorCode || null,
              tool: 'get_caps_documents',
            });
            return {
              success: true,
              documents: [],
              count: 0,
              grade: args.grade,
              subject: args.subject,
              term: args.term,
              degraded: true,
              outcome,
              user_safe_note: outcome.userSafeNote,
            };
          }
          return {
            success: false,
            error: 'Failed to retrieve CAPS documents',
            details: error.message
          };
        }
        
        return {
          success: true,
          documents: data || [],
          count: data?.length || 0,
          grade: args.grade,
          subject: args.subject,
          term: args.term
        };
      } catch (error) {
        logger.error('[get_caps_documents] Error:', error);
        if (getFeatureFlagsSync().dash_caps_fail_open_v1 !== false) {
          const outcome = buildDegradedOutcome(
            'caps_runtime',
            toErrorCode(error, 'caps_documents_exception')
          );
          trackDashTelemetry(DASH_TELEMETRY_EVENTS.TOOL_CAPS_DEGRADED, {
            source: outcome.source,
            errorCode: outcome.errorCode || null,
            tool: 'get_caps_documents',
          });
          return {
            success: true,
            documents: [],
            count: 0,
            grade: args.grade,
            subject: args.subject,
            term: args.term,
            degraded: true,
            outcome,
            user_safe_note: outcome.userSafeNote,
          };
        }
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get documents'
        };
      }
    }
  });

  // Get CAPS subjects
  register({
    name: 'get_caps_subjects',
    description: 'Get list of CAPS subjects available for a specific grade level.',
    parameters: {
      type: 'object',
      properties: {
        grade: {
          type: 'string',
          description: 'Grade level (e.g., "Grade R", "Grade 1")'
        }
      },
      required: ['grade']
    },
    risk: 'low',
    execute: async (args) => {
      try {
        const supabase = (await import('@/lib/supabase')).assertSupabase();
        const failOpen = getFeatureFlagsSync().dash_caps_fail_open_v1 !== false;
        
        const { data, error } = await supabase
          .from('caps_documents')
          .select('subject')
          .ilike('grade', `%${args.grade}%`);
        
        if (error) {
          logger.error('[get_caps_subjects] Error:', error);
          
          // Return default subjects for early grades
          const gradeLevel = args.grade?.toLowerCase() || '';
          if (gradeLevel.includes('r') || gradeLevel.includes('1') || gradeLevel.includes('2') || gradeLevel.includes('3')) {
            return {
              success: true,
              subjects: [
                'Home Language',
                'First Additional Language', 
                'Mathematics',
                'Life Skills'
              ],
              grade: args.grade,
              source: 'default'
            };
          }

          if (failOpen) {
            const outcome = buildDegradedOutcome(
              'caps_runtime',
              toErrorCode(error, 'caps_subjects_failed')
            );
            trackDashTelemetry(DASH_TELEMETRY_EVENTS.TOOL_CAPS_DEGRADED, {
              source: outcome.source,
              errorCode: outcome.errorCode || null,
              tool: 'get_caps_subjects',
            });
            return {
              success: true,
              subjects: [],
              grade: args.grade,
              count: 0,
              degraded: true,
              outcome,
              user_safe_note: outcome.userSafeNote,
            };
          }
          
          return {
            success: false,
            error: 'Failed to retrieve subjects',
            details: error.message
          };
        }
        
        // Extract unique subjects
        const subjects = [...new Set(data?.map(d => d.subject).filter(Boolean))] as string[];
        
        return {
          success: true,
          subjects,
          grade: args.grade,
          count: subjects.length
        };
      } catch (error) {
        logger.error('[get_caps_subjects] Error:', error);
        if (getFeatureFlagsSync().dash_caps_fail_open_v1 !== false) {
          const outcome = buildDegradedOutcome(
            'caps_runtime',
            toErrorCode(error, 'caps_subjects_exception')
          );
          trackDashTelemetry(DASH_TELEMETRY_EVENTS.TOOL_CAPS_DEGRADED, {
            source: outcome.source,
            errorCode: outcome.errorCode || null,
            tool: 'get_caps_subjects',
          });
          return {
            success: true,
            subjects: [],
            grade: args.grade,
            count: 0,
            degraded: true,
            outcome,
            user_safe_note: outcome.userSafeNote,
          };
        }
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get subjects'
        };
      }
    }
  });
}
