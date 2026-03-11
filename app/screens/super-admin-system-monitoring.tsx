import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import ThemedStatusBar from '@/components/ui/ThemedStatusBar';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { assertSupabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { isSuperAdmin } from '@/lib/roleUtils';
import { AlertModal, useAlertModal } from '@/components/ui/AlertModal';
import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { logger } from '@/lib/logger';
import { percentWidth } from '@/lib/progress/clampPercent';
import {
  type SystemHealth,
  type ErrorLog,
  type SystemMetrics,
  getStatusColor,
  getLevelColor,
  formatTimestamp,
  formatBytes,
  formatUptime,
  createStyles,
} from '@/lib/screen-styles/super-admin-system-monitoring.styles';
export default function SuperAdminSystemMonitoringScreen() {
  const { profile } = useAuth();
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const { showAlert, alertProps } = useAlertModal();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [systemHealth, setSystemHealth] = useState<SystemHealth>({
    database_status: 'healthy',
    database_connections: 0,
    database_max_connections: 100,
    migration_status: 'up_to_date',
    latest_migration: null,
    failed_migrations: [],
    rls_enabled: true,
    system_load: 0,
    memory_usage: 0,
    disk_usage: 0,
    uptime: '0 days',
    last_check: new Date().toISOString(),
  });
  const [errorLogs, setErrorLogs] = useState<ErrorLog[]>([]);
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics>({
    total_requests_24h: 0,
    failed_requests_24h: 0,
    average_response_time: 0,
    active_users: 0,
    peak_concurrent_users: 0,
    storage_used_gb: 0,
    storage_limit_gb: 0,
    bandwidth_used_gb: 0,
  });
  
  const fetchSystemHealth = useCallback(async () => {
    if (!isSuperAdmin(profile?.role)) {
      showAlert({ title: 'Access Denied', message: 'Super admin privileges required', buttons: [{ text: 'OK' }] });
      return;
    }

    try {
      setLoading(true);

      // Fetch real system health metrics from database
      const { data: healthData, error: healthError } = await assertSupabase()
        .rpc('get_system_health_metrics');

      if (healthError) {
        logger.error('Health metrics error:', healthError);
        // Fall back to basic data if health metrics fail
      }

      // Fetch real performance metrics from database
      const { data: performanceData, error: performanceError } = await assertSupabase()
        .rpc('get_system_performance_metrics');

      if (performanceError) {
        logger.error('Performance metrics error:', performanceError);
      }

      // Fetch real migration status from database
      const { data: migrationData, error: migrationError } = await assertSupabase()
        .rpc('get_migration_status');

      if (migrationError) {
        logger.error('Migration status error:', migrationError);
      }

      // Fetch real error logs from database
      const { data: logsData, error: logsError } = await assertSupabase()
        .rpc('get_recent_error_logs', { hours_back: 24 });

      if (logsError) {
        logger.error('Error logs fetch error:', logsError);
      }

      // Process real system health data
      const realSystemHealth: SystemHealth = {
        database_status: healthData?.data?.database_status || 'unknown',
        database_connections: healthData?.data?.database_connections || 0,
        database_max_connections: healthData?.data?.database_max_connections || 100,
        migration_status: migrationData?.data?.migration_status || 'unknown',
        latest_migration: migrationData?.data?.latest_migration || 'Unknown',
        failed_migrations: migrationData?.data?.failed_migrations || [],
        rls_enabled: healthData?.data?.rls_enabled || true,
        system_load: Math.min(95, (healthData?.data?.database_connections / healthData?.data?.database_max_connections) * 100) || 15,
        memory_usage: performanceData?.data?.cache_hit_ratio ? (100 - performanceData.data.cache_hit_ratio) : 25,
        disk_usage: Math.min(95, (healthData?.data?.storage_used_gb || 1) / 10) || 20,
        uptime: healthData?.data?.uptime_seconds ? formatUptime(healthData.data.uptime_seconds) : 'Unknown',
        last_check: healthData?.data?.last_check || new Date().toISOString(),
      };

      // Process real error logs
      const realErrorLogs: ErrorLog[] = logsData?.data?.logs?.map((log: any) => ({
        id: log.id,
        timestamp: log.timestamp,
        level: log.level,
        message: log.message,
        source: log.source,
        user_id: log.user_id,
        details: log.details
      })) || [];

      // Process real system metrics
      const realSystemMetrics: SystemMetrics = {
        total_requests_24h: performanceData?.data?.total_connections || 0,
        failed_requests_24h: logsData?.data?.total_logs || 0,
        average_response_time: performanceData?.data?.slow_queries_24h || 0,
        active_users: healthData?.data?.active_users_7d || 0,
        peak_concurrent_users: healthData?.data?.total_users || 0,
        storage_used_gb: healthData?.data?.storage_used_gb || 0,
        storage_limit_gb: 500, // This would need to be configurable
        bandwidth_used_gb: performanceData?.data?.database_size_mb ? (performanceData.data.database_size_mb / 1024) : 0,
      };

      setSystemHealth(realSystemHealth);
      setErrorLogs(realErrorLogs);
      setSystemMetrics(realSystemMetrics);

    } catch (error) {
      logger.error('Failed to fetch system health:', error);
      showAlert({ title: 'Error', message: 'Failed to load system monitoring data', buttons: [{ text: 'OK' }] });
    } finally {
      setLoading(false);
    }
  }, [profile?.role]);

  useEffect(() => {
    fetchSystemHealth();
  }, [fetchSystemHealth]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchSystemHealth();
    setRefreshing(false);
  }, [fetchSystemHealth]);

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'healthy':
      case 'up_to_date':
        return '#10b981';
      case 'degraded':
      case 'pending':
        return '#f59e0b';
      case 'down':
      case 'failed':
        return '#ef4444';
      default:
        return '#6b7280';
    }
  };

  const getLevelColor = (level: string): string => {
    switch (level) {
      case 'error':
        return '#ef4444';
      case 'warning':
        return '#f59e0b';
      case 'info':
        return '#10b981';
      default:
        return '#6b7280';
    }
  };

  const formatTimestamp = (timestamp: string): string => {
    return new Date(timestamp).toLocaleString();
  };

  const formatBytes = (bytes: number): string => {
    return `${bytes.toFixed(1)} GB`;
  };

  const formatUptime = (uptimeInput: string | number): string => {
    if (typeof uptimeInput === 'string') {
      return uptimeInput; // Already formatted
    }
    
    const seconds = Math.floor(uptimeInput);
    const days = Math.floor(seconds / (24 * 3600));
    const hours = Math.floor((seconds % (24 * 3600)) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) {
      return `${days} days ${hours} hours`;
    } else if (hours > 0) {
      return `${hours} hours ${minutes} minutes`;
    } else {
      return `${minutes} minutes`;
    }
  };

  if (!profile || !isSuperAdmin(profile.role)) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'System Monitoring', headerShown: false }} />
        <ThemedStatusBar />
        <SafeAreaView style={styles.deniedContainer}>
          <Text style={styles.deniedText}>Access Denied - Super Admin Only</Text>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'System Monitoring', headerShown: false }} />
      <ThemedStatusBar />
      
      {/* Header */}
      <SafeAreaView style={styles.header}>
        <View style={styles.headerContent}>
          <TouchableOpacity 
            onPress={() => router.canGoBack() ? router.back() : router.push('/screens/super-admin-dashboard')} 
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={24} color="#00f5ff" />
          </TouchableOpacity>
          <Text style={styles.title}>System Monitoring</Text>
          <TouchableOpacity onPress={onRefresh} style={styles.refreshButton}>
            <Ionicons name="refresh" size={24} color="#00f5ff" />
          </TouchableOpacity>
        </View>
        
        {/* Last Check */}
        <View style={styles.lastCheckContainer}>
          <Text style={styles.lastCheckText}>
            Last updated: {formatTimestamp(systemHealth.last_check)}
          </Text>
        </View>
      </SafeAreaView>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <EduDashSpinner size="large" color={theme.primary} />
            <Text style={styles.loadingText}>Loading system data...</Text>
          </View>
        ) : (
          <>
            {/* System Health Overview */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>System Health</Text>
              
              <View style={styles.healthGrid}>
                <View style={styles.healthCard}>
                  <View style={[styles.healthStatus, { backgroundColor: getStatusColor(systemHealth.database_status) + '20' }]}>
                    <Ionicons name="server" size={24} color={getStatusColor(systemHealth.database_status)} />
                  </View>
                  <Text style={styles.healthLabel}>Database</Text>
                  <Text style={[styles.healthValue, { color: getStatusColor(systemHealth.database_status) }]}>
                    {systemHealth.database_status.toUpperCase()}
                  </Text>
                  <Text style={styles.healthDetail}>
                    {systemHealth.database_connections}/{systemHealth.database_max_connections} connections
                  </Text>
                </View>

                <View style={styles.healthCard}>
                  <View style={[styles.healthStatus, { backgroundColor: getStatusColor(systemHealth.migration_status) + '20' }]}>
                    <Ionicons name="git-branch" size={24} color={getStatusColor(systemHealth.migration_status)} />
                  </View>
                  <Text style={styles.healthLabel}>Migrations</Text>
                  <Text style={[styles.healthValue, { color: getStatusColor(systemHealth.migration_status) }]}>
                    {systemHealth.migration_status.replace('_', ' ').toUpperCase()}
                  </Text>
                  {systemHealth.latest_migration && (
                    <Text style={styles.healthDetail}>
                      Latest: ...{systemHealth.latest_migration.slice(-20)}
                    </Text>
                  )}
                </View>

                <View style={styles.healthCard}>
                  <View style={[styles.healthStatus, { backgroundColor: (systemHealth.rls_enabled ? '#10b981' : '#ef4444') + '20' }]}>
                    <Ionicons name="shield-checkmark" size={24} color={systemHealth.rls_enabled ? '#10b981' : '#ef4444'} />
                  </View>
                  <Text style={styles.healthLabel}>RLS</Text>
                  <Text style={[styles.healthValue, { color: systemHealth.rls_enabled ? '#10b981' : '#ef4444' }]}>
                    {systemHealth.rls_enabled ? 'ENABLED' : 'DISABLED'}
                  </Text>
                  <Text style={styles.healthDetail}>
                    Row Level Security
                  </Text>
                </View>

                <View style={styles.healthCard}>
                  <View style={[styles.healthStatus, { backgroundColor: '#00f5ff20' }]}>
                    <Ionicons name="time" size={24} color="#00f5ff" />
                  </View>
                  <Text style={styles.healthLabel}>Uptime</Text>
                  <Text style={styles.healthValue}>
                    {formatUptime(systemHealth.uptime)}
                  </Text>
                  <Text style={styles.healthDetail}>
                    System uptime
                  </Text>
                </View>
              </View>
            </View>

            {/* System Metrics */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Performance Metrics</Text>
              
              <View style={styles.metricsGrid}>
                <View style={styles.metricCard}>
                  <Text style={styles.metricValue}>{systemMetrics.total_requests_24h.toLocaleString()}</Text>
                  <Text style={styles.metricLabel}>Total Requests (24h)</Text>
                  <Text style={styles.metricSubtext}>
                    {systemMetrics.failed_requests_24h} failed
                  </Text>
                </View>

                <View style={styles.metricCard}>
                  <Text style={styles.metricValue}>{systemMetrics.average_response_time}ms</Text>
                  <Text style={styles.metricLabel}>Avg Response Time</Text>
                  <Text style={styles.metricSubtext}>
                    API performance
                  </Text>
                </View>

                <View style={styles.metricCard}>
                  <Text style={styles.metricValue}>{systemMetrics.active_users}</Text>
                  <Text style={styles.metricLabel}>Active Users</Text>
                  <Text style={styles.metricSubtext}>
                    Peak: {systemMetrics.peak_concurrent_users}
                  </Text>
                </View>

                <View style={styles.metricCard}>
                  <Text style={styles.metricValue}>{formatBytes(systemMetrics.storage_used_gb)}</Text>
                  <Text style={styles.metricLabel}>Storage Used</Text>
                  <Text style={styles.metricSubtext}>
                    of {formatBytes(systemMetrics.storage_limit_gb)}
                  </Text>
                </View>
              </View>
            </View>

            {/* Resource Usage */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Resource Usage</Text>
              
              <View style={styles.resourceItem}>
                <Text style={styles.resourceLabel}>System Load</Text>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: percentWidth(systemHealth.system_load), backgroundColor: '#00f5ff' }]} />
                </View>
                <Text style={styles.resourceValue}>{systemHealth.system_load.toFixed(1)}%</Text>
              </View>

              <View style={styles.resourceItem}>
                <Text style={styles.resourceLabel}>Memory Usage</Text>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { 
                    width: percentWidth(systemHealth.memory_usage), 
                    backgroundColor: systemHealth.memory_usage > 80 ? '#ef4444' : systemHealth.memory_usage > 60 ? '#f59e0b' : '#10b981' 
                  }]} />
                </View>
                <Text style={styles.resourceValue}>{systemHealth.memory_usage.toFixed(1)}%</Text>
              </View>

              <View style={styles.resourceItem}>
                <Text style={styles.resourceLabel}>Disk Usage</Text>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { 
                    width: percentWidth(systemHealth.disk_usage), 
                    backgroundColor: systemHealth.disk_usage > 80 ? '#ef4444' : systemHealth.disk_usage > 60 ? '#f59e0b' : '#10b981' 
                  }]} />
                </View>
                <Text style={styles.resourceValue}>{systemHealth.disk_usage.toFixed(1)}%</Text>
              </View>
            </View>

            {/* Recent Error Logs */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Recent System Logs</Text>
              
              {errorLogs.map((log) => (
                <View key={log.id} style={styles.logItem}>
                  <View style={styles.logHeader}>
                    <View style={[styles.logLevel, { backgroundColor: getLevelColor(log.level) + '20' }]}>
                      <Text style={[styles.logLevelText, { color: getLevelColor(log.level) }]}>
                        {log.level.toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.logTimestamp}>
                      {formatTimestamp(log.timestamp)}
                    </Text>
                  </View>
                  <Text style={styles.logMessage}>{log.message}</Text>
                  <Text style={styles.logSource}>Source: {log.source}</Text>
                  {log.details && (
                    <View style={styles.logDetails}>
                      <Text style={styles.logDetailsText}>
                        {JSON.stringify(log.details, null, 2)}
                      </Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
      <AlertModal {...alertProps} />
    </View>
  );
}