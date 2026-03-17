import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { isPlatformStaff } from '@/lib/roleUtils';
import { AlertModal, useAlertModal } from '@/components/ui/AlertModal';
import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { useSuperAdminSystemTest } from '@/hooks/super-admin-system-test';

import { createStyles, getStatusColor } from '@/lib/screen-styles/super-admin-system-test.styles';

export default function SuperAdminSystemTestScreen() {
  const { profile } = useAuth();
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const { showAlert, alertProps } = useAlertModal();

  const {
    testSuites,
    runningAllTests,
    overallStatus,
    runTestSuite,
    runAllTests,
  } = useSuperAdminSystemTest({ showAlert });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'passed':
        return <Ionicons name="checkmark-circle" size={20} color="#10b981" />;
      case 'failed':
        return <Ionicons name="close-circle" size={20} color="#ef4444" />;
      case 'running':
        return <EduDashSpinner size="small" color="#f59e0b" />;
      default:
        return <Ionicons name="time" size={20} color="#6b7280" />;
    }
  };

  if (!profile || !isPlatformStaff(profile.role)) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'System Tests', headerShown: false }} />
        <StatusBar style="light" />
        <SafeAreaView style={styles.deniedContainer}>
          <Text style={styles.deniedText}>Access Denied - Super Admin Only</Text>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'System Tests', headerShown: false }} />
      <StatusBar style="light" />
      
      {/* Header */}
      <SafeAreaView style={styles.header}>
        <View style={styles.headerContent}>
          <TouchableOpacity 
            onPress={() => router.canGoBack() ? router.back() : router.push('/screens/super-admin-dashboard')} 
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={24} color="#00f5ff" />
          </TouchableOpacity>
          <Text style={styles.title}>System Tests</Text>
          <TouchableOpacity 
            onPress={runAllTests} 
            style={styles.runButton}
            disabled={runningAllTests}
          >
            {runningAllTests ? (
              <EduDashSpinner size="small" color="#00f5ff" />
            ) : (
              <Ionicons name="play" size={24} color="#00f5ff" />
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <ScrollView style={styles.content}>
        {/* Overall Status */}
        <View style={styles.overallStatus}>
          <Text style={styles.overallStatusText}>
            Test Status: {overallStatus.toUpperCase()}
          </Text>
          {overallStatus === 'completed' && (
            <View style={styles.summaryStats}>
              <Text style={styles.summaryText}>
                Total Suites: {testSuites.length} | 
                Total Tests: {testSuites.reduce((acc, suite) => acc + suite.tests.length, 0)} |
                Passed: {testSuites.reduce((acc, suite) => 
                  acc + suite.tests.filter(test => test.status === 'passed').length, 0
                )} |
                Failed: {testSuites.reduce((acc, suite) => 
                  acc + suite.tests.filter(test => test.status === 'failed').length, 0
                )}
              </Text>
            </View>
          )}
        </View>

        {/* Test Suites */}
        {testSuites.map((suite) => (
          <View key={suite.id} style={styles.suiteCard}>
            <View style={styles.suiteHeader}>
              <View style={styles.suiteInfo}>
                <Text style={styles.suiteName}>{suite.name}</Text>
                <Text style={styles.suiteDescription}>{suite.description}</Text>
              </View>
              <View style={styles.suiteActions}>
                <View style={[styles.suiteStatus, { backgroundColor: getStatusColor(suite.status) + '20' }]}>
                  <Text style={[styles.suiteStatusText, { color: getStatusColor(suite.status) }]}>
                    {suite.status.toUpperCase()}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => runTestSuite(suite.id)}
                  disabled={suite.status === 'running' || runningAllTests}
                  style={styles.runSuiteButton}
                >
                  {suite.status === 'running' ? (
                    <EduDashSpinner size="small" color={theme.primary} />
                  ) : (
                    <Ionicons name="play" size={16} color={theme.primary} />
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {/* Tests */}
            <View style={styles.testsContainer}>
              {suite.tests.map((test) => (
                <View key={test.id} style={styles.testItem}>
                  <View style={styles.testHeader}>
                    <View style={styles.testInfo}>
                      <Text style={styles.testName}>{test.name}</Text>
                      <Text style={styles.testDescription}>{test.description}</Text>
                    </View>
                    <View style={styles.testStatus}>
                      {getStatusIcon(test.status)}
                      {test.duration && (
                        <Text style={styles.testDuration}>{test.duration}ms</Text>
                      )}
                    </View>
                  </View>
                  
                  {test.error && (
                    <View style={styles.testError}>
                      <Text style={styles.testErrorText}>{test.error}</Text>
                    </View>
                  )}
                  
                  {test.details && (
                    <View style={styles.testDetails}>
                      <Text style={styles.testDetailsText}>
                        {JSON.stringify(test.details, null, 2)}
                      </Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          </View>
        ))}
        <AlertModal {...alertProps} />
      </ScrollView>
    </View>
  );
}