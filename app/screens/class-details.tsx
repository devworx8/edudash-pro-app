import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { logger } from '@/lib/logger';

const TAG = 'ClassDetails';

export default function ClassDetailsScreen() {
  const { theme } = useTheme();
  const { profile } = useAuth();
  const params = useLocalSearchParams();
  
  const classId = params.classId as string;
  const className = params.className as string || 'Class Details';

  logger.debug(TAG, 'Params:', { classId, className, allParams: params });

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <ScreenHeader 
        title={className}
        subtitle="Class management and details"
      />
      
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Class Information</Text>
          <Text style={[styles.cardText, { color: theme.textSecondary }]}>
            Class ID: {classId || 'Not specified'}
          </Text>
          <Text style={[styles.cardText, { color: theme.textSecondary }]}>
            Name: {className || 'Unknown Class'}
          </Text>
          <Text style={[styles.cardText, { color: theme.textSecondary }]}>
            Teacher: {profile?.first_name} {profile?.last_name}
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Quick Actions</Text>
          <View style={styles.actionsGrid}>
            <TouchableOpacity 
              style={[styles.actionButton, { backgroundColor: theme.primary }]}
              onPress={() => router.push('/screens/attendance')}
            >
              <Ionicons name="checkmark-done" size={20} color={theme.onPrimary} />
              <Text style={[styles.actionText, { color: theme.onPrimary }]}>Take Attendance</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.actionButton, { backgroundColor: theme.secondary }]}
              onPress={() => router.push('/screens/assign-lesson')}
            >
              <Ionicons name="document-text" size={20} color={theme.onSecondary} />
              <Text style={[styles.actionText, { color: theme.onSecondary }]}>Assign Homework</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.actionButton, { backgroundColor: theme.accent }]}
              onPress={() => router.push('/screens/teacher-message-list')}
            >
              <Ionicons name="chatbubbles" size={20} color={theme.onAccent} />
              <Text style={[styles.actionText, { color: theme.onAccent }]}>Message Parents</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.actionButton, { backgroundColor: theme.success }]}
              onPress={() => router.push('/screens/student-management')}
            >
              <Ionicons name="people" size={20} color="#FFFFFF" />
              <Text style={[styles.actionText, { color: "#FFFFFF" }]}>Manage Students</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Reports</Text>
          <View style={styles.actionsGrid}>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: theme.surfaceVariant || theme.surface }]}
              onPress={() => router.push({ pathname: '/screens/gradebook', params: { classId, className } })}
            >
              <Ionicons name="bar-chart" size={20} color={theme.primary} />
              <Text style={[styles.actionText, { color: theme.primary }]}>Gradebook</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: theme.surfaceVariant || theme.surface }]}
              onPress={() => router.push({ pathname: '/screens/attendance-history', params: { classId } })}
            >
              <Ionicons name="calendar" size={20} color={theme.primary} />
              <Text style={[styles.actionText, { color: theme.primary }]}>Attendance History</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  card: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    gap: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  cardText: {
    fontSize: 14,
    lineHeight: 20,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
    flex: 1,
    minWidth: '45%',
  },
  actionText: {
    fontSize: 14,
    fontWeight: '600',
  },
});