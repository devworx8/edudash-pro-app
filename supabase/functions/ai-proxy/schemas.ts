import { z } from 'https://deno.land/x/zod@v3.23.8/mod.ts';

export const ImageSchema = z.object({
  data: z.string(),
  media_type: z.string(),
});

export const ImageOptionsSchema = z.object({
  size: z.enum(['1024x1024', '1536x1024', '1024x1536']).optional(),
  quality: z.enum(['low', 'medium', 'high']).optional(),
  style: z.enum(['natural', 'vivid']).optional(),
  background: z.enum(['auto', 'transparent', 'opaque']).optional(),
  moderation: z.enum(['auto', 'low']).optional(),
  cost_mode: z.enum(['eco', 'balanced', 'premium']).optional(),
  provider_preference: z.enum(['auto', 'openai', 'imagen']).optional(),
});

export const ConversationMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.union([
    z.string(),
    z.array(
      z.object({
        type: z.string(),
        text: z.string().optional(),
        source: z
          .object({
            type: z.string(),
            media_type: z.string(),
            data: z.string(),
          })
          .optional(),
      })
    ),
  ]),
  tool_call_id: z.string().optional(),
  name: z.string().optional(),
});

export const RequestSchema = z.object({
  scope: z.enum(['teacher', 'principal', 'parent', 'student', 'admin', 'guest']).optional(),
  service_type: z.string().optional().default('chat_message'),
  payload: z
    .object({
      prompt: z.string().optional(),
      context: z.string().optional(),
      conversationHistory: z.array(ConversationMessageSchema).optional(),
      messages: z.array(ConversationMessageSchema).optional(),
      images: z.array(ImageSchema).optional(),
      image_options: ImageOptionsSchema.optional(),
      image_context: z.record(z.unknown()).optional(),
      voice_data: z.record(z.unknown()).optional(),
      ocr_mode: z.boolean().optional(),
      ocr_task: z.enum(['homework', 'document', 'handwriting']).optional(),
      ocr_response_format: z.enum(['json', 'text']).optional(),
      model: z.string().optional(),
    })
    .default({}),
  stream: z.boolean().optional(),
  enable_tools: z.boolean().optional().default(false),
  prefer_openai: z.boolean().optional().default(false),
  client_tools: z.array(z.object({
    name: z.string(),
    description: z.string(),
    input_schema: z.record(z.unknown()),
  })).optional(),
  metadata: z.record(z.unknown()).optional(),
  mode: z.enum(['direct', 'socratic']).optional().default('direct'),
});

export const WebSearchArgsSchema = z.object({
  query: z.string().min(2),
  recency: z.string().optional(),
  domains: z.array(z.string()).optional(),
});

export const CAPSCurriculumArgsSchema = z
  .object({
    query: z.string().min(2).optional(),
    // Compatibility with legacy caps_curriculum_query tool shape
    search_query: z.string().min(2).optional(),
    grade: z.string().optional(),
    subject: z.string().optional(),
    limit: z.number().int().min(1).max(50).optional(),
    document_type: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    if (!val.query && !val.search_query) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'query is required', path: ['query'] });
    }
  });

export const GetCapsDocumentsArgsSchema = z.object({
  grade: z.string().min(1),
  subject: z.string().min(1),
  limit: z.number().int().min(1).max(50).optional(),
  document_type: z.string().optional(),
});

export const GetCapsSubjectsArgsSchema = z.object({
  grade: z.string().min(1),
});

export type ImageOptions = z.infer<typeof ImageOptionsSchema>;