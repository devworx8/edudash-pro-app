/**
 * Context-Aware Resource Tool
 * 
 * Suggests relevant lessons, textbooks, and resources when students struggle.
 * Integrates with school library and curriculum materials.
 * 
 * **Features:**
 * - Suggest relevant lessons from school library
 * - Recommend textbook chapters/pages
 * - Find similar solved problems
 * - Link to curriculum resources
 * - Match by topic, grade level, and learning style
 * 
 * **How it works:**
 * 1. Analyzes current conversation topic
 * 2. Queries school's lesson library and resources
 * 3. Matches by subject, grade, topic relevance
 * 4. Returns curated list of helpful materials
 * 
 * **Security:**
 * - Only shows resources available to user's school
 * - Respects content access permissions
 * - RLS enforced on lessons and resources
 */

import { Tool, ToolCategory, RiskLevel, ToolExecutionContext, ToolExecutionResult } from '../types';
import { assertSupabase } from '@/lib/supabase';

export const ContextAwareResourceTool: Tool = {
  id: 'context_aware_resources',
  name: 'Context-Aware Resource Finder',
  description: 'Finds and suggests relevant lessons, textbooks, and study materials when students need help. Matches resources to current topic, grade level, and learning needs. Helps students discover materials they might have missed.',
  category: 'education' as ToolCategory,
  riskLevel: 'low' as RiskLevel,
  
  allowedRoles: ['superadmin', 'principal', 'teacher', 'parent', 'student'],
  requiredTier: undefined, // Available to all tiers
  
  parameters: [
    {
      name: 'action',
      type: 'string',
      description: 'Type of resource search',
      required: true,
      enum: ['find_lessons', 'find_homework', 'find_similar_problems', 'find_textbook_refs'],
    },
    {
      name: 'topic',
      type: 'string',
      description: 'Topic or concept to find resources for',
      required: true,
    },
    {
      name: 'subject',
      type: 'string',
      description: 'Subject area (Mathematics, English, Science, etc.)',
      required: false,
    },
    {
      name: 'grade',
      type: 'string',
      description: 'Grade level (R, 1-12)',
      required: false,
    },
    {
      name: 'difficulty',
      type: 'string',
      description: 'Difficulty level preference',
      required: false,
      enum: ['easier', 'same', 'harder'],
    },
    {
      name: 'max_results',
      type: 'number',
      description: 'Maximum number of resources to return (default: 5)',
      required: false,
      validation: {
        min: 1,
        max: 20,
      },
    },
  ],

  claudeToolDefinition: {
    name: 'context_aware_resources',
    description: 'Finds relevant lessons, homework, and study materials from the school library. Use this when a student struggles with a topic and could benefit from additional resources. Returns lessons, similar problems, and textbook references matched to their needs.',
    input_schema: {
      type: 'object' as const,
      properties: {
        action: {
          type: 'string',
          enum: ['find_lessons', 'find_homework', 'find_similar_problems', 'find_textbook_refs'],
          description: 'find_lessons: Teacher-created lessons | find_homework: Practice assignments | find_similar_problems: Solved examples | find_textbook_refs: Textbook chapters',
        },
        topic: {
          type: 'string',
          description: 'The specific topic or concept (e.g., "fractions", "photosynthesis", "verbs")',
        },
        subject: {
          type: 'string',
          description: 'Subject area: Mathematics, English, Science, etc.',
        },
        grade: {
          type: 'string',
          description: 'Grade level: R, 1, 2, 3... 12',
        },
        difficulty: {
          type: 'string',
          enum: ['easier', 'same', 'harder'],
          description: 'easier: Simpler resources | same: Current level | harder: More challenging',
        },
        max_results: {
          type: 'number',
          description: 'Number of resources to return (1-20, default 5)',
        },
      },
      required: ['action', 'topic'],
    },
  },

  async execute(
    parameters: Record<string, any>,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const client = assertSupabase();
    const { action, topic, subject, grade, difficulty, max_results = 5 } = parameters;

    try {
      switch (action) {
        case 'find_lessons':
          return await findLessons(client, context, topic, subject, grade, max_results);
        
        case 'find_homework':
          return await findHomework(client, context, topic, subject, grade, max_results);
        
        case 'find_similar_problems':
          return await findSimilarProblems(client, context, topic, subject, max_results);
        
        case 'find_textbook_refs':
          return await findTextbookReferences(client, context, topic, subject, grade, max_results);
        
        default:
          return {
            success: false,
            error: `Unknown action: ${action}`,
          };
      }
    } catch (error: any) {
      return {
        success: false,
        error: `Resource search failed: ${error.message}`,
      };
    }
  },
};

