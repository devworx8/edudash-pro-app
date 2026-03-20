/**
 * OrganizationSwitcher - Multi-organization switcher component
 *
 * Allows users to switch between organizations they belong to
 * (including preschools from EduDash and organizations from SOA).
 * Updates the user's active organization and navigates to the appropriate dashboard.
 */
import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { assertSupabase } from '@/lib/supabase';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { toast } from '@/components/ui/ToastProvider';
import type { ParentAlertApi } from '@/components/ui/parentAlert';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
const ACTIVE_ORG_KEY = '@active_organization';

export interface UserOrganization {
  id: string;
  name: string;
  slug?: string;
  logo_url?: string;
  type: 'preschool' | 'organization';
  role?: string;
  member_type?: string;
  isActive?: boolean;
}

export interface OrganizationSwitcherProps {
  /** Whether the modal is visible */
  visible: boolean;
  /** Callback when modal is closed */
  onClose: () => void;
  /** Callback after successful organization switch */
  onOrganizationSwitched?: (org: UserOrganization) => void;
  /** Optional modal alert API for parent/account flows */
  showAlert?: ParentAlertApi;
}

export function OrganizationSwitcher({
  visible,
  onClose,
  onOrganizationSwitched,
  showAlert,
}: OrganizationSwitcherProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { user, profile, refreshProfile } = useAuth();

  const [organizations, setOrganizations] = useState<UserOrganization[]>([]);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState<string | null>(null);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);

  const showOrgAlert = useCallback(
    (title: string, message: string) => {
      if (showAlert) {
        showAlert({ title, message, type: 'error' });
        return;
      }
      toast.error(message, title);
    },
    [showAlert],
  );

  // Load user's organizations
  const loadOrganizations = useCallback(async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      const supabase = assertSupabase();
      const orgs: UserOrganization[] = [];

      // Get active organization from storage
      const storedActiveOrg = await AsyncStorage.getItem(ACTIVE_ORG_KEY);
      const activeOrg = storedActiveOrg
        ? (JSON.parse(storedActiveOrg) as { id?: string; userId?: string })
        : null;
      if (activeOrg?.userId && activeOrg.userId !== user.id) {
        await AsyncStorage.removeItem(ACTIVE_ORG_KEY);
      }
      const safeActiveOrgId = activeOrg?.userId === user.id ? activeOrg?.id : null;
      setActiveOrgId(safeActiveOrgId || profile?.organization_id || profile?.preschool_id);

      // 1. Get preschool from profile (EduDash system)
      if (profile?.preschool_id) {
        const { data: preschool } = await supabase
          .from('preschools')
          .select('id, name, logo_url')
          .eq('id', profile.preschool_id)
          .single();

        if (preschool) {
          orgs.push({
            id: preschool.id,
            name: preschool.name,
            logo_url: preschool.logo_url,
            type: 'preschool',
            role: profile.role || 'member',
          });
        }
      }

      // 2. Get organizations from organization_members (SOA/multi-tenant system)
      const { data: memberships } = await supabase
        .from('organization_members')
        .select(
          `
          id,
          role,
          member_type,
          membership_status,
          organization_id,
          organizations:organization_id (
            id,
            name,
            slug,
            logo_url
          )
        `,
        )
        .eq('user_id', user.id)
        .in('membership_status', ['active', 'pending_verification']);

      if (memberships) {
        const missingOrgIds = new Set<string>();
        for (const membership of memberships) {
          const org = membership.organizations as any;
          if (org?.id) {
            // Don't add duplicate if preschool_id matches organization_id
            if (!orgs.some((o) => o.id === org.id)) {
              orgs.push({
                id: org.id,
                name: org.name,
                slug: org.slug,
                logo_url: org.logo_url,
                type: 'organization',
                role: membership.role,
                member_type: membership.member_type,
              });
            }
          } else if ((membership as any).organization_id) {
            const orgId = (membership as any).organization_id as string;
            if (!orgs.some((o) => o.id === orgId)) {
              missingOrgIds.add(orgId);
            }
          }
        }

        if (missingOrgIds.size > 0) {
          const { data: preschools } = await supabase
            .from('preschools')
            .select('id, name, logo_url')
            .in('id', Array.from(missingOrgIds));

          (preschools || []).forEach((school) => {
            if (!orgs.some((o) => o.id === school.id)) {
              const membership = memberships.find((m: any) => m.organization_id === school.id);
              orgs.push({
                id: school.id,
                name: school.name,
                logo_url: school.logo_url,
                type: 'preschool',
                role: membership?.role,
                member_type: membership?.member_type,
              });
            }
          });
        }
      }

      // Mark active organization
      const finalOrgs = orgs.map((org) => ({
        ...org,
        isActive: org.id === (activeOrg?.id || profile?.organization_id || profile?.preschool_id),
      }));

      // Sort: active first
      finalOrgs.sort((a, b) => {
        if (a.isActive && !b.isActive) return -1;
        if (!a.isActive && b.isActive) return 1;
        return a.name.localeCompare(b.name);
      });

      setOrganizations(finalOrgs);
    } catch (error) {
      console.error('[OrganizationSwitcher] Failed to load organizations:', error);
      setOrganizations([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id, profile?.preschool_id, profile?.organization_id]);

  useEffect(() => {
    if (visible) {
      loadOrganizations();
    }
  }, [visible, loadOrganizations]);

  // Switch to a different organization
  const handleSwitchOrganization = useCallback(
    async (org: UserOrganization) => {
      if (org.isActive) {
        onClose();
        return;
      }

      try {
        setSwitching(org.id);
        const supabase = assertSupabase();

        // Update profile with new organization
        const nextRole = org.role || profile?.role;

        if (org.type === 'preschool') {
          await supabase
            .from('profiles')
            .update({
              preschool_id: org.id,
              // Keep canonical organization_id aligned with preschool_id.
              organization_id: org.id,
              ...(nextRole ? { role: nextRole } : {}),
            })
            .eq('id', user!.id);
        } else {
          await supabase
            .from('profiles')
            .update({
              organization_id: org.id,
              // Keep preschool_id for users who have both
              ...(nextRole ? { role: nextRole } : {}),
            })
            .eq('id', user!.id);
        }

        // Store active organization in AsyncStorage
        await AsyncStorage.setItem(
          ACTIVE_ORG_KEY,
          JSON.stringify({
            id: org.id,
            name: org.name,
            type: org.type,
            userId: user!.id,
          }),
        );

        // Refresh profile to pick up changes
        await refreshProfile?.();

        // Update local state
        setOrganizations((prev) =>
          prev.map((o) => ({
            ...o,
            isActive: o.id === org.id,
          })),
        );
        setActiveOrgId(org.id);

        // Navigate to appropriate dashboard
        router.replace('/(tabs)');

        onOrganizationSwitched?.(org);
        onClose();
      } catch (error) {
        console.error('[OrganizationSwitcher] Failed to switch organization:', error);
        showOrgAlert('Error', 'Failed to switch organization. Please try again.');
      } finally {
        setSwitching(null);
      }
    },
    [user?.id, refreshProfile, onOrganizationSwitched, onClose, showOrgAlert],
  );

  // Render organization item
  const renderOrganization = ({ item }: { item: UserOrganization }) => {
    const isSwitching = switching === item.id;

    return (
      <TouchableOpacity
        style={[
          styles.orgItem,
          { backgroundColor: theme.card, borderColor: theme.border },
          item.isActive && { borderColor: theme.primary, borderWidth: 2 },
        ]}
        onPress={() => handleSwitchOrganization(item)}
        disabled={isSwitching}
        activeOpacity={0.7}
      >
        <View style={styles.orgIconContainer}>
          {item.logo_url ? (
            <Image source={{ uri: item.logo_url }} style={styles.orgLogo} resizeMode="cover" />
          ) : (
            <View style={[styles.orgIconPlaceholder, { backgroundColor: theme.primary + '20' }]}>
              <Ionicons
                name={item.type === 'preschool' ? 'school' : 'business'}
                size={24}
                color={theme.primary}
              />
            </View>
          )}
        </View>

        <View style={styles.orgInfo}>
          <Text style={[styles.orgName, { color: theme.text }]} numberOfLines={1}>
            {item.name}
          </Text>
          <View style={styles.orgMeta}>
            <View
              style={[
                styles.typeBadge,
                {
                  backgroundColor: item.type === 'preschool' ? '#10B981' + '20' : '#6366F1' + '20',
                },
              ]}
            >
              <Text
                style={[
                  styles.typeText,
                  { color: item.type === 'preschool' ? '#10B981' : '#6366F1' },
                ]}
              >
                {item.type === 'preschool' ? 'Preschool' : 'Organization'}
              </Text>
            </View>
            {item.role && (
              <Text style={[styles.roleText, { color: theme.textSecondary }]}>
                {item.member_type || item.role}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.orgAction}>
          {isSwitching ? (
            <EduDashSpinner size="small" color={theme.primary} />
          ) : item.isActive ? (
            <View style={[styles.activeBadge, { backgroundColor: theme.primary }]}>
              <Ionicons name="checkmark" size={14} color="#fff" />
            </View>
          ) : (
            <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
          )}
        </View>
      </TouchableOpacity>
    );
  };

  // Empty state
  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="business-outline" size={48} color={theme.textSecondary} />
      <Text style={[styles.emptyTitle, { color: theme.text }]}>No Organizations</Text>
      <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
        You're not a member of any organizations yet.
      </Text>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
        <View
          style={[
            styles.container,
            {
              backgroundColor: theme.background,
              paddingBottom: insets.bottom + 16,
            },
          ]}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: theme.border }]}>
            <Text style={[styles.title, { color: theme.text }]}>Switch Organization</Text>
            <TouchableOpacity
              style={[styles.closeButton, { backgroundColor: theme.surface }]}
              onPress={onClose}
            >
              <Ionicons name="close" size={20} color={theme.text} />
            </TouchableOpacity>
          </View>

          {/* Content */}
          {loading ? (
            <View style={styles.loadingContainer}>
              <EduDashSpinner size="large" color={theme.primary} />
              <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
                Loading organizations...
              </Text>
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            >
              {organizations.length === 0
                ? renderEmpty()
                : organizations.map((item) => (
                    <React.Fragment key={item.id}>
                      {renderOrganization({ item } as any)}
                    </React.Fragment>
                  ))}
            </ScrollView>
          )}

          {/* Footer info */}
          {organizations.length > 1 && (
            <View style={[styles.footer, { borderTopColor: theme.border }]}>
              <Ionicons name="information-circle-outline" size={16} color={theme.textSecondary} />
              <Text style={[styles.footerText, { color: theme.textSecondary }]}>
                Tap an organization to switch your active workspace
              </Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

// Helper function to get active organization from storage
export async function getActiveOrganization(userId?: string): Promise<UserOrganization | null> {
  try {
    const stored = await AsyncStorage.getItem(ACTIVE_ORG_KEY);
    const parsed = stored ? (JSON.parse(stored) as UserOrganization & { userId?: string }) : null;
    if (parsed?.userId && userId && parsed.userId !== userId) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

// Helper function to set active organization
export async function setActiveOrganization(org: UserOrganization, userId?: string): Promise<void> {
  await AsyncStorage.setItem(
    ACTIVE_ORG_KEY,
    JSON.stringify({
      id: org.id,
      name: org.name,
      type: org.type,
      userId,
    }),
  );
}

export default OrganizationSwitcher;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  container: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    minHeight: 300,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  orgItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  orgIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    overflow: 'hidden',
  },
  orgLogo: {
    width: 48,
    height: 48,
  },
  orgIconPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orgInfo: {
    flex: 1,
    gap: 4,
  },
  orgName: {
    fontSize: 16,
    fontWeight: '600',
  },
  orgMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  typeText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  roleText: {
    fontSize: 12,
  },
  orgAction: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderTopWidth: 1,
  },
  footerText: {
    fontSize: 12,
  },
});
