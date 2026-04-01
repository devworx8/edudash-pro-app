/**
 * usePictureOfProgress — state + effects + handlers
 *
 * Extracted from parent-picture-of-progress.tsx.
 * All Alert.alert calls replaced with showAlert callback.
 */
import { useState, useEffect, useCallback } from 'react';
import { Platform, Animated } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { router } from 'expo-router';
import { useCreatePOPUpload, CreatePOPUploadData } from '@/hooks/usePOPUploads';
import { ensureImageLibraryPermission } from '@/lib/utils/mediaLibrary';
import {
  consumePendingCameraResult,
  launchCameraWithRecovery,
  normalizeMediaUri,
} from '@/lib/utils/cameraRecovery';
import ProfileImageService from '@/services/ProfileImageService';
import { PictureOfProgressAI, ImageAnalysisResult } from '@/services/PictureOfProgressAI';
import { useCelebration } from '@/hooks/useCelebration';

const POP_PROGRESS_CAMERA_CONTEXT = 'pop_picture_of_progress';
const POP_PROGRESS_ANALYSIS_MAX_BASE64 = 4_000_000;
export interface SelectedFile {
  uri: string;
  name: string;
  size?: number;
  type?: string;
  webFile?: Blob | null;
}
type ShowAlert = (cfg: {
  title: string;
  message: string;
  buttons?: Array<{
    text: string;
    onPress?: () => void;
    style?: 'default' | 'cancel' | 'destructive';
  }>;
}) => void;
interface Params {
  studentId: string; studentName: string; nextStep: string;
  prefillTitle: string; prefillDescription: string; prefillSubject: string; prefillLearningArea: string;
  gradeLevel: string; assignmentTitle: string; submissionTemplate: string;
  contextTag: string; sourceFlow: string; activityId: string; activityTitle: string;
}
export function usePictureOfProgress(showAlert: ShowAlert, t: (k: string) => string, params: Params) {
  const createUpload = useCreatePOPUpload();
  const { celebrate, milestoneHaptic, selectionHaptic, lightHaptic } = useCelebration();
  // Form state
  const [title, setTitle] = useState(params.prefillTitle);
  const [description, setDescription] = useState(params.prefillDescription);
  const [subject, setSubject] = useState(params.prefillSubject);
  const [achievementLevel, setAchievementLevel] = useState('');
  const [learningArea, setLearningArea] = useState(params.prefillLearningArea);
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);
  const [displayUri, setDisplayUri] = useState<string | null>(null);
  const [showSubjects, setShowSubjects] = useState(false);
  const [showAchievements, setShowAchievements] = useState(false);
  // AI state
  const [aiSuggestions, setAiSuggestions] = useState<ImageAnalysisResult | null>(null);
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  const [showMilestoneAlert, setShowMilestoneAlert] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  // Animations
  const [celebrationScale] = useState(new Animated.Value(1));
  const [milestoneOpacity] = useState(new Animated.Value(0));
  // Prefill sync
  useEffect(() => {
    if (params.prefillTitle && !title) setTitle(params.prefillTitle);
    if (params.prefillDescription && !description) setDescription(params.prefillDescription);
    if (params.prefillSubject && !subject) setSubject(params.prefillSubject);
    if (params.prefillLearningArea && !learningArea) setLearningArea(params.prefillLearningArea);
  }, [params.prefillTitle, params.prefillDescription, params.prefillSubject, params.prefillLearningArea]);
  // URI conversion for web
  useEffect(() => {
    if (!selectedFile?.uri) { setDisplayUri(null); return; }
    (async () => {
      try {
        if (Platform.OS === 'web' && (selectedFile.uri.startsWith('blob:') || selectedFile.uri.startsWith('file:'))) {
          setDisplayUri(await ProfileImageService.convertToDataUri(selectedFile.uri));
        } else {
          setDisplayUri(selectedFile.uri);
        }
      } catch { setDisplayUri(selectedFile.uri); }
    })();
  }, [selectedFile?.uri]);
  // Auto-tagging
  useEffect(() => {
    if (description.trim().length > 10) {
      setSuggestedTags(PictureOfProgressAI.generateTags(description, subject));
      const m = PictureOfProgressAI.detectMilestone(description);
      if (m.detected && !showMilestoneAlert) {
        setShowMilestoneAlert(true);
        triggerMilestoneAnimation();
        milestoneHaptic();
      }
    }
  }, [description, subject]);

  const setFileFromAsset = useCallback((asset: ImagePicker.ImagePickerAsset) => {
    setSelectedFile({
      uri: normalizeMediaUri(asset.uri),
      name: asset.fileName || `progress_${Date.now()}.jpg`,
      size: asset.fileSize,
      type: asset.mimeType || 'image/jpeg',
      webFile: (asset as any).file,
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const recovered = await consumePendingCameraResult(POP_PROGRESS_CAMERA_CONTEXT);
      if (cancelled || !recovered || recovered.canceled || !recovered.assets?.[0]) return;
      setFileFromAsset(recovered.assets[0]);
    })();
    return () => {
      cancelled = true;
    };
  }, [setFileFromAsset]);

  useEffect(() => {
    setAiSuggestions(null);
    setAnalysisError(null);
  }, [selectedFile?.uri, description, showAlert, subject, t]);

  const analyzePhoto = useCallback(async () => {
    if (!selectedFile?.uri || Platform.OS === 'web') return;

    try {
      setIsAnalyzing(true);
      setAnalysisError(null);

      const compressed = await ImageManipulator.manipulateAsync(
        selectedFile.uri,
        [{ resize: { width: 1280 } }],
        {
          compress: 0.7,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: true,
        }
      );

      const compressedBase64 = compressed.base64 || '';
      if (!compressedBase64 || compressedBase64.length > POP_PROGRESS_ANALYSIS_MAX_BASE64) {
        console.warn('[upload_oom_guard] POP analysis skipped due image payload size', {
          uri: selectedFile.uri,
          base64Length: compressedBase64.length,
        });
        const message = 'Image is too large for AI analysis. Retake with lower resolution (JPG/PNG under 12MB), or submit without Analyze Photo.';
        setAnalysisError(message);
        showAlert({ title: t('common.error'), message });
        return;
      }

      const result = await PictureOfProgressAI.analyzeImage(compressedBase64, description, subject);
      setAiSuggestions(result);
      if (result.suggestedTags?.length) {
        setSuggestedTags((prev) => [...new Set([...prev, ...result.suggestedTags])]);
      }
      if (result.caption && !description.trim()) {
        setDescription(result.caption);
      }
    } catch (error) {
      console.warn('[usePictureOfProgress] analyzePhoto failed', error);
      setAnalysisError('Unable to analyze photo right now. You can still submit the upload.');
    } finally {
      setIsAnalyzing(false);
    }
  }, [selectedFile?.uri]);
  const triggerMilestoneAnimation = useCallback(() => {
    Animated.sequence([
      Animated.spring(celebrationScale, { toValue: 1.1, useNativeDriver: true, friction: 3 }),
      Animated.spring(celebrationScale, { toValue: 1, useNativeDriver: true, friction: 3 }),
    ]).start();
    Animated.timing(milestoneOpacity, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, [celebrationScale, milestoneOpacity]);
  const handleSubjectSelect = useCallback((v: string) => { setSubject(v); setShowSubjects(false); selectionHaptic(); }, [selectionHaptic]);
  const handleAchievementSelect = useCallback((v: string) => { setAchievementLevel(v); setShowAchievements(false); selectionHaptic(); }, [selectionHaptic]);
  const handleImagePicker = useCallback(async () => {
    try {
      if (!(await ensureImageLibraryPermission())) { showAlert({ title: t('common.error'), message: 'Camera roll permission is required to select images.' }); return; }
      const r = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.78,
      });
      if (!r.canceled && r.assets[0]) setFileFromAsset(r.assets[0]);
    } catch { showAlert({ title: t('common.error'), message: 'Failed to select image' }); }
  }, [showAlert, t, setFileFromAsset]);
  const handleCameraPicker = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') { showAlert({ title: t('common.error'), message: 'Camera permission is required to take photos.' }); return; }
      const r = await launchCameraWithRecovery(POP_PROGRESS_CAMERA_CONTEXT, {
        allowsEditing: true,
        quality: 0.72,
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        exif: false,
        base64: false,
      });
      if (!r.canceled && r.assets[0]) setFileFromAsset(r.assets[0]);
    } catch { showAlert({ title: t('common.error'), message: 'Failed to take photo' }); }
  }, [showAlert, t, setFileFromAsset]);
  const validateForm = useCallback((): string[] => {
    const errs: string[] = [];
    if (!title.trim()) errs.push('Title is required');
    if (!subject) errs.push('Subject is required');
    if (!description.trim()) errs.push('Description is required');
    if (!selectedFile) errs.push('Photo is required');
    return errs;
  }, [title, subject, description, selectedFile]);
  const handleSubmit = useCallback(async () => {
    const errs = validateForm();
    if (errs.length > 0) { showAlert({ title: t('common.error'), message: errs.join('\n') }); return; }
    if (!params.studentId || !selectedFile) return;
    try {
      const tags = suggestedTags.length > 0 ? suggestedTags : PictureOfProgressAI.generateTags(description, subject);
      const m = PictureOfProgressAI.detectMilestone(description);
      const data: CreatePOPUploadData = {
        student_id: params.studentId, upload_type: 'picture_of_progress',
        title: title.trim(), description: description.trim(), file_uri: selectedFile.uri, file_name: selectedFile.name,
        web_file: selectedFile.webFile,
        subject, achievement_level: achievementLevel || undefined, learning_area: learningArea.trim() || undefined,
        tags: tags.length > 0 ? tags : undefined, is_milestone: m.detected, milestone_type: m.milestone?.name,
      };
      const created = await createUpload.mutateAsync(data);
      await celebrate({ type: m.detected ? 'milestone' : 'upload' });
      const msg = m.detected
        ? `Amazing! You've captured a special milestone: ${m.milestone?.name || 'Achievement'}. This moment has been saved to your child's learning journey!`
        : t('pop.progressUploadSuccessDesc');
      showAlert({
        title: m.detected ? '🎉 Milestone Captured!' : t('pop.progressUploadSuccess'),
        message: msg,
        buttons: [{
          text: t('common.ok'),
          onPress: () => {
            if (params.nextStep !== 'grade') { router.back(); return; }
            const fallback = params.studentName || 'Child';
            const gradingParams: Record<string, string> = {
              assignmentTitle: encodeURIComponent(params.assignmentTitle || `${title.trim() || 'Family Activity'} Review`),
              gradeLevel: encodeURIComponent(params.gradeLevel || 'Age 5'),
              submissionContent: encodeURIComponent(params.submissionTemplate || `${fallback} completed ${title.trim() || 'a family activity'} at home. Add what they found easy or difficult and what they learned.`),
              studentId: params.studentId, progressUploadId: created.id,
              contextTag: encodeURIComponent(params.contextTag || 'family_activity'),
              sourceFlow: encodeURIComponent(params.sourceFlow || 'parent_picture_of_progress'),
            };
            if (params.activityId) gradingParams.activityId = encodeURIComponent(params.activityId);
            if (params.activityTitle) gradingParams.activityTitle = encodeURIComponent(params.activityTitle);
            router.push({ pathname: '/screens/ai-homework-grader-live', params: gradingParams } as any);
          },
        }],
      });
    } catch (error) {
      showAlert({ title: t('common.error'), message: error instanceof Error ? error.message : 'Upload failed' });
    }
  }, [validateForm, showAlert, t, params, selectedFile, suggestedTags, description, subject, title, achievementLevel, learningArea, createUpload, celebrate]);
  const clearFile = useCallback(() => {
    setSelectedFile(null);
    setDisplayUri(null);
    setAiSuggestions(null);
    setAnalysisError(null);
  }, []);
  const analysisReady = Boolean(selectedFile?.uri) && !isAnalyzing;
  return {
    title, setTitle, description, setDescription, subject, achievementLevel, learningArea, setLearningArea,
    selectedFile, displayUri, showSubjects, setShowSubjects, showAchievements, setShowAchievements,
    aiSuggestions, suggestedTags, showMilestoneAlert, isAnalyzing, analysisError, analysisReady,
    celebrationScale, milestoneOpacity, createUpload,
    handleSubjectSelect, handleAchievementSelect,
    handleImagePicker, handleCameraPicker, analyzePhoto, validateForm, handleSubmit, clearFile,
    lightHaptic,
  };
}
