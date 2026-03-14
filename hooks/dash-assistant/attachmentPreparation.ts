import { Platform } from 'react-native';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';

import type { DashAttachment } from '@/services/dash-ai/types';
import {
  MAX_IMAGE_BASE64_LEN,
  IMAGE_COMPRESS_STEPS,
} from '@/lib/dash-ai/imageCompression';

async function encodeImageForWeb(uri: string, fallbackMime: string): Promise<{ base64: string; mediaType: string } | null> {
  // Already a data URI — extract and return directly (already encoded, EXIF was applied on creation)
  const dataUriMatch = uri.match(/^data:([^;]+);base64,(.+)$/);
  if (dataUriMatch) return { base64: dataUriMatch[2], mediaType: dataUriMatch[1] };

  try {
    // Load via HTMLImageElement so the browser applies EXIF orientation before we read pixels.
    // Drawing to canvas produces correctly-rotated pixels regardless of EXIF flags in the JPEG.
    const blob = await fetch(uri).then((r) => r.blob());
    const objectUrl = URL.createObjectURL(blob);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const el = new (window as any).Image() as HTMLImageElement;
        el.crossOrigin = 'anonymous';
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = objectUrl;
      });

      // naturalWidth/Height reflect the orientation-corrected dimensions
      const maxDim = 1600;
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (w > maxDim || h > maxDim) {
        const scale = Math.min(maxDim / w, maxDim / h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const canvas = (document as any).createElement('canvas') as HTMLCanvasElement;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2d context');
      ctx.drawImage(img, 0, 0, w, h);
      const dataUrl: string = canvas.toDataURL('image/jpeg', 0.85);
      const base64 = dataUrl.split(',')[1] ?? '';
      return { base64, mediaType: 'image/jpeg' };
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    // Fallback: raw blob encode (no EXIF correction, but better than nothing)
    try {
      const blob = await fetch(uri).then((r) => r.blob());
      const mediaType = blob.type || fallbackMime;
      const base64 = await new Promise<string>((resolve, reject) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const reader = new (window as any).FileReader();
        reader.onload = () => resolve((String(reader.result || '')).split(',')[1] ?? '');
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      return { base64, mediaType };
    } catch {
      return null;
    }
  }
}

export const prepareAttachmentsForAI = async (attachments: DashAttachment[]) => {
  if (!attachments || attachments.length === 0) return attachments;

  // Web: ImageManipulator is not available — encode via fetch + FileReader instead.
  if (Platform.OS === 'web') {
    const prepared: DashAttachment[] = [];
    for (const attachment of attachments) {
      // Use cached base64 if already prepared (e.g. from a prior call on retry/follow-up)
      if (attachment.kind === 'image' && attachment.meta?.image_base64) {
        prepared.push(attachment);
        continue;
      }
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
    // Use cached base64 if already prepared (e.g. from a prior call on retry/follow-up)
    if (attachment.kind === 'image' && attachment.meta?.image_base64) {
      prepared.push(attachment);
      continue;
    }
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