/**
 * Find relevant lessons from school library
 */
async function findLessons(
  client: any,
  context: ToolExecutionContext,
  topic: string,
  subject: string | undefined,
  grade: string | undefined,
  maxResults: number
): Promise<ToolExecutionResult> {
  // Get user's organization
  const organizationId = context.organizationId;
  
  if (!organizationId) {
    return {
      success: false,
      error: 'Organization context required',
    };
  }

  // Search lessons table
  let query = client
    .from('lessons')
    .select('id, title, description, subject, grade_level, content_url, created_at, ai_generated_metadata')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .or(`title.ilike.%${topic}%,description.ilike.%${topic}%,ai_generated_metadata->>tags.ilike.%${topic}%`)
    .limit(maxResults);

  if (subject) {
    query = query.eq('subject', subject);
  }

  if (grade) {
    query = query.eq('grade_level', grade);
  }

  const { data: lessons, error } = await query.order('created_at', { ascending: false });

  if (error) throw error;

  if (!lessons || lessons.length === 0) {
    return {
      success: true,
      data: {
        resources: [],
        message: `No lessons found for "${topic}". Try asking your teacher to create one!`,
      },
    };
  }

  return {
    success: true,
    data: {
      resources: lessons.map((lesson: any) => ({
        type: 'lesson',
        id: lesson.id,
        title: lesson.title,
        description: lesson.description,
        subject: lesson.subject,
        grade: lesson.grade_level,
        url: lesson.content_url,
        relevance: calculateRelevance(lesson, topic),
      })),
      total: lessons.length,
      suggestion: `I found ${lessons.length} lesson(s) about ${topic}. Would you like me to explain any of them?`,
    },
  };
}

/**
 * Find relevant homework assignments
 */
async function findHomework(
  client: any,
  context: ToolExecutionContext,
  topic: string,
  subject: string | undefined,
  grade: string | undefined,
  maxResults: number
): Promise<ToolExecutionResult> {
  const organizationId = context.organizationId;
  
  if (!organizationId) {
    return {
      success: false,
      error: 'Organization context required',
    };
  }

  // For students, get their class assignments
  // For others, search across organization
  let query = client
    .from('homework_assignments')
    .select('id, title, description, subject, due_date, class_id, classes!homework_assignments_class_id_fkey(name, grade_level)')
    .or(`title.ilike.%${topic}%,description.ilike.%${topic}%`)
    .limit(maxResults);

  if (context.role === 'student') {
    // Get student's class
    const { data: student } = await client
      .from('students')
      .select('class_id')
      .eq('user_id', context.userId)
      .single();

    if (student?.class_id) {
      query = query.eq('class_id', student.class_id);
    }
  }

  if (subject) {
    query = query.eq('subject', subject);
  }

  const { data: homework, error } = await query.order('due_date', { ascending: true });

  if (error) throw error;

  return {
    success: true,
    data: {
      resources: homework?.map((hw: any) => ({
        type: 'homework',
        id: hw.id,
        title: hw.title,
        description: hw.description,
        subject: hw.subject,
        due_date: hw.due_date,
        class: hw.classes?.name,
        grade: hw.classes?.grade_level,
      })) || [],
      total: homework?.length || 0,
    },
  };
}

/**
 * Find similar solved problems
 */
