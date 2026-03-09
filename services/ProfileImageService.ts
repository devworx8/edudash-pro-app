import { assertSupabase } from '@/lib/supabase';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

export interface ImageUploadResult {
  success: boolean;
  publicUrl?: string;
  error?: string;
}

export interface ImageUploadProgress {
  loaded: number;
  total: number;
  progress: number; // 0-1
}

export interface ProfileImageOptions {
  quality?: number; // 0-1, default 0.8
  maxWidth?: number; // default 800
  maxHeight?: number; // default 800
  format?: 'jpeg' | 'png' | 'webp'; // default 'jpeg'
  onProgress?: (progress: ImageUploadProgress) => void;
}

class ProfileImageService {
  private static readonly BUCKET_NAME = 'avatars';
  private static readonly DEFAULT_OPTIONS: Required<Omit<ProfileImageOptions, 'onProgress'>> = {
    quality: 0.8,
    maxWidth: 800,
    maxHeight: 800,
    format: 'jpeg',
  };

  /**
   * Upload a profile image to Supabase Storage
   */
  static async uploadProfileImage(
    userId: string,
    imageUri: string,
    options: ProfileImageOptions = {}
  ): Promise<ImageUploadResult> {
    try {
      const finalOptions = { ...this.DEFAULT_OPTIONS, ...options };

      // Step 1: Validate user authentication
      const { data: { user }, error: authError } = await assertSupabase().auth.getUser();
      if (authError || !user) {
        return {
          success: false,
          error: 'Unauthorized: User authentication failed'
        };
      }

      // Step 2: Process and compress the image
      const processedImageUri = await this.processImage(imageUri, finalOptions);
      if (!processedImageUri) {
        return {
          success: false,
          error: 'Failed to process image'
        };
      }

      // Step 3: Generate unique filename using auth UID (for RLS compliance)
      const fileExtension = finalOptions.format === 'jpeg' ? 'jpg' : finalOptions.format;
      const timestamp = Date.now();
      const authUid = user.id; // This is the auth UUID that RLS policies check against
      const finalFilename = `profile_${authUid}_${timestamp}.${fileExtension}`;

      // Step 4: Convert image to a binary body for upload (robust on native)
      const body = await this.createBodyFromUri(processedImageUri, finalOptions.format);
      if (!body) {
        return {
          success: false,
          error: 'Failed to prepare image for upload'
        };
      }

      // Step 5: Upload to Supabase Storage
      const { error: uploadError } = await assertSupabase().storage
        .from(this.BUCKET_NAME)
        .upload(finalFilename, body as any, {
          contentType: `image/${finalOptions.format}`,
          upsert: false, // Don't overwrite, use unique filenames
        });

      if (uploadError) {
        console.error('Storage upload error:', uploadError);
        
        // If bucket doesn't exist or is not accessible, fail explicitly (no local URI fallback per Non‑Negotiables)
        if (uploadError.message.includes('Bucket not found') || 
            uploadError.message.includes('not found') ||
            uploadError.message.includes('Network request failed')) {
          return {
            success: false,
            error: 'Avatar storage is unavailable. Please try again later.'
          };
        }
        
        return {
          success: false,
          error: `Upload failed: ${uploadError.message}`
        };
      }

      // Step 6: Get public URL
      const { data: { publicUrl } } = assertSupabase().storage
        .from(this.BUCKET_NAME)
        .getPublicUrl(finalFilename);

      if (!publicUrl) {
        return {
          success: false,
          error: 'Failed to generate public URL'
        };
      }

      // Step 7: Update user profile with new avatar URL (profiles table)
      const { error: profileError } = await assertSupabase()
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('auth_user_id', user.id);

      if (profileError) {
        console.warn('Profile update error:', profileError);
        // Still consider successful since image was uploaded
      }

      // Step 7b: Skip updating public.users to avoid 409 conflicts and rely on profiles + auth metadata
      // Avatar is already stored in profiles.avatar_url and auth user metadata.
      // If a users-table sync is needed in future, implement a server-side RPC to handle it safely.

      // Step 8: Update user metadata for consistency
      try {
        await assertSupabase().auth.updateUser({
          data: { avatar_url: publicUrl }
        });
        console.log('✓ Avatar URL updated in auth metadata');
      } catch (metaError) {
        console.warn('User metadata update failed:', metaError);
        // Not critical, continue
      }

      // Step 9: Cleanup old avatars in background (non-blocking)
      this.cleanupOldAvatars(userId).catch(error => {
        console.warn('Background avatar cleanup failed:', error);
      });

      return {
        success: true,
        publicUrl
      };

    } catch (error) {
      console.error('Profile image upload error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown upload error'
      };
    }
  }

