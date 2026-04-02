export interface MissionControlSectionIdentity {
  id: string;
}

export interface MissionControlActionIdentity {
  id: string;
}

export interface MissionControlLayout {
  primaryCols: number;
  secondaryRowCols: number;
  secondarySectionsPerRow: number;
  innerPad: number;
  isWide: boolean;
}

export function getMissionControlLayout(windowWidth: number): MissionControlLayout {
  if (windowWidth >= 1280) {
    return {
      primaryCols: 5,
      secondaryRowCols: 3,
      secondarySectionsPerRow: 3,
      innerPad: 6,
      isWide: true,
    };
  }

  if (windowWidth >= 1024) {
    return {
      primaryCols: 4,
      secondaryRowCols: 3,
      secondarySectionsPerRow: 3,
      innerPad: 5,
      isWide: true,
    };
  }

  if (windowWidth >= 768) {
    return {
      primaryCols: 4,
      secondaryRowCols: 2,
      secondarySectionsPerRow: 2,
      innerPad: 5,
      isWide: true,
    };
  }

  return {
    primaryCols: 3,
    secondaryRowCols: 3,
    secondarySectionsPerRow: 1,
    innerPad: 4,
    isWide: false,
  };
}

export function splitMissionControlSections<T extends MissionControlSectionIdentity>(
  sections: T[],
  primarySectionId: string = 'learning',
) {
  const primarySection = sections.find((section) => section.id === primarySectionId) ?? sections[0] ?? null;

  if (!primarySection) {
    return {
      primarySection: null,
      secondarySections: [] as T[],
    };
  }

  return {
    primarySection,
    secondarySections: sections.filter((section) => section.id !== primarySection.id),
  };
}

export function splitSecondaryMissionSections<T extends MissionControlSectionIdentity>(
  sections: T[],
  leadSectionId: string = 'communication',
) {
  const leadSection = sections.find((section) => section.id === leadSectionId) ?? null;

  if (!leadSection) {
    return {
      leadSection: null,
      trailingSections: sections,
    };
  }

  return {
    leadSection,
    trailingSections: sections.filter((section) => section.id !== leadSection.id),
  };
}

export function splitMissionSectionActions<T extends MissionControlActionIdentity>(
  actions: T[],
  featuredCount: number = 2,
) {
  const boundedFeaturedCount = Math.max(0, featuredCount);

  return {
    featuredActions: actions.slice(0, boundedFeaturedCount),
    remainingActions: actions.slice(boundedFeaturedCount),
  };
}
