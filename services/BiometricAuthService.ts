/* eslint-disable @typescript-eslint/no-unused-vars */

/**
 * Biometric Authentication Service
 *
 * Provides secure biometric authentication using fingerprint, face ID, and other
 * device-native authentication methods for enhanced security.
 */

import * as LocalAuthentication from "expo-local-authentication";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Alert, Platform } from "react-native";
import * as Device from "expo-device";
import { log, warn, debug, error as logError } from '@/lib/debug';

const TAG = 'BiometricAuth';

// Dynamically import SecureStore to avoid web issues
let SecureStore: any = null;
try {
  if (Platform.OS !== 'web') {
    SecureStore = require('expo-secure-store');
  }
} catch (e) {
  debug('SecureStore import failed (web or unsupported platform)', e);
}

const BIOMETRIC_STORAGE_KEY = "biometric_enabled"; // canonical flag ("true"/"false")
const LEGACY_BIOMETRIC_STORAGE_KEY = "biometrics_enabled"; // legacy flag ("1"/"0")
const BIOMETRIC_USER_KEY = "biometric_user_data";
const BIOMETRIC_LOCK_SECRET_KEY = "biometric_lock_secret"; // random secret gated by device auth
const LAST_UNLOCKED_AT_KEY = "biometric_last_unlocked_at"; // timestamp ms
const LAST_USER_ID_KEY = "biometric_last_user_id"; // optional binding to current user
const BIOMETRIC_REFRESH_TOKEN_KEY = "biometric_refresh_token"; // persisted for restoring Supabase session after logout

const MAX_FAILED_ATTEMPTS = 3;
const LOCKOUT_DURATION = 5 * 60 * 1000; // 5 minutes

export interface BiometricCapabilities {
  isAvailable: boolean;
  supportedTypes: LocalAuthentication.AuthenticationType[];
  isEnrolled: boolean;
  securityLevel: "weak" | "strong";
}

export interface BiometricAuthResult {
  success: boolean;
  error?: string;
  biometricType?: LocalAuthentication.AuthenticationType;
}

export interface StoredBiometricData {
  userId: string;
  email: string;
  enabledAt: string;
  lastUsed?: string;
  securityToken: string;
  version: number;
}

export interface BiometricSecurityState {
  failedAttempts: number;
  lastFailedAttempt?: string;
  lockedUntil?: string;
}

export class BiometricAuthService {
  /**
   * Run one-time migrations and setup
   */
  static async init(): Promise<void> {
    try {
      // Skip migration on web or if SecureStore unavailable
      if (!SecureStore) {
        log('BiometricAuthService.init: SecureStore unavailable, skipping migration');
        return;
      }
      // Migrate legacy enable flag if present and canonical not set
      const canonical = await SecureStore.getItemAsync(BIOMETRIC_STORAGE_KEY).catch(() => null);
      const legacy = await SecureStore.getItemAsync(LEGACY_BIOMETRIC_STORAGE_KEY).catch(() => null);
      if (!canonical && (legacy === "1" || legacy === "0")) {
        const value = legacy === "1" ? "true" : "false";
        await SecureStore.setItemAsync(BIOMETRIC_STORAGE_KEY, value);
        await SecureStore.deleteItemAsync(LEGACY_BIOMETRIC_STORAGE_KEY).catch(() => { /* Intentional: error handled */ });
      }
    } catch (e) {
      warn("BiometricAuthService.init migration skipped:", e);
    }
  }

