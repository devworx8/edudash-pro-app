/**
 * Communication Tools for Dash AI
 * 
 * Tools for communication: PDF export, email sending, message composition
 */

import { logger } from '@/lib/logger';
import { getFeatureFlagsSync } from '@/lib/featureFlags';
import { trackChartParentStudentExecuted } from '@/lib/ai/trackingEvents';
import type { AgentTool } from '../DashToolRegistry';

const CHART_MAX_POINTS = 20;
const CHART_MAX_LABEL_LENGTH = 48;
const CHART_MAX_TITLE_LENGTH = 96;
const CHART_MAX_SUMMARY_LENGTH = 800;
const CHART_ABS_VALUE_LIMIT = 1_000_000;
const GENERATED_PDF_BUCKET = 'generated-pdfs';
const GENERATED_PDF_SIGNED_URL_TTL_SECONDS = 60 * 60 * 24;

type ResolvedGeneratedPdfLink = {
  downloadUrl?: string;
  signedUrl?: string;
  linkType: 'signed' | 'local' | 'none';
  warning?: string;
  warningReason?: 'signed_url_failed' | 'no_storage_path' | 'no_local_fallback';
};

async function resolveGeneratedPdfLink(
  supabase: any,
  storagePath?: string,
  fallbackUri?: string
): Promise<ResolvedGeneratedPdfLink> {
  let signedUrl: string | undefined;
  let warning: string | undefined;
  let warningReason: ResolvedGeneratedPdfLink['warningReason'];
  const safeStoragePath = typeof storagePath === 'string' ? storagePath.trim() : '';
  const safeFallbackUri = typeof fallbackUri === 'string' ? fallbackUri.trim() : '';

  if (safeStoragePath) {
    try {
      const { data, error } = await supabase.storage
        .from(GENERATED_PDF_BUCKET)
        .createSignedUrl(safeStoragePath, GENERATED_PDF_SIGNED_URL_TTL_SECONDS);
      if (error) throw error;
      signedUrl = data?.signedUrl || undefined;
    } catch (err: any) {
      warningReason = 'signed_url_failed';
      warning = String(err?.message || 'Failed to create signed PDF URL');
      logger.warn('[CommunicationTools] Signed PDF URL generation failed:', {
        warning,
        storagePath: safeStoragePath,
        warningReason,
      });
    }
  }

  if (signedUrl) {
    return {
      downloadUrl: signedUrl,
      signedUrl,
      linkType: 'signed',
      warning,
      warningReason,
    };
  }

  if (safeFallbackUri) {
    return {
      downloadUrl: safeFallbackUri,
      linkType: 'local',
      warning,
      warningReason: warningReason || (safeStoragePath ? 'signed_url_failed' : 'no_storage_path'),
    };
  }

  if (!safeStoragePath) {
    return {
      linkType: 'none',
      warning: warning || 'No storage path provided for generated PDF and no local fallback is available.',
      warningReason: 'no_storage_path',
    };
  }

  return {
    linkType: 'none',
    warning: warning || 'Signed URL generation failed and no local fallback URI is available.',
    warningReason: 'no_local_fallback',
  };
}

function buildPdfToolPayload(
  toolName: string,
  input: {
    filename?: string;
    storagePath?: string;
    pageCount?: number;
  },
  linkInfo: ResolvedGeneratedPdfLink,
  localFallbackLabel: string,
) {
  const hasPreview = !!linkInfo.downloadUrl;
  return {
    tool: toolName,
    filename: input.filename,
    storagePath: input.storagePath,
    downloadUrl: linkInfo.downloadUrl,
    signedUrl: linkInfo.signedUrl,
    linkType: linkInfo.linkType,
    warning: linkInfo.warning,
    warningReason: linkInfo.warningReason,
    ...(typeof input.pageCount === 'number' ? { pageCount: input.pageCount } : {}),
    message: hasPreview
      ? 'PDF ready to open.'
      : localFallbackLabel,
  };
}

