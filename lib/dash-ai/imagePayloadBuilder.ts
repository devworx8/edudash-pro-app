import type { DashAttachment } from '@/services/dash-ai/types';
import { compressImageForAI, MAX_IMAGE_BASE64_LEN } from '@/lib/dash-ai/imageCompression';

export interface DashImagePayload {
  data: string;
  media_type: string;
}

export interface BuildImagePayloadOptions {
  attachments?: DashAttachment[] | any[];
  images?: DashImagePayload[];
  maxImages?: number;
  maxBase64Length?: number;
}

export const DEFAULT_MAX_IMAGES_PER_REQUEST = 5;
const SUPPORTED_IMAGE_MEDIA_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);
const SUPPORTED_DOCUMENT_MEDIA_TYPES = new Set([
  'application/pdf',
]);

function stripDataUriPrefix(value?: string | null): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  const match = trimmed.match(/^data:[^;]+;base64,(.+)$/i);
  return match ? match[1] : trimmed;
}

function normalizeMediaType(raw?: string | null): {
  mediaType: string;
  blockType: 'image' | 'document';
  requiresImageReencode: boolean;
} {
  const lower = String(raw || '').trim().toLowerCase();
  if (SUPPORTED_DOCUMENT_MEDIA_TYPES.has(lower)) {
    return {
      mediaType: 'application/pdf',
      blockType: 'document',
      requiresImageReencode: false,
    };
  }
  if (lower === 'image/jpg') {
    return {
      mediaType: 'image/jpeg',
      blockType: 'image',
      requiresImageReencode: false,
    };
  }
  if (SUPPORTED_IMAGE_MEDIA_TYPES.has(lower)) {
    return {
      mediaType: lower,
      blockType: 'image',
      requiresImageReencode: false,
    };
  }
  if (lower.startsWith('image/')) {
    return {
      mediaType: 'image/jpeg',
      blockType: 'image',
      requiresImageReencode: true,
    };
  }
  return {
    mediaType: 'image/jpeg',
    blockType: 'image',
    requiresImageReencode: true,
  };
}

function sanitizeInlineImages(
  images: DashImagePayload[],
  maxImages: number,
  maxBase64Length: number
): DashImagePayload[] {
  return images
    .map((image) => {
      const normalized = normalizeMediaType(image?.media_type);
      const data = stripDataUriPrefix(image?.data);
      return {
        data,
        media_type: normalized.mediaType,
        blockType: normalized.blockType,
      };
    })
    .filter((image) => image.blockType === 'image' || image.blockType === 'document')
    .filter((image) => typeof image.data === 'string' && image.data.length > 0)
    .filter((image) => image.data.length <= maxBase64Length)
    .slice(0, maxImages)
    .map((image) => ({
      data: image.data,
      media_type: image.media_type || 'image/jpeg',
    }));
}

export async function buildImagePayloadsFromAttachments(
  options: BuildImagePayloadOptions
): Promise<DashImagePayload[]> {
  const maxImages = Math.max(1, Math.min(10, options.maxImages || DEFAULT_MAX_IMAGES_PER_REQUEST));
  const maxBase64Length = Math.max(1, options.maxBase64Length || MAX_IMAGE_BASE64_LEN);

  if (Array.isArray(options.images) && options.images.length > 0) {
    return sanitizeInlineImages(options.images, maxImages, maxBase64Length);
  }

  const attachments = Array.isArray(options.attachments) ? options.attachments : [];
  if (attachments.length === 0) return [];

  const payloads: DashImagePayload[] = [];

  for (const attachment of attachments) {
    if (payloads.length >= maxImages) break;
    const kind = String(attachment?.kind || '').toLowerCase();
    if (kind !== 'image') continue;

    const metadataBase64 = typeof attachment?.meta?.image_base64 === 'string'
      ? attachment.meta.image_base64
      : typeof attachment?.meta?.base64 === 'string'
        ? attachment.meta.base64
        : null;

    let base64 = stripDataUriPrefix(metadataBase64);
    // Prefer meta.image_media_type (set from actual blob content) over attachment.mimeType
    // which may be wrong (e.g. picker reports jpeg but file is actually png).
    const rawMediaType = String(
      attachment?.meta?.image_media_type ||
      attachment?.meta?.media_type ||
      attachment?.mimeType ||
      'image/jpeg'
    );
    const normalizedMedia = normalizeMediaType(rawMediaType);
    let mediaType = normalizedMedia.mediaType;

    // Re-encode unsupported image formats (e.g., HEIC) to JPEG via compression.
    if ((!base64 || normalizedMedia.requiresImageReencode) && attachment?.previewUri) {
      try {
        const compressed = await compressImageForAI(String(attachment.previewUri), maxBase64Length);
        base64 = compressed.base64;
        mediaType = 'image/jpeg';
      } catch (error) {
        console.warn('[imagePayloadBuilder] Failed to build payload from attachment', {
          id: attachment?.id,
          name: attachment?.name,
          error,
        });
        base64 = null;
      }
    }

    if (base64 && normalizedMedia.requiresImageReencode && !attachment?.previewUri) {
      // Best-effort fallback: use provided base64 but force a supported image media type.
      mediaType = 'image/jpeg';
    }

    if (!base64 || base64.length > maxBase64Length) continue;
    payloads.push({
      data: base64,
      media_type: mediaType,
    });
  }

  return payloads;
}
