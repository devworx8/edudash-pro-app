'use client';

import { useState, useRef } from 'react';
import { Upload, X, FileText, Image as ImageIcon, Loader2, CheckCircle2 } from 'lucide-react';
import { useCreatePOPUpload, formatFileSize } from '@/lib/hooks/parent/usePOPUploads';

interface Child {
  id: string;
  first_name: string;
  last_name: string;
  student_code?: string; // Unique payment reference
}

interface POPUploadFormProps {
  linkedChildren: Child[];
  onSuccess?: () => void;
  onCancel?: () => void;
  defaultChildId?: string;
  defaultAmount?: number;
  defaultDescription?: string;
  defaultFeeId?: string;
  defaultPaymentForMonth?: string;
}

const normalizeMonthFieldValue = (value?: string | null): string => {
  if (!value) return '';
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed.slice(0, 7);
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return '';
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

export function POPUploadForm({
  linkedChildren,
  onSuccess,
  onCancel,
  defaultChildId,
  defaultAmount,
  defaultDescription,
  defaultFeeId,
  defaultPaymentForMonth,
}: POPUploadFormProps) {
  const { upload, uploading, error, success, reset } = useCreatePOPUpload();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const initialChildId = (defaultChildId && linkedChildren.some((child) => child.id === defaultChildId))
    ? defaultChildId
    : linkedChildren[0]?.id || '';
  const initialAmount = defaultAmount && defaultAmount > 0 ? defaultAmount.toFixed(2) : '';
  
  // Form state
  const [selectedChild, setSelectedChild] = useState<string>(initialChildId);
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentAmount, setPaymentAmount] = useState(initialAmount);
  const [paymentMethod, setPaymentMethod] = useState('EFT');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentForMonth, setPaymentForMonth] = useState(
    normalizeMonthFieldValue(defaultPaymentForMonth) || new Date().toISOString().slice(0, 7)
  );
  const [description, setDescription] = useState(defaultDescription ?? '');
  const [feeId] = useState(defaultFeeId ?? '');
  const isUniformPayment = feeId.startsWith('uniform:');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const normalizeMonthToISO = (value: string): string => {
    const monthField = normalizeMonthFieldValue(value);
    return monthField ? `${monthField}-01` : '';
  };

  const handleFileSelect = (file: File) => {
    setValidationError(null);
    
    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      setValidationError('Only PDF and image files (JPG, PNG) are allowed');
      return;
    }
    
    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      setValidationError('File size must be less than 10MB');
      return;
    }
    
    setSelectedFile(file);
    reset();
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    
    if (!selectedFile || !selectedChild) {
      setValidationError('Please select a file and child');
      return;
    }

    const normalizedAmount = paymentAmount.replace(/,/g, '.').replace(/[^\d.]/g, '');
    const amountValue = Number.parseFloat(normalizedAmount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      setValidationError('Please enter the amount paid');
      return;
    }

    const normalizedDate = paymentDate?.trim();
    if (!normalizedDate) {
      setValidationError('Please select the payment date');
      return;
    }
    const isoDate = /^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)
      ? normalizedDate
      : (() => {
          const parsed = new Date(normalizedDate);
          if (Number.isNaN(parsed.getTime())) return '';
          return parsed.toISOString().split('T')[0];
        })();
    if (!isoDate) {
      setValidationError('Payment date is invalid');
      return;
    }
    const monthIso = normalizeMonthToISO(paymentForMonth || '');
    if (!monthIso) {
      setValidationError('Please select the billing month for this payment');
      return;
    }
    
    // Get the selected child's student_code for the payment reference
    const childData = linkedChildren.find(c => c.id === selectedChild);
    const studentCode = childData?.student_code || selectedChild.slice(0, 8).toUpperCase();
    const normalizedDescription = description.trim();
    const fallbackDescription = feeId.startsWith('uniform:')
      ? 'Uniform'
      : (feeId ? 'School Fees' : '');
    const finalDescription = normalizedDescription || fallbackDescription || undefined;
    
    const finalPaymentDate = isoDate || new Date().toISOString().split('T')[0];
    const finalPaymentForMonth = monthIso;

    const result = await upload({
      student_id: selectedChild,
      upload_type: 'proof_of_payment',
      title: `Payment - ${studentCode}${paymentReference ? ` (${paymentReference})` : ''}`,
      description: finalDescription,
      file: selectedFile,
      payment_amount: amountValue,
      payment_method: paymentMethod,
      payment_date: finalPaymentDate,
      payment_for_month: finalPaymentForMonth,
      payment_reference: studentCode, // Always use the child's unique code
    });
    
    if (result) {
      onSuccess?.();
    }
  };

  const removeFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    reset();
  };

  const getFileIcon = (type: string) => {
    if (type === 'application/pdf') {
      return <FileText size={24} style={{ color: '#ef4444' }} />;
    }
    return <ImageIcon size={24} style={{ color: '#3b82f6' }} />;
  };

  if (success) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 24px' }}>
        <CheckCircle2 size={64} style={{ color: 'var(--success)', margin: '0 auto 16px' }} />
        <h3 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Upload Successful!</h3>
        <p style={{ color: 'var(--muted)', marginBottom: 24 }}>
          Your proof of payment has been submitted and is pending review.
        </p>
        <button
          onClick={onSuccess}
          className="btn btnPrimary"
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* Child Selection */}
      {linkedChildren.length > 1 && (
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: 8, fontSize: 14 }}>
            For which child?
          </label>
          <select
            value={selectedChild}
            onChange={(e) => setSelectedChild(e.target.value)}
            className="input"
            style={{ width: '100%' }}
          >
            {linkedChildren.map((child) => (
              <option key={child.id} value={child.id}>
                {child.first_name} {child.last_name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Child Payment Reference - Non-editable */}
      {selectedChild && (
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: 8, fontSize: 14 }}>
            Payment Reference <span style={{ color: 'var(--primary)', fontWeight: 600 }}>(Use when paying)</span>
          </label>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 12,
            padding: '14px 16px',
            background: 'rgba(124, 58, 237, 0.1)',
            borderRadius: 8,
            border: '1px solid rgba(124, 58, 237, 0.3)',
          }}>
            <FileText className="w-5 h-5" style={{ color: 'var(--primary)' }} />
            <span style={{ flex: 1, fontSize: 18, fontWeight: 700, color: 'var(--primary)' }}>
              {linkedChildren.find(c => c.id === selectedChild)?.student_code || selectedChild.slice(0, 8).toUpperCase()}
            </span>
            <span style={{ 
              padding: '4px 8px', 
              background: 'var(--primary)', 
              color: 'white', 
              borderRadius: 6, 
              fontSize: 10, 
              fontWeight: 600 
            }}>
              Required
            </span>
          </div>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6, fontStyle: 'italic' }}>
            Always include this reference when making bank payments
          </p>
        </div>
      )}

      {/* Bank Transaction Reference */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: 8, fontSize: 14 }}>
          Bank Transaction Reference <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(Optional)</span>
        </label>
        <input
          type="text"
          value={paymentReference}
          onChange={(e) => setPaymentReference(e.target.value)}
          placeholder="e.g., TXN123456"
          className="input"
          style={{ width: '100%' }}
        />
      </div>

      {/* Payment Amount */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: 8, fontSize: 14 }}>
          Amount Paid <span style={{ color: 'var(--primary)', fontWeight: 600 }}>*</span>
        </label>
        <div style={{ position: 'relative' }}>
          <span style={{ 
            position: 'absolute', 
            left: 12, 
            top: '50%', 
            transform: 'translateY(-50%)',
            color: 'var(--muted)'
          }}>R</span>
          <input
            type="number"
            value={paymentAmount}
            onChange={(e) => setPaymentAmount(e.target.value)}
            placeholder="0.00"
            className="input"
            style={{ width: '100%', paddingLeft: 28 }}
            step="0.01"
            min="0"
          />
        </div>
      </div>

      {/* Payment Method, Date & Month */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 20 }}>
        <div>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: 8, fontSize: 14 }}>
            Payment Method
          </label>
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            className="input"
            style={{ width: '100%' }}
          >
            <option value="EFT">EFT / Bank Transfer</option>
            <option value="Cash">Cash</option>
            <option value="Card">Card Payment</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: 8, fontSize: 14 }}>
            Payment Date <span style={{ color: 'var(--primary)', fontWeight: 600 }}>*</span>
          </label>
          <input
            type="date"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
            className="input"
            style={{ width: '100%' }}
            max={new Date().toISOString().split('T')[0]}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: 8, fontSize: 14 }}>
            Billing Month <span style={{ color: 'var(--primary)', fontWeight: 600 }}>*</span>
          </label>
          <input
            type="month"
            value={paymentForMonth}
            onChange={(e) => setPaymentForMonth(e.target.value)}
            className="input"
            style={{ width: '100%' }}
          />
          <p style={{ marginTop: 6, marginBottom: 0, fontSize: 12, color: 'var(--muted)' }}>
            Required for monthly fee matching.
          </p>
        </div>
      </div>

      {/* Description */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: 8, fontSize: 14 }}>
          Notes <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(Optional)</span>
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Any additional notes about this payment..."
          className="input"
          style={{ width: '100%', minHeight: 80, resize: 'vertical' }}
        />
      </div>

      {/* File Upload Area */}
      <div style={{ marginBottom: 24 }}>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: 8, fontSize: 14 }}>
          Upload Proof of Payment *
        </label>
        
        {!selectedFile ? (
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragActive ? 'var(--primary)' : 'var(--border)'}`,
              borderRadius: 12,
              padding: 40,
              textAlign: 'center',
              cursor: 'pointer',
              background: dragActive ? 'rgba(124, 58, 237, 0.05)' : 'var(--surface)',
              transition: 'all 0.2s',
            }}
          >
            <Upload size={40} style={{ color: 'var(--primary)', margin: '0 auto 16px' }} />
            <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
              Click to upload or drag and drop
            </p>
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>
              PDF, JPG or PNG (max 10MB)
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
              style={{ display: 'none' }}
            />
          </div>
        ) : (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: 16,
            background: 'var(--surface)',
            borderRadius: 12,
            border: '1px solid var(--border)',
          }}>
            {getFileIcon(selectedFile.type)}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ 
                fontWeight: 600, 
                fontSize: 14,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {selectedFile.name}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                {formatFileSize(selectedFile.size)}
              </div>
            </div>
            <button
              type="button"
              onClick={removeFile}
              style={{
                padding: 8,
                background: 'rgba(239, 68, 68, 0.1)',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              <X size={16} style={{ color: '#ef4444' }} />
            </button>
          </div>
        )}
      </div>

      {/* Error Message */}
      {(error || validationError) && (
        <div style={{
          padding: 12,
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: 8,
          marginBottom: 20,
          display: 'flex',
          alignItems: 'start',
          gap: 8,
        }}>
          <X size={16} style={{ color: '#ef4444', flexShrink: 0, marginTop: 2 }} />
          <p style={{ fontSize: 14, color: '#ef4444', margin: 0 }}>{validationError || error}</p>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 12 }}>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="btn btnSecondary"
            style={{ flex: 1 }}
            disabled={uploading}
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          className="btn btnPrimary"
          style={{ 
            flex: 1, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            gap: 8,
            opacity: uploading || !selectedFile ? 0.6 : 1,
            cursor: uploading || !selectedFile ? 'not-allowed' : 'pointer',
          }}
          disabled={uploading || !selectedFile}
        >
          {uploading && <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />}
          {uploading ? 'Uploading...' : 'Submit Proof of Payment'}
        </button>
      </div>
    </form>
  );
}
