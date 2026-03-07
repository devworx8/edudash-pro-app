'use client';

import {
  UserPlus,
  FileText,
  Clock,
  Activity,
} from 'lucide-react';
import { ParentApprovalWidget } from '@/components/dashboard/principal/ParentApprovalWidget';
import { ChildRegistrationWidget } from '@/components/dashboard/principal/ChildRegistrationWidget';
import { UniformOrdersWidget } from '@/components/dashboard/principal/UniformOrdersWidget';
import { StationeryReadinessWidget } from '@/components/dashboard/principal/StationeryReadinessWidget';
import { AskAIWidget } from '@/components/dashboard/AskAIWidget';

interface RecentActivity {
  id: string;
  type: 'registration' | 'student' | 'system';
  title: string;
  description: string;
  timestamp: string;
}

interface PrincipalSidebarProps {
  metrics: {
    totalStudents: number;
    totalTeachers: number;
    totalClasses: number;
  };
  recentActivities: RecentActivity[];
  preschoolId: string | undefined;
  userId: string | undefined;
  onOpenDashAI: () => void;
}

export function PrincipalSidebar({
  metrics,
  recentActivities,
  preschoolId,
  userId,
  onOpenDashAI,
}: PrincipalSidebarProps) {
  return (
    <>
      {/* At a Glance */}
      <div className="card">
        <div className="sectionTitle">At a glance</div>
        <ul style={{ display: 'grid', gap: 8 }}>
          <li className="listItem">
            <span>Total Students</span>
            <span className="badge">{metrics.totalStudents}</span>
          </li>
          <li className="listItem">
            <span>Teaching Staff</span>
            <span className="badge">{metrics.totalTeachers}</span>
          </li>
          <li className="listItem">
            <span>Active Classes</span>
            <span className="badge">{metrics.totalClasses}</span>
          </li>
        </ul>
      </div>

      {/* Child Registration Requests */}
      <ChildRegistrationWidget preschoolId={preschoolId} userId={userId} />

      {/* Parent Link Approval Requests */}
      <ParentApprovalWidget preschoolId={preschoolId} userId={userId} />

      {/* Uniform Sizes */}
      <UniformOrdersWidget schoolId={preschoolId} />

      {/* Stationery Readiness */}
      <StationeryReadinessWidget schoolId={preschoolId} />

      {/* Recent Activity */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Activity size={18} style={{ color: 'var(--primary)' }} />
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Recent Activity</h3>
        </div>
        {recentActivities.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 24, color: 'var(--muted)' }}>
            <Clock size={32} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
            <p style={{ fontSize: 14 }}>No recent activity</p>
          </div>
        ) : (
          <ul style={{ display: 'grid', gap: 12 }}>
            {recentActivities.map((activity) => (
              <li key={activity.id} style={{ display: 'flex', gap: 12, fontSize: 13 }}>
                {activity.type === 'registration' ? (
                  <FileText
                    size={14}
                    style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 2 }}
                  />
                ) : activity.type === 'student' ? (
                  <UserPlus
                    size={14}
                    style={{ color: '#10b981', flexShrink: 0, marginTop: 2 }}
                  />
                ) : (
                  <Clock
                    size={14}
                    style={{ color: 'var(--muted)', flexShrink: 0, marginTop: 2 }}
                  />
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>{activity.title}</div>
                  <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 2 }}>
                    {activity.description}
                  </div>
                  <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 4 }}>
                    {new Date(activity.timestamp).toLocaleString('en-ZA', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Ask Dash AI Assistant */}
      <div
        data-dash-ai
        onClick={(e) => {
          if (window.innerWidth < 1024) {
            e.preventDefault();
            e.stopPropagation();
            onOpenDashAI();
          }
        }}
      >
        <AskAIWidget scope="principal" inline userId={userId} />
      </div>
    </>
  );
}
