// Send Progress Report Edge Function
// Generates and sends weekly/monthly progress reports to parents

import { serve } from 'https://deno.land/std@0.214.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ReportRequest {
  student_id?: string;
  parent_id?: string;
  preschool_id?: string;
  report_type: 'weekly' | 'monthly';
  send_email?: boolean;
  send_notification?: boolean;
}

interface StudentProgress {
  student_id: string;
  student_name: string;
  parent_email: string;
  total_lessons: number;
  completed_lessons: number;
  completion_rate: number;
  average_score: number | null;
  total_time_minutes: number;
  top_subjects: string[];
  overdue_count: number;
  recent_completions: { title: string; score: number | null; date: string }[];
  improvements: string[];
  areas_to_work: string[];
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const requestData: ReportRequest = await req.json();
    const {
      student_id,
      parent_id,
      preschool_id,
      report_type = 'weekly',
      send_email = true,
      send_notification = true,
    } = requestData;

    // Validate input
    if (!student_id && !parent_id && !preschool_id) {
      return new Response(
        JSON.stringify({ error: 'At least one of student_id, parent_id, or preschool_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate date range based on report type
    const now = new Date();
    let startDate: Date;
    if (report_type === 'weekly') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else {
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    }

    // Get students to report on
    let studentsQuery = supabase
      .from('students')
      .select(`
        id,
        first_name,
        last_name,
        parent_id,
        parent:profiles!students_parent_id_fkey(email, first_name, last_name)
      `)
      .eq('is_active', true);

    if (student_id) {
      studentsQuery = studentsQuery.eq('id', student_id);
    } else if (parent_id) {
      studentsQuery = studentsQuery.eq('parent_id', parent_id);
    } else if (preschool_id) {
      studentsQuery = studentsQuery.eq('preschool_id', preschool_id);
    }

    const { data: students, error: studentsError } = await studentsQuery;

    if (studentsError || !students?.length) {
      return new Response(
        JSON.stringify({ error: 'No students found', details: studentsError }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const reports: StudentProgress[] = [];

    for (const student of students) {
      // Get lesson assignments for this period
      const { data: assignments } = await supabase
        .from('lesson_assignments')
        .select(`
          id,
          status,
          due_date,
          lesson:lessons(title, subject)
        `)
        .eq('student_id', student.id)
        .gte('assigned_at', startDate.toISOString());

      // Get completions for this period
      const { data: completions } = await supabase
        .from('lesson_completions')
        .select('*')
        .eq('student_id', student.id)
        .gte('completed_at', startDate.toISOString())
        .order('completed_at', { ascending: false });

      // Calculate metrics
      const totalLessons = assignments?.length || 0;
      const completedLessons = assignments?.filter(a => a.status === 'completed').length || 0;
      const completionRate = totalLessons > 0 
        ? Math.round((completedLessons / totalLessons) * 100) 
        : 0;

      const scores = (completions || []).filter(c => c.score !== null).map(c => c.score);
      const averageScore = scores.length > 0 
        ? Math.round(scores.reduce((a, b) => (a || 0) + (b || 0), 0) / scores.length) 
        : null;

      const totalTimeMinutes = (completions || []).reduce(
        (sum, c) => sum + (c.time_spent_minutes || 0), 
        0
      );

      const overdueCount = assignments?.filter(a => 
        a.status !== 'completed' && a.due_date && new Date(a.due_date) < now
      ).length || 0;

      // Get top subjects
      const subjectCounts: Record<string, number> = {};
      (assignments || []).forEach(a => {
        const subject = (a.lesson as any)?.subject || 'general';
        subjectCounts[subject] = (subjectCounts[subject] || 0) + 1;
      });
      const topSubjects = Object.entries(subjectCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([subject]) => subject);

      // Recent completions
      const recentCompletions = (completions || []).slice(0, 5).map(c => ({
        title: 'Lesson', // Would need to join with lesson data
        score: c.score,
        date: c.completed_at,
      }));

      // Generate feedback
      const improvements: string[] = [];
      const areasToWork: string[] = [];

      if (completionRate >= 80) {
        improvements.push('Excellent completion rate this period!');
      }
      if (averageScore !== null && averageScore >= 85) {
        improvements.push('Outstanding average score!');
      }
      if (totalTimeMinutes >= 120) {
        improvements.push('Great dedication to learning time!');
      }

      if (overdueCount > 0) {
        areasToWork.push(`${overdueCount} assignment(s) need attention`);
      }
      if (completionRate < 50) {
        areasToWork.push('Focus on completing more assigned lessons');
      }

      const parentData = student.parent as any;
      
      reports.push({
        student_id: student.id,
        student_name: `${student.first_name} ${student.last_name}`,
        parent_email: parentData?.email || '',
        total_lessons: totalLessons,
        completed_lessons: completedLessons,
        completion_rate: completionRate,
        average_score: averageScore,
        total_time_minutes: totalTimeMinutes,
        top_subjects: topSubjects,
        overdue_count: overdueCount,
        recent_completions: recentCompletions,
        improvements,
        areas_to_work: areasToWork,
      });
    }

    // Store reports in database
    for (const report of reports) {
      const { error: storeError } = await supabase
        .from('student_progress_summary')
        .upsert({
          student_id: report.student_id,
          preschool_id: preschool_id || students[0]?.preschool_id,
          period_type: report_type,
          period_start: startDate.toISOString().split('T')[0],
          period_end: now.toISOString().split('T')[0],
          lessons_assigned: report.total_lessons,
          lessons_completed: report.completed_lessons,
          average_score: report.average_score,
          total_time_spent_minutes: report.total_time_minutes,
          strengths: report.improvements,
          areas_for_improvement: report.areas_to_work,
          calculated_at: now.toISOString(),
        }, {
          onConflict: 'student_id,period_type,period_start',
        });

      if (storeError) {
        console.error('Error storing progress summary:', storeError);
      }
    }

    // Send notifications if requested
    if (send_notification) {
      for (const report of reports) {
        const studentData = students.find(s => s.id === report.student_id);
        const parentData = studentData?.parent as any;
        
        if (parentData?.id) {
          await supabase.from('in_app_notifications').insert({
            user_id: studentData.parent_id,
            title: `${report_type.charAt(0).toUpperCase() + report_type.slice(1)} Progress Report`,
            message: `${report.student_name}'s progress report is ready! Completion rate: ${report.completion_rate}%`,
            type: 'progress_report',
            data: {
              student_id: report.student_id,
              report_type,
              completion_rate: report.completion_rate,
            },
          });
        }
      }
    }

    // TODO: Send emails if requested
    if (send_email) {
      console.log('Email sending would be implemented here');
      // Would call an email service like Resend, SendGrid, etc.
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Generated ${reports.length} progress report(s)`,
        data: {
          reports_generated: reports.length,
          report_type,
          period: {
            start: startDate.toISOString(),
            end: now.toISOString(),
          },
          reports,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error generating progress reports:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
