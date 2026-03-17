import { useCallback, useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { track } from '@/lib/analytics';
import { useAuth } from '@/contexts/AuthContext';
import { isPlatformStaff } from '@/lib/roleUtils';
import { fetchWhatsAppData } from './fetchWhatsAppData';
import { type ShowAlertConfig, type ConfigData, INITIAL_CONFIG } from './types';
import type { WhatsAppConnection, WhatsAppTemplate, WhatsAppMetrics } from './types';

export function useSuperAdminWhatsApp(showAlert: (config: ShowAlertConfig) => void) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [connections, setConnections] = useState<WhatsAppConnection[]>([]);
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [metrics, setMetrics] = useState<WhatsAppMetrics | null>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [configData, setConfigData] = useState<ConfigData>(INITIAL_CONFIG);
  const [isConfigured, setIsConfigured] = useState(false);

  const loadWhatsAppData = useCallback(async () => {
    if (!isPlatformStaff(profile?.role)) {
      showAlert({ title: 'Access Denied', message: 'Super admin privileges required' });
      return;
    }

    setLoading(true);
    const result = await fetchWhatsAppData();
    setIsConfigured(result.isConfigured);
    setConnections(result.connections);
    setTemplates(result.templates);
    setMetrics(result.metrics);
    setLoading(false);
  }, [profile?.role, showAlert]);

  useEffect(() => {
    loadWhatsAppData();
  }, [loadWhatsAppData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadWhatsAppData();
    setRefreshing(false);
  }, [loadWhatsAppData]);

  const handleConfigureBusiness = () => {
    showAlert({
      title: 'WhatsApp Business Setup',
      message: 'To integrate WhatsApp Business API, you need to:\n\n1. Create a WhatsApp Business Account\n2. Set up a Facebook App\n3. Configure webhooks\n4. Get verification tokens\n\nWould you like to open the Facebook Developer portal?',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open Portal',
          onPress: () => {
            Linking.openURL('https://developers.facebook.com/');
            track('superadmin_whatsapp_business_setup_opened');
          },
        },
      ],
    });
  };

  const handleSendTestMessage = (connection: WhatsAppConnection) => {
    showAlert({
      title: 'Send Test Message',
      message: `Send a test message to ${connection.school_name}?`,
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: () => {
            track('superadmin_whatsapp_test_message_sent', {
              school_id: connection.school_id,
              phone_number: connection.phone_number,
            });
            showAlert({ title: 'Success', message: 'Test message sent successfully!' });
          },
        },
      ],
    });
  };

  return {
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
  };
}