  /**
   * Process and compress image before upload
   */
  private static async processImage(
    imageUri: string,
    options: Required<Omit<ProfileImageOptions, 'onProgress'>>
  ): Promise<string | null> {
    try {
      // Manipulate image: resize and compress
      const result = await manipulateAsync(
        imageUri,
        [
          {
            resize: {
              width: options.maxWidth,
              height: options.maxHeight,
            }
          }
        ],
        {
          compress: options.quality,
          format: options.format === 'jpeg' ? SaveFormat.JPEG : 
                   options.format === 'png' ? SaveFormat.PNG :
                   SaveFormat.WEBP,
        }
      );

      return result.uri;
    } catch (error) {
      console.error('Image processing error:', error);
      return null;
    }
  }

  /**
   * Validate that a URL is safe for web display and not a local file URI
   */
  static isValidWebUrl(url: string): boolean {
    if (!url) return false;
    
    // Allow data URIs and HTTP/HTTPS URLs
    if (url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://')) {
      return true;
    }
    
    // Reject local file URIs that cause security errors on web
    if (url.startsWith('file:') || url.includes('/data/') || url.includes('/cache/') || url.includes('ImageManipulator')) {
      return false;
    }
    
    // Allow blob URLs (they work on web)
    if (url.startsWith('blob:')) {
      return true;
    }
    
    return false;
  }

  /**
   * Convert local image URI to web-compatible data URI for preview
   * This fixes the 'Not allowed to load local resource' error on web
   */
  static async convertToDataUri(uri: string): Promise<string | null> {
    try {
      if (Platform.OS === 'web') {
        // On web, if it's already a data URI or http URL, return as-is
        if (uri.startsWith('data:') || uri.startsWith('http')) {
          return uri;
        }
        
        // For blob URLs, we can try to fetch them
        if (uri.startsWith('blob:')) {
          try {
            const response = await fetch(uri);
            const blob = await response.blob();
            
            return new Promise((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.onerror = () => {
                console.warn('FileReader error for blob URL');
                resolve(null);
              };
              reader.readAsDataURL(blob);
            });
          } catch (fetchError) {
            console.warn('Could not fetch blob URL:', fetchError);
            return null;
          }
        }
        
        // For local file URIs on web (file:// or /data/), we cannot access them due to security restrictions
        // The browser simply won't allow it. Return null so components can handle this gracefully.
        if (uri.startsWith('file:') || uri.includes('/data/') || uri.includes('/cache/') || uri.includes('ImageManipulator')) {
          console.warn('Cannot access local file URI on web platform - this suggests an upload failure:', uri);
          console.warn('💡 Check that the Supabase "avatars" bucket exists and is properly configured');
          return null;
        }
      }
      
      // On native, return the URI as-is since it should work
      return uri;
    } catch (error) {
      console.error('Error converting URI to data URI:', error);
      return null;
    }
  }

  /**
   * Convert image URI to a binary body for upload that works reliably on native and web
   */
  private static async createBodyFromUri(
    uri: string, 
    format: string
  ): Promise<Uint8Array | null> {
    try {
      if (Platform.OS === 'web') {
        const response = await fetch(uri);
        if (!response.ok) {
          throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
        }
        const buffer = await response.arrayBuffer();
        return new Uint8Array(buffer);
      }

      // Native: read as base64 and decode to bytes
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
      const bytes = this.base64ToUint8Array(base64);
      return bytes;
    } catch (error) {
      console.error('Error creating upload body from URI:', error);
      return null;
    }
  }

  /**
   * Minimal base64 decoder to Uint8Array
   */
  private static base64ToUint8Array(base64: string): Uint8Array {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let str = base64.replace(/\s/g, '');
    const output: number[] = [];

    for (let i = 0; i < str.length; i += 4) {
      const enc1 = chars.indexOf(str.charAt(i));
      const enc2 = chars.indexOf(str.charAt(i + 1));
      const enc3 = chars.indexOf(str.charAt(i + 2));
      const enc4 = chars.indexOf(str.charAt(i + 3));

      const chr1 = (enc1 << 2) | (enc2 >> 4);
      const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
      const chr3 = ((enc3 & 3) << 6) | enc4;

      output.push(chr1);
      if (enc3 !== 64 && enc3 !== -1) output.push(chr2);
      if (enc4 !== 64 && enc4 !== -1) output.push(chr3);
    }
    return new Uint8Array(output);
  }

  /**
   * Clean up old avatar files for a user
   */
  private static async cleanupOldAvatars(userId: string): Promise<void> {
    try {
      // List all files in the avatars bucket for this user
      const { data: files, error } = await assertSupabase().storage
        .from(this.BUCKET_NAME)
        .list('', {
          search: `profile_${userId}_`,
        });
        
      if (error || !files) {
        console.warn('Could not list files for cleanup:', error);
        return;
      }
      
      // Sort files by created time (newest first) and keep only the latest
      const userFiles = files
        .filter(file => file.name.startsWith(`profile_${userId}_`))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(1); // Keep the first (newest), remove the rest
      
      if (userFiles.length > 0) {
        const filesToDelete = userFiles.map(file => file.name);
        const { error: deleteError } = await assertSupabase().storage
          .from(this.BUCKET_NAME)
          .remove(filesToDelete);
          
        if (deleteError) {
          console.error('Failed to delete old avatar files:', deleteError);
        } else {
          console.log(`Successfully cleaned up ${filesToDelete.length} old avatars for user:`, userId);
        }
      }
    } catch (error) {
      console.error('Failed to cleanup old avatars:', error);
    }
  }

