'use client';

/**
 * React hooks for POP (Proof of Payment) uploads in web
 * Handles file uploads, fetching history, and status tracking
 */

import { useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

// POP Upload type
export type POPUploadType = 'proof_of_payment' | 'picture_of_progress';

// POP Upload interface
export interface POPUpload {
  id: string;
  student_id: string;
  uploaded_by: string;
  preschool_id: string;
  upload_type: POPUploadType;
  title: string;
  description?: string;
  file_path: string;
  file_name: string;
  file_size: number;
  file_type: string;
  
  // Proof of Payment specific
  payment_amount?: number;
  payment_method?: string;
  payment_date?: string;
  payment_for_month?: string;
  payment_reference?: string;
  
  // Status and review
  status: 'pending' | 'approved' | 'rejected' | 'needs_revision';
  reviewed_by?: string;
  reviewed_at?: string;
  review_notes?: string;
  
  created_at: string;
  updated_at: string;
  
  // Joined data
  student?: {
    first_name: string;
    last_name: string;
  };
}

// Upload creation data
export interface CreatePOPUploadData {
  student_id: string;
  upload_type: POPUploadType;
  title: string;
  description?: string;
  file: File;

  // Payment specific
  payment_amount?: number;
  payment_method?: string;
  payment_date?: string;
  payment_for_month?: string;
  payment_reference?: string;
}

// Storage buckets - must match actual bucket names in Supabase Storage
const STORAGE_BUCKETS = {
  proof_of_payment: 'proof-of-payments', // Actual bucket name in database
  picture_of_progress: 'proof-of-payments', // Using same bucket until picture-of-progress is created
} as const;

/**
 * Hook to fetch POP uploads for the current user
 */
export function usePOPUploads(
  userId: string | undefined,
  filters: { 
    upload_type?: POPUploadType; 
    status?: string; 
    student_id?: string 
  } = {}
) {
  const [uploads, setUploads] = useState<POPUpload[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUploads = useCallback(async () => {
    if (!userId) return;
    
    setLoading(true);
    setError(null);
    
    const supabase = createClient();
    
    try {
      let query = supabase
        .from('pop_uploads')
        .select(`
          *,
          student:students (
            first_name,
            last_name
          )
        `)
        .eq('uploaded_by', userId)
        .order('created_at', { ascending: false });
      
      // Apply filters
      if (filters.upload_type) {
        query = query.eq('upload_type', filters.upload_type);
      }
      if (filters.status) {
        query = query.eq('status', filters.status);
      }
      if (filters.student_id) {
        query = query.eq('student_id', filters.student_id);
      }
      
      const { data, error: fetchError } = await query;
      
      if (fetchError) throw fetchError;
      
      setUploads(data || []);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch uploads';
      console.error('Failed to fetch POP uploads:', err);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [userId, filters.upload_type, filters.status, filters.student_id]);

  return { uploads, loading, error, refetch: fetchUploads };
}

/**
 * Hook to create a new POP upload
 */
export function useCreatePOPUpload() {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const supabase = createClient();

  const upload = async (data: CreatePOPUploadData): Promise<POPUpload | null> => {
    setUploading(true);
    setError(null);
    setSuccess(false);
    
    try {
      // Get current user
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        throw new Error('Authentication required');
      }
      
      // Get user's preschool_id
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('preschool_id, organization_id')
        .eq('auth_user_id', user.id)
        .single();

      const preschoolId = profile?.preschool_id || profile?.organization_id;
      if (profileError || !preschoolId) {
        throw new Error('User profile not found');
      }
      
      // Validate file
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (data.file.size > maxSize) {
        throw new Error('File size must be less than 10MB');
      }
      
      const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
      if (!allowedTypes.includes(data.file.type)) {
        throw new Error('Only PDF and image files (JPG, PNG) are allowed');
      }
      
      // Generate storage path
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      const extension = data.file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const storagePath = `${user.id}/${data.student_id}/${timestamp}_${randomSuffix}.${extension}`;
      const bucket = STORAGE_BUCKETS[data.upload_type];
      
      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(storagePath, data.file, {
          contentType: data.file.type,
          upsert: false,
        });
      
      if (uploadError) {
        console.error('Storage upload error:', uploadError);
        throw new Error(`Upload failed: ${uploadError.message}`);
      }
      
      // Create database record
      const dbData = {
        student_id: data.student_id,
        uploaded_by: user.id,
        preschool_id: preschoolId,
        upload_type: data.upload_type,
        title: data.title,
        description: data.description,
        file_path: storagePath,
        file_name: data.file.name,
        file_size: data.file.size,
        file_type: data.file.type,
        payment_amount: data.payment_amount,
        payment_method: data.payment_method,
        payment_date: data.payment_date,
        payment_for_month: data.payment_for_month,
        payment_reference: data.payment_reference,
      };
      
      const { data: newUpload, error: dbError } = await supabase
        .from('pop_uploads')
        .insert(dbData)
        .select(`
          *,
          student:students (
            first_name,
            last_name
          )
        `)
        .single();
        
      if (dbError) {
        console.error('Database insert failed:', dbError);
        const msg = dbError.message || 'Failed to save upload';
        if (msg.includes('A payment upload already exists')) {
          throw new Error(msg.replace('this month', 'this month for this category'));
        }
        throw new Error(`Failed to save upload: ${msg}`);
      }
      
      setSuccess(true);
      return newUpload;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Upload failed';
      console.error('POP upload failed:', err);
      setError(errorMessage);
      return null;
    } finally {
      setUploading(false);
    }
  };

  const reset = () => {
    setError(null);
    setSuccess(false);
  };

  return { upload, uploading, error, success, reset };
}

/**
 * Hook to get signed URL for viewing an uploaded file
 */
export function usePOPFileUrl() {
  const supabase = createClient();
  
  const getFileUrl = async (
    uploadType: POPUploadType,
    filePath: string,
    expiresIn = 3600
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
  
  return { getFileUrl };
}

/**
 * Helper to format file size
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
