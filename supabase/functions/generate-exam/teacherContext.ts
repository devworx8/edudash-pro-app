import { createClient } from 'npm:@supabase/supabase-js@2';
import { isRecent, matchesSubject, pickTopTopics, sanitizeTopic } from './examUtils.ts';

export type ExamContextSummary = {
  assignmentCount: number;
  lessonCount: number;
  focusTopics: string[];
  weakTopics: string[];
  sourceAssignmentIds: string[];
  sourceLessonIds: string[];
  intentTaggedCount?: number;
};

type LessonRow = {
  id: string;
  title: string | null;
  subject: string | null;
  objectives: string[] | null;
  content: string | null;
  description: string | null;
};

type HomeworkRow = {
  id: string;
  title: string | null;
  subject: string | null;
  instructions: string | null;
  description: string | null;
  metadata: unknown;
  due_date: string | null;
  created_at: string | null;
  assigned_at: string | null;
  class_id: string | null;
  lesson_id: string | null;
  is_published: boolean | null;
  is_active: boolean | null;
  status: string | null;
  preschool_id: string | null;
};

type HomeworkSubmissionRow = {
  assignment_id: string | null;
  homework_assignment_id: string | null;
  grade: number | null;
  feedback: string | null;
  ai_feedback: string | null;
  status: string | null;
  submitted_at: string | null;
};

type LessonAssignmentRow = {
  id: string;
  lesson_id: string | null;
  due_date: string | null;
  assigned_at: string | null;
  status: string | null;
  class_id: string | null;
  student_id: string | null;
  preschool_id: string | null;
  notes: string | null;
  lessons: LessonRow | LessonRow[] | null;
};

type AuthorizedRequestScope = {
  effectiveClassId: string | null;
  effectiveSchoolId: string | null;
  effectiveStudentId: string | null;
};
function addWeightedTopic(map: Map<string, number>, topic: string | null | undefined, weight: number) {
  const clean = sanitizeTopic(topic);
  if (!clean) return;

  const key = clean.toLowerCase();
  const previous = map.get(key) || 0;
  map.set(key, previous + weight);
}

function hydrateFocusFromMetadata(map: Map<string, number>, metadata: unknown, fallbackTitle: string | null, fallbackWeight: number) {
  if (!metadata || typeof metadata !== 'object') {
    addWeightedTopic(map, fallbackTitle, fallbackWeight);
    return;
  }

  const record = metadata as Record<string, unknown>;
  const topics = Array.isArray(record.topics)
    ? record.topics
    : Array.isArray(record.focus_topics)
    ? record.focus_topics
    : null;

  if (topics && topics.length > 0) {
    topics.forEach((item) => addWeightedTopic(map, String(item || ''), 4));
    return;
  }

  addWeightedTopic(map, fallbackTitle, fallbackWeight);
}

