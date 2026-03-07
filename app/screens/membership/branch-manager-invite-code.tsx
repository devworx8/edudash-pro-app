/**
 * Branch Manager Invite Code Generator
 * Generate and share invite codes for recruiting members to a branch
 * Branch Managers can invite: Learners, Youth Members, Facilitators, Mentors
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Switch, Share, Linking } from 'react-native';
import { Stack, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { assertSupabase } from '@/lib/supabase';
import { buildSoaWebUrl } from '@/lib/config/urls';
import { DashboardWallpaperBackground } from '@/components/membership/dashboard';
import { AlertModal, useAlertModal } from '@/components/ui/AlertModal';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { logger } from '@/lib/logger';
let Clipboard: any = null;
try { Clipboard = require('expo-clipboard'); } catch (e) { /* optional */ }

interface BranchInviteCode {
  id: string;
  code: string;
  organization_id: string;
  region_id: string;
  created_by: string;
  max_uses: number | null;
  current_uses: number;
  is_active: boolean;
  expires_at: string | null;
  description: string;
  allowed_member_types: string[];
  created_at: string;
}

// Member types that Branch Managers can invite
const BRANCH_MEMBER_TYPES = [
  { id: 'learner', label: 'Learner', description: 'Standard learner member', icon: 'school-outline' },
  { id: 'youth_member', label: 'Youth Member', description: 'Youth wing member', icon: 'people-outline' },
  { id: 'mentor', label: 'Mentor', description: 'Experienced member who mentors others', icon: 'heart-outline' },
  { id: 'facilitator', label: 'Facilitator', description: 'Facilitates training programs', icon: 'easel-outline' },
] as const;

