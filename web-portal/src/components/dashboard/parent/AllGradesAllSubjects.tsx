'use client';

import { 
  BookOpen, 
  GraduationCap, 
  Languages, 
  Calculator, 
  Heart, 
  Microscope, 
  Globe, 
  Cpu, 
  Briefcase, 
  Users, 
  Palette, 
  DollarSign, 
  TrendingUp, 
  MapPin, 
  Clock, 
  Monitor,
  Sparkles,
  ChevronRight
} from 'lucide-react';
import { useState } from 'react';

// Complete CAPS Subject Coverage
const CAPS_SUBJECTS = {
  'Foundation Phase (Grade R-3)': [
    { name: 'Home Language', icon: Languages, grades: 'R-3', color: '#3b82f6' },
    { name: 'First Additional Language', icon: BookOpen, grades: '1-3', color: '#8b5cf6' },
    { name: 'Mathematics', icon: Calculator, grades: 'R-3', color: '#10b981' },
    { name: 'Life Skills', icon: Heart, grades: 'R-3', color: '#ec4899' },
  ],
  'Intermediate Phase (Grade 4-6)': [
    { name: 'Home Language', icon: Languages, grades: '4-6', color: '#3b82f6' },
    { name: 'First Additional Language', icon: BookOpen, grades: '4-6', color: '#8b5cf6' },
    { name: 'Mathematics', icon: Calculator, grades: '4-6', color: '#10b981' },
    { name: 'Natural Sciences & Technology', icon: Microscope, grades: '4-6', color: '#f59e0b' },
    { name: 'Social Sciences', icon: Globe, grades: '4-6', color: '#06b6d4' },
  ],
  'Senior Phase (Grade 7-9)': [
    { name: 'Home Language', icon: Languages, grades: '7-9', color: '#3b82f6' },
    { name: 'First Additional Language', icon: BookOpen, grades: '7-9', color: '#8b5cf6' },
    { name: 'Mathematics', icon: Calculator, grades: '7-9', color: '#10b981' },
    { name: 'Natural Sciences', icon: Microscope, grades: '7-9', color: '#f59e0b' },
    { name: 'Social Sciences', icon: Globe, grades: '7-9', color: '#06b6d4' },
    { name: 'Technology', icon: Cpu, grades: '7-9', color: '#6366f1' },
    { name: 'Economic & Management Sciences', icon: Briefcase, grades: '7-9', color: '#14b8a6' },
    { name: 'Life Orientation', icon: Heart, grades: '7-9', color: '#ec4899' },
    { name: 'Creative Arts', icon: Palette, grades: '7-9', color: '#f97316' },
  ],
  'FET Phase (Grade 10-12)': [
    { name: 'Home Language', icon: Languages, grades: '10-12', color: '#3b82f6' },
    { name: 'First Additional Language', icon: BookOpen, grades: '10-12', color: '#8b5cf6' },
    { name: 'Mathematics', icon: Calculator, grades: '10-12', color: '#10b981' },
    { name: 'Mathematical Literacy', icon: TrendingUp, grades: '10-12', color: '#22c55e' },
    { name: 'Physical Sciences', icon: Microscope, grades: '10-12', color: '#f59e0b' },
    { name: 'Life Sciences', icon: Heart, grades: '10-12', color: '#ec4899' },
    { name: 'Accounting', icon: DollarSign, grades: '10-12', color: '#14b8a6' },
    { name: 'Business Studies', icon: Briefcase, grades: '10-12', color: '#0891b2' },
    { name: 'Economics', icon: TrendingUp, grades: '10-12', color: '#059669' },
    { name: 'Geography', icon: MapPin, grades: '10-12', color: '#06b6d4' },
    { name: 'History', icon: Clock, grades: '10-12', color: '#a855f7' },
    { name: 'Life Orientation', icon: Users, grades: '10-12', color: '#ec4899' },
    { name: 'Information Technology', icon: Cpu, grades: '10-12', color: '#6366f1' },
    { name: 'Computer Applications Technology', icon: Monitor, grades: '10-12', color: '#4f46e5' },
  ],
};

