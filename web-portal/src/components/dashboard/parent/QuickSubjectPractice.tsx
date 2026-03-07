'use client';

import { useRouter } from 'next/navigation';

const PRIORITY_SUBJECTS = [
  { name: 'Mathematics', emoji: '🔢', color: '#3b82f6', grade: 'all' },
  { name: 'Physical Sciences', emoji: '⚗️', color: '#10b981', grade: '10-12' },
  { name: 'Life Sciences', emoji: '🧬', color: '#22c55e', grade: '10-12' },
  { name: 'English', emoji: '📖', color: '#8b5cf6', grade: 'all' },
  { name: 'Afrikaans', emoji: '🗣️', color: '#f59e0b', grade: 'all' },
  { name: 'Natural Sciences', emoji: '🔬', color: '#06b6d4', grade: '7-9' },
];

interface QuickSubjectPracticeProps {
  childAge?: number;
  onSelectSubject: (subject: string) => void;
}

export function QuickSubjectPractice({ childAge = 10, onSelectSubject }: QuickSubjectPracticeProps) {
  // Filter subjects based on child's age/grade
  const relevantSubjects = PRIORITY_SUBJECTS.filter(subject => {
    if (subject.grade === 'all') return true;
    if (subject.grade === '10-12') return childAge >= 15;
    if (subject.grade === '7-9') return childAge >= 12 && childAge < 15;
    return true;
  });

  return (
    <div className="section">
      <div className="sectionTitle">
        <span style={{ fontSize: 16 }}>🎯</span>
        Quick Practice
      </div>
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', 
        gap: 12 
      }}>
        {relevantSubjects.map(subject => (
          <button
            key={subject.name}
            onClick={() => onSelectSubject(subject.name)}
            className="card"
            style={{
              padding: 16,
              cursor: 'pointer',
              border: `2px solid ${subject.color}`,
              textAlign: 'center',
              background: `${subject.color}15`,
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = `0 4px 12px ${subject.color}40`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 8 }}>{subject.emoji}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
              {subject.name}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
