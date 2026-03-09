/**
 * ChatSearchOverlay — inline search bar + results for in-chat search.
 *
 * Slides in from the top when activated via thread options.
 * Searches messages via ILIKE and highlights matching results.
 */

import React, { useCallback, useRef, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Animated,
  Keyboard,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Message } from '@/components/messaging';

interface ChatSearchOverlayProps {
  visible: boolean;
  query: string;
  results: Message[];
  isSearching: boolean;
  onSearch: (query: string) => void;
  onClose: () => void;
  /** Scroll to a specific message in the thread */
  onScrollToMessage?: (messageId: string) => void;
}

export function ChatSearchOverlay({
  visible,
  query,
  results,
  isSearching,
  onSearch,
  onClose,
  onScrollToMessage,
}: ChatSearchOverlayProps) {
  const slideAnim = useRef(new Animated.Value(-120)).current;
  const inputRef = useRef<TextInput>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [localQuery, setLocalQuery] = useState(query);

  useEffect(() => {
    setLocalQuery(query);
  }, [query, visible]);

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: visible ? 0 : -120,
      duration: 250,
      useNativeDriver: true,
    }).start();

    if (visible) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [visible]);

  const handleChangeText = useCallback(
    (text: string) => {
      setLocalQuery(text);
      // Debounce search to avoid hammering DB on every keystroke
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        onSearch(text);
      }, 350);
    },
    [onSearch]
  );

  const handleClose = useCallback(() => {
    Keyboard.dismiss();
    onClose();
  }, [onClose]);

  const styles = useMemo(() => StyleSheet.create({
    container: {
      backgroundColor: 'rgba(7, 12, 30, 0.98)',
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(125, 211, 252, 0.14)',
      maxHeight: 360,
      zIndex: 50,
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 10,
      gap: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: 'rgba(125, 211, 252, 0.12)',
    },
    input: {
      flex: 1,
      fontSize: 15,
      color: '#f8fafc',
      paddingVertical: 4,
      ...(Platform.OS === 'web'
        ? ({
            outlineStyle: 'none',
            outlineWidth: 0,
            outlineColor: 'transparent',
            boxShadow: 'none',
            borderWidth: 0,
          } as any)
        : null),
    },
    resultsList: {
      maxHeight: 272,
    },
    resultItem: {
      paddingHorizontal: 16,
      paddingVertical: 11,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: 'rgba(125, 211, 252, 0.1)',
      backgroundColor: 'rgba(9, 18, 38, 0.72)',
    },
    resultMeta: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 4,
      gap: 12,
    },
    senderName: {
      fontSize: 13,
      fontWeight: '700',
      color: '#e2e8f0',
      flex: 1,
    },
    resultTime: {
      fontSize: 11,
      color: '#94a3b8',
    },
    resultContent: {
      fontSize: 14,
      color: '#cbd5e1',
      lineHeight: 20,
    },
    noResults: {
      alignItems: 'center',
      paddingVertical: 20,
    },
    noResultsText: {
      color: '#94a3b8',
      fontSize: 14,
    },
  }), []);

  if (!visible) return null;

  const renderResult = ({ item }: { item: Message }) => {
    const senderName = item.sender
      ? `${item.sender.first_name} ${item.sender.last_name}`
      : 'Unknown';
    const time = new Date(item.created_at).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    return (
      <TouchableOpacity
        style={styles.resultItem}
        onPress={() => {
          onScrollToMessage?.(item.id);
          handleClose();
        }}
        activeOpacity={0.7}
      >
        <View style={styles.resultMeta}>
          <Text style={styles.senderName}>{senderName}</Text>
          <Text style={styles.resultTime}>{time}</Text>
        </View>
        <Text style={styles.resultContent} numberOfLines={2}>
          {highlightMatch(item.content, localQuery)}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <Animated.View
      style={[styles.container, { transform: [{ translateY: slideAnim }] }]}
    >
      {/* Search bar */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color="#9ca3af" />
        <TextInput
          ref={inputRef}
          style={styles.input}
          placeholder="Search messages..."
          placeholderTextColor="#9ca3af"
          value={localQuery}
          onChangeText={handleChangeText}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {isSearching && (
          <ActivityIndicator size="small" color="#6366f1" style={{ marginRight: 8 }} />
        )}
        <TouchableOpacity onPress={handleClose} hitSlop={12}>
          <Ionicons name="close-circle" size={22} color="#9ca3af" />
        </TouchableOpacity>
      </View>

      {/* Results */}
      {results.length > 0 ? (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          renderItem={renderResult}
          style={styles.resultsList}
          keyboardShouldPersistTaps="handled"
        />
      ) : localQuery.trim().length > 0 && !isSearching ? (
        <View style={styles.noResults}>
          <Text style={styles.noResultsText}>No messages found</Text>
        </View>
      ) : null}
    </Animated.View>
  );
}

/**
 * Simple highlight helper — wraps matching substring in bold.
 * Returns a React Native Text element tree.
 */
function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;

  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;

  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + query.length);
  const after = text.slice(idx + query.length);

  return (
    <Text>
      {before}
      <Text style={{ fontWeight: '700', color: '#7c5cff' }}>{match}</Text>
      {after}
    </Text>
  );
}

export default ChatSearchOverlay;
