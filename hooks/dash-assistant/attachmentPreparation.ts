import { Platform } from 'react-native';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';

import type { DashAttachment } from '@/services/dash-ai/types';
import {
  MAX_IMAGE_BASE64_LEN,
  IMAGE_COMPRESS_STEPS,
} from '@/lib/dash-ai/imageCompression';

async function encodeImageForWeb(uri: string, fallbackMime: string): Promise<{ base64: string; mediaType: string } | null> {
  try {
    const dataUriMatch = uri.match(/^data:([^;]+);base64,(.+)$/);
    if (dataUriMatch) return { base64: dataUriMatch[2], mediaType: dataUriMatch[1] };
    const resp = await fetch(uri);
    const blob = await resp.blob();
    const mediaType = blob.type || fallbackMime;
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((String(reader.result || '')).split(',')[1] ?? '');
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    return { base64, mediaType };
  } catch {
    return null;
  }
}

export const prepareAttachmentsForAI = async (attachments: DashAttachment[]) => {
  if (!attachments || attachments.length === 0) return attachments;

  // Web: ImageManipulator is not available — encode via fetch + FileReader instead.
  if (Platform.OS === 'web') {
    const prepared: DashAttachment[] = [];
    for (const attachment of attachments) {
      if (attachment.kind !== 'image' || !attachment.previewUri) {
        prepared.push(attachment);
        continue;
      }
      const encoded = await encodeImageForWeb(attachment.previewUri, attachment.mimeType || 'image/jpeg');
      if (encoded) {
        // Store a data: URI as previewUri so the image survives page refreshes
        // (blob: URLs are session-ephemeral and 404 after restart).
        const dataUri = `data:${encoded.mediaType};base64,${encoded.base64}`;
        prepared.push({
          ...attachment,
          previewUri: dataUri,
          meta: { ...(attachment.meta || {}), image_base64: encoded.base64, image_media_type: encoded.mediaType },
        });
      } else {
        prepared.push(attachment);
      }
    }
    return prepared;
  }

  const prepared: DashAttachment[] = [];

  for (const attachment of attachments) {
    if (attachment.kind !== 'image' || !attachment.previewUri) {
      prepared.push(attachment);
      continue;
    }

    const uri = attachment.previewUri || '';
    if (!uri) {
      prepared.push(attachment);
      continue;
    }

    let base64: string | null = null;
    let mediaType = 'image/jpeg';

    for (const step of IMAGE_COMPRESS_STEPS) {
      try {
        const result = await ImageManipulator.manipulateAsync(
          uri,
          [{ resize: { width: step.width } }],
          {
            compress: step.compress,
            format: ImageManipulator.SaveFormat.JPEG,
            base64: true,
          }
        );
        if (result.base64 && result.base64.length <= MAX_IMAGE_BASE64_LEN) {
          base64 = result.base64;
          mediaType = 'image/jpeg';
          break;
        }
      } catch {
        // Try next compression step.
      }
    }

    if (!base64) {
      try {
        const fallback = await LegacyFileSystem.readAsStringAsync(uri, {
          encoding: LegacyFileSystem.EncodingType.Base64,
        });
        if (fallback && fallback.length <= MAX_IMAGE_BASE64_LEN) {
          base64 = fallback;
          mediaType = attachment.mimeType || 'image/jpeg';
        }
      } catch {
        base64 = null;
      }
    }

    if (base64) {
      prepared.push({
        ...attachment,
        meta: {
          ...(attachment.meta || {}),
          image_base64: base64,
          image_media_type: mediaType,
        },
      });
    } else {
      prepared.push(attachment);
    }
  }

  return prepared;
};
