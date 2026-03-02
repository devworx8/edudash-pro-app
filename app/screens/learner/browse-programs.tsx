/**
 * Browse Programs Screen
 * Allows learners to discover and enroll in available programs/courses
 */
import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, RefreshControl, Alert } from 'react-native';
import { Stack, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { assertSupabase } from '@/lib/supabase';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
interface AvailableProgram {
  id: string;
  title: string;
  description: string | null;
  course_code: string | null;
  organization_id: string;
  instructor_id: string | null;
  is_active: boolean;
  max_students: number | null;
  created_at: string;
  enrollment_count?: number;
  is_enrolled?: boolean;
  organization?: {
    id: string;
    name: string;
  };
  instructor?: {
    first_name: string | null;
    last_name: string | null;
  };
}

export default function BrowseProgramsScreen() {
  const { theme } = useTheme();
  const { profile, user } = useAuth();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [selectedProgram, setSelectedProgram] = useState<AvailableProgram | null>(null);
  const [programCode, setProgramCode] = useState('');
  
  const styles = useMemo(() => createStyles(theme), [theme]);

  // Fetch available programs
  const { data: programs, isLoading, error, refetch } = useQuery({
    queryKey: ['available-programs', user?.id],
    queryFn: async () => {
      const supabase = assertSupabase();
      
      // Get all active courses
      const { data: courses, error: coursesError } = await supabase
        .from('courses')
        .select(`
          id,
          title,
          description,
          course_code,
          organization_id,
          instructor_id,
          is_active,
          max_students,
          created_at,
          organization:organizations!courses_organization_id_fkey(id, name),
          instructor:profiles!courses_instructor_id_fkey(first_name, last_name)
        `)
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (coursesError) throw coursesError;

      // Get user's enrollments
      const { data: enrollments } = await supabase
        .from('enrollments')
        .select('course_id')
        .eq('student_id', user?.id)
        .eq('is_active', true);

      const enrolledCourseIds = new Set((enrollments || []).map((e: any) => e.course_id));

      // Get enrollment counts for each course
      const coursesWithEnrollment = await Promise.all(
        (courses || []).map(async (course: any) => {
          const { count } = await supabase
            .from('enrollments')
            .select('*', { count: 'exact', head: true })
            .eq('course_id', course.id)
            .eq('is_active', true);

          return {
            ...course,
            enrollment_count: count || 0,
            is_enrolled: enrolledCourseIds.has(course.id),
          };
        })
      );

      return coursesWithEnrollment as AvailableProgram[];
    },
    enabled: !!user?.id,
  });

  // Enroll mutation
  const enrollMutation = useMutation({
    mutationFn: async ({ programId, code }: { programId: string; code?: string }) => {
      if (!user?.id) throw new Error('Not authenticated');
      
      const supabase = assertSupabase();

      // Check if already enrolled
      const { data: existingEnrollment } = await supabase
        .from('enrollments')
        .select('id, is_active')
        .eq('course_id', programId)
        .eq('student_id', user.id)
        .maybeSingle();

      if (existingEnrollment) {
        if (existingEnrollment.is_active) {
          throw new Error('You are already enrolled in this program');
        } else {
          // Reactivate enrollment
          const { error: updateError } = await supabase
            .from('enrollments')
            .update({ 
              is_active: true, 
              enrolled_at: new Date().toISOString() 
            })
            .eq('id', existingEnrollment.id);

          if (updateError) throw updateError;
          return;
        }
      }

      // If code is provided, validate it
      if (code) {
        const { data: course } = await supabase
          .from('courses')
          .select('course_code')
          .eq('id', programId)
          .single();

        if (course?.course_code && course.course_code !== code) {
          throw new Error('Invalid program code');
        }
      }

      // Create enrollment
      const { error: enrollError } = await supabase
        .from('enrollments')
        .insert({
          student_id: user.id,
          course_id: programId,
          enrollment_method: code ? 'join_code' : 'self_enroll',
          is_active: true,
          enrolled_at: new Date().toISOString(),
        });

      if (enrollError) throw enrollError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['available-programs'] });
      queryClient.invalidateQueries({ queryKey: ['learner-enrollments'] });
      Alert.alert(
        'Success', 
        'You have been enrolled in the program!',
        [{ text: 'OK', onPress: () => router.push('/screens/learner/programs') }]
      );
      setShowEnrollModal(false);
      setSelectedProgram(null);
      setProgramCode('');
    },
    onError: (error: any) => {
      Alert.alert('Enrollment Failed', error.message || 'Failed to enroll in program');
    },
  });

  // Filter programs by search
  const filteredPrograms = useMemo(() => {
    if (!programs) return [];
    if (!searchQuery.trim()) return programs;
    
    const query = searchQuery.toLowerCase();
    return programs.filter(p => 
      p.title.toLowerCase().includes(query) ||
      p.description?.toLowerCase()?.includes(query) ||
      p.course_code?.toLowerCase()?.includes(query) ||
      p.organization?.name?.toLowerCase()?.includes(query)
    );
  }, [programs, searchQuery]);

  // Separate enrolled and available programs
  const { availablePrograms, enrolledPrograms } = useMemo(() => {
    const available = filteredPrograms.filter(p => !p.is_enrolled);
    const enrolled = filteredPrograms.filter(p => p.is_enrolled);
    return { availablePrograms: available, enrolledPrograms: enrolled };
  }, [filteredPrograms]);

  const handleEnrollPress = (program: AvailableProgram) => {
    // If program has a code, show modal to enter it
    if (program.course_code) {
      setSelectedProgram(program);
      setProgramCode('');
      setShowEnrollModal(true);
    } else {
      // Direct enrollment
      Alert.alert(
        'Enroll in Program',
        `Would you like to enroll in "${program.title}"?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Enroll', 
            onPress: () => enrollMutation.mutate({ programId: program.id }) 
          },
        ]
      );
    }
  };

  const handleEnrollWithCode = () => {
    if (!selectedProgram) return;
    enrollMutation.mutate({ 
      programId: selectedProgram.id, 
      code: programCode.trim() 
    });
  };

  const getCapacityStatus = (program: AvailableProgram) => {
    if (!program.max_students) return null;
    
    const percentage = ((program.enrollment_count || 0) / program.max_students) * 100;
    if (percentage >= 100) return { text: 'Full', color: theme.error || '#EF4444' };
    if (percentage >= 80) return { text: 'Almost Full', color: '#F59E0B' };
    return { 
      text: `${program.enrollment_count || 0}/${program.max_students} enrolled`, 
      color: theme.success || '#10B981' 
    };
  };

  const renderProgram = ({ item }: { item: AvailableProgram }) => {
    const capacity = getCapacityStatus(item);
    const isFull = capacity?.text === 'Full';

    return (
      <Card padding={16} margin={0} elevation="small" style={styles.programCard}>
        <View style={styles.programHeader}>
          <View style={styles.programInfo}>
            <Text style={styles.programTitle} numberOfLines={2}>{item.title}</Text>
            {item.course_code && (
              <Text style={styles.programCode}>Code: {item.course_code}</Text>
            )}
          </View>
          {item.is_enrolled ? (
            <View style={[styles.statusBadge, { backgroundColor: theme.success + '20' }]}>
              <Ionicons name="checkmark-circle" size={14} color={theme.success || '#10B981'} />
              <Text style={[styles.statusText, { color: theme.success || '#10B981' }]}>Enrolled</Text>
            </View>
          ) : capacity && (
            <View style={[styles.statusBadge, { backgroundColor: capacity.color + '20' }]}>
              <Text style={[styles.statusText, { color: capacity.color }]}>{capacity.text}</Text>
            </View>
          )}
        </View>

        {item.description && (
          <Text style={styles.programDescription} numberOfLines={3}>
            {item.description}
          </Text>
        )}

        <View style={styles.programMeta}>
          {item.organization?.name && (
            <View style={styles.metaItem}>
              <Ionicons name="business-outline" size={14} color={theme.textSecondary} />
              <Text style={styles.metaText}>{item.organization.name}</Text>
            </View>
          )}
          {item.instructor && (
            <View style={styles.metaItem}>
              <Ionicons name="person-outline" size={14} color={theme.textSecondary} />
              <Text style={styles.metaText}>
                {item.instructor.first_name} {item.instructor.last_name}
              </Text>
            </View>
          )}
        </View>

        {!item.is_enrolled && (
          <TouchableOpacity
            style={[
              styles.enrollButton,
              { backgroundColor: isFull ? theme.border : theme.primary },
            ]}
            onPress={() => handleEnrollPress(item)}
            disabled={isFull || enrollMutation.isPending}
          >
            {enrollMutation.isPending && selectedProgram?.id === item.id ? (
              <EduDashSpinner size="small" color="#fff" />
            ) : (
              <>
                <Ionicons 
                  name={isFull ? 'close-circle' : 'add-circle'} 
                  size={18} 
                  color="#fff" 
                />
                <Text style={styles.enrollButtonText}>
                  {isFull ? 'Program Full' : 'Enroll Now'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {item.is_enrolled && (
          <TouchableOpacity
            style={[styles.viewButton, { borderColor: theme.primary }]}
            onPress={() => router.push(`/screens/learner/program-detail?id=${item.id}`)}
          >
            <Text style={[styles.viewButtonText, { color: theme.primary }]}>
              View Program
            </Text>
            <Ionicons name="arrow-forward" size={16} color={theme.primary} />
          </TouchableOpacity>
        )}
      </Card>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Stack.Screen 
        options={{ 
          title: t('learner.browse_programs', { defaultValue: 'Browse Programs' }),
          headerRight: () => (
            <TouchableOpacity 
              style={styles.headerButton}
              onPress={() => router.push('/screens/learner/enroll-by-program-code')}
            >
              <Ionicons name="qr-code" size={24} color={theme.primary} />
            </TouchableOpacity>
          ),
        }} 
      />

      <View style={styles.content}>
        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={theme.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder={t('common.search_programs', { defaultValue: 'Search programs...' })}
            placeholderTextColor={theme.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color={theme.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Enroll by Code Button */}
        <TouchableOpacity
          style={[styles.codeEnrollButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
          onPress={() => router.push('/screens/learner/enroll-by-program-code')}
        >
          <View style={[styles.codeIcon, { backgroundColor: theme.primary + '20' }]}>
            <Ionicons name="key" size={20} color={theme.primary} />
          </View>
          <View style={styles.codeEnrollInfo}>
            <Text style={styles.codeEnrollTitle}>
              {t('learner.have_code', { defaultValue: 'Have a program code?' })}
            </Text>
            <Text style={styles.codeEnrollSubtitle}>
              {t('learner.enter_code_enroll', { defaultValue: 'Enter it to enroll directly' })}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
        </TouchableOpacity>

        {/* Programs List */}
        {isLoading ? (
          <View style={styles.centered}>
            <EduDashSpinner size="large" color={theme.primary} />
          </View>
        ) : error ? (
          <View style={styles.centered}>
            <EmptyState
              icon="alert-circle-outline"
              title={t('common.error', { defaultValue: 'Error' })}
              description={t('common.error_loading', { defaultValue: 'Failed to load programs' })}
              actionLabel={t('common.retry', { defaultValue: 'Retry' })}
              onActionPress={() => refetch()}
            />
          </View>
        ) : filteredPrograms.length === 0 ? (
          <View style={styles.centered}>
            <EmptyState
              icon="school-outline"
              title={t('learner.no_programs_found', { defaultValue: 'No Programs Found' })}
              description={
                searchQuery 
                  ? t('learner.try_different_search', { defaultValue: 'Try a different search term' })
                  : t('learner.no_programs_available', { defaultValue: 'No programs are available at this time' })
              }
            />
          </View>
        ) : (
          <FlatList
            data={availablePrograms}
            renderItem={renderProgram}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isLoading}
                onRefresh={refetch}
                tintColor={theme.primary}
              />
            }
            ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
            ListHeaderComponent={
              enrolledPrograms.length > 0 ? (
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>
                    {t('learner.available_programs', { defaultValue: 'Available Programs' })}
                  </Text>
                  <Text style={styles.sectionSubtitle}>
                    {availablePrograms.length} program{availablePrograms.length !== 1 ? 's' : ''}
                  </Text>
                </View>
              ) : null
            }
            ListFooterComponent={
              enrolledPrograms.length > 0 ? (
                <View style={{ marginTop: 24 }}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>
                      {t('learner.your_programs', { defaultValue: 'Your Programs' })}
                    </Text>
                    <Text style={styles.sectionSubtitle}>
                      {enrolledPrograms.length} enrolled
                    </Text>
                  </View>
                  {enrolledPrograms.map((program) => (
                    <View key={program.id} style={{ marginBottom: 12 }}>
                      {renderProgram({ item: program })}
                    </View>
                  ))}
                </View>
              ) : null
            }
          />
        )}
      </View>

      {/* Code Entry Modal */}
      {showEnrollModal && selectedProgram && (
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Enter Program Code</Text>
              <TouchableOpacity onPress={() => setShowEnrollModal(false)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>
            
            <Text style={styles.modalDescription}>
              Enter the code for "{selectedProgram.title}" to enroll
            </Text>

            <TextInput
              style={styles.codeInput}
              placeholder="Enter code..."
              placeholderTextColor={theme.textSecondary}
              value={programCode}
              onChangeText={setProgramCode}
              autoCapitalize="characters"
              autoFocus
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: theme.border }]}
                onPress={() => setShowEnrollModal(false)}
              >
                <Text style={[styles.modalButtonText, { color: theme.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: theme.primary }]}
                onPress={handleEnrollWithCode}
                disabled={enrollMutation.isPending || !programCode.trim()}
              >
                {enrollMutation.isPending ? (
                  <EduDashSpinner size="small" color="#fff" />
                ) : (
                  <Text style={[styles.modalButtonText, { color: '#fff' }]}>Enroll</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  headerButton: {
    padding: 8,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    padding: 12,
    fontSize: 15,
    color: theme.text,
  },
  codeEnrollButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  codeIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  codeEnrollInfo: {
    flex: 1,
  },
  codeEnrollTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.text,
  },
  codeEnrollSubtitle: {
    fontSize: 13,
    color: theme.textSecondary,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.text,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: theme.textSecondary,
  },
  programCard: {
    borderRadius: 12,
  },
  programHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  programInfo: {
    flex: 1,
    marginRight: 12,
  },
  programTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.text,
    marginBottom: 4,
  },
  programCode: {
    fontSize: 12,
    color: theme.textSecondary,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  programDescription: {
    fontSize: 14,
    color: theme.textSecondary,
    lineHeight: 20,
    marginBottom: 12,
  },
  programMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: theme.textSecondary,
  },
  enrollButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
  },
  enrollButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  viewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  viewButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  // Modal styles
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    borderRadius: 16,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.text,
  },
  modalDescription: {
    fontSize: 14,
    color: theme.textSecondary,
    marginBottom: 16,
  },
  codeInput: {
    backgroundColor: theme.background,
    borderRadius: 12,
    padding: 14,
    fontSize: 18,
    color: theme.text,
    textAlign: 'center',
    letterSpacing: 4,
    borderWidth: 1,
    borderColor: theme.border,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  modalButton: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  modalButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
