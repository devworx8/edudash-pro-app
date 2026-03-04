import { useEffect, type Dispatch, type SetStateAction } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { isStaleWebSourceUri } from '@/lib/exam-prep/studyMaterialPipelineHandlers';
import { STORAGE_KEY, type StudyMaterial } from '@/lib/exam-prep/studyMaterialPipelineTypes';

export function usePersistedStudyMaterials(
  studyMaterials: StudyMaterial[],
  setStudyMaterials: Dispatch<SetStateAction<StudyMaterial[]>>,
) {
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        try {
          const parsed = JSON.parse(raw) as StudyMaterial[];
          const recovered: StudyMaterial[] = parsed
            .map((item): StudyMaterial =>
              item.status === 'processing' ? { ...item, status: 'queued' as const } : item,
            )
            .filter((item) => {
              if (Platform.OS !== 'web' || item.status === 'ready') return true;
              return !isStaleWebSourceUri(item.sourceUri);
            });
          setStudyMaterials(recovered);
        } catch {
          // ignore malformed local payloads
        }
      })
      .catch(() => undefined);
  }, [setStudyMaterials]);

  useEffect(() => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(studyMaterials)).catch(() => undefined);
  }, [studyMaterials]);
}
