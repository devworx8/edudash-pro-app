/**
 * Membership Pending Screen
 * Shown to users whose membership is awaiting approval from the President
 * 
 * This screen is displayed when:
 * 1. User registered via invite code
 * 2. User registered via website
 * 3. Membership status is 'pending' or 'pending_verification'
 */
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { signOutAndRedirect } from '@/lib/authActions';
import { useTheme } from '@/contexts/ThemeContext';
import { assertSupabase } from '@/lib/supabase';
import { DashboardWallpaperBackground } from '@/components/membership/dashboard';
import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { AlertModal, useAlertModal } from '@/components/ui/AlertModal';
import { createStyles, formatDate, getMemberTypeLabel } from '@/lib/screen-styles/membership/membership-pending.styles';
import type { MembershipStatus } from '@/lib/screen-styles/membership/membership-pending.styles';
import { logger } from '@/lib/logger';
export default function MembershipPendingScreen() {
  const { user, profile } = useAuth();
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const { showAlert, alertProps } = useAlertModal();
  const [membershipStatus, setMembershipStatus] = useState<MembershipStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchMembershipStatus = useCallback(async () => {
    if (!user?.id) return;
    
    try {
      const supabase = assertSupabase();
      
      // Fetch organization membership with organization and region details
      const { data: membership, error } = await supabase
        .from('organization_members')
        .select(`
          membership_status,
          member_type,
          created_at,
          organization:organizations(name),
          region:organization_regions(name)
        `)
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        logger.error('[MembershipPending] Error fetching membership:', error);
        return;
      }

      if (membership) {
        setMembershipStatus({
          status: membership.membership_status as MembershipStatus['status'],
          memberType: membership.member_type,
          organizationName: (membership.organization as any)?.name || 'Organization',
          regionName: (membership.region as any)?.name,
          requestedAt: membership.created_at,
        });

        // If status is now 'active', redirect to dashboard
        if (membership.membership_status === 'active') {
          showAlert({
            title: 'Membership Approved! 🎉',
            message: 'Your membership has been approved. Welcome aboard!',
            buttons: [{ text: 'Continue', onPress: () => router.replace('/profiles-gate') }],
          });
        }
      }
    } catch (error) {
      logger.error('[MembershipPending] Error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchMembershipStatus();
  }, [fetchMembershipStatus]);

  // Set up real-time subscription for status changes
  useEffect(() => {
    if (!user?.id) return;

    const supabase = assertSupabase();
    const channel = supabase
      .channel('membership-status-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'organization_members',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          logger.debug('[MembershipPending] Membership updated:', payload);
          const newStatus = payload.new?.membership_status;
          
          if (newStatus === 'active') {
            showAlert({
              title: 'Membership Approved! 🎉',
              message: 'Your membership has been approved by the President. Welcome aboard!',
              buttons: [{ text: 'Continue', onPress: () => router.replace('/profiles-gate') }],
            });
          } else if (newStatus === 'revoked' || newStatus === 'suspended') {
            showAlert({
              title: 'Membership Update',
              message: 'Your membership request was not approved. Please contact the organization for more information.',
              buttons: [{ text: 'OK' }],
            });
          }
          
          fetchMembershipStatus();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, fetchMembershipStatus]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchMembershipStatus();
  }, [fetchMembershipStatus]);

  const handleSignOut = async () => {
    showAlert({
      title: 'Sign Out',
      message: 'Are you sure you want to sign out? You can sign back in anytime to check your membership status.',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Sign Out', 
          style: 'destructive',
          onPress: async () => {
            await signOutAndRedirect({ redirectTo: '/(auth)/sign-in' });
          }
        },
      ],
    });
  };

  const handleContactSupport = () => {
    showAlert({
      title: 'Contact Support',
      message: 'For assistance with your membership application, please contact:\n\n• Email: support@soilofafrica.org\n• WhatsApp: +27 XX XXX XXXX',
      buttons: [{ text: 'OK' }],
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.loadingContainer}>
          <EduDashSpinner size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
            Checking membership status...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      
      <DashboardWallpaperBackground>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[theme.primary]}
              tintColor={theme.primary}
            />
          }
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={[styles.iconContainer, { backgroundColor: `${theme.warning}20` }]}>
              <Ionicons name="hourglass-outline" size={64} color={theme.warning || '#F59E0B'} />
            </View>
            <Text style={[styles.title, { color: theme.text }]}>
              Membership Pending
            </Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              Your membership application is awaiting approval from the Youth President
            </Text>
          </View>

          {/* Status Card */}
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.cardHeader}>
              <Ionicons name="document-text-outline" size={24} color={theme.primary} />
              <Text style={[styles.cardTitle, { color: theme.text }]}>Application Details</Text>
            </View>
            
            <View style={styles.cardContent}>
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Organization</Text>
                <Text style={[styles.detailValue, { color: theme.text }]}>
                  {membershipStatus?.organizationName || 'EduPro'}
                </Text>
              </View>
              
              {membershipStatus?.regionName && (
                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Region</Text>
                  <Text style={[styles.detailValue, { color: theme.text }]}>
                    {membershipStatus.regionName}
                  </Text>
                </View>
              )}
              
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Role Requested</Text>
                <Text style={[styles.detailValue, { color: theme.text }]}>
                  {getMemberTypeLabel(membershipStatus?.memberType || 'member')}
                </Text>
              </View>
              
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Applied On</Text>
                <Text style={[styles.detailValue, { color: theme.text }]}>
                  {membershipStatus?.requestedAt ? formatDate(membershipStatus.requestedAt) : 'N/A'}
                </Text>
              </View>
              
              <View style={[styles.statusBadge, { backgroundColor: `${theme.warning}20` }]}>
                <Ionicons name="time-outline" size={16} color={theme.warning || '#F59E0B'} />
                <Text style={[styles.statusText, { color: theme.warning || '#F59E0B' }]}>
                  Awaiting Approval
                </Text>
              </View>
            </View>
          </View>

          {/* Info Card */}
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.cardHeader}>
              <Ionicons name="information-circle-outline" size={24} color={theme.primary} />
              <Text style={[styles.cardTitle, { color: theme.text }]}>What happens next?</Text>
            </View>
            
            <View style={styles.cardContent}>
              <View style={styles.infoStep}>
                <View style={[styles.stepNumber, { backgroundColor: theme.primary }]}>
                  <Text style={styles.stepNumberText}>1</Text>
                </View>
                <Text style={[styles.stepText, { color: theme.text }]}>
                  The Youth President will review your application
                </Text>
              </View>
              
              <View style={styles.infoStep}>
                <View style={[styles.stepNumber, { backgroundColor: theme.primary }]}>
                  <Text style={styles.stepNumberText}>2</Text>
                </View>
                <Text style={[styles.stepText, { color: theme.text }]}>
                  You'll receive a notification when approved
                </Text>
              </View>
              
              <View style={styles.infoStep}>
                <View style={[styles.stepNumber, { backgroundColor: theme.primary }]}>
                  <Text style={styles.stepNumberText}>3</Text>
                </View>
                <Text style={[styles.stepText, { color: theme.text }]}>
                  Once approved, you can access all member features
                </Text>
              </View>
            </View>
          </View>

          {/* Refresh Hint */}
          <Text style={[styles.refreshHint, { color: theme.textSecondary }]}>
            Pull down to refresh your status
          </Text>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: theme.primary }]}
              onPress={handleContactSupport}
            >
              <Ionicons name="help-circle-outline" size={20} color="#fff" />
              <Text style={styles.actionButtonText}>Contact Support</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.actionButton, styles.secondaryButton, { borderColor: theme.border }]}
              onPress={handleSignOut}
            >
              <Ionicons name="log-out-outline" size={20} color={theme.text} />
              <Text style={[styles.actionButtonText, { color: theme.text }]}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </DashboardWallpaperBackground>

      <AlertModal {...alertProps} />
    </SafeAreaView>
  );
}
