import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import type { DashMessage } from '@/services/dash-ai/types';
import { getFileIconName, formatFileSize } from '@/services/AttachmentService';
import { messageStyles as styles } from './styles/message.styles';
import { firstText } from './DashMessageBubble.utils';
import { openPdfPreview } from './pdfPreviewUtils';

interface DashMessageAttachmentsProps {
  message: DashMessage;
  isUser: boolean;
}

export const DashMessageAttachments: React.FC<DashMessageAttachmentsProps> = ({ message, isUser }) => {
  const { theme } = useTheme();
  const nonImageAttachments = (message.attachments || []).filter((a) => a.kind !== 'image');
  if (nonImageAttachments.length === 0) return null;

  return (
    <View style={styles.messageAttachmentsContainer}>
      {nonImageAttachments.map((attachment, idx) => {
        const attachmentUrl = firstText(attachment.previewUri, attachment.uri);
        const attachmentIsPdf = attachment.kind === 'pdf' || /\.pdf$/i.test(String(attachment.name || ''));
        return (
          <View
            key={idx}
            style={[
              styles.messageAttachment,
              {
                backgroundColor: isUser ? 'rgba(255,255,255,0.2)' : theme.surfaceVariant,
                borderColor: isUser ? 'rgba(255,255,255,0.3)' : theme.border,
              },
            ]}
          >
            <Ionicons name={getFileIconName(attachment.kind)} size={14} color={isUser ? theme.onPrimary : theme.text} />
            <Text style={[styles.messageAttachmentName, { color: isUser ? theme.onPrimary : theme.text }]} numberOfLines={1}>
              {attachment.name}
            </Text>
            <Text style={[styles.messageAttachmentSize, { color: isUser ? theme.onPrimary : theme.textSecondary }]}>
              {formatFileSize(attachment.size)}
            </Text>
            {attachmentIsPdf && attachmentUrl && (
              <TouchableOpacity
                onPress={() => void openPdfPreview(attachmentUrl, attachment.name || 'Attachment PDF')}
                style={{ marginLeft: 6, borderRadius: 10, borderWidth: 1, borderColor: isUser ? 'rgba(255,255,255,0.4)' : theme.primary + '55', backgroundColor: isUser ? 'rgba(0,0,0,0.16)' : theme.primary + '12', paddingHorizontal: 8, paddingVertical: 4 }}
                accessibilityRole="button"
                accessibilityLabel="Preview PDF attachment"
              >
                <Text style={{ color: isUser ? theme.onPrimary : theme.primary, fontSize: 10, fontWeight: '700' }}>Preview</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })}
    </View>
  );
};
