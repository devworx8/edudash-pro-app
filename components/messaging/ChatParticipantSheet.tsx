import React, { useMemo } from 'react';
import {
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type ParticipantSummary = {
  id: string;
  name: string;
  role?: string | null;
  online?: boolean;
};

type QuickAction = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
};

interface ChatParticipantSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string | null;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
  avatarLabel?: string;
  isGroup?: boolean;
  isLoading?: boolean;
  participantCount?: number;
  onlineCount?: number;
  participants?: ParticipantSummary[];
  quickActions?: QuickAction[];
}

export function ChatParticipantSheet({
  visible,
  onClose,
  title,
  subtitle,
  role,
  email,
  phone,
  avatarUrl,
  avatarLabel = '?',
  isGroup = false,
  isLoading = false,
  participantCount = 0,
  onlineCount = 0,
  participants = [],
  quickActions = [],
}: ChatParticipantSheetProps) {
  const insets = useSafeAreaInsets();

  const styles = useMemo(() => StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.68)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: 'rgba(7, 12, 30, 0.98)',
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingTop: 10,
      paddingBottom: insets.bottom + 18,
      borderWidth: 1,
      borderColor: 'rgba(125, 211, 252, 0.14)',
      maxHeight: '82%',
      ...Platform.select({
        ios: {
          shadowColor: '#040817',
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: 0.42,
          shadowRadius: 24,
        },
        android: {
          elevation: 16,
        },
      }),
    },
    handle: {
      width: 48,
      height: 4,
      borderRadius: 2,
      alignSelf: 'center',
      backgroundColor: 'rgba(191, 212, 255, 0.32)',
      marginTop: 6,
      marginBottom: 14,
    },
    header: {
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(125, 211, 252, 0.12)',
    },
    avatar: {
      width: 60,
      height: 60,
      borderRadius: 30,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.14)',
      marginBottom: 12,
    },
    avatarText: {
      color: '#fff',
      fontSize: 22,
      fontWeight: '700',
    },
    avatarImage: {
      width: '100%',
      height: '100%',
      borderRadius: 30,
    },
    title: {
      fontSize: 20,
      fontWeight: '800',
      color: '#f8fafc',
      textAlign: 'center',
    },
    subtitle: {
      fontSize: 13,
      color: '#b8c8f4',
      textAlign: 'center',
      marginTop: 4,
    },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 10,
    },
    summaryPill: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
      backgroundColor: 'rgba(15, 23, 42, 0.84)',
      borderWidth: 1,
      borderColor: 'rgba(125, 211, 252, 0.16)',
    },
    summaryPillText: {
      color: '#dbeafe',
      fontSize: 12,
      fontWeight: '700',
    },
    body: {
      paddingHorizontal: 16,
      paddingTop: 14,
    },
    quickActionsRow: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 16,
    },
    quickAction: {
      flex: 1,
      minWidth: 0,
      borderRadius: 18,
      paddingVertical: 12,
      paddingHorizontal: 10,
      backgroundColor: 'rgba(14, 22, 44, 0.9)',
      borderWidth: 1,
      borderColor: 'rgba(125, 211, 252, 0.14)',
      alignItems: 'center',
      gap: 6,
    },
    quickActionDisabled: {
      opacity: 0.45,
    },
    quickActionLabel: {
      color: '#e2e8f0',
      fontSize: 12,
      fontWeight: '700',
      textAlign: 'center',
    },
    section: {
      marginBottom: 14,
      borderRadius: 20,
      backgroundColor: 'rgba(14, 22, 44, 0.88)',
      borderWidth: 1,
      borderColor: 'rgba(125, 211, 252, 0.12)',
      overflow: 'hidden',
    },
    sectionTitle: {
      color: '#f8fafc',
      fontSize: 14,
      fontWeight: '800',
      paddingHorizontal: 14,
      paddingTop: 14,
      paddingBottom: 6,
    },
    detailRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 11,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: 'rgba(125, 211, 252, 0.12)',
    },
    detailLabel: {
      color: '#8fb4ff',
      fontSize: 12,
      fontWeight: '700',
      width: 62,
    },
    detailValue: {
      color: '#e2e8f0',
      fontSize: 14,
      fontWeight: '500',
      flex: 1,
    },
    participantRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: 'rgba(125, 211, 252, 0.12)',
    },
    participantDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: '#64748b',
    },
    participantDotOnline: {
      backgroundColor: '#22c55e',
    },
    participantName: {
      color: '#e2e8f0',
      fontSize: 14,
      fontWeight: '600',
      flex: 1,
    },
    participantRole: {
      color: '#b8c8f4',
      fontSize: 12,
      fontWeight: '600',
      textTransform: 'capitalize',
    },
    loadingText: {
      color: '#b8c8f4',
      fontSize: 14,
      textAlign: 'center',
      paddingVertical: 18,
    },
  }), [insets.bottom]);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.sheet}>
              <View style={styles.handle} />
              <ScrollView bounces={false}>
                <View style={styles.header}>
                  <LinearGradient colors={['#6f7dff', '#7c3aed', '#1cc8ff']} style={styles.avatar}>
                    {avatarUrl && !isGroup ? (
                      <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
                    ) : (
                      <Text style={styles.avatarText}>{avatarLabel}</Text>
                    )}
                  </LinearGradient>
                  <Text style={styles.title}>{title}</Text>
                  {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
                  <View style={styles.summaryRow}>
                    {role ? (
                      <View style={styles.summaryPill}>
                        <Text style={styles.summaryPillText}>{role}</Text>
                      </View>
                    ) : null}
                    {isGroup ? (
                      <>
                        <View style={styles.summaryPill}>
                          <Text style={styles.summaryPillText}>{onlineCount} online</Text>
                        </View>
                        <View style={styles.summaryPill}>
                          <Text style={styles.summaryPillText}>
                            {participantCount} member{participantCount === 1 ? '' : 's'}
                          </Text>
                        </View>
                      </>
                    ) : null}
                  </View>
                </View>

                <View style={styles.body}>
                  {quickActions.length > 0 ? (
                    <View style={styles.quickActionsRow}>
                      {quickActions.map((action) => (
                        <TouchableOpacity
                          key={action.key}
                          style={[styles.quickAction, action.disabled && styles.quickActionDisabled]}
                          onPress={action.onPress}
                          disabled={action.disabled}
                          activeOpacity={0.8}
                        >
                          <Ionicons name={action.icon} size={18} color="#8fe8ff" />
                          <Text style={styles.quickActionLabel}>{action.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : null}

                  {!isGroup && (
                    <View style={styles.section}>
                      <Text style={styles.sectionTitle}>Contact details</Text>
                      {isLoading ? (
                        <Text style={styles.loadingText}>Loading contact details...</Text>
                      ) : (
                        <>
                          {role ? (
                            <View style={styles.detailRow}>
                              <Text style={styles.detailLabel}>Role</Text>
                              <Text style={styles.detailValue}>{role}</Text>
                            </View>
                          ) : null}
                          <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>Email</Text>
                            <Text style={styles.detailValue}>{email || 'Not available'}</Text>
                          </View>
                          <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>Phone</Text>
                            <Text style={styles.detailValue}>{phone || 'Not available'}</Text>
                          </View>
                        </>
                      )}
                    </View>
                  )}

                  {isGroup && (
                    <View style={styles.section}>
                      <Text style={styles.sectionTitle}>Members</Text>
                      {participants.length === 0 ? (
                        <Text style={styles.loadingText}>No participant details available yet.</Text>
                      ) : (
                        participants.map((participant) => (
                          <View key={participant.id} style={styles.participantRow}>
                            <View style={[styles.participantDot, participant.online && styles.participantDotOnline]} />
                            <Text style={styles.participantName}>{participant.name}</Text>
                            {participant.role ? <Text style={styles.participantRole}>{participant.role}</Text> : null}
                          </View>
                        ))
                      )}
                    </View>
                  )}
                </View>
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

export default ChatParticipantSheet;
