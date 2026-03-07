'use client';

/**
 * Teacher Top Bar Component
 * Extracted from TeacherShell.tsx
 */

import { useRouter } from 'next/navigation';
import { Bell, Menu, Activity } from 'lucide-react';

interface TeacherTopBarProps {
  preschoolName?: string;
  avatarLetter: string;
  notificationCount: number;
  activityCount: number;
  hasRightSidebar: boolean;
  onMenuClick: () => void;
  onWidgetsClick: () => void;
}

export function TeacherTopBar({
  preschoolName,
  avatarLetter,
  notificationCount,
  activityCount,
  hasRightSidebar,
  onMenuClick,
  onWidgetsClick,
}: TeacherTopBarProps) {
  const router = useRouter();

  return (
    <header className="topbar teacher-topbar" style={{ paddingTop: 5, paddingBottom: 5 }}>
      <div className="topbarRow topbarEdge">
        <div className="leftGroup">
          <button
            className="iconBtn mobile-nav-btn"
            aria-label="Menu"
            onClick={onMenuClick}
          >
            <Menu className="icon20" />
          </button>
          {preschoolName ? (
            <div className="chip" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 16 }}>🦅</span>
              <span style={{ fontWeight: 600 }}>{preschoolName}</span>
            </div>
          ) : (
            <div className="chip">Young Eagles</div>
          )}
        </div>
        <div className="rightGroup" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            className="iconBtn"
            aria-label="Notifications"
            onClick={() => router.push('/dashboard/teacher/notifications')}
            style={{ position: 'relative' }}
          >
            <Bell className="icon20" />
            {notificationCount > 0 && (
              <span style={{
                position: 'absolute',
                top: -4,
                right: -4,
                backgroundColor: 'var(--danger)',
                color: 'white',
                borderRadius: '50%',
                width: 16,
                height: 16,
                fontSize: 10,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                {notificationCount > 9 ? '9+' : notificationCount}
              </span>
            )}
          </button>
          {hasRightSidebar && (
            <button 
              className="iconBtn" 
              aria-label="Activity" 
              onClick={onWidgetsClick}
              style={{ position: 'relative' }}
            >
              <Activity className="icon20" />
              {activityCount > 0 && (
                <span style={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  width: 8,
                  height: 8,
                  background: '#dc2626',
                  borderRadius: '50%',
                  border: '2px solid var(--surface-1)',
                }} />
              )}
            </button>
          )}
          <div className="avatar">{avatarLetter}</div>
        </div>
      </div>
    </header>
  );
}
