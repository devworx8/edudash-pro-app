import React from 'react';
import { fireEvent, render } from '@testing-library/react-native/pure';
import { CompactModelPicker } from '../CompactModelPicker';
import { getDefaultModels } from '@/lib/ai/models';

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

jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name?: string }) => {
    const { Text } = require('react-native');
    return <Text>{name || 'icon'}</Text>;
  },
}));

describe('CompactModelPicker', () => {
  const models = getDefaultModels();

  it('opens and selects an accessible model', () => {
    const onSelectModel = jest.fn();
    const { getByLabelText, getByText } = render(
      <CompactModelPicker
        models={models}
        selectedModelId="claude-haiku-4-5-20251001"
        canSelectModel={() => true}
        onSelectModel={onSelectModel}
      />
    );

    fireEvent.press(getByLabelText(/Model selector/i));
    fireEvent.press(getByText('Dash Advanced'));

    expect(onSelectModel).toHaveBeenCalledWith('claude-3-7-sonnet-20250219');
  });

  it('routes locked models to locked callback', () => {
    const onSelectModel = jest.fn();
    const onLockedPress = jest.fn();
    const { getByLabelText, getByText } = render(
      <CompactModelPicker
        models={models}
        selectedModelId="claude-haiku-4-5-20251001"
        canSelectModel={(id) => id !== 'claude-sonnet-4-20250514'}
        onSelectModel={onSelectModel}
        onLockedPress={onLockedPress}
      />
    );

    fireEvent.press(getByLabelText(/Model selector/i));
    fireEvent.press(getByText('Dash Pro'));

    expect(onSelectModel).not.toHaveBeenCalled();
    expect(onLockedPress).toHaveBeenCalledWith('claude-sonnet-4-20250514');
  });
});
