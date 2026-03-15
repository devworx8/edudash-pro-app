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
  if (relativeCost <= 4) return 'Balanced';
  if (relativeCost <= 7) return 'Deep reasoning';
  return 'Heavy usage';
};

export const isLegacyModel = (model: AIModelInfo) =>
  model.displayName.toLowerCase().includes('legacy') || model.name.toLowerCase().includes('3.5');

export function splitModelsForPicker(
  models: AIModelInfo[],
  selectedModelId: AIModelId | string,
  canSelectModel?: (modelId: AIModelId) => boolean,
): { available: AIModelInfo[]; locked: AIModelInfo[] } {
  const available: AIModelInfo[] = [];
  const locked: AIModelInfo[] = [];
  for (const model of models) {
    (canSelectModel ? canSelectModel(model.id) : true) ? available.push(model) : locked.push(model);
  }
  available.sort((a, b) => (a.id === selectedModelId ? -1 : b.id === selectedModelId ? 1 : 0));
  return { available, locked };
}

export function CompactModelPicker({
  models,
  selectedModelId,
  canSelectModel,
  onSelectModel,
  onLockedPress,
  disabled = false,
  maxPopoverWidth = 340,
}: CompactModelPickerProps) {
  const { theme } = useTheme();
  const { width: windowWidth, height: windowHeight } = Dimensions.get('window');
  const triggerRef = useRef<View | null>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<AnchorFrame>({ x: 0, y: 0, width: 36, height: 36 });
  const isNativeSheet = Platform.OS !== 'web';

  const selectedModel = useMemo(
    () => models.find((m) => m.id === selectedModelId) || models[0],
    [models, selectedModelId],
  );

  const { available, locked } = useMemo(
    () => splitModelsForPicker(models, selectedModelId, canSelectModel),
    [models, selectedModelId, canSelectModel],
  );

  if (!selectedModel) return null;

  const selectedColor = getDashModelColor(selectedModel.id, theme.primary);
  const popoverWidth = Math.min(maxPopoverWidth, Math.max(300, windowWidth - 20));
  const preferredTop = anchor.y + anchor.height + 10;
  const webMaxHeight = Math.min(windowHeight * 0.7, 460);
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
    node.measureInWindow((x, y, w, h) => {
      setAnchor({ x, y, width: w, height: h });
      setOpen(true);
    });
  };

  const closePicker = () => setOpen(false);

  const renderRow = (model: AIModelInfo, isLocked: boolean) => {
    const color = getDashModelColor(model.id, theme.primary);
    const active = model.id === selectedModelId;
    const bg = active ? `${color}20` : isLocked ? theme.background : theme.surfaceVariant;
    const border = active ? `${color}66` : theme.border;

    return (
      <TouchableOpacity
        key={model.id}
        style={[styles.row, { backgroundColor: bg, borderColor: border }]}
        accessibilityRole="button"
        accessibilityLabel={
          isLocked
            ? `${model.displayName}. Locked. Requires ${model.minTier} tier.`
            : `${model.displayName}. Select model.`
        }
        onPress={() => {
          if (isLocked) {
            closePicker();
            onLockedPress?.(model.id);
            return;
          }
          onSelectModel(model.id);
          closePicker();
        }}
      >
        {/* Color dot */}
        <View style={[styles.dot, { backgroundColor: color }]} />

        {/* Info */}
        <View style={styles.rowInfo}>
          <View style={styles.nameRow}>
            <Text numberOfLines={1} style={[styles.name, { color: active ? color : theme.text }]}>
              {model.displayName}
            </Text>
            <View
              style={[
                styles.tierChip,
                { backgroundColor: `${color}18`, borderColor: `${color}44` },
              ]}
            >
              <Text style={[styles.tierChipText, { color }]}>{formatTierLabel(model.minTier)}</Text>
            </View>
            <Text style={[styles.weight, { color: theme.textSecondary }]}>
              x{model.relativeCost}
            </Text>
          </View>
          <Text numberOfLines={1} style={[styles.desc, { color: theme.textSecondary }]}>
            {model.description}
          </Text>
        </View>

        {/* Right icon */}
        <Ionicons
          name={isLocked ? 'lock-closed' : active ? 'checkmark-circle' : 'radio-button-off'}
          size={20}
          color={
            isLocked ? `${theme.textSecondary}88` : active ? color : `${theme.textSecondary}66`
          }
        />
      </TouchableOpacity>
    );
  };

  const pickerContent = (
    <>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Choose model</Text>
        <TouchableOpacity
          onPress={closePicker}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Close model picker"
          style={[
            styles.closeBtn,
            { backgroundColor: theme.surfaceVariant, borderColor: theme.border },
          ]}
        >
          <Ionicons name="close" size={15} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Model list */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {available.map((m) => renderRow(m, false))}

        {locked.length > 0 && (
          <View style={styles.divider}>
            <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
            <Ionicons name="sparkles" size={12} color={theme.textSecondary} />
            <Text style={[styles.dividerLabel, { color: theme.textSecondary }]}>Upgrade</Text>
            <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
          </View>
        )}
        {locked.map((m) => renderRow(m, true))}
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
          style={[styles.backdrop, isNativeSheet && styles.sheetBackdrop]}
          onPress={closePicker}
        >
          <Pressable
            style={[
              isNativeSheet ? styles.sheet : styles.popover,
              {
                width: isNativeSheet ? Math.min(windowWidth - 16, 400) : popoverWidth,
                maxHeight: isNativeSheet ? Math.min(windowHeight * 0.6, 440) : webMaxHeight,
                borderColor: theme.border,
                backgroundColor: theme.surface,
              },
              !isNativeSheet && { top, left },
            ]}
            onPress={(e) => e.stopPropagation?.()}
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
    backgroundColor: 'rgba(2, 6, 23, 0.88)',
  },
  sheetBackdrop: {
    justifyContent: 'flex-end',
    paddingHorizontal: 10,
    paddingBottom: 14,
  },
  popover: {
    position: 'absolute',
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 24,
    elevation: 20,
  },
  sheet: {
    alignSelf: 'center',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    overflow: 'hidden',
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
    marginBottom: 12,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.1,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flexShrink: 1,
  },
  scrollContent: {
    gap: 8,
    paddingBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  rowInfo: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  name: {
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
  },
  tierChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tierChipText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  weight: {
    fontSize: 10,
    fontWeight: '600',
    opacity: 0.7,
  },
  desc: {
    fontSize: 11.5,
    lineHeight: 15,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginVertical: 4,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    opacity: 0.5,
  },
  dividerLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
});
