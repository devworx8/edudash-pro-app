import { useEffect, type Dispatch, type SetStateAction } from 'react';

import type { PdfSplitProgress, StudyMaterial } from '@/lib/exam-prep/studyMaterialPipelineTypes';

export function usePdfSplitProgressSync(params: {
  pdfSplitProgress: PdfSplitProgress | null;
  studyMaterials: StudyMaterial[];
  setPdfSplitProgress: Dispatch<SetStateAction<PdfSplitProgress | null>>;
}) {
  const { pdfSplitProgress, setPdfSplitProgress, studyMaterials } = params;

  useEffect(() => {
    if (!pdfSplitProgress) return;
    const completed = pdfSplitProgress.partIds.filter((id) => {
      const item = studyMaterials.find((m) => m.id === id);
      return item && item.status !== 'queued' && item.status !== 'processing';
    }).length;

    if (completed !== pdfSplitProgress.completedParts) {
      setPdfSplitProgress((prev) => (prev ? { ...prev, completedParts: completed } : prev));
    }
    if (completed >= pdfSplitProgress.totalParts && pdfSplitProgress.totalParts > 0) {
      const timeout = setTimeout(() => setPdfSplitProgress(null), 900);
      return () => clearTimeout(timeout);
    }
  }, [pdfSplitProgress, setPdfSplitProgress, studyMaterials]);
}
