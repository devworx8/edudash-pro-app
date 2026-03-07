'use client';

/**
 * Hook for managing contact conversations
 * Extracted from TeacherContactsWidget.tsx
 */

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface UseContactConversationReturn {
  startConversation: (contactId: string, contactRole: string) => Promise<void>;
}

export function useContactConversation(
  preschoolId: string | undefined,
  teacherId: string | undefined
): UseContactConversationReturn {
  const router = useRouter();

  const startConversation = useCallback(async (contactId: string, contactRole: string) => {
    if (!preschoolId || !teacherId) return;
    const supabase = createClient();

    try {
      // Find existing thread between teacher and contact
      const { data: existingThreads, error: threadsError } = await supabase
        .from('message_threads')
        .select('id, message_participants(user_id, role)')
        .eq('preschool_id', preschoolId);
      
      if (threadsError) throw threadsError;
      
      const existingThread = existingThreads?.find((thread: any) => {
        const participants = thread.message_participants || [];
        return participants.some((p: any) => p.user_id === teacherId) &&
               participants.some((p: any) => p.user_id === contactId);
      });
      
      if (existingThread) {
        router.push(`/dashboard/teacher/messages?thread=${existingThread.id}`);
        return;
      }
      
      // Create new thread
      const threadType = contactRole === 'parent' ? 'parent-teacher' : 'general';
      const threadPayload = {
        preschool_id: preschoolId,
        subject: `Conversation with ${contactRole}`,
        created_by: teacherId,
        type: threadType,
        last_message_at: new Date().toISOString(),
      };

      let newThread: { id: string } | null = null;
      const { data: createdThread, error: threadError } = await supabase
        .from('message_threads')
        .insert(threadPayload)
        .select()
        .single();

      if (threadError) {
        const errorMessage = threadError.message?.toLowerCase() || '';
        if (errorMessage.includes('created_by')) {
          const { data: fallbackThread, error: fallbackError } = await supabase
            .from('message_threads')
            .insert({
              preschool_id: preschoolId,
              subject: `Conversation with ${contactRole}`,
              type: threadType,
              last_message_at: new Date().toISOString(),
            })
            .select()
            .single();

          if (fallbackError) throw fallbackError;
          newThread = fallbackThread;
        } else {
          throw threadError;
        }
      } else {
        newThread = createdThread;
      }

      if (!newThread?.id) {
        throw new Error('Unable to create conversation.');
      }
      
      // Add participants
      await supabase.from('message_participants').insert([
        { thread_id: newThread.id, user_id: teacherId, role: 'teacher', joined_at: new Date().toISOString() },
        { thread_id: newThread.id, user_id: contactId, role: contactRole, joined_at: new Date().toISOString() }
      ]);
      
      router.push(`/dashboard/teacher/messages?thread=${newThread.id}`);
    } catch (error: any) {
      console.error('Error starting conversation:', error);
      alert('Failed to start conversation. Please try again.');
    }
  }, [preschoolId, teacherId, router]);

  return { startConversation };
}
