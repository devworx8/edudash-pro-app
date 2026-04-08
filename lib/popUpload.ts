/**
 * POP Upload Utilities
 * Handles both Proof of Payment and Picture of Progress uploads
 * with Supabase Storage integration, file validation, and compression
 */

import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { supabase, supabaseAnonKey, supabaseUrl } from './supabase';
import { decode } from 'base64-arraybuffer';
import { normalizeMediaUri } from './utils/cameraRecovery';
import { compressImageForAI } from './dash-ai/imageCompression';

// Upload types
export type POPUploadType = 'proof_of_payment' | 'picture_of_progress';

// File validation constants
export const FILE_VALIDATION = {
  maxSizeBytes: 50 * 1024 * 1024, // 50MB
  maxSizeBytesCompressed: 12 * 1024 * 1024, // 12MB for compressed images
  allowedImageTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
  allowedDocumentTypes: ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'],
  maxImageDimension: 2048, // Max width/height for images
  compressionQuality: 0.8,
};

const MAX_BASE64_FALLBACK_SIZE_BYTES = 6 * 1024 * 1024; // 6MB guard for fallback path

// Storage buckets - matching existing database buckets
export const STORAGE_BUCKETS = {
  proof_of_payment: 'proof-of-payments', // Existing bucket in database
  picture_of_progress: 'proof-of-payments', // Using same bucket until picture-of-progress is created
} as const;

// File validation result
export interface FileValidationResult {
  isValid: boolean;
  errors: string[];
  fileSize?: number;
  fileType?: string;
}

// Upload result
export interface UploadResult {
  success: boolean;
  filePath?: string;
  fileName?: string;
  fileSize?: number;
  fileType?: string;
  error?: string;
}

// Compressed file result
export interface CompressionResult {
  uri: string;
  width: number;
  height: number;
  fileSize: number;
}

const readWebBlob = async (fileUri: string, webFile?: Blob): Promise<Blob> => {
  if (typeof Blob !== 'undefined' && webFile instanceof Blob) {
    return webFile;
  }

  const response = await fetch(fileUri);
  if (!response.ok) {
    throw new Error(`Failed to read selected browser file (${response.status})`);
  }

  return response.blob();
};

const inferMimeType = (fileNameOrUri?: string): string => {
  const extension = getFileExtension(fileNameOrUri);

  switch (extension) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'pdf':
      return 'application/pdf';
    default:
      if ((fileNameOrUri || '').toLowerCase().includes('pdf')) {
        return 'application/pdf';
      }
      return 'unknown';
  }
};

/**
 * Validate file for POP upload
 */
export const validatePOPFile = async (
  fileUri: string,
  uploadType: POPUploadType,
  originalFileName?: string,
  webFile?: Blob
): Promise<FileValidationResult> => {
  try {
    const typeSource = originalFileName || fileUri;
    let fileType = inferMimeType(typeSource);
    let fileSize = 0;

    if (Platform.OS === 'web') {
      const blob = await readWebBlob(fileUri, webFile);
      fileSize = blob.size || 0;
      if (blob.type) {
        fileType = blob.type.toLowerCase();
      }
    } else {
      const uri = normalizeMediaUri(fileUri);

      // Get file info
      const fileInfo = await FileSystem.getInfoAsync(uri);

      if (!fileInfo.exists) {
        // For content:// URIs, we may not be able to check existence
        // but the file should be valid if DocumentPicker returned it
        if (uri.startsWith('content://')) {
          console.log('Content URI detected, skipping existence check');
        } else {
          return {
            isValid: false,
            errors: ['File does not exist'],
          };
        }
      }

      fileSize = (fileInfo as any).size || 0;
    }
    
    const errors: string[] = [];
    
    // Check file size
    if (fileSize > FILE_VALIDATION.maxSizeBytes) {
      errors.push(`File size must be less than ${FILE_VALIDATION.maxSizeBytes / (1024 * 1024)}MB`);
    }
    
    // Check file type based on upload type
    const allowedTypes = uploadType === 'proof_of_payment' 
      ? FILE_VALIDATION.allowedDocumentTypes 
      : FILE_VALIDATION.allowedImageTypes;
    
    if (!allowedTypes.includes(fileType)) {
      if (uploadType === 'proof_of_payment') {
        errors.push('Only PDF and image files (JPG, PNG) are allowed for payment receipts');
      } else {
        errors.push('Only image files (JPG, PNG, WebP) are allowed for progress pictures');
      }
    }
    
    // Note: We skip complex file content validation here.
    // Supabase Storage will reject truly invalid files on upload.
    // This keeps validation fast and avoids ImageManipulator issues with PDFs.
    
    return {
      isValid: errors.length === 0,
      errors,
      fileSize,
      fileType,
    };
  } catch (error) {
    console.error('File validation error:', error);
    // If validation fails but we have a file from DocumentPicker, try to continue
    // The upload will fail at the Supabase level if the file is truly invalid
    const extension = getFileExtension(originalFileName || fileUri);
    const isPdf = extension === 'pdf' || fileUri.toLowerCase().includes('pdf');
    const isImage = ['jpg', 'jpeg', 'png', 'webp'].includes(extension || '');
    
    if (isPdf || isImage) {
      console.log('Validation error but file appears valid by extension, allowing upload attempt');
      return {
        isValid: true,
        errors: [],
        fileSize: 0,
        fileType: isPdf ? 'application/pdf' : `image/${extension === 'jpg' ? 'jpeg' : extension}`,
      };
    }
    
    return {
      isValid: false,
      errors: ['Failed to validate file. Please try a different file or format.'],
    };
  }
};

