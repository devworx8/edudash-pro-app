'use client';

/**
 * Empty Contacts State Component
 * Extracted from TeacherContactsWidget.tsx
 */

import { User, GraduationCap } from 'lucide-react';

interface EmptyContactsStateProps {
  type: 'parents' | 'teachers';
  hasSearchQuery: boolean;
}

export function EmptyContactsState({ type, hasSearchQuery }: EmptyContactsStateProps) {
  const Icon = type === 'parents' ? User : GraduationCap;
  const title = hasSearchQuery ? 'No matches found' : type === 'parents' ? 'No parent contacts' : 'No other teachers';
  const message = hasSearchQuery 
    ? 'Try adjusting your search terms.'
    : type === 'parents'
      ? 'Parent contacts will appear here when students are enrolled in your classes.'
      : 'Other teachers and staff members will appear here.';

  return (
    <div style={{ padding: '60px 40px', textAlign: 'center' }}>
      <div style={{
        width: '80px',
        height: '80px',
        borderRadius: '40px',
        background: 'var(--surface-1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto 20px',
        border: '1px solid var(--border)'
      }}>
        <Icon size={32} style={{ color: 'var(--muted)' }} />
      </div>
      <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 600, color: 'var(--text-secondary)' }}>
        {title}
      </h3>
      <p style={{ color: 'var(--muted)', fontSize: '14px', margin: 0 }}>
        {message}
      </p>
    </div>
  );
}
