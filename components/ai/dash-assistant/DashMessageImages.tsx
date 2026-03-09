import React from 'react';
import { View, TouchableOpacity, Text, Image, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { DashMessage } from '@/services/dash-ai/types';
import { AttachmentImagePreview, resolveImagePreviewFrame } from './AttachmentImagePreview';
import { messageStyles as styles } from './styles/message.styles';
import type { ExpandedVisualState } from './DashMessageBubble.utils';

interface DashMessageImagesProps {
  message: DashMessage;
  isUser: boolean;
  generatedImages: Array<{ signed_url: string; width?: number; height?: number }>;
  onSendFollowUp: (text: string) => void;
  onRetakeForClarity?: ((msg: DashMessage) => void) | undefined;
  onExpandVisual: (state: ExpandedVisualState) => void;
  flushTop?: boolean;
}

export const DashMessageImages: React.FC<DashMessageImagesProps> = ({
  message,
  isUser,
  generatedImages,
  onSendFollowUp,
  onRetakeForClarity,
  onExpandVisual,
  flushTop = false,
}) => {
  const imageAttachments = (message.attachments || []).filter((a) => a.kind === 'image');
  const hasImages = imageAttachments.length > 0;
  const hasGenerated = generatedImages.length > 0;
  if (!hasImages && !hasGenerated) return null;

  return (
    <>
      {hasImages && (
        <View style={[styles.imagePreviewRow, flushTop ? styles.imagePreviewRowFlush : null]}>
          {imageAttachments.map((attachment, idx) => (
            <AttachmentImagePreview
              key={`${attachment.id}-${idx}`}
              attachment={attachment}
              isUser={isUser}
              onPress={(uri) => onExpandVisual({ type: 'image', title: attachment.name || 'Image', uri })}
            />
          ))}
          {isUser && (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
              <TouchableOpacity
                onPress={() => onSendFollowUp('Please try analyzing the image again')}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)' }}
              >
                <Ionicons name="refresh" size={13} color="rgba(255,255,255,0.8)" />
                <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '600' }}>Retry</Text>
              </TouchableOpacity>
              {onRetakeForClarity && (
                <TouchableOpacity
                  onPress={() => onRetakeForClarity(message)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)' }}
                >
                  <Ionicons name="camera-outline" size={13} color="rgba(255,255,255,0.6)" />
                  <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>New photo</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      )}
      {hasGenerated && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.imagePreviewRow, flushTop ? styles.imagePreviewRowFlush : null]}
        >
          {generatedImages.map((image, idx) => {
            const frame = resolveImagePreviewFrame(image.width, image.height);
            return (
            <TouchableOpacity
              key={`generated-${message.id}-${idx}`}
              style={[styles.imagePreviewCard, frame, { borderColor: 'transparent' }]}
              onPress={() => onExpandVisual({ type: 'image', title: 'Generated image', uri: String(image.signed_url) })}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Expand generated image"
            >
              <Image source={{ uri: String(image.signed_url) }} style={[styles.imagePreview, frame]} />
            </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </>
  );
};