/**
 * Compress image if needed
 */
export const compressImageIfNeeded = async (
  fileUri: string,
  fileSize: number
): Promise<CompressionResult | null> => {
  try {
    // Only compress if file is too large or dimensions might be too big
    if (fileSize <= FILE_VALIDATION.maxSizeBytesCompressed) {
      return null; // No compression needed
    }
    
    // Compress the image
    const compressedImage = await ImageManipulator.manipulateAsync(
      fileUri,
      [
        {
          resize: {
            width: FILE_VALIDATION.maxImageDimension,
            height: FILE_VALIDATION.maxImageDimension,
          },
        },
      ],
      {
        compress: FILE_VALIDATION.compressionQuality,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: false,
      }
    );
    
    // Get compressed file info
    const compressedFileInfo = await FileSystem.getInfoAsync(compressedImage.uri);
    const size = (compressedFileInfo && 'size' in compressedFileInfo) ? (compressedFileInfo as any).size || 0 : 0;
    
    return {
      uri: compressedImage.uri,
      width: compressedImage.width,
      height: compressedImage.height,
      fileSize: size,
    };
  } catch (error) {
    console.error('Image compression failed:', error);
    return null;
  }
};

const getFileExtension = (fileNameOrUri?: string): string => {
  if (!fileNameOrUri) return 'jpg';
  const cleaned = fileNameOrUri.split('?')[0];
  const extension = cleaned.split('.').pop()?.toLowerCase();
  return extension || 'jpg';
};

