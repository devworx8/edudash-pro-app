import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';

type Props = {
  headerTitle: string;
  description: string;
  categoryId?: string;
};

export default function LessonsCategoryPlaceholderScreen({
  headerTitle,
  description,
  categoryId,
}: Props) {
  const { theme } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{headerTitle}</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.comingSoonContainer}>
          <Ionicons name="construct-outline" size={64} color={theme.textSecondary} />
          <Text style={[styles.comingSoonTitle, { color: theme.text }]}>Coming Soon</Text>
          <Text style={[styles.comingSoonDescription, { color: theme.textSecondary }]}>{description}</Text>

          {categoryId ? (
            <View style={styles.categoryInfo}>
              <Text style={[styles.categoryInfoLabel, { color: theme.textSecondary }]}>Category ID: {categoryId}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.backToHubButton, { backgroundColor: theme.primary }]}
            onPress={() => router.back()}
          >
            <Ionicons name="library-outline" size={20} color={theme.onPrimary} />
            <Text style={[styles.backToHubText, { color: theme.onPrimary }]}>Back to Lessons Hub</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  backButton: {
    padding: 8,
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  comingSoonContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  comingSoonTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    marginTop: 24,
    marginBottom: 16,
    textAlign: 'center',
  },
  comingSoonDescription: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
    paddingHorizontal: 20,
  },
  categoryInfo: {
    marginBottom: 24,
    padding: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(128, 128, 128, 0.1)',
  },
  categoryInfoLabel: {
    fontSize: 14,
    textAlign: 'center',
  },
  backToHubButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 25,
    gap: 8,
  },
  backToHubText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
