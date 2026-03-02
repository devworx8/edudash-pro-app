/**
 * Compact Language Picker Button
 * 
 * Prominent, accessible language selector for header/toolbar
 * Shows current language code and opens selector modal
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getCurrentLanguage, type SupportedLanguage } from '@/lib/i18n';
import { useTheme } from '@/contexts/ThemeContext';
import { LanguageSelector } from './LanguageSelector';
import { track } from '@/lib/analytics';
import { ModalLayer } from './ModalLayer';

interface LanguagePickerButtonProps {
  variant?: 'compact' | 'full'; // compact shows flag+code, full shows flag+name
  showLabel?: boolean;
}

// Language to flag emoji mapping
const LANGUAGE_FLAGS: Record<SupportedLanguage, string> = {
  en: '🇬🇧',
  es: '🇪🇸',
  fr: '🇫🇷',
  pt: '🇵🇹',
  de: '🇩🇪',
  af: '🇿🇦', // Afrikaans (South Africa)
  zu: '🇿🇦', // Zulu (South Africa)
  st: '🇿🇦', // Sepedi (South Africa)
};

export const LanguagePickerButton: React.FC<LanguagePickerButtonProps> = ({
  variant = 'compact',
  showLabel = false,
}) => {
  const [modalVisible, setModalVisible] = useState(false);
  const { theme } = useTheme();
  const currentLang = getCurrentLanguage();
  const flag = LANGUAGE_FLAGS[currentLang] || '🌍';

  const handleOpenPicker = () => {
    track('edudash.language.picker_opened', {
      source: 'header_button',
      current_language: currentLang,
    });
    setModalVisible(true);
  };

  const handleLanguageSelect = (lang: SupportedLanguage) => {
    track('edudash.language.changed_via_header', {
      from: currentLang,
      to: lang,
      source: 'header_button',
    });
    setModalVisible(false);
  };

  return (
    <>
      <TouchableOpacity
        style={[
          styles.button,
          variant === 'full' && styles.buttonFull,
          { backgroundColor: theme.surface },
        ]}
        onPress={handleOpenPicker}
        accessibilityLabel="Change language"
        accessibilityRole="button"
        accessibilityHint="Opens language selection"
      >
        <Text style={styles.flag}>{flag}</Text>
        {variant === 'compact' && (
          <Text style={[styles.langCode, { color: theme.text }]}>
            {currentLang.toUpperCase()}
          </Text>
        )}
        {showLabel && (
          <Text style={[styles.label, { color: theme.textSecondary }]}>
            Language
          </Text>
        )}
        <Ionicons name="chevron-down" size={12} color={theme.textTertiary} />
      </TouchableOpacity>

      {/* Language Selector Modal */}
      <ModalLayer
        visible={modalVisible}
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: theme.background }]}>
          <View
            style={[
              styles.modalHeader,
              { backgroundColor: theme.surface, borderBottomColor: theme.divider },
            ]}
          >
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              Choose Language
            </Text>
            <TouchableOpacity
              onPress={() => setModalVisible(false)}
              style={styles.closeButton}
            >
              <Ionicons name="close" size={24} color={theme.text} />
            </TouchableOpacity>
          </View>
          <LanguageSelector
            onLanguageSelect={handleLanguageSelect}
            showComingSoon={true}
          />
        </View>
      </ModalLayer>
    </>
  );
};

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    minWidth: 60,
  },
  buttonFull: {
    minWidth: 100,
    paddingHorizontal: 12,
  },
  flag: {
    fontSize: 16,
  },
  langCode: {
    fontSize: 12,
    fontWeight: '600',
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default LanguagePickerButton;
