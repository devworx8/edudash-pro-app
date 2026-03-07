'use client';

import { useState, useRef, useEffect } from 'react';
import { Camera, Upload, X, ImageIcon, CheckCircle, Sparkles } from 'lucide-react';
import { uploadMultipleImages } from '@/lib/simple-image-upload';

interface ImageUploadProps {
  onSelect: (images: Array<{ data: string; media_type: string; preview: string; url?: string }>) => void;
  onClose: () => void;
  maxImages?: number;
}

export function ImageUpload({ onSelect, onClose, maxImages = 3 }: ImageUploadProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [processedFiles, setProcessedFiles] = useState<number>(0);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup memory on unmount - IMPORTANT!
  useEffect(() => {
    return () => {
      // Revoke all object URLs to prevent memory leaks
      previews.forEach(url => {
        if (url.startsWith('blob:')) {
          URL.revokeObjectURL(url);
        }
      });
      // Cancel any pending uploads
      abortControllerRef.current?.abort();
    };
  }, [previews]);

  const handleFileSelect = async (files: FileList | null) => {
    if (!files) return;

    setError(null);
    const fileArray = Array.from(files).slice(0, maxImages);
    const newPreviews: string[] = [];

    // Enhanced file validation
    const invalidFiles = fileArray.filter(f => !f.type.startsWith('image/'));
    if (invalidFiles.length > 0) {
      setError('Only image files are allowed (JPG, PNG, WebP, etc.)');
      return;
    }

    // Check for oversized files with better messaging
    const maxSizeMB = 20; // Reduced from 50MB for better UX
    const oversizedFiles = fileArray.filter(f => f.size > maxSizeMB * 1024 * 1024);
    if (oversizedFiles.length > 0) {
      const sizeMB = (oversizedFiles[0].size / 1024 / 1024).toFixed(1);
      setError(`Image too large (${sizeMB}MB). Please use photos under ${maxSizeMB}MB for faster upload.`);
      return;
    }

    // Check total batch size to prevent memory issues
    const totalSizeMB = fileArray.reduce((sum, f) => sum + f.size, 0) / 1024 / 1024;
    if (totalSizeMB > 30) {
      setError(`Total batch too large (${totalSizeMB.toFixed(1)}MB). Please select fewer or smaller images.`);
      return;
    }

    // Process files with memory management
    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];

      try {
        const preview = await createOptimizedPreview(file);
        newPreviews.push(preview);

        // Update progress
        setProcessedFiles(i + 1);

        // Force garbage collection for large files
        if (file.size > 5 * 1024 * 1024) {
          if (global.gc) global.gc();
        }
      } catch (err) {
        console.error(`Error processing file ${file.name}:`, err);
        setError(`Could not process "${file.name}". Please try a different image.`);
        return;
      }
    }

    setPreviews(newPreviews);
    setSelectedFiles(fileArray);
    setProcessedFiles(0);
  };

  // Create optimized preview with memory management
  const createOptimizedPreview = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      // For small files, use direct file reader
      if (file.size < 2 * 1024 * 1024) {
        const reader = new FileReader();
        reader.onload = (e) => {
          if (e.target?.result) {
            resolve(e.target.result as string);
          } else {
            reject(new Error('Failed to read file'));
          }
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
        return;
      }

      // For larger files, create compressed preview
      const img = new Image();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Canvas not available'));
        return;
      }

      img.onload = () => {
        try {
          // Calculate preview dimensions (max 800px for preview)
          const maxPreviewSize = 800;
          let width = img.width;
          let height = img.height;

          if (width > maxPreviewSize || height > maxPreviewSize) {
            const ratio = Math.min(maxPreviewSize / width, maxPreviewSize / height);
            width *= ratio;
            height *= ratio;
          }

          canvas.width = width;
          canvas.height = height;

          // Create preview with good quality
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (blob) {
                const reader = new FileReader();
                reader.onload = (e) => {
                  if (e.target?.result) {
                    resolve(e.target.result as string);
                  } else {
                    reject(new Error('Failed to create preview'));
                  }
                };
                reader.readAsDataURL(blob);
              } else {
                reject(new Error('Failed to create preview blob'));
              }
            },
            'image/jpeg',
            0.85
          );
        } catch (err) {
          reject(err);
        }
      };

      img.onerror = () => reject(new Error('Failed to load image for preview'));
      img.src = URL.createObjectURL(file);
    });
  };

  const handleConfirm = async () => {
    setUploading(true);
    setCompressing(true);
    setError(null);
    setUploadProgress({ current: 0, total: selectedFiles.length });

    try {
      console.log('[ImageUpload] Processing', selectedFiles.length, 'images...');

      // Show compression message for large files
      const hasLargeFiles = selectedFiles.some(f => f.size > 5 * 1024 * 1024);
      if (hasLargeFiles) {
        console.log('[ImageUpload] Large files detected, compression may take a moment...');
      }

      // Process files one by one for better progress tracking
      const uploadResults = [];
      for (let i = 0; i < selectedFiles.length; i++) {
        try {
          setUploadProgress({ current: i + 1, total: selectedFiles.length });
          const result = await uploadSingleImage(selectedFiles[i]);
          uploadResults.push(result);
        } catch (fileError) {
          console.error(`Error uploading file ${selectedFiles[i].name}:`, fileError);
          setError(`Failed to upload "${selectedFiles[i].name}". Please try again.`);
          setUploading(false);
          setCompressing(false);
          return;
        }
      }

      setCompressing(false);
      console.log('[ImageUpload] Upload complete, processing results...');

      // Convert to format expected by chat
      const processedImages = uploadResults.map((result, index) => ({
        data: result.base64!,
        media_type: 'image/jpeg' as const,
        preview: previews[index],
        url: result.url, // Include the storage URL
      }));

      // Success feedback before selecting
      setTimeout(() => {
        onSelect(processedImages);
      }, 500); // Small delay for success state
    } catch (err: any) {
      console.error('[ImageUpload] Upload failed:', err);
      setError(err?.message || 'Upload failed. Please try again.');
      setUploading(false);
      setCompressing(false);
    }
  };

  // Upload single image with better error handling
  const uploadSingleImage = async (file: File) => {
    // This would use the same uploadMultipleImages logic but for individual files
    const results = await uploadMultipleImages([file], true);
    return results[0];
  };

  const removeImage = (index: number) => {
    setSelectedFiles(selectedFiles.filter((_, i) => i !== index));
    setPreviews(previews.filter((_, i) => i !== index));
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileSelect(files);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end justify-center z-[1000] animate-in fade-in duration-300"
      onClick={onClose}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div
        className={`bg-gray-900 rounded-t-3xl w-full max-w-2xl mx-auto shadow-2xl border-t-2 ${
          isDragging ? 'border-purple-500' : 'border-gray-800'
        } animate-in slide-in-from-bottom duration-300 ease-out`}
        onClick={(e) => e.stopPropagation()}
        style={{
          maxHeight: '85vh',
          paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))',
        }}
      >
        {/* Handle Bar */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-12 h-1 bg-gray-700 rounded-full" />
        </div>
        {/* Drag Overlay */}
        {isDragging && (
          <div className="absolute inset-0 bg-purple-500/10 backdrop-blur-md rounded-t-[32px] flex flex-col items-center justify-center z-10 border-2 border-dashed border-purple-500 animate-pulse">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center mb-5 shadow-lg shadow-purple-500/50">
              <Upload className="w-10 h-10 text-white" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">Drop images here</h3>
            <p className="text-gray-300 text-center">Release to add photos to your message</p>
          </div>
        )}

        {/* Header */}
        <div className="px-6 pb-4">
          <div className="flex items-center justify-between">
            <button
              onClick={onClose}
              disabled={uploading}
              className="w-10 h-10 rounded-full bg-gray-800 hover:bg-gray-700 flex items-center justify-center transition-all disabled:opacity-50"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
            <div className="flex-1 text-center">
              <h3 className="text-lg font-bold text-white">
                {uploading ? 'Processing...' : 'Add Images'}
              </h3>
              {!uploading && (
                <p className="text-sm text-gray-400 mt-0.5">Upload photos or drag & drop</p>
              )}
            </div>
            <div className="w-10" /> {/* Spacer for balance */}
          </div>
        </div>

        {/* Processing Progress */}
        {(uploading || processedFiles > 0) && (
          <div className="mb-6 p-4 bg-gradient-to-br from-purple-500/5 to-pink-500/5 rounded-2xl border border-purple-500/20">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center">
                {compressing ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <CheckCircle className="w-4 h-4 text-white" />
                )}
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-white">
                  {compressing ? 'Optimizing images...' : 'Processing complete'}
                </h4>
                {uploadProgress && (
                  <p className="text-xs text-gray-400">
                    File {uploadProgress.current} of {uploadProgress.total}
                  </p>
                )}
              </div>
            </div>
            {uploadProgress && (
              <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-purple-600 to-pink-600 rounded-full transition-all duration-300"
                  style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                />
              </div>
            )}
          </div>
        )}

        {/* Content Area */}
        <div className="px-6 overflow-y-auto" style={{ maxHeight: 'calc(85vh - 180px)' }}>
          {/* Upload Options */}
          {selectedFiles.length === 0 && (
            <div className="grid grid-cols-2 gap-3 mb-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif"
                multiple
                onChange={(e) => handleFileSelect(e.target.files)}
                className="hidden"
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                capture="environment"
                onChange={(e) => handleFileSelect(e.target.files)}
                className="hidden"
              />

              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center gap-3 p-6 bg-gray-800/50 hover:bg-gray-800 border border-gray-700 rounded-2xl transition-all min-h-[140px]"
              >
                <div className="w-12 h-12 rounded-full bg-purple-500/10 flex items-center justify-center">
                  <Upload className="w-6 h-6 text-purple-400" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-white">Gallery</p>
                  <p className="text-xs text-gray-400 mt-1">Choose photos</p>
                </div>
              </button>

              <button
                onClick={() => cameraInputRef.current?.click()}
                className="flex flex-col items-center justify-center gap-3 p-6 bg-gray-800/50 hover:bg-gray-800 border border-gray-700 rounded-2xl transition-all min-h-[140px]"
              >
                <div className="w-12 h-12 rounded-full bg-purple-500/10 flex items-center justify-center">
                  <Camera className="w-6 h-6 text-purple-400" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-white">Camera</p>
                  <p className="text-xs text-gray-400 mt-1">Take photo</p>
                </div>
              </button>
            </div>
          )}

        {/* Preview Grid */}
        {previews.length > 0 && (
          <>
            <div className="grid grid-cols-3 gap-3 mb-4">
              {previews.map((preview, index) => (
                <div
                  key={index}
                  className="relative aspect-square rounded-xl overflow-hidden border-2 border-purple-500/50 shadow-lg shadow-purple-500/20 group hover:border-purple-400 transition-all"
                >
                  <img
                    src={preview}
                    alt={`Preview ${index + 1}`}
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                  />
                  <button
                    onClick={() => removeImage(index)}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/80 hover:bg-black border border-white/20 flex items-center justify-center transition-all opacity-0 group-hover:opacity-100"
                  >
                    <X className="w-3.5 h-3.5 text-white" />
                  </button>
                </div>
              ))}
            </div>

            {/* Info / Error */}
            {error ? (
              <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 rounded-xl mb-4 border border-red-500/30">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                <p className="text-xs text-red-400 font-medium">{error}</p>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-4 py-3 bg-gradient-to-br from-purple-500/5 to-pink-500/5 rounded-xl mb-4 border border-purple-500/20">
                <div className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-purple-500 to-pink-500" />
                <p className="text-xs text-gray-300 font-medium">
                  {selectedFiles.length} of {maxImages} images selected
                  {selectedFiles.some(f => f.size > 5 * 1024 * 1024) && ' • Large photos will be compressed'}
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setSelectedFiles([]);
                  setPreviews([]);
                  setError(null);
                }}
                disabled={uploading}
                className="flex-1 px-5 py-3 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Clear
              </button>
              <button
                onClick={handleConfirm}
                disabled={uploading}
                className={`flex-[2] px-5 py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                  uploading
                    ? 'bg-gray-800 text-gray-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white shadow-lg shadow-purple-500/30'
                }`}
              >
                {uploading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
                    {compressing ? 'Compressing...' : 'Uploading...'}
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Add to Message
                  </>
                )}
              </button>
            </div>
          </>
        )}

          {/* Help Text */}
          <div className="mt-4 p-3 bg-purple-500/5 rounded-xl border border-purple-500/20">
            <p className="text-xs text-gray-400">
              💡 <span className="text-gray-300">Dash can analyze images</span> for homework help, diagrams, and more
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
