import React from 'react';
import { Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { MermaidRenderer } from './MermaidRenderer';
import { ImageViewer } from '@/components/messaging/ImageViewer';
import type { ExpandedVisualState } from './DashMessageBubble.utils';

interface ExpandedVisualModalProps {
  expandedVisual: ExpandedVisualState | null;
  onClose: () => void;
}

export const ExpandedVisualModal: React.FC<ExpandedVisualModalProps> = ({ expandedVisual, onClose }) => {
  const { theme } = useTheme();

  // Images get their own full-screen lightbox with pinch-zoom and swipe-to-dismiss
  if (expandedVisual?.type === 'image') {
    return (
      <ImageViewer
        visible
        imageUrl={expandedVisual.uri}
        imageName={expandedVisual.title}
        onClose={onClose}
      />
    );
  }

  return (
    <Modal
      visible={!!expandedVisual}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(2,6,23,0.84)',
          justifyContent: 'center',
          paddingHorizontal: 16,
          paddingVertical: 24,
        }}
      >
        <View
          style={{
            borderRadius: 16,
            borderWidth: 1,
            borderColor: theme.border,
            backgroundColor: theme.background,
            padding: 12,
            maxHeight: '92%',
            gap: 10,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700', flex: 1 }} numberOfLines={1}>
              {expandedVisual?.title || 'Expanded view'}
            </Text>
            <TouchableOpacity
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.surfaceVariant,
                borderWidth: 1,
                borderColor: theme.border,
              }}
              onPress={onClose}
              accessibilityLabel="Close expanded visual"
            >
              <Ionicons name="close" size={18} color={theme.text} />
            </TouchableOpacity>
          </View>

          {expandedVisual?.type === 'mermaid' && (
            <ScrollView showsVerticalScrollIndicator={false}>
              <MermaidRenderer definition={expandedVisual.definition} height={420} />
              <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 8 }}>
                Pinch zoom is supported in the system image viewer if you need larger detail.
              </Text>
            </ScrollView>
          )}

          {expandedVisual?.type === 'chart' && (
            <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ gap: 10 }}>
              <View
                style={{
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: theme.border,
                  backgroundColor: theme.surface,
                  padding: 10,
                  gap: 8,
                }}
              >
                {expandedVisual.chart.points.map((point, idx) => (
                  <View
                    key={`expanded-chart-${idx}`}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: point.color }} />
                      <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600', flexShrink: 1 }}>
                        {point.label}
                      </Text>
                    </View>
                    <Text style={{ color: theme.textSecondary, fontSize: 14, fontWeight: '700' }}>
                      {point.value}
                    </Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
};
