import React from 'react';
import { fireEvent, render } from '@testing-library/react-native/pure';
import { CompactModelPicker } from '@/components/ai/model-picker/CompactModelPicker';
import { getDefaultModels } from '@/lib/ai/models';
import type { AIModelId } from '@/lib/ai/models';

jest.mock('react-native', () => {
  const React = require('react');
  const makeElement = (name: string) => ({ children, ...props }: any) =>
    React.createElement(name, props, children);
  return {
    Platform: { OS: 'ios', select: (obj: any) => obj.ios || obj.default },
    StyleSheet: {
      create: (styles: any) => styles,
      flatten: (style: any) => style,
      absoluteFillObject: {},
    },
    Dimensions: { get: () => ({ width: 390, height: 844 }) },
    View: makeElement('View'),
    Text: makeElement('Text'),
    ScrollView: makeElement('ScrollView'),
    TouchableOpacity: makeElement('TouchableOpacity'),
    Pressable: makeElement('Pressable'),
    Modal: ({ visible, children }: { visible: boolean; children?: React.ReactNode }) =>
      (visible ? React.createElement('Modal', null, children) : null),
  };
});

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
    return React.createElement(Text, null, name || 'icon');
  },
}));

jest.mock('@/components/dash-orb/CosmicOrb', () => ({
  CosmicOrb: () => null,
}));

describe('CompactModelPicker', () => {
  const models = getDefaultModels();

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('selects an accessible model', () => {
    const onSelectModel = jest.fn();
    const { getByText } = render(
      React.createElement(CompactModelPicker, {
        models,
        selectedModelId: 'claude-3-haiku-20240307',
        canSelectModel: () => true,
        onSelectModel,
      })
    );

    fireEvent.press(getByText('hardware-chip-outline'));
    fireEvent.press(getByText('Dash Smart'));
    expect(onSelectModel).toHaveBeenCalledWith('claude-3-5-sonnet-20241022');
  });

  it('routes locked model press to upgrade callback', () => {
    const onSelectModel = jest.fn();
    const onLockedPress = jest.fn();
    const { getByText } = render(
      React.createElement(CompactModelPicker, {
        models,
        selectedModelId: 'claude-3-haiku-20240307',
        canSelectModel: (id: AIModelId) => id !== 'claude-sonnet-4-20250514',
        onSelectModel,
        onLockedPress,
      })
    );

    fireEvent.press(getByText('hardware-chip-outline'));
    fireEvent.press(getByText('Dash Pro'));
    expect(onSelectModel).not.toHaveBeenCalled();
    expect(onLockedPress).toHaveBeenCalledWith('claude-sonnet-4-20250514');
  });
});