  /**
   * Check if biometric authentication is available and enrolled
   */
  static async checkCapabilities(): Promise<BiometricCapabilities> {
    try {
      // Development mode override for web/desktop testing
      const isDevelopment = __DEV__ || process.env.NODE_ENV === 'development';
      const isWeb = Platform.OS === 'web';
      const enableWebBiometricTesting = process.env.EXPO_PUBLIC_ENABLE_WEB_BIOMETRIC_TESTING === 'true';
      
      if (isDevelopment && isWeb && enableWebBiometricTesting) {
        debug('[DEV] Using mock biometric capabilities for web testing');
        return {
          isAvailable: true,
          supportedTypes: [LocalAuthentication.AuthenticationType.FINGERPRINT],
          isEnrolled: true,
          securityLevel: "strong",
        };
      }
      
      const isAvailable = await LocalAuthentication.hasHardwareAsync();
      const supportedTypes =
        await LocalAuthentication.supportedAuthenticationTypesAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      // Get device info for better debugging
      const deviceInfo = {
        brand: Device.brand,
        modelName: Device.modelName,
        osName: Device.osName,
        osVersion: Device.osVersion,
        platform: Platform.OS
      };

      debug('Biometric capabilities check:', {
        deviceInfo,
        isAvailable,
        supportedTypes,
        isEnrolled,
        supportedTypeNames: supportedTypes.map(type => 
          type === LocalAuthentication.AuthenticationType.FINGERPRINT ? 'FINGERPRINT' :
          type === LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION ? 'FACIAL_RECOGNITION' :
          type === LocalAuthentication.AuthenticationType.IRIS ? 'IRIS' :
          'UNKNOWN_' + type
        )
      });

      // Determine security level based on available authentication types
      const hasStrongBiometrics = supportedTypes.some(
        (type) =>
          type === LocalAuthentication.AuthenticationType.FINGERPRINT ||
          type === LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION ||
          type === LocalAuthentication.AuthenticationType.IRIS,
      );

      // Additional security check for biometric strength - be more permissive for Android
      let securityLevel: LocalAuthentication.SecurityLevel | null = null;
      let isSecure = false;
      try {
        securityLevel = await LocalAuthentication.getEnrolledLevelAsync();
        isSecure = securityLevel === LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG;
      } catch (securityError) {
        warn('Could not get security level, assuming weak but allowing biometrics:', securityError);
        // On some Android devices, this call fails but biometrics still work
        isSecure = false;
      }

      // Special handling for OPPO devices and similar Android devices
      let effectiveSecurityLevel: "weak" | "strong" = "weak";
      if (hasStrongBiometrics && isSecure) {
        effectiveSecurityLevel = "strong";
      } else if (hasStrongBiometrics && (deviceInfo.brand?.toLowerCase()?.includes('oppo') || isAvailable)) {
        // For OPPO and similar devices, be more permissive about security levels
        effectiveSecurityLevel = "strong";
        debug('Using permissive security assessment for OPPO/Android device');
      }

      // If no supported types but hardware is available and enrolled, 
      // this might be an API detection issue (common on some Android devices)
      let effectiveSupportedTypes = supportedTypes;
      if (supportedTypes.length === 0 && isAvailable && isEnrolled) {
        warn('No supported types detected despite available hardware - adding FINGERPRINT as fallback');
        effectiveSupportedTypes = [LocalAuthentication.AuthenticationType.FINGERPRINT];
      }

      return {
        isAvailable,
        supportedTypes: effectiveSupportedTypes,
        isEnrolled,
        securityLevel: effectiveSecurityLevel,
      };
    } catch (error) {
      logError("Error checking biometric capabilities:", error);
      return {
        isAvailable: false,
        supportedTypes: [],
        isEnrolled: false,
        securityLevel: "weak",
      };
    }
  }

  /**
   * Get user-friendly names for biometric types
   */
  static getBiometricTypeName(
    type: LocalAuthentication.AuthenticationType,
  ): string {
    switch (type) {
      case LocalAuthentication.AuthenticationType.FINGERPRINT:
        return "Fingerprint";
      case LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION:
        return "Face ID";
      case LocalAuthentication.AuthenticationType.IRIS:
        return "Iris Scan";
      case 1: // FINGERPRINT
        return "Fingerprint";
      case 2: // FACIAL_RECOGNITION
        return "Face ID";
      case 3: // IRIS
        return "Iris Scan";
      default:
        return "Biometric";
    }
  }

