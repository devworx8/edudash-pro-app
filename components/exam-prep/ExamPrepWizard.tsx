/**
 * Exam Prep Wizard (React Native)
 *
 * Feature component kept outside route file so screens remain thin per WARP.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { ExamPrepReviewStep } from '@/components/exam-prep/ExamPrepWizardReviewStep';
import {
  ExamPrepGradeStep,
  ExamPrepSubjectStep,
  ExamPrepTypeStep,
} from '@/components/exam-prep/ExamPrepWizardSteps';
import {
  GRADES,
  LANGUAGE_OPTIONS,
  SUBJECTS_BY_PHASE,
  getPhaseFromGrade,
  type ExamContextSummary,
  type ExamGenerationResponse,
  type SouthAfricanLanguage,
} from '@/components/exam-prep/types';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useTheme } from '@/contexts/ThemeContext';
import { hasCapability, getRequiredTier, type Tier } from '@/lib/ai/capabilities';
import { getCapabilityTier, normalizeTierName } from '@/lib/tiers';
import { assertSupabase } from '@/lib/supabase';
import { stashExamGenerationDraft } from '@/lib/exam-prep/generationDraftStore';
import { clampPercent } from '@/lib/progress/clampPercent';
import {
  buildExamGenerationHref,
  buildExamRouteParams,
  getSubjectCategory,
  toSafeParam,
  type SubjectCategory,
  type WizardStep,
} from '@/components/exam-prep/examPrepWizard.helpers';
import { examPrepWizardStyles as styles } from '@/components/exam-prep/examPrepWizard.styles';
import { splitPdfIntoSinglePages } from '@/components/exam-prep/pdfSplit';
import { QuotaRingWithStatus } from '@/components/ui/CircularQuotaRing';
import { useAIUserLimits } from '@/hooks/useAI';

const MAX_MATERIAL_SIZE_BYTES = 8 * 1024 * 1024;
const MAX_MATERIAL_SIZE_MB = Math.round(MAX_MATERIAL_SIZE_BYTES / (1024 * 1024));
const MATERIAL_OCR_RETRIES = 5;
const MATERIAL_OCR_RETRY_BASE_MS = 4000;
const MATERIAL_OCR_RETRY_MAX_MS = 60000;
const MATERIAL_SPLIT_PART_COOLDOWN_MS = 900;

function formatSizeMB(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0';
  return (bytes / (1024 * 1024)).toFixed(1);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type FunctionInvokeErrorInfo = {
  status?: number;
  code?: string;
  message: string;
  rateLimited: boolean;
  quotaExceeded: boolean;
  retryAfterSeconds?: number;
};

async function parseFunctionInvokeError(error: unknown, fallbackMessage: string): Promise<FunctionInvokeErrorInfo> {
  const err = (error || {}) as Record<string, unknown>;
  const context = (err.context || null) as
    | {
        status?: number;
        headers?: { get?: (name: string) => string | null };
        text?: () => Promise<string>;
      }
    | null;

  const rawStatus = err.status || context?.status;
  const status = Number.isFinite(Number(rawStatus)) ? Number(rawStatus) : undefined;

  let payloadCode: string | undefined;
  let payloadMessage: string | undefined;

  if (context && typeof context.text === 'function') {
    try {
      const rawText = await context.text();
      if (rawText) {
        const parsed = JSON.parse(rawText) as Record<string, unknown>;
        if (typeof parsed.error === 'string') payloadCode = parsed.error;
        if (typeof parsed.message === 'string') payloadMessage = parsed.message;
      }
    } catch {
      // Ignore JSON parse/body read failures and fall back to generic error text.
    }
  }

  const errorMessage =
    payloadMessage ||
    (typeof err.message === 'string' ? err.message : '') ||
    fallbackMessage;
  const errorCode =
    payloadCode ||
    (typeof err.code === 'string' ? err.code : undefined);

  const retryAfterHeader = context?.headers?.get?.('retry-after') || context?.headers?.get?.('Retry-After');
  const retryAfterSeconds = retryAfterHeader ? Number.parseInt(retryAfterHeader, 10) : undefined;
  const normalized = `${errorCode || ''} ${errorMessage}`.toLowerCase();
  const quotaExceeded =
    errorCode === 'quota_exceeded' ||
    normalized.includes('quota exceeded') ||
    normalized.includes('billing period');
  const rateLimited =
    status === 429 ||
    errorCode === 'rate_limited' ||
    normalized.includes('rate limit') ||
    normalized.includes('too many requests');

  return {
    status,
    code: errorCode,
    message: errorMessage,
    rateLimited,
    quotaExceeded,
    retryAfterSeconds: Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : undefined,
  };
}

function getMaterialAIErrorMessage(info: FunctionInvokeErrorInfo): string {
  if (info.quotaExceeded) {
    return 'AI usage quota reached for this billing period. Please upgrade or wait for quota reset before analyzing more study material.';
  }
  if (info.rateLimited) {
    if (info.retryAfterSeconds && info.retryAfterSeconds > 0) {
      return `AI provider is busy right now (not your account quota). Retry in about ${info.retryAfterSeconds} seconds, then tap Retry.`;
    }
    return 'AI provider is temporarily rate-limited (not your account quota). Retry in about a minute, then tap Retry.';
  }
  if (info.message.includes('Edge Function returned a non-2xx')) {
    return 'Study material analysis failed. Please retry in a moment.';
  }
  return info.message || 'Could not analyze study material.';
}

function isMaterialRateLimitedMessage(message: string): boolean {
  const normalized = String(message || '').toLowerCase();
  return (
    normalized.includes('rate-limited') ||
    normalized.includes('busy right now') ||
    normalized.includes('too many requests') ||
    normalized.includes('retry in about')
  );
}

function stripStudyLinePrefix(line: string): string {
  return line.replace(/^\(?\d+\)?[.)\-:\s]+/, '').trim();
}

function isStudyMetaLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (trimmed === '---') return true;
  if (/^\d{6,}\.(?:jpg|jpeg|png|webp|pdf)$/i.test(trimmed)) return true;
  if (/^source:\s*/i.test(trimmed)) return true;
  if (/^page\s+\d+$/i.test(trimmed)) return true;
  const normalized = stripStudyLinePrefix(trimmed).toLowerCase();
  return [
    'topics to revise',
    'key facts/formulas',
    'common mistakes',
    'suggested question angles',
  ].includes(normalized);
}

