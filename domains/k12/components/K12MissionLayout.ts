import { getMissionControlLayout } from '@/components/dashboard/parent/missionControlLayout';

function clampTrackCount(trackCount: number): number {
  return Math.max(1, trackCount);
}

export function getMissionTrackWidth(trackCount: number): `${number}%` {
  const safeTrackCount = clampTrackCount(trackCount);

  if (safeTrackCount === 1) return '100%';
  if (safeTrackCount === 2) return '48.5%';
  return '31.5%';
}

export function getMissionCellWidth(
  index: number,
  totalItems: number,
  trackCount: number,
): `${number}%` {
  const safeTotalItems = Math.max(1, totalItems);
  const safeTrackCount = clampTrackCount(trackCount);

  if (safeTotalItems <= 1 || safeTrackCount === 1) {
    return '100%';
  }

  const remainder = safeTotalItems % safeTrackCount;
  const baseWidth = getMissionTrackWidth(safeTrackCount);

  if (remainder === 0) {
    return baseWidth;
  }

  const lastRowStart = safeTotalItems - remainder;
  if (index < lastRowStart) {
    return baseWidth;
  }

  return getMissionTrackWidth(remainder);
}

export function getK12MissionSectionLayout(
  windowWidth: number,
  totalSections: number,
  totalActions: number,
) {
  const missionLayout = getMissionControlLayout(windowWidth);
  const safeSectionCount = Math.max(1, totalSections);
  const safeActionCount = Math.max(1, totalActions);

  return {
    isWide: missionLayout.isWide,
    sectionTracks: missionLayout.isWide
      ? Math.min(safeSectionCount, missionLayout.secondarySectionsPerRow)
      : 1,
    actionTracks: missionLayout.isWide
      ? Math.min(safeActionCount, missionLayout.secondaryRowCols)
      : Math.min(safeActionCount, windowWidth < 390 ? 2 : 3),
  };
}
