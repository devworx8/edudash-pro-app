import type { PDFBranding } from '@/lib/config/pdfConfig';

export type DocumentType =
  | 'report'
  | 'letter'
  | 'invoice'
  | 'study_guide'
  | 'lesson_plan'
  | 'progress_report'
  | 'assessment'
  | 'certificate'
  | 'newsletter'
  | 'worksheet'
  | 'general';

export interface ContentSection {
  id: string;
  title: string;
  markdown: string;
  images?: Array<{
    uri: string;
    alt?: string;
    width?: number;
    height?: number;
    caption?: string;
  }>;
  charts?: Array<{
    type: 'bar' | 'line' | 'pie';
    data: { labels: string[]; values: number[]; colors?: string[] };
    title?: string;
  }>;
  tables?: Array<{
    headers: string[];
    rows: string[][];
    caption?: string;
  }>;
}

export interface BrandingOptions {
  logoUri?: string;
  watermarkText?: string;
  headerHtmlSafe?: string;
  footerHtmlSafe?: string;
  primaryColor?: string;
  secondaryColor?: string;
  fontFamily?: string;
}

export interface DashPDFOptions {
  theme?: 'professional' | 'colorful' | 'minimalist';
  paperSize?: 'A4' | 'Letter';
  orientation?: 'portrait' | 'landscape';
  enablePageNumbers?: boolean;
  enableWatermark?: boolean;
  includeTableOfContents?: boolean;
  accessibilityEnabled?: boolean;
  branding?: BrandingOptions;
}

export interface ChartData {
  type: 'bar' | 'line' | 'pie';
  data: {
    labels: string[];
    values: number[];
    colors?: string[];
  };
  title?: string;
}

export interface TableData {
  headers: string[];
  rows: string[][];
  caption?: string;
}

export interface PDFGenerationRequest {
  type: DocumentType;
  title: string;
  prompt?: string;
  sections?: ContentSection[];
  data?: Record<string, any>;
  assets?: Array<{ uri: string; name: string; type: string }>;
  preferencesOverride?: Partial<DashPDFOptions>;
  templateId?: string;
  includeCharts?: boolean;
  includeTables?: boolean;
}

export interface PDFGenerationResult {
  success: boolean;
  uri?: string;
  filename?: string;
  storagePath?: string;
  pageCount?: number;
  warnings?: string[];
  error?: string;
}

export interface UserPDFPreferences {
  id?: string;
  userId: string;
  organizationId?: string;
  defaultTheme?: 'professional' | 'colorful' | 'minimalist';
  defaultFont?: string;
  defaultLayout?: Record<string, any>;
  defaultBranding?: BrandingOptions;
  headerHtmlSafe?: string;
  footerHtmlSafe?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CustomTemplate {
  id?: string;
  ownerUserId: string;
  organizationId?: string;
  name: string;
  description?: string;
  documentType: DocumentType;
  templateHtml: string;
  inputSchema?: Record<string, any>;
  thumbnailUrl?: string;
  isOrgShared?: boolean;
  isPublic?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface DocumentSpec {
  docType: DocumentType;
  title: string;
  sections: ContentSection[];
  images: Array<{ uri: string; alt: string; caption?: string }>;
  charts?: ChartData[];
  tables?: TableData[];
  dataRequirements?: string[];
  tone?: string;
  audience?: string;
  brandingHints?: BrandingOptions;
  studentId?: string;
  classId?: string;
}

export interface KnowledgeBaseItem {
  id: string;
  title: string;
  snippet?: string;
  content?: string;
  uri?: string;
  type: 'document' | 'image' | 'lesson' | 'student' | 'class' | 'assignment' | 'entity';
  confidence?: number;
  relevance?: number;
  source?: string;
  metadata?: Record<string, any>;
}

export type ProgressPhase = 'parse' | 'retrieve' | 'compose' | 'render' | 'upload';
export type ProgressCallback = (phase: ProgressPhase, progress: number, message?: string) => void;

export interface DashPDFResolvedOptions {
  theme: 'professional' | 'colorful' | 'minimalist';
  paperSize: 'A4' | 'Letter';
  orientation: 'portrait' | 'landscape';
  enablePageNumbers: boolean;
  enableWatermark: boolean;
  includeTableOfContents: boolean;
  accessibilityEnabled: boolean;
  branding: BrandingOptions | PDFBranding;
}
