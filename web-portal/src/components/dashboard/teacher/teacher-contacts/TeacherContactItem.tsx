'use client';

/**
 * Teacher Contact List Item Component
 * Extracted from TeacherContactsWidget.tsx
 */

import type { Teacher } from './types';

interface TeacherContactItemProps {
  teacher: Teacher;
  isLast: boolean;
  onStartConversation: (teacherId: string, role: string) => void;
}

export function TeacherContactItem({ teacher, isLast, onStartConversation }: TeacherContactItemProps) {
  const isPrincipal = teacher.role === 'principal';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '16px 20px',
        background: 'transparent',
        borderBottom: isLast ? 'none' : '1px solid rgba(255, 255, 255, 0.06)',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        position: 'relative',
        justifyContent: 'space-between'
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      onClick={() => onStartConversation(teacher.id, teacher.role)}
    >
      <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
        <div 
          style={{ 
            marginRight: 12,
            width: '42px',
            height: '42px',
            borderRadius: '50%',
            fontSize: '16px',
            fontWeight: '600',
            background: isPrincipal 
              ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
              : 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            flexShrink: 0,
            boxShadow: isPrincipal 
              ? '0 4px 12px rgba(245, 158, 11, 0.25)'
              : '0 4px 12px rgba(139, 92, 246, 0.25)',
            border: '2px solid rgba(255, 255, 255, 0.1)'
          }}
        >
          {teacher.first_name[0]}{teacher.last_name[0]}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ marginBottom: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <span style={{ 
                fontWeight: 600, 
                fontSize: 16, 
                color: 'var(--text-primary)',
                lineHeight: 1.2,
                letterSpacing: '-0.01em'
              }}>
                {teacher.first_name} {teacher.last_name}
              </span>
              <span style={{
                fontSize: 10,
                padding: '3px 6px',
                borderRadius: 5,
                background: isPrincipal 
                  ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' 
                  : 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                color: 'white',
                textTransform: 'capitalize',
                fontWeight: 700,
                flexShrink: 0,
                boxShadow: '0 1px 4px rgba(0, 0, 0, 0.2)'
              }}>
                {teacher.role}
              </span>
            </div>
          </div>
          <div style={{ 
            fontSize: 14, 
            color: 'rgba(255, 255, 255, 0.6)', 
            lineHeight: 1.4,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            fontWeight: 400
          }}>
            {teacher.classes.length > 0 ? `Classes: ${teacher.classes.join(', ')}` : teacher.email}
          </div>
        </div>
      </div>
    </div>
  );
}
