'use client';

import { useTranslation } from 'react-i18next';

interface DashboardHeaderProps {
  userName: string;
  greeting: string;
}

export function DashboardHeader({ userName, greeting }: DashboardHeaderProps) {
  const { t } = useTranslation();

  return (
    <div style={{ marginBottom: 24 }}>
      <h1 className="h1" style={{ marginBottom: 8 }}>
        {greeting}, {userName}!
      </h1>
      <p className="muted">
        {t('dashboard.parent.welcome_subtitle', { defaultValue: 'Welcome to your parent dashboard' })}
      </p>
    </div>
  );
}
