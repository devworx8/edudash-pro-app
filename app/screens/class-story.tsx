/**
 * Class Story / Photo Journal
 *
 * Teachers post captioned photos visible to parents in the class.
 * Photos stored in Supabase Storage (paths only), not signed URLs.
 *
 * ≤500 lines (WARP.md compliant for screens)
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useTeacherSchool } from '@/hooks/useTeacherSchool';
import { useAlertModal, AlertModal } from '@/components/ui/AlertModal';
import { assertSupabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import EduDashSpinner from '@/components/ui/EduDashSpinner';

const BUCKET = 'class-posts';
const TAG = 'ClassStory';

export default function ClassStoryScreen() {
  const { profile } = useAuth();
  const { theme, isDark } = useTheme();
  const { schoolId } = useTeacherSchool();
  const { showAlert, alertProps } = useAlertModal();
  const queryClient = useQueryClient();
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);

  const [caption, setCaption] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Fetch class posts
  const postsQuery = useQuery({
    queryKey: ['class_posts', schoolId],
    queryFn: async () => {
      if (!schoolId) return [];
      const { data, error } = await assertSupabase()
        .from('class_posts')
        .select('*, profiles!class_posts_teacher_id_fkey(full_name)')
        .eq('organization_id', schoolId)
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      return data || [];
    },
    enabled: !!schoolId,
  });

  // Resolve storage path to signed URL for display
  const getSignedUrl = useCallback(async (path: string) => {
    const { data } = await assertSupabase()
      .storage.from(BUCKET)
      .createSignedUrl(path, 3600);
    return data?.signedUrl || null;
  }, []);

  const pickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      showAlert({
        title: 'Permission Required',
        message: 'Photo library access is needed to add photos.',
        type: 'error',
      });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  // Upload photo + save post
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.id || !schoolId) throw new Error('Not authenticated');
      if (!caption.trim() && !photoUri) throw new Error('Add a caption or photo');

      let storagePath: string | null = null;

      if (photoUri) {
        const timestamp = Date.now();
        storagePath = `${schoolId}/${profile.id}/${timestamp}.jpg`;

        if (Platform.OS === 'web') {
          const response = await fetch(photoUri);
          const blob = await response.blob();
          const { error: uploadError } = await assertSupabase()
            .storage.from(BUCKET)
            .upload(storagePath, blob, { contentType: 'image/jpeg', upsert: false });
          if (uploadError) throw new Error(`Photo upload failed: ${uploadError.message}`);
        } else {
          const supabase = assertSupabase();
          const { data: sessionData } = await supabase.auth.getSession();
          const token = sessionData?.session?.access_token;
          if (!token) throw new Error('Session expired');

          // Use fetch-based upload for React Native
          const formData = new FormData();
          formData.append('file', {
            uri: photoUri,
            name: `${timestamp}.jpg`,
            type: 'image/jpeg',
          } as any);

          const { error: uploadError } = await supabase.storage
            .from(BUCKET)
            .upload(storagePath, formData as any, { contentType: 'image/jpeg', upsert: false });
          if (uploadError) throw new Error(`Photo upload failed: ${uploadError.message}`);
        }
      }

      const { error } = await assertSupabase().from('class_posts').insert({
        organization_id: schoolId,
        teacher_id: profile.id,
        caption: caption.trim() || null,
        photo_paths: storagePath ? [storagePath] : [],
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['class_posts'] });
      setCaption('');
      setPhotoUri(null);
      setShowForm(false);
      showAlert({ title: 'Posted', message: 'Class story published!', type: 'success' });
      logger.info(TAG, 'Class post created');
    },
    onError: (err: Error) => {
      showAlert({ title: 'Post Failed', message: err.message, type: 'error' });
    },
  });

  const renderPost = useCallback(
    ({ item }: { item: any }) => <PostCard item={item} theme={theme} isDark={isDark} getSignedUrl={getSignedUrl} />,
    [theme, isDark, getSignedUrl]
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <Stack.Screen options={{ title: 'Class Story', headerShown: true }} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        {/* Add Post Button */}
        {!showForm && (
          <TouchableOpacity
            style={[styles.addButton, { backgroundColor: theme.primary }]}
            onPress={() => setShowForm(true)}
          >
            <Ionicons name="camera" size={20} color="#fff" />
            <Text style={styles.addButtonText}>New Story Post</Text>
          </TouchableOpacity>
        )}

        {/* Compose Form */}
        {showForm && (
          <View style={[styles.formContainer, { borderColor: theme.border }]}>
            <Text style={[styles.formTitle, { color: theme.text }]}>Share with Parents</Text>

            {/* Photo preview / picker */}
            {photoUri ? (
              <View style={styles.previewContainer}>
                <Image source={{ uri: photoUri }} style={styles.photoPreview} />
                <TouchableOpacity
                  style={styles.removePhoto}
                  onPress={() => setPhotoUri(null)}
                >
                  <Ionicons name="close-circle" size={28} color="#EF4444" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={[styles.photoPicker, { borderColor: theme.border }]} onPress={pickPhoto}>
                <Ionicons name="image-outline" size={32} color={theme.textSecondary} />
                <Text style={[styles.photoPickerText, { color: theme.textSecondary }]}>
                  Tap to add a photo
                </Text>
              </TouchableOpacity>
            )}

            {/* Caption */}
            <TextInput
              style={[styles.captionInput, { color: theme.text, borderColor: theme.border }]}
              value={caption}
              onChangeText={setCaption}
              placeholder="What's happening in class today?"
              placeholderTextColor={theme.textSecondary}
              multiline
              numberOfLines={3}
            />

            <View style={styles.formActions}>
              <TouchableOpacity
                style={[styles.cancelButton, { borderColor: theme.border }]}
                onPress={() => { setShowForm(false); setPhotoUri(null); setCaption(''); }}
              >
                <Text style={[styles.cancelText, { color: theme.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveButton, { backgroundColor: theme.primary }]}
                onPress={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
              >
                {saveMutation.isPending ? (
                  <EduDashSpinner size="small" color="#fff" />
                ) : (
                  <Text style={styles.saveText}>Post Story</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Posts Feed */}
        {postsQuery.isLoading ? (
          <View style={styles.center}>
            <EduDashSpinner size="large" color={theme.primary} />
          </View>
        ) : (postsQuery.data?.length || 0) === 0 ? (
          <View style={styles.center}>
            <Ionicons name="images-outline" size={48} color={theme.textSecondary} />
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              No class stories yet — share what&apos;s happening!
            </Text>
          </View>
        ) : (
          <FlatList
            data={postsQuery.data}
            keyExtractor={(item) => item.id}
            renderItem={renderPost}
            contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          />
        )}
      </KeyboardAvoidingView>

      <AlertModal {...alertProps} />
    </SafeAreaView>
  );
}

/** Individual post card — handles async signed URL loading */
function PostCard({
  item,
  theme,
  isDark,
  getSignedUrl,
}: {
  item: any;
  theme: any;
  isDark: boolean;
  getSignedUrl: (path: string) => Promise<string | null>;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const hasPhoto = item.photo_paths?.length > 0;

  React.useEffect(() => {
    if (hasPhoto) {
      getSignedUrl(item.photo_paths[0]).then(setImageUrl);
    }
  }, [hasPhoto, item.photo_paths, getSignedUrl]);

  const teacherName = item.profiles?.full_name || 'Teacher';

  return (
    <View
      style={{
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.border,
        marginBottom: 14,
        overflow: 'hidden',
        backgroundColor: isDark ? '#111' : '#fff',
      }}
    >
      {/* Photo */}
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={{ width: '100%', height: 220 }} resizeMode="cover" />
      ) : hasPhoto ? (
        <View style={{ width: '100%', height: 220, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? '#1a1a2e' : '#F3F4F6' }}>
          <EduDashSpinner size="small" color={theme.primary} />
        </View>
      ) : null}

      {/* Content */}
      <View style={{ padding: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 6 }}>
          <Ionicons name="person-circle" size={24} color={theme.primary} />
          <Text style={{ fontSize: 14, fontWeight: '700', color: theme.text }}>{teacherName}</Text>
        </View>
        {item.caption ? (
          <Text style={{ fontSize: 14, lineHeight: 20, color: theme.text }}>{item.caption}</Text>
        ) : null}
        <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 8 }}>
          {new Date(item.created_at).toLocaleDateString('en-ZA', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
      </View>
    </View>
  );
}

const createStyles = (theme: any, isDark: boolean) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    addButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      margin: 16,
      marginBottom: 8,
      paddingVertical: 12,
      borderRadius: 10,
    },
    addButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
    formContainer: {
      margin: 16,
      padding: 16,
      borderRadius: 12,
      borderWidth: 1,
      backgroundColor: isDark ? '#111' : '#FAFAFA',
    },
    formTitle: { fontSize: 17, fontWeight: '700', marginBottom: 12 },
    photoPicker: {
      borderWidth: 1,
      borderStyle: 'dashed',
      borderRadius: 10,
      height: 140,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginBottom: 12,
    },
    photoPickerText: { fontSize: 14 },
    previewContainer: { position: 'relative', marginBottom: 12 },
    photoPreview: { width: '100%', height: 200, borderRadius: 10 },
    removePhoto: { position: 'absolute', top: 6, right: 6 },
    captionInput: {
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      minHeight: 72,
      textAlignVertical: 'top',
    },
    formActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
    cancelButton: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 10,
      borderWidth: 1,
      alignItems: 'center',
    },
    cancelText: { fontSize: 15, fontWeight: '600' },
    saveButton: {
      flex: 2,
      paddingVertical: 12,
      borderRadius: 10,
      alignItems: 'center',
    },
    saveText: { color: '#fff', fontSize: 15, fontWeight: '700' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    emptyText: { fontSize: 15, textAlign: 'center', paddingHorizontal: 32 },
  });