  /**
   * Get available biometric options as user-friendly list
   */
  static async getAvailableBiometricOptions(): Promise<string[]> {
    const capabilities = await this.checkCapabilities();
    
    debug('Getting available biometric options:', {
      isAvailable: capabilities.isAvailable,
      isEnrolled: capabilities.isEnrolled,
      supportedTypes: capabilities.supportedTypes,
      supportedTypeCount: capabilities.supportedTypes.length
    });

    if (!capabilities.isAvailable || !capabilities.isEnrolled) {
      debug('No biometric options available - not available or not enrolled');
      return [];
    }

    const options = capabilities.supportedTypes.map((type) => {
      const typeName = this.getBiometricTypeName(type);
      debug(`Mapping biometric type ${type} to "${typeName}"`);
      return typeName;
    });
    
    debug('Available biometric options:', options);
    return options;
  }

  /**
   * Check if biometric authentication is currently locked out
   */
  static async isLockedOut(): Promise<boolean> {
    try {
      const securityState = await this.getSecurityState();
      if (securityState.lockedUntil) {
        const lockoutTime = new Date(securityState.lockedUntil).getTime();
        return Date.now() < lockoutTime;
      }
      return false;
    } catch (error) {
      logError("Error checking lockout status:", error);
      return false;
    }
  }

  /**
   * Get current security state
   */
  static async getSecurityState(): Promise<BiometricSecurityState> {
    try {
      let stateData: string | null = null;
      if (SecureStore) {
        stateData = await SecureStore.getItemAsync("biometric_security_state");
      } else {
        stateData = await AsyncStorage.getItem("biometric_security_state");
      }
      return stateData ? JSON.parse(stateData) : { failedAttempts: 0 };
    } catch (error) {
      logError("Error getting security state:", error);
      return { failedAttempts: 0 };
    }
  }

  /**
   * Update security state after authentication attempt
   */
  static async updateSecurityState(success: boolean): Promise<void> {
    try {
      const currentState = await this.getSecurityState();
      const store = async (data: string) => {
        if (SecureStore) {
          await SecureStore.setItemAsync("biometric_security_state", data);
        } else {
          await AsyncStorage.setItem("biometric_security_state", data);
        }
      };

      if (success) {
        // Reset failed attempts on successful authentication
        await store(JSON.stringify({ failedAttempts: 0 }));
      } else {
        const newFailedAttempts = currentState.failedAttempts + 1;
        const newState: BiometricSecurityState = {
          failedAttempts: newFailedAttempts,
          lastFailedAttempt: new Date().toISOString(),
        };

        // Apply lockout if max attempts reached
        if (newFailedAttempts >= MAX_FAILED_ATTEMPTS) {
          newState.lockedUntil = new Date(
            Date.now() + LOCKOUT_DURATION,
          ).toISOString();
        }

        await store(JSON.stringify(newState));
      }
    } catch (error) {
      logError("Error updating security state:", error);
    }
  }

  /**
   * Generate a secure token for biometric data
   */
  static async generateSecurityToken(): Promise<string> {
    const timestamp = Date.now().toString();
    // Use Math.random() as fallback for React Native
    const randomBytes = Array.from({ length: 16 }, () => 
      Math.floor(Math.random() * 256)
    ).map((b) => b.toString(16).padStart(2, "0")).join("");
    return `${timestamp}-${randomBytes}`;
  }

