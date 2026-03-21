/* eslint-disable @typescript-eslint/no-unused-vars */

/**
 * DashDiagnosticEngine - Making Dash Fully Agentic with Diagnostic Capabilities
 * 
 * This engine gives Dash:
 * 1. Full app state awareness (performance, errors, memory, storage)
 * 2. Ability to diagnose issues autonomously
 * 3. Proactive error detection and recovery suggestions
 * 4. Self-healing capabilities for common issues
 * 5. Integration with all app systems for deep insights
 */

import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import { assertSupabase } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Simple logger replacement
const logger = {
  info: (...args: any[]) => console.log('[DashDiagnostic]', ...args),
  warn: (...args: any[]) => console.warn('[DashDiagnostic]', ...args),
  error: (...args: any[]) => console.error('[DashDiagnostic]', ...args),
};

export interface AppDiagnostics {
  system: {
    platform: string;
    version: string;
    device: string;
    memory: {
      used: number;
      total: number;
      available: number;
    };
    storage: {
      used: number;
      free: number;
    };
    battery?: number;
  };
  network: {
    isConnected: boolean;
    type: string;
    isInternetReachable: boolean;
    ipAddress?: string;
  };
  app: {
    version: string;
    buildNumber: string;
    uptime: number;
    crashes: number;
    errors: DiagnosticError[];
  };
  performance: {
    jsHeapSize: number;
    renderTime: number;
    apiResponseTime: number;
    cacheHitRate: number;
  };
  features: {
    recording: FeatureHealth;
    transcription: FeatureHealth;
    database: FeatureHealth;
    auth: FeatureHealth;
    storage: FeatureHealth;
  };
  issues: DiagnosticIssue[];
  recommendations: string[];
}

export interface DiagnosticError {
  timestamp: Date;
  type: string;
  message: string;
  stack?: string;
  context?: any;
  resolved?: boolean;
}

export interface FeatureHealth {
  status: 'healthy' | 'degraded' | 'failing';
  lastSuccess?: Date;
  lastFailure?: Date;
  errorRate: number;
  avgResponseTime?: number;
  recentErrors: string[];
}

export interface DiagnosticIssue {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: string;
  description: string;
  impact: string;
  suggestedFix?: string;
  canAutoFix: boolean;
}

export interface IDashDiagnosticEngine {
  getDiagnostics(): Promise<AppDiagnostics>;
  logError(error: any): void;
  recordMetric(name: string, value: number): void;
  dispose(): void;
}

export class DashDiagnosticEngine implements IDashDiagnosticEngine {
  private errorLog: DiagnosticError[] = [];
  private performanceMetrics = new Map<string, number[]>();
  private featureHealth = new Map<string, FeatureHealth>();
  private appStartTime = Date.now();
  private crashCount = 0;
  
  constructor() {
    this.initializeErrorHandling();
    this.initializePerformanceMonitoring();
  }
  
  /**
   * Initialize global error handling
   */
  private initializeErrorHandling() {
    // Catch unhandled promise rejections
    const originalHandler = global.onunhandledrejection;
    global.onunhandledrejection = (event: any) => {
      this.logError({
        type: 'UnhandledRejection',
        message: event.reason?.message || String(event.reason),
        stack: event.reason?.stack,
        context: { promise: event.promise }
      });
      if (originalHandler) (originalHandler as any).call(global, event);
    };
    
    // Track console errors
    const originalError = console.error;
    console.error = (...args) => {
      this.logError({
        type: 'ConsoleError',
        message: args.map(a => String(a)).join(' '),
        context: { args }
      });
      originalError(...args);
    };
  }
  
  /**
   * Initialize performance monitoring
   */
  private initializePerformanceMonitoring() {
    // Monitor JS heap size if available
    if (typeof performance !== 'undefined' && 'memory' in performance) {
      setInterval(() => {
        const memory = (performance as any).memory;
        if (memory) {
          this.recordMetric('jsHeapSize', memory.usedJSHeapSize);
        }
      }, 5000);
    }
  }
  
