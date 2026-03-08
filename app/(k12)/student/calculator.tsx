/**
 * Casio-style scientific calculator screen for K-12 students.
 * Accessible from student dashboard and nav as "Calculator".
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useNextGenTheme } from '@/contexts/K12NextGenThemeContext';
import { CasioStyleCalculator } from '@/components/calculator/CasioStyleCalculator';

export default function K12StudentCalculatorScreen() {
  const { theme } = useNextGenTheme();
  const { t } = useTranslation();
  const title = t('calculator.title', { defaultValue: 'Calculator' });
  const subtitle = t('calculator.subtitle', {
    defaultValue: 'Scientific calculator for maths and science.',
  });

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors?.background ?? theme.background }]}
      edges={['top', 'bottom']}
    >
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[
            styles.backBtn,
            {
              backgroundColor: theme.colors?.surfaceVariant ?? theme.surfaceVariant,
              borderColor: theme.colors?.border ?? theme.border,
            },
          ]}
          accessibilityLabel={t('common.back', { defaultValue: 'Back' })}
        >
          <Ionicons name="arrow-back" size={22} color={theme.colors?.text ?? theme.text} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: theme.colors?.text ?? theme.text }]}>{title}</Text>
          <Text style={[styles.subtitle, { color: theme.colors?.textSecondary ?? theme.textSecondary }]}>
            {subtitle}
          </Text>
        </View>
      </View>

      <View style={styles.calcWrapper}>
        <CasioStyleCalculator />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  calcWrapper: {
    flex: 1,
    padding: 16,
    paddingBottom: 24,
  },
});
