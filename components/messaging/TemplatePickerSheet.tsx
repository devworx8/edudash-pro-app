/**
 * TemplatePickerSheet — Bottom sheet for picking message templates.
 * Shows category chips + searchable template list.
 * Selecting a template inserts the body text into the composer.
 */

import React, { useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableWithoutFeedback,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useMessageTemplates } from '@/hooks/messaging/useMessageTemplates';
import type { MessageTemplate, TemplateCategory } from '@/lib/messaging/defaultTemplates';

interface TemplatePickerSheetProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (template: MessageTemplate) => void;
}

export function TemplatePickerSheet({ visible, onClose, onSelect }: TemplatePickerSheetProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: viewportWidth } = useWindowDimensions();
  const {
    templates,
    categories,
    selectedCategory,
    setSelectedCategory,
    search,
    setSearch,
  } = useMessageTemplates();

  const handleSelect = useCallback(
    (template: MessageTemplate) => {
      onSelect(template);
      onClose();
    },
    [onSelect, onClose],
  );

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={s.backdrop} />
      </TouchableWithoutFeedback>

      <View style={[s.sheet, {
        backgroundColor: theme.surface,
        paddingBottom: insets.bottom + 16,
        maxWidth: Platform.OS === 'web' ? Math.min(viewportWidth, 760) : undefined,
      }]}>
        {/* Handle */}
        <View style={[s.handle, { backgroundColor: theme.border }]} />

        {/* Title */}
        <View style={s.header}>
          <Text style={[s.title, { color: theme.text }]}>Message Templates</Text>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={24} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={[s.searchBox, { backgroundColor: theme.elevated, borderColor: theme.border }]}>
          <Ionicons name="search" size={18} color={theme.textSecondary} />
          <TextInput
            style={[s.searchInput, { color: theme.text }]}
            placeholder="Search templates..."
            placeholderTextColor={theme.textSecondary}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        {/* Category chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipRow} contentContainerStyle={s.chipRowContent}>
          <TouchableOpacity
            style={[s.chip, !selectedCategory && { backgroundColor: theme.primary }]}
            onPress={() => setSelectedCategory(null)}
          >
            <Text style={[s.chipText, { color: !selectedCategory ? '#fff' : theme.text }]}>All</Text>
          </TouchableOpacity>
          {categories.map((cat) => (
            <TouchableOpacity
              key={cat.key}
              style={[s.chip, selectedCategory === cat.key && { backgroundColor: theme.primary }]}
              onPress={() => setSelectedCategory(selectedCategory === cat.key ? null : cat.key)}
            >
              <Ionicons
                name={cat.icon as any}
                size={14}
                color={selectedCategory === cat.key ? '#fff' : theme.textSecondary}
              />
              <Text style={[s.chipText, { color: selectedCategory === cat.key ? '#fff' : theme.text }]}>
                {cat.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Template list */}
        <ScrollView style={s.list} showsVerticalScrollIndicator={false}>
          {templates.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="document-text-outline" size={36} color={theme.textSecondary} />
              <Text style={[s.emptyText, { color: theme.textSecondary }]}>No templates found</Text>
            </View>
          ) : (
            templates.map((tpl) => (
              <TouchableOpacity
                key={tpl.id}
                style={[s.templateItem, { backgroundColor: theme.elevated, borderColor: theme.border }]}
                onPress={() => handleSelect(tpl)}
                activeOpacity={0.7}
              >
                <Text style={[s.templateTitle, { color: theme.text }]}>{tpl.title}</Text>
                <Text style={[s.templateBody, { color: theme.textSecondary }]} numberOfLines={2}>
                  {tpl.body}
                </Text>
                {tpl.variables.length > 0 && (
                  <View style={s.varRow}>
                    {tpl.variables.map((v) => (
                      <View key={v} style={[s.varBadge, { backgroundColor: `${theme.primary}20` }]}>
                        <Text style={[s.varText, { color: theme.primary }]}>{`{{${v}}}`}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '75%',
    alignSelf: 'center',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 40,
    gap: 8,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },
  chipRow: {
    maxHeight: 44,
    marginBottom: 8,
  },
  chipRowContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(148,163,184,0.15)',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  list: {
    paddingHorizontal: 16,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  emptyText: {
    fontSize: 14,
  },
  templateItem: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
  },
  templateTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  templateBody: {
    fontSize: 13,
    lineHeight: 18,
  },
  varRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 8,
  },
  varBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  varText: {
    fontSize: 11,
    fontWeight: '500',
  },
});
