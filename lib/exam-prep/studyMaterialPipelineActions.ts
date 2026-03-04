import { type Dispatch, type SetStateAction } from 'react';
import { Platform } from 'react-native';

import { isStaleWebSourceUri } from '@/lib/exam-prep/studyMaterialPipelineHandlers';
import type {
  QueuePauseSetter,
  StudyMaterial,
  UpdateStudyMaterialItem,
} from '@/lib/exam-prep/studyMaterialPipelineTypes';

export function removeMaterial(
  setStudyMaterials: Dispatch<SetStateAction<StudyMaterial[]>>,
  id: string,
) {
  setStudyMaterials((prev) => prev.filter((m) => m.id !== id));
}

export function retryMaterial(params: {
  id: string;
  studyMaterials: StudyMaterial[];
  updateItem: UpdateStudyMaterialItem;
}) {
  const { id, studyMaterials, updateItem } = params;
  const material = studyMaterials.find((entry) => entry.id === id);
  if (Platform.OS === 'web' && material && isStaleWebSourceUri(material.sourceUri)) {
    updateItem(id, {
      status: 'error',
      error: 'This file reference expired in the browser. Please remove it and upload again.',
    });
    return;
  }
  updateItem(id, { status: 'queued', error: undefined, attempts: 0 });
}

export function retryFailedMaterials(
  setStudyMaterials: Dispatch<SetStateAction<StudyMaterial[]>>,
) {
  setStudyMaterials((prev) =>
    prev.map((m) =>
      m.status === 'error' ? { ...m, status: 'queued', error: undefined, attempts: 0 } : m,
    ),
  );
}

export function resumeQueue(params: {
  setQueuePausedUntilMs: QueuePauseSetter;
  setStudyMaterials: Dispatch<SetStateAction<StudyMaterial[]>>;
}) {
  const { setQueuePausedUntilMs, setStudyMaterials } = params;
  setQueuePausedUntilMs(null);
  setStudyMaterials((prev) =>
    prev.map((m) => (m.status === 'paused_rate_limited' ? { ...m, status: 'queued' } : m)),
  );
}

export function cancelQueue(params: {
  setQueuePausedUntilMs: QueuePauseSetter;
  setStudyMaterials: Dispatch<SetStateAction<StudyMaterial[]>>;
}) {
  const { setQueuePausedUntilMs, setStudyMaterials } = params;
  setQueuePausedUntilMs(null);
  setStudyMaterials((prev) =>
    prev.map((m) =>
      m.status === 'queued' || m.status === 'processing' || m.status === 'paused_rate_limited'
        ? { ...m, status: 'error', error: 'Processing canceled by user.' }
        : m,
    ),
  );
}
