'use client';

import { Calendar, Clock, BookOpen, AlertCircle, Timer, GraduationCap } from 'lucide-react';

interface ExamPeriod {
  grade: string;
  subject: string;
  date: string;
  time: string;
  duration: string;
  status: 'upcoming' | 'today' | 'completed';
}

// ⚠️ OFFICIAL DBE EXAM DATES - Updated from education.gov.za
// Source: https://www.education.gov.za/Curriculum/NationalSeniorCertificate(NSC)Examinations.aspx
const getExamStatus = (examDate: string): 'upcoming' | 'today' | 'completed' => {
  const examYear = new Date().getFullYear();
  const examDateObj = new Date(`${examDate} ${examYear}`);
  const todayObj = new Date();
  
  // Normalize to start of day
  examDateObj.setHours(0, 0, 0, 0);
  todayObj.setHours(0, 0, 0, 0);
  
  if (examDateObj.getTime() === todayObj.getTime()) return 'today';
  if (examDateObj < todayObj) return 'completed';
  return 'upcoming';
};

// South African CAPS Exam Schedule (Oct/Nov 2025 - OFFICIAL DBE DATES)
const EXAM_SCHEDULE: ExamPeriod[] = [
  // Grade 12 Finals (NSC 2025)
  { grade: 'Grade 12', subject: 'Computer Applications Technology P1', date: 'Oct 28', time: '09:00', duration: '3h', status: getExamStatus('Oct 28') },
  { grade: 'Grade 12', subject: 'Computer Applications Technology P2', date: 'Oct 28', time: '14:00', duration: '3h', status: getExamStatus('Oct 28') },
  { grade: 'Grade 12', subject: 'English Home Language P1', date: 'Oct 31', time: '09:00', duration: '3h', status: getExamStatus('Oct 31') },
  { grade: 'Grade 12', subject: 'Afrikaans Home Language P1', date: 'Oct 31', time: '09:00', duration: '3h', status: getExamStatus('Oct 31') },
  { grade: 'Grade 12', subject: 'English Home Language P2', date: 'Nov 6', time: '14:00', duration: '2.5h', status: getExamStatus('Nov 6') },
  { grade: 'Grade 12', subject: 'Afrikaans Home Language P2', date: 'Nov 6', time: '14:00', duration: '2.5h', status: getExamStatus('Nov 6') },
  { grade: 'Grade 12', subject: 'Mathematics P1', date: 'Nov 7', time: '09:00', duration: '3h', status: getExamStatus('Nov 7') },
  { grade: 'Grade 12', subject: 'Physical Sciences P1', date: 'Nov 10', time: '09:00', duration: '3h', status: getExamStatus('Nov 10') },
  { grade: 'Grade 12', subject: 'Life Sciences P1', date: 'Nov 11', time: '09:00', duration: '2.5h', status: getExamStatus('Nov 11') },
  { grade: 'Grade 12', subject: 'Mathematics P2', date: 'Nov 12', time: '09:00', duration: '3h', status: getExamStatus('Nov 12') },
  { grade: 'Grade 12', subject: 'Physical Sciences P2', date: 'Nov 17', time: '14:00', duration: '3h', status: getExamStatus('Nov 17') },
  { grade: 'Grade 12', subject: 'Life Sciences P2', date: 'Nov 18', time: '14:00', duration: '2.5h', status: getExamStatus('Nov 18') },
  
  // Grade 11 Finals (School-Based, Approximate)
  { grade: 'Grade 11', subject: 'English HL P1', date: 'Nov 3', time: '09:00', duration: '2.5h', status: getExamStatus('Nov 3') },
  { grade: 'Grade 11', subject: 'Mathematics P1', date: 'Nov 5', time: '09:00', duration: '3h', status: getExamStatus('Nov 5') },
  { grade: 'Grade 11', subject: 'Physical Sciences P1', date: 'Nov 6', time: '09:00', duration: '3h', status: getExamStatus('Nov 6') },
  { grade: 'Grade 11', subject: 'Life Sciences P1', date: 'Nov 10', time: '09:00', duration: '2.5h', status: getExamStatus('Nov 10') },
  
  // Grade 10 Finals (School-Based, Approximate)
  { grade: 'Grade 10', subject: 'English HL P1', date: 'Nov 4', time: '09:00', duration: '2h', status: getExamStatus('Nov 4') },
  { grade: 'Grade 10', subject: 'Mathematics P1', date: 'Nov 7', time: '09:00', duration: '2h', status: getExamStatus('Nov 7') },
  { grade: 'Grade 10', subject: 'Natural Sciences', date: 'Nov 10', time: '14:00', duration: '2h', status: getExamStatus('Nov 10') },
  
  // Grade 9 Finals (School-Based, Approximate)
  { grade: 'Grade 9', subject: 'English HL', date: 'Nov 5', time: '09:00', duration: '2h', status: getExamStatus('Nov 5') },
  { grade: 'Grade 9', subject: 'Mathematics', date: 'Nov 6', time: '09:00', duration: '2h', status: getExamStatus('Nov 6') },
  { grade: 'Grade 9', subject: 'Natural Sciences', date: 'Nov 11', time: '09:00', duration: '1.5h', status: getExamStatus('Nov 11') },
];

