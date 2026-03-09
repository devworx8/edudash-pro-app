/**
 * useThreadSearch — Search within thread messages
 */

import { useState, useCallback } from 'react';
import { assertSupabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { toast } from '@/components/ui/ToastProvider';
import type { Message } from '@/components/messaging';

interface UseThreadSearchOptions {
  threadId: string;
  setShowOptionsMenu: (show: boolean) => void;
}

export function useThreadSearch({ threadId, setShowOptionsMenu }: UseThreadSearchOptions) {
  const [showSearchOverlay, setShowSearchOverlay] = useState(false);
  const [searchResults, setSearchResults] = useState<Message[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const handleSearchInChat = useCallback(() => {
    setShowSearchOverlay(true);
    setShowOptionsMenu(false);
  }, [setShowOptionsMenu]);

  const performSearch = useCallback(
    async (query: string) => {
      if (!query.trim()) {
        setSearchResults([]);
        return;
      }

      setIsSearching(true);
      setSearchQuery(query);

      try {
        const supabase = assertSupabase();
        const { data, error } = await supabase
          .from('messages')
          .select(
            `id, content, content_type, created_at, sender_id,
             sender:profiles!messages_sender_id_fkey(first_name, last_name, role, avatar_url)`
          )
          .eq('thread_id', threadId)
          .is('deleted_at', null)
          .ilike('content', `%${query}%`)
          .order('created_at', { ascending: false })
          .limit(50);

        if (error) throw error;

        setSearchResults((data as any[]) || []);
      } catch (error) {
        logger.error('ThreadOptions', 'Search error:', error);
        toast.error('Search failed');
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    },
    [threadId]
  );

  const closeSearch = useCallback(() => {
    setShowSearchOverlay(false);
    setSearchResults([]);
    setSearchQuery('');
  }, []);

  return {
    showSearchOverlay,
    searchResults,
    searchQuery,
    isSearching,
    handleSearchInChat,
    performSearch,
    closeSearch,
  };
}
