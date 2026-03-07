'use client';

/**
 * Contacts Tab Navigation Component
 * Extracted from TeacherContactsWidget.tsx
 */

import { User, GraduationCap } from 'lucide-react';

interface ContactsTabsProps {
  activeTab: 'parents' | 'teachers';
  onTabChange: (tab: 'parents' | 'teachers') => void;
  parentCount: number;
  teacherCount: number;
}

export function ContactsTabs({ activeTab, onTabChange, parentCount, teacherCount }: ContactsTabsProps) {
  const getTabStyle = (isActive: boolean) => ({
    flex: 1,
    padding: '14px 20px',
    border: 'none',
    background: isActive ? 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)' : 'transparent',
    color: isActive ? 'white' : 'rgba(255, 255, 255, 0.7)',
    borderRadius: '12px',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 14,
    transition: 'all 0.3s ease',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    boxShadow: isActive ? '0 4px 12px rgba(59, 130, 246, 0.3)' : 'none'
  });

  return (
    <div style={{ 
      display: 'flex', 
      background: 'rgba(255, 255, 255, 0.06)', 
      borderRadius: '16px', 
      padding: '4px',
      marginBottom: 0,
      border: '1px solid rgba(255, 255, 255, 0.08)',
      backdropFilter: 'blur(10px)'
    }}>
      <button onClick={() => onTabChange('parents')} style={getTabStyle(activeTab === 'parents')}>
        <User size={16} />
        Parents ({parentCount})
      </button>
      <button onClick={() => onTabChange('teachers')} style={getTabStyle(activeTab === 'teachers')}>
        <GraduationCap size={16} />
        Teachers ({teacherCount})
      </button>
    </div>
  );
}
