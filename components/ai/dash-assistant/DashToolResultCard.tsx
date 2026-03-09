import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Linking } from 'react-native';
import { toast } from '@/components/ui/ToastProvider';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { prettifyToolName, type ToolChartPreview } from './DashMessageBubble.utils';
import { openPdfPreview } from './pdfPreviewUtils';
import type { ExpandedVisualState } from './DashMessageBubble.utils';

interface DashToolResultCardProps {
  toolSuccess: boolean;
  rawToolName: string | null;
  toolMetaPills: string[];
  toolChartPreview: ToolChartPreview | null;
  isPdfToolOperation: boolean;
  hasPdfPreview: boolean;
  pdfPreviewUrl: string | null;
  pdfPreviewTarget: { url: string | null; storagePath: string | null };
  toolStoragePath: string | null;
  toolFilename: string | null;
  toolLinkStatus: string;
  toolWarning: string | null;
  toolDownloadUrl: string | null;
  toolRawPayload: string | null;
  allowRawToolPayload: boolean;
  assistantNarrative: string;
  conciseToolNarrative: string;
  showToolNarrativeToggle: boolean;
  toolErrorFriendly: string | null;
  onExpandVisual: (state: ExpandedVisualState) => void;
}

export const DashToolResultCard: React.FC<DashToolResultCardProps> = ({
  toolSuccess,
  rawToolName,
  toolMetaPills,
  toolChartPreview,
  isPdfToolOperation,
  hasPdfPreview,
  pdfPreviewUrl,
  pdfPreviewTarget,
  toolStoragePath,
  toolFilename,
  toolLinkStatus,
  toolWarning,
  toolDownloadUrl,
  toolRawPayload,
  allowRawToolPayload,
  assistantNarrative,
  conciseToolNarrative,
  showToolNarrativeToggle,
  toolErrorFriendly,
  onExpandVisual,
}) => {
  const { theme } = useTheme();
  const [showFullToolNarrative, setShowFullToolNarrative] = React.useState(false);
  const [showRawToolPayload, setShowRawToolPayload] = React.useState(false);

  return (
    <View
      style={{
        width: '100%',
        padding: 14,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: toolSuccess ? theme.primary + '44' : theme.error + '44',
        backgroundColor: toolSuccess ? theme.primary + '12' : theme.error + '10',
        gap: 8,
      }}
    >
      {/* Header row */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexGrow: 1, flexShrink: 1, minWidth: 0, paddingRight: 6 }}>
          <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: toolSuccess ? theme.primary + '22' : theme.error + '22' }}>
            <Ionicons name={toolSuccess ? 'checkmark-done-outline' : 'alert-circle-outline'} size={14} color={toolSuccess ? theme.primary : theme.error} />
          </View>
          <Text style={{ color: theme.text, fontSize: 13, fontWeight: '700', flexShrink: 1, flexGrow: 1, minWidth: 0 }} numberOfLines={1} ellipsizeMode="tail">
            {prettifyToolName(rawToolName || undefined)}
          </Text>
        </View>
        <View style={{ borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: toolSuccess ? theme.success + '22' : theme.error + '22', alignSelf: 'flex-start', flexShrink: 0 }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: toolSuccess ? (theme.success || '#16a34a') : theme.error, textTransform: 'uppercase' }}>
            {toolSuccess ? 'Done' : 'Error'}
          </Text>
        </View>
      </View>

      {/* Narrative */}
      {(conciseToolNarrative || assistantNarrative) && (
        <Text style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 18 }}>
          {showToolNarrativeToggle ? conciseToolNarrative : (conciseToolNarrative || assistantNarrative)}
        </Text>
      )}
      {showToolNarrativeToggle && (
        <TouchableOpacity onPress={() => setShowFullToolNarrative((p) => !p)} style={{ alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface }} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={showFullToolNarrative ? 'Hide full assistant response' : 'View full assistant response'}>
          <Text style={{ color: theme.text, fontSize: 11, fontWeight: '700' }}>{showFullToolNarrative ? 'Hide full response' : 'View full response'}</Text>
        </TouchableOpacity>
      )}
      {showToolNarrativeToggle && showFullToolNarrative && (
        <Text style={{ color: theme.textSecondary, fontSize: 12, lineHeight: 18 }}>{assistantNarrative}</Text>
      )}

      {/* Meta pills */}
      {toolMetaPills.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {toolMetaPills.map((pill) => (
            <View key={pill} style={{ borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface }}>
              <Text style={{ color: theme.text, fontSize: 11, fontWeight: '600' }}>{pill}</Text>
            </View>
          ))}
        </View>
      )}

      {/* PDF export card */}
      {isPdfToolOperation && (
        <View style={{ borderRadius: 12, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, padding: 10, gap: 5 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="document-text-outline" size={15} color={theme.primary} />
            <Text style={{ color: theme.text, fontSize: 12, fontWeight: '700' }}>PDF Export</Text>
          </View>
          {toolFilename && <Text style={{ color: theme.textSecondary, fontSize: 12 }} numberOfLines={1}>{toolFilename}</Text>}
          <Text style={{ color: theme.textSecondary, fontSize: 11 }}>{toolLinkStatus || 'File prepared'}</Text>
          {toolWarning && <Text style={{ color: theme.warning || '#d97706', fontSize: 11 }} numberOfLines={2}>{toolWarning}</Text>}
          {hasPdfPreview && (
            <TouchableOpacity onPress={() => void openPdfPreview(pdfPreviewUrl || '', toolFilename || 'Generated PDF', pdfPreviewTarget.storagePath || toolStoragePath || undefined)} style={{ alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: theme.primary + '55', backgroundColor: theme.primary + '18', marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 6 }} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Preview generated PDF">
              <Ionicons name="document-text-outline" size={13} color={theme.primary} />
              <Text style={{ color: theme.primary, fontSize: 11, fontWeight: '700' }}>Preview PDF</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Chart preview */}
      {toolChartPreview && (
        <View style={{ borderRadius: 14, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, padding: 12, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <Text style={{ color: theme.text, fontSize: 13, fontWeight: '700', flex: 1 }}>{toolChartPreview.title}</Text>
            <View style={{ borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surfaceVariant }}>
              <Text style={{ color: theme.textSecondary, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' }}>{toolChartPreview.type}</Text>
            </View>
          </View>
          {toolChartPreview.type === 'pie' ? (
            <>
              <View style={{ height: 14, borderRadius: 999, overflow: 'hidden', flexDirection: 'row', backgroundColor: theme.surfaceVariant || '#e2e8f0' }}>
                {toolChartPreview.points.map((pt, i) => (
                  <View key={`pie-seg-${i}`} style={{ flex: Math.max(Math.abs(pt.value), 0.5), backgroundColor: pt.color }} />
                ))}
              </View>
              <View style={{ gap: 6 }}>
                {toolChartPreview.points.map((pt, i) => (
                  <View key={`pie-leg-${i}`} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, marginRight: 8 }}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: pt.color }} />
                      <Text style={{ color: theme.textSecondary, fontSize: 12, flexShrink: 1 }} numberOfLines={1}>{pt.label}</Text>
                    </View>
                    <Text style={{ color: theme.text, fontSize: 12, fontWeight: '700' }}>{pt.value}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, minHeight: 120 }}>
                {(() => {
                  const maxValue = Math.max(1, ...toolChartPreview.points.map((pt) => Math.abs(pt.value)));
                  return toolChartPreview.points.map((pt, i) => {
                    const barHeight = Math.max(12, Math.round((Math.abs(pt.value) / maxValue) * 84));
                    return (
                      <View key={`bar-${i}`} style={{ width: 46, alignItems: 'center', gap: 4 }}>
                        <Text style={{ color: theme.text, fontSize: 11, fontWeight: '700' }}>{pt.value}</Text>
                        <View style={{ width: 28, borderRadius: 7, backgroundColor: pt.color, height: barHeight }} />
                        <Text style={{ color: theme.textSecondary, fontSize: 10, textAlign: 'center' }} numberOfLines={1}>{pt.label}</Text>
                      </View>
                    );
                  });
                })()}
              </View>
            </ScrollView>
          )}
          <TouchableOpacity onPress={() => onExpandVisual({ type: 'chart', title: toolChartPreview.title, chart: toolChartPreview })} style={{ alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: theme.primary + '55', backgroundColor: theme.primary + '16' }} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Expand chart for easier viewing">
            <Text style={{ color: theme.primary, fontSize: 11, fontWeight: '700' }}>Expand chart</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Download */}
      {toolDownloadUrl && (
        <TouchableOpacity onPress={async () => { try { const ok = await Linking.canOpenURL(toolDownloadUrl); if (!ok) throw new Error('UNSUPPORTED_URL'); await Linking.openURL(toolDownloadUrl); } catch { toast.error('Unable to open file. Please try again from a stable connection.'); } }} style={{ alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: theme.primary + '55', backgroundColor: theme.primary + '16', flexDirection: 'row', alignItems: 'center', gap: 6 }} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Open generated file">
          <Ionicons name="open-outline" size={14} color={theme.primary} />
          <Text style={{ color: theme.primary, fontSize: 12, fontWeight: '700' }}>{isPdfToolOperation ? 'Open Externally' : 'Open Generated File'}</Text>
        </TouchableOpacity>
      )}

      {/* Raw payload toggle */}
      {allowRawToolPayload && toolRawPayload && (
        <TouchableOpacity onPress={() => setShowRawToolPayload((p) => !p)} style={{ alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface }} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={showRawToolPayload ? 'Hide raw tool output' : 'View raw tool output'}>
          <Text style={{ color: theme.text, fontSize: 11, fontWeight: '700' }}>{showRawToolPayload ? 'Hide raw output' : 'View raw output'}</Text>
        </TouchableOpacity>
      )}
      {allowRawToolPayload && showRawToolPayload && toolRawPayload && (
        <View style={{ borderRadius: 10, borderWidth: 1, borderColor: theme.border, backgroundColor: '#0f172a', maxHeight: 220, overflow: 'hidden' }}>
          <ScrollView style={{ maxHeight: 220 }} contentContainerStyle={{ padding: 10 }} nestedScrollEnabled showsVerticalScrollIndicator>
            <Text selectable style={{ color: '#cbd5e1', fontFamily: 'monospace', fontSize: 11, lineHeight: 16 }}>{toolRawPayload}</Text>
          </ScrollView>
        </View>
      )}

      {/* Error */}
      {!toolSuccess && toolErrorFriendly && (
        <Text style={{ color: theme.error, fontSize: 12, lineHeight: 17 }}>{toolErrorFriendly}</Text>
      )}
    </View>
  );
};
