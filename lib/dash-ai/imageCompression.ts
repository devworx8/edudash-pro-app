/**
 * Image Compression Utilities
 * 
 * Progressive image compression for AI attachments.
 * Compresses images in multiple steps to stay under API limits.
 */

type ImageManipulatorModule = typeof import('expo-image-manipulator');
type LegacyFileSystemModule = typeof import('expo-file-system/legacy');

let cachedImageManipulator: ImageManipulatorModule | null = null;
let cachedLegacyFileSystem: LegacyFileSystemModule | null = null;

function loadImageManipulator(): ImageManipulatorModule {
  if (cachedImageManipulator) return cachedImageManipulator;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    cachedImageManipulator = require('expo-image-manipulator') as ImageManipulatorModule;
    return cachedImageManipulator;
  } catch (error) {
    throw new Error(
      `expo-image-manipulator is unavailable in this runtime: ${String((error as Error)?.message || error)}`
    );
  }
}

function loadLegacyFileSystem(): LegacyFileSystemModule {
  if (cachedLegacyFileSystem) return cachedLegacyFileSystem;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    cachedLegacyFileSystem = require('expo-file-system/legacy') as LegacyFileSystemModule;
    return cachedLegacyFileSystem;
  } catch (error) {
    throw new Error(
      `expo-file-system/legacy is unavailable in this runtime: ${String((error as Error)?.message || error)}`
    );
  }
}

export const MAX_IMAGE_BASE64_LEN = 5_000_000; // ~3.75MB payload — headroom for handwritten docs

// Compression steps — minimum 1024px / 0.72 quality to preserve handwritten text detail.
// Dropping below 768px or 0.65 makes fractions, digits, and small text unreadable by the AI.
export const IMAGE_COMPRESS_STEPS = [
  { width: 1600, compress: 0.85 },
  { width: 1280, compress: 0.80 },
  { width: 1024, compress: 0.75 },
  { width: 768, compress: 0.72 },
];

export interface CompressedImage {
  uri: string;
  base64: string;
  width: number;
  height: number;
  size: number;
}

/**
 * Progressively compress image until it's under size limit
 */
export async function compressImageForAI(
  imageUri: string,
  maxBase64Length: number = MAX_IMAGE_BASE64_LEN
): Promise<CompressedImage> {
  const imageManipulator = loadImageManipulator();
  let currentUri = imageUri;
  let base64Data = '';
  let finalWidth = 0;
  let finalHeight = 0;

  // Try each compression step
  for (const step of IMAGE_COMPRESS_STEPS) {
    const result = await imageManipulator.manipulateAsync(
      currentUri,
      [{ resize: { width: step.width } }],
      {
        compress: step.compress,
        format: imageManipulator.SaveFormat.JPEG,
        base64: true,
      }
    );

    if (!result.base64) {
      throw new Error('Failed to generate base64');
    }

    base64Data = result.base64;
    finalWidth = result.width;
    finalHeight = result.height;
    currentUri = result.uri;

    // Check if under limit
    if (base64Data.length <= maxBase64Length) {
      break;
    }
  }

  // If still too large after all steps, throw error
  if (base64Data.length > maxBase64Length) {
    throw new Error(
      `Image too large even after compression. Size: ${Math.round(base64Data.length / 1024)}KB, Max: ${Math.round(maxBase64Length / 1024)}KB`
    );
  }

  return {
    uri: currentUri,
    base64: base64Data,
    width: finalWidth,
    height: finalHeight,
    size: base64Data.length,
  };
}

/**
 * Batch compress multiple images
 */
export async function compressImagesForAI(
  imageUris: string[],
  onProgress?: (current: number, total: number) => void
): Promise<CompressedImage[]> {
  const results: CompressedImage[] = [];

  for (let i = 0; i < imageUris.length; i++) {
    onProgress?.(i + 1, imageUris.length);
    const compressed = await compressImageForAI(imageUris[i]);
    results.push(compressed);
  }

  return results;
}

/**
 * Get image file size without compression
 */
export async function getImageSize(uri: string): Promise<number> {
  try {
    const info = await loadLegacyFileSystem().getInfoAsync(uri);
    return info.exists ? info.size || 0 : 0;
  } catch {
    return 0;
  }
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
