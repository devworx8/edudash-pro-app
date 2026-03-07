'use client';

/**
 * Teacher Contacts Widget - Refactored
 * Main container component for teacher contacts
 * Original: 700 lines → Refactored: ~180 lines
 */

import { useState, useMemo } from 'react';
import { useTeacherContacts } from '@/lib/hooks/teacher/useTeacherContacts';
import { useContactConversation } from '@/lib/hooks/teacher/useContactConversation';
import { ContactsSearch } from './ContactsSearch';
import { ContactsTabs } from './ContactsTabs';
import { EmptyContactsState } from './EmptyContactsState';
import { ParentContactItem } from './ParentContactItem';
import { TeacherContactItem } from './TeacherContactItem';
import type { TeacherContactsWidgetProps } from './types';

export function TeacherContactsWidget({ preschoolId, teacherId }: TeacherContactsWidgetProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'parents' | 'teachers'>('parents');
  
  const { parents, teachers, loading, error, refetch } = useTeacherContacts(preschoolId, teacherId);
  const { startConversation } = useContactConversation(preschoolId, teacherId);

  // Filter contacts based on search query
  const filteredParents = useMemo(() => parents.filter(parent =>
    `${parent.first_name} ${parent.last_name}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
    parent.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    parent.students.some(student => 
      `${student.first_name} ${student.last_name}`.toLowerCase().includes(searchQuery.toLowerCase())
    )
  ), [parents, searchQuery]);

  const filteredTeachers = useMemo(() => teachers.filter(teacher =>
    `${teacher.first_name} ${teacher.last_name}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
    teacher.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    teacher.classes.some(className => className.toLowerCase().includes(searchQuery.toLowerCase()))
  ), [teachers, searchQuery]);

  if (loading) {
    return (
      <div className="card" style={{ padding: 24 }}>
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div className="spinner" style={{ margin: '0 auto 16px' }}></div>
          <p style={{ color: 'var(--muted)' }}>Loading contacts...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card" style={{ padding: 24 }}>
        <div style={{ textAlign: 'center', padding: 40 }}>
          <p style={{ color: 'var(--danger)', marginBottom: 16 }}>Error: {error}</p>
          <button onClick={refetch} className="btn btnPrimary">Try Again</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      maxWidth: '800px',
      margin: '0 auto',
      background: 'rgba(30, 41, 59, 0.4)',
      borderRadius: '20px',
      overflow: 'hidden',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)',
      backdropFilter: 'blur(20px)'
    }}>
      {/* Header */}
      <div style={{
        padding: '20px 28px',
        background: 'rgba(30, 41, 59, 0.8)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
          Contacts
        </h2>
        <span style={{ fontSize: 13, color: 'rgba(255, 255, 255, 0.5)', fontWeight: 500 }}>
          {filteredParents.length + filteredTeachers.length} contacts
        </span>
      </div>

      {/* Search and Tabs */}
      <div style={{ 
        padding: '24px 28px', 
        background: 'rgba(30, 41, 59, 0.6)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
      }}>
        <ContactsSearch searchQuery={searchQuery} onSearchChange={setSearchQuery} />
        <ContactsTabs 
          activeTab={activeTab} 
          onTabChange={setActiveTab}
          parentCount={filteredParents.length}
          teacherCount={filteredTeachers.length}
        />
      </div>

      {/* Content */}
      <div style={{ 
        background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.4) 0%, rgba(30, 41, 59, 0.2) 100%)',
        minHeight: '400px'
      }}>
        {activeTab === 'parents' && (
          filteredParents.length === 0 
            ? <EmptyContactsState type="parents" hasSearchQuery={!!searchQuery} />
            : <div>
                {filteredParents.map((parent, index) => (
                  <ParentContactItem
                    key={parent.id}
                    parent={parent}
                    isLast={index === filteredParents.length - 1}
                    onStartConversation={(id) => startConversation(id, 'parent')}
                  />
                ))}
              </div>
        )}

        {activeTab === 'teachers' && (
          filteredTeachers.length === 0 
            ? <EmptyContactsState type="teachers" hasSearchQuery={!!searchQuery} />
            : <div>
                {filteredTeachers.map((teacher, index) => (
                  <TeacherContactItem
                    key={teacher.id}
                    teacher={teacher}
                    isLast={index === filteredTeachers.length - 1}
                    onStartConversation={startConversation}
                  />
                ))}
              </div>
        )}
      </div>
    </div>
  );
}
