/**
 * Activity Comments Component
 * 
 * Allows parents to comment on student activities.
 * Features:
 * - Add, edit, delete comments
 * - Real-time updates via Supabase subscriptions
 * - Comment moderation (teachers can approve/reject)
 * - Character limit (500 chars)
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { assertSupabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { formatDistanceToNow } from 'date-fns';
import { useAlert } from '@/components/ui/StyledAlert';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
interface ActivityCommentsProps {
  activityId: string;
  theme: any;
  isTeacher?: boolean;
}

interface Comment {
  id: string;
  parent_id: string;
  comment_text: string;
  is_approved: boolean;
  created_at: string;
  profiles?: {
    first_name: string;
    last_name: string;
  };
}

export function ActivityComments({ activityId, theme, isTeacher = false }: ActivityCommentsProps) {
  const { user } = useAuth();
  const alert = useAlert();
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    loadComments();

    // Real-time subscription
    const supabase = assertSupabase();
    const subscription = supabase
      .channel(`comments_${activityId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'activity_comments',
          filter: `activity_id=eq.${activityId}`,
        },
        (payload) => {
          console.log('[ActivityComments] Realtime update:', payload);
          loadComments();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [activityId]);

  const loadComments = async () => {
    setLoading(true);
    try {
      const supabase = assertSupabase();
      const { data, error } = await supabase
        .from('activity_comments')
        .select(`
          *,
          profiles:parent_id (first_name, last_name)
        `)
        .eq('activity_id', activityId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[ActivityComments] Error loading comments:', error);
        return;
      }

      // Filter out unapproved comments for non-teachers
      const filteredComments = isTeacher
        ? data || []
        : (data || []).filter((c: Comment) => c.is_approved || c.parent_id === user?.id);

      setComments(filteredComments);
    } catch (error) {
      console.error('[ActivityComments] Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const postComment = async () => {
    if (!newComment.trim() || !user?.id) return;

    if (newComment.length > 500) {
      alert.showWarning('Comment too long', 'Please keep comments under 500 characters');
      return;
    }

    setPosting(true);
    try {
      const supabase = assertSupabase();

      if (editingId) {
        // Update existing comment
        const { error } = await supabase
          .from('activity_comments')
          .update({ comment_text: newComment.trim() })
          .eq('id', editingId);

        if (error) throw error;
        setEditingId(null);
      } else {
        // Insert new comment
        const { error } = await supabase
          .from('activity_comments')
          .insert({
            activity_id: activityId,
            parent_id: user.id,
            comment_text: newComment.trim(),
            is_approved: true, // Auto-approve for now; change to false for moderation
          });

        if (error) throw error;
      }

      setNewComment('');
    } catch (error) {
      console.error('[ActivityComments] Error posting comment:', error);
      alert.showError('Error', 'Failed to post comment');
    } finally {
      setPosting(false);
    }
  };

  const deleteComment = async (commentId: string) => {
    alert.show(
      'Delete Comment',
      'Are you sure you want to delete this comment?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const supabase = assertSupabase();
              const { error } = await supabase
                .from('activity_comments')
                .delete()
                .eq('id', commentId);

              if (error) throw error;
            } catch (error) {
              console.error('[ActivityComments] Error deleting comment:', error);
              alert.showError('Error', 'Failed to delete comment');
            }
          },
        },
      ],
      { type: 'confirm' }
    );
  };

  const editComment = (comment: Comment) => {
    setNewComment(comment.comment_text);
    setEditingId(comment.id);
  };

  const toggleApproval = async (commentId: string, currentStatus: boolean) => {
    try {
      const supabase = assertSupabase();
      const { error } = await supabase
        .from('activity_comments')
        .update({ is_approved: !currentStatus })
        .eq('id', commentId);

      if (error) throw error;
    } catch (error) {
      console.error('[ActivityComments] Error toggling approval:', error);
      alert.showError('Error', 'Failed to update comment status');
    }
  };

  const renderComment = ({ item }: { item: Comment }) => {
    const isOwnComment = item.parent_id === user?.id;
    const name = item.profiles
      ? `${item.profiles.first_name} ${item.profiles.last_name}`
      : 'Parent';

    return (
      <View style={[styles.commentItem, { backgroundColor: theme.cardSecondary }]}>
        <View style={styles.commentHeader}>
          <View style={styles.commentAuthor}>
            <Ionicons name="person-circle" size={20} color={theme.primary} />
            <Text style={[styles.commentName, { color: theme.text }]}>{name}</Text>
            {!item.is_approved && (
              <View style={[styles.moderationBadge, { backgroundColor: theme.warning + '30' }]}>
                <Text style={[styles.moderationText, { color: theme.warning }]}>
                  Pending Approval
                </Text>
              </View>
            )}
          </View>
          <Text style={[styles.commentTime, { color: theme.textTertiary }]}>
            {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
          </Text>
        </View>

        <Text style={[styles.commentText, { color: theme.textSecondary }]}>
          {item.comment_text}
        </Text>

        {/* Actions */}
        <View style={styles.commentActions}>
          {isOwnComment && (
            <>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => editComment(item)}
              >
                <Ionicons name="create" size={16} color={theme.info} />
                <Text style={[styles.actionText, { color: theme.info }]}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => deleteComment(item.id)}
              >
                <Ionicons name="trash" size={16} color={theme.danger} />
                <Text style={[styles.actionText, { color: theme.danger }]}>Delete</Text>
              </TouchableOpacity>
            </>
          )}
          {isTeacher && !isOwnComment && (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => toggleApproval(item.id, item.is_approved)}
            >
              <Ionicons
                name={item.is_approved ? 'close-circle' : 'checkmark-circle'}
                size={16}
                color={item.is_approved ? theme.warning : theme.success}
              />
              <Text
                style={[
                  styles.actionText,
                  { color: item.is_approved ? theme.warning : theme.success },
                ]}
              >
                {item.is_approved ? 'Unapprove' : 'Approve'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Comments List */}
      <View style={styles.commentsHeader}>
        <Ionicons name="chatbubbles" size={20} color={theme.primary} />
        <Text style={[styles.commentsTitle, { color: theme.text }]}>
          Comments ({comments.length})
        </Text>
      </View>

      {loading && comments.length === 0 ? (
        <EduDashSpinner size="small" color={theme.primary} style={styles.loader} />
      ) : comments.length === 0 ? (
        <Text style={[styles.emptyText, { color: theme.textTertiary }]}>
          No comments yet. Be the first to comment!
        </Text>
      ) : (
        <FlashList
          data={comments}
          renderItem={renderComment}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          contentContainerStyle={styles.commentsList}
          estimatedItemSize={60}
        />
      )}

      {/* Add Comment Input */}
      <View style={[styles.inputContainer, { borderColor: theme.border }]}>
        <TextInput
          style={[styles.input, { color: theme.text }]}
          placeholder={editingId ? 'Edit your comment...' : 'Add a comment...'}
          placeholderTextColor={theme.textTertiary}
          value={newComment}
          onChangeText={setNewComment}
          multiline
          maxLength={500}
        />
        {editingId && (
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => {
              setEditingId(null);
              setNewComment('');
            }}
          >
            <Ionicons name="close" size={20} color={theme.textSecondary} />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[
            styles.sendButton,
            { backgroundColor: theme.primary },
            (!newComment.trim() || posting) && styles.sendButtonDisabled,
          ]}
          onPress={postComment}
          disabled={!newComment.trim() || posting}
        >
          {posting ? (
            <EduDashSpinner size="small" color="#FFF" />
          ) : (
            <Ionicons name="send" size={20} color="#FFF" />
          )}
        </TouchableOpacity>
      </View>
      <Text style={[styles.charCount, { color: theme.textTertiary }]}>
        {newComment.length}/500
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 16,
  },
  commentsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  commentsTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  loader: {
    paddingVertical: 20,
  },
  emptyText: {
    textAlign: 'center',
    paddingVertical: 20,
    fontSize: 14,
  },
  commentsList: {
    gap: 12,
  },
  commentItem: {
    borderRadius: 12,
    padding: 12,
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  commentAuthor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  commentName: {
    fontSize: 14,
    fontWeight: '600',
  },
  moderationBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  moderationText: {
    fontSize: 10,
    fontWeight: '600',
  },
  commentTime: {
    fontSize: 11,
  },
  commentText: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  commentActions: {
    flexDirection: 'row',
    gap: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '500',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderWidth: 1,
    borderRadius: 12,
    padding: 8,
    marginTop: 12,
    gap: 8,
  },
  input: {
    flex: 1,
    fontSize: 14,
    maxHeight: 100,
    paddingVertical: 4,
  },
  cancelButton: {
    padding: 4,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  charCount: {
    fontSize: 11,
    textAlign: 'right',
    marginTop: 4,
  },
});
