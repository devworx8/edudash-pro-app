import { Calendar, CheckCircle, Clock, XCircle, Eye, Users } from 'lucide-react';
import type { WeeklyPlan } from '@/types/ecd-planning';

interface WeeklyPlanCardProps {
  plan: WeeklyPlan;
  onView: (plan: WeeklyPlan) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}

export function WeeklyPlanCard({ plan, onView, onApprove, onReject }: WeeklyPlanCardProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return '#10b981';
      case 'submitted':
        return '#f59e0b';
      case 'published':
        return '#3b82f6';
      default:
        return 'var(--muted)';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
      case 'published':
        return <CheckCircle size={16} />;
      case 'submitted':
        return <Clock size={16} />;
      default:
        return <XCircle size={16} />;
    }
  };

  return (
    <div
      className="card"
      style={{
        padding: 20,
        border: plan.status === 'submitted' ? '2px solid #f59e0b' : '1px solid var(--border)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <Calendar size={20} style={{ color: 'var(--primary)' }} />
            <h3 style={{ margin: 0, fontSize: 18 }}>
              Week {plan.week_number} - {new Date(plan.week_start_date).toLocaleDateString()}
            </h3>
            <span
              className="badge"
              style={{
                background: getStatusColor(plan.status),
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              {getStatusIcon(plan.status)}
              {plan.status.charAt(0).toUpperCase() + plan.status.slice(1)}
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 14, marginBottom: 8 }}>
            <span style={{ color: 'var(--muted)' }}>
              {new Date(plan.week_start_date).toLocaleDateString()} -{' '}
              {new Date(plan.week_end_date).toLocaleDateString()}
            </span>
            {plan.weekly_focus && (
              <span style={{ color: 'var(--muted)' }}>Focus: {plan.weekly_focus}</span>
            )}
          </div>
          {plan.weekly_objectives.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>Objectives:</p>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14 }}>
                {plan.weekly_objectives.slice(0, 3).map((obj, idx) => (
                  <li key={idx}>{obj}</li>
                ))}
                {plan.weekly_objectives.length > 3 && (
                  <li style={{ color: 'var(--muted)' }}>+{plan.weekly_objectives.length - 3} more</li>
                )}
              </ul>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="iconBtn" onClick={() => onView(plan)} title="View Details">
            <Eye size={18} />
          </button>
          {plan.status === 'submitted' && (
            <>
              <button
                className="iconBtn"
                onClick={() => onApprove(plan.id)}
                title="Approve"
                style={{ color: '#10b981' }}
              >
                <CheckCircle size={18} />
              </button>
              <button
                className="iconBtn"
                onClick={() => onReject(plan.id)}
                title="Request Revisions"
                style={{ color: '#ef4444' }}
              >
                <XCircle size={18} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
