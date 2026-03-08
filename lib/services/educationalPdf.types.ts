import type { Assignment } from '@/lib/models/Assignment';
import type { PDFBranding } from '@/lib/config/pdfConfig';

export type TextPDFPaperSize = 'A4' | 'Letter';
export type TextPDFOrientation = 'portrait' | 'landscape';

export interface TextPDFOptions {
  paperSize?: TextPDFPaperSize;
  orientation?: TextPDFOrientation;
}

export interface WorksheetOptions {
  title?: string;
  studentName?: string;
  dateCreated?: string;
  includeAnswerKey?: boolean;
  difficulty: 'easy' | 'medium' | 'hard';
  ageGroup: '3-4' | '4-5' | '5-6' | '6-7' | '7-8';
  colorMode: 'color' | 'blackwhite';
  paperSize: 'A4' | 'Letter';
  orientation: 'portrait' | 'landscape';
}

export interface MathWorksheetData {
  type: 'addition' | 'subtraction' | 'multiplication' | 'division' | 'mixed';
  problemCount: number;
  numberRange: { min: number; max: number };
  showHints?: boolean;
  includeImages?: boolean;
}

export interface ReadingWorksheetData {
  type: 'comprehension' | 'vocabulary' | 'phonics' | 'sight-words';
  content: string;
  questions: Array<{
    question: string;
    type: 'multiple-choice' | 'short-answer' | 'true-false';
    options?: string[];
    correctAnswer?: string;
  }>;
}

export interface ActivitySheetData {
  type: 'coloring' | 'tracing' | 'matching' | 'puzzle' | 'creative';
  theme: string;
  instructions: string;
  materials?: string[];
}

export type WorksheetType = 'math' | 'reading' | 'activity' | 'assignment' | 'practice';

export interface GeneratePDFOptions {
  worksheetType: WorksheetType;
  data: MathWorksheetData | ReadingWorksheetData | ActivitySheetData | Assignment;
  options: WorksheetOptions;
}

export interface EnhancedPDFOptions {
  theme?: 'professional' | 'colorful' | 'minimalist';
  branding?: PDFBranding;
  paperSize?: 'A4' | 'Letter';
  orientation?: 'portrait' | 'landscape';
  enablePageNumbers?: boolean;
  enableWatermark?: boolean;
  enableTableOfContents?: boolean;
}

export interface PDFComponent {
  type: string;
  data: any;
  options?: any;
}

export interface ChartData {
  labels: string[];
  values: number[];
  colors?: string[];
}

export interface TableData {
  headers: string[];
  rows: string[][];
}

export interface CalloutOptions {
  kind: 'info' | 'tip' | 'warning' | 'objective';
  title?: string;
  content: string;
  icon?: string;
}

export interface TimelineStep {
  title: string;
  description: string;
  duration?: string;
}

export interface RubricCriterion {
  name: string;
  levels: { label: string; description: string; points: number }[];
}
