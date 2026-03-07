import { X, Calendar, CheckCircle, XCircle } from 'lucide-react';
import type { WeeklyPlan } from '@/types/ecd-planning';

interface WeeklyPlanDetailsProps {
  plan: WeeklyPlan;
  onClose: () => void;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
}

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as const;

export function WeeklyPlanDetails({ plan, onClose, onApprove, onReject }: WeeklyPlanDetailsProps) {
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.8)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div className="card" style={{ maxWidth: 900, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h2 style={{ margin: 0 }}>Week {plan.week_number} Plan</h2>
            <p style={{ color: 'var(--muted)', margin: '4px 0 0 0' }}>
              {new Date(plan.week_start_date).toLocaleDateString()} -{' '}
              {new Date(plan.week_end_date).toLocaleDateString()}
            </p>
          </div>
          <button className="iconBtn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {plan.weekly_focus && (
          <div className="card" style={{ padding: 16, marginBottom: 20, background: 'var(--bg-secondary)' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: 16 }}>Weekly Focus</h3>
            <p style={{ margin: 0 }}>{plan.weekly_focus}</p>
          </div>
        )}

        {plan.weekly_objectives.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ marginBottom: 12 }}>Weekly Objectives</h3>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {plan.weekly_objectives.map((obj, idx) => (
                <li key={idx} style={{ marginBottom: 8 }}>
                  {obj}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div style={{ marginBottom: 20 }}>
          <h3 style={{ marginBottom: 12 }}>Daily Plans</h3>
          <div style={{ display: 'grid', gap: 16 }}>
            {DAYS.map((day) => {
              const dayPlan = plan.daily_plans[day];
              const dayName = day.charAt(0).toUpperCase() + day.slice(1);
              return (
                <div key={day} className="card" style={{ padding: 16 }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: 16 }}>{dayName}</h4>
                  {dayPlan.learning_objectives.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <strong style={{ fontSize: 14 }}>Learning Objectives:</strong>
                      <ul style={{ margin: '4px 0 0 0', paddingLeft: 20 }}>
                        {dayPlan.learning_objectives.map((obj, idx) => (
                          <li key={idx} style={{ fontSize: 14 }}>{obj}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {dayPlan.activities.length > 0 && (
                    <div>
                      <strong style={{ fontSize: 14 }}>Activities:</strong>
                      <ul style={{ margin: '4px 0 0 0', paddingLeft: 20 }}>
                        {dayPlan.activities.map((activity, idx) => (
                          <li key={idx} style={{ fontSize: 14 }}>{activity}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {plan.materials_list.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ marginBottom: 12 }}>Materials Needed</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {plan.materials_list.map((material, idx) => (
                <span key={idx} className="badge" style={{ background: 'var(--muted)', color: 'white' }}>
                  {material}
                </span>
              ))}
            </div>
          </div>
        )}

        {plan.status === 'submitted' && onApprove && onReject && (
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 24 }}>
            <button className="btn btnSecondary" onClick={() => onReject(plan.id)}>
              <XCircle size={18} style={{ marginRight: 8 }} />
              Request Revisions
            </button>
            <button className="btn btnPrimary" onClick={() => onApprove(plan.id)}>
              <CheckCircle size={18} style={{ marginRight: 8 }} />
              Approve Plan
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
