import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  ScrollView,
  RefreshControl,
  Platform,
} from "react-native";
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBottomInset } from '@/hooks/useBottomInset';
import * as ImagePicker from "expo-image-picker";
import { Stack, router } from 'expo-router';
import {
  getEnabled as getBiometricsEnabled,
  setEnabled as setBiometricsEnabled,
  isHardwareAvailable,
  isEnrolled,
} from "@/lib/biometrics";
import { BiometricAuthService } from "@/services/BiometricAuthService";
import { EnhancedBiometricAuth } from "@/services/EnhancedBiometricAuth";
import { assertSupabase } from "@/lib/supabase";
import { ensureImageLibraryPermission } from "@/lib/utils/mediaLibrary";
import { ImageConfirmModal } from "@/components/ui/ImageConfirmModal";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useTranslation } from "react-i18next";
import { useThemedStyles } from "@/hooks/useThemedStyles";
import ProfileImageService from '@/services/ProfileImageService';
import { AlertModal, useAlertModal, type AlertButton } from '@/components/ui/AlertModal';
import { createAccountScreenStyles } from '@/lib/screen-styles/account.styles';

// Extracted components
import {
  ProfileHeader,
  ProfileInfoCards,
  SettingsModal,
  EditProfileModal,
  ThemeSettingsModal,
  AccountActions,
  OrganizationSwitcher,
  ProfileSwitcher,
} from '@/components/account';

