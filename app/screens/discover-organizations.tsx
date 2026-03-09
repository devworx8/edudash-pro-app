/**
 * Discover Organizations Screen
 *
 * Allows users to browse public organizations that are accepting registrations
 * and submit join requests to become members.
 *
 * @module app/screens/discover-organizations
 */
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, RefreshControl, Image } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useAlertModal, AlertModal } from '@/components/ui/AlertModal';
import { Stack, router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { assertSupabase } from '@/lib/supabase';
import { InviteService } from '@/services/InviteService';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { logger } from '@/lib/logger';
import { Database } from '@/lib/database.types';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
type Organization = Database['public']['Tables']['organizations']['Row'];

interface PublicOrganization {
  id: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  organization_type: string | null;
  is_verified: boolean | null;
}

export default function DiscoverOrganizationsScreen() {
  const { user, profile } = useAuth();
  const { theme } = useTheme();
  const queryClient = useQueryClient();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { showAlert, alertProps } = useAlertModal();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrg, setSelectedOrg] = useState<PublicOrganization | null>(null);
  const [joinMessage, setJoinMessage] = useState('');

  // Fetch public organizations
  const {
    data: organizations,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['publicOrganizations', searchQuery],
    queryFn: async () => {
      const supabase = assertSupabase();

      let query = supabase
        .from('organizations')
        .select(`
          id,
          name,
          description,
          logo_url,
          address,
          city,
          province,
          email,
          phone,
          website,
          organization_type,
          is_verified
        `)
        .eq('is_public', true)
        .eq('accepting_registrations', true)
        .eq('is_active', true);

      if (searchQuery.trim()) {
        query = query.or(
          `name.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%,city.ilike.%${searchQuery}%`
        );
      }

      const { data, error: fetchError } = await query
        .order('name')
        .limit(50);

      if (fetchError) throw fetchError;
      return (data || []) as PublicOrganization[];
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Check if user already has a pending request for an org
  const { data: pendingRequests } = useQuery({
    queryKey: ['userPendingRequests', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error: fetchError } = await assertSupabase()
        .from('join_requests')
        .select('organization_id')
        .eq('requester_id', user.id)
        .in('status', ['pending']);

      if (fetchError) {
        logger.warn('Failed to fetch pending requests', { error: fetchError });
        return [];
      }
      return data?.map((r) => r.organization_id) || [];
    },
    enabled: !!user?.id,
  });

  // Submit join request mutation
  const joinMutation = useMutation({
    mutationFn: async ({
      organizationId,
      message,
    }: {
      organizationId: string;
      message: string;
    }) => {
      if (!user?.id) throw new Error('Must be logged in');

      const result = await InviteService.createJoinRequest({
        type: 'member_join',
        organizationId,
        message: message || undefined,
        requestedRole: 'member',
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to submit request');
      }

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userPendingRequests'] });
      setSelectedOrg(null);
      setJoinMessage('');
      showAlert({
        title: 'Request Submitted',
        message: 'Your request has been sent to the organization. You will be notified when they respond.',
        type: 'success',
      });
    },
    onError: (err: Error) => {
      showAlert({ title: 'Failed', message: err.message, type: 'error' });
    },
  });

  const handleJoinRequest = useCallback(
    (org: PublicOrganization) => {
      if (!user?.id) {
        showAlert({
          title: 'Sign In Required',
          message: 'Please sign in to join an organization.',
          type: 'warning',
          buttons: [
            { text: 'Cancel' },
            { text: 'Sign In', onPress: () => router.push('/login') },
          ]
        });
        return;
      }

      // Check if already has pending request
      if (pendingRequests?.includes(org.id)) {
        showAlert({ title: 'Already Requested', message: 'You have a pending request for this organization.', type: 'info' });
        return;
      }

      // Check if already a member
      if (profile?.organization_id === org.id) {
        showAlert({ title: 'Already a Member', message: 'You are already a member of this organization.', type: 'info' });
        return;
      }

      setSelectedOrg(org);
    },
    [user?.id, pendingRequests, profile?.organization_id]
  );

  const submitJoinRequest = useCallback(() => {
    if (!selectedOrg) return;
    joinMutation.mutate({ organizationId: selectedOrg.id, message: joinMessage });
  }, [selectedOrg, joinMessage, joinMutation]);

  const renderOrganizationCard = useCallback(
    ({ item }: { item: PublicOrganization }) => {
      const hasPendingRequest = pendingRequests?.includes(item.id);
      const isMember = profile?.organization_id === item.id;

      return (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            {item.logo_url ? (
              <Image source={{ uri: item.logo_url }} style={styles.logo} />
            ) : (
              <View style={styles.logoPlaceholder}>
                <Ionicons name="business" size={32} color={theme?.textSecondary || '#888'} />
              </View>
            )}
            <View style={styles.headerInfo}>
              <View style={styles.nameRow}>
                <Text style={styles.orgName} numberOfLines={1}>
                  {item.name}
                </Text>
                {item.is_verified && (
                  <Ionicons
                    name="checkmark-circle"
                    size={16}
                    color={theme?.success || '#10b981'}
                    style={styles.verifiedIcon}
                  />
                )}
              </View>
              {item.organization_type && (
                <Text style={styles.orgType}>{item.organization_type}</Text>
              )}
            </View>
          </View>

          {item.description && (
            <Text style={styles.description} numberOfLines={2}>
              {item.description}
            </Text>
          )}

          <View style={styles.infoRow}>
            {item.city && (
              <View style={styles.infoItem}>
                <Ionicons name="location-outline" size={14} color={theme?.textSecondary} />
                <Text style={styles.infoText}>
                  {item.city}
                  {item.province ? `, ${item.province}` : ''}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.cardFooter}>
            {isMember ? (
              <View style={styles.statusBadge}>
                <Ionicons name="checkmark-circle" size={16} color={theme?.success || '#10b981'} />
                <Text style={[styles.statusText, { color: theme?.success || '#10b981' }]}>
                  Member
                </Text>
              </View>
            ) : hasPendingRequest ? (
              <View style={styles.statusBadge}>
                <Ionicons name="time" size={16} color={theme?.warning || '#f59e0b'} />
                <Text style={[styles.statusText, { color: theme?.warning || '#f59e0b' }]}>
                  Pending
                </Text>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.joinButton}
                onPress={() => handleJoinRequest(item)}
              >
                <Text style={styles.joinButtonText}>Request to Join</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      );
    },
    [styles, theme, pendingRequests, profile?.organization_id, handleJoinRequest]
  );

  const renderEmpty = () => {
    if (isLoading) return null;

    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="business-outline" size={64} color={theme?.textSecondary || '#888'} />
        <Text style={styles.emptyTitle}>
          {searchQuery ? 'No organizations found' : 'No organizations available'}
        </Text>
        <Text style={styles.emptySubtitle}>
          {searchQuery
            ? 'Try a different search term'
            : 'Check back later for organizations accepting members'}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Discover Organizations',
          headerStyle: { backgroundColor: theme?.card || '#1a1a2e' },
          headerTintColor: theme?.text || '#fff',
        }}
      />

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={theme?.textSecondary || '#888'} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search organizations..."
          placeholderTextColor={theme?.textSecondary || '#888'}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color={theme?.textSecondary || '#888'} />
          </TouchableOpacity>
        )}
      </View>

      {/* Error State */}
      {isError && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>
            {(error as Error)?.message || 'Failed to load organizations'}
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Organizations List */}
      <FlashList
        data={organizations}
        keyExtractor={(item) => item.id}
        renderItem={renderOrganizationCard}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={refetch}
            tintColor={theme?.primary || '#00f5ff'}
          />
        }
        showsVerticalScrollIndicator={false}
        estimatedItemSize={200}
      />

      {/* Join Request Modal */}
      {selectedOrg && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Join {selectedOrg.name}</Text>
            <Text style={styles.modalSubtitle}>
              Add an optional message to introduce yourself:
            </Text>
            <TextInput
              style={styles.messageInput}
              placeholder="Hi, I'd like to join your organization..."
              placeholderTextColor={theme?.textSecondary || '#888'}
              value={joinMessage}
              onChangeText={setJoinMessage}
              multiline
              numberOfLines={4}
              maxLength={500}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setSelectedOrg(null);
                  setJoinMessage('');
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitButton, joinMutation.isPending && styles.buttonDisabled]}
                onPress={submitJoinRequest}
                disabled={joinMutation.isPending}
              >
                {joinMutation.isPending ? (
                  <EduDashSpinner size="small" color="#fff" />
                ) : (
                  <Text style={styles.submitButtonText}>Send Request</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
      <AlertModal {...alertProps} />
    </View>
  );
}

