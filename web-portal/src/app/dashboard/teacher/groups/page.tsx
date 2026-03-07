'use client';

import { useRouter } from 'next/navigation';
import { TeacherShell } from '@/components/dashboard/teacher/TeacherShell';
import { Users2, MessageSquare, CalendarDays, Megaphone, ArrowRight } from 'lucide-react';

export default function GroupsPage() {
  const router = useRouter();

  return (
    <TeacherShell hideHeader>
      <div className="section" style={{ display: 'grid', gap: 16 }}>
        <div className="card" style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              display: 'grid',
              placeItems: 'center',
              background: 'linear-gradient(135deg, rgba(59,130,246,.2), rgba(16,185,129,.2))',
              border: '1px solid rgba(59,130,246,.35)',
            }}>
              <Users2 className="icon20" style={{ color: '#60a5fa' }} />
            </div>
            <div>
              <h1 className="h1" style={{ marginBottom: 2 }}>Staff Planning Room</h1>
              <p className="muted" style={{ margin: 0 }}>
                Coordinate with principal and teachers in one flow: chat, plan, and execute.
              </p>
            </div>
          </div>
        </div>

        <div className="grid2">
          <button
            className="qa"
            onClick={() => router.push('/dashboard/teacher/messages?create=group')}
            style={{ justifyContent: 'space-between' }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              <MessageSquare className="icon20" />
              Start Staff Group Chat
            </span>
            <ArrowRight className="icon16" />
          </button>

          <button
            className="qa"
            onClick={() => router.push('/dashboard/teacher/weekly-plans')}
            style={{ justifyContent: 'space-between' }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              <CalendarDays className="icon20" />
              Open Weekly Plans
            </span>
            <ArrowRight className="icon16" />
          </button>

          <button
            className="qa"
            onClick={() => router.push('/dashboard/teacher/messages')}
            style={{ justifyContent: 'space-between' }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              <Users2 className="icon20" />
              Messages Hub
            </span>
            <ArrowRight className="icon16" />
          </button>

          <button
            className="qa"
            onClick={() => router.push('/dashboard/teacher/messages?create=group')}
            style={{ justifyContent: 'space-between' }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              <Megaphone className="icon20" />
              Team Update Channel
            </span>
            <ArrowRight className="icon16" />
          </button>
        </div>

        <div className="card" style={{ border: '1px solid var(--border)' }}>
          <div style={{ display: 'grid', gap: 6 }}>
            <strong>Recommended classroom cadence</strong>
            <p className="muted" style={{ margin: 0 }}>
              1) Build weekly plan draft, 2) discuss with staff in group chat, 3) submit for principal approval, 4) publish daily execution updates.
            </p>
          </div>
        </div>
      </div>
    </TeacherShell>
  );
}
