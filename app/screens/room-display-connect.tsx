import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Share,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { assertSupabase } from '@/lib/supabase';
import { fetchTeacherClassIds } from '@/lib/dashboard/fetchTeacherClassIds';
import EduDashSpinner from '@/components/ui/EduDashSpinner';

type ClassOption = {
  id: string;
  name: string;
};

type DisplayLinkResponse = {
  url: string;
  token: string;
  joinCode?: string;
  expiresIn?: string;
  trustedPairingDays?: number;
};

const WEB_BASE_URL = (
  process.env.EXPO_PUBLIC_APP_WEB_URL ||
  process.env.EXPO_PUBLIC_WEB_URL ||
  'https://edudashpro.org.za'
).replace(/\/+$/, '');

function trimClassId(value: string): string {
  return String(value || '').trim();
}

export default function RoomDisplayConnectScreen() {
  const { theme } = useTheme();
  const { profile, user } = useAuth();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme, insets), [theme, insets]);

  const orgId = profile?.organization_id || (profile as any)?.preschool_id || null;
  const userId = user?.id || null;
  const profileId = (profile as any)?.id || null;
  const isPrincipal = /principal|admin|owner|superadmin/i.test(String((profile as any)?.role || ''));
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [classesLoading, setClassesLoading] = useState(true);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [payload, setPayload] = useState<DisplayLinkResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadClasses = async () => {
      if (!orgId) {
        if (!cancelled) {
          setClasses([]);
          setClassesLoading(false);
        }
        return;
      }

      try {
        setClassesLoading(true);
        if (!isPrincipal && (profileId || userId)) {
          // Teacher: resolve via class_teachers + legacy merge
          const tid = profileId || userId;
          const classIds = await fetchTeacherClassIds(tid!, orgId);
          if (classIds.length === 0) {
            if (!cancelled) setClasses([]);
            return;
          }
          const { data, error: queryError } = await assertSupabase()
            .from('classes')
            .select('id, name')
            .in('id', classIds)
            .eq('preschool_id', orgId)
            .order('name', { ascending: true });
          if (queryError) throw queryError;
          const rows = ((data || []) as Array<{ id?: string; name?: string }>)
            .filter((row) => row.id)
            .map((row) => ({
              id: String(row.id || ''),
              name: String(row.name || 'Class'),
            }));
          if (!cancelled) setClasses(rows);
        } else {
          // Principal: see all classes
          const { data, error: queryError } = await assertSupabase()
            .from('classes')
            .select('id, name')
            .eq('preschool_id', orgId)
            .order('name', { ascending: true });
          if (queryError) throw queryError;
          const rows = ((data || []) as Array<{ id?: string; name?: string }>)
            .filter((row) => row.id)
            .map((row) => ({
              id: String(row.id || ''),
              name: String(row.name || 'Class'),
            }));
          if (!cancelled) setClasses(rows);
        }
      } catch {
        if (!cancelled) {
          setClasses([]);
        }
      } finally {
        if (!cancelled) {
          setClassesLoading(false);
        }
      }
    };

    void loadClasses();
    return () => {
      cancelled = true;
    };
  }, [orgId, isPrincipal, profileId, userId]);

  const copyText = useCallback(async (text: string, success: string) => {
    try {
      await Clipboard.setStringAsync(text);
      setNotice(success);
      setTimeout(() => setNotice(null), 2500);
    } catch {
      setNotice('Could not copy right now.');
      setTimeout(() => setNotice(null), 2500);
    }
  }, []);

  const generateLink = useCallback(async () => {
    if (!user?.id) {
      setError('You must be signed in to generate a TV link.');
      return;
    }
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const {
        data: { session },
      } = await assertSupabase().auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        throw new Error('Session expired. Please sign in again.');
      }

      const classId = trimClassId(selectedClassId);
      const params = new URLSearchParams();
      if (classId) params.set('class', classId);
      const endpoint = `${WEB_BASE_URL}/api/display/link${params.toString() ? `?${params.toString()}` : ''}`;

      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      });

      const json = (await response.json().catch(() => ({}))) as Partial<DisplayLinkResponse> & { error?: string };
      if (!response.ok || !json?.url) {
        throw new Error(json?.error || `Failed to generate link (${response.status})`);
      }

      setPayload({
        url: json.url,
        token: String(json.token || ''),
        joinCode: json.joinCode,
        expiresIn: json.expiresIn,
        trustedPairingDays: json.trustedPairingDays,
      });
      setNotice('TV link generated.');
      setTimeout(() => setNotice(null), 2500);
    } catch (e) {
      setPayload(null);
      setError(e instanceof Error ? e.message : 'Failed to generate display link.');
    } finally {
      setLoading(false);
    }
  }, [selectedClassId, user?.id]);

  const shareLink = useCallback(async () => {
    if (!payload?.url) return;
    const message = payload.joinCode
      ? `EduDash Room Display\nJoin code: ${payload.joinCode}\nLink: ${payload.url}`
      : `EduDash Room Display\nLink: ${payload.url}`;
    await Share.share({ title: 'Room Display Link', message });
  }, [payload]);

  const openTvPortal = useCallback(async () => {
    await Linking.openURL(`${WEB_BASE_URL}/display`);
  }, []);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Stack.Screen options={{ title: 'Connect Room Display' }} />

      <View style={styles.heroCard}>
        <View style={styles.heroTitleRow}>
          <Ionicons name="tv-outline" size={18} color={theme.primary} />
          <Text style={styles.heroTitle}>Connect from mobile</Text>
        </View>
        <Text style={styles.heroText}>
          Generate a TV link and join code directly from the app. On the TV, open the Room Display page and enter the code.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Class scope (optional)</Text>
        <Text style={styles.sectionSubtitle}>
          Choose a class to show class-specific routine and lessons. Leave unselected for whole-school display.
        </Text>
        {classesLoading ? (
          <View style={styles.loadingRow}>
            <EduDashSpinner color={theme.primary} size="small" />
            <Text style={styles.loadingText}>Loading classes...</Text>
          </View>
        ) : (
          <View style={styles.chipsWrap}>
            <TouchableOpacity
              onPress={() => setSelectedClassId('')}
              style={[
                styles.classChip,
                !selectedClassId && styles.classChipActive,
              ]}
            >
              <Text style={[styles.classChipText, !selectedClassId && styles.classChipTextActive]}>All classes</Text>
            </TouchableOpacity>
            {classes.map((item) => {
              const active = selectedClassId === item.id;
              return (
                <TouchableOpacity
                  key={item.id}
                  onPress={() => setSelectedClassId(item.id)}
                  style={[styles.classChip, active && styles.classChipActive]}
                >
                  <Text style={[styles.classChipText, active && styles.classChipTextActive]}>{item.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      <TouchableOpacity style={styles.primaryBtn} onPress={generateLink} disabled={loading}>
        {loading ? (
          <EduDashSpinner color={theme.onPrimary} size="small" />
        ) : (
          <>
            <Ionicons name="link-outline" size={16} color={theme.onPrimary} />
            <Text style={styles.primaryBtnText}>Generate TV link</Text>
          </>
        )}
      </TouchableOpacity>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {notice ? <Text style={styles.noticeText}>{notice}</Text> : null}

      {payload ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Ready for TV</Text>
          <Text style={styles.sectionSubtitle}>
            {payload.trustedPairingDays
              ? `After first code entry, TV stays paired for about ${payload.trustedPairingDays} days.`
              : 'After first code entry, TV stays paired for long-term use.'}
          </Text>

          {payload.joinCode ? (
            <View style={styles.codeCard}>
              <Text style={styles.codeLabel}>Join code</Text>
              <Text style={styles.codeValue}>{payload.joinCode}</Text>
            </View>
          ) : null}

          <View style={styles.actionsColumn}>
            {payload.joinCode ? (
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => copyText(payload.joinCode || '', 'Join code copied')}
              >
                <Ionicons name="copy-outline" size={16} color={theme.text} />
                <Text style={styles.secondaryBtnText}>Copy join code</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => copyText(payload.url, 'TV link copied')}
            >
              <Ionicons name="copy-outline" size={16} color={theme.text} />
              <Text style={styles.secondaryBtnText}>Copy TV link</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={shareLink}>
              <Ionicons name="share-social-outline" size={16} color={theme.text} />
              <Text style={styles.secondaryBtnText}>Share link</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={openTvPortal}>
              <Ionicons name="open-outline" size={16} color={theme.text} />
              <Text style={styles.secondaryBtnText}>Open TV portal</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.linkText}>{payload.url}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const createStyles = (theme: any, insets: { top: number; bottom: number }) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    content: {
      padding: 16,
      paddingTop: 16 + insets.top,
      paddingBottom: 40 + insets.bottom,
      gap: 12,
    },
    heroCard: {
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 14,
      padding: 14,
    },
    heroTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8,
    },
    heroTitle: {
      color: theme.text,
      fontSize: 16,
      fontWeight: '800',
    },
    heroText: {
      color: theme.textSecondary,
      fontSize: 13,
      lineHeight: 19,
    },
    card: {
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 14,
      padding: 14,
      gap: 10,
    },
    sectionTitle: {
      color: theme.text,
      fontSize: 15,
      fontWeight: '700',
    },
    sectionSubtitle: {
      color: theme.textSecondary,
      fontSize: 12,
      lineHeight: 17,
    },
    loadingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 6,
    },
    loadingText: {
      color: theme.textSecondary,
      fontSize: 12,
    },
    chipsWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    classChip: {
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.background,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    classChipActive: {
      borderColor: theme.primary,
      backgroundColor: theme.primary + '22',
    },
    classChipText: {
      color: theme.textSecondary,
      fontSize: 12,
      fontWeight: '600',
    },
    classChipTextActive: {
      color: theme.primary,
    },
    primaryBtn: {
      borderRadius: 12,
      backgroundColor: theme.primary,
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 16,
    },
    primaryBtnText: {
      color: theme.onPrimary,
      fontSize: 15,
      fontWeight: '800',
    },
    errorText: {
      color: theme.error || '#ef4444',
      fontSize: 12,
      fontWeight: '600',
    },
    noticeText: {
      color: theme.success || '#22c55e',
      fontSize: 12,
      fontWeight: '600',
    },
    codeCard: {
      borderWidth: 1,
      borderColor: theme.primary,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
      backgroundColor: theme.primary + '18',
      alignItems: 'center',
    },
    codeLabel: {
      color: theme.textSecondary,
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: 1.1,
      marginBottom: 4,
    },
    codeValue: {
      color: theme.text,
      fontSize: 30,
      fontWeight: '900',
      letterSpacing: 4,
    },
    actionsColumn: {
      gap: 8,
    },
    secondaryBtn: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 10,
      minHeight: 42,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: theme.background,
    },
    secondaryBtnText: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '700',
    },
    linkText: {
      color: theme.textSecondary,
      fontSize: 11,
      lineHeight: 16,
    },
  });
