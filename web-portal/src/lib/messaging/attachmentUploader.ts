import { createClient } from '@/lib/supabase/client';

const BUCKET_NAME = 'dash-attachments';

// File size limits in bytes
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_AUDIO_SIZE = 25 * 1024 * 1024; // 25MB
const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_OTHER_SIZE = 25 * 1024 * 1024; // 25MB

// Allowed MIME types
const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
];

const ALLOWED_AUDIO_TYPES = [
  'audio/webm',
  'audio/ogg',
  'audio/mp3',
  'audio/mpeg',
  'audio/mp4',
  'audio/aac',
  'audio/wav',
  'audio/x-m4a',
  'audio/m4a',
];

const ALLOWED_VIDEO_TYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
];

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 10000;

// MIME type to extension mapping for common types
const MIME_TO_EXT: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp3': 'mp3',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/wav': 'wav',
  'audio/x-m4a': 'm4a',
  'audio/m4a': 'm4a',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/x-msvideo': 'avi',
};

export interface UploadResult {
  url: string;
  path: string;
  mimeType: string;
}

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

interface UploadOptions {
  pathPrefix?: string;
  filenameHint?: string;
  contentType?: string;
  onProgress?: (progress: UploadProgress) => void;
}

export class AttachmentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AttachmentValidationError';
  }
}

export class AttachmentUploadError extends Error {
  readonly isRetryable: boolean;
  
  constructor(message: string, isRetryable: boolean = false) {
    super(message);
    this.name = 'AttachmentUploadError';
    this.isRetryable = isRetryable;
  }
}

const getExtension = (input?: string) => {
  if (!input) return undefined;
  const clean = input.split('.').pop()?.toLowerCase();
  return clean?.replace(/[^a-z0-9]/g, '') || undefined;
};

/**
 * Get file extension from MIME type using mapping or fallback
 */
const getExtensionFromMimeType = (mimeType: string): string => {
  // Check exact match in mapping
  if (MIME_TO_EXT[mimeType]) {
    return MIME_TO_EXT[mimeType];
  }
  
  // Try without codec parameters (e.g., 'audio/webm;codecs=opus' -> 'audio/webm')
  const baseMimeType = mimeType.split(';')[0].trim();
  if (MIME_TO_EXT[baseMimeType]) {
    return MIME_TO_EXT[baseMimeType];
  }
  
  // Fallback to extracting subtype and sanitizing
  const subtype = baseMimeType.split('/')[1];
  if (subtype) {
    // Remove 'x-' prefix and any non-alphanumeric characters
    return subtype.replace(/^x-/, '').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin';
  }
  
  return 'bin';
};

/**
 * Validate file size based on file type
 */
const validateFileSize = (size: number, mimeType: string): void => {
  let maxSize: number;
  let typeLabel: string;

  if (mimeType.startsWith('image/')) {
    maxSize = MAX_IMAGE_SIZE;
    typeLabel = 'Image';
  } else if (mimeType.startsWith('audio/')) {
    maxSize = MAX_AUDIO_SIZE;
    typeLabel = 'Audio';
  } else if (mimeType.startsWith('video/')) {
    maxSize = MAX_VIDEO_SIZE;
    typeLabel = 'Video';
  } else {
    maxSize = MAX_OTHER_SIZE;
    typeLabel = 'File';
  }

  if (size > maxSize) {
    const maxMB = Math.round(maxSize / (1024 * 1024));
    const fileMB = (size / (1024 * 1024)).toFixed(1);
    throw new AttachmentValidationError(
      `${typeLabel} is too large (${fileMB}MB). Maximum size is ${maxMB}MB.`
    );
  }
};

/**
 * Validate MIME type is allowed
 */
const validateMimeType = (mimeType: string): void => {
  const isAllowed = 
    ALLOWED_IMAGE_TYPES.includes(mimeType) ||
    ALLOWED_AUDIO_TYPES.includes(mimeType) ||
    ALLOWED_VIDEO_TYPES.includes(mimeType);

  if (!isAllowed) {
    // Allow generic types for flexibility
    if (
      mimeType.startsWith('image/') ||
      mimeType.startsWith('audio/') ||
      mimeType.startsWith('video/')
    ) {
      return; // Allow generic media types
    }

    throw new AttachmentValidationError(
      `File type "${mimeType}" is not supported. Please use common image, audio, or video formats.`
    );
  }
};