interface CAPSExamCalendarProps {
  childGrade?: string;
  usageType?: 'preschool' | 'k12_school' | 'homeschool' | 'aftercare' | 'hybrid' | 'independent' | 'supplemental' | 'exploring';
}

export function CAPSExamCalendar({ childGrade, usageType }: CAPSExamCalendarProps) {
  // 🚫 Don't show CAPS exam calendar to preschool parents (ages 3-6)
  if (usageType === 'preschool' || usageType === 'aftercare' || usageType === 'supplemental') {
    return null;  // They need developmental milestones, not Grade 12 exams
  }
  
  // ⚠️ Only show for Grade 9-12 students (FET Phase)
  if (childGrade && !['Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'].includes(childGrade)) {
    return null;  // Foundation/Intermediate phase students have different assessments
  }
  // Filter exams by child's grade if provided
  const relevantExams = childGrade 
    ? EXAM_SCHEDULE.filter(exam => exam.grade === childGrade)
    : EXAM_SCHEDULE.slice(0, 8); // Show first 8 if no grade specified

  const upcomingExams = relevantExams.filter(exam => exam.status === 'upcoming' || exam.status === 'today');
  const todayExams = relevantExams.filter(exam => exam.status === 'today');

  return (
    <div className="section">
      <div className="sectionTitle">
        <Calendar className="icon16" style={{ color: '#ef4444' }} />
        CAPS Exam Schedule {childGrade && `- ${childGrade}`}
      </div>

      {/* TODAY'S EXAMS - CRITICAL */}
      {todayExams.length > 0 && (
        <div style={{
          marginBottom: 16,
          padding: 16,
          background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
          color: 'white',
          borderRadius: 12,
          border: '2px solid #fca5a5'
        }}>
          <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertCircle size={24} />
            EXAMS WRITING TODAY
          </div>
          {todayExams.map((exam, idx) => (
            <div key={idx} style={{
              background: 'rgba(255, 255, 255, 0.15)',
              padding: 12,
              borderRadius: 8,
              marginBottom: idx < todayExams.length - 1 ? 8 : 0
            }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
                {exam.subject}
              </div>
              <div style={{ fontSize: 13, opacity: 0.95, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Clock size={14} />
                  {exam.time}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Timer size={14} />
                  {exam.duration}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <GraduationCap size={14} />
                  {exam.grade}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* UPCOMING EXAMS */}
      <div style={{ display: 'grid', gap: 12 }}>
        {upcomingExams.slice(0, 6).map((exam, idx) => (
          <div key={idx} className="card" style={{
            padding: 12,
            borderLeft: exam.status === 'today' ? '4px solid #ef4444' : '4px solid #3b82f6',
            background: exam.status === 'today' ? 'rgba(239, 68, 68, 0.05)' : 'transparent'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6, color: 'var(--text)' }}>
                  {exam.subject}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Calendar size={12} />
                    {exam.date}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Clock size={12} />
                    {exam.time}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Timer size={12} />
                    {exam.duration}
                  </span>
                </div>
              </div>
              <div style={{
                background: exam.status === 'today' ? '#ef4444' : '#3b82f6',
                color: 'white',
                padding: '4px 10px',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                flexShrink: 0
              }}>
                {exam.grade.replace('Grade ', 'G')}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Help CTA */}
      <div style={{
        marginTop: 16,
        padding: 14,
        background: 'rgba(59, 130, 246, 0.1)',
        border: '2px solid #3b82f6',
        borderRadius: 10,
        textAlign: 'center'
      }}>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>
          <BookOpen size={16} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle', color: '#3b82f6' }} />
          Need help with any of these subjects?
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <AlertCircle size={14} />
          Use Emergency Exam Help below for instant AI tutor support
        </div>
      </div>

      {/* Disclaimer */}
      <div style={{
        marginTop: 12,
        padding: 10,
        background: 'rgba(251, 191, 36, 0.1)',
        border: '1px solid rgba(251, 191, 36, 0.3)',
        borderRadius: 8,
        fontSize: 11,
        color: 'var(--muted)',
        textAlign: 'center'
      }}>
        ⚠️ <strong>Official DBE dates</strong> for Grade 12. Grades 9-11 dates may vary by school. 
        Always verify with your school timetable or visit{' '}
        <a 
          href="https://www.education.gov.za/Curriculum/NationalSeniorCertificate(NSC)Examinations.aspx" 
          target="_blank" 
          rel="noopener noreferrer"
          style={{ color: '#3b82f6', textDecoration: 'underline' }}
        >
          education.gov.za
        </a>
      </div>
    </div>
  );
}