  /**
   * Authenticate user with biometrics
   */
  static async authenticate(reason?: string): Promise<BiometricAuthResult> {
    try {
      // Development mode override for web/desktop testing
      const isDevelopment = __DEV__ || process.env.NODE_ENV === 'development';
      const isWeb = Platform.OS === 'web';
      const enableWebBiometricTesting = process.env.EXPO_PUBLIC_ENABLE_WEB_BIOMETRIC_TESTING === 'true';
      
      if (isDevelopment && isWeb && enableWebBiometricTesting) {
        debug(TAG, 'Using mock biometric authentication for web testing');
        // Simulate a brief delay for realistic UX
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Always succeed in development web mode for UI testing
        await this.updateSecurityState(true);
        await this.updateLastUsed();
        await this.setLastUnlockedAt(Date.now());
        
        return {
          success: true,
          biometricType: LocalAuthentication.AuthenticationType.FINGERPRINT,
        };
      }
      
      // Check if locked out first
      const isLocked = await this.isLockedOut();
      if (isLocked) {
        const securityState = await this.getSecurityState();
        const lockoutTime = securityState.lockedUntil
          ? new Date(securityState.lockedUntil)
          : new Date();
        const remainingMinutes = Math.ceil(
          (lockoutTime.getTime() - Date.now()) / 60000,
        );

        return {
          success: false,
          error: `Too many failed attempts. Try again in ${remainingMinutes} minute(s).`,
        };
      }

      const capabilities = await this.checkCapabilities();

      // Get device info for OPPO-specific handling
      const deviceInfo = {
        brand: Device.brand,
        modelName: Device.modelName,
      };

      if (!capabilities.isAvailable) {
        log(TAG, 'Biometric authentication not available on device');
        return {
          success: false,
          error: "Biometric authentication is not available on this device",
        };
      }

      if (!capabilities.isEnrolled) {
        log(TAG, 'No biometric data enrolled on device');
        return {
          success: false,
          error: "No biometric data is enrolled on this device. Please set up fingerprint or face recognition in your device settings.",
        };
      }

      // Enhanced security check - be more permissive for Android devices, especially OPPO
      if (capabilities.securityLevel === "weak" && capabilities.supportedTypes.length === 0) {
        // Check if this is an OPPO device or similar where we should be more permissive
        const isOPPODevice = deviceInfo.brand?.toLowerCase()?.includes('oppo');
        if (!isOPPODevice) {
          return {
            success: false,
            error:
              "Biometric security level is insufficient. Please use a stronger authentication method.",
          };
        } else {
          log(TAG, 'Allowing weak biometric security for OPPO device');
        }
      }

      // Get appropriate prompt message based on available biometric types
      let defaultReason = "Authenticate to access EduDash";
      if (capabilities.supportedTypes.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
        defaultReason = "Use Face ID to sign in to EduDash";
      } else if (capabilities.supportedTypes.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
        defaultReason = "Place your finger on the sensor to sign in";
      } else if (capabilities.supportedTypes.includes(LocalAuthentication.AuthenticationType.IRIS)) {
        defaultReason = "Look at the camera to sign in to EduDash";
      }

      // Configure authentication options for better Android compatibility
      const authConfig: LocalAuthentication.LocalAuthenticationOptions = {
        promptMessage: reason || defaultReason,
        cancelLabel: "Cancel",
        fallbackLabel: "Use Password",
        requireConfirmation: false,
        // Be more permissive with security levels for Android devices
        disableDeviceFallback: false,
      };

      // Do not set biometricsSecurityLevel explicitly.
      // Many Android devices exhibit casting/issues with this flag; letting the platform decide is more compatible.

      debug(TAG, 'Attempting authentication with config:', authConfig);
      debug(TAG, 'Device capabilities during auth:', {
        hasHardware: capabilities.isAvailable,
        isEnrolled: capabilities.isEnrolled,
        supportedTypes: capabilities.supportedTypes,
        securityLevel: capabilities.securityLevel
      });
      
      const result = await LocalAuthentication.authenticateAsync(authConfig);
      
      // Log raw result to avoid type issues across platforms
      debug(TAG, 'Authentication result:', result);

      // Update security state based on result
      await this.updateSecurityState(result.success);

      if (result.success) {
        // Update last used timestamp
        await this.updateLastUsed();
        // Record unlock time for grace period logic
        try { await this.setLastUnlockedAt(Date.now()); } catch { /* Intentional: non-fatal */ }

        return {
          success: true,
          biometricType: capabilities.supportedTypes[0],
        };
      } else {
        return {
          success: false,
          error: "Authentication failed",
        };
      }
    } catch (error) {
      console.error("Biometric authentication error:", error);
      // Update security state for failed attempt
      await this.updateSecurityState(false);

      return {
        success: false,
        error: "Authentication error occurred",
      };
    }
  }