function buildEducationalPrompt(
  rawPrompt: string,
  audience?: string,
  style?: string,
): string {
  const prefix: string[] = [];
  const suffix: string[] = [];

  const aud = String(audience || '').toLowerCase();
  if (aud === 'preschool' || aud === 'primary') {
    prefix.push(
      'Child-friendly educational illustration.',
      'Bright, cheerful colours. Simple, clear shapes.',
      'No text overlays. Safe for young children.',
    );
    if (aud === 'preschool') {
      prefix.push('Suitable for ages 3-6. Cartoon style with rounded edges.');
    } else {
      prefix.push('Suitable for primary school learners ages 6-12.');
    }
  } else if (aud === 'high_school') {
    prefix.push('Educational diagram or illustration for high school learners.');
  } else {
    prefix.push('High-quality educational illustration.');
  }

  if (style === 'natural') {
    suffix.push('Photorealistic style, professional lighting, sharp detail.');
  } else {
    suffix.push('Vibrant digital illustration style with clean lines.');
  }

  suffix.push('No watermarks. No logos. No text unless explicitly requested.');

  return [...prefix, rawPrompt, ...suffix].join(' ');
}

export function registerCommunicationTools(register: (tool: AgentTool) => void): void {
  
  // Message composition tool
  register({
    name: 'compose_message',
    description: 'Open message composer with pre-filled content for sending to parents or teachers',
    parameters: {
      type: 'object',
      properties: {
        subject: { 
          type: 'string',
          description: 'Message subject line'
        },
        body: { 
          type: 'string',
          description: 'Message body content'
        },
        recipient: { 
          type: 'string', 
          description: 'Recipient type: "parent" or "teacher"'
        }
      },
      required: ['subject', 'body']
    },
    risk: 'low',
    execute: async (args) => {
      try {
        const router = (await import('expo-router')).router;
        
        // Navigate to messages screen with pre-filled content
        router.push({
          pathname: '/messages',
          params: {
            compose: 'true',
            subject: args.subject,
            body: args.body,
            recipient: args.recipient || ''
          }
        } as any);
        
        return { 
          success: true, 
          opened: true,
          message: 'Message composer opened'
        };
      } catch (error) {
        logger.error('[compose_message] Error:', error);
        return { 
          success: false, 
          error: error instanceof Error ? error.message : 'Failed to open composer' 
        };
      }
    }
  });

  // PDF export tool
  register({
    name: 'export_pdf',
    description: 'Export provided title and markdown/text content as a PDF and return a link',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Document title' },
        content: { type: 'string', description: 'Document body (markdown supported)' }
      },
      required: ['title', 'content']
    },
    risk: 'low',
    execute: async (args) => {
      try {
        const { getDashPDFGenerator } = await import('@/services/DashPDFGenerator');
        const supabase = (await import('@/lib/supabase')).assertSupabase();

        const generator = getDashPDFGenerator();
        const result = await generator.generateFromStructuredData({
          type: 'general',
          title: String(args.title || 'Document'),
          sections: [
            { id: 'main', title: 'Content', markdown: String(args.content || '') }
          ],
        });

        if (!result.success) {
          return { success: false, error: result.error || 'PDF generation failed' };
        }

        const linkInfo = await resolveGeneratedPdfLink(supabase, result.storagePath, result.uri);
        const toolResultPayload = buildPdfToolPayload(
          'export_pdf',
          {
            filename: result.filename,
            storagePath: result.storagePath,
          },
          linkInfo,
          'PDF generated locally, but no preview link is available.',
        );

        // Post a friendly assistant message into the current Dash Chat conversation
        try {
          const { DashAIAssistant } = await import('@/services/dash-ai/DashAICompat');
          const dash = DashAIAssistant.getInstance();
          const convId = dash.getCurrentConversationId?.();
          if (convId) {
            const msg = {
              id: `pdf_${Date.now()}`,
              type: 'assistant',
              content: toolResultPayload.message,
              timestamp: Date.now(),
              metadata: {
                suggested_actions: ['export_pdf'],
                dashboard_action: { type: 'export_pdf', title: args.title, content: args.content },
                tool_name: 'export_pdf',
                tool_result: { success: true, result: toolResultPayload },
                tool_results: toolResultPayload,
              }
            } as any;
            await dash.addMessageToConversation(convId, msg);
          }
        } catch (postErr) {
          console.warn('[export_pdf] Failed to post chat message:', postErr);
        }

        return {
          success: true,
          uri: result.uri,
          ...toolResultPayload,
          message: 'PDF generated successfully',
        };
      } catch (e: any) {
        return { success: false, error: e?.message || 'PDF export failed' };
      }
    }
  });

  // Email sending tool (HIGH RISK - requires explicit confirmation)
  register({
    name: 'send_email',
    description: 'Send an email to one or more recipients. REQUIRES explicit user confirmation. Only principals and teachers can send emails.',
    parameters: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          description: 'Recipient email address (or comma-separated addresses)'
        },
        subject: {
          type: 'string',
          description: 'Email subject line'
        },
        body: {
          type: 'string',
          description: 'Email body content (HTML supported)'
        },
        reply_to: {
          type: 'string',
          description: 'Optional reply-to email address'
        },
        is_html: {
          type: 'boolean',
          description: 'Whether body contains HTML (default: true)'
        }
      },
      required: ['to', 'subject', 'body']
    },
    risk: 'high',
    requiresConfirmation: true,
    execute: async (args) => {
      try {
        const supabase = (await import('@/lib/supabase')).assertSupabase();
        
        const { data, error } = await supabase.functions.invoke('send-email', {
          body: {
            to: args.to.includes(',') ? args.to.split(',').map((e: string) => e.trim()) : args.to,
            subject: args.subject,
            body: args.body,
            reply_to: args.reply_to,
            is_html: args.is_html !== false,
            confirmed: true
          }
        });
        
        if (error) {
          logger.error('[send_email] Edge Function error:', error);
          return { 
            success: false, 
            error: error.message || 'Failed to send email' 
          };
        }
        
        if (!data.success) {
          return {
            success: false,
            error: data.error || 'Email sending failed',
            rate_limit: data.rate_limit
          };
        }
        
        return {
          success: true,
          message_id: data.message_id,
          message: `Email sent successfully to ${args.to}`,
          rate_limit: data.rate_limit,
          warning: data.warning
        };
      } catch (error) {
        logger.error('[send_email] Tool execution error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
  });

  // ── Generate Image tool ──────────────────────────────────────────────
  register({
    name: 'generate_image',
    description:
      'Generate a high-quality educational image or illustration from a text prompt. ' +
      'The prompt is automatically enhanced for educational context, bright child-friendly colours, and safety. ' +
      'Use this whenever the user asks you to draw, illustrate, create a picture, make a poster, or generate visual content.',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Detailed description of the image to generate (e.g. "A colorful poster of the solar system for preschoolers")',
        },
        size: {
          type: 'string',
          enum: ['1024x1024', '1536x1024', '1024x1536'],
          description: 'Image dimensions. 1024x1024 (square, default), 1536x1024 (landscape), 1024x1536 (portrait)',
        },
        style: {
          type: 'string',
          enum: ['natural', 'vivid'],
          description: 'Image style: natural (realistic photo) or vivid (artistic illustration). Default: vivid',
        },
        quality: {
          type: 'string',
          enum: ['medium', 'high'],
          description: 'Image quality: medium (faster, ~3s) or high (best detail, ~8s). Default: high',
        },
        audience: {
          type: 'string',
          enum: ['preschool', 'primary', 'high_school', 'adult'],
          description: 'Target audience for age-appropriate styling. Default: inferred from context',
        },
      },
      required: ['prompt'],
    },
    risk: 'low',
    execute: async (args) => {
      try {
        const { generateDashImage } = await import('@/lib/services/dashImageService');

        const rawPrompt = String(args.prompt || '').trim();
        if (!rawPrompt) {
          return { success: false, error: 'Please describe what image you would like me to create.' };
        }

        const enhancedPrompt = buildEducationalPrompt(rawPrompt, args.audience, args.style);

        const result = await generateDashImage({
          prompt: enhancedPrompt,
          size: args.size || '1024x1024',
          style: args.style || 'vivid',
          quality: args.quality || 'high',
          costMode: args.quality === 'high' ? 'premium' : 'balanced',
          providerPreference: 'auto',
        });

        const firstImage = result.generatedImages?.[0];
        if (!firstImage) {
          return { success: false, error: 'No image was generated. Please try a different description.' };
        }

        try {
          const { DashAIAssistant } = await import('@/services/dash-ai/DashAICompat');
          const dash = DashAIAssistant.getInstance();
          const convId = dash.getCurrentConversationId?.();
          if (convId && firstImage.signed_url) {
            await dash.addMessageToConversation(convId, {
              id: `img_${Date.now()}`,
              type: 'assistant',
              content: `Here is the image I created for you.`,
              timestamp: Date.now(),
              metadata: {
                tool_results: { tool: 'generate_image', ...firstImage },
                generated_images: [firstImage],
              },
            } as any);
          }
        } catch (postErr) {
          logger.warn('[generate_image] Failed to post chat message:', postErr);
        }

        return {
          success: true,
          imageUrl: firstImage.signed_url,
          storagePath: firstImage.path,
          bucket: firstImage.bucket,
          provider: firstImage.provider,
          model: firstImage.model,
          width: firstImage.width,
          height: firstImage.height,
          message: 'Image generated successfully. The image is displayed in the chat.',
        };
      } catch (e: any) {
        logger.error('[generate_image] Error:', e);
        const msg = String(e?.message || '');
        if (msg.includes('content_policy') || msg.includes('safety')) {
          return { success: false, error: 'That image could not be created because it did not meet safety guidelines. Please try a different description.' };
        }
        if (msg.includes('quota') || msg.includes('rate_limit')) {
          return { success: false, error: 'Image generation limit reached. Please try again in a few minutes.' };
        }
        return { success: false, error: e?.message || 'Image generation failed. Please try again.' };
      }
    },
  });

  // ── Generate Worksheet tool ──────────────────────────────────────────
  register({
    name: 'generate_worksheet',
    description: 'Generate a printable educational worksheet PDF (math, reading, or activity) suitable for a specific age group.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Worksheet title (e.g. "Addition Practice — Grade R")'
        },
        type: {
          type: 'string',
          enum: ['math', 'reading', 'activity', 'general'],
          description: 'Type of worksheet'
        },
        age_group: {
          type: 'string',
          enum: ['3-5', '6-8', '9-12', '13-15', '16-18'],
          description: 'Target age group'
        },
        difficulty: {
          type: 'string',
          enum: ['easy', 'medium', 'hard'],
          description: 'Problem difficulty level (default: medium)'
        },
        content: {
          type: 'string',
          description: 'Detailed worksheet content (problems, passages, activities) in markdown'
        },
        include_answer_key: {
          type: 'boolean',
          description: 'Whether to include an answer key page (default: true)'
        }
      },
      required: ['title', 'type', 'content']
    },
    risk: 'low',
    execute: async (args) => {
      try {
        const { getDashPDFGenerator } = await import('@/services/DashPDFGenerator');
        const supabase = (await import('@/lib/supabase')).assertSupabase();

        const generator = getDashPDFGenerator();

        // Normalize worksheet content. In many real chats the model may
        // return metadata or an empty content field; for early learners
        // that leads to blank PDFs. Fall back to a sensible default.
        const rawContent = String(args.content || '').trim();
        let worksheetMarkdown = rawContent;

        // If the \"content\" looks empty or like a bare JSON object,
        // generate a simple alphabet tracing template for the common
        // \"alphabet tracing\" use case so parents always get something usable.
        const looksLikeEmptyJson =
          !rawContent ||
          rawContent === '{}' ||
          (/^\{[\s\S]*\}$/.test(rawContent) && rawContent.length < 40);

        if (looksLikeEmptyJson && /alphabet/i.test(String(args.title || '')) ) {
          worksheetMarkdown = [
            'Trace each letter of the alphabet. Say the letter sound as you trace.',
            '',
            'A a    B b    C c',
            'D d    E e    F f',
            'G g    H h    I i',
            'J j    K k    L l',
            'M m    N n    O o',
            'P p    Q q    R r',
            'S s    T t    U u',
            'V v    W w    X x',
            'Y y    Z z',
            '',
            'Use one line to trace over each letter, then one line to write it on your own.',
          ].join('\\n');
        }

        const sections = [
          {
            id: 'main',
            title: String(args.title || 'Worksheet'),
            markdown: worksheetMarkdown,
          },
        ];
        if (args.include_answer_key !== false) {
          sections.push({ id: 'answers', title: 'Answer Key', markdown: '_Answer key is provided on this page._' });
        }

        const result = await generator.generateFromStructuredData({
          type: 'worksheet',
          title: String(args.title || 'Worksheet'),
          sections,
          data: {
            ageGroup: args.age_group || '6-8',
            difficulty: args.difficulty || 'medium',
            worksheetType: args.type || 'general',
          },
        });

        if (!result.success) {
          return { success: false, error: result.error || 'Worksheet generation failed' };
        }

        const linkInfo = await resolveGeneratedPdfLink(supabase, result.storagePath, result.uri);
        const toolResultPayload = buildPdfToolPayload(
          'generate_worksheet',
          {
            filename: result.filename,
            storagePath: result.storagePath,
          },
          linkInfo,
          'Worksheet PDF generated locally, but no preview link is available.',
        );

        // Post link into Dash chat
        try {
          const { DashAIAssistant } = await import('@/services/dash-ai/DashAICompat');
          const dash = DashAIAssistant.getInstance();
          const convId = dash.getCurrentConversationId?.();
          if (convId) {
            await dash.addMessageToConversation(convId, {
              id: `ws_${Date.now()}`,
              type: 'assistant',
              content: toolResultPayload.message,
              timestamp: Date.now(),
              metadata: {
                tool_name: 'generate_worksheet',
                tool_result: { success: true, result: toolResultPayload },
                tool_results: toolResultPayload,
              },
            } as any);
          }
        } catch (postErr) {
          logger.warn('[generate_worksheet] Failed to post chat message:', postErr);
        }

        return {
          success: true,
          uri: result.uri,
          ...toolResultPayload,
          message: 'Worksheet generated successfully',
        };
      } catch (e: any) {
        logger.error('[generate_worksheet] Error:', e);
        return { success: false, error: e?.message || 'Worksheet generation failed' };
      }
    }
  });

  // ── Generate Chart tool ──────────────────────────────────────────────
  register({
    name: 'generate_chart',
    description: 'Generate a chart (bar, line, or pie) as a PDF with optional table data. Useful for attendance summaries, fee reports, and progress tracking.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Chart/report title'
        },
        chart_type: {
          type: 'string',
          enum: ['bar', 'line', 'pie'],
          description: 'Type of chart to generate'
        },
        labels: {
          type: 'array',
          items: { type: 'string' },
          description: 'X-axis / category labels (e.g. ["Jan","Feb","Mar"])'
        },
        values: {
          type: 'array',
          items: { type: 'number' },
          description: 'Data values corresponding to each label'
        },
        colors: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional hex color per data point'
        },
        summary: {
          type: 'string',
          description: 'An optional narrative summary to include below the chart'
        }
      },
      required: ['title', 'chart_type', 'labels', 'values']
    },
    risk: 'low',
    execute: async (args, context) => {
      try {
        const role = String(context?.role || 'unknown').toLowerCase();
        const chartType = String(args?.chart_type || '').toLowerCase();
        const safeMode = getFeatureFlagsSync().dash_chart_safe_mode_v1;

        const normalizedChartType = chartType === 'line' || chartType === 'pie' ? chartType : 'bar';
        if (!['bar', 'line', 'pie'].includes(chartType)) {
          return { success: false, error: 'chart_type must be one of: bar, line, pie' };
        }

        const title = String(args?.title || '').trim();
        if (!title) {
          return { success: false, error: 'title is required' };
        }
        if (safeMode && title.length > CHART_MAX_TITLE_LENGTH) {
          return { success: false, error: `title is too long (max ${CHART_MAX_TITLE_LENGTH} chars)` };
        }

        const labelsInput = Array.isArray(args?.labels) ? args.labels : [];
        const valuesInput = Array.isArray(args?.values) ? args.values : [];
        if (labelsInput.length === 0 || valuesInput.length === 0) {
          return { success: false, error: 'labels and values are required' };
        }
        if (labelsInput.length !== valuesInput.length) {
          return { success: false, error: 'labels and values must have the same length' };
        }
        if (safeMode && labelsInput.length > CHART_MAX_POINTS) {
          return { success: false, error: `too many data points (max ${CHART_MAX_POINTS})` };
        }

        const normalizedLabels: string[] = [];
        const normalizedValues: number[] = [];
        for (let index = 0; index < labelsInput.length; index += 1) {
          const label = String(labelsInput[index] || '').trim();
          if (!label) {
            return { success: false, error: `label at index ${index} is empty` };
          }
          if (safeMode && label.length > CHART_MAX_LABEL_LENGTH) {
            return { success: false, error: `label at index ${index} exceeds ${CHART_MAX_LABEL_LENGTH} chars` };
          }

          const rawValue = Number(valuesInput[index]);
          if (!Number.isFinite(rawValue)) {
            return { success: false, error: `value at index ${index} is not a valid number` };
          }

          let value = rawValue;
          if (safeMode) {
            if (normalizedChartType === 'pie') {
              value = Math.max(0, Math.min(CHART_ABS_VALUE_LIMIT, rawValue));
            } else {
              value = Math.max(-CHART_ABS_VALUE_LIMIT, Math.min(CHART_ABS_VALUE_LIMIT, rawValue));
            }
          }

          normalizedLabels.push(label);
          normalizedValues.push(value);
        }

        const inputColors = Array.isArray(args?.colors) ? args.colors : [];
        const normalizedColors = inputColors
          .slice(0, normalizedLabels.length)
          .map((color: unknown) => String(color || '').trim())
          .filter(Boolean);

        const summary = String(args?.summary || '').trim();
        if (safeMode && summary.length > CHART_MAX_SUMMARY_LENGTH) {
          return { success: false, error: `summary is too long (max ${CHART_MAX_SUMMARY_LENGTH} chars)` };
        }

        const { getDashPDFGenerator } = await import('@/services/DashPDFGenerator');
        const supabase = (await import('@/lib/supabase')).assertSupabase();

        const generator = getDashPDFGenerator();

        // Build a section with chart data and optional summary
        const chartData = {
          type: normalizedChartType as 'bar' | 'line' | 'pie',
          data: {
            labels: normalizedLabels,
            values: normalizedValues,
            colors: normalizedColors.length > 0 ? normalizedColors : undefined,
          },
          title: title.slice(0, CHART_MAX_TITLE_LENGTH),
        };

        const markdown = summary || `Chart: ${title}`;
        const result = await generator.generateFromStructuredData({
          type: 'report',
          title: title.slice(0, CHART_MAX_TITLE_LENGTH),
          sections: [
            {
              id: 'chart',
              title: title.slice(0, CHART_MAX_TITLE_LENGTH),
              markdown,
              charts: [chartData],
              tables: [{
                headers: ['Category', 'Value'],
                rows: normalizedLabels.map((label: string, i: number) => [label, String(normalizedValues[i] ?? '')]),
                caption: 'Data table',
              }],
            },
          ],
          includeCharts: true,
          includeTables: true,
        });

        if (!result.success) {
          if (role === 'parent' || role === 'student') {
            trackChartParentStudentExecuted({
              role,
              points: normalizedLabels.length,
              chartType: normalizedChartType,
              success: false,
            });
          }
          return { success: false, error: result.error || 'Chart generation failed' };
        }

        const linkInfo = await resolveGeneratedPdfLink(supabase, result.storagePath, result.uri);
        const toolResultPayload = buildPdfToolPayload(
          'generate_chart',
          {
            filename: result.filename,
            storagePath: result.storagePath,
          },
          linkInfo,
          'Chart PDF generated locally, but no preview link is available.',
        );

        // Post link into Dash chat
        try {
          const { DashAIAssistant } = await import('@/services/dash-ai/DashAICompat');
          const dash = DashAIAssistant.getInstance();
          const convId = dash.getCurrentConversationId?.();
          if (convId) {
            await dash.addMessageToConversation(convId, {
              id: `chart_${Date.now()}`,
              type: 'assistant',
              content: toolResultPayload.message,
              timestamp: Date.now(),
              metadata: {
                tool_name: 'generate_chart',
                tool_result: { success: true, result: toolResultPayload },
                tool_results: toolResultPayload,
              },
            } as any);
          }
        } catch (postErr) {
          logger.warn('[generate_chart] Failed to post chat message:', postErr);
        }

        if (role === 'parent' || role === 'student') {
          trackChartParentStudentExecuted({
            role,
            points: normalizedLabels.length,
            chartType: normalizedChartType,
            success: true,
          });
        }

        return {
          success: true,
          uri: result.uri,
          ...toolResultPayload,
          message: 'Chart generated successfully',
        };
      } catch (e: any) {
        const role = String(context?.role || 'unknown').toLowerCase();
        if (role === 'parent' || role === 'student') {
          trackChartParentStudentExecuted({
            role,
            points: Array.isArray(args?.labels) ? args.labels.length : 0,
            chartType: String(args?.chart_type || 'unknown'),
            success: false,
          });
        }
        logger.error('[generate_chart] Error:', e);
        return { success: false, error: e?.message || 'Chart generation failed' };
      }
    }
  });

  // ── Generate PDF from prompt (AI-powered) ────────────────────────────
  register({
    name: 'generate_pdf_from_prompt',
    description: 'Generate a full PDF document from a natural language prompt. The AI interprets your request and produces a formatted PDF (reports, letters, study guides, newsletters, etc.).',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Natural language description of the PDF to create (e.g. "Monthly attendance report for January 2026 showing each class")'
        },
        document_type: {
          type: 'string',
          enum: ['report', 'letter', 'invoice', 'study_guide', 'lesson_plan', 'progress_report', 'assessment', 'certificate', 'newsletter', 'worksheet', 'general'],
          description: 'Optional document type hint (default: auto-detect from prompt)'
        }
      },
      required: ['prompt']
    },
    risk: 'low',
    execute: async (args) => {
      try {
        const { getDashPDFGenerator } = await import('@/services/DashPDFGenerator');
        const supabase = (await import('@/lib/supabase')).assertSupabase();

        const generator = getDashPDFGenerator();
        const result = await generator.generateFromPrompt(String(args.prompt));

        if (!result.success) {
          return { success: false, error: result.error || 'PDF generation from prompt failed' };
        }

        const linkInfo = await resolveGeneratedPdfLink(supabase, result.storagePath, result.uri);
        const toolResultPayload = buildPdfToolPayload(
          'generate_pdf_from_prompt',
          {
            filename: result.filename,
            storagePath: result.storagePath,
            pageCount: result.pageCount,
          },
          linkInfo,
          'Document PDF generated locally, but no preview link is available.',
        );

        // Post link into Dash chat
        try {
          const { DashAIAssistant } = await import('@/services/dash-ai/DashAICompat');
          const dash = DashAIAssistant.getInstance();
          const convId = dash.getCurrentConversationId?.();
          if (convId) {
            await dash.addMessageToConversation(convId, {
              id: `pdfprompt_${Date.now()}`,
              type: 'assistant',
              content: toolResultPayload.message,
              timestamp: Date.now(),
              metadata: {
                tool_name: 'generate_pdf_from_prompt',
                tool_result: { success: true, result: toolResultPayload },
                tool_results: toolResultPayload,
              },
            } as any);
          }
        } catch (postErr) {
          logger.warn('[generate_pdf_from_prompt] Failed to post chat message:', postErr);
        }

        return {
          success: true,
          uri: result.uri,
          ...toolResultPayload,
          message: 'PDF generated from prompt successfully',
        };
      } catch (e: any) {
        logger.error('[generate_pdf_from_prompt] Error:', e);
        return { success: false, error: e?.message || 'PDF generation from prompt failed' };
      }
    }
  });
}
