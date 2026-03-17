import React from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Modal, TextInput, Switch } from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { isPlatformStaff } from '@/lib/roleUtils';
import { useTheme } from '@/contexts/ThemeContext';
import { AlertModal, useAlertModal } from '@/components/ui/AlertModal';
import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { useSuperAdminWhatsApp } from '@/hooks/useSuperAdminWhatsApp';
import { createStyles, getStatusColor, getStatusIcon } from '@/lib/screen-styles/super-admin-whatsapp.styles';

export default function SuperAdminWhatsAppScreen() {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const { showAlert, alertProps } = useAlertModal();

  const {
    profile,
    loading,
    refreshing,
    connections,
    templates,
    metrics,
    showConfigModal,
    setShowConfigModal,
    showTemplateModal,
    setShowTemplateModal,
    configData,
    setConfigData,
    isConfigured,
    onRefresh,
    handleConfigureBusiness,
    handleSendTestMessage,
  } = useSuperAdminWhatsApp(showAlert);

  if (!profile || !isPlatformStaff(profile.role)) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'WhatsApp Hub', headerShown: false }} />
        <StatusBar style="light" />
        <SafeAreaView style={styles.deniedContainer}>
          <Text style={styles.deniedText}>Access Denied - Super Admin Only</Text>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'WhatsApp Hub', headerShown: false }} />
      <StatusBar style="light" />
      
      {/* Header */}
      <SafeAreaView style={styles.header}>
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#25d366" />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Ionicons name="logo-whatsapp" size={28} color="#25d366" />
            <Text style={styles.title}>WhatsApp Hub</Text>
          </View>
          <TouchableOpacity 
            style={styles.configButton}
            onPress={() => setShowConfigModal(true)}
          >
            <Ionicons name="settings" size={24} color="#25d366" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#25d366" />}
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <EduDashSpinner size="large" color="#25d366" />
            <Text style={styles.loadingText}>Loading WhatsApp data...</Text>
          </View>
        ) : !isConfigured ? (
          <View style={styles.notConfiguredContainer}>
            <View style={styles.notConfiguredCard}>
              <Ionicons name="logo-whatsapp" size={64} color="#25d366" style={{ opacity: 0.6 }} />
              <Text style={styles.notConfiguredTitle}>WhatsApp Integration Not Configured</Text>
              <Text style={styles.notConfiguredDescription}>
                Connect your WhatsApp Business API to enable messaging with schools and parents.
              </Text>
              <TouchableOpacity 
                style={styles.configureButton}
                onPress={handleConfigureBusiness}
              >
                <Ionicons name="settings-outline" size={20} color="#FFFFFF" />
                <Text style={styles.configureButtonText}>Set Up WhatsApp Business</Text>
              </TouchableOpacity>
              
              <View style={styles.setupSteps}>
                <Text style={styles.setupStepsTitle}>Setup Steps:</Text>
                <View style={styles.setupStep}>
                  <Text style={styles.setupStepNumber}>1</Text>
                  <Text style={styles.setupStepText}>Create a Meta Business Account</Text>
                </View>
                <View style={styles.setupStep}>
                  <Text style={styles.setupStepNumber}>2</Text>
                  <Text style={styles.setupStepText}>Set up WhatsApp Business API</Text>
                </View>
                <View style={styles.setupStep}>
                  <Text style={styles.setupStepNumber}>3</Text>
                  <Text style={styles.setupStepText}>Configure webhook endpoints</Text>
                </View>
                <View style={styles.setupStep}>
                  <Text style={styles.setupStepNumber}>4</Text>
                  <Text style={styles.setupStepText}>Add API credentials in settings</Text>
                </View>
              </View>
            </View>
          </View>
        ) : (
          <>
            {/* Metrics Overview */}
            {metrics && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>WhatsApp Business Metrics</Text>
                <View style={styles.metricsGrid}>
                  <View style={styles.metricCard}>
                    <Text style={styles.metricValue}>{metrics.total_connections}</Text>
                    <Text style={styles.metricLabel}>Total Connections</Text>
                  </View>
                  <View style={styles.metricCard}>
                    <Text style={styles.metricValue}>{metrics.active_connections}</Text>
                    <Text style={styles.metricLabel}>Active</Text>
                  </View>
                  <View style={styles.metricCard}>
                    <Text style={styles.metricValue}>{metrics.messages_sent_today}</Text>
                    <Text style={styles.metricLabel}>Messages Today</Text>
                  </View>
                  <View style={styles.metricCard}>
                    <Text style={styles.metricValue}>{metrics.delivery_rate}%</Text>
                    <Text style={styles.metricLabel}>Delivery Rate</Text>
                  </View>
                  <View style={styles.metricCard}>
                    <Text style={styles.metricValue}>{metrics.messages_sent_month}</Text>
                    <Text style={styles.metricLabel}>Monthly Messages</Text>
                  </View>
                  <View style={styles.metricCard}>
                    <Text style={styles.metricValue}>{metrics.read_rate}%</Text>
                    <Text style={styles.metricLabel}>Read Rate</Text>
                  </View>
                </View>
              </View>
            )}

            {/* School Connections */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>School Connections</Text>
                <TouchableOpacity 
                  style={styles.addButton}
                  onPress={handleConfigureBusiness}
                >
                  <Ionicons name="add" size={20} color="#25d366" />
                  <Text style={styles.addButtonText}>Connect</Text>
                </TouchableOpacity>
              </View>
              
              {connections.map((connection) => (
                <View key={connection.id} style={styles.connectionCard}>
                  <View style={styles.connectionHeader}>
                    <View style={styles.connectionInfo}>
                      <Text style={styles.connectionName}>{connection.school_name}</Text>
                      <Text style={styles.connectionPhone}>{connection.phone_number}</Text>
                    </View>
                    
                    <View style={styles.connectionMeta}>
                      <View style={[
                        styles.statusBadge, 
                        { backgroundColor: getStatusColor(connection.status) + '20', borderColor: getStatusColor(connection.status) }
                      ]}>
                        <Ionicons 
                          name={getStatusIcon(connection.status) as any} 
                          size={12} 
                          color={getStatusColor(connection.status)} 
                        />
                        <Text style={[styles.statusText, { color: getStatusColor(connection.status) }]}>
                          {connection.status.charAt(0).toUpperCase() + connection.status.slice(1)}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.connectionStats}>
                    <Text style={styles.statItem}>
                      <Ionicons name="chatbubble" size={12} color="#6b7280" /> {connection.message_count} messages
                    </Text>
                    <Text style={styles.statItem}>
                      <Ionicons name="time" size={12} color="#6b7280" /> {new Date(connection.last_sync).toLocaleDateString()}
                    </Text>
                    {connection.webhook_verified && (
                      <Text style={styles.statItem}>
                        <Ionicons name="shield-checkmark" size={12} color="#10b981" /> Verified
                      </Text>
                    )}
                  </View>

                  <View style={styles.connectionActions}>
                    <TouchableOpacity 
                      style={styles.actionButton}
                      onPress={() => handleSendTestMessage(connection)}
                    >
                      <Ionicons name="send" size={16} color="#25d366" />
                      <Text style={styles.actionButtonText}>Test Message</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity style={styles.actionButton}>
                      <Ionicons name="stats-chart" size={16} color="#6b7280" />
                      <Text style={[styles.actionButtonText, { color: '#6b7280' }]}>Analytics</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
              
              {connections.length === 0 && (
                <View style={styles.emptyContainer}>
                  <Ionicons name="logo-whatsapp" size={48} color="#6b7280" />
                  <Text style={styles.emptyText}>No WhatsApp connections</Text>
                  <Text style={styles.emptySubText}>Connect schools to WhatsApp Business API</Text>
                  <TouchableOpacity 
                    style={styles.setupButton}
                    onPress={handleConfigureBusiness}
                  >
                    <Text style={styles.setupButtonText}>Setup WhatsApp Business</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Message Templates */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Message Templates</Text>
                <TouchableOpacity 
                  style={styles.addButton}
                  onPress={() => setShowTemplateModal(true)}
                >
                  <Ionicons name="add" size={20} color="#25d366" />
                  <Text style={styles.addButtonText}>Template</Text>
                </TouchableOpacity>
              </View>
              
              {templates.map((template) => (
                <View key={template.id} style={styles.templateCard}>
                  <View style={styles.templateHeader}>
                    <Text style={styles.templateName}>{template.name.replace(/_/g, ' ').toUpperCase()}</Text>
                    <View style={[
                      styles.templateStatus,
                      { 
                        backgroundColor: template.status === 'approved' ? '#10b98120' : 
                                       template.status === 'pending' ? '#f59e0b20' : '#ef444420',
                        borderColor: template.status === 'approved' ? '#10b981' : 
                                   template.status === 'pending' ? '#f59e0b' : '#ef4444'
                      }
                    ]}>
                      <Text style={[
                        styles.templateStatusText,
                        { 
                          color: template.status === 'approved' ? '#10b981' : 
                                template.status === 'pending' ? '#f59e0b' : '#ef4444'
                        }
                      ]}>
                        {template.status.charAt(0).toUpperCase() + template.status.slice(1)}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.templateMeta}>
                    {template.category.charAt(0).toUpperCase() + template.category.slice(1)} • {template.language.toUpperCase()}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      {/* Configuration Modal */}
      <Modal
        visible={showConfigModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowConfigModal(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowConfigModal(false)}>
              <Ionicons name="close" size={24} color="#25d366" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>WhatsApp Configuration</Text>
            <TouchableOpacity>
              <Text style={styles.saveButton}>Save</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            <Text style={styles.configNote}>
              Configure your WhatsApp Business API settings. These settings will be applied globally for all school connections.
            </Text>

            <View style={styles.formSection}>
              <Text style={styles.formLabel}>Webhook URL</Text>
              <TextInput
                style={styles.formInput}
                value={configData.webhook_url}
                onChangeText={(text) => setConfigData(prev => ({ ...prev, webhook_url: text }))}
                placeholder="https://your-domain.com/webhook"
                placeholderTextColor="#6b7280"
              />
            </View>

            <View style={styles.formSection}>
              <Text style={styles.formLabel}>Verify Token</Text>
              <TextInput
                style={styles.formInput}
                value={configData.verify_token}
                onChangeText={(text) => setConfigData(prev => ({ ...prev, verify_token: text }))}
                placeholder="Your webhook verify token"
                placeholderTextColor="#6b7280"
                secureTextEntry
              />
            </View>

            <View style={styles.formSection}>
              <Text style={styles.formLabel}>Facebook App ID</Text>
              <TextInput
                style={styles.formInput}
                value={configData.app_id}
                onChangeText={(text) => setConfigData(prev => ({ ...prev, app_id: text }))}
                placeholder="Your Facebook App ID"
                placeholderTextColor="#6b7280"
              />
            </View>

            <View style={styles.formSection}>
              <Text style={styles.formLabel}>App Secret</Text>
              <TextInput
                style={styles.formInput}
                value={configData.app_secret}
                onChangeText={(text) => setConfigData(prev => ({ ...prev, app_secret: text }))}
                placeholder="Your Facebook App Secret"
                placeholderTextColor="#6b7280"
                secureTextEntry
              />
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <AlertModal {...alertProps} />
    </View>
  );
}