export default function AccountScreen() {
  const { theme, mode } = useTheme();
  const { refreshProfile } = useAuth();
  const { t } = useTranslation();
  const { showAlert, alertProps } = useAlertModal();
  const bottomInset = useBottomInset();
  const [refreshing, setRefreshing] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [school, setSchool] = useState<string | null>(null);
  const [firstName, setFirstName] = useState<string | null>(null);
  const [lastName, setLastName] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [displayUri, setDisplayUri] = useState<string | null>(null);
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricEnrolled, setBiometricEnrolled] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [pendingImageUri, setPendingImageUri] = useState<string | null>(null);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showProfileSwitcher, setShowProfileSwitcher] = useState(false);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [showThemeSettings, setShowThemeSettings] = useState(false);
  const [showOrgSwitcher, setShowOrgSwitcher] = useState(false);
  const [hasMultipleOrgs, setHasMultipleOrgs] = useState(false);

  const showAppAlert = useCallback((
    title: string,
    message: string,
    buttons?: AlertButton[],
  ) => {
    showAlert({ title, message, buttons });
  }, [showAlert]);

  // Tab bar is typically ~56–64px; account screen is often shown with bottom nav visible.
  // Exclude bottom from safe area so we don't double-count and clip content; add padding so Sign Out scrolls above tab bar.
  const TAB_BAR_HEIGHT = 64;
  const scrollBottomPadding = TAB_BAR_HEIGHT + bottomInset + 24;
  const cosmicBackground = '#07101f';
  const cosmicSurface = 'rgba(16, 26, 52, 0.9)';
  const cosmicSurfaceStrong = 'rgba(12, 20, 40, 0.96)';
  const cosmicBorder = 'rgba(125, 211, 252, 0.14)';
  const cosmicBorderSoft = 'rgba(255,255,255,0.08)';
  const cosmicAccent = '#7c5cff';
  const roleBadgeBackground = 'rgba(124, 92, 255, 0.2)';

  const styles = useThemedStyles((theme) =>
    createAccountScreenStyles({
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
    }),
  );

  // Load user data
  const load = useCallback(async () => {
    const { data } = await assertSupabase().auth.getUser();
    const u = data.user;
    setEmail(u?.email ?? null);

    let r = (u?.user_metadata as Record<string, unknown>)?.role as string ?? null;
    let s = (u?.user_metadata as Record<string, unknown>)?.preschool_id as string ?? null;
    let fn = (u?.user_metadata as Record<string, unknown>)?.first_name as string ?? null;
    let ln = (u?.user_metadata as Record<string, unknown>)?.last_name as string ?? null;
    let img = (u?.user_metadata as Record<string, unknown>)?.avatar_url as string ?? null;

    if (u?.id) {
      try {
        const { data: p } = await assertSupabase()
          .from("profiles")
          .select("id,role,preschool_id,first_name,last_name,avatar_url,phone,address")
          .or(`auth_user_id.eq.${u.id},id.eq.${u.id}`)
          .maybeSingle();
        r = r || (p as Record<string, unknown>)?.role as string || null;
        s = s || (p as Record<string, unknown>)?.preschool_id as string || null;
        fn = fn || (p as Record<string, unknown>)?.first_name as string || null;
        ln = ln || (p as Record<string, unknown>)?.last_name as string || null;
        img = img || (p as Record<string, unknown>)?.avatar_url as string || null;
        // Set phone and address
        const ph = (p as Record<string, unknown>)?.phone as string || null;
        const addr = (p as Record<string, unknown>)?.address as string || null;
        setPhone(ph);
        setAddress(addr);
        setEditPhone(ph || "");
        setEditAddress(addr || "");
      } catch { /* noop */ }
    }

    setRole(r);
    setSchool(s);
    setFirstName(fn);
    setLastName(ln);
    setProfileImage(img);
    setEditFirstName(fn || "");
    setEditLastName(ln || "");

    // Check if user has multiple organizations
    if (u?.id) {
      try {
        let orgCount = 0;
        
        // Count preschool membership (from profiles)
        if (s) orgCount++;
        
        // Count organization memberships (from organization_members)
        const { count } = await assertSupabase()
          .from('organization_members')
          .select('organization_id', { count: 'exact', head: true })
          .eq('user_id', u.id)
          .eq('seat_status', 'active')
          .in('membership_status', ['active', 'pending_verification']);
        
        orgCount += count || 0;
        
        setHasMultipleOrgs(orgCount > 1);
      } catch { /* noop */ }
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Convert profile image URI for web compatibility
  useEffect(() => {
    const convertImageUri = async () => {
      if (profileImage) {
        try {
          if (Platform.OS === 'web' && (profileImage.startsWith('blob:') || profileImage.startsWith('file:'))) {
            const dataUri = await ProfileImageService.convertToDataUri(profileImage);
            setDisplayUri(dataUri);
          } else {
            setDisplayUri(profileImage);
          }
        } catch {
          setDisplayUri(profileImage);
        }
      } else {
        setDisplayUri(null);
      }
    };
    convertImageUri();
  }, [profileImage]);

  // Load biometric settings
  useEffect(() => {
    (async () => {
      try {
        const securityInfo = await BiometricAuthService.getSecurityInfo();
        setBiometricSupported(securityInfo.capabilities.isAvailable);
        setBiometricEnrolled(securityInfo.capabilities.isEnrolled);
        setBiometricEnabled(securityInfo.isEnabled);
      } catch {
        try {
          const [supported, enrolled, enabled] = await Promise.all([
            isHardwareAvailable(), isEnrolled(), getBiometricsEnabled(),
          ]);
          setBiometricSupported(supported);
          setBiometricEnrolled(enrolled);
          setBiometricEnabled(enabled);
        } catch { /* noop */ }
      }
    })();
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // Image handling
  const pickImage = async () => {
    try {
      const hasPermission = await ensureImageLibraryPermission();
      if (!hasPermission) {
        showAppAlert("Permission needed", "We need camera roll permissions to select a profile picture.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        setPendingImageUri(result.assets[0].uri);
      }
    } catch { showAppAlert("Error", "Failed to select image"); }
  };

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        showAppAlert("Permission needed", "We need camera permissions to take a photo.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: 'images',
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        setPendingImageUri(result.assets[0].uri);
      }
    } catch { showAppAlert("Error", "Failed to take photo"); }
  };

  const uploadProfileImage = async (uri: string) => {
    try {
      setUploadingImage(true);
      const { data } = await assertSupabase().auth.getUser();
      if (!data.user?.id) { showAppAlert('Error', 'User not found'); return; }

      const validation = await ProfileImageService.validateImage(uri);
      if (!validation.valid) {
        showAppAlert('Invalid Image', validation.error || 'Please select a valid image');
        return;
      }

      const result = await ProfileImageService.uploadProfileImage(data.user.id, uri, {
        quality: 0.8, maxWidth: 800, maxHeight: 800, format: 'jpeg'
      });

      if (result.success && result.publicUrl) {
        setProfileImage(result.publicUrl);
        // Keep account header + global app header in sync immediately.
        await refreshProfile();
        await load();
        showAppAlert("Success", "Profile picture updated!");
      } else {
        const errorMessage = result.error?.includes('Bucket not found') 
          ? "Avatar storage is not set up. Please contact support."
          : result.error || "Failed to update profile picture.";
        showAppAlert("Upload Failed", errorMessage);
      }
    } catch {
      showAppAlert("Error", "Failed to update profile picture.");
    } finally {
      setUploadingImage(false);
    }
  };

  const showImageOptions = () => {
    showAppAlert("Update Profile Picture", "Choose an option", [
      { text: "Take Photo", onPress: takePhoto },
      { text: "Choose from Library", onPress: pickImage },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  // Biometric toggle
  const toggleBiometric = async () => {
    if (!biometricEnrolled) {
      showAppAlert("Biometric Setup Required", "Please set up fingerprint or face recognition in device settings.");
      return;
    }
    try {
      const { data } = await assertSupabase().auth.getUser();
      if (!data.user) { showAppAlert("Error", "User not found"); return; }

      if (biometricEnabled) {
        await BiometricAuthService.disableBiometric();
        await setBiometricsEnabled(false);
        setBiometricEnabled(false);
        showAppAlert("Biometric Login Disabled", "You will need to use your password to sign in.");
      } else {
        const success = await BiometricAuthService.enableBiometric(data.user.id, data.user.email || "");
        if (success) {
          // Seed quick-switch storage immediately for the current account.
          try {
            await EnhancedBiometricAuth.storeBiometricSession(
              data.user.id,
              data.user.email || email || '',
              {
                role,
                organization_id: null,
                seat_status: 'active',
              }
            );
          } catch (seedErr) {
            console.warn('[Account] Failed to seed quick-switch biometric account (non-fatal):', seedErr);
          }
          await setBiometricsEnabled(true);
          setBiometricEnabled(true);
          showAppAlert("Biometric Login Enabled", "You can now use biometric authentication.");
        }
      }
    } catch {
      showAppAlert("Error", "Failed to update biometric settings.");
    }
    setShowSettingsMenu(false);
  };

  // Profile save
  const saveProfileChanges = async () => {
    try {
      setSavingProfile(true);
      const { data } = await assertSupabase().auth.getUser();
      if (!data.user?.id) { showAppAlert("Error", "User not found"); return; }

      const { data: profileRow } = await assertSupabase()
        .from("profiles")
        .select("id")
        .or(`auth_user_id.eq.${data.user.id},id.eq.${data.user.id}`)
        .maybeSingle();

      if (!profileRow?.id) {
        showAppAlert("Error", "Profile not found");
        return;
      }

      const { error } = await assertSupabase()
        .from("profiles")
        .update({ 
          first_name: editFirstName.trim() || null, 
          last_name: editLastName.trim() || null,
          phone: editPhone.trim() || null,
          address: editAddress.trim() || null,
        })
        .eq("id", profileRow.id);

      if (error) showAppAlert("Warning", "Profile updated locally but failed to sync.");

      // Keep auth metadata in sync so greetings and headers update immediately
      try {
        await assertSupabase().auth.updateUser({
          data: {
            first_name: editFirstName.trim() || null,
            last_name: editLastName.trim() || null,
            full_name: `${editFirstName.trim()} ${editLastName.trim()}`.trim() || null,
          },
        });
      } catch { /* non-blocking */ }

      setFirstName(editFirstName.trim() || null);
      setLastName(editLastName.trim() || null);
      setPhone(editPhone.trim() || null);
      setAddress(editAddress.trim() || null);
      await refreshProfile();
      setShowEditProfile(false);
      showAppAlert("Success", "Profile updated successfully!");
    } catch {
      showAppAlert("Error", "Failed to save profile changes.");
    } finally {
      setSavingProfile(false);
    }
  };

  const cancelProfileEdit = () => {
    setEditFirstName(firstName || "");
    setEditLastName(lastName || "");
    setEditPhone(phone || "");
    setEditAddress(address || "");
    setShowEditProfile(false);
  };

  const getDisplayName = () => {
    if (firstName && lastName) return `${firstName} ${lastName}`;
    return firstName || lastName || email?.split("@")[0] || "User";
  };

  const getInitials = () => {
    if (firstName && lastName) return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
    if (firstName) return firstName.charAt(0).toUpperCase();
    return email?.charAt(0).toUpperCase() || "U";
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <Stack.Screen 
        options={{ 
          headerShown: false,
        }} 
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        <ProfileHeader
          profileImage={profileImage}
          displayUri={displayUri}
          displayName={getDisplayName()}
          email={email}
          role={role}
          initials={getInitials()}
          uploadingImage={uploadingImage}
          onImagePress={showImageOptions}
          theme={theme}
          styles={styles}
        />

        <ProfileInfoCards
          firstName={firstName}
          lastName={lastName}
          email={email}
          role={role}
          school={school}
          onEditPress={() => setShowEditProfile(true)}
          theme={theme}
          styles={styles}
        />

        <AccountActions
          theme={theme}
          styles={styles}
          onChangeEmail={() => router.push('/screens/change-email')}
          onChangePassword={() => router.push('/screens/change-password')}
          onSwitchAccount={() => setShowProfileSwitcher(true)}
        />
      </ScrollView>

      <SettingsModal
        visible={showSettingsMenu}
        onClose={() => setShowSettingsMenu(false)}
        biometricSupported={biometricSupported}
        biometricEnrolled={biometricEnrolled}
        biometricEnabled={biometricEnabled}
        themeMode={mode}
        showAlert={(config) => showAppAlert(config.title, config.message, config.buttons)}
        onToggleBiometric={toggleBiometric}
        onOpenThemeSettings={() => { setShowSettingsMenu(false); setShowThemeSettings(true); }}
        onOpenSettings={() => {
          setShowSettingsMenu(false);
          router.push('/screens/settings');
        }}
        onOpenOrgSwitcher={() => { setShowSettingsMenu(false); setShowOrgSwitcher(true); }}
        onOpenChangeEmail={() => {
          setShowSettingsMenu(false);
          router.push('/screens/change-email');
        }}
        onOpenChangePassword={() => {
          setShowSettingsMenu(false);
          router.push('/screens/change-password');
        }}
        hasMultipleOrgs={hasMultipleOrgs}
        theme={theme}
        styles={styles}
      />

      <EditProfileModal
        visible={showEditProfile}
        onClose={cancelProfileEdit}
        onSave={saveProfileChanges}
        saving={savingProfile}
        firstName={editFirstName}
        lastName={editLastName}
        phone={editPhone}
        address={editAddress}
        onFirstNameChange={setEditFirstName}
        onLastNameChange={setEditLastName}
        onPhoneChange={setEditPhone}
        onAddressChange={setEditAddress}
        theme={theme}
        styles={styles}
      />

      <ThemeSettingsModal
        visible={showThemeSettings}
        onClose={() => setShowThemeSettings(false)}
        theme={theme}
        styles={styles}
      />

      <OrganizationSwitcher
        visible={showOrgSwitcher}
        onClose={() => setShowOrgSwitcher(false)}
        showAlert={(config) => showAppAlert(config.title, config.message, config.buttons)}
        onOrganizationSwitched={() => {
          setShowOrgSwitcher(false);
          load(); // Refresh account data
        }}
      />

      <ProfileSwitcher
        visible={showProfileSwitcher}
        onClose={() => setShowProfileSwitcher(false)}
        onAccountSwitched={() => {
          setShowProfileSwitcher(false);
          load();
        }}
      />

      {/* Image preview + confirm modal for profile picture */}
      <ImageConfirmModal
        visible={!!pendingImageUri}
        imageUri={pendingImageUri}
        title="Profile Photo"
        confirmLabel="Set Photo"
        confirmIcon="checkmark-circle-outline"
        showCrop
        cropAspect={[1, 1]}
        loading={uploadingImage}
        onConfirm={(uri) => {
          setPendingImageUri(null);
          uploadProfileImage(uri);
        }}
        onCancel={() => setPendingImageUri(null)}
      />
      <AlertModal {...alertProps} />
    </SafeAreaView>
  );
}
