/**
 * Chat Types
 * WARP.md compliant: ≤100 lines
 * 
 * Shared TypeScript types for chat components
 */

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  images?: Array<{ data: string; media_type: string; preview?: string }>;
  audio?: { data: string; media_type: string; duration?: number };
  meta?: {
    tokensUsed?: number;
    model?: string;
    suggested_actions?: string[];
    plan_mode?: Record<string, unknown>;
    resolution_status?: 'resolved' | 'needs_clarification' | 'escalated' | string;
    confidence_score?: number;
    escalation_offer?: boolean;
    resolution_meta?: Record<string, unknown>;
    ocr?: {
      extracted_text?: string;
      confidence?: number;
      document_type?: 'homework' | 'document' | 'handwriting' | string;
      analysis?: string;
      unclear_spans?: string[];
    } | null;
  };
  isError?: boolean;
}

export interface SelectedImage {
  data: string;
  media_type: string;
  preview: string;
  url?: string;
}

export interface ExamContext {
  grade?: string;
  subject?: string;
  topics?: string[];
}
