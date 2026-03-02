/**
 * Parent Universal Search Screen
 * 
 * Cross-entity search across homework, children, messages, and events.
 * Matches web parity from /dashboard/parent/search.
 */

import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { assertSupabase } from '@/lib/supabase';
import EduDashSpinner from '@/components/ui/EduDashSpinner';

interface SearchResult {
  id: string;
  type: 'homework' | 'child' | 'message' | 'event';
  title: string;
  subtitle?: string;
  route: string;
}

const TYPE_CONFIG: Record<string, { icon: string; color: string }> = {
  homework: { icon: 'document-text', color: '#f59e0b' },
  child: { icon: 'people', color: '#8b5cf6' },
  message: { icon: 'chatbubble', color: '#06b6d4' },
  event: { icon: 'calendar', color: '#10b981' },
};

export default function ParentSearchScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const styles = createStyles(theme, insets.top, insets.bottom);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim() || !user?.id) return;

    setLoading(true);
    setHasSearched(true);
    const searchResults: SearchResult[] = [];

    try {
      const supabase = assertSupabase();

      // Get user's children
      const { data: children } = await supabase
        .from('students')
        .select('id, first_name, last_name, grade, preschool_id, class_id')
        .or(`parent_id.eq.${user.id},guardian_id.eq.${user.id}`);

      if (!children || children.length === 0) {
        setResults([]);
        setLoading(false);
        return;
      }

      const childIds = children.map((c: any) => c.id);
      const classIds = [...new Set(children.map((c: any) => c.class_id).filter(Boolean))];

      // Search children
      children
        .filter((child: any) =>
          `${child.first_name} ${child.last_name}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
          child.grade?.toLowerCase()?.includes(searchQuery.toLowerCase())
        )
        .forEach((child: any) => {
          searchResults.push({
            id: child.id,
            type: 'child',
            title: `${child.first_name} ${child.last_name}`,
            subtitle: child.grade || 'No grade',
            route: '/screens/parent-progress',
          });
        });

      // Search homework
      if (classIds.length > 0) {
        const { data: homework } = await supabase
          .from('homework_assignments')
          .select('id, title, due_date, class_id')
          .in('class_id', classIds)
          .eq('is_published', true)
          .ilike('title', `%${searchQuery}%`)
          .order('due_date', { ascending: false })
          .limit(10);

        homework?.forEach((hw: any) => {
          searchResults.push({
            id: hw.id,
            type: 'homework',
            title: hw.title,
            subtitle: `Due: ${new Date(hw.due_date).toLocaleDateString('en-ZA')}`,
            route: '/screens/homework',
          });
        });
      }

      // Search messages
      {
        const { data: messages } = await supabase
          .from('messages')
          .select('id, subject, content, created_at')
          .or(`recipient_id.eq.${user.id},sender_id.eq.${user.id}`)
          .or(`subject.ilike.%${searchQuery}%,content.ilike.%${searchQuery}%`)
          .order('created_at', { ascending: false })
          .limit(10);

        messages?.forEach((msg: any) => {
          searchResults.push({
            id: msg.id,
            type: 'message',
            title: msg.subject || 'No subject',
            subtitle: new Date(msg.created_at).toLocaleDateString('en-ZA'),
            route: '/screens/parent-messages',
          });
        });
      }

      setResults(searchResults);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  const handleSubmit = () => {
    if (query.trim()) performSearch(query.trim());
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Search Header */}
      <View style={styles.searchHeader}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color={theme.text} />
        </TouchableOpacity>
        <View style={styles.searchInputContainer}>
          <Ionicons name="search" size={18} color={theme.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder={t('parent.search_placeholder', { defaultValue: 'Search homework, messages, children...' })}
            placeholderTextColor={theme.textSecondary}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={handleSubmit}
            returnKeyType="search"
            autoFocus
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => { setQuery(''); setResults([]); setHasSearched(false); }}>
              <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Results */}
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.centerContainer}>
            <EduDashSpinner size="large" color={theme.primary} />
          </View>
        ) : hasSearched && results.length === 0 ? (
          <View style={styles.centerContainer}>
            <Ionicons name="search" size={48} color={theme.textSecondary} style={{ opacity: 0.4 }} />
            <Text style={styles.emptyTitle}>No results found</Text>
            <Text style={styles.emptyText}>Try a different search term</Text>
          </View>
        ) : results.length > 0 ? (
          <>
            <Text style={styles.resultCount}>
              Found {results.length} result{results.length === 1 ? '' : 's'} for &quot;{query}&quot;
            </Text>
            {results.map((result) => {
              const config = TYPE_CONFIG[result.type];
              return (
                <TouchableOpacity
                  key={`${result.type}-${result.id}`}
                  style={styles.resultCard}
                  onPress={() => router.push(result.route as any)}
                  activeOpacity={0.85}
                >
                  <View style={[styles.resultIcon, { backgroundColor: `${config.color}20` }]}>
                    <Ionicons name={config.icon as any} size={20} color={config.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.resultTitle} numberOfLines={1}>{result.title}</Text>
                    {result.subtitle && (
                      <Text style={styles.resultSubtitle} numberOfLines={1}>{result.subtitle}</Text>
                    )}
                  </View>
                  <View style={[styles.typeBadge, { backgroundColor: `${config.color}20` }]}>
                    <Text style={[styles.typeBadgeText, { color: config.color }]}>
                      {result.type}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </>
        ) : (
          <View style={styles.centerContainer}>
            <Ionicons name="search" size={48} color={theme.textSecondary} style={{ opacity: 0.4 }} />
            <Text style={styles.emptyTitle}>Start searching</Text>
            <Text style={styles.emptyText}>Enter a search term to find homework, messages, and more</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const createStyles = (theme: any, topInset: number, bottomInset: number) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    searchHeader: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingTop: topInset + 12, paddingHorizontal: 16, paddingBottom: 12,
      backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border,
    },
    backButton: { padding: 4 },
    searchInputContainer: {
      flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: theme.elevated, borderRadius: 12, paddingHorizontal: 12, height: 44,
    },
    searchInput: { flex: 1, fontSize: 15, color: theme.text },
    scrollContent: { paddingHorizontal: 16, paddingBottom: bottomInset + 40, paddingTop: 16, gap: 10 },
    centerContainer: { alignItems: 'center', paddingVertical: 60, gap: 10 },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: theme.text },
    emptyText: { fontSize: 14, color: theme.textSecondary, textAlign: 'center' },
    resultCount: { fontSize: 13, color: theme.textSecondary, marginBottom: 8 },
    resultCard: {
      flexDirection: 'row', alignItems: 'center', gap: 14,
      backgroundColor: theme.surface, borderRadius: 14, padding: 14,
      borderWidth: 1, borderColor: theme.border,
    },
    resultIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    resultTitle: { fontSize: 15, fontWeight: '600', color: theme.text, marginBottom: 2 },
    resultSubtitle: { fontSize: 13, color: theme.textSecondary },
    typeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    typeBadgeText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  });
