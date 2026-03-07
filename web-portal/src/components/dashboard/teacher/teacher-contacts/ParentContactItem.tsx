'use client';

/**
 * Parent Contact List Item Component
 * Extracted from TeacherContactsWidget.tsx
 */

import type { Parent } from './types';

interface ParentContactItemProps {
  parent: Parent;
  isLast: boolean;
  onStartConversation: (parentId: string) => void;
}

export function ParentContactItem({ parent, isLast, onStartConversation }: ParentContactItemProps) {
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
      onClick={() => onStartConversation(parent.id)}
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
            background: 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            flexShrink: 0,
            boxShadow: '0 4px 12px rgba(37, 211, 102, 0.25)',
            border: '2px solid rgba(255, 255, 255, 0.1)'
          }}
        >
          {parent.first_name[0]}{parent.last_name[0]}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ marginBottom: 4 }}>
            <span style={{ 
              fontWeight: 600, 
              fontSize: 16, 
              color: 'var(--text-primary)',
              lineHeight: 1.2,
              letterSpacing: '-0.01em',
              display: 'block'
            }}>
              {parent.first_name} {parent.last_name}
            </span>
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
            Children: {parent.students.map(s => `${s.first_name} ${s.last_name}`).join(', ')}
          </div>
        </div>
      </div>
    </div>
  );
}
