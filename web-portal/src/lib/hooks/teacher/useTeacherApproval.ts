'use client';

/**
 * useTeacherApproval — Web approval gate hook
 *
 * Checks the teacher_approvals table for org-linked teachers.
 * Returns the approval status so pages can redirect pending/rejected teachers.
 *
 * Logic mirrors the native gate in app/screens/teacher-dashboard.tsx:
 * - No org → skip (standalone mode)
 * - DB error → fail open (allow access)
 * - No record → allow (teacher didn't go through invite flow)
 * - status 'approved' → allow
 * - status 'pending' / 'rejected' → block
 */

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export type ApprovalState = 'loading' | 'approved' | 'pending' | 'rejected' | 'no-org';

interface UseTeacherApprovalResult {
  /** Current approval state */
  approvalState: ApprovalState;
  /** Whether the gate check is still in progress */
  loading: boolean;
  /** Whether the teacher is allowed to access the dashboard */
  allowed: boolean;
}

export function useTeacherApproval(
  userId: string | undefined,
  preschoolId: string | undefined,
): UseTeacherApprovalResult {
  const [approvalState, setApprovalState] = useState<ApprovalState>('loading');
  const supabase = createClient();

  useEffect(() => {
    if (!userId) {
      setApprovalState('loading');
      return;
    }

    // No org → standalone teacher, skip approval gate
    if (!preschoolId) {
      setApprovalState('no-org');
      return;
    }

    let cancelled = false;

    const checkApproval = async () => {
      try {
        const { data: approval, error } = await supabase
          .from('teacher_approvals')
          .select('status')
          .eq('teacher_id', userId)
          .eq('preschool_id', preschoolId)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (cancelled) return;

        if (error) {
          // Fail open on DB errors
          setApprovalState('approved');
          return;
        }

        // No approval record → teacher didn't go through invite flow
        if (!approval) {
          setApprovalState('approved');
          return;
        }

        if (approval.status === 'approved') {
          setApprovalState('approved');
        } else if (approval.status === 'rejected') {
          setApprovalState('rejected');
        } else {
          // pending, withdrawn, or any other status
          setApprovalState('pending');
        }
      } catch {
        // Fail open on exceptions
        if (!cancelled) setApprovalState('approved');
      }
    };

    void checkApproval();

    return () => {
      cancelled = true;
    };
  }, [userId, preschoolId, supabase]);

  const loading = approvalState === 'loading';
  const allowed = approvalState === 'approved' || approvalState === 'no-org';

  return { approvalState, loading, allowed };
}