async function findSimilarProblems(
  client: any,
  context: ToolExecutionContext,
  topic: string,
  subject: string | undefined,
  maxResults: number
): Promise<ToolExecutionResult> {
  // Query submitted homework for solved problems on this topic
  const organizationId = context.organizationId;
  
  if (!organizationId) {
    return {
      success: false,
      error: 'Organization context required',
    };
  }

  // Find completed homework submissions with feedback
  let query = client
    .from('homework_submissions')
    .select(`
      id,
      content,
      ai_feedback,
      score,
      homework_assignments!homework_submissions_homework_assignment_id_fkey(title, subject, description)
    `)
    .eq('status', 'graded')
    .gte('score', 80) // Only show well-solved problems
    .limit(maxResults);

  if (subject) {
    query = query.eq('homework_assignments.subject', subject);
  }

  const { data: submissions, error } = await query;

  if (error) throw error;

  // Filter submissions that mention the topic
  const relevantSubmissions = submissions?.filter((sub: any) => {
    const searchText = `${sub.homework_assignments?.title} ${sub.homework_assignments?.description} ${sub.content}`.toLowerCase();
    return searchText.includes(topic.toLowerCase());
  }) || [];

  return {
    success: true,
    data: {
      resources: relevantSubmissions.map((sub: any) => ({
        type: 'solved_problem',
        title: sub.homework_assignments?.title,
        subject: sub.homework_assignments?.subject,
        solution_snippet: sub.content?.substring(0, 200),
        score: sub.score,
        feedback: sub.ai_feedback,
      })),
      total: relevantSubmissions.length,
      suggestion: relevantSubmissions.length > 0 
        ? `I found ${relevantSubmissions.length} well-solved problem(s) similar to this. Would you like to see how they were solved?`
        : "No solved examples found yet. Let's work through this problem together!",
    },
  };
}

/**
 * Find textbook references
 */
async function findTextbookReferences(
  client: any,
  context: ToolExecutionContext,
  topic: string,
  subject: string | undefined,
  grade: string | undefined,
  maxResults: number
): Promise<ToolExecutionResult> {
  // This would integrate with a textbook content database
  // For now, return CAPS curriculum references
  
  const organizationId = context.organizationId;
  
  if (!organizationId) {
    return {
      success: false,
      error: 'Organization context required',
    };
  }

  // Query curriculum_content table if available
  let query = client
    .from('curriculum_content')
    .select('id, title, description, subject, grade, chapter, page_reference')
    .or(`title.ilike.%${topic}%,description.ilike.%${topic}%`)
    .limit(maxResults);

  if (subject) {
    query = query.eq('subject', subject);
  }

  if (grade) {
    query = query.eq('grade', grade);
  }

  const { data: content, error } = await query;

  // If table doesn't exist or query fails, return generic CAPS reference
  if (error || !content || content.length === 0) {
    return {
      success: true,
      data: {
        resources: [],
        message: `For "${topic}", check your textbook's table of contents or ask your teacher for the relevant chapter.`,
        caps_reference: `This topic is typically covered in ${subject || 'your textbook'} for Grade ${grade || 'your grade level'}`,
      },
    };
  }

  return {
    success: true,
    data: {
      resources: content.map((item: any) => ({
        type: 'textbook',
        title: item.title,
        description: item.description,
        subject: item.subject,
        grade: item.grade,
        chapter: item.chapter,
        page: item.page_reference,
      })),
      total: content.length,
    },
  };
}

/**
 * Calculate relevance score for a resource
 */
function calculateRelevance(resource: any, topic: string): number {
  const topicLower = topic.toLowerCase();
  const titleMatch = resource.title?.toLowerCase()?.includes(topicLower);
  const descMatch = resource.description?.toLowerCase()?.includes(topicLower);
  const tagsMatch = resource.ai_generated_metadata?.tags?.some((tag: string) => 
    tag.toLowerCase().includes(topicLower)
  );

  let score = 0;
  if (titleMatch) score += 3;
  if (descMatch) score += 2;
  if (tagsMatch) score += 1;

  return score;
}
