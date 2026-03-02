import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { Stack, router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { useLearnerConnections, useCreateConnection, useUpdateConnectionStatus } from '@/hooks/useLearnerData';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
export default function LearnerConnectionsScreen() {
  const { profile } = useAuth();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const styles = React.useMemo(() => createStyles(theme), [theme]);

  const { data: connections, isLoading, error } = useLearnerConnections();
  const createConnection = useCreateConnection();
  const updateConnection = useUpdateConnectionStatus();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredConnections = React.useMemo(() => {
    if (!connections) return [];
    if (!searchQuery) return connections;
    const query = searchQuery.toLowerCase();
    return connections.filter((conn) => {
      const name = `${conn.connection?.first_name || ''} ${conn.connection?.last_name || ''}`.toLowerCase();
      return name.includes(query) || conn.connection?.email?.toLowerCase()?.includes(query);
    });
  }, [connections, searchQuery]);

  const groupedConnections = React.useMemo(() => {
    if (!filteredConnections) return { accepted: [], pending: [], blocked: [] };
    return {
      accepted: filteredConnections.filter((c) => c.status === 'accepted'),
      pending: filteredConnections.filter((c) => c.status === 'pending'),
      blocked: filteredConnections.filter((c) => c.status === 'blocked'),
    };
  }, [filteredConnections]);

  return (
    <View style={styles.container}>
      <Stack.Screen 
        options={{ 
          title: t('learner.connections', { defaultValue: 'My Connections' }),
          headerBackTitle: t('common.back', { defaultValue: 'Back' }),
        }} 
      />
      <ScrollView contentContainerStyle={styles.content}>
        {/* Search */}
        <View style={styles.searchContainer}>
          <Ionicons name="search-outline" size={20} color={theme.textSecondary} style={styles.searchIcon} />
          <TextInput
            style={[styles.searchInput, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]}
            placeholder={t('learner.search_connections', { defaultValue: 'Search connections...' })}
            placeholderTextColor={theme.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {isLoading && (
          <View style={styles.empty}>
            <EduDashSpinner size="large" color={theme.primary} />
          </View>
        )}

        {error && (
          <Card padding={20} margin={0}>
            <Text style={styles.errorText}>
              {t('common.error_loading', { defaultValue: 'Error loading connections' })}
            </Text>
          </Card>
        )}

        {!isLoading && (!connections || connections.length === 0) && (
          <EmptyState
            icon="people-outline"
            title={t('learner.no_connections', { defaultValue: 'No Connections Yet' })}
            description={t('learner.connections_prompt', { defaultValue: 'Connect with peers and instructors to enhance your learning experience' })}
          />
        )}

        {/* Accepted Connections */}
        {groupedConnections.accepted.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {t('learner.connections', { defaultValue: 'Connections' })} ({groupedConnections.accepted.length})
            </Text>
            {groupedConnections.accepted.map((connection) => (
              <ConnectionCard
                key={connection.id}
                connection={connection}
                theme={theme}
                t={t}
                onUpdateStatus={(status) => updateConnection.mutate({ connectionId: connection.id, status })}
              />
            ))}
          </View>
        )}

        {/* Pending Requests */}
        {groupedConnections.pending.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {t('learner.pending_requests', { defaultValue: 'Pending Requests' })} ({groupedConnections.pending.length})
            </Text>
            {groupedConnections.pending.map((connection) => (
              <ConnectionCard
                key={connection.id}
                connection={connection}
                theme={theme}
                t={t}
                onUpdateStatus={(status) => updateConnection.mutate({ connectionId: connection.id, status })}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function ConnectionCard({
  connection,
  theme,
  t,
  onUpdateStatus,
}: {
  connection: any;
  theme: any;
  t: any;
  onUpdateStatus: (status: 'accepted' | 'blocked') => void;
}) {
  const styles = createStyles(theme);
  const name = `${connection.connection?.first_name || ''} ${connection.connection?.last_name || ''}`.trim() || 'Unknown';

  return (
    <Card padding={16} margin={0} elevation="small" style={styles.connectionCard}>
      <View style={styles.connectionHeader}>
        <View style={styles.avatar}>
          {connection.connection?.avatar_url ? (
            <Text style={styles.avatarText}>Photo</Text>
          ) : (
            <Ionicons name="person" size={24} color={theme.textSecondary} />
          )}
        </View>
        <View style={styles.connectionInfo}>
          <Text style={styles.connectionName}>{name}</Text>
          <Text style={styles.connectionType}>
            {connection.connection_type === 'instructor' 
              ? t('learner.instructor', { defaultValue: 'Instructor' })
              : t('learner.peer', { defaultValue: 'Peer' })}
          </Text>
          {connection.connection?.email && (
            <Text style={styles.connectionEmail}>{connection.connection.email}</Text>
          )}
        </View>
        {connection.status === 'pending' && (
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: theme.success || '#10B981' }]}
              onPress={() => onUpdateStatus('accepted')}
            >
              <Ionicons name="checkmark" size={18} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: theme.error || '#EF4444' }]}
              onPress={() => onUpdateStatus('blocked')}
            >
              <Ionicons name="close" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        )}
        {connection.status === 'accepted' && (
          <View style={styles.statusBadge}>
            <Ionicons name="checkmark-circle" size={24} color={theme.success || '#10B981'} />
          </View>
        )}
      </View>
    </Card>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme?.background || '#0b1220' },
  content: { padding: 16, paddingBottom: 32 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    position: 'relative',
  },
  searchIcon: {
    position: 'absolute',
    left: 12,
    zIndex: 1,
  },
  searchInput: {
    flex: 1,
    height: 44,
    paddingLeft: 44,
    paddingRight: 16,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 16,
  },
  section: { marginBottom: 24 },
  sectionTitle: { color: theme?.text || '#fff', fontSize: 18, fontWeight: '700', marginBottom: 12 },
  connectionCard: { marginBottom: 12 },
  connectionHeader: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme?.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: { color: theme?.textSecondary, fontSize: 12 },
  connectionInfo: { flex: 1 },
  connectionName: { color: theme?.text || '#fff', fontSize: 16, fontWeight: '600', marginBottom: 4 },
  connectionType: { color: theme?.primary, fontSize: 13, marginBottom: 2 },
  connectionEmail: { color: theme?.textSecondary || '#9CA3AF', fontSize: 12 },
  actionButtons: { flexDirection: 'row', gap: 8 },
  actionButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  statusBadge: { marginLeft: 8 },
  errorText: { color: theme?.error || '#EF4444', textAlign: 'center' },
});