  /**
   * Log an error for diagnostic purposes
   */
  public logError(error: Omit<DiagnosticError, 'timestamp'>) {
    const diagnosticError: DiagnosticError = {
      ...error,
      timestamp: new Date()
    };
    
    this.errorLog.push(diagnosticError);
    
    // Keep only last 100 errors
    if (this.errorLog.length > 100) {
      this.errorLog.shift();
    }
    
    // Update feature health based on error
    this.updateFeatureHealth(error.context?.feature || 'general', false);
  }
  
  /**
   * Record a performance metric
   */
  public recordMetric(name: string, value: number) {
    if (!this.performanceMetrics.has(name)) {
      this.performanceMetrics.set(name, []);
    }
    
    const metrics = this.performanceMetrics.get(name)!;
    metrics.push(value);
    
    // Keep only last 100 measurements
    if (metrics.length > 100) {
      metrics.shift();
    }
  }
  
  /**
   * Update feature health status
   */
  public updateFeatureHealth(feature: string, success: boolean, responseTime?: number) {
    if (!this.featureHealth.has(feature)) {
      this.featureHealth.set(feature, {
        status: 'healthy',
        errorRate: 0,
        recentErrors: []
      });
    }
    
    const health = this.featureHealth.get(feature)!;
    
    if (success) {
      health.lastSuccess = new Date();
      if (responseTime) {
        if (!health.avgResponseTime) health.avgResponseTime = responseTime;
        else health.avgResponseTime = (health.avgResponseTime + responseTime) / 2;
      }
    } else {
      health.lastFailure = new Date();
      health.errorRate = Math.min(1, health.errorRate + 0.1);
    }
    
    // Update status based on error rate
    if (health.errorRate > 0.5) {
      health.status = 'failing';
    } else if (health.errorRate > 0.2) {
      health.status = 'degraded';
    } else {
      health.status = 'healthy';
    }
    
    // Decay error rate over time
    if (success) {
      health.errorRate = Math.max(0, health.errorRate - 0.05);
    }
  }
  
  /**
   * Perform comprehensive app diagnostics
   */
  public async getDiagnostics(): Promise<AppDiagnostics> {
    return this.runFullDiagnostics();
  }

  public async runFullDiagnostics(): Promise<AppDiagnostics> {
    const [system, network, app, performance, features] = await Promise.all([
      this.getSystemDiagnostics(),
      this.getNetworkDiagnostics(),
      this.getAppDiagnostics(),
      this.getPerformanceDiagnostics(),
      this.getFeatureDiagnostics()
    ]);
    
    const issues = this.detectIssues({ system, network, app, performance, features });
    const recommendations = this.generateRecommendations(issues);
    
    return {
      system,
      network,
      app,
      performance,
      features,
      issues,
      recommendations
    };
  }
  
  /**
   * Get system diagnostics
   */
  private async getSystemDiagnostics() {
    const storageInfo = await FileSystem.getFreeDiskStorageAsync();
    const totalSpace = await FileSystem.getTotalDiskCapacityAsync();
    
    return {
      platform: Platform.OS,
      version: Platform.Version ? String(Platform.Version) : 'unknown',
      device: `${Device.brand} ${Device.modelName}`,
      memory: {
        used: 0, // Would need native module for real memory stats
        total: Device.totalMemory || 0,
        available: 0
      },
      storage: {
        used: totalSpace - storageInfo,
        free: storageInfo
      },
      battery: undefined // Would need expo-battery
    };
  }
  
  /**
   * Get network diagnostics
   * Uses dynamic import to handle missing expo-network gracefully
   */
  private async getNetworkDiagnostics() {
    try {
      // Skip on web - expo-network is primarily for native
      if (Platform.OS === 'web') {
        if (__DEV__) {
          console.log('[DashDiagnostics] Network diagnostics unavailable on web');
        }
        return {
          isConnected: typeof navigator !== 'undefined' && navigator.onLine,
          type: 'unknown',
          isInternetReachable: typeof navigator !== 'undefined' && navigator.onLine,
          ipAddress: undefined
        };
      }

      // Dynamic import for native platforms
      const Network = await import('expo-network');
      const networkState = await Network.getNetworkStateAsync();
      const ip = await Network.getIpAddressAsync().catch(() => undefined);
      
      return {
        isConnected: networkState.isConnected || false,
        type: networkState.type || 'unknown',
        isInternetReachable: networkState.isInternetReachable || false,
        ipAddress: ip
      };
    } catch (error) {
      // Graceful fallback if expo-network is not available
      if (__DEV__) {
        console.warn('[DashDiagnostics] expo-network unavailable, using fallback:', error);
      }
      return {
        isConnected: true, // Assume connected
        type: 'unknown',
        isInternetReachable: true,
        ipAddress: undefined
      };
    }
  }
  
