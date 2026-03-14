/**
 * ParentToolRegistry
 * 
 * Extends DashToolRegistry with parent-specific tools for learning support.
 * Tools help parents assist their children with homework, studying, and school communication.
 */

import { DashToolRegistry } from '../modules/DashToolRegistry';
import { assertSupabase } from '@/lib/supabase';
import { router } from 'expo-router';
import { logger } from '@/lib/logger';

export class ParentToolRegistry extends DashToolRegistry {
  constructor() {
    super();
    this.registerParentTools();
  }

  private registerParentTools(): void {
    // Tool 1: Get child learning context
    this.register({
      name: 'get_child_learning_context',
      description: 'Retrieves comprehensive learning data for a child including homework, attendance, and progress to provide contextual help',
      parameters: {
        type: 'object',
        properties: {
          student_id: { 
            type: 'string', 
            description: 'Child student ID' 
          },
          include_homework: { 
            type: 'boolean', 
            description: 'Include pending homework assignments' 
          },
          include_attendance: { 
            type: 'boolean', 
            description: 'Include attendance records' 
          },
          days_back: { 
            type: 'number', 
            description: 'Number of days of history to include (default 30)' 
          }
        },
        required: ['student_id']
      },
      risk: 'low',
      execute: async (args: any) => {
        const client = assertSupabase();
        const context: any = {};

        try {
          // Get student basic info with class details
          const { data: student, error: studentError } = await client
            .from('students')
            .select('first_name, last_name, date_of_birth, class_id, classes!students_class_id_fkey(name, grade_level)')
            .eq('id', args.student_id)
            .single();

          if (studentError) throw studentError;
          if (!student) {
            return {
              success: false,
              error: 'Student not found'
            };
          }

          context.student = student;

          // Get pending homework if requested
          if (args.include_homework && student.class_id) {
            const { data: homework } = await client
              .from('homework_assignments')
              .select('id, title, description, due_date, subject')
              .eq('class_id', student.class_id)
              .gte('due_date', new Date().toISOString())
              .order('due_date', { ascending: true })
              .limit(5);

            context.pending_homework = homework || [];
          }

          // Get attendance if requested
          if (args.include_attendance) {
            const daysBack = args.days_back || 30;
            const startDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

            const { data: attendance } = await client
              .from('attendance')
              .select('attendance_date, status')
              .eq('student_id', args.student_id)
              .gte('attendance_date', startDate)
              .order('attendance_date', { ascending: false });

            context.attendance_summary = {
              records: attendance || [],
              present_count: attendance?.filter((a: any) => a.status === 'present').length || 0,
              total_days: attendance?.length || 0
            };
          }

          logger.info(`[ParentToolRegistry] Retrieved learning context for ${student.first_name}`);

          return {
            success: true,
            data: context,
            message: `Retrieved learning context for ${student.first_name}`
          };
        } catch (error: any) {
          logger.error('[ParentToolRegistry] Failed to retrieve child learning context:', error);
          return {
            success: false,
            error: error.message,
            message: 'Failed to retrieve child learning context'
          };
        }
      }
    });

    // Tool 2: Generate practice problems
    this.register({
      name: 'generate_practice_problems',
      description: 'Creates practice problems for a specific subject and grade level to help children learn',
      parameters: {
        type: 'object',
        properties: {
          subject: { 
            type: 'string', 
            description: 'Subject (math, science, language, etc.)' 
          },
          grade_level: { 
            type: 'number', 
            description: 'Grade level (1-12)' 
          },
          topic: { 
            type: 'string', 
            description: 'Specific topic within subject' 
          },
          difficulty: { 
            type: 'string', 
            enum: ['easy', 'medium', 'hard'],
            description: 'Difficulty level'
          },
          count: { 
            type: 'number', 
            description: 'Number of problems (default 5)' 
          }
        },
        required: ['subject', 'grade_level', 'topic']
      },
      risk: 'low',
      execute: async (args: any) => {
        try {
          const client = assertSupabase();
          const count = args.count || 5;
          const difficulty = args.difficulty || 'medium';

          // Generate problems using AI
          const { data, error } = await client.functions.invoke('ai-gateway', {
            body: {
              action: 'general_assistance',
              messages: [{
                role: 'user',
                content: `Generate ${count} ${difficulty} difficulty practice problems for:
Subject: ${args.subject}
Grade Level: ${args.grade_level}
Topic: ${args.topic}

Format each problem with:
1. Problem statement
2. Difficulty indicator
3. Learning objective

Return as a JSON array: [{"problem": "...", "difficulty": "...", "objective": "..."}]

IMPORTANT: Return ONLY the JSON array, no other text.`
              }],
              model: 'claude-haiku-4-5-20251001',
              maxTokens: 2000
            }
          });

          if (error) throw error;

          // Parse AI response
          let problems = [];
          try {
            const content = data.content || '';
            const jsonMatch = content.match(/\[[\s\S]*\]/);
            problems = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
          } catch (parseError) {
            // Fallback: treat as plain text
            logger.warn('[ParentToolRegistry] Could not parse problems as JSON, using fallback');
            problems = [{ 
              problem: data.content, 
              difficulty: difficulty, 
              objective: args.topic 
            }];
          }

          logger.info(`[ParentToolRegistry] Generated ${problems.length} practice problems`);

          return {
            success: true,
            data: { problems, count: problems.length },
            message: `Generated ${problems.length} practice problems`
          };
        } catch (error: any) {
          logger.error('[ParentToolRegistry] Failed to generate practice problems:', error);
          return {
            success: false,
            error: error.message,
            message: 'Failed to generate practice problems'
          };
        }
      }
    });

    // Tool 3: Schedule study reminder
    this.register({
      name: 'schedule_study_reminder',
      description: 'Creates a reminder for study session or homework deadline to help parents manage their child\'s learning schedule',
      parameters: {
        type: 'object',
        properties: {
          title: { 
            type: 'string', 
            description: 'Reminder title' 
          },
          description: { 
            type: 'string', 
            description: 'Details about what to study' 
          },
          due_date: { 
            type: 'string', 
            description: 'ISO date string for reminder' 
          },
          student_id: { 
            type: 'string', 
            description: 'Child student ID' 
          },
          priority: { 
            type: 'string', 
            enum: ['low', 'medium', 'high'], 
            description: 'Priority level' 
          }
        },
        required: ['title', 'due_date', 'student_id']
      },
      risk: 'low',
      execute: async (args: any) => {
        try {
          const client = assertSupabase();
          const { data: authUser } = await client.auth.getUser();

          if (!authUser.user) {
            return {
              success: false,
              error: 'User not authenticated'
            };
          }

          // Resolve parent profile id using auth_user_id (fallback to id for legacy rows)
          const { data: parentByAuth } = await client
            .from('profiles')
            .select('id, auth_user_id')
            .eq('auth_user_id', authUser.user.id)
            .maybeSingle();
          const parentProfile = parentByAuth
            ? parentByAuth
            : (await client
                .from('profiles')
                .select('id, auth_user_id')
                .eq('id', authUser.user.id)
                .maybeSingle()).data;

          if (!parentProfile) {
            return {
              success: false,
              error: 'Parent user not found'
            };
          }

          // Create task in tasks table
          const { data: task, error } = await client
            .from('tasks')
            .insert({
              title: args.title,
              description: args.description || '',
              due_date: args.due_date,
              assigned_to: parentProfile.id,
              status: 'pending',
              priority: args.priority || 'medium',
              metadata: {
                student_id: args.student_id,
                type: 'study_reminder',
                created_by: 'dash_ai'
              }
            })
            .select()
            .single();

          if (error) throw error;

          logger.info(`[ParentToolRegistry] Created study reminder: ${task.title}`);

          return {
            success: true,
            data: { task_id: task.id, title: task.title },
            message: `Reminder scheduled for ${new Date(args.due_date).toLocaleDateString()}`
          };
        } catch (error: any) {
          logger.error('[ParentToolRegistry] Failed to schedule reminder:', error);
          return {
            success: false,
            error: error.message,
            message: 'Failed to schedule reminder'
          };
        }
      }
    });

    // Tool 4: Compose message to teacher
    this.register({
      name: 'compose_teacher_message',
      description: 'Drafts a professional message to the child\'s teacher (requires parent review before sending)',
      parameters: {
        type: 'object',
        properties: {
          student_id: { 
            type: 'string', 
            description: 'Child student ID' 
          },
          subject: { 
            type: 'string', 
            description: 'Message subject' 
          },
          message_type: { 
            type: 'string', 
            enum: ['question', 'concern', 'update', 'request'],
            description: 'Type of message'
          },
          topic: { 
            type: 'string', 
            description: 'What the message is about' 
          },
          tone: { 
            type: 'string', 
            enum: ['formal', 'friendly', 'urgent'], 
            description: 'Message tone' 
          }
        },
        required: ['student_id', 'subject', 'topic']
      },
      risk: 'medium',
      requiresConfirmation: true,
      execute: async (args: any) => {
        try {
          const client = assertSupabase();

          // Get student and teacher info
          const { data: student, error: studentError } = await client
            .from('students')
            .select('first_name, last_name, class_id, classes!students_class_id_fkey(teacher_id, teacher:profiles!classes_teacher_id_fkey(first_name, last_name))')
            .eq('id', args.student_id)
            .single();

          if (studentError) throw studentError;

          if (!student || !student.classes) {
            return {
              success: false,
              error: 'Student or teacher not found'
            };
          }

          // Generate message using AI
          const { data, error } = await client.functions.invoke('ai-gateway', {
            body: {
              action: 'general_assistance',
              messages: [{
                role: 'user',
                content: `Compose a ${args.tone || 'friendly'} message from a parent to their child's teacher:

Student: ${student.first_name} ${student.last_name}
Subject: ${args.subject}
Type: ${args.message_type || 'question'}
Topic: ${args.topic}

Write a clear, respectful message that:
1. Greets the teacher professionally
2. States the purpose clearly
3. Provides context
4. Asks specific questions or makes requests
5. Thanks the teacher and closes politely

Keep it concise (under 200 words).`
              }],
              model: 'claude-haiku-4-5-20251001',
              maxTokens: 500
            }
          });

          if (error) throw error;

          logger.info(`[ParentToolRegistry] Composed teacher message draft`);

          return {
            success: true,
            data: {
              draft_message: data.content,
              teacher_name: `${(student.classes as any).teacher?.first_name || ''} ${(student.classes as any).teacher?.last_name || ''}`.trim() || 'Teacher',
              student_name: `${student.first_name} ${student.last_name}`,
              action_required: 'review_and_send'
            },
            message: 'Message draft created - please review before sending'
          };
        } catch (error: any) {
          logger.error('[ParentToolRegistry] Failed to compose message:', error);
          return {
            success: false,
            error: error.message,
            message: 'Failed to compose message draft'
          };
        }
      }
    });

    // Tool 5: Navigate to learning resource
    this.register({
      name: 'navigate_to_learning_resource',
      description: 'Opens a specific screen/resource for parent learning support (homework, attendance, progress reports, etc.)',
      parameters: {
        type: 'object',
        properties: {
          destination: {
            type: 'string',
            enum: [
              'homework_list',
              'attendance_history',
              'progress_reports',
              'message_teacher',
              'picture_of_progress',
              'child_profile'
            ],
            description: 'Where to navigate'
          },
          student_id: { 
            type: 'string', 
            description: 'Child student ID for context (optional)' 
          }
        },
        required: ['destination']
      },
      risk: 'low',
      execute: async (args: any) => {
        try {
          const routes: Record<string, string> = {
            homework_list: '/screens/parent-homework',
            attendance_history: '/screens/parent-attendance',
            progress_reports: '/screens/parent-reports',
            message_teacher: '/screens/parent-messages',
            picture_of_progress: '/picture-of-progress',
            child_profile: '/screens/parent-children'
          };

          const route = routes[args.destination];
          if (!route) {
            return {
              success: false,
              error: `Unknown destination: ${args.destination}`
            };
          }

          // Add student context if provided
          const finalRoute = args.student_id 
            ? `${route}?studentId=${args.student_id}`
            : route;

          router.push(finalRoute as any);

          logger.info(`[ParentToolRegistry] Navigated to ${args.destination}`);

          return {
            success: true,
            data: { route: finalRoute },
            message: `Navigated to ${args.destination}`
          };
        } catch (error: any) {
          logger.error('[ParentToolRegistry] Navigation failed:', error);
          return {
            success: false,
            error: error.message,
            message: 'Navigation failed'
          };
        }
      }
    });

    logger.info('[ParentToolRegistry] Registered 5 parent-specific tools');
  }
}
