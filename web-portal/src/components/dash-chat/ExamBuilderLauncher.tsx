'use client';

import { useState } from 'react';
import { FileText, Sparkles, X } from 'lucide-react';
import { ConversationalExamBuilder } from '../dashboard/exam-prep/ConversationalExamBuilder';

interface ExamBuilderLauncherProps {
  /** Optional: Pre-fill grade from chat context */
  suggestedGrade?: string;
  /** Optional: Pre-fill subject from chat context */
  suggestedSubject?: string;
  /** Optional: Pre-fill topics from chat context */
  suggestedTopics?: string[];
  /** Optional: Callback when user closes the launcher */
  onClose?: () => void;
}

/**
 * Component that provides a button to launch the Conversational Exam Builder
 * Can be embedded in ChatInterface to allow seamless transition from chat to exam building
 */
export function ExamBuilderLauncher({ 
  suggestedGrade, 
  suggestedSubject,
  suggestedTopics,
  onClose
}: ExamBuilderLauncherProps) {
  const [showBuilder, setShowBuilder] = useState(false);
  const [selectedGrade, setSelectedGrade] = useState(suggestedGrade || '');
  const [selectedSubject, setSelectedSubject] = useState(suggestedSubject || '');
  const [selectedLanguage, setSelectedLanguage] = useState('English');
  const [showGradeSelector, setShowGradeSelector] = useState(!suggestedGrade || !suggestedSubject);

  const handleLaunch = () => {
    if (selectedGrade && selectedSubject) {
      setShowBuilder(true);
    } else {
      setShowGradeSelector(true);
    }
  };

  const handleClose = () => {
    setShowBuilder(false);
    setShowGradeSelector(false);
    onClose?.(); // Call parent's onClose if provided
  };

  const handleSaveExam = (examData: any) => {
    console.log('[ExamBuilderLauncher] Exam saved:', examData);
    // TODO: Save to database or download
    setShowBuilder(false);
  };

  if (showBuilder && selectedGrade && selectedSubject) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'var(--background)',
        zIndex: 9999,
        overflow: 'hidden',
      }}>
        <ConversationalExamBuilder
          grade={selectedGrade}
          subject={selectedSubject}
          language={selectedLanguage}
          onClose={handleClose}
          onSave={handleSaveExam}
        />
      </div>
    );
  }

  if (showGradeSelector) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.7)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}>
        <div style={{
          background: 'var(--surface)',
          borderRadius: '16px',
          padding: '32px',
          maxWidth: '500px',
          width: '100%',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 600 }}>
              <Sparkles className="icon20" style={{ display: 'inline', marginRight: '8px', color: 'var(--primary)' }} />
              Build Full Exam (Printable)
            </h2>
            <button onClick={handleClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
              <X size={24} color="var(--muted)" />
            </button>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontWeight: 500, marginBottom: '8px', fontSize: '14px' }}>
              Grade Level
            </label>
            <select
              value={selectedGrade}
              onChange={(e) => setSelectedGrade(e.target.value)}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: '2px solid var(--border)',
                background: 'var(--surface-2)',
                fontSize: '14px',
                color: 'var(--text)',
              }}
            >
              <option value="">Select Grade</option>
              <option value="grade_4">Grade 4</option>
              <option value="grade_5">Grade 5</option>
              <option value="grade_6">Grade 6</option>
              <option value="grade_7">Grade 7</option>
              <option value="grade_8">Grade 8</option>
              <option value="grade_9">Grade 9</option>
              <option value="grade_10">Grade 10</option>
              <option value="grade_11">Grade 11</option>
              <option value="grade_12">Grade 12</option>
            </select>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontWeight: 500, marginBottom: '8px', fontSize: '14px' }}>
              Language
            </label>
            <select
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: '2px solid var(--border)',
                background: 'var(--surface-2)',
                fontSize: '14px',
                color: 'var(--text)',
              }}
            >
              <option value="English">English</option>
              <option value="Afrikaans">Afrikaans</option>
              <option value="isiZulu">isiZulu</option>
              <option value="isiXhosa">isiXhosa</option>
              <option value="Sesotho">Sesotho</option>
              <option value="Setswana">Setswana</option>
              <option value="Sepedi">Sepedi</option>
              <option value="Xitsonga">Xitsonga</option>
              <option value="siSwati">siSwati</option>
              <option value="Tshivenda">Tshivenda</option>
              <option value="isiNdebele">isiNdebele</option>
            </select>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontWeight: 500, marginBottom: '8px', fontSize: '14px' }}>
              Subject
            </label>
            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: '2px solid var(--border)',
                background: 'var(--surface-2)',
                fontSize: '14px',
                color: 'var(--text)',
              }}
            >
              <option value="">Select Subject</option>
              <option value="Mathematics">Mathematics</option>
              <option value="English Home Language">English Home Language</option>
              <option value="English First Additional Language">English First Additional Language</option>
              <option value="Physical Sciences">Physical Sciences</option>
              <option value="Life Sciences">Life Sciences</option>
              <option value="Geography">Geography</option>
              <option value="History">History</option>
              <option value="Accounting">Accounting</option>
              <option value="Business Studies">Business Studies</option>
              <option value="Economics">Economics</option>
              <option value="Life Orientation">Life Orientation</option>
            </select>
          </div>

          {suggestedTopics && suggestedTopics.length > 0 && (
            <div style={{ 
              marginBottom: '24px', 
              padding: '12px', 
              background: 'var(--surface-2)', 
              borderRadius: '8px',
              border: '1px solid var(--border)',
            }}>
              <p style={{ fontSize: '13px', color: 'var(--muted)', margin: '0 0 8px 0' }}>
                Suggested topics from your conversation:
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {suggestedTopics.map((topic, i) => (
                  <span key={i} style={{
                    padding: '4px 10px',
                    background: 'var(--primary)',
                    color: 'white',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontWeight: 500,
                  }}>
                    {topic}
                  </span>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={handleLaunch}
            disabled={!selectedGrade || !selectedSubject}
            className="btn btnPrimary"
            style={{
              width: '100%',
              padding: '14px',
              fontSize: '16px',
              fontWeight: 600,
              opacity: (!selectedGrade || !selectedSubject) ? 0.5 : 1,
              cursor: (!selectedGrade || !selectedSubject) ? 'not-allowed' : 'pointer',
            }}
          >
            <Sparkles className="icon16" style={{ marginRight: '8px' }} />
            Generate Formal Test Paper
          </button>
        </div>
      </div>
    );
  }

  // Default: Show launch button
  return (
    <button
      onClick={handleLaunch}
      className="btn"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        padding: '10px 16px',
        background: 'linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)',
        color: 'white',
        border: 'none',
        borderRadius: '8px',
        fontSize: '14px',
        fontWeight: 600,
        cursor: 'pointer',
        boxShadow: '0 4px 12px rgba(124, 58, 237, 0.3)',
        transition: 'all 0.2s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = '0 6px 16px rgba(124, 58, 237, 0.4)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(124, 58, 237, 0.3)';
      }}
    >
      <FileText size={16} />
      Build Full Exam (Printable)
    </button>
  );
}