  /**
   * Check if biometric login is enabled for the app
   */
  static async isBiometricEnabled(): Promise<boolean> {
    try {
      // Try SecureStore first (canonical)
      let enabled = SecureStore ? await SecureStore.getItemAsync(BIOMETRIC_STORAGE_KEY).catch(() => null) : null;

      // Migrate from legacy if canonical missing
      if (!enabled && SecureStore) {
        const legacy = await SecureStore.getItemAsync(LEGACY_BIOMETRIC_STORAGE_KEY).catch(() => null);
        if (legacy === "1" || legacy === "0") {
          const canonical = legacy === "1" ? "true" : "false";
          await SecureStore.setItemAsync(BIOMETRIC_STORAGE_KEY, canonical);
          await SecureStore.deleteItemAsync(LEGACY_BIOMETRIC_STORAGE_KEY).catch(() => { /* Intentional: error handled */ });
          enabled = canonical;
        }
      }

      // Fallback to AsyncStorage for canonical only (compat)
      if (!enabled) {
        enabled = await AsyncStorage.getItem(BIOMETRIC_STORAGE_KEY);
      }
      return enabled === "true";
    } catch (error) {
      console.error("Error checking biometric enabled status:", error);
      return false;
    }
  }

  /**
   * Enable biometric authentication for current user
   */
  static async enableBiometric(
    userId: string,
    email: string,
  ): Promise<boolean> {
    try {
      const capabilities = await this.checkCapabilities();

      if (!capabilities.isAvailable || !capabilities.isEnrolled) {
        Alert.alert(
          "Biometric Authentication Unavailable",
          "Please set up fingerprint or face recognition in your device settings first.",
        );
        return false;
      }

      // Test authentication first
      const authResult = await this.authenticate(
        "Enable biometric login for EduDash",
      );

      if (!authResult.success) {
        Alert.alert(
          "Authentication Failed",
          authResult.error || "Could not verify biometric authentication",
        );
        return false;
      }

      // Generate security token
      const securityToken = await this.generateSecurityToken();

      // Store biometric data with enhanced security
      const biometricData: StoredBiometricData = {
        userId,
        email,
        enabledAt: new Date().toISOString(),
        securityToken,
        version: 1,
      };

      // Use SecureStore for sensitive data (fallback to AsyncStorage on web)
      if (SecureStore) {
        await SecureStore.setItemAsync(BIOMETRIC_STORAGE_KEY, "true");
        await SecureStore.setItemAsync(
          BIOMETRIC_USER_KEY,
          JSON.stringify(biometricData),
        );
        // Create lock secret and bind to user id
        await SecureStore.setItemAsync(BIOMETRIC_LOCK_SECRET_KEY, securityToken);
        await SecureStore.setItemAsync(LAST_USER_ID_KEY, userId);
        // Initialize lastUnlockedAt to now, so we don't immediately re-prompt
        await SecureStore.setItemAsync(LAST_UNLOCKED_AT_KEY, String(Date.now()));
      } else {
        // Web fallback using AsyncStorage
        await AsyncStorage.setItem(BIOMETRIC_STORAGE_KEY, "true");
        await AsyncStorage.setItem(BIOMETRIC_USER_KEY, JSON.stringify(biometricData));
        await AsyncStorage.setItem(BIOMETRIC_LOCK_SECRET_KEY, securityToken);
        await AsyncStorage.setItem(LAST_USER_ID_KEY, userId);
        await AsyncStorage.setItem(LAST_UNLOCKED_AT_KEY, String(Date.now()));
      }

      // Also maintain AsyncStorage compatibility for existing code
      await AsyncStorage.setItem(BIOMETRIC_STORAGE_KEY, "true");

      // Persist current Supabase refresh token to support biometric restore after logout
      try {
        const { getCurrentSession } = await import('@/lib/sessionManager');
        const current = await getCurrentSession();
        const refreshToken = current?.refresh_token;
        if (refreshToken) {
          if (SecureStore) {
            await SecureStore.setItemAsync(BIOMETRIC_REFRESH_TOKEN_KEY, refreshToken);
          } else {
            await AsyncStorage.setItem(BIOMETRIC_REFRESH_TOKEN_KEY, refreshToken);
          }
          // Also store per-user refresh for multi-account support
          try {
            const { EnhancedBiometricAuth } = await import('./EnhancedBiometricAuth');
            await (EnhancedBiometricAuth as any).setActiveUserId?.(userId);
            await (EnhancedBiometricAuth as any).setRefreshTokenForUser?.(userId, refreshToken);
          } catch (e2) {
            console.debug('Per-user refresh token store fallback failed (will still use global):', e2);
          }
        }
      } catch (e) {
        console.warn('Could not persist biometric refresh token during enablement:', e);
      }

      return true;
    } catch (error) {
      console.error("Error enabling biometric authentication:", error);
      Alert.alert("Error", "Failed to enable biometric authentication");
      return false;
    }
  }

