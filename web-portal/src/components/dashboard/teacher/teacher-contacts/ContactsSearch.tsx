'use client';

/**
 * Contact Search Input Component
 * Extracted from TeacherContactsWidget.tsx
 */

import { Search } from 'lucide-react';

interface ContactsSearchProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
}

export function ContactsSearch({ searchQuery, onSearchChange }: ContactsSearchProps) {
  return (
    <div style={{ position: 'relative', marginBottom: 24 }}>
      <Search className="searchIcon icon16" style={{
        position: 'absolute',
        left: 18,
        top: '50%',
        transform: 'translateY(-50%)',
        color: 'rgba(255, 255, 255, 0.4)',
        pointerEvents: 'none',
        zIndex: 2
      }} />
      <input
        type="text"
        placeholder="Search contacts..."
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        style={{
          width: '100%',
          height: '48px',
          padding: '0 20px 0 50px',
          background: 'rgba(255, 255, 255, 0.08)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '24px',
          fontSize: '15px',
          fontWeight: 400,
          color: 'var(--text-primary)',
          outline: 'none',
          transition: 'all 0.3s ease',
          backdropFilter: 'blur(10px)'
        }}
        onFocus={(e) => {
          e.target.style.background = 'rgba(255, 255, 255, 0.12)';
          e.target.style.borderColor = 'rgba(59, 130, 246, 0.5)';
          e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)';
        }}
        onBlur={(e) => {
          e.target.style.background = 'rgba(255, 255, 255, 0.08)';
          e.target.style.borderColor = 'rgba(255, 255, 255, 0.12)';
          e.target.style.boxShadow = 'none';
        }}
      />
    </div>
  );
}