export async function resolveTeacherContext(
  supabase: ReturnType<typeof createClient>,
  scope: AuthorizedRequestScope,
  payload: {
    subject: string;
    useTeacherContext: boolean;
    lookbackDays: number;
    examIntentMode: 'teacher_weighted' | 'caps_only';
  },
): Promise<ExamContextSummary> {
  const emptySummary: ExamContextSummary = {
    assignmentCount: 0,
    lessonCount: 0,
    focusTopics: [],
    weakTopics: [],
    sourceAssignmentIds: [],
    sourceLessonIds: [],
  };

  if (!payload.useTeacherContext) return emptySummary;

  const now = Date.now();
  const lookbackMs = now - payload.lookbackDays * 24 * 60 * 60 * 1000;

  let homeworkQuery = supabase
    .from('homework_assignments')
    .select('id, title, subject, instructions, description, metadata, due_date, created_at, assigned_at, class_id, lesson_id, is_published, is_active, status, preschool_id')
    .order('created_at', { ascending: false })
    .limit(150);

  if (scope.effectiveClassId) {
    homeworkQuery = homeworkQuery.eq('class_id', scope.effectiveClassId);
  }

  if (scope.effectiveSchoolId) {
    homeworkQuery = homeworkQuery.eq('preschool_id', scope.effectiveSchoolId);
  }

  const { data: homeworkRowsRaw, error: homeworkError } = await homeworkQuery;
  if (homeworkError) {
    console.warn('[generate-exam] homework context query failed', homeworkError.message);
  }

  const homeworkRows = ((homeworkRowsRaw || []) as HomeworkRow[])
    .filter((row) => {
      if (!matchesSubject(row.subject || row.title || row.description, payload.subject)) return false;
      if (!isRecent(row, lookbackMs)) return false;

      const status = String(row.status || '').toLowerCase();
      const published = row.is_published === true || row.is_active === true;
      const statusActive = ['published', 'active', 'assigned', 'open', 'ongoing'].includes(status);
      return published || statusActive;
    })
    .slice(0, 40);

  const assignmentIds = homeworkRows.map((row) => row.id);

  let submissionRows: HomeworkSubmissionRow[] = [];
  if (scope.effectiveStudentId && assignmentIds.length > 0) {
    let submissionQuery = supabase
      .from('homework_submissions')
      .select('assignment_id, homework_assignment_id, grade, feedback, ai_feedback, status, submitted_at')
      .eq('student_id', scope.effectiveStudentId)
      .in('assignment_id', assignmentIds)
      .order('submitted_at', { ascending: false })
      .limit(100);

    if (scope.effectiveSchoolId) {
      submissionQuery = submissionQuery.eq('preschool_id', scope.effectiveSchoolId);
    }

    const { data: submissionData, error: submissionError } = await submissionQuery;
    if (submissionError) {
      console.warn('[generate-exam] submission context query failed', submissionError.message);
    } else {
      submissionRows = (submissionData || []) as HomeworkSubmissionRow[];
    }
  }

  let lessonQuery = supabase
    .from('lesson_assignments')
    .select('id, lesson_id, due_date, assigned_at, status, class_id, student_id, preschool_id, notes, lessons(id, title, subject, objectives, content, description)')
    .order('assigned_at', { ascending: false })
    .limit(150);

  if (scope.effectiveClassId) {
    lessonQuery = lessonQuery.eq('class_id', scope.effectiveClassId);
  } else if (scope.effectiveStudentId) {
    lessonQuery = lessonQuery.eq('student_id', scope.effectiveStudentId);
  }

  if (scope.effectiveSchoolId) {
    lessonQuery = lessonQuery.eq('preschool_id', scope.effectiveSchoolId);
  }

  const { data: lessonRowsRaw, error: lessonError } = await lessonQuery;
  if (lessonError) {
    console.warn('[generate-exam] lesson context query failed', lessonError.message);
  }

  const lessonRows = ((lessonRowsRaw || []) as LessonAssignmentRow[])
    .filter((row) => {
      if (!isRecent(row, lookbackMs)) return false;
      const status = String(row.status || '').toLowerCase();
      const active = ['assigned', 'published', 'active', 'completed', 'in_progress'].includes(status) || !status;
      if (!active) return false;

      const lesson = Array.isArray(row.lessons) ? row.lessons[0] : row.lessons;
      if (!lesson) return false;
      return matchesSubject(lesson.subject || lesson.title || lesson.description || row.notes, payload.subject);
    })
    .slice(0, 40);

  const focusMap = new Map<string, number>();
  const weakMap = new Map<string, number>();
  const intentTaggedIds = new Set<string>();

  const assignmentById = new Map<string, HomeworkRow>();
  homeworkRows.forEach((assignment) => {
    assignmentById.set(assignment.id, assignment);
    const metadata = assignment.metadata && typeof assignment.metadata === 'object'
      ? (assignment.metadata as Record<string, unknown>)
      : null;
    const isExamIntent =
      metadata?.is_test_relevant === true ||
      metadata?.exam_intent === true ||
      metadata?.test_relevant === true ||
      metadata?.priority_weight === 'high';

    if (isExamIntent) {
      intentTaggedIds.add(assignment.id);
    }

    const baseTitleWeight =
      payload.examIntentMode === 'teacher_weighted' && isExamIntent ? 8 : 5;
    addWeightedTopic(focusMap, assignment.title, baseTitleWeight);
    addWeightedTopic(focusMap, assignment.subject, 3);

    if (metadata && Array.isArray(metadata.caps_topics)) {
      metadata.caps_topics.forEach((topic) => addWeightedTopic(focusMap, String(topic || ''), 5));
    }

    hydrateFocusFromMetadata(
      focusMap,
      assignment.metadata,
      assignment.title,
      payload.examIntentMode === 'teacher_weighted' && isExamIntent ? 6 : 3,
    );
  });

  lessonRows.forEach((assignment) => {
    const lesson = Array.isArray(assignment.lessons) ? assignment.lessons[0] : assignment.lessons;
    if (!lesson) return;
    addWeightedTopic(focusMap, lesson.title, 4);
    addWeightedTopic(focusMap, lesson.subject, 2);
    if (Array.isArray(lesson.objectives)) {
      lesson.objectives.forEach((objective) => addWeightedTopic(focusMap, objective, 3));
    }
  });

  submissionRows.forEach((submission) => {
    const grade = Number(submission.grade ?? NaN);
    const sourceId = submission.assignment_id || submission.homework_assignment_id || '';
    const linkedAssignment = assignmentById.get(sourceId);

    if (Number.isFinite(grade) && grade < 60) {
      addWeightedTopic(weakMap, linkedAssignment?.title || linkedAssignment?.subject || null, 4);
    }

    const status = String(submission.status || '').toLowerCase();
    if (status.includes('late') || status.includes('missing')) {
      addWeightedTopic(weakMap, linkedAssignment?.title || linkedAssignment?.subject || null, 2);
    }
  });

  const lessonIds = lessonRows
    .map((item) => {
      const lesson = Array.isArray(item.lessons) ? item.lessons[0] : item.lessons;
      return lesson?.id || item.lesson_id || item.id;
    })
    .filter((value): value is string => Boolean(value));

  return {
    assignmentCount: assignmentIds.length,
    lessonCount: lessonIds.length,
    focusTopics: pickTopTopics(focusMap, 8),
    weakTopics: pickTopTopics(weakMap, 6),
    sourceAssignmentIds: assignmentIds,
    sourceLessonIds: lessonIds,
    intentTaggedCount: intentTaggedIds.size,
  };
}

/**
 * Returns CAPS-aligned subject-specific section structure instructions.
 * Used to ensure Dash generates exams in the same format as our reference designs.
 */