  /**
   * Get app diagnostics
   */
  private async getAppDiagnostics() {
    return {
      version: Application.nativeApplicationVersion || 'unknown',
      buildNumber: Application.nativeBuildVersion || 'unknown',
      uptime: Date.now() - this.appStartTime,
      crashes: this.crashCount,
      errors: this.errorLog.slice(-20) // Last 20 errors
    };
  }
  
  /**
   * Get performance diagnostics
   */
  private getPerformanceDiagnostics() {
    const getAverage = (metrics: number[]) => {
      if (!metrics || metrics.length === 0) return 0;
      return metrics.reduce((a, b) => a + b, 0) / metrics.length;
    };
    
    return {
      jsHeapSize: getAverage(this.performanceMetrics.get('jsHeapSize') || []),
      renderTime: getAverage(this.performanceMetrics.get('renderTime') || []),
      apiResponseTime: getAverage(this.performanceMetrics.get('apiResponseTime') || []),
      cacheHitRate: getAverage(this.performanceMetrics.get('cacheHitRate') || [])
    };
  }
  
  /**
   * Get feature health diagnostics
   */
  private async getFeatureDiagnostics() {
    // Test key features
    await this.testDatabaseHealth();
    await this.testStorageHealth();
    await this.testAuthHealth();
    
    return {
      recording: this.featureHealth.get('recording') || this.createHealthyFeature(),
      transcription: this.featureHealth.get('transcription') || this.createHealthyFeature(),
      database: this.featureHealth.get('database') || this.createHealthyFeature(),
      auth: this.featureHealth.get('auth') || this.createHealthyFeature(),
      storage: this.featureHealth.get('storage') || this.createHealthyFeature()
    };
  }
  
  /**
   * Test database health
   */
  private async testDatabaseHealth() {
    try {
      const start = Date.now();
      const { error } = await assertSupabase()
        .from('profiles')
        .select('id')
        .limit(1);
      
      const responseTime = Date.now() - start;
      this.updateFeatureHealth('database', !error, responseTime);
      
      if (error) {
        this.logError({
          type: 'DatabaseError',
          message: error.message,
          context: { feature: 'database', operation: 'health_check' }
        });
      }
    } catch (error) {
      this.updateFeatureHealth('database', false);
    }
  }
  
  /**
   * Test storage health
   */
  private async testStorageHealth() {
    try {
      const testKey = '__dash_health_check__';
      await AsyncStorage.setItem(testKey, Date.now().toString());
      const value = await AsyncStorage.getItem(testKey);
      await AsyncStorage.removeItem(testKey);
      
      this.updateFeatureHealth('storage', !!value);
    } catch (error) {
      this.updateFeatureHealth('storage', false);
      this.logError({
        type: 'StorageError',
        message: error instanceof Error ? error.message : 'Storage test failed',
        context: { feature: 'storage', operation: 'health_check' }
      });
    }
  }
  
  /**
   * Test auth health
   */
  private async testAuthHealth() {
    try {
      const { data, error } = await assertSupabase().auth.getSession();
      this.updateFeatureHealth('auth', !!data?.session && !error);
      
      if (error) {
        this.logError({
          type: 'AuthError',
          message: error.message,
          context: { feature: 'auth', operation: 'health_check' }
        });
      }
    } catch (error) {
      this.updateFeatureHealth('auth', false);
    }
  }
  
