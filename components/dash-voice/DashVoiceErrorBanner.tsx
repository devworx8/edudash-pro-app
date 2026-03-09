/**
 * DashVoiceErrorBanner — Dismissible error banner for Dash Voice.
 *
 * Extracted from app/screens/dash-voice.tsx as part of the WARP refactor.
 */

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface DashVoiceErrorBannerProps {
  message: string;
  theme: any;
  onDismiss: () => void;
}

export function DashVoiceErrorBanner({ message, theme, onDismiss }: DashVoiceErrorBannerProps) {
  return (
    <View style={{
      marginTop: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: `${theme.error || '#ef4444'}66`,
      backgroundColor: `${theme.error || '#ef4444'}20`,
      paddingHorizontal: 12,
      paddingVertical: 10,
      flexDirection: 'row',
      alignItems: 'center',
    }}>
      <Ionicons name="warning-outline" size={16} color={theme.error || '#ef4444'} />
      <Text style={{ color: theme.error || '#ef4444', flex: 1, fontSize: 12, marginLeft: 8, marginRight: 8 }}>
        {message}
      </Text>
      <TouchableOpacity onPress={onDismiss}>
        <Ionicons name="close" size={14} color={theme.error || '#ef4444'} />
      </TouchableOpacity>
    </View>
  );
}