interface AllGradesAllSubjectsProps {
  onSelectSubject: (subject: string, grade: string) => void;
}

export function AllGradesAllSubjects({ onSelectSubject }: AllGradesAllSubjectsProps) {
  const [expandedPhases, setExpandedPhases] = useState<Record<string, boolean>>({
    'FET Phase (Grade 10-12)': true, // Exam-critical phase expanded by default
  });

  const togglePhase = (phase: string) => {
    setExpandedPhases(prev => ({ ...prev, [phase]: !prev[phase] }));
  };

  return (
    <div className="section">
      <div className="sectionTitle">
        <GraduationCap className="icon16" style={{ color: '#8b5cf6' }} />
        Full CAPS Coverage - All Grades & Subjects
      </div>

      <div style={{
        marginBottom: 20,
        padding: 16,
        background: 'rgba(139, 92, 246, 0.1)',
        border: '2px solid #8b5cf6',
        borderRadius: 12
      }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sparkles size={18} style={{ color: '#8b5cf6' }} />
          Complete CAPS Curriculum Support
        </div>
        <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
          Click any subject below to get instant AI help, practice tests, revision notes, and exam prep materials aligned with the South African CAPS curriculum.
        </div>
      </div>

      {Object.entries(CAPS_SUBJECTS).map(([phase, subjects]) => (
        <div key={phase} style={{ marginBottom: 16 }}>
          {/* Collapsible Phase Header */}
          <button
            onClick={() => togglePhase(phase)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              background: 'var(--surface-1)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              cursor: 'pointer',
              transition: 'all 0.2s',
              marginBottom: expandedPhases[phase] ? 12 : 0
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(139, 92, 246, 0.05)';
              e.currentTarget.style.borderColor = '#8b5cf6';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--surface-1)';
              e.currentTarget.style.borderColor = 'var(--border)';
            }}
          >
            <div style={{
              fontWeight: 700,
              fontSize: 14,
              color: 'var(--text)',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}>
              <ChevronRight 
                size={16} 
                style={{ 
                  transform: expandedPhases[phase] ? 'rotate(90deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s',
                  color: '#8b5cf6'
                }} 
              />
              {phase}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              {subjects.length} subjects
            </div>
          </button>

          {/* Collapsible Subject Grid */}
          {expandedPhases[phase] && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: 10
            }}>
              {subjects.map(subject => (
                <button
                  key={`${phase}-${subject.name}`}
                  onClick={() => onSelectSubject(subject.name, subject.grades)}
                  className="card"
                  style={{
                    padding: '12px 14px',
                    cursor: 'pointer',
                    border: '1px solid var(--border)',
                    background: 'var(--card-bg)',
                    textAlign: 'left',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#8b5cf6';
                    e.currentTarget.style.background = 'rgba(139, 92, 246, 0.05)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border)';
                    e.currentTarget.style.background = 'var(--card-bg)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  {/* Render icon component */}
                  <subject.icon 
                    size={20} 
                    style={{ color: subject.color, flexShrink: 0 }} 
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2, color: 'var(--text)' }}>
                      {subject.name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                      Grades {subject.grades}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Bottom CTA */}
      <div style={{
        marginTop: 24,
        padding: 16,
        background: 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)',
        color: 'white',
        borderRadius: 12,
        textAlign: 'center',
        boxShadow: '0 4px 20px rgba(236, 72, 153, 0.3)'
      }}>
        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Sparkles size={18} />
          Can't Find Your Subject?
        </div>
        <div style={{ fontSize: 13, opacity: 0.95 }}>
          Use Emergency Exam Help above - Our AI tutor supports ALL subjects in ALL 11 official languages!
        </div>
      </div>
    </div>
  );
}
