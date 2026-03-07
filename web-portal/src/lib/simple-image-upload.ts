/**
 * Simple Image Upload for Web
 * 
 * Browser-based image upload to Supabase Storage
 * No complex RLS, just works
 */

import { createClient } from '@/lib/supabase/client';

const BUCKET_NAME = 'dash-attachments'; // switched from chat-images after RLS conflicts
// Allow up to 50MB initial file size - we'll compress aggressively
const MAX_UPLOAD_MB = 50;
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
// Target size after compression (3MB max for efficient upload/AI processing)
const TARGET_SIZE_MB = 3;
const TARGET_SIZE_BYTES = TARGET_SIZE_MB * 1024 * 1024;

export interface WebImageUpload {
  url: string;
  path: string;
  base64?: string;
}


/**
 * Advanced smart compression with memory management and quality preservation
 */
async function smartCompress(file: File): Promise<Blob> {
  // Check if file is too large to even try
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`Image is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum is ${MAX_UPLOAD_MB}MB.`);
  }

  const originalSizeMB = file.size / 1024 / 1024;
  console.log(`[WebImageUpload] Processing image: ${originalSizeMB.toFixed(2)}MB`);

  // Enhanced compression strategy based on original size
  let compressionConfig = getCompressionConfig(file.size);

  // Try progressive compression with fallback strategies
  let compressed = await compressImage(file, compressionConfig.maxWidth, compressionConfig.quality);

  console.log(`[WebImageUpload] First pass: ${(compressed.size / 1024 / 1024).toFixed(2)}MB (${Math.round((1 - compressed.size / file.size) * 100)}% reduction)`);

  // If still too large, try multiple strategies
  if (compressed.size > TARGET_SIZE_BYTES) {
    console.log('[WebImageUpload] Still large, applying advanced compression...');

    // Strategy 1: Reduce dimensions more aggressively
    compressionConfig = getCompressionConfig(file.size, 'aggressive');
    compressed = await compressImage(file, compressionConfig.maxWidth, compressionConfig.quality);

    console.log(`[WebImageUpload] Aggressive pass: ${(compressed.size / 1024 / 1024).toFixed(2)}MB`);
  }

  // Strategy 2: Final compression attempt with lower quality
  if (compressed.size > TARGET_SIZE_BYTES && compressionConfig.quality > 0.4) {
    console.log('[WebImageUpload] Final compression pass...');
    const tempFile = new File([compressed], 'temp.jpg', { type: 'image/jpeg' });
    compressed = await compressImage(tempFile, 1000, 0.5);

    console.log(`[WebImageUpload] Final pass: ${(compressed.size / 1024 / 1024).toFixed(2)}MB`);
  }

  // Memory cleanup
  if (file.size > 10 * 1024 * 1024) {
    // Force garbage collection for very large files if available
    if (global.gc) {
      console.log('[WebImageUpload] Running garbage collection for large file...');
      global.gc();
    }
  }

  const finalSizeMB = compressed.size / 1024 / 1024;
  console.log(`[WebImageUpload] Final result: ${finalSizeMB.toFixed(2)}MB (${Math.round((1 - finalSizeMB / originalSizeMB) * 100)}% total reduction)`);

  return compressed;
}

/**
 * Get compression configuration based on file size
 */
function getCompressionConfig(fileSize: number, strategy: 'normal' | 'aggressive' = 'normal'): { maxWidth: number; quality: number } {
  const sizeMB = fileSize / 1024 / 1024;

  if (strategy === 'aggressive') {
    // More aggressive compression for large files
    if (sizeMB > 20) return { maxWidth: 1200, quality: 0.5 };
    if (sizeMB > 10) return { maxWidth: 1400, quality: 0.6 };
    if (sizeMB > 5) return { maxWidth: 1600, quality: 0.7 };
    return { maxWidth: 1800, quality: 0.75 };
  }

  // Normal compression with quality preservation
  if (sizeMB > 20) return { maxWidth: 1400, quality: 0.6 };
  if (sizeMB > 10) return { maxWidth: 1600, quality: 0.7 };
  if (sizeMB > 5) return { maxWidth: 1800, quality: 0.75 };
  if (sizeMB > 2) return { maxWidth: 1920, quality: 0.8 };
  return { maxWidth: 2048, quality: 0.85 }; // Small files get higher quality
}

/**
 * Enhanced compression with better algorithms and memory management
 */
