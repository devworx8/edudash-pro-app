import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { CHANNEL_TYPE_CONFIG } from '@/hooks/super-admin-team-chat/types';
import type { TeamChannel, TeamChannelMember } from '@/hooks/super-admin-team-chat/types';

const AVATAR_COLORS = [
  '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b',
  '#ec4899', '#ef4444', '#6366f1', '#14b8a6',
];

function hashColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function initials(name: string): string {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
}

function formatPreviewTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

interface Props {
  channels: TeamChannel[];
  activeChannelId?: string;
  onSelect: (ch: TeamChannel) => void;
  members: TeamChannelMember[];
  loading: boolean;
  isWide: boolean;
  onBack?: () => void;
}

export default function ChannelSidebar({
  channels, activeChannelId, onSelect, members, loading, isWide, onBack,
}: Props) {
  const uniqueMembers = useMemo(() => {
    const seen = new Set<string>();
    return members.filter(m => {
      if (seen.has(m.user_id)) return false;
      seen.add(m.user_id);
      return true;
    });
  }, [members]);

  return (
    <View style={[s.root, isWide ? s.rootWide : s.rootFull]}>
      {/* ── Header ── */}
      <View style={s.header}>
        {!isWide && (
          <TouchableOpacity
            onPress={onBack || (() => router.back())}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="arrow-back" size={24} color="#e2e8f0" />
          </TouchableOpacity>
        )}
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Team Chat</Text>
          <Text style={s.headerSub}>
            {channels.length} channel{channels.length !== 1 ? 's' : ''}
          </Text>
        </View>
      </View>

      {/* ── Channel List ── */}
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <Text style={s.sectionLabel}>Channels</Text>

        {loading ? (
          <View style={s.emptyWrap}>
            <Text style={s.emptyText}>Loading channels…</Text>
          </View>
        ) : channels.length === 0 ? (
          <View style={s.emptyWrap}>
            <Ionicons name="chatbubbles-outline" size={32} color="#334155" />
            <Text style={[s.emptyText, { marginTop: 8 }]}>No channels yet</Text>
          </View>
        ) : (
          channels.map(ch => (
            <ChannelRow
              key={ch.id}
              ch={ch}
              active={ch.id === activeChannelId}
              onPress={() => onSelect(ch)}
            />
          ))
        )}

        {/* ── Online Team Members ── */}
        {uniqueMembers.length > 0 && (
          <>
            <View style={s.divider} />
            <Text style={s.sectionLabel}>Team — {uniqueMembers.length}</Text>
            {uniqueMembers.slice(0, 10).map(m => (
              <MemberRow key={m.user_id} name={m.profile?.full_name || 'Team Member'} />
            ))}
          </>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

// ── Channel Row ──

function ChannelRow({ ch, active, onPress }: { ch: TeamChannel; active: boolean; onPress: () => void }) {
  const cfg = CHANNEL_TYPE_CONFIG[ch.channel_type] || CHANNEL_TYPE_CONFIG.custom;
  const unread = (ch.unread_count || 0) > 0;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[
        s.chRow,
        active && { backgroundColor: '#1e293b', borderLeftWidth: 3, borderLeftColor: cfg.color },
      ]}
    >
      <View style={[s.chIcon, { backgroundColor: cfg.color + '20' }]}>
        <Ionicons name={cfg.icon as any} size={16} color={cfg.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={[s.chName, (active || unread) && s.chNameHighlight]}
          numberOfLines={1}
        >
          {ch.name}
        </Text>
        {ch.last_message && (
          <Text style={s.chPreview} numberOfLines={1}>
            {ch.last_message.content}
          </Text>
        )}
      </View>
      <View style={s.chMeta}>
        {ch.last_message && (
          <Text style={s.chTime}>{formatPreviewTime(ch.last_message.created_at)}</Text>
        )}
        {unread && (
          <View style={[s.badge, { backgroundColor: cfg.color }]}>
            <Text style={s.badgeText}>{ch.unread_count}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ── Member Row ──

function MemberRow({ name }: { name: string }) {
  return (
    <View style={s.memberRow}>
      <View style={[s.avatar, { backgroundColor: hashColor(name) }]}>
        <Text style={s.avatarText}>{initials(name)}</Text>
      </View>
      <Text style={s.memberName} numberOfLines={1}>{name}</Text>
      <View style={s.onlineDot} />
    </View>
  );
}

// ── Styles ──

const s = StyleSheet.create({
  root: { backgroundColor: '#0c1222' },
  rootWide: { width: 300, borderRightWidth: 1, borderRightColor: '#1e293b' },
  rootFull: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    padding: 16, paddingBottom: 12, gap: 12,
    borderBottomWidth: 1, borderBottomColor: '#1e293b',
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#f1f5f9', letterSpacing: -0.3 },
  headerSub: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: '#94a3b8',
    letterSpacing: 0.8, textTransform: 'uppercase',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6,
  },
  emptyWrap: { padding: 32, alignItems: 'center' },
  emptyText: { color: '#64748b', fontSize: 13, textAlign: 'center' },
  chRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 14, gap: 10,
  },
  chIcon: {
    width: 30, height: 30, borderRadius: 8,
    justifyContent: 'center', alignItems: 'center',
  },
  chName: { fontSize: 14, fontWeight: '600', color: '#cbd5e1' },
  chNameHighlight: { color: '#ffffff', fontWeight: '700' },
  chPreview: { fontSize: 12, color: '#64748b', marginTop: 2 },
  chMeta: { alignItems: 'flex-end', gap: 4 },
  chTime: { fontSize: 10, color: '#64748b' },
  badge: {
    minWidth: 18, height: 18, borderRadius: 9,
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5,
  },
  badgeText: { fontSize: 10, fontWeight: '800', color: '#fff' },
  divider: {
    height: 1, backgroundColor: '#1e293b',
    marginVertical: 8, marginHorizontal: 16,
  },
  memberRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 5, gap: 10,
  },
  avatar: {
    width: 28, height: 28, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  memberName: { fontSize: 13, color: '#cbd5e1', flex: 1 },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#22c55e' },
});