  /**
   * Delete a specific avatar file
   */
  static async deleteAvatar(userId: string, avatarUrl: string): Promise<boolean> {
    try {
      // Extract filename from URL
      const filename = this.extractFilenameFromUrl(avatarUrl);
      if (!filename) {
        return false;
      }

      // Verify user owns this avatar
      if (!filename.includes(userId)) {
        console.error('User does not own this avatar file');
        return false;
      }

      // Delete from storage
      const { error } = await assertSupabase().storage
        .from(this.BUCKET_NAME)
        .remove([filename]);

      if (error) {
        console.error('Error deleting avatar:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Delete avatar error:', error);
      return false;
    }
  }

  /**
   * Extract filename from Supabase public URL
   */
  private static extractFilenameFromUrl(url: string): string | null {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/');
      return pathParts[pathParts.length - 1] || null;
    } catch (error) {
      console.error('Error extracting filename from URL:', error);
      return null;
    }
  }

  /**
   * Check if avatars bucket exists and is properly configured
   */
  static async checkBucketStatus(): Promise<{ exists: boolean; isPublic: boolean; error?: string }> {
    try {
      const { data: buckets, error } = await assertSupabase().storage.listBuckets();
      
      if (error) {
        return { exists: false, isPublic: false, error: error.message };
      }

      const avatarsBucket = buckets.find(bucket => bucket.id === this.BUCKET_NAME);
      
      if (!avatarsBucket) {
        return { exists: false, isPublic: false, error: 'Avatars bucket not found' };
      }

      return { 
        exists: true, 
        isPublic: avatarsBucket.public,
      };
    } catch (error) {
      return { 
        exists: false, 
        isPublic: false, 
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get file size limit for avatars bucket
   */
  static getMaxFileSize(): number {
    return 5 * 1024 * 1024; // 5MB in bytes
  }

  /**
   * Get allowed mime types
   */
  static getAllowedMimeTypes(): string[] {
    return ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/avif'];
  }

  /**
   * Validate image before upload
   */
  static async validateImage(uri: string): Promise<{ valid: boolean; error?: string }> {
    try {
      if (Platform.OS === 'web') {
        const response = await fetch(uri);

        if (!response.ok) {
          return {
            valid: false,
            error: `Failed to read image (${response.status} ${response.statusText})`,
          };
        }

        const blob = await response.blob();
        const mimeType = blob.type?.toLowerCase() ?? '';

        if (blob.size > this.getMaxFileSize()) {
          return {
            valid: false,
            error: `File size (${Math.round(blob.size / 1024 / 1024)}MB) exceeds limit (5MB)`,
          };
        }

        if (mimeType && !this.getAllowedMimeTypes().includes(mimeType)) {
          return {
            valid: false,
            error: 'Unsupported image type. Please use JPG, PNG, WEBP, or AVIF.',
          };
        }

        return { valid: true };
      }

      // Check if file exists and get info
      const info = await FileSystem.getInfoAsync(uri);
      
      if (!info.exists) {
        return { valid: false, error: 'File does not exist' };
      }

      if (info.size && info.size > this.getMaxFileSize()) {
        return { 
          valid: false, 
          error: `File size (${Math.round(info.size / 1024 / 1024)}MB) exceeds limit (5MB)` 
        };
      }

      return { valid: true };
    } catch (error) {
      return { 
        valid: false, 
        error: error instanceof Error ? error.message : 'Validation failed' 
      };
    }
  }
}

export default ProfileImageService;

// Debug function to check storage status (useful for development)
if (__DEV__) {
  (global as any).debugAvatarStorage = async () => {
    console.log('🔍 Avatar Storage Debug Info:');
    const bucketStatus = await ProfileImageService.checkBucketStatus();
    console.log('Bucket Status:', bucketStatus);
    
    if (!bucketStatus.exists) {
      console.log('❌ ISSUE FOUND: Avatars bucket does not exist!');
      console.log('📋 To fix: Create the "avatars" bucket in Supabase Dashboard');
      console.log('   1. Go to Supabase Dashboard > Storage');
      console.log('   2. Create new bucket: "avatars"');
      console.log('   3. Set as public bucket');
      console.log('   4. Set file size limit: 5MB');
    } else {
      console.log('✅ Avatars bucket exists and is accessible');
    }
    
    return bucketStatus;
  };
  
  console.log('🛠️ Avatar storage debug function available: debugAvatarStorage()');
}