async function compressImage(file: File, maxWidth: number = 1920, quality: number = 0.8): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Canvas context not available'));
      return;
    }

    img.onload = () => {
      try {
        // Calculate optimal dimensions with aspect ratio preservation
        const { width, height } = calculateOptimalDimensions(img.width, img.height, maxWidth);

        canvas.width = width;
        canvas.height = height;

        // Use highest quality settings
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.imageSmoothingEnabled = true;

        // Apply better downscaling algorithm for large reductions
        if (img.width > width * 2 || img.height > height * 2) {
          // For large downscaling, use stepped reduction
          const stepScale = Math.sqrt(Math.min(img.width / width, img.height / height));
          const stepWidth = Math.round(img.width / stepScale);
          const stepHeight = Math.round(img.height / stepScale);

          canvas.width = stepWidth;
          canvas.height = stepHeight;
          ctx.drawImage(img, 0, 0, stepWidth, stepHeight);

          // Create second canvas for final reduction
          const finalCanvas = document.createElement('canvas');
          const finalCtx = finalCanvas.getContext('2d');
          if (finalCtx) {
            finalCtx.imageSmoothingEnabled = true;
            finalCtx.imageSmoothingQuality = 'high';
            finalCanvas.width = width;
            finalCanvas.height = height;
            finalCtx.drawImage(canvas, 0, 0, width, height);

            // Compress from final canvas
            finalCanvas.toBlob(
              (blob) => {
                if (blob) {
                  resolve(blob);
                } else {
                  reject(new Error('Canvas compression failed'));
                }
              },
              'image/jpeg',
              quality
            );
            return;
          }
        }

        // Standard single-step compression
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Canvas compression failed'));
            }
          },
          'image/jpeg',
          quality
        );
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => reject(new Error('Failed to load image for compression'));
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Calculate optimal dimensions maintaining aspect ratio
 */
function calculateOptimalDimensions(originalWidth: number, originalHeight: number, maxWidth: number): { width: number; height: number } {
  let { width, height } = { width: originalWidth, height: originalHeight };

  // Scale down if image is too large
  if (width > maxWidth) {
    height = (height * maxWidth) / width;
    width = maxWidth;
  }

  // Ensure minimum dimensions
  if (width < 200) {
    width = 200;
    height = (height * 200) / width;
  }
  if (height < 200) {
    height = 200;
    width = (width * 200) / height;
  }

  return {
    width: Math.round(width),
    height: Math.round(height)
  };
}

/**
 * Convert file/blob to base64
 */
async function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Remove data:image/...;base64, prefix
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Upload image to Supabase Storage
 * @param file - Browser File object
 * @param includeBase64 - Whether to return base64 for AI APIs
 * @returns Public URL and optionally base64
 */
export async function uploadImage(
  file: File,
  includeBase64: boolean = false
): Promise<WebImageUpload> {
  console.log('[WebImageUpload] Starting upload:', file.name, `${(file.size / 1024 / 1024).toFixed(2)}MB`);
  
  try {
    const supabase = createClient();
    
    // Always compress images for optimal size and quality
    const blob = await smartCompress(file);
    
    console.log('[WebImageUpload] Final size:', `${(blob.size / 1024 / 1024).toFixed(2)}MB`);
    
    // Generate unique filename
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    const fileName = `${timestamp}_${random}.jpg`;
    
    console.log('[WebImageUpload] Uploading to storage...');
    
    // Upload (no path prefix, just filename in root)
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(fileName, blob, {
        contentType: 'image/jpeg',
        upsert: false,
      });
    
    if (error) {
      console.error('[WebImageUpload] Upload error:', error);
      throw new Error(`Upload failed: ${error.message}`);
    }
    
    // Get public URL (bucket is public, so this works immediately)
    const { data: { publicUrl } } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(fileName);
    
    console.log('[WebImageUpload] Success! URL:', publicUrl);
    
    // Get base64 if requested
    let base64: string | undefined;
    if (includeBase64) {
      console.log('[WebImageUpload] Converting to base64...');
      base64 = await toBase64(blob);
    }
    
    return {
      url: publicUrl,
      path: fileName,
      base64,
    };
    
  } catch (error: any) {
    console.error('[WebImageUpload] Failed:', error);
    
    // Provide user-friendly error messages
    if (error.message?.includes('too large')) {
      throw new Error(error.message);
    } else if (error.message?.includes('Failed to load')) {
      throw new Error('Could not process image. Please try a different photo.');
    } else if (error.message?.includes('Upload failed')) {
      throw new Error('Upload to server failed. Please check your connection and try again.');
    } else {
      throw new Error('Image upload failed. Please try again.');
    }
  }
}

/**
 * Upload multiple images
 */
export async function uploadMultipleImages(
  files: File[],
  includeBase64: boolean = false
): Promise<WebImageUpload[]> {
  console.log('[WebImageUpload] Uploading', files.length, 'images...');
  
  const results = await Promise.all(
    files.map(file => uploadImage(file, includeBase64))
  );
  
  console.log('[WebImageUpload] All uploads complete!');
  return results;
}

/**
 * Delete image from storage
 */
export async function deleteImage(path: string): Promise<void> {
  try {
    const supabase = createClient();
    
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([path]);
    
    if (error) {
      throw error;
    }
    
    console.log('[WebImageUpload] Deleted:', path);
  } catch (error) {
    console.error('[WebImageUpload] Delete failed:', error);
    throw error;
  }
}
