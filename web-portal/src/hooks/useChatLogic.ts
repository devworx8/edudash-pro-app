/**
 * Chat Logic Hook
 * WARP.md compliant: ≤300 lines
 * 
 * Handles message sending, AI proxy calls, conversation management
 */

import { useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { dashAIThrottler } from '@/lib/dash-ai-throttle';
import type { ChatMessage, SelectedImage, ExamContext } from '@/components/dash-chat/types';
import type { VoiceDictationProbe } from '@/hooks/useVoiceRecording';
import {
  detectOCRTask,
  getOCRPromptForTask,
  isOCRIntent,
  isShortOrAttachmentOnlyPrompt,
} from '@/lib/dash-ai/ocrPrompts';

interface UseChatLogicProps {
  scope: 'parent' | 'teacher' | 'principal';
  conversationId: string;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  userId?: string;
  onQuotaExceeded?: () => void;
  onMessageSent?: () => void; // Callback when message is sent successfully
}

export function useChatLogic({ scope, conversationId, messages, setMessages, userId, onQuotaExceeded, onMessageSent }: UseChatLogicProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [examContext, setExamContext] = useState<ExamContext>({});
  const supabase = createClient();

  // Load conversation from database
  const loadConversation = useCallback(async () => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        return;
      }

      const { data, error } = await supabase
        .from('ai_conversations')
        .select('messages')
        .eq('user_id', userData.user.id)
        .eq('conversation_id', conversationId)
        .maybeSingle();

      if (error) {
        if (error.code === 'PGRST116') {
          console.log('New conversation - no existing messages');
          return;
        }
        throw error;
      }

      if (data?.messages) {
        const parsedMessages = (data.messages as any[]).map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp),
        }));
        setMessages(parsedMessages);
      }
    } catch (error) {
      console.error('Error loading conversation:', error);
    }
  }, [conversationId, supabase, setMessages]);

  // Save conversation to database
  const saveConversation = useCallback(async (updatedMessages: ChatMessage[]) => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('preschool_id, organization_id')
        .eq('id', userData.user.id)
        .single();

      const preschoolId = profile?.preschool_id || profile?.organization_id || null;

      const { data: existing } = await supabase
        .from('ai_conversations')
        .select('id')
        .eq('user_id', userData.user.id)
        .eq('conversation_id', conversationId)
        .maybeSingle();

      const conversationData = {
        user_id: userData.user.id,
        preschool_id: preschoolId,
        conversation_id: conversationId,
        title: updatedMessages[0]?.content.substring(0, 50) || 'New Chat',
        messages: updatedMessages,
        updated_at: new Date().toISOString(),
      };

      if (existing) {
        await supabase
          .from('ai_conversations')
          .update(conversationData)
          .eq('user_id', userData.user.id)
          .eq('conversation_id', conversationId);
      } else {
        await supabase
          .from('ai_conversations')
          .insert(conversationData);
      }
    } catch (error) {
      console.error('Error saving conversation:', error);
    }
  }, [conversationId, supabase]);

  // Send message to AI
  const sendMessage = useCallback(async (
    textToSend: string,
    selectedImages: SelectedImage[],
    voiceData?: { blob: Blob; base64: string; probe?: VoiceDictationProbe }
  ) => {
    if (!textToSend && selectedImages.length === 0 && !voiceData) return;

    // ✅ CHECK QUOTA BEFORE SENDING MESSAGE
    if (userId) {
      try {
        const { data: quotaCheck } = await supabase.rpc('check_ai_usage_limit', {
          p_user_id: userId,
          p_request_type: 'chat_message',
        });

        if (quotaCheck && !quotaCheck.allowed) {
          const upgradeText = quotaCheck.upgrade_available
            ? scope === 'parent'
              ? `💡 [Upgrade your plan](/dashboard/parent/upgrade) for ${quotaCheck.remaining > 0 ? 'more messages' : 'unlimited messages'}!`
              : 'Ask your school admin about upgrading your plan for higher limits.'
            : 'Your limit resets tomorrow.';
          
          const quotaMessage: ChatMessage = {
            id: `msg-${Date.now()}-quota`,
            role: 'assistant',
            content: `⚠️ **Daily Chat Limit Reached**\n\nYou've used ${quotaCheck.limit} messages today on the ${quotaCheck.current_tier} plan.\n\n${upgradeText}`,
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, quotaMessage]);
          onQuotaExceeded?.();
          return;
        }

        console.log('[Chat] Quota check passed:', quotaCheck);
      } catch (error) {
        console.error('[Chat] Quota check failed:', error);
        // Continue anyway - don't block on quota check errors
      }
    }

    // Check if request will be queued
    if (dashAIThrottler.wouldWait()) {
      const waitSeconds = Math.ceil(dashAIThrottler.getWaitTime() / 1000);
      const queueMessage: ChatMessage = {
        id: `msg-${Date.now()}-queue`,
        role: 'assistant',
        content: `⏳ Please wait ${waitSeconds} seconds... (Rate limit protection)`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, queueMessage]);
    }

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: textToSend || (voiceData ? '🎤 [Voice message]' : '📷 [Image attached]'),
      timestamp: new Date(),
      images: selectedImages.length > 0 ? selectedImages : undefined,
      audio: voiceData ? { 
        data: voiceData.base64, 
        media_type: 'audio/webm',
        duration: 0 
      } : undefined,
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setIsLoading(true);
    setIsTyping(true);

    try {
      // Build conversation history
      const conversationHistory = newMessages.map((msg) => {
        const hasImages = msg.images && msg.images.length > 0;
        
        if (hasImages) {
          return {
            role: msg.role,
            content: [
              { type: 'text', text: msg.content },
              ...msg.images!.map((img) => ({
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: img.media_type,
                  data: img.data,
                },
              })),
            ],
          };
        } else {
          return {
            role: msg.role,
            content: msg.content,
          };
        }
      });

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      // Prepare payload
      const normalizedText = textToSend || '';
      const ocrTask = selectedImages.length > 0 ? detectOCRTask(normalizedText) : null;
      const ocrMode = selectedImages.length > 0 && (
        isOCRIntent(normalizedText) ||
        ocrTask !== null ||
        isShortOrAttachmentOnlyPrompt(normalizedText)
      );
      const payload: any = {
        prompt: textToSend || userMessage.content,
        conversationHistory: conversationHistory,
        enable_tools: true,
        prefer_openai: true,
        stream: false,
      };

      // Add images if present
      if (selectedImages.length > 0) {
        payload.images = selectedImages.map(img => ({
          data: img.data,
          media_type: img.media_type,
        }));
        payload.image_context = {
          has_images: true,
          image_count: selectedImages.length,
          hint: ocrMode
            ? getOCRPromptForTask(ocrTask || 'document')
            : 'Images uploaded. If extractable as exam/homework material, identify grade/subject/topic and offer curriculum help.',
        };
        if (ocrMode) {
          payload.ocr_mode = true;
          payload.ocr_task = ocrTask || 'document';
          payload.ocr_response_format = 'json';
        }
      }

      // Add voice if present (for future transcription)
      if (voiceData) {
        payload.voice_data = {
          data: voiceData.base64,
          media_type: 'audio/webm',
        };
      }

      const result: any = await dashAIThrottler.enqueue(() =>
        {
          const voiceDictationProbe = voiceData?.probe
            ? {
                ...voiceData.probe,
                platform: 'web' as const,
                source: voiceData.probe.source || 'dash_chat_web',
                commit_at: new Date().toISOString(),
                ...(String(process.env.NEXT_PUBLIC_VOICE_BENCHMARK_RUN_ID || '').trim()
                  ? { run_id: String(process.env.NEXT_PUBLIC_VOICE_BENCHMARK_RUN_ID || '').trim() }
                  : {}),
              }
            : undefined;
          return supabase.functions.invoke('ai-proxy', {
            body: {
              scope,
              service_type: ocrMode ? 'image_analysis' : 'dash_conversation',
              payload: {
                prompt: payload.prompt,
                conversationHistory: payload.conversationHistory,
                images: payload.images,
                image_context: payload.image_context,
                voice_data: payload.voice_data,
                ocr_mode: payload.ocr_mode,
                ocr_task: payload.ocr_task,
                ocr_response_format: payload.ocr_response_format,
              },
              enable_tools: true,
              prefer_openai: true,
              stream: false,
              metadata: {
                role: scope,
                supports_images: true,
                allow_diagrams: true,
                voice_dictation_probe: voiceDictationProbe,
                ocr_mode: ocrMode,
                ocr_task: ocrTask || undefined,
              },
            },
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          });
        }
      );

      const { data, error } = result as any;
      setIsTyping(false);

      // Check for function invocation errors
      if (error || !data) {
        console.error('AI proxy error:', error, 'Response data:', data);

        // Handle specific error types
        // 429 from Edge Function (quota exceeded)
        const errAny: any = error as any;
        const is429 = errAny?.status === 429 || String(errAny?.message || '').includes('429');
        const isQuota = String(errAny?.message || '').toLowerCase().includes('quota');
        if (is429 || isQuota) {
          const quotaMessage: ChatMessage = {
            id: `msg-${Date.now()}-quota429`,
            role: 'assistant',
            content: `📊 **Daily Quota Reached**\n\nYou've used all your AI messages for today. Your quota will reset tomorrow, or upgrade your plan for more messages!\n\n💡 *Tip: Check the quota bar at the top of the chat to track your usage.*`,
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, quotaMessage]);
          onQuotaExceeded?.();
          setIsLoading(false);
          return;
        }

        if (error?.message?.includes('daily_limit_exceeded')) {
          const dailyLimitMessage: ChatMessage = {
            id: `msg-${Date.now()}-daily-limit`,
            role: 'assistant',
            content: `📊 **Daily Image Limit Reached**\n\nFree tier allows **4 images per day**.\n\n${error.message.includes('remaining') ? error.message : 'You\'ve reached your daily limit. Upgrade to Starter for unlimited image analysis!'}`,
            timestamp: new Date(),
            isError: false,
          };
          setMessages(prev => [...prev, dailyLimitMessage]);
          setIsLoading(false);
          return;
        }

        // Handle 503 Service Unavailable
        if (error?.message?.includes('503') || error?.message?.includes('FunctionsHttpError')) {
          const serviceMessage: ChatMessage = {
            id: `msg-${Date.now()}-service`,
            role: 'assistant',
            content: `⚠️ **AI Service Temporarily Unavailable**\n\nThe AI service is currently experiencing high load or is being updated. Please try again in a moment.\n\nIf this persists, please contact support.`,
            timestamp: new Date(),
            isError: true,
          };
          setMessages(prev => [...prev, serviceMessage]);
          setIsLoading(false);
          return;
        }

        throw error || new Error('Empty response from AI service');
      }

      // Format response
      const rawContent = data?.content || data?.text || 'I received an empty response. Please resend or add a bit more detail.';
      const parsedOcrFromContent =
        typeof rawContent === 'string' ? extractOCRPayloadFromContent(rawContent) : null;
      const normalizedOCR =
        data?.ocr && typeof data.ocr === 'object'
          ? data.ocr
          : parsedOcrFromContent;
      const mainResponseText =
        typeof normalizedOCR?.analysis === 'string' && normalizedOCR.analysis.trim().length > 0
          ? normalizedOCR.analysis
          : typeof normalizedOCR?.extracted_text === 'string' && normalizedOCR.extracted_text.trim().length > 0
            ? normalizedOCR.extracted_text
            : String(rawContent);
      const confidenceScore = typeof data?.confidence_score === 'number'
        ? data.confidence_score
        : typeof normalizedOCR?.confidence === 'number'
          ? normalizedOCR.confidence
          : null;
      const unclearSpans =
        Array.isArray(normalizedOCR?.unclear_spans)
          ? normalizedOCR.unclear_spans
              .map((value: unknown) => String(value || '').trim())
              .filter((value: string) => value.length > 0)
              .slice(0, 3)
          : [];
      const lowConfidenceSuffix =
        ocrMode && typeof confidenceScore === 'number' && confidenceScore <= 0.75
          ? `\n\nScan clarity: ${Math.round(confidenceScore * 100)}%. Retake with brighter lighting and a flatter page for better OCR accuracy.`
          : '';
      const unclearSpansSuffix =
        ocrMode && unclearSpans.length > 0
          ? `\n\nUnclear text: ${unclearSpans.join(' | ')}`
          : '';
      const content = formatAssistantContent(`${mainResponseText}${lowConfidenceSuffix}${unclearSpansSuffix}`);
      const tokensIn = data?.usage?.tokens_in || data?.tokensIn || 0;
      const tokensOut = data?.usage?.tokens_out || data?.tokensOut || 0;

      const assistantMessage: ChatMessage = {
        id: `msg-${Date.now()}-ai`,
        role: 'assistant',
        content,
        timestamp: new Date(),
        meta: {
          tokensUsed: tokensIn + tokensOut,
          model: data?.model || 'unknown',
          suggested_actions: Array.isArray(data?.suggested_actions)
            ? data.suggested_actions
                .map((item: unknown) => String(item || '').trim())
                .filter((item: string) => item.length > 0)
            : undefined,
          plan_mode:
            data?.plan_mode && typeof data.plan_mode === 'object'
              ? data.plan_mode
              : undefined,
          resolution_status: typeof data?.resolution_status === 'string' ? data.resolution_status : undefined,
          confidence_score: typeof confidenceScore === 'number' ? confidenceScore : undefined,
          escalation_offer: typeof data?.escalation_offer === 'boolean' ? data.escalation_offer : undefined,
          resolution_meta:
            data?.resolution_meta && typeof data.resolution_meta === 'object'
              ? data.resolution_meta
              : undefined,
          ocr:
            normalizedOCR && typeof normalizedOCR === 'object'
              ? {
                  extracted_text: typeof normalizedOCR.extracted_text === 'string' ? normalizedOCR.extracted_text : undefined,
                  confidence: typeof normalizedOCR.confidence === 'number' ? normalizedOCR.confidence : undefined,
                  document_type: typeof normalizedOCR.document_type === 'string' ? normalizedOCR.document_type : undefined,
                  analysis: typeof normalizedOCR.analysis === 'string' ? normalizedOCR.analysis : undefined,
                  unclear_spans: unclearSpans,
                }
              : undefined,
        },
      };

      const finalMessages = [...newMessages, assistantMessage];
      setMessages(finalMessages);

      // ✅ INCREMENT USAGE AFTER SUCCESSFUL RESPONSE
      if (userId) {
        try {
          await supabase.rpc('increment_ai_usage', {
            p_user_id: userId,
            p_request_type: 'chat_message',
            p_status: 'success',
          });
          console.log('[Chat] Usage incremented successfully');
          
          // Notify parent to refresh quota bar
          onMessageSent?.();
        } catch (error) {
          console.error('[Chat] Failed to increment usage:', error);
          // Don't block on increment failures
        }
      }

      // Check for exam/assessment request
      if (detectExamRequest(textToSend)) {
        const context = extractExamContext(textToSend);
        setExamContext(context);
        const phase = resolveLearningPhase(context, textToSend);

        setTimeout(() => {
          if (phase === 'exam') {
            const examBuilderPrompt: ChatMessage = {
              id: `msg-${Date.now()}-prompt`,
              role: 'assistant',
              content:
                'Would you like me to help you create a structured exam using the interactive exam builder? It provides a step-by-step process with CAPS-aligned questions.',
              timestamp: new Date(),
            };
            setMessages([...finalMessages, examBuilderPrompt]);
            return;
          }

          const assessmentPrompt: ChatMessage = {
            id: `msg-${Date.now()}-prompt`,
            role: 'assistant',
            content:
              phase === 'preschool'
                ? 'For preschoolers, we focus on play-based learning instead of exams. I can guide a short interactive activity, a game, or a simple observation checklist. Want a fun 10-minute activity?'
                : 'Foundation phase uses assessments, not exams. I can create a short assessment activity or checklist aligned to the topic. Want a quick assessment plan?',
            timestamp: new Date(),
          };
          setMessages([...finalMessages, assessmentPrompt]);
        }, 500);
      }

      await saveConversation(finalMessages);

    } catch (error) {
      console.error('Error sending message:', error);
      setIsTyping(false);

      const errorMessage: ChatMessage = {
        id: `msg-${Date.now()}-error`,
        role: 'assistant',
        content: formatErrorMessage(error),
        timestamp: new Date(),
        isError: true,
      };

      setMessages([...newMessages, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [
    messages,
    onMessageSent,
    onQuotaExceeded,
    saveConversation,
    scope,
    setMessages,
    supabase,
    userId,
  ]);

  return {
    isLoading,
    isTyping,
    examContext,
    setExamContext,
    loadConversation,
    sendMessage,
  };
}

function extractOCRPayloadFromContent(content: string): Record<string, unknown> | null {
  const normalized = String(content || '').trim();
  if (!normalized) return null;
  const fencedMatch = normalized.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fencedMatch?.[1] || normalized).trim();
  if (!candidate.startsWith('{') || !candidate.endsWith('}')) return null;
  try {
    const parsed = JSON.parse(candidate);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

// Helper: Format assistant content
function formatAssistantContent(txt: string): string {
  try {
    const newlineCount = (txt.match(/\n/g) || []).length;
    if (newlineCount >= 2) return txt;
    if (txt.length < 180) return txt;
    
    const withBreaks = txt.replace(/([.?!])\s+(?=[A-Z0-9"])/g, '$1\n\n');
    return withBreaks;
  } catch (e) {
    return txt;
  }
}

// Helper: Detect exam request
function detectExamRequest(text: string): boolean {
  const examKeywords = [
    'exam', 'test', 'assessment', 'questions',
    'quiz', 'worksheet', 'revision'
  ];
  
  const lowerText = text.toLowerCase();
  // Use word boundaries to avoid false positives (e.g., "plan" shouldn't match "prepare")
  return examKeywords.some(keyword => {
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    return regex.test(lowerText);
  });
}

// Helper: Extract exam context
function extractExamContext(text: string): ExamContext {
  const lowerText = text.toLowerCase();
  
  let grade: string | undefined;
  if (/(preschool|pre-school|pre k|pre-k|nursery|early childhood)/i.test(lowerText)) {
    grade = 'preschool';
  }
  if (!grade && /(foundation phase|grade r|grade\s*r)/i.test(lowerText)) {
    grade = 'grade_r';
  }
  const gradeMatch = lowerText.match(/grade\s*(\d+|r)/i);
  if (gradeMatch) {
    const gradeNum = gradeMatch[1];
    grade = gradeNum.toLowerCase() === 'r' ? 'grade_r' : `grade_${gradeNum}`;
  }
  
  let subject: string | undefined;
  const subjects = [
    'mathematics', 'math', 'maths',
    'english', 'home language', 'first additional',
    'physical sciences', 'physics', 'chemistry',
    'life sciences', 'biology',
    'geography', 'history',
    'accounting', 'business', 'economics',
    'life orientation'
  ];
  
  for (const subj of subjects) {
    if (lowerText.includes(subj)) {
      if (subj === 'math' || subj === 'maths') subject = 'Mathematics';
      else if (subj === 'physics' || subj === 'chemistry') subject = 'Physical Sciences';
      else if (subj === 'biology') subject = 'Life Sciences';
      else if (subj === 'business') subject = 'Business Studies';
      else subject = subj.charAt(0).toUpperCase() + subj.slice(1);
      break;
    }
  }
  
  const topics: string[] = [];
  const topicMatch = lowerText.match(/(?:about|on|covering)\s+([a-z\s]+?)(?:\.|,|$)/i);
  if (topicMatch) {
    topics.push(topicMatch[1].trim());
  }
  
  return { grade, subject, topics: topics.length > 0 ? topics : undefined };
}

function parseGradeLevel(grade?: string): number | null {
  if (!grade) return null;
  const normalized = grade.toLowerCase();
  if (normalized === 'preschool') return -1;
  if (normalized === 'grade_r') return 0;
  const match = normalized.match(/grade_(\d+)/);
  if (match) return Number(match[1]);
  return null;
}

function resolveLearningPhase(
  context: ExamContext,
  text: string
): 'preschool' | 'foundation' | 'exam' | 'unknown' {
  const lowerText = text.toLowerCase();
  const gradeLevel = parseGradeLevel(context.grade);
  const isPreschool =
    context.grade === 'preschool' ||
    /(preschool|pre-school|pre k|pre-k|nursery|early childhood)/i.test(lowerText);
  if (isPreschool) return 'preschool';
  if (gradeLevel !== null && gradeLevel <= 3) return 'foundation';
  if (/(foundation phase|grade r|grade\\s*r)/i.test(lowerText)) return 'foundation';
  if (gradeLevel !== null && gradeLevel >= 4) return 'exam';
  return 'unknown';
}

// Helper: Format error message
function formatErrorMessage(error: unknown): string {
  let errorContent = '❌ I hit a snag while preparing your help. Please try again or rephrase your question.';
  
  if (error && typeof error === 'object' && 'message' in error) {
    const errorMsg = String((error as { message: string }).message).toLowerCase();
    
    // Check for Claude API quota limit
    if (errorMsg.includes('workspace api usage limits') || errorMsg.includes('regain access on')) {
      const dateMatch = String((error as { message: string }).message).match(/(\d{4}-\d{2}-\d{2})/);
      if (dateMatch) {
        const resetDate = new Date(dateMatch[1]);
        const formattedDate = resetDate.toLocaleDateString('en-US', { 
          month: 'long', 
          day: 'numeric', 
          year: 'numeric' 
        });
        errorContent = `🚫 **AI Service Quota Reached**\n\nThe shared AI quota is exhausted. Service will resume on **${formattedDate}**.\n\nThis is platform-wide (not your personal quota). You can still ask questions and I’ll help as soon as it’s back.`;
      } else {
        errorContent = `🚫 **AI Service Quota Reached**\n\nThe shared AI quota is exhausted. Please check back soon.`;
      }
    } else if (errorMsg.includes('429') || errorMsg.includes('rate limit')) {
      errorContent = `⏳ **Rate Limit**\n\nToo many requests right now. Please wait a moment, then send your message again.`;
    } else if (errorMsg.includes('quota') || errorMsg.includes('quota_exceeded')) {
      errorContent = `📊 **Daily Quota Reached**\n\nYou've used all your AI messages for today. Your quota will reset tomorrow, or upgrade your plan for more messages!\n\n💡 *Tip: Check the quota bar at the top of the chat to track your usage.*`;
    } else if (errorMsg.includes('503') || errorMsg.includes('service unavailable') || errorMsg.includes('edge function')) {
      errorContent = `🔧 **Service Unavailable (503)**\n\nThe AI service is temporarily down. Please try again in a few minutes.`;
    } else if (errorMsg.includes('timeout')) {
      errorContent = '⏱️ **Request Timeout** - Your request took too long. Try sending a shorter message or breaking it into parts.';
    } else if (errorMsg.includes('network') || errorMsg.includes('fetch')) {
      errorContent = '🌐 **Network Error** - Please check your internet connection and try again.';
    } else {
      // Show actual error message for debugging
      errorContent = `❌ **Error**\n\nSomething unexpected happened. Please try again, or share what you were trying to do and I’ll guide you.`;
    }
  }
  
  return errorContent;
}
