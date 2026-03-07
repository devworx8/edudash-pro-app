import React from 'react';
import { Image, View } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import type { DashMessage } from '@/services/dash-ai/types';
import { createSignedUrl } from '@/services/AttachmentService';
import { messageStyles as styles } from './styles/message.styles';

interface AttachmentImagePreviewProps {
  attachment: DashMessage['attachments'][number];
  isUser: boolean;
}

export const AttachmentImagePreview: React.FC<AttachmentImagePreviewProps> = ({ attachment, isUser }) => {
  const { theme } = useTheme();
  const [imageUrl, setImageUrl] = React.useState<string | null>(attachment.previewUri || null);
  const [hasError, setHasError] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;
    if (imageUrl || !attachment.bucket || !attachment.storagePath) return () => { mounted = false; };

    (async () => {
      try {
        const signed = await createSignedUrl(attachment.bucket, attachment.storagePath, 3600);
        if (mounted) setImageUrl(signed);
      } catch {
        if (mounted) setHasError(true);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [attachment.bucket, attachment.storagePath, imageUrl]);

  if (hasError || !imageUrl) return null;

  return (
    <View
      style={[
        styles.imagePreviewCard,
        { borderColor: isUser ? 'rgba(255,255,255,0.2)' : theme.border },
      ]}
    >
      <Image source={{ uri: imageUrl }} style={styles.imagePreview} />
    </View>
  );
};
