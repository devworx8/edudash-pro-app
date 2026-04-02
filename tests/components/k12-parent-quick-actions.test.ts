import React from 'react';
import { fireEvent, render } from '@testing-library/react-native/pure';
import { K12ParentQuickActions } from '@/domains/k12/components/K12ParentQuickActions';
import {
  getK12MissionSectionLayout,
  getMissionCellWidth,
  getMissionTrackWidth,
} from '@/domains/k12/components/K12MissionLayout';

jest.mock('react-native', () => {
  return {
    View: 'View',
    Text: 'Text',
    StyleSheet: {
      create: (styles: any) => styles,
      flatten: (style: any) => style,
    },
    useWindowDimensions: jest.fn(() => ({
      width: 430,
      height: 932,
      scale: 3,
      fontScale: 1,
    })),
  };
});

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: any) => children,
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, opts?: { defaultValue?: string }) => opts?.defaultValue || _key,
  }),
}));

jest.mock('@/components/nextgen/GlassCard', () => ({
  GlassCard: ({ children }: any) => {
    const React = require('react');
    const { View } = require('react-native');
    return React.createElement(View, null, children);
  },
}));

jest.mock('@/domains/k12/components/K12MissionActionCard', () => ({
  K12MissionActionCard: ({ action, onPress, needsAttention }: any) => {
    const React = require('react');
    const { Text } = require('react-native');
    return React.createElement(
      Text,
      {
        accessibilityLabel: action.label,
        onPress: () => onPress(action.actionId),
      },
      `${action.label}${needsAttention ? ' (attention)' : ''}`,
    );
  },
}));

describe('K12ParentQuickActions', () => {
  const theme = {
    text: '#F8FAFC',
    textSecondary: '#94A3B8',
    primary: '#38BDF8',
    surface: '#0F172A',
    surfaceVariant: '#162033',
    border: 'rgba(255,255,255,0.12)',
    warning: '#F59E0B',
  } as any;

  it('renders mission control hierarchy on the k12 parent dashboard', () => {
    const { getByText } = render(
      React.createElement(K12ParentQuickActions, {
        onActionPress: jest.fn(),
        theme,
        quickWinsEnabled: true,
      }),
    );

    expect(getByText('Mission Control')).toBeTruthy();
    expect(getByText('Top priority')).toBeTruthy();
    expect(getByText('Family lane')).toBeTruthy();
    expect(getByText('Payments & tools')).toBeTruthy();
    expect(getByText('Homework')).toBeTruthy();
    expect(getByText('Messages')).toBeTruthy();
  });

  it('dispatches presses through the supplied action handler', () => {
    const onActionPress = jest.fn();
    const { getByText } = render(
      React.createElement(K12ParentQuickActions, {
        onActionPress,
        theme,
        quickWinsEnabled: true,
      }),
    );

    fireEvent.press(getByText('Messages'));
    expect(onActionPress).toHaveBeenCalledWith('messages');
  });

  it('surfaces payment urgency on the payments mission card', () => {
    const { getByText } = render(
      React.createElement(K12ParentQuickActions, {
        onActionPress: jest.fn(),
        theme,
        quickWinsEnabled: true,
        paymentsNeedAttention: true,
      }),
    );

    expect(getByText('Payments (attention)')).toBeTruthy();
  });

  it('switches the lower missions section to a split tablet layout at 768px', () => {
    expect(getK12MissionSectionLayout(767, 2, 3)).toEqual({
      isWide: false,
      sectionTracks: 1,
      actionTracks: 3,
    });

    expect(getK12MissionSectionLayout(768, 2, 3)).toEqual({
      isWide: true,
      sectionTracks: 2,
      actionTracks: 2,
    });

    expect(getMissionTrackWidth(2)).toBe('48.5%');
    expect(getMissionCellWidth(2, 3, 2)).toBe('100%');
  });
});
