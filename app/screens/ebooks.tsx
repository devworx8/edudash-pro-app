/**
 * E-Books Library Screen
 * 
 * Displays CAPS-approved textbooks with search, filters, and bookmarks.
 * Uses react-native-pdf for viewing PDFs with offline support.
 * Feature-flagged: Only active when ebooks_enabled is true.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Dimensions, Image, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, Stack } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { getFeatureFlagsSync } from '@/lib/featureFlags';
import { useTheme } from '@/contexts/ThemeContext';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = (SCREEN_WIDTH - 48) / 2;

// Types
interface EBook {
  id: string;
  title: string;
  grade: string;
  subject: string;
  language: string;
  publisher: string;
  isbn?: string;
  cover_url?: string;
  pdf_url?: string;
  file_size?: string;
  page_count?: number;
  description?: string;
  caps_approved: boolean;
  publication_year: number;
}

// Grade options
const GRADES = ['all', 'R', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

// Subject options
const SUBJECTS = [
  'all',
  'Mathematics',
  'English',
  'Afrikaans',
  'Geography',
  'History',
  'Life Sciences',
  'Physical Sciences',
  'Economics',
  'Accounting',
];

// Language options
const LANGUAGES = [
  { value: 'all', label: 'All Languages' },
  { value: 'en', label: 'English' },
  { value: 'af', label: 'Afrikaans' },
  { value: 'zu', label: 'isiZulu' },
  { value: 'st', label: 'Sesotho' },
];

export default function EBooksScreen() {
  const { theme, isDark } = useTheme();
  const [books, setBooks] = useState<EBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGrade, setSelectedGrade] = useState('all');
  const [selectedSubject, setSelectedSubject] = useState('all');
  const [selectedLanguage, setSelectedLanguage] = useState('all');
  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);

  // Check if feature is enabled
  const flags = getFeatureFlagsSync();

  // Load books from database
  const loadBooks = useCallback(async () => {
    try {
      let query = supabase
        .from('textbooks')
        .select('*')
        .eq('is_active', true)
        .order('grade')
        .order('subject');

      if (selectedGrade !== 'all') {
        query = query.eq('grade', selectedGrade);
      }

      if (selectedSubject !== 'all') {
        query = query.eq('subject', selectedSubject);
      }

      if (selectedLanguage !== 'all') {
        query = query.eq('language', selectedLanguage);
      }

      const { data, error } = await query;

      if (error) throw error;
      setBooks((data as EBook[]) || []);
    } catch (error) {
      console.error('Error loading books:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedGrade, selectedSubject, selectedLanguage]);

  // Load user bookmarks
  const loadBookmarks = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('user_bookmarks')
        .select('textbook_id')
        .eq('user_id', user.id);

      if (data) {
        setBookmarks(new Set(data.map((b: { textbook_id: string }) => b.textbook_id)));
      }
    } catch (error) {
      console.error('Error loading bookmarks:', error);
    }
  }, []);

  useEffect(() => {
    loadBooks();
    loadBookmarks();
  }, [loadBooks, loadBookmarks]);

  // Toggle bookmark
  const toggleBookmark = async (bookId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      if (bookmarks.has(bookId)) {
        // Remove bookmark
        await supabase
          .from('user_bookmarks')
          .delete()
          .eq('user_id', user.id)
          .eq('textbook_id', bookId);

        setBookmarks((prev) => {
          const next = new Set(prev);
          next.delete(bookId);
          return next;
        });
      } else {
        // Add bookmark
        await supabase
          .from('user_bookmarks')
          .insert({ user_id: user.id, textbook_id: bookId });

        setBookmarks((prev) => new Set([...prev, bookId]));
      }
    } catch (error) {
      console.error('Error toggling bookmark:', error);
    }
  };

  // Open book in PDF viewer
  const openBook = (book: EBook) => {
    if (!book.pdf_url) {
      // Show placeholder for books without PDF
      alert('This book is currently being prepared. PDF will be available soon!');
      return;
    }

    router.push({
      pathname: '/screens/pdf-viewer',
      params: {
        url: book.pdf_url,
        title: book.title,
        bookId: book.id,
      },
    });
  };

  // Filter books by search query
  const filteredBooks = books.filter((book) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      book.title.toLowerCase().includes(query) ||
      book.subject.toLowerCase().includes(query) ||
      book.publisher.toLowerCase().includes(query)
    );
  });

  // Pull to refresh
  const onRefresh = () => {
    setRefreshing(true);
    loadBooks();
    loadBookmarks();
  };

  // Render book card
  const renderBookCard = ({ item }: { item: EBook }) => {
    const isBookmarked = bookmarks.has(item.id);

    return (
      <TouchableOpacity
        style={[styles.bookCard, { backgroundColor: theme.surface }]}
        onPress={() => openBook(item)}
        activeOpacity={0.8}
      >
        {/* Cover Image */}
        <View style={styles.coverContainer}>
          {item.cover_url ? (
            <Image
              source={{ uri: item.cover_url }}
              style={styles.coverImage}
              resizeMode="cover"
            />
          ) : (
            <LinearGradient
              colors={['#6366f1', '#8b5cf6']}
              style={styles.coverPlaceholder}
            >
              <Ionicons name="book" size={40} color="rgba(255,255,255,0.8)" />
            </LinearGradient>
          )}

          {/* CAPS Badge */}
          {item.caps_approved && (
            <View style={styles.capsBadge}>
              <Text style={styles.capsBadgeText}>CAPS</Text>
            </View>
          )}

          {/* Bookmark Button */}
          <TouchableOpacity
            style={styles.bookmarkButton}
            onPress={() => toggleBookmark(item.id)}
          >
            <Ionicons
              name={isBookmarked ? 'bookmark' : 'bookmark-outline'}
              size={20}
              color={isBookmarked ? '#f59e0b' : '#ffffff'}
            />
          </TouchableOpacity>
        </View>

        {/* Book Info */}
        <View style={styles.bookInfo}>
          <Text style={[styles.bookTitle, { color: theme.text }]} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={[styles.bookMeta, { color: theme.muted }]}>
            Grade {item.grade} • {item.subject}
          </Text>
          <Text style={[styles.bookPublisher, { color: theme.muted }]} numberOfLines={1}>
            {item.publisher}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  // Render filter chip
  const renderFilterChip = (
    label: string,
    value: string,
    selected: string,
    onSelect: (v: string) => void
  ) => {
    const isSelected = value === selected;
    return (
      <TouchableOpacity
        key={value}
        style={[
          styles.filterChip,
          {
            backgroundColor: isSelected ? theme.primary : theme.surface,
            borderColor: isSelected ? theme.primary : theme.border,
          },
        ]}
        onPress={() => onSelect(value)}
      >
        <Text
          style={[
            styles.filterChipText,
            { color: isSelected ? '#ffffff' : theme.text },
          ]}
        >
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  // Feature flag check - e-books not enabled
  if (!flags.ebooks_enabled) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ title: 'E-Books' }} />
        <View style={styles.disabledContainer}>
          <Ionicons name="book-outline" size={64} color={theme.muted} />
          <Text style={[styles.disabledText, { color: theme.text }]}>
            E-Books feature is not available
          </Text>
          <Text style={[styles.disabledSubtext, { color: theme.muted }]}>
            Please contact your administrator to enable this feature.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen
        options={{
          title: 'E-Books Library',
          headerRight: () => (
            <TouchableOpacity
              onPress={() => setShowFilters(!showFilters)}
              style={styles.filterButton}
            >
              <Ionicons
                name={showFilters ? 'options' : 'options-outline'}
                size={24}
                color={theme.primary}
              />
            </TouchableOpacity>
          ),
        }}
      />

      {/* Search Bar */}
      <View style={[styles.searchContainer, { backgroundColor: theme.surface }]}>
        <Ionicons name="search" size={20} color={theme.muted} />
        <TextInput
          style={[styles.searchInput, { color: theme.text }]}
          placeholder="Search books..."
          placeholderTextColor={theme.muted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color={theme.muted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filters Panel */}
      {showFilters && (
        <View style={[styles.filtersPanel, { backgroundColor: theme.surface }]}>
          {/* Grade Filter */}
          <Text style={[styles.filterLabel, { color: theme.text }]}>Grade</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterScroll}
          >
            {GRADES.map((g) =>
              renderFilterChip(
                g === 'all' ? 'All' : `Grade ${g}`,
                g,
                selectedGrade,
                setSelectedGrade
              )
            )}
          </ScrollView>

          {/* Subject Filter */}
          <Text style={[styles.filterLabel, { color: theme.text }]}>Subject</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterScroll}
          >
            {SUBJECTS.map((s) =>
              renderFilterChip(
                s === 'all' ? 'All' : s,
                s,
                selectedSubject,
                setSelectedSubject
              )
            )}
          </ScrollView>

          {/* Language Filter */}
          <Text style={[styles.filterLabel, { color: theme.text }]}>Language</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterScroll}
          >
            {LANGUAGES.map((l) =>
              renderFilterChip(l.label, l.value, selectedLanguage, setSelectedLanguage)
            )}
          </ScrollView>
        </View>
      )}

      {/* Loading State */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <EduDashSpinner size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.muted }]}>
            Loading books...
          </Text>
        </View>
      ) : filteredBooks.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="book-outline" size={64} color={theme.muted} />
          <Text style={[styles.emptyText, { color: theme.text }]}>
            No books found
          </Text>
          <Text style={[styles.emptySubtext, { color: theme.muted }]}>
            Try adjusting your filters or search query
          </Text>
        </View>
      ) : (
        <FlashList
          data={filteredBooks}
          renderItem={renderBookCard}
          keyExtractor={(item) => item.id}
          numColumns={2}
          contentContainerStyle={styles.bookList}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.primary}
            />
          }
          showsVerticalScrollIndicator={false}
          estimatedItemSize={280}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  disabledContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  disabledText: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    textAlign: 'center',
  },
  disabledSubtext: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  filterButton: {
    padding: 8,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    padding: 12,
    borderRadius: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
  },
  filtersPanel: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 12,
  },
  filterScroll: {
    flexGrow: 0,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  bookList: {
    padding: 16,
    paddingTop: 0,
  },
  bookRow: {
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  bookCard: {
    width: CARD_WIDTH,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  coverContainer: {
    width: '100%',
    height: CARD_WIDTH * 1.3,
    position: 'relative',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  capsBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: '#22c55e',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  capsBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  bookmarkButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookInfo: {
    padding: 12,
  },
  bookTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
    lineHeight: 18,
  },
  bookMeta: {
    fontSize: 12,
    marginBottom: 2,
  },
  bookPublisher: {
    fontSize: 11,
  },
});
