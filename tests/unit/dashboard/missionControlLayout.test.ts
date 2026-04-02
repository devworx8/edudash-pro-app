import {
  getMissionControlLayout,
  splitMissionControlSections,
  splitSecondaryMissionSections,
  splitMissionSectionActions,
} from '@/components/dashboard/parent/missionControlLayout';

describe('mission control layout', () => {
  it('keeps the learning section visually primary on wide screens', () => {
    expect(getMissionControlLayout(767)).toEqual({
      primaryCols: 3,
      secondaryRowCols: 3,
      secondarySectionsPerRow: 1,
      innerPad: 4,
      isWide: false,
    });

    expect(getMissionControlLayout(768)).toEqual({
      primaryCols: 4,
      secondaryRowCols: 2,
      secondarySectionsPerRow: 2,
      innerPad: 5,
      isWide: true,
    });

    expect(getMissionControlLayout(1280)).toEqual({
      primaryCols: 5,
      secondaryRowCols: 3,
      secondarySectionsPerRow: 3,
      innerPad: 6,
      isWide: true,
    });
  });

  it('promotes the learning section ahead of secondary groups', () => {
    const { primarySection, secondarySections } = splitMissionControlSections([
      { id: 'communication' },
      { id: 'learning' },
      { id: 'payments' },
      { id: 'ai' },
    ]);

    expect(primarySection?.id).toBe('learning');
    expect(secondarySections.map((section) => section.id)).toEqual([
      'communication',
      'payments',
      'ai',
    ]);
  });

  it('falls back to the first section when learning is absent', () => {
    const { primarySection, secondarySections } = splitMissionControlSections([
      { id: 'communication' },
      { id: 'payments' },
    ]);

    expect(primarySection?.id).toBe('communication');
    expect(secondarySections.map((section) => section.id)).toEqual(['payments']);
  });

  it('pulls comms into its own secondary lane before the support sections', () => {
    const { leadSection, trailingSections } = splitSecondaryMissionSections([
      { id: 'communication' },
      { id: 'payments' },
      { id: 'ai' },
    ]);

    expect(leadSection?.id).toBe('communication');
    expect(trailingSections.map((section) => section.id)).toEqual([
      'payments',
      'ai',
    ]);
  });

  it('keeps the original secondary flow when comms is absent', () => {
    const { leadSection, trailingSections } = splitSecondaryMissionSections([
      { id: 'payments' },
      { id: 'ai' },
    ]);

    expect(leadSection).toBeNull();
    expect(trailingSections.map((section) => section.id)).toEqual([
      'payments',
      'ai',
    ]);
  });

  it('promotes the first two mission actions as featured cards', () => {
    const { featuredActions, remainingActions } = splitMissionSectionActions([
      { id: 'view_homework' },
      { id: 'daily_program' },
      { id: 'learning_hub' },
      { id: 'assigned_lessons' },
    ]);

    expect(featuredActions.map((action) => action.id)).toEqual([
      'view_homework',
      'daily_program',
    ]);
    expect(remainingActions.map((action) => action.id)).toEqual([
      'learning_hub',
      'assigned_lessons',
    ]);
  });
});
