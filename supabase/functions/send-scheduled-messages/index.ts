/**
 * send-scheduled-messages — Cron Edge Function
 *
 * Runs periodically to find messages where is_scheduled = true and
 * scheduled_at <= now(), then "delivers" them by clearing the flag
 * and sending push notifications to thread participants.
 *
 * Intended to be invoked by pg_cron or an external scheduler.
 */

import { serve } from 'https://deno.land/std@0.214.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

serve(async (req: Request) => {
  // Only allow POST (cron trigger) or GET (manual trigger with auth)
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Find all due scheduled messages
  const { data: dueMessages, error: fetchError } = await supabase
    .from('messages')
    .select('id, thread_id, sender_id, content, content_type')
    .eq('is_scheduled', true)
    .lte('scheduled_at', new Date().toISOString())
    .limit(100);

  if (fetchError) {
    return new Response(JSON.stringify({ error: fetchError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!dueMessages?.length) {
    return new Response(JSON.stringify({ delivered: 0 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const messageIds = dueMessages.map((m: any) => m.id);

  // Mark as delivered: clear scheduled flag, set created_at to now so it sorts correctly
  const { error: updateError } = await supabase
    .from('messages')
    .update({
      is_scheduled: false,
      created_at: new Date().toISOString(),
    })
    .in('id', messageIds);

  if (updateError) {
    return new Response(JSON.stringify({ error: updateError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Update thread ordering for affected threads
  const threadIds = [...new Set(dueMessages.map((m: any) => m.thread_id))];
  for (const threadId of threadIds) {
    await supabase
      .from('message_threads')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', threadId);
  }

  // Send push notifications for each delivered message
  for (const msg of dueMessages) {
    try {
      // Get thread participants (excluding sender)
      const { data: participants } = await supabase
        .from('message_participants')
        .select('user_id')
        .eq('thread_id', msg.thread_id)
        .neq('user_id', msg.sender_id);

      if (!participants?.length) continue;

      // Get sender name
      const { data: sender } = await supabase
        .from('profiles')
        .select('first_name, last_name')
        .eq('id', msg.sender_id)
        .single();

      const senderName = sender
        ? `${sender.first_name || ''} ${sender.last_name || ''}`.trim() || 'Someone'
        : 'Someone';

      const recipientIds = participants.map((p: any) => p.user_id);

      // Fire notification via the dispatcher (fire-and-forget per message)
      await supabase.functions.invoke('notifications-dispatcher', {
        body: {
          type: 'message',
          title: senderName,
          body: msg.content_type === 'voice'
            ? '🎤 Voice message'
            : msg.content.length > 100
              ? msg.content.substring(0, 100) + '…'
              : msg.content,
          data: {
            thread_id: msg.thread_id,
            message_id: msg.id,
            sender_id: msg.sender_id,
          },
          recipient_ids: recipientIds,
        },
      });
    } catch {
      // Don't fail the whole batch for one notification error
    }
  }

  return new Response(
    JSON.stringify({ delivered: messageIds.length, threads: threadIds.length }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
});