  /**
   * Detect issues based on diagnostics
   */
  private detectIssues(diagnostics: Partial<AppDiagnostics>): DiagnosticIssue[] {
    const issues: DiagnosticIssue[] = [];
    
    // Check system issues
    if (diagnostics.system?.storage.free < 100 * 1024 * 1024) { // Less than 100MB
      issues.push({
        id: 'low-storage',
        severity: 'high',
        type: 'system',
        description: 'Device storage is critically low',
        impact: 'App may fail to record audio or save data',
        suggestedFix: 'Clear app cache and unused files',
        canAutoFix: true
      });
    }
    
    // Check network issues
    if (!diagnostics.network?.isConnected) {
      issues.push({
        id: 'no-network',
        severity: 'high',
        type: 'network',
        description: 'No network connection detected',
        impact: 'Cannot sync data or use AI features',
        suggestedFix: 'Check your internet connection',
        canAutoFix: false
      });
    }
    
    // Check feature health
    if (diagnostics.features?.recording.status === 'failing') {
      issues.push({
        id: 'recording-failing',
        severity: 'critical',
        type: 'feature',
        description: 'Voice recording feature is failing',
        impact: 'Cannot use voice input with Dash',
        suggestedFix: 'Reset audio permissions and restart app',
        canAutoFix: true
      });
    }
    
    if (diagnostics.features?.transcription.status !== 'healthy') {
      issues.push({
        id: 'transcription-issues',
        severity: 'medium',
        type: 'feature',
        description: 'Transcription service is experiencing issues',
        impact: 'Voice messages may not be transcribed correctly',
        suggestedFix: 'Check API quota and network connection',
        canAutoFix: false
      });
    }
    
    // Check performance issues
    if (diagnostics.performance?.apiResponseTime > 3000) {
      issues.push({
        id: 'slow-api',
        severity: 'medium',
        type: 'performance',
        description: 'API responses are slow',
        impact: 'App may feel sluggish',
        suggestedFix: 'Clear cache and check network speed',
        canAutoFix: true
      });
    }
    
    // Check error frequency
    const recentErrors = diagnostics.app?.errors.filter(e => 
      new Date().getTime() - new Date(e.timestamp).getTime() < 5 * 60 * 1000 // Last 5 minutes
    ) || [];
    
    if (recentErrors.length > 10) {
      issues.push({
        id: 'high-error-rate',
        severity: 'high',
        type: 'stability',
        description: 'App is experiencing frequent errors',
        impact: 'Features may not work reliably',
        suggestedFix: 'Restart the app and clear cache',
        canAutoFix: true
      });
    }
    
    return issues;
  }
  
  /**
   * Generate recommendations based on issues
   */
  private generateRecommendations(issues: DiagnosticIssue[]): string[] {
    const recommendations: string[] = [];
    
    // Group by severity
    const critical = issues.filter(i => i.severity === 'critical');
    const high = issues.filter(i => i.severity === 'high');
    const medium = issues.filter(i => i.severity === 'medium');
    
    if (critical.length > 0) {
      recommendations.push('🚨 Critical issues detected that need immediate attention');
    }
    
    // Generate specific recommendations
    if (issues.some(i => i.id === 'low-storage')) {
      recommendations.push('Clear app cache to free up storage space');
    }
    
    if (issues.some(i => i.id === 'recording-failing')) {
      recommendations.push('Check microphone permissions in device settings');
    }
    
    if (issues.some(i => i.type === 'network')) {
      recommendations.push('Ensure stable internet connection for best performance');
    }
    
    if (issues.some(i => i.canAutoFix)) {
      recommendations.push('Some issues can be automatically fixed. Ask me to "fix app issues"');
    }
    
    // General health recommendations
    if (issues.length === 0) {
      recommendations.push('✅ App is running smoothly with no issues detected');
    } else if (issues.length < 3) {
      recommendations.push('App health is generally good with minor issues');
    } else {
      recommendations.push('Consider restarting the app to resolve multiple issues');
    }
    
    return recommendations;
  }
  
  /**
   * Attempt to auto-fix issues
   */
  public async autoFixIssues(issueIds?: string[]): Promise<{ fixed: string[], failed: string[] }> {
    const diagnostics = await this.runFullDiagnostics();
    const issues = issueIds 
      ? diagnostics.issues.filter(i => issueIds.includes(i.id))
      : diagnostics.issues.filter(i => i.canAutoFix);
    
    const fixed: string[] = [];
    const failed: string[] = [];
    
    for (const issue of issues) {
      try {
        switch (issue.id) {
          case 'low-storage':
            await this.clearAppCache();
            fixed.push(issue.id);
            break;
            
          case 'recording-failing':
            await this.resetAudioSystem();
            fixed.push(issue.id);
            break;
            
          case 'slow-api':
            await this.clearNetworkCache();
            fixed.push(issue.id);
            break;
            
          case 'high-error-rate':
            await this.clearErrorLog();
            fixed.push(issue.id);
            break;
            
          default:
            failed.push(issue.id);
        }
      } catch (error) {
        logger.error(`Failed to auto-fix issue ${issue.id}:`, error);
        failed.push(issue.id);
      }
    }
    
    return { fixed, failed };
  }
  
