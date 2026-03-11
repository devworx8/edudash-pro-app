// Centralized Configuration Module for EduDash Pro
// Validates environment variables and provides type-safe configuration

interface AppConfig {
  // Supabase
  supabaseUrl: string;
  supabaseAnonKey: string;
  apiBase: string;

  // External Services
  sentryDsn: string;
  posthogKey: string;
  posthogHost: string;

  // Environment
  environment: 'development' | 'staging' | 'production';
  debugMode: boolean;

  // Features
  aiEnabled: boolean;
  enableAiFeatures: boolean;
  enableSentry: boolean;
  debugTools: boolean;

  // Email
  fromEmail: string;

  // AdMob (client-safe IDs only)
  admobAndroidAppId: string;
  admobIosAppId: string;
  enableFreeAds: boolean;
  admobTestIdsOnly: boolean;

  // RevenueCat (client-safe keys only)
  revenuecatAndroidKey: string;
  revenuecatIosKey: string;

  // Payments
  paymentsBridgeUrl: string;

  // Currency
  usdToZarRate: number;
}

class ConfigManager {
  private config: AppConfig;
  private isInitialized = false;

  constructor() {
    this.config = this.loadConfig();
    this.validateConfig();
    this.isInitialized = true;
  }

  private loadConfig(): AppConfig {
    return {
      // Supabase - Required
      supabaseUrl: this.getRequired('EXPO_PUBLIC_SUPABASE_URL'),
      supabaseAnonKey: this.getRequired('EXPO_PUBLIC_SUPABASE_ANON_KEY'),
      apiBase: this.getRequired('EXPO_PUBLIC_API_BASE'),

      // External Services - Optional with defaults
      sentryDsn: this.getOptional('EXPO_PUBLIC_SENTRY_DSN', ''),
      posthogKey: this.getOptional('EXPO_PUBLIC_POSTHOG_KEY', ''),
      posthogHost: this.getOptional('EXPO_PUBLIC_POSTHOG_HOST', 'https://us.i.posthog.com'),

      // Environment
      environment: this.getOptional('EXPO_PUBLIC_ENVIRONMENT', 'development') as 'development' | 'staging' | 'production',
      debugMode: this.getBoolean('EXPO_PUBLIC_DEBUG_MODE', true),

      // Features
      aiEnabled: this.getBoolean('EXPO_PUBLIC_AI_ENABLED', true),
      enableAiFeatures: this.getBoolean('EXPO_PUBLIC_ENABLE_AI_FEATURES', true),
      enableSentry: this.getBoolean('EXPO_PUBLIC_ENABLE_SENTRY', false),
      debugTools: this.getBoolean('EXPO_PUBLIC_DEBUG_TOOLS', false),

      // Email
      fromEmail: this.getOptional('EXPO_PUBLIC_FROM_EMAIL', 'noreply@edudashpro.org.za'),

      // AdMob
      admobAndroidAppId: this.getOptional('EXPO_PUBLIC_ADMOB_ANDROID_APP_ID', ''),
      admobIosAppId: this.getOptional('EXPO_PUBLIC_ADMOB_IOS_APP_ID', ''),
      enableFreeAds: this.getBoolean('EXPO_PUBLIC_ENABLE_FREE_TIER_ADS', false),
      admobTestIdsOnly: this.getBoolean('EXPO_PUBLIC_ADMOB_TEST_IDS_ONLY', false),

      // RevenueCat
      revenuecatAndroidKey: this.getOptional('EXPO_PUBLIC_REVENUECAT_ANDROID_SDK_KEY', ''),
      revenuecatIosKey: this.getOptional('EXPO_PUBLIC_REVENUECAT_IOS_SDK_KEY', ''),

      // Payments
      paymentsBridgeUrl: this.getOptional('EXPO_PUBLIC_PAYMENTS_BRIDGE_URL', ''),

      // Currency
      usdToZarRate: this.getNumber('EXPO_PUBLIC_USD_TO_ZAR_RATE', 18),
    };
  }

  private getRequired(key: string): string {
    // Support both EXPO_PUBLIC_ (React Native) and NEXT_PUBLIC_ (Next.js) prefixes
    const value = process.env[key] || process.env[key.replace('EXPO_PUBLIC_', 'NEXT_PUBLIC_')];
    if (!value) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
  }

  private getOptional(key: string, defaultValue: string): string {
    // Support both EXPO_PUBLIC_ (React Native) and NEXT_PUBLIC_ (Next.js) prefixes
    return process.env[key] || process.env[key.replace('EXPO_PUBLIC_', 'NEXT_PUBLIC_')] || defaultValue;
  }

