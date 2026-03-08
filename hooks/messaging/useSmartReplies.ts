/**
 * Smart Reply Suggestions Hook (M12)
 *
 * Generates contextual quick-reply suggestions using AI-powered smart replies
 * via ai-proxy. Falls back to local pattern matching for instant UX while
 * AI loads, or if AI fails/times out.
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { assertSupabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

interface SmartReplyInput {
  content: string;
  senderRole?: string;
  threadType?: string;
}

interface UseSmartRepliesReturn {
  suggestions: string[];
  loading: boolean;
}

export function useSmartReplies(
  lastMessage?: SmartReplyInput,
  userRole?: string,
): UseSmartRepliesReturn {
  const localSuggestions = useMemo(() => {
    if (!lastMessage?.content) return [];
    return generateLocalReplies(lastMessage.content);
  }, [lastMessage?.content]);

  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!lastMessage?.content) {
      setAiSuggestions([]);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const client = assertSupabase();
        const recentContext = lastMessage.content.slice(0, 500);

        const { data, error } = await client.functions.invoke('ai-proxy', {
          body: {
            scope: userRole || 'parent',
            service_type: 'smart_reply',
            payload: {
              prompt: `Generate exactly 3 short reply suggestions (max 8 words each) for this message in a South African school context. The user replying is a ${userRole || 'parent'}. Return ONLY a JSON array of 3 strings, no explanation.\n\nMessage: "${recentContext}"`,
              context: `You generate quick reply suggestions for a school messaging app. Keep replies contextual, respectful, and concise. Thread type: ${lastMessage.threadType || 'direct'}. Sender role: ${lastMessage.senderRole || 'unknown'}.`,
            },
            stream: false,
            enable_tools: false,
            metadata: { source: 'smart_reply' },
          },
        });

        if (cancelled || controller.signal.aborted) return;

        if (error) throw error;

        const raw = typeof data === 'string'
          ? data.trim()
          : (data?.content || data?.choices?.[0]?.message?.content || '').trim();

        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setAiSuggestions(parsed.slice(0, 3).map((s: unknown) => String(s)));
        }
      } catch {
        // AI failed — local fallback is already shown
        if (!cancelled) setAiSuggestions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [lastMessage?.content, lastMessage?.senderRole, lastMessage?.threadType, userRole]);

  const suggestions = aiSuggestions.length > 0 ? aiSuggestions : localSuggestions;
  return { suggestions, loading };
}

function generateLocalReplies(content: string): string[] {
  const lower = content.toLowerCase().trim();

  if (/\b(thank|thanks|thx|appreciate)\b/i.test(lower))
    return ["You're welcome!", 'No problem!', 'Happy to help'];
  if (/\b(fee|fees|payment|invoice|balance|amount due|outstanding)\b/i.test(lower))
    return ["I'll check and get back to you", 'Can you send the details?', 'When is it due?'];
  if (/\b(schedule|meeting|appointment|available|reschedule|time|slot)\b/i.test(lower))
    return ['That works for me', 'Can we reschedule?', "I'll confirm later"];
  if (/^(hi|hello|hey|good\s*(morning|afternoon|evening)|howzit|molo)\b/i.test(lower))
    return ['Good morning!', 'Hi! How can I help?', 'Hello!'];
  if (/\b(homework|assignment|worksheet|project|task|due date|submission)\b/i.test(lower))
    return ['My child will complete it tonight', 'Can I get an extension?', 'Thank you for the update'];
  if (/\b(absent|sick|ill|not feeling well|won't be|cannot attend|leave)\b/i.test(lower))
    return ['I hope they feel better soon!', 'Thanks for letting me know', "I'll send the work they missed"];
  if (/\b(event|concert|sports day|field trip|reminder|function|excursion)\b/i.test(lower))
    return ['Thanks for the reminder!', "We'll be there!", 'What should we bring?'];
  if (/\b(report|progress|marks|grades|results|assessment|performance)\b/i.test(lower))
    return ['Thank you for the update', 'Can we discuss this further?', 'Great to hear!'];
  if (/\b(sorry|apologize|apologies|my bad)\b/i.test(lower))
    return ['No worries!', "It's okay", 'Thank you for letting me know'];
  if (lower.includes('?'))
    return ['Yes, I can do that', "I'll get back to you", "I'm not sure, let me check"];

  return ['Got it, thank you!', 'Noted 👍', 'Thanks for sharing'];
}