const normalizeUploadUri = async (inputUri: string, fallbackName?: string): Promise<string> => {
  const normalized = normalizeMediaUri(inputUri);
  if (!normalized.startsWith('content://')) {
    return normalized;
  }

  const cacheRoot = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!cacheRoot) {
    throw new Error('No writable cache directory available for upload.');
  }

  const extension = getFileExtension(fallbackName || inputUri);
  const target = `${cacheRoot}pop-upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
  await FileSystem.copyAsync({
    from: normalized,
    to: target,
  });

  return target;
};

/**
 * Generate unique file path for storage
 */
export const generateStorageFilePath = (
  uploadType: POPUploadType,
  userId: string,
  studentId: string,
  originalFileName: string
): string => {
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const extension = originalFileName.split('.').pop()?.toLowerCase() || 'jpg';
  
  // Create hierarchical path: userId/studentId/timestamp_random.ext
  return `${userId}/${studentId}/${timestamp}_${randomSuffix}.${extension}`;
};

/**
 * Upload file to Supabase Storage
 */
export const uploadPOPFile = async (
  fileUri: string,
  uploadType: POPUploadType,
  userId: string,
  studentId: string,
  originalFileName: string,
  webFile?: Blob
): Promise<UploadResult> => {
  try {
    console.log('Starting POP file upload:', { uploadType, fileUri, originalFileName });

    const normalizedInputUri = await normalizeUploadUri(fileUri, originalFileName);
    
    // Validate file
    const validation = await validatePOPFile(normalizedInputUri, uploadType, originalFileName, webFile);
    if (!validation.isValid) {
      return {
        success: false,
        error: validation.errors.join(', '),
      };
    }
    
    let uploadUri = normalizedInputUri;
    let finalFileSize = validation.fileSize || 0;
    let finalFileType = validation.fileType || 'unknown';
    
    // Compress image if it's an image and too large
    if (FILE_VALIDATION.allowedImageTypes.includes(finalFileType)) {
      const compressed = await compressImageIfNeeded(normalizedInputUri, finalFileSize);
      if (compressed) {
        uploadUri = compressed.uri;
        finalFileSize = compressed.fileSize;
        finalFileType = 'image/jpeg'; // Compressed to JPEG
        console.log('Image compressed:', { originalSize: validation.fileSize, newSize: finalFileSize });
      }
    }
    
    // Generate storage path
    const storagePath = generateStorageFilePath(uploadType, userId, studentId, originalFileName);
    const bucket = STORAGE_BUCKETS[uploadType];

    if (Platform.OS === 'web') {
      const blob = await readWebBlob(uploadUri, webFile);
      finalFileSize = blob.size || finalFileSize;
      if (finalFileType === 'unknown') {
        finalFileType = blob.type?.toLowerCase() || inferMimeType(originalFileName);
      }

      const arrayBuffer = await blob.arrayBuffer();
      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(storagePath, arrayBuffer, {
          contentType: finalFileType,
          upsert: false,
        });

      if (error) {
        console.error('Supabase storage upload error:', error);
        return {
          success: false,
          error: `Upload failed: ${error.message}`,
        };
      }

      console.log('POP file uploaded successfully:', data?.path);

      return {
        success: true,
        filePath: data?.path || storagePath,
        fileName: originalFileName,
        fileSize: finalFileSize,
        fileType: finalFileType,
      };
    }

    // Prefer direct binary upload using FileSystem for mobile stability.
    if (supabaseUrl && supabaseAnonKey) {
      try {
        const session = await supabase.auth.getSession();
        const accessToken = session?.data?.session?.access_token;
        if (accessToken) {
          const uploadEndpoint = `${supabaseUrl}/storage/v1/object/${bucket}/${storagePath}`;
          console.log('[upload_binary_start] POP upload binary start', {
            uploadType,
            bucket,
            storagePath,
            fileType: finalFileType,
            fileSize: finalFileSize,
          });
          const uploadResponse = await FileSystem.uploadAsync(uploadEndpoint, uploadUri, {
            httpMethod: 'POST',
            uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
            headers: {
              Authorization: `Bearer ${accessToken}`,
              apikey: supabaseAnonKey,
              'content-type': finalFileType,
              'x-upsert': 'false',
            },
          });

          if (uploadResponse.status >= 200 && uploadResponse.status < 300) {
            console.log('POP file uploaded via binary upload:', storagePath);
            return {
              success: true,
              filePath: storagePath,
              fileName: originalFileName,
              fileSize: finalFileSize,
              fileType: finalFileType,
            };
          }

          console.warn('[upload_binary_fail] POP binary upload failed, falling back to standard upload:', {
            status: uploadResponse.status,
            body: uploadResponse.body?.slice(0, 200),
            storagePath,
          });
        } else {
          console.warn('[upload_binary_fail] No access token available for binary upload, falling back.', {
            storagePath,
          });
        }
      } catch (binaryUploadError) {
        console.warn('[upload_binary_fail] Binary upload path threw, falling back:', binaryUploadError);
      }
    }

    const fileInfo = await FileSystem.getInfoAsync(uploadUri);
    const fallbackFileSize = (fileInfo as any)?.size || finalFileSize;
    let base64: string;
    if (fallbackFileSize > MAX_BASE64_FALLBACK_SIZE_BYTES) {
      if (FILE_VALIDATION.allowedImageTypes.includes(finalFileType)) {
        try {
          // Keep large images uploadable even when binary upload path fails.
          const compressed = await compressImageForAI(
            uploadUri,
            Math.floor(MAX_BASE64_FALLBACK_SIZE_BYTES * 0.9)
          );
          base64 = compressed.base64;
          uploadUri = compressed.uri;
          finalFileType = 'image/jpeg';
          finalFileSize = Math.floor(base64.length * 0.75);
          console.log('[upload_fallback_compressed] POP upload compressed for base64 fallback', {
            uploadType,
            storagePath,
            originalSize: fallbackFileSize,
            compressedBytes: finalFileSize,
          });
        } catch (compressionError) {
          console.warn('[upload_oom_guard] POP fallback compression failed', {
            uploadType,
            storagePath,
            fileSize: fallbackFileSize,
            max: MAX_BASE64_FALLBACK_SIZE_BYTES,
            compressionError,
          });
          return {
            success: false,
            error: `Image is still too large to upload. Try a clearer JPG/PNG under ${Math.round(FILE_VALIDATION.maxSizeBytesCompressed / (1024 * 1024))}MB.`,
          };
        }
      } else {
        console.warn('[upload_oom_guard] Blocking POP base64 fallback due file size', {
          uploadType,
          storagePath,
          fileSize: fallbackFileSize,
          max: MAX_BASE64_FALLBACK_SIZE_BYTES,
        });
        return {
          success: false,
          error: `File is too large to upload right now. Try a smaller file (about ${Math.round(MAX_BASE64_FALLBACK_SIZE_BYTES / (1024 * 1024))}MB or less) or retry on a stable network.`,
        };
      }
    } else {
      // Read file as base64 for upload
      // Note: Using 'base64' string literal instead of FileSystem.EncodingType.Base64
      // to avoid "Cannot read property 'Base64' of undefined" errors in some Expo versions
      base64 = await FileSystem.readAsStringAsync(uploadUri, {
        encoding: 'base64',
      });
    }
    
    // Convert base64 to ArrayBuffer using base64-arraybuffer
    // Note: React Native doesn't support new Blob([Uint8Array]), so we upload ArrayBuffer directly
    const arrayBuffer = decode(base64);
    
    // Upload to Supabase Storage (Supabase accepts ArrayBuffer directly)
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(storagePath, arrayBuffer, {
        contentType: finalFileType,
        upsert: false,
      });
    
    if (error) {
      console.error('Supabase storage upload error:', error);
      return {
        success: false,
        error: `Upload failed: ${error.message}`,
      };
    }
    
    console.log('POP file uploaded successfully:', data?.path);
    
    return {
      success: true,
      filePath: data?.path || storagePath,
      fileName: originalFileName,
      fileSize: finalFileSize,
      fileType: finalFileType,
    };
  } catch (error) {
    console.error('POP upload error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown upload error',
    };
  }
};

/**
 * Get signed URL for viewing uploaded file
 */
export const getPOPFileUrl = async (
  uploadType: POPUploadType,
  filePath: string,
  expiresIn = 3600 // 1 hour
): Promise<string | null> => {
  try {
    const bucket = STORAGE_BUCKETS[uploadType];
    
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(filePath, expiresIn);
    
    if (error) {
      console.error('Failed to create signed URL:', error);
      return null;
    }
    
    return data?.signedUrl || null;
  } catch (error) {
    console.error('Error getting POP file URL:', error);
    return null;
  }
};

/**
 * Delete POP file from storage
 */
export const deletePOPFile = async (
  uploadType: POPUploadType,
  filePath: string
): Promise<boolean> => {
  try {
    const bucket = STORAGE_BUCKETS[uploadType];
    
    const { error } = await supabase.storage
      .from(bucket)
      .remove([filePath]);
    
    if (error) {
      console.error('Failed to delete POP file:', error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error deleting POP file:', error);
    return false;
  }
};

/**
 * Get file size in human readable format
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

/**
 * Get file type icon name for display
 */
export const getFileTypeIcon = (fileType: string): string => {
  if (fileType.startsWith('image/')) {
    return 'image';
  } else if (fileType === 'application/pdf') {
    return 'document-text';
  } else {
    return 'document';
  }
};
