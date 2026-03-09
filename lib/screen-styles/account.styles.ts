import { themedStyles } from '@/hooks/useThemedStyles';

interface AccountStyleArgs {
  theme: any;
  bottomInset: number;
  scrollBottomPadding: number;
  cosmicBackground: string;
  cosmicSurface: string;
  cosmicSurfaceStrong: string;
  cosmicBorder: string;
  cosmicBorderSoft: string;
  cosmicAccent: string;
  roleBadgeBackground: string;
}

export function createAccountScreenStyles({
  theme,
  bottomInset,
  scrollBottomPadding,
  cosmicBackground,
  cosmicSurface,
  cosmicSurfaceStrong,
  cosmicBorder,
  cosmicBorderSoft,
  cosmicAccent,
  roleBadgeBackground,
}: AccountStyleArgs) {
  return {
    container: { flex: 1, backgroundColor: cosmicBackground },
    scrollView: { flex: 1, backgroundColor: cosmicBackground },
    scrollContent: { paddingTop: 12, paddingBottom: scrollBottomPadding },
    settingsButton: { padding: 8 },
    profileHeader: {
      alignItems: "center" as const,
      paddingTop: 24,
      paddingBottom: 18,
      paddingHorizontal: 20,
      marginHorizontal: 16,
      marginBottom: 10,
      borderRadius: 28,
      backgroundColor: cosmicSurface,
      borderWidth: 1,
      borderColor: cosmicBorder,
      shadowColor: '#040817',
      shadowOffset: { width: 0, height: 16 },
      shadowOpacity: 0.36,
      shadowRadius: 24,
      elevation: 10,
    },
    avatarContainer: { position: "relative" as const, marginBottom: 10 },
    avatar: { width: 100, height: 100, borderRadius: 50 },
    avatarPlaceholder: {
      width: 100, height: 100, borderRadius: 50,
      backgroundColor: cosmicAccent,
      justifyContent: "center" as const, alignItems: "center" as const,
    },
    avatarText: { fontSize: 36, fontWeight: "600" as const, color: theme.onPrimary },
    cameraIconContainer: {
      position: "absolute" as const, bottom: 0, right: 0,
      backgroundColor: '#0fd3ff', borderRadius: 20,
      width: 32, height: 32,
      justifyContent: "center" as const, alignItems: "center" as const,
      borderWidth: 3, borderColor: cosmicSurfaceStrong,
    },
    loadingIcon: { width: 32, height: 32, justifyContent: "center" as const, alignItems: "center" as const },
    loadingText: { fontSize: 16, color: theme.onSecondary },
    displayName: { fontSize: 27, fontWeight: "700" as const, color: '#f8fbff', marginBottom: 4, textAlign: 'center' as const },
    email: { fontSize: 15, color: '#c1cef2', marginBottom: 10, textAlign: 'center' as const },
    roleBadge: {
      backgroundColor: roleBadgeBackground,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: cosmicBorder,
    },
    roleText: { fontSize: 12, fontWeight: "700" as const, color: '#f4f6ff' },
    infoSection: { paddingHorizontal: 16, paddingTop: 10 },
    sectionTitle: { fontSize: 18, fontWeight: "700" as const, color: '#f4f7ff', marginBottom: 14 },
    infoCard: {
      ...themedStyles.card(theme),
      backgroundColor: cosmicSurface,
      borderWidth: 1,
      borderColor: cosmicBorderSoft,
      borderRadius: 20,
      shadowColor: '#040817',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.18,
      shadowRadius: 18,
      elevation: 5,
    },
    infoRow: { flexDirection: "row" as const, alignItems: "center" as const },
    infoContent: { flex: 1, marginLeft: 16 },
    infoLabel: { fontSize: 13, color: '#9fb1dd', marginBottom: 2 },
    infoValue: { fontSize: 16, color: '#f3f6ff' },
    editButton: { padding: 8 },
    signOutButton: {
      flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "center" as const,
      marginHorizontal: 20, marginTop: 20, paddingVertical: 16,
      backgroundColor: cosmicSurface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: cosmicBorder,
      shadowColor: '#040817',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.22, shadowRadius: 16, elevation: 6,
    },
    signOutText: { fontSize: 16, fontWeight: "700" as const, color: theme.onError, marginLeft: 8, letterSpacing: 0.3 },
    modalOverlay: { flex: 1, backgroundColor: theme.modalOverlay, justifyContent: "flex-end" as const },
    modalContent: {
      backgroundColor: theme.modalBackground, borderTopLeftRadius: 20, borderTopRightRadius: 20,
      paddingTop: 20, paddingBottom: bottomInset + 20, maxHeight: "80%" as const,
    },
    modalHeader: {
      flexDirection: "row" as const, justifyContent: "space-between" as const, alignItems: "center" as const,
      paddingHorizontal: 20, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: theme.divider,
    },
    modalTitle: { fontSize: 20, fontWeight: "600" as const, color: theme.text },
    settingItem: {
      flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const,
      paddingVertical: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: theme.divider,
    },
    settingLeft: { flexDirection: "row" as const, alignItems: "center" as const, flex: 1 },
    settingText: { marginLeft: 16, flex: 1 },
    settingTitle: { fontSize: 16, fontWeight: "500" as const, color: theme.text, marginBottom: 2 },
    settingSubtitle: { fontSize: 14, color: theme.textSecondary },
    switchContainer: { marginLeft: 12 },
    editModalContainer: { flex: 1, backgroundColor: theme.background },
    editModalHeader: {
      flexDirection: "row" as const, justifyContent: "space-between" as const, alignItems: "center" as const,
      paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1,
      borderBottomColor: theme.divider, backgroundColor: theme.surface,
    },
    editModalCancel: { fontSize: 16, color: theme.error },
    editModalTitle: { fontSize: 18, fontWeight: "600" as const, color: theme.text },
    editModalSave: { fontSize: 16, color: theme.primary, fontWeight: "600" as const },
    editModalContent: { flex: 1 },
    editSection: { padding: 20 },
    editSectionTitle: { fontSize: 16, fontWeight: "600" as const, color: theme.text, marginBottom: 20 },
    editFieldContainer: { marginBottom: 20 },
    editFieldLabel: { fontSize: 14, color: theme.textSecondary, marginBottom: 8 },
    editFieldInput: { ...themedStyles.input(theme) },
    themeSettingsModal: { flex: 1, backgroundColor: theme.background },
    themeSettingsHeader: {
      flexDirection: "row" as const, alignItems: "center" as const,
      paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1,
      borderBottomColor: theme.divider, backgroundColor: theme.surface,
    },
    themeSettingsTitle: { fontSize: 18, fontWeight: "600" as const, color: theme.text, marginLeft: 16 },
  };
}