/**
 * Get user-friendly error message from Supabase storage error
 */
const getStorageErrorMessage = (error: unknown): { message: string; isRetryable: boolean } => {
  if (error && typeof error === 'object' && 'message' in error) {
    const msg = (error as { message: string }).message;
    
    // Network errors are retryable
    if (msg.includes('network') || msg.includes('fetch') || msg.includes('timeout')) {
      return { 
        message: 'Network error during upload. Please check your connection and try again.',
        isRetryable: true 
      };
    }
    
    // Storage quota errors
    if (msg.includes('quota') || msg.includes('limit')) {
      return { 
        message: 'Storage limit reached. Please contact support.',
        isRetryable: false 
      };
    }
    
    // Permission errors
    if (msg.includes('permission') || msg.includes('denied') || msg.includes('403')) {
      return { 
        message: 'Upload permission denied. Please try signing in again.',
        isRetryable: false 
      };
    }
    
    // Server errors are potentially retryable
    if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('504')) {
      return { 
        message: 'Server error during upload. Please try again.',
        isRetryable: true 
      };
    }
    
    return { message: msg, isRetryable: false };
  }
  
  return { 
    message: 'Upload failed. Please try again.',
    isRetryable: true 
  };
};

/**
 * Sleep for a specified duration
 */
const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Upload a file with exponential backoff retry logic
 */
export const uploadMessageAttachment = async (
  file: File | Blob,
  options: UploadOptions = {}
): Promise<UploadResult> => {
  const supabase = createClient();
  
  // Determine content type
  const contentType = options.contentType || (file instanceof File ? file.type : undefined) || 'application/octet-stream';
  
  // Validate file size
  validateFileSize(file.size, contentType);
  
  // Validate MIME type (skip for blobs without type, like voice recordings)
  if (contentType !== 'application/octet-stream') {
    validateMimeType(contentType);
  }

  // Generate unique file path
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  const fallbackExt = getExtension(options.filenameHint) || 
    (file instanceof File ? getExtension(file.name) : undefined) || 
    getExtensionFromMimeType(contentType);
  const objectPath = `${options.pathPrefix ? `${options.pathPrefix}/` : ''}${timestamp}_${random}.${fallbackExt}`;

  let lastError: unknown;
  
  // Retry loop with exponential backoff
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // Report initial progress
      options.onProgress?.({ loaded: 0, total: file.size, percentage: 0 });

      const { error } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(objectPath, file, {
          cacheControl: '3600',
          upsert: false,
          contentType,
        });

      if (error) {
        const { message, isRetryable } = getStorageErrorMessage(error);
        
        if (!isRetryable || attempt === MAX_RETRIES - 1) {
          throw new AttachmentUploadError(message, false);
        }
        
        lastError = error;
        const delay = Math.min(INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt), MAX_RETRY_DELAY_MS);
        console.warn(`Upload attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
        await sleep(delay);
        continue;
      }

      // Report completion
      options.onProgress?.({ loaded: file.size, total: file.size, percentage: 100 });

      const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(objectPath);

      return {
        url: data.publicUrl,
        path: objectPath,
        mimeType: contentType,
      };
    } catch (error) {
      if (error instanceof AttachmentValidationError || error instanceof AttachmentUploadError) {
        throw error;
      }
      
      lastError = error;
      
      // For unexpected errors, retry if we have attempts left
      if (attempt < MAX_RETRIES - 1) {
        const delay = Math.min(INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt), MAX_RETRY_DELAY_MS);
        console.warn(`Upload attempt ${attempt + 1} failed unexpectedly, retrying in ${delay}ms...`);
        await sleep(delay);
        continue;
      }
    }
  }

  // All retries exhausted
  const { message } = getStorageErrorMessage(lastError);
  throw new AttachmentUploadError(`Upload failed after ${MAX_RETRIES} attempts: ${message}`, false);
};

/**
 * Validate a file before attempting upload
 * Use this for early validation with user feedback
 */
export const validateAttachment = (file: File | Blob, contentType?: string): void => {
  const mimeType = contentType || (file instanceof File ? file.type : 'application/octet-stream');
  validateFileSize(file.size, mimeType);
  if (mimeType !== 'application/octet-stream') {
    validateMimeType(mimeType);
  }
};
