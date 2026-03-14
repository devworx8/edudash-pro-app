jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    theme: {
      primary: '#4f46e5',
      surface: '#0f172a',
      surfaceVariant: '#1e293b',
      border: '#334155',
      text: '#f8fafc',
      textSecondary: '#94a3b8',
    },
  }),
}));

jest.mock('@/components/dash-orb/CosmicOrb', () => ({
  CosmicOrb: () => null,
}));

import { formatModelUsageLabel, splitModelsForPicker } from '@/components/ai/model-picker/CompactModelPicker';
import { getDefaultModels } from '@/lib/ai/models';

describe('CompactModelPicker helpers', () => {
  it('keeps the selected accessible model at the top of the available list', () => {
    const models = getDefaultModels();
    const { available, locked } = splitModelsForPicker(
      models,
      'claude-3-5-sonnet-20241022',
      (modelId) => modelId !== 'claude-sonnet-4-5-20250514',
    );

    expect(available[0]?.id).toBe('claude-3-5-sonnet-20241022');
    expect(locked.some((model) => model.id === 'claude-sonnet-4-5-20250514')).toBe(true);
  });

  it('maps model cost into readable usage labels', () => {
    expect(formatModelUsageLabel(1)).toBe('Light usage');
    expect(formatModelUsageLabel(3)).toBe('Balanced');
    expect(formatModelUsageLabel(5)).toBe('Deep reasoning');
    expect(formatModelUsageLabel(8)).toBe('Heavy usage');
  });
});
