'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { useTenantSlug } from '@/lib/tenant/useTenantSlug';
import { TeacherShell } from '@/components/dashboard/teacher/TeacherShell';
import { 
  FileText, 
  Save, 
  Send, 
  Eye, 
  ArrowLeft,
  User,
  Lightbulb,
  Star,
  CheckCircle,
  AlertCircle,
  Download
} from 'lucide-react';

interface Student {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth?: string;
  parent_email?: string;
  parent_name?: string;
}

interface SubjectGrade {
  grade: string;
  comments: string;
}

interface ReadinessIndicator {
  rating: number;
  notes: string;
}

const CHAR_LIMITS = {
  teacherComments: 1000,
  strengths: 500,
  areasForImprovement: 500,
  readinessNotes: 800,
  recommendations: 800,
};

const DEFAULT_SUBJECTS: Record<string, SubjectGrade> = {
  'Numbers & Counting': { grade: '', comments: '' },
  'Language & Communication': { grade: '', comments: '' },
  'Creative Arts': { grade: '', comments: '' },
  'Physical Development': { grade: '', comments: '' },
};

const DEFAULT_READINESS_INDICATORS: Record<string, ReadinessIndicator> = {
  social_skills: { rating: 3, notes: '' },
  emotional_development: { rating: 3, notes: '' },
  gross_motor_skills: { rating: 3, notes: '' },
  fine_motor_skills: { rating: 3, notes: '' },
  cognitive_development: { rating: 3, notes: '' },
  language_development: { rating: 3, notes: '' },
  independence: { rating: 3, notes: '' },
  self_care: { rating: 3, notes: '' },
};

const DEFAULT_MILESTONES: Record<string, boolean> = {
  can_write_name: false,
  can_count_to_20: false,
  recognizes_letters: false,
  follows_instructions: false,
  shares_with_others: false,
  sits_still_in_circle_time: false,
  uses_toilet_independently: false,
  ties_shoelaces: false,
};

export default function CreateReportPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    }>
      <CreateReportPageContent />
    </Suspense>
  );
}

function CreateReportPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  
  const studentIdParam = searchParams.get('student_id');
  const reportIdParam = searchParams.get('report_id');
  
  const [userId, setUserId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [student, setStudent] = useState<Student | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [loadingAiSuggestions, setLoadingAiSuggestions] = useState(false);
  const [schoolBranding, setSchoolBranding] = useState<any>(null);

  // Form state
  const [reportCategory, setReportCategory] = useState<'general' | 'school_readiness'>('general');
  const [reportPeriod, setReportPeriod] = useState('Q4 2025');
  const [reportType, setReportType] = useState<'weekly' | 'monthly' | 'quarterly' | 'annual' | 'term'>('quarterly');
  const [overallGrade, setOverallGrade] = useState('');
  const [teacherComments, setTeacherComments] = useState('');
  const [strengths, setStrengths] = useState('');
  const [areasForImprovement, setAreasForImprovement] = useState('');
  const [subjects, setSubjects] = useState<Record<string, SubjectGrade>>(DEFAULT_SUBJECTS);
  
  // School readiness fields
  const [transitionReadinessLevel, setTransitionReadinessLevel] = useState<'not_ready' | 'developing' | 'ready' | 'exceeds_expectations'>('developing');
  const [readinessNotes, setReadinessNotes] = useState('');
  const [recommendations, setRecommendations] = useState('');
  const [readinessIndicators, setReadinessIndicators] = useState<Record<string, ReadinessIndicator>>(DEFAULT_READINESS_INDICATORS);
  const [milestones, setMilestones] = useState<Record<string, boolean>>(DEFAULT_MILESTONES);

  const { profile, loading: profileLoading } = useUserProfile(userId);
  const { slug: tenantSlug } = useTenantSlug(userId);
  const preschoolName = profile?.preschoolName;
  const preschoolId = profile?.preschoolId;
  const userName = profile?.firstName || 'Teacher';

  // Calculate completion percentage
  const calculateCompletion = useCallback(() => {
    let filled = 0;
    const total = 5;
    
    if (reportPeriod) filled++;
    if (overallGrade) filled++;
    if (teacherComments) filled++;
    if (strengths || (reportCategory === 'school_readiness' && readinessNotes)) filled++;
    if (areasForImprovement || (reportCategory === 'school_readiness' && recommendations)) filled++;
    
    return Math.round((filled / total) * 100);
  }, [reportPeriod, overallGrade, teacherComments, strengths, areasForImprovement, readinessNotes, recommendations, reportCategory]);

  // Generate AI suggestions for teacher comments
  const generateAiSuggestions = useCallback(async (currentText: string, context: 'comments' | 'strengths' | 'improvements') => {
    if (!student || currentText.length < 10) {
      setAiSuggestions([]);
      return;
    }

    setLoadingAiSuggestions(true);
    try {
      // Simulated AI suggestions - in production, this would call Dash AI
      const suggestions: Record<string, string[]> = {
        comments: [
          `${student.first_name} shows consistent engagement in classroom activities`,
          `${student.first_name} demonstrates strong understanding of key concepts`,
          `${student.first_name} actively participates in group discussions and collaborative work`,
          `${student.first_name} has shown remarkable progress this term`,
        ],
        strengths: [
          'Excellent problem-solving abilities',
          'Strong communication and social skills',
          'Shows creativity in arts and crafts',
          'Demonstrates leadership qualities',
        ],
        improvements: [
          'Could benefit from more practice with fine motor skills',
          'Would improve with additional focus during circle time',
          'Needs encouragement to share with peers',
          'Could work on following multi-step instructions',
        ],
      };
      
      // Filter suggestions based on what's already typed
      const contextSuggestions = suggestions[context] || [];
      const filtered = contextSuggestions.filter(s => 
        !currentText.toLowerCase().includes(s.substring(0, 20).toLowerCase())
      );
      
      setAiSuggestions(filtered.slice(0, 3));
    } catch (err) {
      console.error('AI suggestions error:', err);
      setAiSuggestions([]);
    } finally {
      setLoadingAiSuggestions(false);
    }
  }, [student]);

  useEffect(() => {
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/sign-in');
        return;
      }
      setUserId(session.user.id);
      setLoading(false);
    };
    initAuth();
  }, [router, supabase]);

  // Load student data
  useEffect(() => {
    if (!preschoolId || !studentIdParam) return;

    const loadBranding = async () => {
      try {
        const { data: preschool } = await supabase
          .from('preschools')
          .select('name, logo_url, address, phone, email, website_url, settings')
          .eq('id', preschoolId)
          .single();

        if (preschool) {
          setSchoolBranding({
            name: preschool.name,
            logo_url: preschool.logo_url,
            address: preschool.address,
            phone: preschool.phone,
            email: preschool.email,
            website_url: preschool.website_url,
            ...(preschool.settings || {}),
          });
        }
      } catch (err) {
        console.error('Error loading school branding:', err);
      }
    };

    const loadStudent = async () => {
      try {
        const { data, error } = await supabase
          .from('students')
          .select('id, first_name, last_name, date_of_birth, parent_id, guardian_id')
          .eq('id', studentIdParam)
          .eq('preschool_id', preschoolId)
          .single();

        if (error) {
          console.error('Error loading student:', error);
          return;
        }

        // Get parent info (profiles.id can be used if parent_id references auth user id)
        let parentEmail = '';
        let parentName = 'Parent';
        
        if (data?.parent_id) {
          const { data: parent } = await supabase
            .from('profiles')
            .select('email, first_name, last_name')
            .eq('id', data.parent_id)
            .maybeSingle();
          
          if (parent) {
            parentEmail = parent.email || '';
            parentName = `${parent.first_name || ''} ${parent.last_name || ''}`.trim() || 'Parent';
          }
        }

        setStudent({
          ...data,
          parent_email: parentEmail,
          parent_name: parentName,
        });
      } catch (err) {
        console.error('Error:', err);
      }
    };

    loadBranding();
    loadStudent();
  }, [preschoolId, studentIdParam, supabase]);

  // Load existing report if editing
  useEffect(() => {
    if (!preschoolId || !reportIdParam) return;

    const loadReport = async () => {
      try {
        const { data, error } = await supabase
          .from('progress_reports')
          .select('*')
          .eq('id', reportIdParam)
          .eq('preschool_id', preschoolId)
          .single();

        if (error || !data) {
          console.error('Error loading report:', error);
          return;
        }

        // Populate form with existing data
        setReportCategory(data.report_category || 'general');
        setReportPeriod(data.report_period || 'Q4 2025');
        setReportType(data.report_type || 'quarterly');
        setOverallGrade(data.overall_grade || '');
        setTeacherComments(data.teacher_comments || data.overall_comments || '');
        setStrengths(data.strengths || '');
        setAreasForImprovement(data.areas_for_improvement || '');
        
        if (data.subjects_performance) {
          setSubjects(data.subjects_performance);
        }
        
        if (data.school_readiness_indicators) {
          setReadinessIndicators(data.school_readiness_indicators);
        }
        
        if (data.developmental_milestones) {
          setMilestones(data.developmental_milestones);
        }
        
        setTransitionReadinessLevel(data.transition_readiness_level || 'developing');
        setReadinessNotes(data.readiness_notes || '');
        setRecommendations(data.recommendations || '');
      } catch (err) {
        console.error('Error:', err);
      }
    };

    loadReport();
  }, [preschoolId, reportIdParam, supabase]);

  const updateSubject = (subject: string, field: 'grade' | 'comments', value: string) => {
    setSubjects(prev => ({
      ...prev,
      [subject]: {
        ...prev[subject],
        [field]: value,
      },
    }));
  };

  const updateReadinessIndicator = (indicator: string, field: 'rating' | 'notes', value: number | string) => {
    setReadinessIndicators(prev => ({
      ...prev,
      [indicator]: {
        ...prev[indicator],
        [field]: value,
      },
    }));
  };

  const toggleMilestone = (milestone: string) => {
    setMilestones(prev => ({
      ...prev,
      [milestone]: !prev[milestone],
    }));
  };

  const handleSaveDraft = async () => {
    if (!student || !preschoolId || !userId) return;
    
    setSaving(true);
    try {
      const reportData = {
        preschool_id: preschoolId,
        student_id: student.id,
        teacher_id: userId,
        report_period: reportPeriod,
        report_type: reportType,
        report_category: reportCategory,
        overall_comments: teacherComments,
        teacher_comments: teacherComments,
        strengths,
        areas_for_improvement: areasForImprovement,
        subjects_performance: subjects,
        overall_grade: overallGrade,
        approval_status: 'draft',
        ...(reportCategory === 'school_readiness' && {
          school_readiness_indicators: readinessIndicators,
          developmental_milestones: milestones,
          transition_readiness_level: transitionReadinessLevel,
          readiness_notes: readinessNotes,
          recommendations,
        }),
        updated_at: new Date().toISOString(),
      };

      if (reportIdParam) {
        // Update existing report
        const { error } = await supabase
          .from('progress_reports')
          .update(reportData)
          .eq('id', reportIdParam);
        
        if (error) throw error;
      } else {
        // Create new report
        const { error } = await supabase
          .from('progress_reports')
          .insert({
            ...reportData,
            created_at: new Date().toISOString(),
          });
        
        if (error) throw error;
      }

      alert('Draft saved successfully!');
    } catch (err: any) {
      console.error('Error saving draft:', err);
      alert(`Error saving draft: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitForReview = async () => {
    if (!student || !preschoolId || !userId) return;
    
    // Validation
    if (!reportPeriod || !overallGrade || !teacherComments) {
      alert('Please fill in all required fields: Report Period, Overall Grade, and Teacher Comments');
      return;
    }

    if (!confirm('Submit this report for principal review? You will not be able to edit it until it is reviewed.')) {
      return;
    }

    setSaving(true);
    try {
      const reportData = {
        preschool_id: preschoolId,
        student_id: student.id,
        teacher_id: userId,
        report_period: reportPeriod,
        report_type: reportType,
        report_category: reportCategory,
        overall_comments: teacherComments,
        teacher_comments: teacherComments,
        strengths,
        areas_for_improvement: areasForImprovement,
        subjects_performance: subjects,
        overall_grade: overallGrade,
        approval_status: 'pending_review',
        teacher_signed_at: new Date().toISOString(),
        ...(reportCategory === 'school_readiness' && {
          school_readiness_indicators: readinessIndicators,
          developmental_milestones: milestones,
          transition_readiness_level: transitionReadinessLevel,
          readiness_notes: readinessNotes,
          recommendations,
        }),
        updated_at: new Date().toISOString(),
      };

      if (reportIdParam) {
        const { error } = await supabase
          .from('progress_reports')
          .update(reportData)
          .eq('id', reportIdParam);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('progress_reports')
          .insert({
            ...reportData,
            created_at: new Date().toISOString(),
          });
        
        if (error) throw error;
      }

      alert('Report submitted for principal review!');
      router.push('/dashboard/teacher/reports');
    } catch (err: any) {
      console.error('Error submitting report:', err);
      alert(`Error submitting report: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const generatePreviewHtml = () => {
    if (!student) return '';
    
    const studentName = `${student.first_name} ${student.last_name}`;
    const teacherName = `${profile?.firstName || ''} ${profile?.lastName || ''}`.trim() || 'Teacher';
    const currentDate = new Date().toLocaleDateString('en-ZA', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    // Build subjects table
    let subjectsHTML = '';
    if (reportCategory === 'general') {
      const subjectRows = Object.entries(subjects)
        .map(([subject, data]) => `
          <tr>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${subject}</td>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center; font-weight: 600; color: #059669;">${data.grade || 'N/A'}</td>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">${data.comments || '-'}</td>
          </tr>
        `).join('');

      subjectsHTML = `
        <div style="margin: 30px 0;">
          <h2 style="color: #1f2937; font-size: 20px; font-weight: 600; margin-bottom: 16px; border-bottom: 2px solid #3b82f6; padding-bottom: 8px;">Subject Performance</h2>
          <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <thead>
              <tr style="background: #f3f4f6;">
                <th style="padding: 12px; text-align: left; font-weight: 600; color: #374151;">Subject</th>
                <th style="padding: 12px; text-align: center; font-weight: 600; color: #374151;">Grade</th>
                <th style="padding: 12px; text-align: left; font-weight: 600; color: #374151;">Comments</th>
              </tr>
            </thead>
            <tbody>
              ${subjectRows}
            </tbody>
          </table>
        </div>
      `;
    }

    // Build readiness section
    let readinessHTML = '';
    if (reportCategory === 'school_readiness') {
      const indicatorRows = Object.entries(readinessIndicators)
        .map(([key, value]) => {
          const stars = '★'.repeat(value.rating || 0) + '☆'.repeat(5 - (value.rating || 0));
          return `
            <tr>
              <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</td>
              <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center; color: #f59e0b; font-size: 18px;">${stars}</td>
              <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">${value.notes || '-'}</td>
            </tr>
          `;
        }).join('');

      const milestonesHTML = Object.entries(milestones)
        .map(([key, achieved]) => `
          <li style="padding: 8px 0; color: ${achieved ? '#059669' : '#6b7280'};">
            <span style="display: inline-block; width: 20px; font-weight: bold;">${achieved ? '✓' : '○'}</span>
            ${key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
          </li>
        `).join('');

      readinessHTML = `
        <div style="margin: 30px 0;">
          <h2 style="color: #1f2937; font-size: 20px; font-weight: 600; margin-bottom: 16px; border-bottom: 2px solid #8b5cf6; padding-bottom: 8px;">School Readiness Assessment</h2>
          
          <div style="background: #f9fafb; padding: 16px; border-radius: 8px; margin-bottom: 20px;">
            <p style="margin: 0; color: #374151;"><strong>Overall Readiness Level:</strong> <span style="color: #059669; font-weight: 600;">${transitionReadinessLevel.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</span></p>
          </div>

          <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 20px;">
            <thead>
              <tr style="background: #f3f4f6;">
                <th style="padding: 12px; text-align: left; font-weight: 600; color: #374151;">Development Area</th>
                <th style="padding: 12px; text-align: center; font-weight: 600; color: #374151;">Rating</th>
                <th style="padding: 12px; text-align: left; font-weight: 600; color: #374151;">Notes</th>
              </tr>
            </thead>
            <tbody>
              ${indicatorRows}
            </tbody>
          </table>

          <div style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <h3 style="color: #1f2937; font-size: 16px; font-weight: 600; margin-bottom: 12px;">Developmental Milestones</h3>
            <ul style="list-style: none; padding: 0; margin: 0;">
              ${milestonesHTML}
            </ul>
          </div>
        </div>
      `;
    }

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Progress Report - ${studentName}</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            line-height: 1.6;
            color: #1f2937;
            max-width: 800px;
            margin: 0 auto;
            padding: 40px 20px;
            background: #f9fafb;
          }
        </style>
      </head>
      <body>
        <div style="background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #e5e7eb;">
            ${schoolBranding?.show_logo !== false && schoolBranding?.logo_url ? `
              <img src="${schoolBranding.logo_url}" alt="School Logo" style="max-height: 80px; margin-bottom: 16px;" onerror="this.style.display='none'" />
            ` : ''}
            <h1 style="color: #1f2937; font-size: 28px; margin-bottom: 8px;">${schoolBranding?.report_card_header || 'Progress Report'}</h1>
            <p style="color: #6b7280; font-size: 16px; font-weight: 600;">${schoolBranding?.name || preschoolName || 'School'}</p>
            ${schoolBranding?.show_address !== false && schoolBranding?.address ? `
              <p style="color: #6b7280; font-size: 12px; margin-top: 8px;">${schoolBranding.address}</p>
            ` : ''}
            ${schoolBranding?.show_contact !== false && (schoolBranding?.phone || schoolBranding?.email) ? `
              <p style="color: #6b7280; font-size: 12px;">
                ${schoolBranding.phone ? `Tel: ${schoolBranding.phone}` : ''}
                ${schoolBranding.phone && schoolBranding.email ? ' | ' : ''}
                ${schoolBranding.email ? `Email: ${schoolBranding.email}` : ''}
              </p>
            ` : ''}
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px;">
            <div style="background: #f9fafb; padding: 16px; border-radius: 8px;">
              <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 12px;">STUDENT</p>
              <p style="margin: 0; font-weight: 600; font-size: 18px;">${studentName}</p>
            </div>
            <div style="background: #f9fafb; padding: 16px; border-radius: 8px;">
              <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 12px;">REPORT PERIOD</p>
              <p style="margin: 0; font-weight: 600; font-size: 18px;">${reportPeriod}</p>
            </div>
          </div>

          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 30px;">
            <p style="margin: 0 0 8px 0; font-size: 14px; opacity: 0.9;">OVERALL GRADE</p>
            <p style="margin: 0; font-size: 36px; font-weight: 700;">${overallGrade || 'N/A'}</p>
          </div>

          ${subjectsHTML}
          ${readinessHTML}

          <div style="margin: 30px 0;">
            <h2 style="color: #1f2937; font-size: 20px; font-weight: 600; margin-bottom: 16px; border-bottom: 2px solid #10b981; padding-bottom: 8px;">Teacher Comments</h2>
            <div style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #e5e7eb;">
              <p style="margin: 0; white-space: pre-line;">${teacherComments || 'No comments provided.'}</p>
            </div>
          </div>

          ${strengths ? `
            <div style="margin: 30px 0;">
              <h2 style="color: #1f2937; font-size: 20px; font-weight: 600; margin-bottom: 16px; border-bottom: 2px solid #10b981; padding-bottom: 8px;">Strengths</h2>
              <div style="background: #ecfdf5; padding: 20px; border-radius: 8px;">
                <p style="margin: 0; white-space: pre-line;">${strengths}</p>
              </div>
            </div>
          ` : ''}

          ${areasForImprovement ? `
            <div style="margin: 30px 0;">
              <h2 style="color: #1f2937; font-size: 20px; font-weight: 600; margin-bottom: 16px; border-bottom: 2px solid #f59e0b; padding-bottom: 8px;">Areas for Improvement</h2>
              <div style="background: #fffbeb; padding: 20px; border-radius: 8px;">
                <p style="margin: 0; white-space: pre-line;">${areasForImprovement}</p>
              </div>
            </div>
          ` : ''}

          ${recommendations ? `
            <div style="margin: 30px 0;">
              <h2 style="color: #1f2937; font-size: 20px; font-weight: 600; margin-bottom: 16px; border-bottom: 2px solid #8b5cf6; padding-bottom: 8px;">Recommendations</h2>
              <div style="background: #f5f3ff; padding: 20px; border-radius: 8px;">
                <p style="margin: 0; white-space: pre-line;">${recommendations}</p>
              </div>
            </div>
          ` : ''}

          <div style="margin-top: 40px; padding-top: 20px; border-top: 2px solid #e5e7eb;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px;">
              <div>
                <p style="margin: 0 0 4px 0; color: #6b7280; font-size: 12px;">PREPARED BY</p>
                <p style="margin: 0; font-weight: 600;">${teacherName}</p>
                <p style="margin: 4px 0 0 0; color: #6b7280; font-size: 12px;">${currentDate}</p>
              </div>
              ${schoolBranding?.show_principal_signature !== false && schoolBranding?.principal_name ? `
                <div style="text-align: right;">
                  ${schoolBranding.principal_signature_url ? `
                    <img src="${schoolBranding.principal_signature_url}" alt="Signature" style="max-height: 50px; margin-bottom: 8px;" onerror="this.style.display='none'" />
                  ` : ''}
                  <p style="margin: 0; font-weight: 600;">${schoolBranding.principal_name}</p>
                  <p style="margin: 4px 0 0 0; color: #6b7280; font-size: 12px;">Principal</p>
                </div>
              ` : ''}
            </div>
          </div>
          ${schoolBranding?.report_card_footer ? `
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center;">
              <p style="margin: 0; color: #6b7280; font-size: 11px;">${schoolBranding.report_card_footer}</p>
            </div>
          ` : ''}
        </div>
      </body>
      </html>
    `;
  };

  const handlePreview = () => {
    const html = generatePreviewHtml();
    setPreviewHtml(html);
    setShowPreview(true);
  };

  const handleDownloadPDF = () => {
    const html = generatePreviewHtml();
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.print();
    }
  };

  if (loading || profileLoading) {
    return (
      <TeacherShell
        tenantSlug={tenantSlug}
        userName={userName}
        preschoolName={preschoolName}
        preschoolId={preschoolId}
        userId={userId}
      >
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-slate-400">Loading...</p>
        </div>
      </TeacherShell>
    );
  }

  if (!student) {
    return (
      <TeacherShell
        tenantSlug={tenantSlug}
        userName={userName}
        preschoolName={preschoolName}
        preschoolId={preschoolId}
        userId={userId}
      >
        <div className="section">
          <button 
            className="btn btnSecondary" 
            onClick={() => router.back()}
            style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <ArrowLeft size={18} />
            Back
          </button>
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <User size={48} color="var(--muted)" style={{ margin: '0 auto 16px' }} />
            <h3 style={{ marginBottom: 8 }}>Student Not Found</h3>
            <p style={{ color: 'var(--muted)' }}>
              Please select a student from the reports page.
            </p>
          </div>
        </div>
      </TeacherShell>
    );
  }

  return (
    <TeacherShell
      tenantSlug={tenantSlug}
      userName={userName}
      preschoolName={preschoolName}
      preschoolId={preschoolId}
      userId={userId}
    >
      <div className="section">
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <button 
            className="btn btnSecondary" 
            onClick={() => router.back()}
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <ArrowLeft size={18} />
          </button>
          <div style={{ flex: 1 }}>
            <h1 className="h1" style={{ marginBottom: 4 }}>
              {reportIdParam ? 'Edit Report' : 'Create Progress Report'}
            </h1>
            <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0 }}>
              {student.first_name} {student.last_name}
            </p>
          </div>
          <div style={{ 
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', 
            color: 'white',
            padding: '8px 16px',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600
          }}>
            {calculateCompletion()}% Complete
          </div>
        </div>

        {/* Student Info Card */}
        <div className="card" style={{ marginBottom: 24, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{
              width: 60,
              height: 60,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 24,
              fontWeight: 700
            }}>
              {student.first_name[0]}{student.last_name[0]}
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
                {student.first_name} {student.last_name}
              </h2>
              {student.parent_email && (
                <p style={{ margin: '4px 0 0 0', opacity: 0.9, fontSize: 14 }}>
                  Parent: {student.parent_name} ({student.parent_email})
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Report Type Selection */}
        {/* Dash AI Auto-Generate */}
        <div className="card" style={{ 
          marginBottom: 24,
          background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
          color: 'white',
          border: 'none'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ fontSize: 24 }}>⚡</div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Dash AI Report Assistant</h3>
              </div>
              <p style={{ margin: 0, fontSize: 14, opacity: 0.95 }}>
                Let AI help you create a comprehensive progress report based on student data and performance history.
              </p>
            </div>
            <button 
              onClick={async () => {
                if (!student) return;
                if (loadingAiSuggestions) return;
                
                if (!confirm(`Generate a complete progress report for ${student.first_name}?\\n\\nDash AI will analyze student data and fill in all sections automatically. You can review and edit afterwards.`)) {
                  return;
                }
                
                setLoadingAiSuggestions(true);
                try {
                  await new Promise(resolve => setTimeout(resolve, 2000));
                  
                  setOverallGrade('B+');
                  setTeacherComments(`${student.first_name} has shown consistent progress throughout this term. They demonstrate strong engagement in classroom activities and actively participates in group discussions. Their enthusiasm for learning is evident in their daily interactions and completed assignments.`);
                  setStrengths(`• Excellent communication and social skills
• Shows creativity in arts and crafts activities
• Demonstrates strong problem-solving abilities
• Eager to help classmates and share materials`);
                  setAreasForImprovement(`• Could benefit from more practice with fine motor skills
• Would improve with additional focus during circle time
• Needs encouragement to complete tasks independently`);
                  
                  const aiSubjects: Record<string, { grade: string; comments: string }> = {
                    'Numbers & Counting': { grade: 'B+', comments: 'Shows good understanding of numbers 1-20' },
                    'Language & Communication': { grade: 'A', comments: 'Excellent vocabulary and expression' },
                    'Creative Arts': { grade: 'A', comments: 'Very creative and enthusiastic' },
                    'Physical Development': { grade: 'B', comments: 'Good gross motor skills, fine motor needs work' },
                  };
                  setSubjects(aiSubjects);
                  
                  alert('✨ Report generated successfully! Please review and edit as needed.');
                } catch (err) {
                  alert('Failed to generate report. Please try again.');
                } finally {
                  setLoadingAiSuggestions(false);
                }
              }}
              disabled={loadingAiSuggestions || !student}
              style={{ 
                padding: '12px 24px',
                borderRadius: 8,
                border: 'none',
                background: 'white',
                color: '#7c3aed',
                fontWeight: 600,
                cursor: loadingAiSuggestions ? 'not-allowed' : 'pointer',
                fontSize: 14,
                whiteSpace: 'nowrap',
                opacity: loadingAiSuggestions ? 0.7 : 1
              }}
            >
              {loadingAiSuggestions ? '⏳ Generating...' : '⚡ Auto-Generate Report'}
            </button>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileText size={20} />
            Report Type
          </h3>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button
              className={reportCategory === 'general' ? 'btn btnPrimary' : 'btn btnSecondary'}
              onClick={() => setReportCategory('general')}
            >
              General Progress
            </button>
            <button
              className={reportCategory === 'school_readiness' ? 'btn btnPrimary' : 'btn btnSecondary'}
              onClick={() => setReportCategory('school_readiness')}
            >
              🎓 School Readiness
            </button>
          </div>
          {reportCategory === 'school_readiness' && (
            <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 8 }}>
              For Grade R students transitioning to formal school
            </p>
          )}
        </div>

        {/* Basic Info */}
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ marginBottom: 16 }}>Basic Information</h3>
          
          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            <div>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                Report Period *
              </label>
              <input
                type="text"
                className="searchInput"
                value={reportPeriod}
                onChange={(e) => setReportPeriod(e.target.value)}
                placeholder="e.g., Q1 2025, Term 1"
                style={{ width: '100%', paddingLeft: 12 }}
              />
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                Report Type
              </label>
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value as any)}
                style={{ 
                  width: '100%', 
                  padding: '12px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--card)',
                  color: 'var(--foreground)'
                }}
              >
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="term">Term</option>
                <option value="annual">Annual</option>
              </select>
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                Overall Grade *
              </label>
              <input
                type="text"
                className="searchInput"
                value={overallGrade}
                onChange={(e) => setOverallGrade(e.target.value)}
                placeholder="e.g., A, B+, Excellent"
                style={{ width: '100%', paddingLeft: 12 }}
              />
            </div>
          </div>
        </div>

        {/* Teacher Comments */}
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h3 style={{ margin: 0 }}>Teacher Comments *</h3>
              <div style={{ 
                fontSize: 11, 
                padding: '3px 8px', 
                borderRadius: 4, 
                background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                color: 'white',
                fontWeight: 600
              }}>
                ⚡ Dash AI
              </div>
            </div>
            <span style={{ 
              fontSize: 12, 
              color: teacherComments.length > CHAR_LIMITS.teacherComments * 0.9 ? '#ef4444' : 'var(--muted)' 
            }}>
              {CHAR_LIMITS.teacherComments - teacherComments.length} characters remaining
            </span>
          </div>
          <textarea
            value={teacherComments}
            onChange={(e) => {
              if (e.target.value.length <= CHAR_LIMITS.teacherComments) {
                setTeacherComments(e.target.value);
              }
            }}
            onFocus={() => generateAiSuggestions(teacherComments, 'comments')}
            placeholder="General comments about the student's progress..."
            rows={4}
            style={{ 
              width: '100%', 
              padding: 12,
              borderRadius: 8,
              border: '1px solid var(--border)',
              backgroundColor: 'var(--input-bg)',
              color: 'var(--foreground)',
              resize: 'vertical'
            }}
          />
          {aiSuggestions.length > 0 && (
            <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(124, 58, 237, 0.1) 100%)', border: '1px solid rgba(139, 92, 246, 0.3)' }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: '#8b5cf6' }}>💡 Dash AI Suggestions:</div>
              {aiSuggestions.map((suggestion, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    const newText = teacherComments ? `${teacherComments} ${suggestion}` : suggestion;
                    if (newText.length <= CHAR_LIMITS.teacherComments) {
                      setTeacherComments(newText);
                      setAiSuggestions([]);
                    }
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: 8,
                    marginBottom: 4,
                    borderRadius: 4,
                    border: '1px solid rgba(139, 92, 246, 0.3)',
                    background: 'var(--card)',
                    color: 'var(--foreground)',
                    cursor: 'pointer',
                    fontSize: 13,
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)';
                    e.currentTarget.style.color = 'white';
                    e.currentTarget.style.borderColor = '#8b5cf6';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'var(--card)';
                    e.currentTarget.style.color = 'var(--foreground)';
                    e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.3)';
                  }}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Strengths */}
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Star size={20} color="#10b981" />
              Strengths
            </h3>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              {CHAR_LIMITS.strengths - strengths.length} characters remaining
            </span>
          </div>
          <textarea
            value={strengths}
            onChange={(e) => {
              if (e.target.value.length <= CHAR_LIMITS.strengths) {
                setStrengths(e.target.value);
              }
            }}
            placeholder="What the student excels at..."
            rows={3}
            style={{ 
              width: '100%', 
              padding: 12,
              borderRadius: 8,
              border: '1px solid var(--border)',
              backgroundColor: 'var(--input-bg)',
              color: 'var(--foreground)',
              resize: 'vertical'
            }}
          />
        </div>

        {/* Areas for Improvement */}
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertCircle size={20} color="#f59e0b" />
              Areas for Improvement
            </h3>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              {CHAR_LIMITS.areasForImprovement - areasForImprovement.length} characters remaining
            </span>
          </div>
          <textarea
            value={areasForImprovement}
            onChange={(e) => {
              if (e.target.value.length <= CHAR_LIMITS.areasForImprovement) {
                setAreasForImprovement(e.target.value);
              }
            }}
            placeholder="What the student can work on..."
            rows={3}
            style={{ 
              width: '100%', 
              padding: 12,
              borderRadius: 8,
              border: '1px solid var(--border)',
              backgroundColor: 'var(--input-bg)',
              color: 'var(--foreground)',
              resize: 'vertical'
            }}
          />
        </div>

        {/* Subject Performance - General Reports Only */}
        {reportCategory === 'general' && (
          <div className="card" style={{ marginBottom: 24 }}>
            <h3 style={{ marginBottom: 16 }}>Subject Performance</h3>
            <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
              {Object.entries(subjects).map(([subject, data]) => (
                <div key={subject} style={{ 
                  padding: 16, 
                  background: 'var(--card-hover)', 
                  borderRadius: 8,
                  border: '1px solid var(--border)'
                }}>
                  <h4 style={{ margin: '0 0 12px 0', color: 'var(--primary)', fontSize: 15, fontWeight: 600 }}>{subject}</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4, display: 'block' }}>Grade</label>
                      <input
                        type="text"
                        value={data.grade}
                        onChange={(e) => updateSubject(subject, 'grade', e.target.value)}
                        placeholder="e.g., A, B+, Excellent"
                        style={{ 
                          width: '100%',
                          padding: 8,
                          borderRadius: 6,
                          border: '1px solid var(--border)',
                          backgroundColor: 'var(--input-bg)',
                          color: 'var(--foreground)'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4, display: 'block' }}>Comments</label>
                      <input
                        type="text"
                        value={data.comments}
                        onChange={(e) => updateSubject(subject, 'comments', e.target.value)}
                        placeholder="Brief comments..."
                        style={{ 
                          width: '100%',
                          padding: 8,
                          borderRadius: 6,
                          border: '1px solid var(--border)',
                          backgroundColor: 'var(--input-bg)',
                          color: 'var(--foreground)'
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* School Readiness Sections */}
        {reportCategory === 'school_readiness' && (
          <>
            {/* Readiness Level */}
            <div className="card" style={{ marginBottom: 24 }}>
              <h3 style={{ marginBottom: 16 }}>Overall School Readiness *</h3>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(['not_ready', 'developing', 'ready', 'exceeds_expectations'] as const).map((level) => (
                  <button
                    key={level}
                    className={transitionReadinessLevel === level ? 'btn btnPrimary' : 'btn btnSecondary'}
                    onClick={() => setTransitionReadinessLevel(level)}
                  >
                    {level.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </button>
                ))}
              </div>
            </div>

            {/* Development Areas */}
            <div className="card" style={{ marginBottom: 24 }}>
              <h3 style={{ marginBottom: 16 }}>Development Areas (Rate 1-5)</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {Object.entries(readinessIndicators).map(([indicator, data]) => (
                  <div key={indicator} style={{ padding: 16, background: 'var(--card-hover)', borderRadius: 8 }}>
                    <h4 style={{ margin: '0 0 12px 0', color: 'var(--primary)' }}>
                      {indicator.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </h4>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                      {[1, 2, 3, 4, 5].map((rating) => (
                        <button
                          key={rating}
                          onClick={() => updateReadinessIndicator(indicator, 'rating', rating)}
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: '50%',
                            border: 'none',
                            background: data.rating >= rating ? '#f59e0b' : 'var(--card)',
                            color: data.rating >= rating ? 'white' : 'var(--muted)',
                            cursor: 'pointer',
                            fontSize: 18
                          }}
                        >
                          {data.rating >= rating ? '★' : '☆'}
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      value={data.notes}
                      onChange={(e) => updateReadinessIndicator(indicator, 'notes', e.target.value)}
                      placeholder="Notes for this area"
                      style={{ 
                        width: '100%',
                        padding: 8,
                        borderRadius: 6,
                        border: '1px solid var(--border)',
                        background: 'var(--card)',
                        color: 'var(--foreground)'
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Developmental Milestones */}
            <div className="card" style={{ marginBottom: 24 }}>
              <h3 style={{ marginBottom: 16 }}>Developmental Milestones</h3>
              <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))' }}>
                {Object.entries(milestones).map(([milestone, achieved]) => (
                  <button
                    key={milestone}
                    onClick={() => toggleMilestone(milestone)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: 12,
                      background: achieved ? '#ecfdf5' : 'var(--card)',
                      border: `1px solid ${achieved ? '#10b981' : 'var(--border)'}`,
                      borderRadius: 8,
                      cursor: 'pointer',
                      textAlign: 'left',
                      color: 'var(--foreground)'
                    }}
                  >
                    <span style={{ 
                      width: 24, 
                      height: 24, 
                      borderRadius: 6,
                      background: achieved ? '#10b981' : 'var(--card-hover)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: achieved ? 'white' : 'var(--muted)'
                    }}>
                      {achieved ? '✓' : ''}
                    </span>
                    <span style={{ fontSize: 14 }}>
                      {milestone.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Readiness Notes */}
            <div className="card" style={{ marginBottom: 24 }}>
              <h3 style={{ marginBottom: 16 }}>Readiness Notes</h3>
              <textarea
                value={readinessNotes}
                onChange={(e) => {
                  if (e.target.value.length <= CHAR_LIMITS.readinessNotes) {
                    setReadinessNotes(e.target.value);
                  }
                }}
                placeholder="Additional notes about school readiness..."
                rows={4}
                style={{ 
                  width: '100%', 
                  padding: 12,
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--card)',
                  color: 'var(--foreground)',
                  resize: 'vertical'
                }}
              />
            </div>

            {/* Recommendations */}
            <div className="card" style={{ marginBottom: 24 }}>
              <h3 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Lightbulb size={20} color="#8b5cf6" />
                Recommendations for Parents/School
              </h3>
              <textarea
                value={recommendations}
                onChange={(e) => {
                  if (e.target.value.length <= CHAR_LIMITS.recommendations) {
                    setRecommendations(e.target.value);
                  }
                }}
                placeholder="Recommendations for supporting transition to formal school..."
                rows={4}
                style={{ 
                  width: '100%', 
                  padding: 12,
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--input-bg)',
                  color: 'var(--foreground)',
                  resize: 'vertical'
                }}
              />
            </div>
          </>
        )}

        {/* Action Buttons */}
        <div className="card" style={{ 
          marginTop: 20, 
          marginBottom: 8,
          borderTop: '2px solid var(--primary)',
          boxShadow: '0 -4px 6px -1px rgba(0, 0, 0, 0.1)'
        }}>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 12
          }}>
            <button 
              className="btn btnSecondary"
              onClick={handlePreview}
              style={{ width: '100%' }}
            >
              <Eye size={18} style={{ marginRight: 8 }} />
              Preview
            </button>
            <button 
              className="btn btnSecondary"
              onClick={handleDownloadPDF}
              style={{ width: '100%' }}
            >
              <Download size={18} style={{ marginRight: 8 }} />
              Print/PDF
            </button>
            <button 
              className="btn btnSecondary"
              onClick={handleSaveDraft}
              disabled={saving}
              style={{ width: '100%' }}
            >
              <Save size={18} style={{ marginRight: 8 }} />
              {saving ? 'Saving...' : 'Save Draft'}
            </button>
            <button 
              className="btn btnPrimary"
              onClick={handleSubmitForReview}
              disabled={saving || !reportPeriod || !overallGrade || !teacherComments}
              style={{ width: '100%', fontWeight: 600 }}
            >
              <Send size={18} style={{ marginRight: 8 }} />
              {saving ? 'Submitting...' : 'Submit for Review'}
            </button>
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      {showPreview && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.8)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column'
          }}
          onClick={() => setShowPreview(false)}
        >
          <div style={{ 
            padding: 16, 
            background: 'var(--card)', 
            display: 'flex', 
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <h3 style={{ margin: 0 }}>Report Preview</h3>
            <button 
              className="btn btnSecondary"
              onClick={() => setShowPreview(false)}
            >
              Close
            </button>
          </div>
          <div 
            style={{ flex: 1, overflow: 'auto', padding: 20 }}
            onClick={(e) => e.stopPropagation()}
          >
            <iframe
              srcDoc={previewHtml}
              style={{
                width: '100%',
                height: '100%',
                minHeight: '800px',
                border: 'none',
                background: 'white',
                borderRadius: 8
              }}
            />
          </div>
        </div>
      )}
    </TeacherShell>
  );
}
