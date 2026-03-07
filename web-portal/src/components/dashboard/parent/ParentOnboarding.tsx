'use client';

import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { School, UserPlus, ArrowRight } from 'lucide-react';

interface ParentOnboardingProps {
  userName?: string;
}

export function ParentOnboarding({ userName }: ParentOnboardingProps) {
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <div className="section">
      <div className="card" style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        padding: 'var(--space-6)',
        textAlign: 'center'
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>👋</div>
        <h2 style={{ margin: 0, marginBottom: 8, fontSize: 24, fontWeight: 700 }}>
          {t('dashboard.parent.onboarding.welcome', { defaultValue: 'Welcome to Young Eagles, {{name}}!', name: userName || t('roles.parent', { defaultValue: 'Parent' }) })}
        </h2>
        <p style={{ margin: 0, marginBottom: 24, fontSize: 16, opacity: 0.9 }}>
          {t('dashboard.parent.onboarding.subtitle', { defaultValue: "To get started, you need to link your account to your child's school." })}
        </p>

        <div style={{
          display: 'grid',
          gap: 16,
          maxWidth: 600,
          margin: '0 auto'
        }}>
          <div style={{
            background: 'rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(10px)',
            borderRadius: 12,
            padding: 16,
            textAlign: 'left'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <div style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
                fontWeight: 700
              }}>1</div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
                {t('dashboard.parent.onboarding.steps.find_school.title', { defaultValue: "Find Your Child's School" })}
              </h3>
            </div>
            <p style={{ margin: 0, fontSize: 14, opacity: 0.9, paddingLeft: 44 }}>
              {t('dashboard.parent.onboarding.steps.find_school.description', { defaultValue: 'Search for your child who is already registered at their preschool' })}
            </p>
          </div>

          <div style={{
            background: 'rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(10px)',
            borderRadius: 12,
            padding: 16,
            textAlign: 'left'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <div style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
                fontWeight: 700
              }}>2</div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
                {t('dashboard.parent.onboarding.steps.send_request.title', { defaultValue: 'Send Link Request' })}
              </h3>
            </div>
            <p style={{ margin: 0, fontSize: 14, opacity: 0.9, paddingLeft: 44 }}>
              {t('dashboard.parent.onboarding.steps.send_request.description', { defaultValue: 'The school will review and approve your parent-child link request' })}
            </p>
          </div>

          <div style={{
            background: 'rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(10px)',
            borderRadius: 12,
            padding: 16,
            textAlign: 'left'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <div style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
                fontWeight: 700
              }}>3</div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
                {t('dashboard.parent.onboarding.steps.access_dashboard.title', { defaultValue: 'Access Dashboard' })}
              </h3>
            </div>
            <p style={{ margin: 0, fontSize: 14, opacity: 0.9, paddingLeft: 44 }}>
              {t('dashboard.parent.onboarding.steps.access_dashboard.description', { defaultValue: "Once approved, view homework, messages, and your child's progress" })}
            </p>
          </div>
        </div>

        <div style={{
          display: 'flex',
          gap: 12,
          justifyContent: 'center',
          marginTop: 32,
          flexWrap: 'wrap'
        }}>
          <button
            className="btn"
            style={{
              background: 'white',
              color: '#667eea',
              padding: '12px 24px',
              fontSize: 16,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              border: 'none'
            }}
            onClick={() => router.push('/dashboard/parent/claim-child')}
          >
            <School className="icon20" />
            {t('dashboard.parent.onboarding.actions.link_child', { defaultValue: 'Link My Child' })}
            <ArrowRight className="icon16" />
          </button>

          <button
            className="btn"
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              color: 'white',
              padding: '12px 24px',
              fontSize: 16,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              border: '2px solid rgba(255, 255, 255, 0.3)',
              backdropFilter: 'blur(10px)'
            }}
            onClick={() => router.push('/dashboard/parent/register-child')}
          >
            <UserPlus className="icon20" />
            {t('dashboard.parent.onboarding.actions.register_child', { defaultValue: 'Register New Child' })}
          </button>
        </div>

        <div style={{
          marginTop: 24,
          padding: 16,
          borderRadius: 8,
          background: 'rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(10px)',
          fontSize: 13
        }}>
          <strong>{t('dashboard.parent.onboarding.tip_title', { defaultValue: '💡 Tip:' })}</strong>{' '}
          {t('dashboard.parent.onboarding.tip_body', { defaultValue: 'If your child is already enrolled at a preschool using Young Eagles, use "Link My Child". If registering for the first time, use "Register New Child".' })}
        </div>
      </div>
    </div>
  );
}