function createStyles(theme: any) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme?.background || '#0d0d1a',
    },
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme?.card || '#1a1a2e',
      marginHorizontal: 16,
      marginTop: 12,
      marginBottom: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme?.border || '#2a2a4a',
    },
    searchInput: {
      flex: 1,
      marginLeft: 8,
      fontSize: 16,
      color: theme?.text || '#fff',
    },
    listContent: {
      paddingHorizontal: 16,
      paddingBottom: 24,
    },
    card: {
      backgroundColor: theme?.card || '#1a1a2e',
      borderRadius: 16,
      padding: 16,
      marginVertical: 8,
      borderWidth: 1,
      borderColor: theme?.border || '#2a2a4a',
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
    },
    logo: {
      width: 56,
      height: 56,
      borderRadius: 12,
      backgroundColor: theme?.border || '#2a2a4a',
    },
    logoPlaceholder: {
      width: 56,
      height: 56,
      borderRadius: 12,
      backgroundColor: theme?.border || '#2a2a4a',
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerInfo: {
      flex: 1,
      marginLeft: 12,
    },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    orgName: {
      fontSize: 18,
      fontWeight: '700',
      color: theme?.text || '#fff',
      flex: 1,
    },
    verifiedIcon: {
      marginLeft: 6,
    },
    orgType: {
      fontSize: 13,
      color: theme?.textSecondary || '#888',
      marginTop: 2,
      textTransform: 'capitalize',
    },
    description: {
      fontSize: 14,
      color: theme?.textSecondary || '#aaa',
      lineHeight: 20,
      marginBottom: 12,
    },
    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
    },
    infoItem: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    infoText: {
      fontSize: 13,
      color: theme?.textSecondary || '#888',
      marginLeft: 4,
    },
    cardFooter: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      borderTopWidth: 1,
      borderTopColor: theme?.border || '#2a2a4a',
      paddingTop: 12,
    },
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    statusText: {
      fontSize: 14,
      fontWeight: '600',
      marginLeft: 6,
    },
    joinButton: {
      backgroundColor: theme?.primary || '#00f5ff',
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 8,
    },
    joinButtonText: {
      color: '#000',
      fontSize: 14,
      fontWeight: '700',
    },
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 64,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: theme?.text || '#fff',
      marginTop: 16,
    },
    emptySubtitle: {
      fontSize: 14,
      color: theme?.textSecondary || '#888',
      marginTop: 8,
      textAlign: 'center',
    },
    errorContainer: {
      alignItems: 'center',
      padding: 20,
    },
    errorText: {
      fontSize: 14,
      color: theme?.error || '#ef4444',
      textAlign: 'center',
    },
    retryButton: {
      marginTop: 12,
      paddingHorizontal: 20,
      paddingVertical: 8,
      backgroundColor: theme?.primary || '#00f5ff',
      borderRadius: 8,
    },
    retryText: {
      color: '#000',
      fontWeight: '600',
    },
    // Modal styles
    modalOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.7)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    modalContent: {
      backgroundColor: theme?.card || '#1a1a2e',
      borderRadius: 16,
      padding: 24,
      width: '100%',
      maxWidth: 400,
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: theme?.text || '#fff',
      marginBottom: 8,
    },
    modalSubtitle: {
      fontSize: 14,
      color: theme?.textSecondary || '#888',
      marginBottom: 16,
    },
    messageInput: {
      backgroundColor: theme?.background || '#0d0d1a',
      borderRadius: 12,
      padding: 12,
      fontSize: 14,
      color: theme?.text || '#fff',
      height: 100,
      textAlignVertical: 'top',
      borderWidth: 1,
      borderColor: theme?.border || '#2a2a4a',
    },
    modalButtons: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      marginTop: 20,
      gap: 12,
    },
    cancelButton: {
      paddingHorizontal: 20,
      paddingVertical: 12,
    },
    cancelButtonText: {
      color: theme?.textSecondary || '#888',
      fontSize: 14,
      fontWeight: '600',
    },
    submitButton: {
      backgroundColor: theme?.primary || '#00f5ff',
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 8,
    },
    submitButtonText: {
      color: '#000',
      fontSize: 14,
      fontWeight: '700',
    },
    buttonDisabled: {
      opacity: 0.6,
    },
  });
}