  /**
   * Disable biometric authentication
   */
  static async disableBiometric(): Promise<void> {
    try {
      const secureStoreKeys = [
        BIOMETRIC_STORAGE_KEY,
        BIOMETRIC_USER_KEY,
        "biometric_security_state",
        BIOMETRIC_LOCK_SECRET_KEY,
        LAST_UNLOCKED_AT_KEY,
        LAST_USER_ID_KEY,
        BIOMETRIC_REFRESH_TOKEN_KEY,
      ];
      const asyncStorageKeys = [
        BIOMETRIC_STORAGE_KEY,
        BIOMETRIC_USER_KEY,
        BIOMETRIC_REFRESH_TOKEN_KEY,
      ];

      const promises: Promise<any>[] = asyncStorageKeys.map((k) =>
        AsyncStorage.removeItem(k)
      );
      if (SecureStore) {
        secureStoreKeys.forEach((k) =>
          promises.push(SecureStore.deleteItemAsync(k).catch(() => { /* Intentional: error handled */ }))
        );
      }

      await Promise.all(promises);
    } catch (error) {
      console.error("Error disabling biometric authentication:", error);
    }
  }

  /**
   * Get stored biometric user data
   */
  static async getStoredBiometricData(): Promise<StoredBiometricData | null> {
    try {
      // Try SecureStore first, fallback to AsyncStorage for compatibility
      let data: string | null = null;
      if (SecureStore) {
        data = await SecureStore.getItemAsync(BIOMETRIC_USER_KEY).catch(
          () => null,
        );
      }
      if (!data) {
        data = await AsyncStorage.getItem(BIOMETRIC_USER_KEY);
      }

      if (data) {
        const parsedData = JSON.parse(data);

        // Migrate old data format if needed
        if (!parsedData.version) {
          parsedData.version = 1;
          parsedData.securityToken = await this.generateSecurityToken();
          // Save migrated data to SecureStore
          if (SecureStore) {
            await SecureStore.setItemAsync(
              BIOMETRIC_USER_KEY,
              JSON.stringify(parsedData),
            );
          }
        }

        return parsedData;
      }

      return null;
    } catch (error) {
      console.error("Error retrieving biometric data:", error);
      return null;
    }
  }

  /**
   * Get stored refresh token for session restoration
   */
  static async getStoredRefreshToken(): Promise<string | null> {
    try {
      // Try SecureStore first, fallback to AsyncStorage
      let token = SecureStore 
        ? await SecureStore.getItemAsync(BIOMETRIC_REFRESH_TOKEN_KEY).catch(() => null)
        : null;
      if (!token) {
        token = await AsyncStorage.getItem(BIOMETRIC_REFRESH_TOKEN_KEY);
      }
      return token;
    } catch (error) {
      console.error("Error retrieving refresh token:", error);
      return null;
    }
  }

  /**
   * Update last used timestamp
   */
  private static async updateLastUsed(): Promise<void> {
    try {
      const existingData = await this.getStoredBiometricData();
      if (existingData) {
        const updatedData: StoredBiometricData = {
          ...existingData,
          lastUsed: new Date().toISOString(),
        };
        await AsyncStorage.setItem(
          BIOMETRIC_USER_KEY,
          JSON.stringify(updatedData),
        );
      }
    } catch (error) {
      console.error("Error updating last used timestamp:", error);
    }
  }

