'use client';

/**
 * Parent Contact Card Component
 * Extracted from ParentContactsWidget.tsx
 */

import { MessageCircle, Mail, Phone, User } from 'lucide-react';
import type { Parent, Student } from './types';

interface ParentContactCardProps {
  parent: Parent;
  onMessageStudent: (parent: Parent, student: Student) => void;
}

export function ParentContactCard({ parent, onMessageStudent }: ParentContactCardProps) {
  return (
    <div
      style={{
        padding: 16,
        borderRadius: 12,
        border: '1px solid var(--border)',
        marginBottom: 12,
        background: 'var(--surface-1)',
        transition: 'all 0.2s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--surface-2)';
        e.currentTarget.style.borderColor = 'var(--primary-subtle)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'var(--surface-1)';
        e.currentTarget.style.borderColor = 'var(--border)';
      }}
    >
      {/* Parent Info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 20,
          background: 'var(--primary-subtle)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <User size={20} color="var(--primary)" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h4 style={{ margin: 0, fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {parent.first_name} {parent.last_name}
          </h4>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Mail size={12} />{parent.email}
            </span>
            {parent.phone && (
              <span style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Phone size={12} />{parent.phone}
              </span>
            )}
          </div>
        </div>
      </div>
      
      {/* Students */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6, fontWeight: 500 }}>
          Children ({parent.students.length}):
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {parent.students.map((student) => (
            <span key={student.id} style={{
              fontSize: 12, padding: '4px 10px', borderRadius: 12,
              background: 'var(--primary-subtle)', color: 'var(--primary)', fontWeight: 500,
            }}>
              {student.first_name} {student.last_name}
            </span>
          ))}
        </div>
      </div>
      
      {/* Actions */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
        {parent.students.map((student) => (
          <button
            key={student.id}
            className="btn btnSecondary"
            style={{ fontSize: 13, padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            onClick={() => onMessageStudent(parent, student)}
          >
            <MessageCircle size={14} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {student.first_name}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
