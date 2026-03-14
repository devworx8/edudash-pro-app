/**
 * Child Academic Snapshot Tool
 *
 * Gives Dash AI a comprehensive, real-time view of a child's academic
 * performance so it can provide targeted support to parents of struggling
 * Grade 4+ students.
 *
 * Tools registered:
 *  - get_child_academic_snapshot  (comprehensive grades + attendance + homework)
 *  - generate_study_plan          (personalised CAPS-aligned study plan)
 *
 * Security: all queries respect RLS — parents only see their own children.
 */

import type { Tool, ToolCategory, RiskLevel, ToolExecutionContext, ToolExecutionResult } from '../types';
import { assertSupabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

// ─── helpers ─────────────────────────────────────────────────────────────────

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

function performanceLabel(score: number): string {
  if (score >= 80) return 'excellent';
  if (score >= 70) return 'good';
  if (score >= 60) return 'satisfactory';
  if (score >= 50) return 'needs_support';
  return 'struggling';
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().split('T')[0];
}

// ─── Tool 1: get_child_academic_snapshot ─────────────────────────────────────

export const GetChildAcademicSnapshotTool: Tool = {
  id: 'get_child_academic_snapshot',
  name: 'Get Child Academic Snapshot',
  description:
    'Retrieves a comprehensive academic snapshot for a specific child: ' +
    'grades per subject (with trend), attendance rate, pending homework, ' +
    'and automatically flags struggling subjects (avg < 60%). ' +
    'Call this whenever a parent asks about their child\'s progress, ' +
    'grades, performance, struggles, or needs help with a subject.',
  category: 'education' as ToolCategory,
  riskLevel: 'low' as RiskLevel,
  allowedRoles: ['parent', 'student', 'teacher', 'principal', 'superadmin'],
  requiredTier: undefined,

  parameters: [
    { name: 'student_id', type: 'string', description: 'Student ID', required: true },
    {
      name: 'days_back',
      type: 'number',
      description: 'Days of history to analyse (default 60)',
      required: false,
    },
  ],

  claudeToolDefinition: {
    name: 'get_child_academic_snapshot',
    description:
      'Get a comprehensive academic snapshot for a child: subject-by-subject grades ' +
      '(with average and trend), attendance %, pending homework count, and which subjects ' +
      'the child is struggling in. Use proactively when a parent mentions their child.',
    input_schema: {
      type: 'object' as const,
      properties: {
        student_id: { type: 'string', description: 'Student ID' },
        days_back: {
          type: 'number',
          description: 'Days of history to include (default 60)',
        },
      },
      required: ['student_id'],
    },
  },

  execute: async (
    args: { student_id: string; days_back?: number },
    _context?: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    const client = assertSupabase();
    const daysBack = args.days_back ?? 60;
    const since = daysAgo(daysBack);

    try {
      // 1. Student + class info
      const { data: student, error: sErr } = await client
        .from('students')
        .select(
          'id, first_name, last_name, date_of_birth, class_id, ' +
          'classes!students_class_id_fkey(name, grade_level)'
        )
        .eq('id', args.student_id)
        .single();

      if (sErr || !student) {
        return { success: false, error: sErr?.message || 'Student not found', data: null };
      }

      const studentRow = student as unknown as {
        id: string;
        first_name: string;
        last_name: string;
        date_of_birth: string | null;
        class_id: string | null;
        classes?: { name: string; grade_level: string } | null;
      };

      const classInfo = studentRow.classes;
      const gradeLevel: string = classInfo?.grade_level ?? 'Unknown';
      const className: string = classInfo?.name ?? 'Unknown';

      // 2. Grades from homework_submissions (joined to get subject)
      const { data: submissions } = await client
        .from('homework_submissions')
        .select(
          'grade, graded_at, homework_assignments!inner(subject, title)'
        )
        .eq('student_id', args.student_id)
        .eq('status', 'graded')
        .not('grade', 'is', null)
        .gte('graded_at', since)
        .order('graded_at', { ascending: false })
        .limit(60);

      // Group grades by subject
      const subjectBuckets: Record<string, { scores: number[]; recent: number[] }> = {};
      const cutoff = daysAgo(21); // last 3 weeks = "recent"

      for (const sub of submissions ?? []) {
        const subject: string = (sub as any).homework_assignments?.subject ?? 'General';
        const grade = typeof (sub as any).grade === 'number' ? (sub as any).grade : null;
        if (grade === null) continue;
        if (!subjectBuckets[subject]) subjectBuckets[subject] = { scores: [], recent: [] };
        subjectBuckets[subject].scores.push(grade);
        if ((sub as any).graded_at >= cutoff) {
          subjectBuckets[subject].recent.push(grade);
        }
      }

      const subjectSummaries = Object.entries(subjectBuckets).map(([subject, b]) => {
        const overallAvg = avg(b.scores);
        const recentAvg = b.recent.length ? avg(b.recent) : overallAvg;
        const trend: 'improving' | 'declining' | 'stable' =
          b.recent.length < 2
            ? 'stable'
            : recentAvg > overallAvg + 5
            ? 'improving'
            : recentAvg < overallAvg - 5
            ? 'declining'
            : 'stable';
        return {
          subject,
          average: overallAvg,
          recentAverage: recentAvg,
          submissionCount: b.scores.length,
          status: performanceLabel(overallAvg),
          trend,
        };
      });

      subjectSummaries.sort((a, b) => a.average - b.average); // weakest first

      const strugglingSubjects = subjectSummaries.filter((s) => s.average < 60);
      const needsSupportSubjects = subjectSummaries.filter(
        (s) => s.average >= 60 && s.average < 70
      );

      // 3. Attendance
      const { data: attendance } = await client
        .from('attendance')
        .select('attendance_date, status')
        .eq('student_id', args.student_id)
        .gte('attendance_date', daysAgo(30))
        .order('attendance_date', { ascending: false });

      const totalDays = attendance?.length ?? 0;
      const presentDays = attendance?.filter((a: any) => a.status === 'present').length ?? 0;
      const attendancePct = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : null;

      // 4. Pending homework
      const { data: pending } = await client
        .from('homework_assignments')
        .select('id, title, subject, due_date')
        .eq('class_id', studentRow.class_id ?? '')
        .gte('due_date', new Date().toISOString())
        .order('due_date', { ascending: true })
        .limit(5);

      // 5. Overdue homework
      const { data: overdue } = await client
        .from('homework_assignments')
        .select('id, title, subject, due_date')
        .eq('class_id', studentRow.class_id ?? '')
        .lt('due_date', new Date().toISOString())
        .order('due_date', { ascending: false })
        .limit(5);

      const snapshot = {
        student: {
          id: studentRow.id,
          name: `${studentRow.first_name} ${studentRow.last_name}`.trim(),
          gradeLevel,
          className,
        },
        academicSummary: {
          subjectsTracked: subjectSummaries.length,
          overallAverage:
            subjectSummaries.length
              ? avg(subjectSummaries.map((s) => s.average))
              : null,
          strugglingSubjects: strugglingSubjects.map((s) => s.subject),
          needsSupportSubjects: needsSupportSubjects.map((s) => s.subject),
        },
        subjectBreakdown: subjectSummaries,
        attendance: {
          periodDays: totalDays,
          attendancePercentage: attendancePct,
          concerningAttendance: attendancePct !== null && attendancePct < 80,
        },
        homework: {
          pendingCount: pending?.length ?? 0,
          pendingItems: pending ?? [],
          overdueCount: overdue?.length ?? 0,
          overdueItems: overdue ?? [],
        },
      };

      logger.info(
        `[ChildAcademicSnapshotTool] Snapshot for ${snapshot.student.name}: ` +
        `${snapshot.academicSummary.strugglingSubjects.length} struggling subjects`
      );

      return {
        success: true,
        data: snapshot,
        error: undefined,
        metadata: { tool_name: 'get_child_academic_snapshot' },
      };
    } catch (err: any) {
      logger.error('[ChildAcademicSnapshotTool] Failed:', err);
      return { success: false, error: err.message, data: null };
    }
  },
};

// ─── Tool 2: generate_study_plan ─────────────────────────────────────────────

export const GenerateStudyPlanTool: Tool = {
  id: 'generate_study_plan',
  name: 'Generate Study Plan',
  description:
    'Creates a personalised, CAPS-aligned study plan for a struggling student. ' +
    'Pass the child\'s name, grade, struggling subjects, and optional time available ' +
    'per week. Returns a structured weekly plan with daily study tasks, CAPS topics ' +
    'to focus on, study tips, and resource suggestions. ' +
    'Use when a parent asks how to help their child improve or study.',
  category: 'education' as ToolCategory,
  riskLevel: 'low' as RiskLevel,
  allowedRoles: ['parent', 'student', 'teacher', 'principal', 'superadmin'],
  requiredTier: undefined,

  parameters: [
    { name: 'child_name', type: 'string', description: 'Child\'s first name', required: true },
    { name: 'grade', type: 'string', description: 'Grade level (e.g. "4", "7", "10")', required: true },
    {
      name: 'struggling_subjects',
      type: 'string',
      description: 'Comma-separated list of subjects needing most support',
      required: true,
    },
    {
      name: 'hours_per_week',
      type: 'number',
      description: 'Study hours available per week (default 5)',
      required: false,
    },
    {
      name: 'learning_style',
      type: 'string',
      description: 'Optional: visual, auditory, kinesthetic, or mixed',
      required: false,
    },
  ],

  claudeToolDefinition: {
    name: 'generate_study_plan',
    description:
      'Generate a personalised CAPS-aligned study plan for a struggling South African student. ' +
      'Produces a structured weekly schedule with specific topics, activities, and study tips ' +
      'calibrated to the child\'s grade and weak areas.',
    input_schema: {
      type: 'object' as const,
      properties: {
        child_name: { type: 'string', description: "Child's first name" },
        grade: { type: 'string', description: 'Grade level (e.g. "4", "7", "10")' },
        struggling_subjects: {
          type: 'string',
          description: 'Comma-separated subjects needing most support',
        },
        hours_per_week: {
          type: 'number',
          description: 'Study hours available per week (default 5)',
        },
        learning_style: {
          type: 'string',
          description: 'Optional learning style: visual, auditory, kinesthetic, or mixed',
        },
      },
      required: ['child_name', 'grade', 'struggling_subjects'],
    },
  },

  execute: async (
    args: {
      child_name: string;
      grade: string;
      struggling_subjects: string;
      hours_per_week?: number;
      learning_style?: string;
    },
    _context?: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    const client = assertSupabase();
    const hoursPerWeek = args.hours_per_week ?? 5;
    const gradeNum = parseInt(args.grade, 10);
    const phase =
      gradeNum <= 3 ? 'Foundation Phase (Grades R-3)' :
      gradeNum <= 6 ? 'Intermediate Phase (Grades 4-6)' :
      gradeNum <= 9 ? 'Senior Phase (Grades 7-9)' :
      'FET Phase (Grades 10-12)';

    const prompt = `You are an expert South African CAPS curriculum tutor creating a personalised study plan.

Student: ${args.child_name}, Grade ${args.grade} (${phase})
Struggling subjects: ${args.struggling_subjects}
Available study time: ${hoursPerWeek} hours per week
Learning style: ${args.learning_style ?? 'mixed'}

Create a practical, encouraging 4-week study plan. Format as JSON:
{
  "overview": "2-sentence encouraging intro for the parent",
  "phase": "${phase}",
  "weeklySchedule": [
    {
      "day": "Monday",
      "duration_minutes": 45,
      "subject": "...",
      "capsTopics": ["specific CAPS topic 1", "topic 2"],
      "activity": "What to do step-by-step",
      "parentRole": "How the parent can help"
    }
  ],
  "subjectFocus": [
    {
      "subject": "...",
      "keyWeaknesses": ["..."],
      "capsAreas": ["SA CAPS curriculum area"],
      "practiceStrategy": "specific technique",
      "dailyPractice": "5-10 minute daily drill",
      "encouragement": "strength-based affirmation"
    }
  ],
  "studyTips": ["tip 1", "tip 2", "tip 3"],
  "progressMilestones": ["Week 1 goal", "Week 2 goal", "Week 4 goal"],
  "resourceSuggestions": ["free SA resource or approach"]
}

Keep it practical for a South African home context. ONLY return the JSON.`;

    try {
      const { data, error } = await client.functions.invoke('ai-gateway', {
        body: {
          action: 'general_assistance',
          messages: [{ role: 'user', content: prompt }],
          model: 'claude-haiku-4-5-20251001',
          maxTokens: 2500,
        },
      });

      if (error) throw error;

      let plan: unknown = null;
      const raw = String(data?.content || '');
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try { plan = JSON.parse(jsonMatch[0]); } catch { plan = { rawPlan: raw }; }
      } else {
        plan = { rawPlan: raw };
      }

      logger.info(`[ChildAcademicSnapshotTool] Study plan generated for ${args.child_name} Grade ${args.grade}`);
      return {
        success: true,
        data: { plan, childName: args.child_name, grade: args.grade },
        error: undefined,
        metadata: { tool_name: 'generate_study_plan' },
      };
    } catch (err: any) {
      logger.error('[ChildAcademicSnapshotTool] Study plan generation failed:', err);
      return { success: false, error: err.message, data: null };
    }
  },
};