  /**
   * Show biometric setup prompt if available but not enabled
   */
  static async promptBiometricSetup() {
    const capabilities = await this.checkCapabilities();
    const isEnabled = await this.isBiometricEnabled();

    if (!capabilities.isAvailable || isEnabled) {
      return false;
    }

    const biometricOptions = await this.getAvailableBiometricOptions();
    const optionsText = biometricOptions.join(" or ");

    if (capabilities.isEnrolled) {
      Alert.alert(
        "Enable Biometric Login?",
        `Use ${optionsText} for faster, more secure access to EduDash.`,
        [
          { text: "Not Now", style: "cancel" },
          {
            text: "Enable",
            onPress: async () => {
              // This should be called with actual user data
              debug(TAG,
                "Biometric setup requested - implement with user data",
              );
            },
          },
        ],
      );
      return true;
    } else {
      Alert.alert(
        "Set Up Biometric Authentication",
        `Set up ${optionsText} in your device settings to enable secure login.`,
        [
          { text: "Later", style: "cancel" },
          {
            text: "Settings",
            onPress: () => LocalAuthentication.authenticateAsync(),
          },
        ],
      );
      return false;
    }
  }

  /**
   * Attempt biometric login and return user data if successful
   */
  static async attemptBiometricLogin(): Promise<StoredBiometricData | null> {
    try {
      const isEnabled = await this.isBiometricEnabled();
      if (!isEnabled) {
        return null;
      }

      const authResult = await this.authenticate();
      if (!authResult.success) {
        return null;
      }

      return await this.getStoredBiometricData();
    } catch (error) {
      console.error("Biometric login attempt failed:", error);
      return null;
    }
  }

  /**
   * Get security info for display
   */
  static async getSecurityInfo(): Promise<{
    isEnabled: boolean;
    capabilities: BiometricCapabilities;
    availableTypes: string[];
    lastUsed?: string;
  }> {
    const isEnabled = await this.isBiometricEnabled();
    const capabilities = await this.checkCapabilities();
    const availableTypes = await this.getAvailableBiometricOptions();
    const storedData = await this.getStoredBiometricData();

    return {
      isEnabled,
      capabilities,
      availableTypes,
      lastUsed: storedData?.lastUsed,
    };
  }

  /**
   * Get last unlocked timestamp (ms)
   */
  static async getLastUnlockedAt(): Promise<number | null> {
    try {
      const ts = SecureStore 
        ? await SecureStore.getItemAsync(LAST_UNLOCKED_AT_KEY)
        : await AsyncStorage.getItem(LAST_UNLOCKED_AT_KEY);
      if (!ts) return null;
      const num = Number(ts);
      return Number.isFinite(num) ? num : null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Set last unlocked timestamp (ms)
   */
  static async setLastUnlockedAt(ts: number): Promise<void> {
    try {
      if (SecureStore) {
        await SecureStore.setItemAsync(LAST_UNLOCKED_AT_KEY, String(ts));
      } else {
        await AsyncStorage.setItem(LAST_UNLOCKED_AT_KEY, String(ts));
      }
    } catch (e) {
      // ignore
    }
  }

  /**
   * Decide if the app should gate on foreground based on session, enablement, enrollment and grace window
   */
  static async shouldGate(opts: { hasSession: boolean; graceMs: number }): Promise<boolean> {
    try {
      if (!opts.hasSession) return false;
      const [enabled, caps] = await Promise.all([
        this.isBiometricEnabled(),
        this.checkCapabilities(),
      ]);
      if (!enabled || !caps.isAvailable || !caps.isEnrolled) return false;
      const last = await this.getLastUnlockedAt();
      if (last && Date.now() - last < opts.graceMs) return false;
      return true;
    } catch (e) {
      return false;
    }
  }
}

export default BiometricAuthService;