function sanitizeMaterialSummary(rawSummary: string): string {
  const lines = String(rawSummary || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) =>
      line
        .replace(/\((?:teacher|class|translation|english)\s*:[^)]*\)/gi, '')
        .replace(/\[(?:teacher|class|translation|english)\s*:[^\]]*\]/gi, '')
        .trim(),
    )
    .map((line) => stripStudyLinePrefix(line))
    .map((line) => line.replace(/^[-*•]\s*/, '').replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .filter((line) => !isStudyMetaLine(line));

  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const key = line.toLowerCase();
    if (key.length < 4 || seen.has(key)) continue;
    seen.add(key);
    deduped.push(line);
  }

  return deduped.join('\n').slice(0, 2400).trim();
}

function toQuotaMap(input: unknown): Record<string, number> {
  if (!input || typeof input !== 'object') return {};
  const map: Record<string, number> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) continue;
    map[key] = Math.max(0, numeric);
  }
  return map;
}

function getFirstQuotaValue(
  map: Record<string, number>,
  keys: string[],
): number {
  for (const key of keys) {
    const value = map[key];
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

type StudyMaterial = {
  id: string;
  name: string;
  mimeType: string;
  summary?: string;
  status: 'processing' | 'ready' | 'error';
  error?: string;
  sourceUri?: string;
  sourceSize?: number;
};

type StudyMaterialInputFile = {
  uri: string;
  name: string;
  mimeType: string;
  size?: number;
};

type PdfSplitProgress = {
  fileName: string;
  totalParts: number;
  completedParts: number;
};

type MaterialProcessResult = {
  ok: boolean;
  rateLimited: boolean;
  message?: string;
};

export function ExamPrepWizard(): React.ReactElement {
  const { theme, isDark } = useTheme();
  const { tier } = useSubscription();
  const params = useLocalSearchParams<{
    grade?: string;
    childName?: string;
    studentId?: string;
    classId?: string;
    schoolId?: string;
  }>();

  const gradeParam = toSafeParam(params.grade);
  const childName = toSafeParam(params.childName);
  const studentId = toSafeParam(params.studentId);
  const classId = toSafeParam(params.classId);
  const schoolId = toSafeParam(params.schoolId);

  const hasPrefilledGrade = !!(gradeParam && GRADES.some((grade) => grade.value === gradeParam));

  const [selectedGrade, setSelectedGrade] = useState<string>(hasPrefilledGrade ? gradeParam! : 'grade_4');
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [selectedExamType, setSelectedExamType] = useState<string>('practice_test');
  const [selectedLanguage, setSelectedLanguage] = useState<SouthAfricanLanguage>('en-ZA');
  const [step, setStep] = useState<WizardStep>(hasPrefilledGrade ? 'subject' : 'grade');

  const [subjectSearch, setSubjectSearch] = useState('');
  const [subjectCategory, setSubjectCategory] = useState<SubjectCategory>('all');

  const [useTeacherContext, setUseTeacherContext] = useState(true);
  const [contextPreview, setContextPreview] = useState<ExamContextSummary | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);
  const [customPromptText, setCustomPromptText] = useState('');
  const [studyMaterials, setStudyMaterials] = useState<StudyMaterial[]>([]);
  const [pdfSplitProgress, setPdfSplitProgress] = useState<PdfSplitProgress | null>(null);
  const [materialSelectionBusy, setMaterialSelectionBusy] = useState(false);
  const contextRequestSeqRef = useRef(0);

  const phase = getPhaseFromGrade(selectedGrade);
  const subjects = SUBJECTS_BY_PHASE[phase] || [];
  const gradeInfo = GRADES.find((grade) => grade.value === selectedGrade);
  const tierForCaps: Tier = getCapabilityTier(normalizeTierName(tier || 'free'));
  const canUseExamPrep = hasCapability(tierForCaps, 'exam.practice');
  const requiredExamTier = getRequiredTier('exam.practice');
  const { data: aiLimits } = useAIUserLimits();
  const quotaMap = useMemo(() => toQuotaMap((aiLimits as any)?.quotas), [aiLimits]);
  const usedMap = useMemo(
    () => toQuotaMap((aiLimits as any)?.used ?? (aiLimits as any)?.current_usage),
    [aiLimits],
  );
  const examQuotaKeys = useMemo(
    () => ['exam_generation', 'grading_assistance', 'lesson_generation'],
    [],
  );
  const examQuotaLimit = useMemo(
    () => getFirstQuotaValue(quotaMap, examQuotaKeys),
    [quotaMap, examQuotaKeys],
  );
  const examQuotaUsed = useMemo(
    () => getFirstQuotaValue(usedMap, examQuotaKeys),
    [usedMap, examQuotaKeys],
  );
  const examQuotaRemaining = Math.max(0, examQuotaLimit - examQuotaUsed);
  const examQuotaPercent = examQuotaLimit > 0 ? (examQuotaUsed / examQuotaLimit) * 100 : 0;
  const examQuotaWarning = examQuotaLimit > 0 && examQuotaRemaining <= 0
    ? 'Monthly exam quota appears exhausted. Generation may fail until reset or upgrade.'
    : examQuotaLimit > 0 && examQuotaPercent >= 85
      ? `Exam quota is low: ${examQuotaRemaining} left this month.`
      : null;

  const selectedExamTypeLabel = useMemo(() => {
    const examType = selectedExamType === 'practice_test'
      ? 'Practice Test'
      : selectedExamType === 'revision_notes'
        ? 'Revision Notes'
        : selectedExamType === 'study_guide'
          ? 'Study Guide'
          : selectedExamType === 'flashcards'
            ? 'Flashcards'
            : selectedExamType;
    return examType;
  }, [selectedExamType]);

  const quickLaunchLabel = `${gradeInfo?.label || 'Selected Grade'} • ${selectedSubject || 'Afrikaans First Additional Language'}`;

  const filteredSubjects = useMemo(() => {
    const search = subjectSearch.trim().toLowerCase();

    return subjects.filter((subject) => {
      const category = getSubjectCategory(subject);
      const categoryMatches = subjectCategory === 'all' || category === subjectCategory;
      const searchMatches = !search || subject.toLowerCase().includes(search);
      return categoryMatches && searchMatches;
    });
  }, [subjects, subjectSearch, subjectCategory]);

  const hasMaterialProcessing = useMemo(
    () => studyMaterials.some((material) => material.status === 'processing'),
    [studyMaterials],
  );
  const isMaterialPipelineBusy = materialSelectionBusy || hasMaterialProcessing || Boolean(pdfSplitProgress);
  const materialPipelineLabel = useMemo(() => {
    if (materialSelectionBusy) return 'Preparing selected files...';
    if (pdfSplitProgress) return 'Uploading PDF pages...';
    if (hasMaterialProcessing) return 'Extracting study notes...';
    return 'Please wait...';
  }, [materialSelectionBusy, pdfSplitProgress, hasMaterialProcessing]);
  const splitProgressPercent = useMemo(() => {
    if (!pdfSplitProgress || pdfSplitProgress.totalParts <= 0) return 0;
    const raw = (pdfSplitProgress.completedParts / pdfSplitProgress.totalParts) * 100;
    if (pdfSplitProgress.completedParts <= 0) return 8;
    return Math.max(8, Math.min(100, raw));
  }, [pdfSplitProgress]);

  const readyMaterialSummaries = useMemo(
    () =>
      studyMaterials
        .filter((material) => material.status === 'ready' && material.summary)
        .map((material) => `Source: ${material.name}\n${material.summary}`),
    [studyMaterials],
  );

  const buildCustomPrompt = useCallback((): string | undefined => {
    const blocks: string[] = [];
    const trimmedPrompt = customPromptText.trim();
    const selectedLanguageName = LANGUAGE_OPTIONS[selectedLanguage] || selectedLanguage;
    if (trimmedPrompt) {
      blocks.push(`Additional learner requirements:\n${trimmedPrompt}`);
    }
    if (readyMaterialSummaries.length > 0) {
      blocks.push(
        `Study material extracted from uploaded images/PDFs:\n${readyMaterialSummaries.join('\n\n---\n\n')}`
      );
      if (selectedLanguage === 'en-ZA') {
        blocks.push(
          'When generated content includes non-English terminology, include plain English support cues for the learner.',
        );
      } else {
        blocks.push(
          `Keep ALL learner-facing content strictly in ${selectedLanguageName}. Do not include English translations in question text, options, instructions, or memorandum content.`,
        );
      }
    }

    if (blocks.length === 0) return undefined;
    return blocks.join('\n\n');
  }, [customPromptText, readyMaterialSummaries, selectedLanguage]);

  const updateStudyMaterial = useCallback((id: string, patch: Partial<StudyMaterial>) => {
    setStudyMaterials((prev) =>
      prev.map((material) => (material.id === id ? { ...material, ...patch } : material))
    );
  }, []);

  const summarizeStudyMaterial = useCallback(
    async (payload: { base64: string; mimeType: string; fileName: string }): Promise<string> => {
      const supabase = assertSupabase();
      const selectedLanguageName = LANGUAGE_OPTIONS[selectedLanguage] || selectedLanguage;
      for (let attempt = 0; attempt <= MATERIAL_OCR_RETRIES; attempt += 1) {
        const { data, error } = await supabase.functions.invoke('ai-proxy', {
          body: {
            scope: 'student',
            prefer_openai: true,
            // Keep OCR stable on projects where older quota mapping does not recognize image_analysis.
            service_type: 'chat_message',
            payload: {
              prompt: `Extract exam-prep context from ${payload.fileName}. Provide concise bullet points under: (1) Topics to revise, (2) Key facts/formulas, (3) Common mistakes, (4) Suggested question angles. Keep terms in the source language and add short clarifiers in ${selectedLanguageName} only when required for meaning.`,
              context:
                'You process learner study material for CAPS exam prep. Return plain text bullet points only. Keep it concise and practical.',
              images: [{ data: payload.base64, media_type: payload.mimeType }],
              ocr_mode: true,
              ocr_task: 'document',
              ocr_response_format: 'text',
            },
            stream: false,
            enable_tools: false,
            metadata: {
              source: 'exam_prep.wizard.material_ocr',
              file_name: payload.fileName,
            },
          },
        });

        if (error) {
          const parsedError = await parseFunctionInvokeError(
            error,
            'Failed to analyze study material.',
          );
          const canRetry =
            parsedError.rateLimited &&
            !parsedError.quotaExceeded &&
            attempt < MATERIAL_OCR_RETRIES;
          if (canRetry) {
            const retryDelayMsUncapped = parsedError.retryAfterSeconds
              ? parsedError.retryAfterSeconds * 1000
              : MATERIAL_OCR_RETRY_BASE_MS * Math.pow(2, attempt);
            const retryDelayMs = Math.min(MATERIAL_OCR_RETRY_MAX_MS, retryDelayMsUncapped);
            const jitterMs = Math.floor(Math.random() * 600);
            await sleep(retryDelayMs + jitterMs);
            continue;
          }
          throw new Error(getMaterialAIErrorMessage(parsedError));
        }

        const summary =
          typeof data === 'string'
            ? data.trim()
            : String(data?.content || data?.ocr?.analysis || '').trim();

        const cleanedSummary = sanitizeMaterialSummary(summary);
        if (!cleanedSummary) {
          throw new Error('No readable content detected in the selected file.');
        }

        return cleanedSummary;
      }
      throw new Error('Could not analyze study material.');
    },
    [selectedLanguage],
  );

  const analyzeStudyMaterialFile = useCallback(
    async (materialId: string, file: StudyMaterialInputFile): Promise<MaterialProcessResult> => {
      const safeName = file.name || `material-${Date.now()}`;
      updateStudyMaterial(materialId, {
        name: safeName,
        mimeType: file.mimeType,
        status: 'processing',
        error: undefined,
        sourceUri: file.uri,
        sourceSize: file.size,
      });

      try {
        const base64 = await FileSystem.readAsStringAsync(file.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const summary = await summarizeStudyMaterial({
          base64,
          mimeType: file.mimeType,
          fileName: safeName,
        });
        updateStudyMaterial(materialId, {
          status: 'ready',
          summary,
          error: undefined,
        });
        return { ok: true, rateLimited: false };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not process this study file.';
        const rateLimited = isMaterialRateLimitedMessage(message);
        updateStudyMaterial(materialId, {
          status: 'error',
          error: message,
        });
        if (message.toLowerCase().includes('quota') || rateLimited) {
          Alert.alert('Study material analysis unavailable', message);
        }
        return { ok: false, rateLimited, message };
      }
    },
    [summarizeStudyMaterial, updateStudyMaterial],
  );

  const processSingleStudyMaterial = useCallback(
    async (file: StudyMaterialInputFile): Promise<MaterialProcessResult> => {
      const safeName = file.name || `material-${Date.now()}`;
      const materialId = `material_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      setStudyMaterials((prev) => [
        ...prev,
        {
          id: materialId,
          name: safeName,
          mimeType: file.mimeType,
          status: 'processing',
          sourceUri: file.uri,
          sourceSize: file.size,
        },
      ]);

      return await analyzeStudyMaterialFile(materialId, {
        ...file,
        name: safeName,
      });
    },
    [analyzeStudyMaterialFile],
  );

  const processStudyMaterial = useCallback(
    async (file: StudyMaterialInputFile): Promise<MaterialProcessResult> => {
      const info = await FileSystem.getInfoAsync(file.uri);
      const sizeBytes =
        typeof file.size === 'number' && file.size > 0
          ? file.size
          : info.exists && typeof info.size === 'number'
          ? info.size
          : 0;

      if (file.mimeType === 'application/pdf') {
        try {
          Alert.alert(
            'Preparing PDF pages',
            `This PDF is ${formatSizeMB(sizeBytes)}MB. Dash will upload each page separately for more reliable extraction.`,
          );
          const parts = await splitPdfIntoSinglePages({
            uri: file.uri,
            name: file.name,
            sizeBytes,
          });

          if (parts.length === 0) {
            throw new Error('No PDF pages were created.');
          }

          setPdfSplitProgress({
            fileName: file.name,
            totalParts: parts.length,
            completedParts: 0,
          });

          for (let index = 0; index < parts.length; index += 1) {
            const part = parts[index];
            if (part.size > MAX_MATERIAL_SIZE_BYTES) {
              throw new Error(
                `Page ${index + 1} is still too large (${formatSizeMB(part.size)}MB). Please compress this PDF and retry.`,
              );
            }
            const result = await processSingleStudyMaterial(part);
            setPdfSplitProgress((prev) => (
              prev
                ? { ...prev, completedParts: Math.min(prev.totalParts, index + 1) }
                : prev
            ));
            if (result.rateLimited) {
              setPdfSplitProgress(null);
              Alert.alert(
                'Upload paused',
                `Processing paused at page ${index + 1} due to provider rate limits. Retry that page after about a minute to continue.`,
              );
              return result;
            }
            if (index < parts.length - 1) {
              await sleep(MATERIAL_SPLIT_PART_COOLDOWN_MS);
            }
          }

          setPdfSplitProgress(null);
          return { ok: true, rateLimited: false };
        } catch (error) {
          setPdfSplitProgress(null);
          const message =
            error instanceof Error
              ? error.message
              : 'Could not split this PDF automatically.';
          Alert.alert('PDF split failed', message);
          return { ok: false, rateLimited: false, message };
        }
      }

      if (sizeBytes > MAX_MATERIAL_SIZE_BYTES) {
        Alert.alert(
          'File too large',
          `This file is ${formatSizeMB(sizeBytes)}MB. Please use files up to ${MAX_MATERIAL_SIZE_MB}MB for exam material analysis.`,
        );
        return { ok: false, rateLimited: false };
      }

      return await processSingleStudyMaterial(file);
    },
    [processSingleStudyMaterial],
  );

  const handlePickMaterialImage = useCallback(async () => {
    if (isMaterialPipelineBusy) return;
    setMaterialSelectionBusy(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Permission required', 'Please allow photo library access to upload study material.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        allowsMultipleSelection: true,
        selectionLimit: 15,
        quality: 0.9,
      });
      if (result.canceled || !result.assets?.length) return;

      for (let index = 0; index < result.assets.length; index += 1) {
        const asset = result.assets[index];
        const outcome = await processStudyMaterial({
          uri: asset.uri,
          name: asset.fileName || `image-${Date.now()}-${index + 1}.jpg`,
          mimeType: asset.mimeType || 'image/jpeg',
          size: asset.fileSize,
        });
        if (outcome.rateLimited) {
          break;
        }
      }
    } catch {
      Alert.alert('Upload failed', 'Could not add image study material. Please try again.');
    } finally {
      setMaterialSelectionBusy(false);
    }
  }, [processStudyMaterial, isMaterialPipelineBusy]);

  const handlePickMaterialPdf = useCallback(async () => {
    if (isMaterialPipelineBusy) return;
    setMaterialSelectionBusy(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      await processStudyMaterial({
        uri: asset.uri,
        name: asset.name || `document-${Date.now()}.pdf`,
        mimeType: asset.mimeType || 'application/pdf',
        size: asset.size,
      });
    } catch {
      Alert.alert('Upload failed', 'Could not add PDF study material. Please try again.');
    } finally {
      setMaterialSelectionBusy(false);
    }
  }, [processStudyMaterial, isMaterialPipelineBusy]);

  const handleRemoveMaterial = useCallback((materialId: string) => {
    setStudyMaterials((prev) => prev.filter((material) => material.id !== materialId));
  }, []);

  const handleRetryMaterial = useCallback(
    async (materialId: string) => {
      const target = studyMaterials.find((material) => material.id === materialId);
      if (!target || target.status === 'processing') return;
      if (!target.sourceUri) {
        Alert.alert('Retry unavailable', 'The source file is no longer available. Please upload it again.');
        return;
      }
      await analyzeStudyMaterialFile(materialId, {
        uri: target.sourceUri,
        name: target.name,
        mimeType: target.mimeType,
        size: target.sourceSize,
      });
    },
    [analyzeStudyMaterialFile, studyMaterials],
  );

  const fetchContextPreview = useCallback(async () => {
    if (!selectedGrade || !selectedSubject || !selectedExamType || !useTeacherContext) {
      setContextPreview(null);
      setContextError(null);
      return;
    }

    const requestSeq = ++contextRequestSeqRef.current;
    setContextLoading(true);
    setContextError(null);

    try {
      const supabase = assertSupabase();
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const invokeOptions: {
        body: Record<string, unknown>;
        headers?: Record<string, string>;
      } = {
        body: {
          grade: selectedGrade,
          subject: selectedSubject,
          examType: selectedExamType,
          language: selectedLanguage,
          allowFallback: false,
          studentId,
          classId,
          schoolId,
          useTeacherContext: true,
          previewContext: true,
        },
      };

      if (token) {
        invokeOptions.headers = { Authorization: `Bearer ${token}` };
      }

      const { data, error } = await supabase.functions.invoke('generate-exam', invokeOptions);
      if (error) {
        const info = await parseFunctionInvokeError(error, 'Could not load teacher context');
        throw new Error(info.message || 'Could not load teacher context');
      }

      const response = data as ExamGenerationResponse;
      if (!response?.success) {
        throw new Error(response?.error || 'Could not load teacher context');
      }

      if (requestSeq !== contextRequestSeqRef.current) return;
      setContextPreview(
        response.contextSummary || {
          assignmentCount: 0,
          lessonCount: 0,
          focusTopics: [],
          weakTopics: [],
        }
      );
    } catch (error) {
      if (requestSeq !== contextRequestSeqRef.current) return;
      const message = error instanceof Error ? error.message : 'Could not load teacher context';
      setContextError(message);
      setContextPreview(null);
    } finally {
      if (requestSeq !== contextRequestSeqRef.current) return;
      setContextLoading(false);
    }
  }, [
    selectedGrade,
    selectedSubject,
    selectedExamType,
    selectedLanguage,
    studentId,
    classId,
    schoolId,
    useTeacherContext,
  ]);

  useEffect(() => {
    if (step !== 'review') return;

    if (!useTeacherContext) {
      setContextPreview(null);
      setContextError(null);
      setContextLoading(false);
      return;
    }

    fetchContextPreview();
  }, [step, useTeacherContext, fetchContextPreview]);

  const moveToStep = useCallback((nextStep: WizardStep) => {
    setStep(nextStep);
  }, []);

  const handleSelectGrade = useCallback((grade: string) => {
    setSelectedGrade(grade);
    setSelectedSubject('');
    setSubjectSearch('');
    setSubjectCategory('all');
  }, []);

  const handleStartGeneration = useCallback(
    (withTeacherContext: boolean) => {
      if (!selectedGrade || !selectedSubject || !selectedExamType) return;
      if (isMaterialPipelineBusy) {
        Alert.alert(
          'Please wait',
          'We are still extracting content from your uploaded study material.',
        );
        return;
      }
      if (examQuotaLimit > 0 && examQuotaRemaining <= 0) {
        Alert.alert(
          'AI quota warning',
          'Your monthly exam quota appears exhausted. Generation may fail until usage is reset or your plan is upgraded.',
        );
      }

      const customPrompt = buildCustomPrompt();
      const draftId = customPrompt
        ? stashExamGenerationDraft({
            customPrompt,
          })
        : undefined;

      const generationParams = buildExamRouteParams({
        grade: selectedGrade,
        subject: selectedSubject,
        examType: selectedExamType,
        language: selectedLanguage,
        useTeacherContext: withTeacherContext,
        draftId,
        contextIds: {
          childName,
          studentId,
          classId,
          schoolId,
        },
      });

      router.push(buildExamGenerationHref(generationParams));
    },
    [
      selectedGrade,
      selectedSubject,
      selectedExamType,
      selectedLanguage,
      isMaterialPipelineBusy,
      examQuotaLimit,
      examQuotaRemaining,
      buildCustomPrompt,
      childName,
      studentId,
      classId,
      schoolId,
    ]
  );

  const handleQuickStartAfrikaansLive = useCallback(() => {
    const quickGrade = selectedGrade || gradeParam || 'grade_6';
    const quickParams = buildExamRouteParams({
      grade: quickGrade,
      subject: selectedSubject || 'Afrikaans First Additional Language',
      examType: 'practice_test',
      language: selectedLanguage || 'af-ZA',
      useTeacherContext: true,
      contextIds: {
        childName,
        studentId,
        classId,
        schoolId,
      },
    });

    router.push(buildExamGenerationHref(quickParams));
  }, [selectedGrade, gradeParam, selectedSubject, selectedLanguage, childName, studentId, classId, schoolId]);

  if (!canUseExamPrep) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
        <Stack.Screen options={{ title: 'Exam Prep' }} />
        <View style={styles.disabledContainer}>
          <Ionicons name="lock-closed-outline" size={64} color={theme.muted} />
          <Text style={[styles.disabledText, { color: theme.text }]}>Exam Prep is locked</Text>
          <Text style={[styles.disabledSubtext, { color: theme.muted }]}>Upgrade to {requiredExamTier || 'Starter'} to unlock exam practice features.</Text>
          <TouchableOpacity style={[styles.backButton, { backgroundColor: theme.primary }]} onPress={() => router.push('/screens/manage-subscription')}>
            <Text style={styles.backButtonText}>Manage Plan</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const currentStep = step === 'grade' ? 1 : step === 'subject' ? 2 : step === 'type' ? 3 : 4;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <Stack.Screen
        options={{
          title: 'Exam Prep',
          headerRight: () => (
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>CAPS</Text>
            </View>
          ),
        }}
      />

      <LinearGradient colors={isDark ? ['#1e293b', '#0f172a'] : ['#f0f9ff', '#e0f2fe']} style={styles.header}>
        <View style={styles.headerContent}>
          <Ionicons name="school" size={32} color={theme.primary} />
          <View style={styles.headerText}>
            <Text style={[styles.headerTitle, { color: theme.text }]}>AI-Powered Exam Prep</Text>
            <Text style={[styles.headerSubtitle, { color: theme.muted }]}>Structured CAPS-aligned generation from real teacher artifacts.</Text>
          </View>
        </View>

        <View style={styles.progressSteps}>
          {['Grade', 'Subject', 'Type', 'Review'].map((label, index) => {
            const stepNum = index + 1;
            const isActive = stepNum <= currentStep;
            return (
              <View key={label} style={styles.progressStep}>
                <View style={[styles.progressDot, { backgroundColor: isActive ? theme.primary : theme.border }]}>
                  {stepNum < currentStep ? <Ionicons name="checkmark" size={12} color="#ffffff" /> : null}
                </View>
                <Text style={[styles.progressLabel, { color: isActive ? theme.primary : theme.muted }]}>{label}</Text>
              </View>
            );
          })}
        </View>
      </LinearGradient>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner} showsVerticalScrollIndicator={false}>
        <View style={[styles.quickLaunchCard, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
          <View style={styles.quickLaunchHeader}>
            <Ionicons name="flash-outline" size={18} color={theme.primary} />
            <Text style={[styles.quickLaunchTitle, { color: theme.text }]}>Quick Live Session</Text>
          </View>
          <Text style={[styles.quickLaunchSubtitle, { color: theme.muted }]}>Open interactive in-canvas practice for {quickLaunchLabel} with instant correct/incorrect markers and explanations.</Text>
          <TouchableOpacity style={[styles.quickLaunchButton, { backgroundColor: theme.primary }]} onPress={handleQuickStartAfrikaansLive}>
            <Ionicons name="play-circle" size={18} color="#ffffff" />
            <Text style={styles.quickLaunchButtonText}>Start Live Practice: {quickLaunchLabel}</Text>
          </TouchableOpacity>
        </View>

        {step === 'grade' ? (
          <ExamPrepGradeStep
            theme={theme}
            selectedGrade={selectedGrade}
            onSelectGrade={handleSelectGrade}
            onNext={() => moveToStep('subject')}
          />
        ) : null}

        {step === 'subject' ? (
          <ExamPrepSubjectStep
            theme={theme}
            gradeLabel={gradeInfo?.label || selectedGrade}
            selectedSubject={selectedSubject}
            filteredSubjects={filteredSubjects}
            subjectSearch={subjectSearch}
            subjectCategory={subjectCategory}
            onSubjectSearchChange={setSubjectSearch}
            onSubjectCategoryChange={setSubjectCategory}
            onSelectSubject={setSelectedSubject}
            onBack={() => moveToStep('grade')}
            onNext={() => moveToStep('type')}
          />
        ) : null}

        {step === 'type' ? (
          <ExamPrepTypeStep
            theme={theme}
            gradeLabel={gradeInfo?.label || selectedGrade}
            selectedSubject={selectedSubject}
            selectedExamType={selectedExamType}
            selectedLanguage={selectedLanguage}
            onSelectExamType={setSelectedExamType}
            onSelectLanguage={setSelectedLanguage}
            onBack={() => moveToStep('subject')}
            onNext={() => moveToStep('review')}
          />
        ) : null}

        {step === 'review' ? (
          <>
            {examQuotaLimit > 0 ? (
              <View style={[styles.usageCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={styles.usageCardHeader}>
                  <Ionicons name="sparkles-outline" size={16} color={theme.primary} />
                  <Text style={[styles.usageCardTitle, { color: theme.text }]}>AI Usage This Month</Text>
                </View>
                <View style={styles.usageRingWrap}>
                  <QuotaRingWithStatus
                    featureName="Exam prep"
                    used={examQuotaUsed}
                    limit={examQuotaLimit}
                    size={66}
                  />
                </View>
                <Text style={[styles.usageCardHint, { color: theme.muted }]}>
                  {examQuotaUsed}/{examQuotaLimit} exam-related AI actions used this month.
                </Text>
              </View>
            ) : null}

            {examQuotaWarning ? (
              <View style={[styles.usageWarning, { borderColor: `${theme.warning}55`, backgroundColor: `${theme.warning}12` }]}>
                <Ionicons name="warning-outline" size={15} color={theme.warning} />
                <Text style={[styles.usageWarningText, { color: theme.warning }]}>
                  {examQuotaWarning}
                </Text>
              </View>
            ) : null}

            <ExamPrepReviewStep
              theme={theme}
              childName={childName}
              gradeLabel={gradeInfo?.label || selectedGrade}
              selectedGrade={selectedGrade}
              selectedSubject={selectedSubject}
              selectedExamTypeLabel={selectedExamTypeLabel}
              selectedExamType={selectedExamType}
              selectedLanguage={selectedLanguage}
              useTeacherContext={useTeacherContext}
              contextPreview={contextPreview}
              contextLoading={contextLoading}
              contextError={contextError}
              onBack={() => moveToStep('type')}
              onSetUseTeacherContext={setUseTeacherContext}
              hideGenerateButtons
            />

            <View style={[styles.materialCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={styles.materialHeader}>
                <Ionicons name="attach-outline" size={16} color={theme.primary} />
                <Text style={[styles.materialTitle, { color: theme.text }]}>Study Material (Optional)</Text>
              </View>
              {readyMaterialSummaries.length > 0 ? (
                <View
                  style={[
                    styles.uploadedMaterialBanner,
                    { borderColor: `${theme.primary}55`, backgroundColor: `${theme.primary}18` },
                  ]}
                >
                  <Ionicons name="document-attach-outline" size={14} color={theme.primary} />
                  <Text style={[styles.uploadedMaterialBannerText, { color: theme.primary }]}>
                    Using uploaded material / Images / PDFs / Study Notes
                  </Text>
                </View>
              ) : null}
              <Text style={[styles.materialSubtitle, { color: theme.muted }]}>
                Upload an image or PDF of homework/classwork so exam questions align with the learner&apos;s material. PDF uploads are processed page-by-page.
              </Text>
              {pdfSplitProgress ? (
                <View
                  style={[
                    styles.materialSplitCard,
                    {
                      borderColor: theme.border,
                      backgroundColor: isDark ? 'rgba(99, 102, 241, 0.12)' : 'rgba(99, 102, 241, 0.08)',
                    },
                  ]}
                >
                  <View style={styles.materialSplitHeader}>
                    <ActivityIndicator size="small" color={theme.primary} />
                    <Text style={[styles.materialSplitTitle, { color: theme.text }]}>Uploading PDF pages</Text>
                  </View>
                  <Text style={[styles.materialSplitMeta, { color: theme.muted }]} numberOfLines={1}>
                    {pdfSplitProgress.fileName}
                  </Text>
                  <Text style={[styles.materialSplitMeta, { color: theme.muted }]}>
                    {`${pdfSplitProgress.completedParts}/${pdfSplitProgress.totalParts} parts processed`}
                  </Text>
                  <View style={[styles.materialSplitTrack, { backgroundColor: theme.border }]}>
                    <View
                      style={[
                        styles.materialSplitFill,
                        {
                          width: `${clampPercent(splitProgressPercent, {
                            source: 'ExamPrepWizard.materialSplitProgress',
                            suppressTelemetry: true,
                          })}%`,
                          backgroundColor: theme.primary,
                        },
                      ]}
                    />
                  </View>
                </View>
              ) : null}

              <View style={styles.materialActions}>
                <TouchableOpacity
                  style={[styles.materialActionBtn, { borderColor: theme.border, backgroundColor: theme.background }]}
                  onPress={handlePickMaterialImage}
                  disabled={isMaterialPipelineBusy}
                >
                  {isMaterialPipelineBusy ? (
                    <ActivityIndicator size="small" color={theme.primary} />
                  ) : (
                    <Ionicons name="image-outline" size={14} color={theme.primary} />
                  )}
                  <Text style={[styles.materialActionText, { color: theme.text }]}>Add Image</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.materialActionBtn, { borderColor: theme.border, backgroundColor: theme.background }]}
                  onPress={handlePickMaterialPdf}
                  disabled={isMaterialPipelineBusy}
                >
                  {isMaterialPipelineBusy ? (
                    <ActivityIndicator size="small" color={theme.primary} />
                  ) : (
                    <Ionicons name="document-text-outline" size={14} color={theme.primary} />
                  )}
                  <Text style={[styles.materialActionText, { color: theme.text }]}>Add PDF</Text>
                </TouchableOpacity>
              </View>

              {studyMaterials.map((material) => (
                <View
                  key={material.id}
                  style={[styles.materialItem, { borderColor: theme.border, backgroundColor: theme.background }]}
                >
                  <View style={styles.materialMeta}>
                    <Text style={[styles.materialName, { color: theme.text }]} numberOfLines={1}>
                      {material.name}
                    </Text>
                    <Text style={[styles.materialStatus, { color: theme.muted }]}>
                      {material.status === 'processing'
                        ? 'Extracting study notes...'
                        : material.status === 'ready'
                        ? 'Ready for generation'
                        : material.error || 'Could not read file'}
                    </Text>
                  </View>
                  <View style={styles.materialRight}>
                    {material.status === 'processing' ? (
                      <ActivityIndicator size="small" color={theme.primary} />
                    ) : null}
                    {material.status === 'error' ? (
                      <TouchableOpacity
                        onPress={() => handleRetryMaterial(material.id)}
                        style={[styles.materialRetryBtn, { borderColor: theme.primary }]}
                      >
                        <Ionicons name="refresh-outline" size={12} color={theme.primary} />
                        <Text style={[styles.materialRetryText, { color: theme.primary }]}>Retry</Text>
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity onPress={() => handleRemoveMaterial(material.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <Ionicons name="close-circle" size={18} color={theme.muted} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}

              <TextInput
                style={[
                  styles.customPromptInput,
                  {
                    backgroundColor: theme.background,
                    borderColor: theme.border,
                    color: theme.text,
                  },
                ]}
                placeholder="Add extra instructions (for example: focus on fractions and word problems)."
                placeholderTextColor={theme.muted}
                value={customPromptText}
                onChangeText={setCustomPromptText}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>

            <View style={styles.generateButtonBlock}>
              {isMaterialPipelineBusy ? (
                <View style={[styles.generateButtonDisabled, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <ActivityIndicator size="small" color={theme.primary} />
                  <Text style={[styles.generateButtonDisabledText, { color: theme.muted }]}>
                    {materialPipelineLabel}
                  </Text>
                </View>
              ) : null}
              <TouchableOpacity
                style={[
                  styles.generateButton,
                  isMaterialPipelineBusy ? styles.generateButtonInactive : {},
                  isMaterialPipelineBusy ? { backgroundColor: theme.border, opacity: 0.7 } : { backgroundColor: '#22c55e' },
                ]}
                onPress={isMaterialPipelineBusy ? undefined : () => handleStartGeneration(useTeacherContext)}
                disabled={isMaterialPipelineBusy}
              >
                <Ionicons name="sparkles" size={22} color="#ffffff" />
                <Text style={styles.generateButtonText}>Generate {selectedExamTypeLabel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.secondaryGenerateButton,
                  { borderColor: theme.border, backgroundColor: theme.surface },
                  isMaterialPipelineBusy ? { opacity: 0.6 } : {},
                ]}
                onPress={isMaterialPipelineBusy ? undefined : () => handleStartGeneration(false)}
                disabled={isMaterialPipelineBusy}
              >
                <Text style={[styles.secondaryGenerateText, { color: theme.text }]}>
                  Generate without teacher context
                </Text>
              </TouchableOpacity>
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
