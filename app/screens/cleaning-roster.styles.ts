import { StyleSheet } from 'react-native';

export const createCleaningRosterStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.surface,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.text,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 28,
    gap: 12,
  },
  weekNav: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderRadius: 12,
    padding: 10,
  },
  weekButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.background,
  },
  weekLabelWrap: {
    flex: 1,
    alignItems: 'center',
  },
  weekLabel: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '700',
  },
  weekHint: {
    marginTop: 2,
    color: theme.textSecondary,
    fontSize: 12,
  },
  card: {
    backgroundColor: theme.surface,
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.text,
  },
  label: {
    color: theme.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: theme.text,
    backgroundColor: theme.background,
  },
  notesInput: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.background,
  },
  chipSelected: {
    borderColor: theme.primary,
    backgroundColor: `${theme.primary}20`,
  },
  chipText: {
    color: theme.text,
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextSelected: {
    color: theme.primary,
  },
  chipDisabled: {
    opacity: 0.4,
  },
  chipDisabledText: {
    color: theme.textSecondary,
  },
  primaryButton: {
    backgroundColor: theme.primary,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
  },
  primaryButtonText: {
    color: theme.onPrimary || '#fff',
    fontWeight: '700',
  },
  shiftCard: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    padding: 10,
    gap: 8,
  },
  shiftHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  shiftTitle: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '700',
  },
  shiftSubtitle: {
    marginTop: 2,
    color: theme.textSecondary,
    fontSize: 12,
  },
  assignmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  assignmentName: {
    color: theme.text,
    fontSize: 13,
    fontWeight: '600',
  },
  assignmentStatus: {
    color: theme.textSecondary,
    fontSize: 11,
  },
  smallButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: `${theme.primary}22`,
  },
  smallButtonText: {
    color: theme.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  smallDangerButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: `${theme.error}22`,
  },
  smallDangerButtonText: {
    color: theme.error,
    fontSize: 11,
    fontWeight: '700',
  },
  inlineLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inlineLoadingText: {
    color: theme.textSecondary,
    fontSize: 12,
  },
  errorText: {
    color: theme.error,
    fontSize: 12,
  },
  emptyText: {
    color: theme.textSecondary,
    fontSize: 13,
  },
  centerMessage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 8,
  },
  centerTitle: {
    color: theme.text,
    fontSize: 18,
    fontWeight: '700',
  },
  centerSubtitle: {
    color: theme.textSecondary,
    textAlign: 'center',
  },
});
