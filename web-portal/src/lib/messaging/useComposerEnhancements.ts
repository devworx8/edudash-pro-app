import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { encodeMediaContent } from './messageContent';
import { uploadMessageAttachment, validateAttachment, AttachmentValidationError, AttachmentUploadError } from './attachmentUploader';
import { useVoiceRecorder } from './useVoiceRecorder';

// Auto-clear error messages after this duration
const ERROR_CLEAR_TIMEOUT_MS = 5000;

export const EMOJI_OPTIONS = [
  '😊',
  '🙂',
  '🙌',
  '🎉',
  '✨',
  '👍',
  '👌',
  '❤️',
  '💖',
  '🤩',
  '🤗',
  '👏',
  '🧠',
  '📚',
  '✏️',
  '🎨',
  '🧮',
  '🧪',
  '🎧',
  '📎',
];

interface ComposerEnhancementsOptions {
  supabase: SupabaseClient;
  threadId: string | null;
  userId?: string;
  onRefresh?: () => void;
  onEmojiInsert: (emoji: string) => void;
}

export const useComposerEnhancements = ({
  supabase,
  threadId,
  userId,
  onRefresh,
  onEmojiInsert,
}: ComposerEnhancementsOptions) => {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [recordingLocked, setRecordingLocked] = useState(false);

  const refresh = useCallback(() => {
    onRefresh?.();
  }, [onRefresh]);

  const clearError = useCallback(() => {
    setAttachmentError(null);
  }, []);

  const sendMediaMessage = useCallback(
    async (payload: Parameters<typeof encodeMediaContent>[0]) => {
      if (!threadId || !userId) {
        throw new Error('Missing conversation context');
      }

      await supabase.from('messages').insert({
        thread_id: threadId,
        sender_id: userId,
        content: encodeMediaContent(payload),
        content_type: 'text',
      });

      await supabase
        .from('message_threads')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', threadId);

      refresh();
    },
    [refresh, supabase, threadId, userId]
  );

  const handleEmojiSelect = (emoji: string) => {
    onEmojiInsert(emoji);
    setShowEmojiPicker(false);
  };

  const triggerFilePicker = () => {
    if (!threadId || !userId) {
      setAttachmentError('Please select a conversation before sharing media.');
      return;
    }
    fileInputRef.current?.click();
  };

  const handleAttachmentChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) return;
    if (!threadId || !userId) {
      setAttachmentError('Please select a conversation before sharing media.');
      return;
    }

    // Validate file before upload
    try {
      validateAttachment(file);
    } catch (error) {
      if (error instanceof AttachmentValidationError) {
        setAttachmentError(error.message);
      } else {
        setAttachmentError('Invalid file. Please try a different file.');
      }
      return;
    }

    setAttachmentUploading(true);
    setAttachmentError(null);
    setUploadProgress(0);

    try {
      const uploaded = await uploadMessageAttachment(file, {
        filenameHint: file.name,
        contentType: file.type,
        pathPrefix: file.type.startsWith('audio/') ? 'audio' : file.type.startsWith('image/') ? 'images' : 'files',
        onProgress: (progress) => {
          setUploadProgress(progress.percentage);
        },
      });

      const mediaType = file.type.startsWith('image/')
        ? 'image'
        : file.type.startsWith('audio/')
          ? 'audio'
          : 'file';

      await sendMediaMessage({
        mediaType,
        url: uploaded.url,
        name: file.name,
        mimeType: uploaded.mimeType,
        size: file.size,
      });

      // Clear any previous errors on success
      setAttachmentError(null);
    } catch (error) {
      console.error('Attachment upload failed', error);
      
      if (error instanceof AttachmentValidationError) {
        setAttachmentError(error.message);
      } else if (error instanceof AttachmentUploadError) {
        setAttachmentError(error.message);
      } else if (error instanceof Error) {
        setAttachmentError(`Upload failed: ${error.message}`);
      } else {
        setAttachmentError('Failed to upload media. Please check your connection and try again.');
      }
    } finally {
      setAttachmentUploading(false);
      setUploadProgress(null);
    }
  };

  const { isRecording, toggleRecording, cancelRecording, recorderError, recordingDuration } = useVoiceRecorder({
    onRecordingComplete: async (blob, durationMs) => {
      if (!threadId || !userId) return;
      
      setAttachmentUploading(true);
      setAttachmentError(null);
      setUploadProgress(0);
      
      try {
        const uploaded = await uploadMessageAttachment(blob, {
          contentType: blob.type || 'audio/webm',
          pathPrefix: 'voice-notes',
          onProgress: (progress) => {
            setUploadProgress(progress.percentage);
          },
        });

        await sendMediaMessage({
          mediaType: 'audio',
          url: uploaded.url,
          name: 'Voice note',
          mimeType: uploaded.mimeType,
          durationMs,
        });

        // Clear any previous errors on success
        setAttachmentError(null);
      } catch (error) {
        console.error('Voice note upload failed', error);
        
        if (error instanceof AttachmentValidationError) {
          setAttachmentError(error.message);
        } else if (error instanceof AttachmentUploadError) {
          setAttachmentError(error.message);
        } else if (error instanceof Error) {
          setAttachmentError(`Voice note failed: ${error.message}`);
        } else {
          setAttachmentError('Failed to send voice note. Please check your connection and try again.');
        }
      } finally {
        setAttachmentUploading(false);
        setUploadProgress(null);
      }
    },
  });

  const handleMicClick = async () => {
    if (!threadId || !userId) {
      setAttachmentError('Please select a conversation before recording.');
      return;
    }

    // Clear previous errors when starting a new recording
    if (!isRecording) {
      setAttachmentError(null);
      setRecordingLocked(false);
    }

    await toggleRecording();
  };

  const handleRecordingLock = () => {
    setRecordingLocked(true);
  };

  const handleRecordingCancel = async () => {
    setRecordingLocked(false);
    if (isRecording) {
      await cancelRecording();
    }
  };

  const handleRecordingSend = async () => {
    setRecordingLocked(false);
    if (isRecording) {
      await toggleRecording(); // This will stop and send
    }
  };

  useEffect(() => {
    if (!showEmojiPicker) return;

    const handler = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        emojiPickerRef.current?.contains(target) ||
        emojiButtonRef.current?.contains(target)
      ) {
        return;
      }
      setShowEmojiPicker(false);
    };

    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showEmojiPicker]);

  // Clear error after timeout
  useEffect(() => {
    if (attachmentError) {
      const timer = setTimeout(() => {
        setAttachmentError(null);
      }, ERROR_CLEAR_TIMEOUT_MS);
      return () => clearTimeout(timer);
    }
  }, [attachmentError]);

  const statusMessage = attachmentError || recorderError || null;

  return {
    emojiButtonRef,
    emojiPickerRef,
    showEmojiPicker,
    setShowEmojiPicker,
    handleEmojiSelect,
    triggerFilePicker,
    fileInputRef,
    handleAttachmentChange,
    attachmentUploading,
    isRecording,
    handleMicClick,
    statusMessage,
    uploadProgress,
    recordingDuration,
    recordingLocked,
    handleRecordingLock,
    handleRecordingCancel,
    handleRecordingSend,
    clearError,
  };
};