  /**
   * Clear app cache
   */
  private async clearAppCache() {
    try {
      // Clear AsyncStorage selectively (keep auth data)
      const keys = await AsyncStorage.getAllKeys();
      const keysToRemove = keys.filter(k => 
        !k.includes('auth') && 
        !k.includes('user') && 
        !k.includes('session')
      );
      await AsyncStorage.multiRemove(keysToRemove);
      
      // Clear file system cache
      const cacheDir = `${FileSystem.cacheDirectory}dash_cache/`;
      await FileSystem.deleteAsync(cacheDir, { idempotent: true });
      
      logger.info('App cache cleared successfully');
    } catch (error) {
      throw new Error('Failed to clear cache');
    }
  }
  
  /**
   * Reset audio system
   */
  private async resetAudioSystem() {
    // This would reset audio permissions and clear recording cache
    const recordingCache = `${FileSystem.cacheDirectory}recordings/`;
    await FileSystem.deleteAsync(recordingCache, { idempotent: true });
    
    // Reset feature health
    this.featureHealth.delete('recording');
    this.featureHealth.delete('transcription');
  }
  
  /**
   * Clear network cache
   */
  private async clearNetworkCache() {
    // Clear any cached API responses
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter(k => k.includes('cache') || k.includes('api'));
    await AsyncStorage.multiRemove(cacheKeys);
  }
  
  /**
   * Clear error log
   */
  private async clearErrorLog() {
    this.errorLog = [];
    // Reset error rates for all features
    this.featureHealth.forEach(health => {
      health.errorRate = 0;
      health.recentErrors = [];
    });
  }
  
  /**
   * Create a healthy feature status
   */
  private createHealthyFeature(): FeatureHealth {
    return {
      status: 'healthy',
      errorRate: 0,
      recentErrors: []
    };
  }
  
  /**
   * Get diagnostic summary for Dash
   */
  public async getDiagnosticSummary(): Promise<string> {
    const diagnostics = await this.runFullDiagnostics();
    
    let summary = `**System Diagnostics**\n`;
    summary += `- Platform: ${diagnostics.system.platform} ${diagnostics.system.version}\n`;
    summary += `- Device: ${diagnostics.system.device}\n`;
    summary += `- Storage: ${Math.round(diagnostics.system.storage.free / 1024 / 1024)}MB free\n`;
    summary += `- Network: ${diagnostics.network.isConnected ? 'Connected' : 'Disconnected'} (${diagnostics.network.type})\n\n`;
    
    summary += `**App Health**\n`;
    summary += `- Version: ${diagnostics.app.version} (${diagnostics.app.buildNumber})\n`;
    summary += `- Uptime: ${Math.round(diagnostics.app.uptime / 1000 / 60)} minutes\n`;
    summary += `- Recent errors: ${diagnostics.app.errors.length}\n\n`;
    
    summary += `**Feature Status**\n`;
    Object.entries(diagnostics.features).forEach(([feature, health]) => {
      const icon = health.status === 'healthy' ? '✅' : health.status === 'degraded' ? '⚠️' : '❌';
      summary += `- ${feature}: ${icon} ${health.status}\n`;
    });
    
    if (diagnostics.issues.length > 0) {
      summary += `\n**Issues Detected**\n`;
      diagnostics.issues.forEach(issue => {
        const icon = issue.severity === 'critical' ? '🚨' : issue.severity === 'high' ? '❗' : '⚠️';
        summary += `${icon} ${issue.description}\n`;
      });
    }
    
    summary += `\n**Recommendations**\n`;
    diagnostics.recommendations.forEach(rec => {
      summary += `- ${rec}\n`;
    });
    
    return summary;
  }

  dispose(): void {
    this.errorLog = [];
    this.performanceMetrics.clear();
    this.featureHealth.clear();
  }
}

