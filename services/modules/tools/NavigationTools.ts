/**
 * Navigation Tools for Dash AI
 * 
 * Tools for document opening, screen navigation, context retrieval, and diagram generation
 */

import { logger } from '@/lib/logger';
import type { AgentTool } from '../DashToolRegistry';

export function registerNavigationTools(register: (tool: AgentTool) => void): void {
  
  // Get screen context tool
  register({
    name: 'get_screen_context',
    description: 'Get information about the current screen and available actions',
    parameters: {
      type: 'object',
      properties: {}
    },
    risk: 'low',
    execute: async () => {
      try {
        const { DashAIAssistant } = await import('@/services/dash-ai/DashAICompat');
        const dash = DashAIAssistant.getInstance();
        
        if (!dash) {
          return { 
            success: false, 
            error: 'Dash not available',
            screen: 'unknown',
            capabilities: [],
            suggestions: []
          };
        }
        
        const ctx = typeof (dash as any).getCurrentScreenContext === 'function'
          ? (dash as any).getCurrentScreenContext()
          : { screen: 'unknown', capabilities: [], suggestions: [] };
        
        return {
          success: true,
          ...ctx
        };
      } catch (error) {
        logger.error('[get_screen_context] Error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get context',
          screen: 'unknown',
          capabilities: [],
          suggestions: []
        };
      }
    }
  });

  // Get active tasks tool
  register({
    name: 'get_active_tasks',
    description: 'Get list of active tasks and their status for the current user',
    parameters: {
      type: 'object',
      properties: {}
    },
    risk: 'low',
    execute: async () => {
      try {
        const { DashAIAssistant } = await import('@/services/dash-ai/DashAICompat');
        const dash = DashAIAssistant.getInstance();
        
        if (!dash) {
          return { 
            success: false, 
            error: 'Dash not available',
            tasks: []
          };
        }
        
        const tasks = typeof dash.getActiveTasks === 'function'
          ? await dash.getActiveTasks()
          : { tasks: [] };
        
        return {
          success: true,
          ...tasks
        };
      } catch (error) {
        logger.error('[get_active_tasks] Error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get tasks',
          tasks: []
        };
      }
    }
  });

  // Open document tool
  register({
    name: 'open_document',
    description: 'Open a document by ID or navigate to a specific screen. Supports PDFs, images, and app screens.',
    parameters: {
      type: 'object',
      properties: {
        document_id: {
          type: 'string',
          description: 'Document ID to open'
        },
        screen: {
          type: 'string', 
          description: 'App screen path to navigate to (e.g., "/homework", "/messages")'
        },
        url: {
          type: 'string',
          description: 'External URL to open'
        }
      },
      required: []
    },
    risk: 'low',
    execute: async (args) => {
      try {
        const router = (await import('expo-router')).router;
        const Linking = (await import('react-native')).Linking;
        
        // Handle URL
        if (args.url) {
          await Linking.openURL(args.url);
          return {
            success: true,
            message: `Opened URL: ${args.url}`,
            action: 'opened_url'
          };
        }
        
        // Handle screen navigation
        if (args.screen) {
          router.push(args.screen as any);
          return {
            success: true,
            message: `Navigated to ${args.screen}`,
            action: 'navigated'
          };
        }
        
        // Handle document ID
        if (args.document_id) {
          const supabase = (await import('@/lib/supabase')).assertSupabase();
          
          // Try to find document in common tables
          const tables = ['documents', 'assignments', 'homework', 'resources'];
          
          for (const table of tables) {
            const { data } = await supabase
              .from(table)
              .select('*')
              .eq('id', args.document_id)
              .single();
            
            if (data) {
              // Open based on document type
              if (data.url || data.file_url) {
                await Linking.openURL(data.url || data.file_url);
                return {
                  success: true,
                  message: `Opened document from ${table}`,
                  document: data,
                  action: 'opened_document'
                };
              }
              
              return {
                success: true,
                document: data,
                message: `Found document in ${table}`,
                action: 'found_document'
              };
            }
          }
          
          return {
            success: false,
            error: `Document not found: ${args.document_id}`
          };
        }
        
        return {
          success: false,
          error: 'No document_id, screen, or url provided'
        };
      } catch (error) {
        logger.error('[open_document] Error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to open document'
        };
      }
    }
  });

  // Generate textbook diagram tool (AI-powered)
  register({
    name: 'generate_textbook_diagram',
    description: `Generate educational diagrams (flowcharts, mind maps, timelines, concept maps) from textbook topics or general educational content. 
      
Use this when students need visual explanations of concepts. Supports:
- Flowcharts (processes, cycles, algorithms)
- Mind maps (topic relationships, brainstorming)
- Timelines (historical events, sequences)
- Concept maps (connections between ideas)
- Sequence diagrams (step-by-step instructions)
- Class diagrams (hierarchies, taxonomies)

The diagrams are rendered using Mermaid syntax and will appear directly in the chat.`,
    parameters: {
      type: 'object',
      properties: {
        textbook_id: {
          type: 'string',
          description: 'Optional: UUID of specific textbook from library'
        },
        grade: {
          type: 'string',
          description: 'Grade level (R, 1-12)'
        },
        subject: {
          type: 'string',
          description: 'Subject (Mathematics, Life Sciences, History, etc.)'
        },
        topic: {
          type: 'string',
          description: 'The specific topic or concept to visualize (e.g., "photosynthesis", "Pythagorean theorem", "French Revolution")'
        },
        diagram_type: {
          type: 'string',
          enum: ['flowchart', 'mindmap', 'timeline', 'concept-map', 'sequence', 'class-diagram'],
          description: 'Type of diagram to generate'
        },
        detail_level: {
          type: 'string',
          enum: ['simple', 'detailed', 'comprehensive'],
          description: 'How detailed the diagram should be (default: detailed)'
        }
      },
      required: ['topic', 'diagram_type']
    },
    risk: 'low',
    execute: async (args, context) => {
      try {
        const { textbook_id, grade, subject, topic, diagram_type, detail_level = 'detailed' } = args;
        
        // Optionally fetch textbook metadata using secure RPC
        let textbookContext = '';
        if (textbook_id && context?.supabase) {
          const { data: result } = await context.supabase
            .rpc('get_textbook_metadata', { p_textbook_id: textbook_id });
          
          if (result?.success && result.data) {
            const textbook = result.data;
            textbookContext = `\nTextbook: ${textbook.title} (Grade ${textbook.grade} ${textbook.subject})`;
          }
        } else if (textbook_id) {
          logger.warn('[generate_textbook_diagram] No Supabase client in context, skipping textbook metadata');
        }

        // Build context string
        const gradeContext = grade ? `Grade ${grade}` : '';
        const subjectContext = subject || '';
        const contextStr = [gradeContext, subjectContext, textbookContext].filter(Boolean).join(', ');

        // Generate diagram using Claude
        const prompt = `You are an educational diagram generator for South African CAPS curriculum students.

Context: ${contextStr || 'General educational content'}
Topic: ${topic}
Diagram Type: ${diagram_type}
Detail Level: ${detail_level}

Generate a ${diagram_type} in Mermaid syntax that explains "${topic}" clearly and accurately.

Requirements:
1. Use proper Mermaid syntax for ${diagram_type}
2. Make it age-appropriate for ${grade || 'the student'}
3. Use clear, simple language
4. Include ${detail_level} level of detail
5. Ensure educational accuracy
6. Use colors and styling for better comprehension

Diagram Guidelines by Type:
- flowchart: Use TB (top-bottom) or LR (left-right) direction, clear decision points
- mindmap: Central concept with branching sub-topics
- timeline: Chronological events with dates/periods
- concept-map: Show relationships with labeled connections
- sequence: Step-by-step process with actors/participants
- class-diagram: Hierarchical structure with inheritance/relationships

Return ONLY the Mermaid code, starting with the diagram type declaration (e.g., flowchart TB).
Do not include \`\`\`mermaid code fences or explanations.`;

        // Get Anthropic client from context or create new one
        let anthropicClient = context?.anthropicClient;
        if (!anthropicClient) {
          const Anthropic = await import('@anthropic-ai/sdk');
          anthropicClient = new Anthropic.default({
            apiKey: process.env.ANTHROPIC_API_KEY!
          });
        }

        const response = await anthropicClient.messages.create({
          model: process.env.EXPO_PUBLIC_ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
          max_tokens: 2000,
          messages: [{
            role: 'user',
            content: prompt
          }]
        });

        const mermaidCode = response.content[0].text.trim();
        
        // Clean up code fences if present
        const cleanedCode = mermaidCode
          .replace(/^```mermaid\n/, '')
          .replace(/\n```$/, '')
          .trim();

        // Log to AI events for telemetry using secure RPC
        if (context?.supabase) {
          await context.supabase.rpc('log_ai_tool_event', {
            p_tool_name: 'generate_textbook_diagram',
            p_metadata: {
              textbook_id,
              grade,
              subject,
              topic,
              diagram_type,
              detail_level,
              tokens_used: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0)
            }
          });
        }

        return {
          success: true,
          diagram_code: cleanedCode,
          diagram_type,
          topic,
          message: `Generated ${diagram_type} diagram for "${topic}". The diagram will render below:

\`\`\`mermaid
${cleanedCode}
\`\`\`

You can ask me to modify the diagram, make it more detailed, or create a different type of visualization!`
        };

      } catch (error: any) {
        logger.error('[generate_textbook_diagram] Error:', error);
        
        return {
          success: false,
          error: `Failed to generate diagram: ${error.message}`,
          message: 'I encountered an error creating the diagram. Please try rephrasing your request or choosing a different diagram type.'
        };
      }
    }
  });

  // Navigate to dashboard section
  register({
    name: 'navigate_to_section',
    description: 'Navigate to a specific section of the dashboard based on user role.',
    parameters: {
      type: 'object',
      properties: {
        section: {
          type: 'string',
          enum: [
            'homework',
            'messages',
            'progress',
            'schedule',
            'assignments',
            'students',
            'parents',
            'teachers',
            'analytics',
            'settings',
            'petty-cash',
            'financial',
            'approvals'
          ],
          description: 'Dashboard section to navigate to'
        }
      },
      required: ['section']
    },
    risk: 'low',
    execute: async (args) => {
      try {
        const router = (await import('expo-router')).router;
        
        const sectionPaths: Record<string, string> = {
          'homework': '/homework',
          'messages': '/messages',
          'progress': '/progress',
          'schedule': '/schedule',
          'assignments': '/assignments',
          'students': '/members',
          'parents': '/members',
          'teachers': '/members',
          'analytics': '/principal-analytics',
          'settings': '/settings',
          'petty-cash': '/petty-cash',
          'financial': '/financial-dashboard',
          'approvals': '/screens/pop-review'
        };
        
        const path = sectionPaths[args.section];
        
        if (!path) {
          return {
            success: false,
            error: `Unknown section: ${args.section}`,
            available_sections: Object.keys(sectionPaths)
          };
        }
        
        router.push(path as any);
        
        return {
          success: true,
          message: `Navigated to ${args.section}`,
          path
        };
      } catch (error) {
        logger.error('[navigate_to_section] Error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Navigation failed'
        };
      }
    }
  });
}
