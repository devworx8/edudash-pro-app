import React from 'react';
import { Dimensions, Image, Platform, TouchableOpacity } from 'react-native';
import type { DashMessage } from '@/services/dash-ai/types';
import { createSignedUrl } from '@/services/AttachmentService';
import { messageStyles as styles } from './styles/message.styles';

const { width: windowWidth } = Dimensions.get('window');
const MAX_PREVIEW_WIDTH = Math.min(windowWidth * 0.68, 240);
const MAX_PREVIEW_HEIGHT = windowWidth < 360 ? 160 : 188;
const FALLBACK_PREVIEW_HEIGHT = windowWidth < 360 ? 144 : 172;

export const resolveImagePreviewFrame = (
  rawWidth?: number | null,
  rawHeight?: number | null,
): { width: number; height: number } => {
  const width = Number(rawWidth);
  const height = Number(rawHeight);

  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    const scale = Math.min(MAX_PREVIEW_WIDTH / width, MAX_PREVIEW_HEIGHT / height, 1);
    const nextWidth = Math.max(96, Math.round(width * scale));
    const nextHeight = Math.max(96, Math.round(height * scale));
    return { width: nextWidth, height: nextHeight };
  }

  return {
    width: MAX_PREVIEW_WIDTH,
    height: FALLBACK_PREVIEW_HEIGHT,
  };
};

interface AttachmentImagePreviewProps {
  attachment: DashMessage['attachments'][number];
  isUser: boolean;
  onPress?: (uri: string) => void;
}

export const AttachmentImagePreview: React.FC<AttachmentImagePreviewProps> = ({ attachment, onPress }) => {
  const shouldPreferSignedUrl =
    Platform.OS === 'web' &&
    typeof attachment.previewUri === 'string' &&
    attachment.previewUri.startsWith('blob:') &&
    !!attachment.bucket &&
    !!attachment.storagePath;
  const [imageUrl, setImageUrl] = React.useState<string | null>(
    shouldPreferSignedUrl ? null : (attachment.previewUri || null)
  );
  const [hasError, setHasError] = React.useState(false);
  const fetchedRef = React.useRef(false);
  const frame = React.useMemo(() => {
    const meta = attachment.meta || {};
    return resolveImagePreviewFrame(
      typeof meta.width === 'number' ? meta.width : null,
      typeof meta.height === 'number' ? meta.height : null,
    );
  }, [attachment.meta]);

  const fetchSignedUrl = React.useCallback(async () => {
    if (fetchedRef.current || !attachment.bucket || !attachment.storagePath) return;
    fetchedRef.current = true;
    try {
      const signed = await createSignedUrl(attachment.bucket!, attachment.storagePath!, 3600);
      setImageUrl(signed);
      setHasError(false);
    } catch {
      setHasError(true);
    }
  }, [attachment.bucket, attachment.storagePath]);

  // If no previewUri, try to generate a signed URL from storage.
  React.useEffect(() => {
    if (!imageUrl) { fetchSignedUrl(); }
  }, [imageUrl, fetchSignedUrl]);

  // blob: URLs die on page refresh — fall back to signed URL silently.
  const handleError = React.useCallback(() => {
    if (attachment.bucket && attachment.storagePath) {
      fetchedRef.current = false;
      setImageUrl(null); // triggers effect above to fetch signed URL
    } else {
      setHasError(true);
    }
  }, [attachment.bucket, attachment.storagePath]);

  if (hasError || !imageUrl) return null;

  const img = (
    <Image
      source={{ uri: imageUrl }}
      style={[styles.imagePreview, frame]}
      resizeMode="cover"
      onError={handleError}
    />
  );

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.88} onPress={() => onPress(imageUrl)} style={frame}>
        {img}
      </TouchableOpacity>
    );
  }
  return img;
};
