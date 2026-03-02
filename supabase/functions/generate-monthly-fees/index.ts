import { serve } from 'https://deno.land/std@0.214.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';

/**
 * generate-monthly-fees Edge Function
 *
 * Called by pg_cron on the 1st of each month at 00:05 UTC.
 * For every active preschool, generates student_fees rows for all active
 * students who don't yet have a fee for the current billing month.
 *
 * Auth:
 * - CRON_SECRET / service_role JWT (global run)
 * - principal/admin (scoped to their own school)
 *
 * Also auto-applies any available family credits after fee generation.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET') || '';
const FINANCE_MONTH_CUTOFF_DAY = parseInt(Deno.env.get('FINANCE_MONTH_CUTOFF_DAY') || '25', 10);
const ALLOWED_SCOPED_ROLES = new Set([
  'principal',
  'principal_admin',
  'admin',
  'preschool_admin',
  'super_admin',
  'superadmin',
]);
const GLOBAL_RUN_ROLES = new Set(['super_admin', 'superadmin']);

interface AuthorizationResult {
  authorized: boolean;
  status: number;
  reason?: string;
  scopedSchoolId: string | null;
  scopedSchoolIds: string[];
  actorRole: string | null;
}

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  corsHeaders: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ── Age matching (port of lib/utils/feeStructureSelector.ts) ──────────────

interface FeeCandidate {
  id: string;
  amount: number;
  name?: string | null;
  description?: string | null;
  fee_type?: string | null;
  grade_levels?: string[] | null;
  effective_from?: string | null;
  created_at?: string | null;
  age_min_months?: number | null;
  age_max_months?: number | null;
}

interface StudentRow {
  id: string;
  date_of_birth?: string | null;
  enrollment_date?: string | null;
  class_name?: string | null;
  preschool_id: string;
}

function computeAgeMonths(dob?: string | null): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return null;
  const now = new Date();
  let months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
  if (now.getDate() < birth.getDate()) months -= 1;
  return months < 0 ? null : months;
}

const rangePattern =
  /(\d+(?:\.\d+)?)\s*(m|mo|mos|month|months|yr|yrs|year|years)?\s*(?:-|–|—|to)\s*(\d+(?:\.\d+)?)\s*(m|mo|mos|month|months|yr|yrs|year|years)?/i;

function normalizeUnit(val?: string | null): 'months' | 'years' | null {
  if (!val) return null;
  const u = val.toLowerCase();
  if (u.startsWith('m')) return 'months';
  if (u.startsWith('yr') || u.startsWith('yea')) return 'years';
  return null;
}

function toMonths(v: number, u: 'months' | 'years'): number {
  return u === 'months' ? v : v * 12;
}

function detectLabelUnit(text: string): 'months' | 'years' | null {
  const n = text.toLowerCase();
  if (/\bmonth|months|\bmo\b|\bmos\b/.test(n)) return 'months';
  if (/\byear|years|\byr\b|\byrs\b/.test(n)) return 'years';
  return null;
}

interface AgeRange { minMonths?: number; maxMonths?: number }

function parseAgeRange(text: string): AgeRange | null {
  const normalized = text.toLowerCase();
  const m = normalized.match(rangePattern);
  const labelUnit = detectLabelUnit(normalized);
  if (m) {
    const sv = Number(m[1]);
    const ev = Number(m[3]);
    if (!isNaN(sv) && !isNaN(ev)) {
      const su = normalizeUnit(m[2]) || normalizeUnit(m[4]) || labelUnit || 'years';
      const eu = normalizeUnit(m[4]) || normalizeUnit(m[2]) || labelUnit || 'years';
      const min = toMonths(Math.min(sv, ev), su);
      const max = toMonths(Math.max(sv, ev), eu);
      return { minMonths: Math.min(min, max), maxMonths: Math.max(min, max) };
    }
  }
  const nums = (normalized.match(/\d+/g) ?? []).map(Number);
  if (!nums.length) return null;
  if (nums.length >= 2) {
    const unit = labelUnit || 'years';
    return { minMonths: toMonths(Math.min(...nums), unit), maxMonths: toMonths(Math.max(...nums), unit) };
  }
  const v = nums[0];
  if (isNaN(v)) return null;
  const unit = labelUnit || 'years';
  const mv = toMonths(v, unit);
  if (/(plus|\+|and up|or more|above)/.test(normalized)) return { minMonths: mv };
  if (/(under|below|less than|<)/.test(normalized)) return { maxMonths: mv };
  return { minMonths: mv, maxMonths: mv };
}

function isAgeInRange(age: number, r: AgeRange): boolean {
  if (r.minMonths != null && age < r.minMonths) return false;
  if (r.maxMonths != null && age > r.maxMonths) return false;
  return true;
}

function buildLabels(fee: FeeCandidate): string[] {
  return [fee.name, fee.description, ...(fee.grade_levels ?? [])]
    .filter((v): v is string => Boolean(v?.trim()));
}

function selectFee(structures: FeeCandidate[], student: StudentRow): FeeCandidate | null {
  if (!structures.length) return null;
  if (structures.length === 1) return structures[0];

  const ageMonths = computeAgeMonths(student.date_of_birth);

  // Prefer structured age ranges from DB (age_min_months/age_max_months)
  if (ageMonths != null) {
    const structuredMatch = structures.find(
      (f) =>
        f.age_min_months != null &&
        f.age_max_months != null &&
        ageMonths >= f.age_min_months &&
        ageMonths <= f.age_max_months
    );
    if (structuredMatch) return structuredMatch;
  }


  const candidates = structures.map((fee) => {
    const labels = buildLabels(fee);
    const ranges = labels.map(parseAgeRange).filter((r): r is AgeRange => r !== null);
    const labelText = labels.join(' ').toLowerCase();
    return { fee, ranges, labelText };
  });

  if (ageMonths != null) {
    const matching = candidates
      .map((c) => {
        const matchRanges = c.ranges.filter((r) => isAgeInRange(ageMonths, r));
        if (!matchRanges.length) return null;
        const best = Math.min(
          ...matchRanges.map((r) => Math.max(0, (r.maxMonths ?? r.minMonths ?? 0) - (r.minMonths ?? 0)))
        );
        return { c, best };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);

    if (matching.length) {
      matching.sort((a, b) => {
        if (a.best !== b.best) return a.best - b.best;
        const ae = a.c.fee.effective_from ? new Date(a.c.fee.effective_from).getTime() : 0;
        const be = b.c.fee.effective_from ? new Date(b.c.fee.effective_from).getTime() : 0;
        return be - ae;
      });
      return matching[0].c.fee;
    }
  }

  const ageLabel = student.class_name?.toLowerCase().trim();
  if (ageLabel) {
    const match = candidates.find((c) => c.labelText.includes(ageLabel));
    if (match) return match.fee;
  }

  return structures[0];
}

function isTuitionFee(feeType?: string | null, name?: string | null, desc?: string | null): boolean {
  const t = (feeType || '').toLowerCase();
  const combined = ((name || '') + ' ' + (desc || '')).toLowerCase();
  return (
    ['tuition', 'school_fees', 'school_fee', 'monthly', 'monthly_fee'].includes(t) ||
    /tuition|school\s*fee|monthly\s*fee/.test(combined)
  );
}

async function authorizeRequest(
  req: Request,
  supabaseAdmin: ReturnType<typeof createClient>,
): Promise<AuthorizationResult> {
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (!token) {
    return {
      authorized: false,
      status: 401,
      reason: 'Missing Authorization header',
      scopedSchoolId: null,
      scopedSchoolIds: [],
      actorRole: null,
    };
  }

  const isServiceRole = token === SUPABASE_SERVICE_ROLE_KEY;
  const isCronJob = CRON_SECRET && token === CRON_SECRET;
  if (isServiceRole || isCronJob) {
    return { authorized: true, status: 200, scopedSchoolId: null, scopedSchoolIds: [], actorRole: 'service_role' };
  }

  // Allow service_role JWTs coming through the Authorization header.
  try {
    const payload = JSON.parse(atob(token.split('.')[1] || ''));
    if (payload?.role === 'service_role') {
      return { authorized: true, status: 200, scopedSchoolId: null, scopedSchoolIds: [], actorRole: 'service_role' };
    }
  } catch {
    // ignore non-JWT tokens
  }

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !authData?.user) {
    return {
      authorized: false,
      status: 401,
      reason: 'Invalid bearer token',
      scopedSchoolId: null,
      scopedSchoolIds: [],
      actorRole: null,
    };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('role, preschool_id, organization_id')
    .eq('id', authData.user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return {
      authorized: false,
      status: 403,
      reason: 'Profile not found',
      scopedSchoolId: null,
      scopedSchoolIds: [],
      actorRole: null,
    };
  }

  const role = String(profile.role || '').toLowerCase();
  if (!ALLOWED_SCOPED_ROLES.has(role)) {
    return {
      authorized: false,
      status: 403,
      reason: 'Role not allowed',
      scopedSchoolId: null,
      scopedSchoolIds: [],
      actorRole: role || null,
    };
  }

  if (GLOBAL_RUN_ROLES.has(role)) {
    return { authorized: true, status: 200, scopedSchoolId: null, scopedSchoolIds: [], actorRole: role };
  }

  const scopedSchoolIds = Array.from(
    new Set(
      [profile.preschool_id, profile.organization_id]
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0),
    ),
  );
  const scopedSchoolId = scopedSchoolIds[0] || null;
  if (!scopedSchoolId) {
    return {
      authorized: false,
      status: 403,
      reason: 'No school scope found for profile',
      scopedSchoolId: null,
      scopedSchoolIds: [],
      actorRole: role,
    };
  }

  return { authorized: true, status: 200, scopedSchoolId, scopedSchoolIds, actorRole: role };
}

// ── Main handler ──────────────────────────────────────────────────────────

serve(async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405, corsHeaders);
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const auth = await authorizeRequest(req, supabase);
    if (!auth.authorized) {
      return jsonResponse({ error: auth.reason || 'Unauthorized' }, auth.status, corsHeaders);
    }

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const targetMonthInput = typeof body.target_month === 'string' ? body.target_month : null;
    const requestedSchoolIdRaw =
      typeof body.preschool_id === 'string'
        ? body.preschool_id
        : typeof body.organization_id === 'string'
          ? body.organization_id
          : null;
    const requestedSchoolId = requestedSchoolIdRaw?.trim() || null;

    if (auth.scopedSchoolIds.length > 0 && requestedSchoolId && !auth.scopedSchoolIds.includes(requestedSchoolId)) {
      return jsonResponse({ error: 'Cannot generate fees outside your school scope' }, 403, corsHeaders);
    }

    const schoolFilter = requestedSchoolId || auth.scopedSchoolId || null;

    // Parse optional body for target_month override
    const targetMonth = targetMonthInput ? new Date(targetMonthInput) : new Date();
    if (Number.isNaN(targetMonth.getTime())) {
      return jsonResponse(
        { error: 'Invalid target_month. Use ISO date format (YYYY-MM-DD).' },
        400,
        corsHeaders,
      );
    }

    // Billing month = 1st of the current month
    const billingMonth = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), 1);
    const billingMonthStr = billingMonth.toISOString().split('T')[0];

    // ── Fetch target schools ───────────────────────────────────────────
    const schoolsQuery = supabase
      .from('preschools')
      .select('id, name')
      .eq('is_active', true)
      .order('name', { ascending: true });
    const { data: schools, error: schoolErr } = schoolFilter
      ? await schoolsQuery.eq('id', schoolFilter)
      : await schoolsQuery;

    if (schoolErr) {
      return jsonResponse(
        { success: false, error: 'Failed to fetch schools', details: schoolErr.message },
        500,
        corsHeaders,
      );
    }
    if (schoolFilter && (!schools || schools.length === 0)) {
      return jsonResponse(
        { success: false, error: `School ${schoolFilter} not found or inactive` },
        404,
        corsHeaders,
      );
    }

    const results: {
      school_id: string;
      school_name: string;
      fees_created: number;
      students_processed: number;
      credits_applied: number;
      errors: string[];
    }[] = [];

    for (const school of schools || []) {
      const schoolResult = {
        school_id: school.id,
        school_name: school.name || 'Unknown',
        fees_created: 0,
        students_processed: 0,
        credits_applied: 0,
        errors: [] as string[],
      };

      try {
        // ── Fetch active fee structures for this school ────────────────
        const { data: feeStructures, error: fsErr } = await supabase
          .from('fee_structures')
          .select('id, amount, fee_type, name, description, grade_levels, effective_from, created_at, age_min_months, age_max_months')
          .eq('preschool_id', school.id)
          .eq('is_active', true)
          .order('effective_from', { ascending: false })
          .order('created_at', { ascending: false });

        if (fsErr) {
          schoolResult.errors.push(`Fee structure fetch error: ${fsErr.message}`);
          results.push(schoolResult);
          continue;
        }

        const tuitionFees = (feeStructures || []).filter((fs) =>
          isTuitionFee(fs.fee_type, fs.name, fs.description)
        );

        if (!tuitionFees.length) {
          // Try school_fee_structures as fallback
          const { data: schoolFees } = await supabase
            .from('school_fee_structures')
            .select('id, amount_cents, fee_category, name, description, age_group, grade_level, created_at')
            .eq('preschool_id', school.id)
            .eq('is_active', true);

          const tuitionSchoolFees = (schoolFees || []).filter((sf) =>
            isTuitionFee(sf.fee_category, sf.name, sf.description)
          );

          if (!tuitionSchoolFees.length) {
            // No fee structures at all — skip this school
            results.push(schoolResult);
            continue;
          }

          // Map school_fee_structures to FeeCandidate format
          for (const sf of tuitionSchoolFees) {
            tuitionFees.push({
              id: sf.id,
              amount: sf.amount_cents / 100,
              fee_type: sf.fee_category,
              name: sf.name,
              description: sf.description,
              grade_levels: sf.grade_level ? [sf.grade_level] : null,
              effective_from: null,
              created_at: sf.created_at,
            });
          }
        }

        // ── Fetch active students ──────────────────────────────────────
        const { data: students, error: stErr } = await supabase
          .from('students')
          .select('id, date_of_birth, enrollment_date, grade_level, preschool_id, organization_id')
          .or(`preschool_id.eq.${school.id},organization_id.eq.${school.id}`)
          .eq('is_active', true)
          .eq('status', 'active');

        if (stErr) {
          schoolResult.errors.push(`Student fetch error: ${stErr.message}`);
          results.push(schoolResult);
          continue;
        }

        if (!students?.length) {
          results.push(schoolResult);
          continue;
        }

        // ── Fetch existing fees for this month to avoid duplicates ─────
        const studentIds = students.map((s) => s.id);
        const { data: existingFees } = await supabase
          .from('student_fees')
          .select('student_id')
          .in('student_id', studentIds)
          .eq('billing_month', billingMonthStr);

        const studentsWithFees = new Set((existingFees || []).map((f) => f.student_id));

        // ── Generate fees for students without one ─────────────────────
        const feesToInsert: {
          student_id: string;
          fee_structure_id: string;
          amount: number;
          final_amount: number;
          due_date: string;
          billing_month: string;
          category_code: string;
          status: string;
          amount_paid: number;
          amount_outstanding: number;
        }[] = [];

        for (const student of students) {
          schoolResult.students_processed++;

          if (studentsWithFees.has(student.id)) {
            continue; // Already has a fee for this month
          }

          const selected = selectFee(
            tuitionFees as FeeCandidate[],
            {
              ...(student as StudentRow),
              // Some deployments do not have students.class_name; use grade_level as fallback label.
              class_name: (student as { grade_level?: string | null }).grade_level ?? null,
            }
          );
          if (!selected) continue;

          feesToInsert.push({
            student_id: student.id,
            fee_structure_id: selected.id,
            amount: selected.amount,
            final_amount: selected.amount,
            due_date: billingMonthStr,
            billing_month: billingMonthStr,
            category_code: 'tuition',
            status: 'pending',
            amount_paid: 0,
            amount_outstanding: selected.amount,
          });
        }

        if (feesToInsert.length > 0) {
          // Batch insert in chunks of 100
          for (let i = 0; i < feesToInsert.length; i += 100) {
            const chunk = feesToInsert.slice(i, i + 100);
            const { error: insertErr } = await supabase
              .from('student_fees')
              .upsert(chunk, {
                onConflict: 'student_id,fee_structure_id,due_date',
                ignoreDuplicates: true,
              });

            if (insertErr) {
              schoolResult.errors.push(`Fee insert error (batch ${Math.floor(i / 100)}): ${insertErr.message}`);
            } else {
              schoolResult.fees_created += chunk.length;
            }
          }
        }

        // ── Auto-apply available family credits ────────────────────────
        try {
          const { data: credits } = await supabase
            .from('family_credits')
            .select('id, parent_id, student_id, remaining_amount, origin_payment_id, category_code')
            .eq('preschool_id', school.id)
            .eq('status', 'available')
            .gt('remaining_amount', 0)
            .order('created_at', { ascending: true });

          if (credits?.length) {
            for (const credit of credits) {
              if (!credit.student_id) continue;

              // Find outstanding fees for this student this month
              const { data: outstandingFees } = await supabase
                .from('student_fees')
                .select('id, amount_outstanding, amount_paid, final_amount, amount, billing_month, category_code, status')
                .eq('student_id', credit.student_id)
                .eq('billing_month', billingMonthStr)
                .not('status', 'in', '("paid","waived")')
                .gt('amount_outstanding', 0)
                .order('due_date', { ascending: true });

              if (!outstandingFees?.length) continue;

              let creditRemaining = credit.remaining_amount;

              for (const fee of outstandingFees) {
                if (creditRemaining <= 0) break;

                const applyAmount = Math.min(creditRemaining, fee.amount_outstanding);
                if (applyAmount <= 0) continue;

                // Call the apply_family_credit RPC
                const { error: applyErr } = await supabase.rpc('apply_family_credit', {
                  p_credit_id: credit.id,
                  p_student_fee_id: fee.id,
                  p_amount: applyAmount,
                  p_notes: 'Auto-applied by monthly fee generation',
                });

                if (applyErr) {
                  schoolResult.errors.push(`Credit apply error: ${applyErr.message}`);
                } else {
                  creditRemaining -= applyAmount;
                  schoolResult.credits_applied++;
                }
              }
            }
          }
        } catch (creditErr) {
          schoolResult.errors.push(`Credit auto-apply error: ${String(creditErr)}`);
        }
      } catch (schoolErr) {
        schoolResult.errors.push(`School processing error: ${String(schoolErr)}`);
      }

      results.push(schoolResult);
    }

    const totalFeesCreated = results.reduce((s, r) => s + r.fees_created, 0);
    const totalCreditsApplied = results.reduce((s, r) => s + r.credits_applied, 0);
    const totalErrors = results.reduce((s, r) => s + r.errors.length, 0);

    return jsonResponse(
      {
        success: true,
        billing_month: billingMonthStr,
        scoped_school_id: schoolFilter,
        requested_by_role: auth.actorRole,
        cutoff_day: FINANCE_MONTH_CUTOFF_DAY,
        schools_processed: results.length,
        total_fees_created: totalFeesCreated,
        total_credits_applied: totalCreditsApplied,
        total_errors: totalErrors,
        results,
        completed_at: new Date().toISOString(),
      },
      200,
      corsHeaders,
    );
  } catch (error) {
    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      500,
      corsHeaders,
    );
  }
});