export default function BranchManagerInviteCodeScreen() {
  const { user, profile } = useAuth();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { showAlert, alertProps } = useAlertModal();

  const organizationId = profile?.organization_id as string | null;

  const [codes, setCodes] = useState<BranchInviteCode[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [regionId, setRegionId] = useState<string | null>(null);
  const [regionName, setRegionName] = useState<string>('');
  const [regionCode, setRegionCode] = useState<string>('');
  const [branchName, setBranchName] = useState<string>('');

  // New code form
  const [unlimited, setUnlimited] = useState(true);
  const [maxUses, setMaxUses] = useState('50');
  const [expiryDays, setExpiryDays] = useState('30');
  const [description, setDescription] = useState('Branch Invite');
  const [selectedTypes, setSelectedTypes] = useState<string[]>(['learner', 'youth_member']);

  // Load member info and region
  useEffect(() => {
    const loadMemberInfo = async () => {
      if (!user?.id || !organizationId) return;
      
      try {
        const supabase = assertSupabase();
        const { data: memberData, error } = await supabase
          .from('organization_members')
          .select(`
            id,
            member_type,
            region_id,
            organization_regions (
              id,
              name,
              code,
              province_code
            )
          `)
          .eq('user_id', user.id)
          .eq('organization_id', organizationId)
          .single();

        if (error) throw error;
        
        // Verify user is a branch manager
        if (memberData?.member_type !== 'branch_manager') {
          showAlert({ title: 'Access Denied', message: 'Only branch managers can create invite codes from this screen.' });
          router.back();
          return;
        }
        
        if (memberData?.region_id) {
          setRegionId(memberData.region_id);
          const region = memberData.organization_regions as any;
          setRegionName(region?.name || 'Unknown Region');
          setRegionCode(region?.province_code || region?.code || 'BR');
          setBranchName(`${region?.name || 'Branch'} Branch`);
        }
      } catch (e: any) {
        logger.error('[BranchInviteCode] Error loading member info:', e);
      }
    };

    loadMemberInfo();
  }, [user?.id, organizationId]);

  const loadCodes = useCallback(async () => {
    if (!organizationId || !user?.id) return;
    try {
      const supabase = assertSupabase();
      
      // Load codes created by this branch manager
      const { data, error } = await supabase
        .from('region_invite_codes')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('created_by', user.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setCodes(data || []);
    } catch (e: any) {
      logger.error('[BranchInviteCode] Failed to load codes:', e);
    } finally {
      setInitialLoading(false);
    }
  }, [organizationId, user?.id]);

  useEffect(() => { 
    if (user?.id) loadCodes(); 
    else setInitialLoading(false);
  }, [loadCodes, user?.id]);

  const generateInviteCode = (): string => {
    // Format: SOA-BR-{REGION}-{RANDOM}
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let random = '';
    for (let i = 0; i < 4; i++) {
      random += chars[Math.floor(Math.random() * chars.length)];
    }
    return `SOA-BR-${regionCode}-${random}`;
  };

  const toggleMemberType = (typeId: string) => {
    setSelectedTypes(prev => {
      if (prev.includes(typeId)) {
        // Don't allow removing the last type
        if (prev.length === 1) return prev;
        return prev.filter(t => t !== typeId);
      }
      return [...prev, typeId];
    });
  };

  const onGenerate = async () => {
    if (!organizationId || !user?.id) {
      showAlert({ title: 'Missing context', message: 'You need to be signed in to create invites.' });
      return;
    }
    
    if (selectedTypes.length === 0) {
      showAlert({ title: 'Select Types', message: 'Please select at least one member type for the invite code.' });
      return;
    }
    
    setLoading(true);
    try {
      const supabase = assertSupabase();
      const days = Number(expiryDays);
      const expiresAt = isFinite(days) && days > 0
        ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
        : null;

      const inviteCode = generateInviteCode();
      
      const { data, error } = await supabase
        .from('region_invite_codes')
        .insert({
          organization_id: organizationId,
          region_id: regionId,
          code: inviteCode,
          created_by: user.id,
          max_uses: unlimited ? null : Number(maxUses),
          current_uses: 0,
          expires_at: expiresAt,
          is_active: true,
          allowed_member_types: selectedTypes,
          default_tier: 'standard',
          description: `${branchName}: ${description}`,
        })
        .select()
        .single();

      if (error) throw error;

      await loadCodes();
      showAlert({ title: 'Invite Created', message: `Code: ${inviteCode}\n\nShare this code with potential members in your branch!` });
    } catch (e: any) {
      logger.error('[BranchInviteCode] Error creating invite:', e);
      showAlert({ title: 'Error', message: e?.message || 'Failed to create invite' });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (value: string) => {
    try {
      if (Clipboard?.setStringAsync) {
        await Clipboard.setStringAsync(value);
        showAlert({ title: 'Copied', message: 'Invite code copied to clipboard' });
      } else {
        showAlert({ title: 'Copy failed', message: 'Clipboard not available' });
      }
    } catch {
      showAlert({ title: 'Copy failed', message: 'Unable to copy' });
    }
  };

  const buildShareMessage = (code: string) => {
    const shareUrl = buildSoaWebUrl(`/invite/member?code=${encodeURIComponent(code)}`);
    return `🌱 Join Soil of Africa - ${branchName}!\n\nUse invite code: ${code}\n\nDownload the app and enter this code to join:\n${shareUrl}`;
  };

  const shareInvite = async (item: BranchInviteCode) => {
    try {
      const message = buildShareMessage(item.code);
      await Share.share({ message });
    } catch (e: any) {
      showAlert({ title: 'Share failed', message: e?.message || 'Unable to open share dialog' });
    }
  };

  const shareWhatsApp = async (item: BranchInviteCode) => {
    try {
      const message = encodeURIComponent(buildShareMessage(item.code));
      const url = `whatsapp://send?text=${message}`;
      await Linking.openURL(url);
    } catch (e: any) {
      showAlert({ title: 'WhatsApp Error', message: 'Unable to open WhatsApp. Please try Share instead.' });
    }
  };

  const toggleActive = async (item: BranchInviteCode) => {
    try {
      setLoading(true);
      const supabase = assertSupabase();
      
      const { error } = await supabase
        .from('region_invite_codes')
        .update({ is_active: !item.is_active })
        .eq('id', item.id);
      
      if (error) throw error;
      await loadCodes();
    } catch (e: any) {
      showAlert({ title: 'Error', message: e?.message || 'Failed to update' });
    } finally {
      setLoading(false);
    }
  };

  const latest = codes.find(c => c.is_active);

  if (initialLoading) {
    return (
      <DashboardWallpaperBackground>
        <SafeAreaView style={styles.container}>
          <View style={styles.loadingContainer}>
            <EduDashSpinner size="large" color={theme.primary} />
            <Text style={[styles.text, { marginTop: 12 }]}>Loading...</Text>
          </View>
        </SafeAreaView>
      </DashboardWallpaperBackground>
    );
  }

  return (
    <DashboardWallpaperBackground>
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <Stack.Screen options={{ headerShown: false }} />
        
        {/* Header */}
        <View style={[styles.header, { backgroundColor: theme.card }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={theme.text} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={[styles.headerTitle, { color: theme.text }]}>Invite Members</Text>
            <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
              {branchName || 'Branch Manager'}
            </Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {/* Info Banner */}
          <View style={[styles.infoBanner, { backgroundColor: theme.primary + '15' }]}>
            <Ionicons name="information-circle" size={20} color={theme.primary} />
            <Text style={[styles.infoBannerText, { color: theme.text }]}>
              As a Branch Manager, you can invite Learners, Youth Members, Mentors, and Facilitators to your branch.
            </Text>
          </View>

          {/* Quick Share Section */}
          {latest && (
            <View style={[styles.quickShareCard, { backgroundColor: theme.card }]}>
              <View style={styles.quickShareHeader}>
                <Ionicons name="flash" size={20} color="#10B981" />
                <Text style={[styles.quickShareTitle, { color: theme.text }]}>Active Invite Code</Text>
              </View>
              <Text style={[styles.codeDisplay, { color: theme.primary }]}>{latest.code}</Text>
              <View style={styles.quickShareActions}>
                <TouchableOpacity 
                  style={[styles.quickShareButton, { backgroundColor: '#25D366' }]}
                  onPress={() => shareWhatsApp(latest)}
                >
                  <Ionicons name="logo-whatsapp" size={20} color="#fff" />
                  <Text style={styles.quickShareButtonText}>WhatsApp</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.quickShareButton, { backgroundColor: theme.primary }]}
                  onPress={() => shareInvite(latest)}
                >
                  <Ionicons name="share-outline" size={20} color="#fff" />
                  <Text style={styles.quickShareButtonText}>Share</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.quickShareButton, { backgroundColor: '#6B7280' }]}
                  onPress={() => copyToClipboard(latest.code)}
                >
                  <Ionicons name="copy-outline" size={20} color="#fff" />
                  <Text style={styles.quickShareButtonText}>Copy</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Generate New Code */}
          <View style={[styles.generateCard, { backgroundColor: theme.card }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Generate New Code</Text>
            
            {/* Description */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>Description</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.surface, color: theme.text, borderColor: theme.border }]}
                value={description}
                onChangeText={setDescription}
                placeholder="e.g., New Intake January 2026"
                placeholderTextColor={theme.textSecondary}
              />
            </View>

            {/* Member Types */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>Member Types Allowed</Text>
              <View style={styles.typesGrid}>
                {BRANCH_MEMBER_TYPES.map(type => (
                  <TouchableOpacity
                    key={type.id}
                    style={[
                      styles.typeChip,
                      { 
                        backgroundColor: selectedTypes.includes(type.id) 
                          ? theme.primary + '20' 
                          : theme.surface,
                        borderColor: selectedTypes.includes(type.id) 
                          ? theme.primary 
                          : theme.border,
                      }
                    ]}
                    onPress={() => toggleMemberType(type.id)}
                  >
                    <Ionicons 
                      name={selectedTypes.includes(type.id) ? "checkmark-circle" : type.icon as any} 
                      size={16} 
                      color={selectedTypes.includes(type.id) ? theme.primary : theme.textSecondary} 
                    />
                    <Text style={[
                      styles.typeChipText, 
                      { color: selectedTypes.includes(type.id) ? theme.primary : theme.text }
                    ]}>
                      {type.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Usage Limit */}
            <View style={styles.inputGroup}>
              <View style={styles.switchRow}>
                <Text style={[styles.label, { color: theme.textSecondary }]}>Unlimited Uses</Text>
                <Switch 
                  value={unlimited} 
                  onValueChange={setUnlimited}
                  trackColor={{ false: theme.border, true: theme.primary + '80' }}
                  thumbColor={unlimited ? theme.primary : '#f4f3f4'}
                />
              </View>
              {!unlimited && (
                <TextInput
                  style={[styles.input, { backgroundColor: theme.surface, color: theme.text, borderColor: theme.border }]}
                  value={maxUses}
                  onChangeText={setMaxUses}
                  keyboardType="numeric"
                  placeholder="Max uses"
                  placeholderTextColor={theme.textSecondary}
                />
              )}
            </View>

            {/* Expiry */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>Expires in (days)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.surface, color: theme.text, borderColor: theme.border }]}
                value={expiryDays}
                onChangeText={setExpiryDays}
                keyboardType="numeric"
                placeholder="30"
                placeholderTextColor={theme.textSecondary}
              />
              <Text style={[styles.hint, { color: theme.textSecondary }]}>
                Leave empty for no expiration
              </Text>
            </View>

            {/* Generate Button */}
            <TouchableOpacity
              style={[styles.generateButton, { backgroundColor: theme.primary }]}
              onPress={onGenerate}
              disabled={loading}
            >
              {loading ? (
                <EduDashSpinner color="#fff" />
              ) : (
                <>
                  <Ionicons name="add-circle" size={20} color="#fff" />
                  <Text style={styles.generateButtonText}>Generate Invite Code</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Existing Codes */}
          {codes.length > 0 && (
            <View style={[styles.codesCard, { backgroundColor: theme.card }]}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Your Invite Codes</Text>
              
              {codes.map(code => (
                <View 
                  key={code.id} 
                  style={[
                    styles.codeItem, 
                    { 
                      backgroundColor: theme.surface,
                      opacity: code.is_active ? 1 : 0.6 
                    }
                  ]}
                >
                  <View style={styles.codeItemHeader}>
                    <Text style={[styles.codeItemCode, { color: theme.primary }]}>{code.code}</Text>
                    <TouchableOpacity onPress={() => toggleActive(code)}>
                      <View style={[
                        styles.statusBadge,
                        { backgroundColor: code.is_active ? '#10B981' + '20' : '#EF4444' + '20' }
                      ]}>
                        <View style={[
                          styles.statusDot,
                          { backgroundColor: code.is_active ? '#10B981' : '#EF4444' }
                        ]} />
                        <Text style={[
                          styles.statusText,
                          { color: code.is_active ? '#10B981' : '#EF4444' }
                        ]}>
                          {code.is_active ? 'Active' : 'Inactive'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                  
                  <Text style={[styles.codeItemDesc, { color: theme.textSecondary }]}>
                    {code.description || 'No description'}
                  </Text>
                  
                  <View style={styles.codeItemMeta}>
                    <Text style={[styles.codeItemMetaText, { color: theme.textSecondary }]}>
                      Uses: {code.current_uses}{code.max_uses ? `/${code.max_uses}` : ''}
                    </Text>
                    {code.expires_at && (
                      <Text style={[styles.codeItemMetaText, { color: theme.textSecondary }]}>
                        Expires: {new Date(code.expires_at).toLocaleDateString()}
                      </Text>
                    )}
                  </View>

                  <View style={styles.codeItemTypes}>
                    {code.allowed_member_types.map(type => (
                      <View key={type} style={[styles.typeTag, { backgroundColor: theme.primary + '15' }]}>
                        <Text style={[styles.typeTagText, { color: theme.primary }]}>
                          {type.replace('_', ' ')}
                        </Text>
                      </View>
                    ))}
                  </View>

                  {code.is_active && (
                    <View style={styles.codeItemActions}>
                      <TouchableOpacity 
                        style={[styles.codeItemAction, { backgroundColor: '#25D366' }]}
                        onPress={() => shareWhatsApp(code)}
                      >
                        <Ionicons name="logo-whatsapp" size={16} color="#fff" />
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={[styles.codeItemAction, { backgroundColor: theme.primary }]}
                        onPress={() => shareInvite(code)}
                      >
                        <Ionicons name="share-outline" size={16} color="#fff" />
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={[styles.codeItemAction, { backgroundColor: '#6B7280' }]}
                        onPress={() => copyToClipboard(code.code)}
                      >
                        <Ionicons name="copy-outline" size={16} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}

          {/* Help Section */}
          <View style={[styles.helpCard, { backgroundColor: theme.card }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Invite Hierarchy</Text>
            <View style={styles.hierarchyItem}>
              <View style={[styles.hierarchyDot, { backgroundColor: '#10B981' }]} />
              <Text style={[styles.hierarchyText, { color: theme.text }]}>
                <Text style={{ fontWeight: '700' }}>You (Branch Manager)</Text> can invite:
              </Text>
            </View>
            <View style={styles.hierarchyList}>
              <Text style={[styles.hierarchyListItem, { color: theme.textSecondary }]}>
                • Learners - New members to learn and grow
              </Text>
              <Text style={[styles.hierarchyListItem, { color: theme.textSecondary }]}>
                • Youth Members - Young people joining the Youth Wing
              </Text>
              <Text style={[styles.hierarchyListItem, { color: theme.textSecondary }]}>
                • Mentors - Experienced guides for new members
              </Text>
              <Text style={[styles.hierarchyListItem, { color: theme.textSecondary }]}>
                • Facilitators - Workshop and program leaders
              </Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
      <AlertModal {...alertProps} />
    </DashboardWallpaperBackground>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    color: theme.text,
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  infoBanner: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    alignItems: 'flex-start',
    gap: 10,
  },
  infoBannerText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  quickShareCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  quickShareHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  quickShareTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  codeDisplay: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: 16,
  },
  quickShareActions: {
    flexDirection: 'row',
    gap: 8,
  },
  quickShareButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    borderRadius: 10,
    gap: 6,
  },
  quickShareButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  generateCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
  },
  hint: {
    fontSize: 12,
    marginTop: 4,
  },
  typesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
  },
  typeChipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 12,
    gap: 8,
  },
  generateButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  codesCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  codeItem: {
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  codeItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  codeItemCode: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  codeItemDesc: {
    fontSize: 13,
    marginBottom: 8,
  },
  codeItemMeta: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 8,
  },
  codeItemMetaText: {
    fontSize: 12,
  },
  codeItemTypes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  typeTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  typeTagText: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  codeItemActions: {
    flexDirection: 'row',
    gap: 8,
  },
  codeItemAction: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpCard: {
    borderRadius: 16,
    padding: 16,
  },
  hierarchyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  hierarchyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  hierarchyText: {
    fontSize: 14,
  },
  hierarchyList: {
    marginLeft: 16,
  },
  hierarchyListItem: {
    fontSize: 13,
    lineHeight: 22,
  },
});
