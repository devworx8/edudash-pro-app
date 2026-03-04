import { StyleSheet } from 'react-native';
import type { ThemeColors } from '@/contexts/ThemeContext';

export const createStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: theme.surface,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.border,
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.text,
      marginBottom: 4,
    },
    subtitle: {
      fontSize: 13,
      color: theme.textSecondary,
      marginBottom: 12,
    },
    loadingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    label: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.textSecondary,
      marginBottom: 6,
    },
    muted: {
      fontSize: 12,
      color: theme.textSecondary,
    },
    memoriesRow: {
      marginTop: 12,
      gap: 6,
    },
    memoriesButton: {
      alignSelf: 'flex-start',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: theme.primary,
    },
    memoriesButtonText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#fff',
    },
    classRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 12,
    },
    classChip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: theme.background,
      borderWidth: 1,
      borderColor: theme.border,
    },
    classChipText: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.text,
    },
    birthdayPicker: {
      marginBottom: 12,
    },
    windowRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 8,
    },
    windowChip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: theme.background,
      borderWidth: 1,
      borderColor: theme.border,
    },
    windowChipText: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.text,
    },
    birthdayPickerList: {
      gap: 8,
    },
    helperText: {
      fontSize: 11,
      color: theme.textSecondary,
      marginTop: 6,
    },
    birthdayChip: {
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: theme.background,
      borderWidth: 1,
      borderColor: theme.border,
    },
    birthdayChipName: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.text,
    },
    birthdayChipMeta: {
      fontSize: 11,
      color: theme.textSecondary,
      marginTop: 2,
    },
    birthdayCard: {
      backgroundColor: theme.background,
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: 12,
    },
    birthdayName: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.text,
      marginBottom: 4,
    },
    summaryGrid: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 12,
    },
    summaryItem: {
      flex: 1,
      backgroundColor: theme.background,
      padding: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
    },
    summaryLabel: {
      fontSize: 11,
      color: theme.textSecondary,
    },
    summaryValue: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.text,
      marginTop: 4,
    },
    formSection: {
      marginBottom: 12,
    },
    methodRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    methodChip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: theme.background,
      borderWidth: 1,
      borderColor: theme.border,
    },
    methodText: {
      fontSize: 12,
      color: theme.text,
      fontWeight: '600',
    },
    listSection: {
      marginTop: 12,
    },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 10,
    },
    searchInput: {
      flex: 1,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.background,
      color: theme.text,
      fontSize: 13,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    searchClearButton: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.background,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    searchClearText: {
      color: theme.textSecondary,
      fontSize: 12,
      fontWeight: '600',
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 8,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.text,
      marginBottom: 8,
    },
    sectionTitleInline: {
      marginBottom: 0,
    },
    reminderButton: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.primary,
    },
    reminderButtonDisabled: {
      borderColor: theme.border,
      backgroundColor: theme.background,
    },
    reminderButtonText: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.primary,
    },
    reminderButtonTextDisabled: {
      color: theme.textSecondary,
    },
    reminderScopeSection: {
      marginBottom: 8,
    },
    studentListScroll: {
      maxHeight: 360,
    },
    studentListContent: {
      paddingBottom: 6,
    },
    studentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    studentName: {
      fontSize: 13,
      color: theme.text,
    },
    payButton: {
      backgroundColor: theme.primary,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 6,
    },
    payButtonText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#fff',
    },
    paidBadge: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.success,
    },
    paidActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    unpayButton: {
      borderWidth: 1,
      borderColor: theme.error,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 4,
    },
    unpayButtonText: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.error,
    },
    errorText: {
      marginTop: 8,
      color: theme.error,
      fontSize: 12,
    },
  });
