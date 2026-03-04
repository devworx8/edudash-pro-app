import type { SouthAfricanLanguage } from '@/components/exam-prep/types';

export type Status = 'queued' | 'processing' | 'ready' | 'error' | 'paused_rate_limited';

export type StudyMaterial = {
  id: string;
  name: string;
  mimeType: string;
  status: Status;
  summary?: string;
  error?: string;
  sourceUri?: string;
  sourceSize?: number;
  attempts: number;
};

export type StudyMaterialInputFile = {
  uri: string;
  name: string;
  mimeType: string;
  size?: number;
  webFile?: unknown;
};

export type PdfSplitProgress = {
  fileName: string;
  totalParts: number;
  completedParts: number;
  partIds: string[];
};

export type UpdateStudyMaterialItem = (id: string, patch: Partial<StudyMaterial>) => void;
export type EnqueueStudyMaterialFiles = (files: StudyMaterialInputFile[]) => string[];
export type QueuePauseSetter = (value: number | null) => void;
export type SelectedLanguageName = SouthAfricanLanguage;

export const STORAGE_KEY = 'exam-prep.study-material.pipeline.v1';
export const BASE_RETRY_MS = 4000;
export const MAX_RETRY_MS = 60000;
export const PART_COOLDOWN_MS = 900;
