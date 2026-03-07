'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createClient } from '@/lib/supabase/client';
import { Clock, AlertCircle, UserPlus, UserCheck } from 'lucide-react';

interface PendingRequest {
  id: string;
  type: 'registration' | 'claim';
  childName: string;
  schoolName?: string;
  requestedDate: string;
}

interface PendingRequestsWidgetProps {
  userId?: string;
}

export function PendingRequestsWidget({ userId }: PendingRequestsWidgetProps) {
  const { t, i18n } = useTranslation();
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPendingRequests = async () => {
      if (!userId) return;

      setLoading(true);
      try {
        const supabase = createClient();
        const allRequests: PendingRequest[] = [];

        // First, get parent's internal ID, email, role, and linked students to filter out duplicates
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, preschool_id, email, role')
          .eq('id', userId)
          .maybeSingle();

        const parentInternalId = profile?.id;
        const preschoolId = profile?.preschool_id;
        const userEmail = profile?.email;
        const userRole = profile?.role;

        // Get already-linked students (approved children)
        const { data: linkedStudents } = await supabase
          .from('students')
          .select('id, first_name, last_name')
          .eq('parent_id', parentInternalId)
          .eq('preschool_id', preschoolId)
          .eq('is_active', true);

        // Create a Set of normalized student names to check against
        const linkedStudentNames = new Set(
          (linkedStudents || []).map((s: any) => 
            `${s.first_name} ${s.last_name}`.toLowerCase().trim()
          )
        );

        // Fetch pending child registration requests
        // Note: registration_requests table may not exist in all EduDashPro instances
        // Only query if we have a valid email - skip for parents to avoid 400 errors
        let registrationRequests: any[] | null = null;
        let regError: any = null;
        
        // Only fetch registration_requests if user has email (avoid undefined query)
        if (userEmail && userRole && ['principal', 'admin', 'superadmin'].includes(userRole)) {
          const result = await supabase
            .from('registration_requests')
            .select('id, student_first_name, student_last_name, created_at, organization_id, organizations(name)')
            .eq('guardian_email', userEmail)
            .eq('status', 'pending')
            .order('created_at', { ascending: false });
          registrationRequests = result.data;
          regError = result.error;
        }

        // Silently handle expected errors (table doesn't exist, RLS denial, etc.)
        if (!regError && registrationRequests) {
          registrationRequests.forEach((req: any) => {
            const requestName = `${req.student_first_name} ${req.student_last_name}`.toLowerCase().trim();
            
            // Only show if child is NOT already linked
            if (!linkedStudentNames.has(requestName)) {
              allRequests.push({
                id: req.id,
                type: 'registration',
                childName: `${req.student_first_name} ${req.student_last_name}`,
                schoolName: req.organizations?.name,
                requestedDate: new Date(req.created_at).toLocaleDateString(i18n.language || 'en-ZA', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                }),
              });
            }
          });
        }

        // Fetch pending guardian/claim requests
        const { data: claimRequests, error: claimError } = await supabase
          .from('guardian_requests')
          .select('id, child_full_name, created_at, school_id, student_id, preschools(name)')
          .eq('parent_auth_id', userId)
          .eq('status', 'pending')
          .order('created_at', { ascending: false });

        if (!claimError && claimRequests) {
          // Get student IDs from linked students
          const linkedStudentIds = new Set((linkedStudents || []).map((s: any) => s.id));

          claimRequests.forEach((req: any) => {
            // Only show if student is NOT already linked
            if (!linkedStudentIds.has(req.student_id)) {
              allRequests.push({
                id: req.id,
                type: 'claim',
                childName: req.child_full_name || t('common.child', { defaultValue: 'Child' }),
                schoolName: req.preschools?.name,
                requestedDate: new Date(req.created_at).toLocaleDateString(i18n.language || 'en-ZA', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                }),
              });
            }
          });
        }

        // Sort all by date (most recent first)
        allRequests.sort((a, b) => new Date(b.requestedDate).getTime() - new Date(a.requestedDate).getTime());

        setRequests(allRequests);
      } catch (err) {
        console.error('[PendingRequestsWidget] Error loading requests:', err);
      } finally {
        setLoading(false);
      }
    };

    loadPendingRequests();
  }, [i18n.language, t, userId]);

  if (loading) {
    return (
      <div className="card p-md">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-400" />
            {t('dashboard.parent.pending_requests.title', { defaultValue: 'Pending Requests' })}
          </h3>
        </div>
        <div className="text-center py-4 text-gray-400">
          <Clock className="w-6 h-6 animate-spin mx-auto mb-2" />
          <p className="text-sm">{t('dashboard.parent.pending_requests.loading', { defaultValue: 'Loading...' })}</p>
        </div>
      </div>
    );
  }

  if (requests.length === 0) {
    return null; // Don't show widget if no pending requests
  }

  return (
    <div className="card p-md" style={{ background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(147, 51, 234, 0.1))' }}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Clock className="w-5 h-5 text-blue-400" />
          {t('dashboard.parent.pending_requests.title', { defaultValue: 'Pending Requests' })}
        </h3>
        <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded-full text-xs font-semibold">
          {requests.length}
        </span>
      </div>

      <div className="space-y-3">
        {requests.map((request) => (
          <div
            key={request.id}
            className="p-3 bg-gray-800/50 border border-gray-700/50 rounded-lg hover:border-blue-500/30 transition-all"
          >
            <div className="flex items-start gap-3">
              <div className="mt-1">
                {request.type === 'registration' ? (
                  <UserPlus className="w-5 h-5 text-blue-400" />
                ) : (
                  <UserCheck className="w-5 h-5 text-purple-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium truncate">{request.childName}</p>
                <p className="text-sm text-gray-400 mt-0.5">
                  {request.type === 'registration'
                    ? t('dashboard.parent.pending_requests.types.registration', { defaultValue: 'New registration' })
                    : t('dashboard.parent.pending_requests.types.claim', { defaultValue: 'Link request' })}
                  {request.schoolName && <span className="text-gray-500"> • {request.schoolName}</span>}
                </p>
                <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {t('dashboard.parent.pending_requests.requested_on', { defaultValue: 'Requested {{date}}', date: request.requestedDate })}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg flex items-start gap-2">
        <AlertCircle className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-blue-300">
          {t('dashboard.parent.pending_requests.footer', {
            defaultValue: 'Your request is awaiting school approval. You\'ll be notified once reviewed.',
            count: requests.length,
          })}
        </p>
      </div>
    </div>
  );
}