  private getBoolean(key: string, defaultValue: boolean): boolean {
    // Support both EXPO_PUBLIC_ (React Native) and NEXT_PUBLIC_ (Next.js) prefixes
    const value = process.env[key] || process.env[key.replace('EXPO_PUBLIC_', 'NEXT_PUBLIC_')];
    if (!value) return defaultValue;
    return value.toLowerCase() === 'true' || value === '1';
  }

  private getNumber(key: string, defaultValue: number): number {
    const value = this.getOptional(key, String(defaultValue));
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
    return defaultValue;
  }

  private validateConfig(): void {
    const errors: string[] = [];

    // Validate URLs
    if (!this.isValidUrl(this.config.supabaseUrl)) {
      errors.push('EXPO_PUBLIC_SUPABASE_URL must be a valid URL');
    }

    if (!this.isValidUrl(this.config.apiBase)) {
      errors.push('EXPO_PUBLIC_API_BASE must be a valid URL');
    }

    if (this.config.paymentsBridgeUrl && !this.isValidUrl(this.config.paymentsBridgeUrl)) {
      errors.push('EXPO_PUBLIC_PAYMENTS_BRIDGE_URL must be a valid URL');
    }

    // Validate environment
    if (!['development', 'staging', 'production'].includes(this.config.environment)) {
      errors.push('EXPO_PUBLIC_ENVIRONMENT must be development, staging, or production');
    }

    // Validate email
    if (this.config.fromEmail && !this.isValidEmail(this.config.fromEmail)) {
      errors.push('EXPO_PUBLIC_FROM_EMAIL must be a valid email address');
    }

    if (this.config.usdToZarRate <= 0) {
      errors.push('EXPO_PUBLIC_USD_TO_ZAR_RATE must be greater than 0');
    }

    // Production-specific validations
    if (this.config.environment === 'production') {
      if (!this.config.sentryDsn) {
        console.warn('Warning: EXPO_PUBLIC_SENTRY_DSN not set in production environment');
      }
      
      if (this.config.debugMode) {
        console.warn('Warning: Debug mode enabled in production');
      }
      
      if (this.config.admobTestIdsOnly) {
        console.warn('Warning: Test AdMob IDs enabled in production');
      }
    }

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
    }
  }

  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  // Public getters
  get supabaseUrl(): string { return this.config.supabaseUrl; }
  get supabaseAnonKey(): string { return this.config.supabaseAnonKey; }
  get apiBase(): string { return this.config.apiBase; }
  get sentryDsn(): string { return this.config.sentryDsn; }
  get posthogKey(): string { return this.config.posthogKey; }
  get posthogHost(): string { return this.config.posthogHost; }
  get environment(): string { return this.config.environment; }
  get debugMode(): boolean { return this.config.debugMode; }
  get aiEnabled(): boolean { return this.config.aiEnabled; }
  get enableAiFeatures(): boolean { return this.config.enableAiFeatures; }
  get enableSentry(): boolean { return this.config.enableSentry; }
  get debugTools(): boolean { return this.config.debugTools; }
  get fromEmail(): string { return this.config.fromEmail; }
  get admobAndroidAppId(): string { return this.config.admobAndroidAppId; }
  get admobIosAppId(): string { return this.config.admobIosAppId; }
  get enableFreeAds(): boolean { return this.config.enableFreeAds; }
  get admobTestIdsOnly(): boolean { return this.config.admobTestIdsOnly; }
  get revenuecatAndroidKey(): string { return this.config.revenuecatAndroidKey; }
  get revenuecatIosKey(): string { return this.config.revenuecatIosKey; }
  get paymentsBridgeUrl(): string { return this.config.paymentsBridgeUrl; }
  get usdToZarRate(): number { return this.config.usdToZarRate; }

  // Utility methods
  get isDevelopment(): boolean { return this.config.environment === 'development'; }
  get isProduction(): boolean { return this.config.environment === 'production'; }
  get isStaging(): boolean { return this.config.environment === 'staging'; }

  // AI feature flags - centralized logic
  get isAIEnabled(): boolean {
    return this.config.aiEnabled && this.config.enableAiFeatures;
  }

  // Safe for logging (excludes sensitive data)
  getSafeConfig(): Partial<AppConfig> {
    return {
      environment: this.config.environment,
      debugMode: this.config.debugMode,
      aiEnabled: this.config.aiEnabled,
      enableAiFeatures: this.config.enableAiFeatures,
      enableSentry: this.config.enableSentry,
      debugTools: this.config.debugTools,
      enableFreeAds: this.config.enableFreeAds,
      admobTestIdsOnly: this.config.admobTestIdsOnly,
    };
  }
}

// Lazy singleton accessor
let _AppConfiguration: ConfigManager | null = null;
export function getAppConfiguration(): ConfigManager {
  if (!_AppConfiguration) {
    _AppConfiguration = new ConfigManager();
  }
  return _AppConfiguration;
}

// Type exports
export type { AppConfig };
