'use client';

import { useEffect, useMemo, useState } from 'react';
import { ParentShell } from '@/components/dashboard/parent/ParentShell';
import { SubPageHeader } from '@/components/dashboard/SubPageHeader';
import { NamePracticePad } from '@/components/dashboard/parent/NamePracticePad';
import { useParentDashboardData } from '@/lib/hooks/useParentDashboardData';
import { PencilLine } from 'lucide-react';

export const dynamic = 'force-dynamic';
export const dynamicParams = true;

export default function ParentNamePracticePage() {
  const [queryStudentId, setQueryStudentId] = useState<string | null>(null);
  const [queryAssignmentId, setQueryAssignmentId] = useState<string | null>(null);
  const [queryName, setQueryName] = useState<string | null>(null);
  const {
    profile,
    userName,
    preschoolName,
    tenantSlug,
    unreadCount,
    hasOrganization,
    childrenCards,
    activeChildId,
    setActiveChildId,
  } = useParentDashboardData();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    setQueryStudentId(params.get('studentId'));
    setQueryAssignmentId(params.get('assignmentId'));
    setQueryName(params.get('name'));
  }, []);

  const selectedChild = useMemo(() => {
    const requested = queryStudentId
      ? childrenCards.find((child) => child.id === queryStudentId)
      : null;
    if (requested) return requested;
    return childrenCards.find((child) => child.id === activeChildId) || childrenCards[0] || null;
  }, [activeChildId, childrenCards, queryStudentId]);

  return (
    <ParentShell
      tenantSlug={tenantSlug}
      userEmail={profile?.email}
      userName={userName}
      preschoolName={preschoolName}
      unreadCount={unreadCount}
      hasOrganization={hasOrganization}
    >
      <div style={{ margin: 'calc(var(--space-3) * -1) calc(var(--space-2) * -1)', padding: 0 }}>
        <SubPageHeader
          title="Name Practice"
          subtitle="Trace and write names with guided phonics cues"
          icon={<PencilLine size={28} color="white" />}
        />

        <div style={{ width: '100%', padding: 20, display: 'grid', gap: 16 }}>
          {childrenCards.length > 1 && (
            <div className="section">
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8 }}>
                {childrenCards.map((child) => (
                  <button
                    key={child.id}
                    onClick={() => setActiveChildId(child.id)}
                    className="chip"
                    style={{
                      padding: '8px 16px',
                      borderRadius: 20,
                      border: selectedChild?.id === child.id ? '2px solid var(--primary)' : '1px solid var(--border)',
                      background: selectedChild?.id === child.id ? 'var(--primary-subtle)' : 'var(--surface-1)',
                      color: selectedChild?.id === child.id ? 'var(--primary)' : 'var(--text-primary)',
                      fontWeight: selectedChild?.id === child.id ? 600 : 500,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {child.firstName} {child.lastName}
                  </button>
                ))}
              </div>
            </div>
          )}

          {selectedChild ? (
            <NamePracticePad
              studentId={selectedChild.id}
              preschoolId={selectedChild.preschoolId}
              assignmentId={queryAssignmentId}
              childName={`${selectedChild.firstName} ${selectedChild.lastName}`.trim()}
              targetName={queryName || selectedChild.firstName}
            />
          ) : (
            <div className="card" style={{ padding: 20 }}>
              Link a child profile to start name writing practice.
            </div>
          )}
        </div>
      </div>
    </ParentShell>
  );
}
