/**
 * DashVoiceTranscriptPanel — Caption display: user transcript + AI response.
 *
 * Extracted from app/screens/dash-voice.tsx as part of the WARP refactor.
 */

import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCaptionCard } from '@/components/ui/GlassCaptionCard';
import { s } from '@/app/screens/dash-voice.styles';

interface DashVoiceTranscriptPanelProps {
  liveUserTranscript: string;
  lastUserTranscript: string;
  displayedText: string;
  isProcessing: boolean;
  streamingText: string;
  ccScrollRef: React.RefObject<ScrollView | null>;
  onEditTranscript: (text: string) => void;
}

export function DashVoiceTranscriptPanel({
  liveUserTranscript,
  lastUserTranscript,
  displayedText,
  isProcessing,
  streamingText,
  ccScrollRef,
  onEditTranscript,
}: DashVoiceTranscriptPanelProps) {
  const userText = liveUserTranscript.trim() || lastUserTranscript.trim();

  return (
    <View style={{ width: '100%', marginBottom: 12 }}>
      {userText ? (
        <TouchableOpacity
          activeOpacity={0.75}
          onPress={() => onEditTranscript(userText)}
          style={{
            marginBottom: 10,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: 'rgba(99,102,241,0.45)',
            backgroundColor: 'rgba(15,23,42,0.55)',
            paddingHorizontal: 14,
            paddingVertical: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            shadowColor: '#06b6d4',
            shadowOpacity: 0.35,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 0 },
            elevation: 6,
          }}
          accessibilityLabel="Edit what Dash heard"
        >
          <View style={{ flex: 1 }}>
            <Text style={{ color: 'rgba(148,163,184,0.9)', fontSize: 11, marginBottom: 4, letterSpacing: 0.4 }}>
              You said — tap to correct
            </Text>
            <Text style={{
              color: '#e2e8f0',
              fontSize: 15,
              lineHeight: 20,
              textShadowColor: 'rgba(6,182,212,0.4)',
              textShadowOffset: { width: 0, height: 0 },
              textShadowRadius: 6,
            }}>
              {userText}
            </Text>
          </View>
          <Ionicons name="create-outline" size={18} color="#06b6d4" />
        </TouchableOpacity>
      ) : null}

      <GlassCaptionCard streaming={!!streamingText}>
        <ScrollView
          ref={ccScrollRef}
          style={{ maxHeight: 480 }}
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => ccScrollRef.current?.scrollToEnd({ animated: true })}
          contentContainerStyle={{ paddingBottom: 30 }}
        >
          <Text style={[
            s.responseText,
            {
              color: '#ffffff',
              fontSize: 22,
              lineHeight: 32,
              textShadowColor: 'rgba(99,102,241,0.6)',
              textShadowOffset: { width: 0, height: 0 },
              textShadowRadius: 8,
            },
          ]}>
            {displayedText || (isProcessing ? '…' : '')}
          </Text>
        </ScrollView>
      </GlassCaptionCard>
    </View>
  );
}
