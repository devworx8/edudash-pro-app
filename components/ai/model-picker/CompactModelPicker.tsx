import React, { useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import type { AIModelId, AIModelInfo } from '@/lib/ai/models';
import { getDashModelColor } from '@/lib/ai/modelPalette';
import { CosmicOrb } from '@/components/dash-orb/CosmicOrb';

type AnchorFrame = { x: number; y: number; width: number; height: number };

interface CompactModelPickerProps {
  models: AIModelInfo[];
  selectedModelId: AIModelId | string;
  canSelectModel?: (modelId: AIModelId) => boolean;
  onSelectModel: (modelId: AIModelId) => void;
  onLockedPress?: (modelId: AIModelId) => void;
  disabled?: boolean;
  maxPopoverWidth?: number;
}

const formatTierLabel = (tier: string): string => {
  switch (tier) {
    case 'free':
      return 'Free';
    case 'starter':
      return 'Starter';
    case 'premium':
      return 'Premium';
    case 'enterprise':
      return 'Enterprise';
    default:
      return tier;
  }
};

export const formatModelUsageLabel = (relativeCost: number): string => {
  if (relativeCost <= 2) return 'Light usage';
  if (relativeCost <= 5) return 'Balanced usage';
  if (relativeCost <= 8) return 'Deep reasoning';
  return 'Heavy usage';
};

const isLegacyModel = (model: AIModelInfo) =>
  model.displayName.toLowerCase().includes('legacy') || model.name.toLowerCase().includes('3.5');

export function splitModelsForPicker(
  models: AIModelInfo[],
  selectedModelId: AIModelId | string,
  canSelectModel?: (modelId: AIModelId) => boolean,
): { available: AIModelInfo[]; locked: AIModelInfo[] } {
  const available: AIModelInfo[] = [];
  const locked: AIModelInfo[] = [];

  for (const model of models) {
    const isAllowed = canSelectModel ? canSelectModel(model.id) : true;
    if (isAllowed) {
      available.push(model);
    } else {
      locked.push(model);
    }
  }

  available.sort((left, right) => {
    if (left.id === selectedModelId) return -1;
    if (right.id === selectedModelId) return 1;
    return 0;
  });

  return { available, locked };
}

export function CompactModelPicker({
  models,
  selectedModelId,
  canSelectModel,
  onSelectModel,
  onLockedPress,
  disabled = false,
  maxPopoverWidth = 320,
}: CompactModelPickerProps) {
  const { theme } = useTheme();
  const { width: windowWidth, height: windowHeight } = Dimensions.get('window');
  const triggerRef = useRef<View | null>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<AnchorFrame>({ x: 0, y: 0, width: 36, height: 36 });
  const isNativeSheet = Platform.OS !== 'web';

  const selectedModel = useMemo(
    () => models.find((model) => model.id === selectedModelId) || models[0],
    [models, selectedModelId],
  );

  const { available, locked } = useMemo(
    () => splitModelsForPicker(models, selectedModelId, canSelectModel),
    [models, selectedModelId, canSelectModel],
  );

  if (!selectedModel) return null;

  const selectedColor = getDashModelColor(selectedModel.id, theme.primary);
  const popoverWidth = Math.min(maxPopoverWidth, Math.max(280, windowWidth - 24));
  const preferredTop = anchor.y + anchor.height + 10;
  const webMaxHeight = Math.min(windowHeight * 0.66, 420);
  const showAbove = preferredTop + webMaxHeight > windowHeight - 12;
  const left = Math.min(
    Math.max(12, anchor.x + anchor.width - popoverWidth),
    Math.max(12, windowWidth - popoverWidth - 12),
  );
  const top = showAbove
    ? Math.max(12, anchor.y - webMaxHeight - 10)
    : Math.max(12, Math.min(preferredTop, windowHeight - webMaxHeight - 12));

  const openPicker = () => {
    if (disabled) return;
    if (isNativeSheet) {
      setOpen(true);
      return;
    }
    const node = triggerRef.current as {
      measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void;
    } | null;
    if (!node?.measureInWindow) {
      setOpen(true);
      return;
    }
    node.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
      setOpen(true);
    });
  };

  const closePicker = () => setOpen(false);

  const renderModelRow = (model: AIModelInfo, lockedRow: boolean) => {
    const modelColor = getDashModelColor(model.id, theme.primary);
    const active = model.id === selectedModelId;
    const legacy = isLegacyModel(model);

    return (
      <TouchableOpacity
        key={model.id}
        style={[
          styles.row,
          {
            borderColor: active ? `${modelColor}D6` : theme.border,
            backgroundColor: active ? `${modelColor}1E` : theme.surfaceVariant,
          },
          active && styles.activeRow,
          lockedRow && styles.lockedRow,
        ]}
        accessibilityRole="button"
        accessibilityLabel={
          lockedRow
            ? `${model.displayName}. Locked. Requires ${model.minTier} tier.`
            : `${model.displayName}. Select model.`
        }
        onPress={() => {
          if (lockedRow) {
            closePicker();
            onLockedPress?.(model.id);
            return;
          }
          onSelectModel(model.id);
          closePicker();
        }}
      >
        <View style={[styles.rowAccent, { backgroundColor: modelColor }]} />
        <View style={styles.rowBody}>
          <View style={styles.nameRow}>
            <Text
              numberOfLines={1}
              style={[styles.name, { color: active ? modelColor : theme.text }]}
            >
              {model.displayName}
            </Text>
            {active ? (
              <View style={[styles.badge, { backgroundColor: `${modelColor}26`, borderColor: `${modelColor}66` }]}>
                <Text style={[styles.badgeText, { color: modelColor }]}>Current</Text>
              </View>
            ) : null}
            {legacy ? (
              <View style={[styles.badge, { backgroundColor: theme.background, borderColor: theme.border }]}>
                <Text style={[styles.badgeText, { color: theme.textSecondary }]}>Legacy</Text>
              </View>
            ) : null}
          </View>
          <Text numberOfLines={2} style={[styles.description, { color: theme.textSecondary }]}>
            {model.description}
          </Text>
          <View style={styles.metaRow}>
            <View style={[styles.metaPill, { backgroundColor: theme.background, borderColor: theme.border }]}>
              <Text style={[styles.metaText, { color: theme.textSecondary }]}>
                {formatModelUsageLabel(model.relativeCost)}
              </Text>
            </View>
            <View style={[styles.metaPill, { backgroundColor: `${modelColor}16`, borderColor: `${modelColor}4A` }]}>
              <Text style={[styles.metaText, { color: active ? modelColor : theme.textSecondary }]}>
                {lockedRow ? `Requires ${formatTierLabel(model.minTier)}` : formatTierLabel(model.minTier)}
              </Text>
            </View>
          </View>
        </View>
        <Ionicons
          name={lockedRow ? 'lock-closed' : active ? 'checkmark-circle' : 'chevron-forward'}
          size={18}
          color={lockedRow ? theme.textSecondary : active ? modelColor : theme.textSecondary}
        />
      </TouchableOpacity>
    );
  };

  const pickerContent = (
    <>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: theme.text }]}>Choose Dash model</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            {available.length} ready now{locked.length ? ` • ${locked.length} upgrade options` : ''}
          </Text>
        </View>
        <TouchableOpacity
          onPress={closePicker}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Close model picker"
          style={[styles.closeButton, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}
        >
          <Ionicons name="close" size={16} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>

      <View
        style={[
          styles.selectedCard,
          {
            borderColor: `${selectedColor}9A`,
            backgroundColor: `${selectedColor}16`,
          },
        ]}
      >
        <View style={styles.selectedOrbWrap}>
          <CosmicOrb size={42} isProcessing={false} isSpeaking={false} />
        </View>
        <View style={styles.selectedContent}>
          <Text style={[styles.selectedLabel, { color: theme.textSecondary }]}>Current model</Text>
          <Text style={[styles.selectedName, { color: theme.text }]}>{selectedModel.displayName}</Text>
          <Text style={[styles.selectedDescription, { color: theme.textSecondary }]} numberOfLines={2}>
            {selectedModel.description}
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {available.length > 0 ? (
          <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Included in your plan</Text>
        ) : null}
        {available.map((model) => renderModelRow(model, false))}

        {locked.length > 0 ? (
          <Text style={[styles.sectionLabel, styles.sectionLabelLocked, { color: theme.textSecondary }]}>
            Upgrade for more power
          </Text>
        ) : null}
        {locked.map((model) => renderModelRow(model, true))}
      </ScrollView>
    </>
  );

  return (
    <>
      <View ref={triggerRef} collapsable={false}>
        <TouchableOpacity
          style={[
            styles.trigger,
            {
              backgroundColor: `${selectedColor}30`,
              borderColor: `${selectedColor}B3`,
              opacity: disabled ? 0.55 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Model selector. Active model ${selectedModel.displayName}.`}
          disabled={disabled}
          onPress={openPicker}
        >
          <Ionicons name="hardware-chip-outline" size={17} color={selectedColor} />
        </TouchableOpacity>
      </View>

      <Modal
        visible={open}
        transparent
        animationType={isNativeSheet ? 'slide' : 'fade'}
        statusBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={closePicker}
      >
        <Pressable
          style={[styles.backdrop, isNativeSheet ? styles.sheetBackdrop : null]}
          onPress={closePicker}
        >
          <Pressable
            style={[
              isNativeSheet ? styles.sheet : styles.popover,
              {
                width: isNativeSheet ? Math.min(windowWidth - 16, 420) : popoverWidth,
                maxHeight: isNativeSheet ? Math.min(windowHeight * 0.78, 560) : webMaxHeight,
                borderColor: theme.border,
                backgroundColor: theme.surface,
              },
              !isNativeSheet ? { top, left } : null,
            ]}
            onPress={(event) => event.stopPropagation?.()}
          >
            {pickerContent}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

export default CompactModelPicker;

const styles = StyleSheet.create({
  trigger: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.62)',
  },
  sheetBackdrop: {
    justifyContent: 'flex-end',
    paddingHorizontal: 8,
    paddingBottom: 12,
  },
  popover: {
    position: 'absolute',
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 24,
    elevation: 20,
  },
  sheet: {
    alignSelf: 'center',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.3,
    shadowRadius: 26,
    elevation: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  headerCopy: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.1,
  },
  subtitle: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '600',
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedCard: {
    marginTop: 14,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  selectedOrbWrap: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedContent: {
    flex: 1,
  },
  selectedLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  selectedName: {
    marginTop: 3,
    fontSize: 15,
    fontWeight: '800',
  },
  selectedDescription: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
  },
  scroll: {
    marginTop: 12,
  },
  scrollContent: {
    paddingBottom: 4,
    gap: 10,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.55,
    paddingHorizontal: 2,
  },
  sectionLabelLocked: {
    marginTop: 4,
  },
  row: {
    minHeight: 86,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  activeRow: {
    shadowColor: '#020617',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 6,
  },
  lockedRow: {
    opacity: 0.92,
  },
  rowAccent: {
    width: 10,
    height: 54,
    borderRadius: 999,
  },
  rowBody: {
    flex: 1,
    gap: 6,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  name: {
    fontSize: 15,
    fontWeight: '800',
    flexShrink: 1,
  },
  description: {
    fontSize: 12,
    lineHeight: 17,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  metaPill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  metaText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  badge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.25,
  },
});
