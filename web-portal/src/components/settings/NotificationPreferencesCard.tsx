/**
 * NotificationPreferencesCard (Web)
 *
 * Replaces the inline notification toggles in the parent settings page
 * with a full per-category + delivery-channel UI backed by the
 * `notification_preferences` table.
 *
 * ≤400 lines (WARP-compliant component)
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import {
  Bell,
  BookOpen,
  Calendar,
  MessageCircle,
  Megaphone,
  BarChart3,
  CreditCard,
  Video,
  Trophy,
  Smartphone,
  Mail,
  MessageSquare,
  Phone,
  ChevronRight,
  Loader2,
  Check,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  useNotificationPreferences,
  type NotificationPrefs,
} from '@/lib/hooks/parent/useNotificationPreferences';

// ---------- Config ----------
type CategoryKey = keyof Pick<
  NotificationPrefs,
  | 'homework_reminders'
  | 'attendance_alerts'
  | 'messages'
  | 'announcements'
  | 'weekly_reports'
  | 'payment_reminders'
  | 'live_class_alerts'
  | 'milestone_celebrations'
>;

const CATEGORIES: {
  key: CategoryKey;
  icon: React.ElementType;
  label: string;
  desc: string;
}[] = [
  { key: 'homework_reminders', icon: BookOpen, label: 'Homework Reminders', desc: 'Get notified about new and due homework' },
  { key: 'attendance_alerts', icon: Calendar, label: 'Attendance Alerts', desc: 'Daily attendance check-in/out alerts' },
  { key: 'messages', icon: MessageCircle, label: 'Messages', desc: 'New messages from teachers and school' },
  { key: 'announcements', icon: Megaphone, label: 'Announcements', desc: 'School-wide announcements and updates' },
  { key: 'weekly_reports', icon: BarChart3, label: 'Weekly Reports', desc: 'Weekly learning progress summaries' },
  { key: 'payment_reminders', icon: CreditCard, label: 'Payment Reminders', desc: 'Upcoming and overdue payment alerts' },
  { key: 'live_class_alerts', icon: Video, label: 'Live Class Alerts', desc: 'Reminders before live classes start' },
  { key: 'milestone_celebrations', icon: Trophy, label: 'Milestones', desc: "Celebrate your child's achievements" },
];

type ChannelKey = keyof Pick<NotificationPrefs, 'push_enabled' | 'email_enabled' | 'sms_enabled'>;

const CHANNELS: { key: ChannelKey; icon: React.ElementType; label: string }[] = [
  { key: 'push_enabled', icon: Smartphone, label: 'Push Notifications' },
  { key: 'email_enabled', icon: Mail, label: 'Email' },
  { key: 'sms_enabled', icon: MessageSquare, label: 'SMS' },
];

// ---------- Component ----------
interface NotificationPreferencesCardProps {
  userId: string | undefined;
}

export function NotificationPreferencesCard({ userId }: NotificationPreferencesCardProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { prefs, loading, saving, error, updatePref, savePrefs } =
    useNotificationPreferences(userId);

  const [showCategories, setShowCategories] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSave = async () => {
    await savePrefs();
    if (!error) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }
  };

  return (
    <div className="card">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
        <Bell className="icon20" style={{ color: 'var(--primary)' }} />
        <h2 className="h2" style={{ margin: 0 }}>
          {t('settings.parent.notifications.title', { defaultValue: 'Notifications' })}
        </h2>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-6)' }}>
          <Loader2 className="icon20 animate-spin" style={{ color: 'var(--muted)' }} />
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
          {/* ── Delivery Channels ── */}
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Delivery Channels
          </div>
          {CHANNELS.map((ch) => {
            const Icon = ch.icon;
            return (
              <div key={ch.key} className="listItem">
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <Icon className="icon16" style={{ color: 'var(--muted)' }} />
                  <span style={{ fontWeight: 600 }}>{ch.label}</span>
                </div>
                <button
                  onClick={() => updatePref(ch.key, !prefs[ch.key])}
                  className={`toggle ${prefs[ch.key] ? 'toggleActive' : ''}`}
                >
                  <span className="toggleThumb" style={{ transform: prefs[ch.key] ? 'translateX(20px)' : 'translateX(0)' }} />
                </button>
              </div>
            );
          })}

          {/* ── Category toggles (expandable) ── */}
          <button
            onClick={() => setShowCategories(!showCategories)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'var(--surface-variant)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-3)',
              cursor: 'pointer',
              width: '100%',
              marginTop: 'var(--space-2)',
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Notification Categories
            </span>
            {showCategories ? (
              <ChevronUp className="icon16" style={{ color: 'var(--muted)' }} />
            ) : (
              <ChevronDown className="icon16" style={{ color: 'var(--muted)' }} />
            )}
          </button>

          {showCategories &&
            CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              return (
                <div key={cat.key} className="listItem">
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <Icon className="icon16" style={{ color: 'var(--muted)' }} />
                      {cat.label}
                    </div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {cat.desc}
                    </div>
                  </div>
                  <button
                    onClick={() => updatePref(cat.key, !prefs[cat.key])}
                    className={`toggle ${prefs[cat.key] ? 'toggleActive' : ''}`}
                  >
                    <span className="toggleThumb" style={{ transform: prefs[cat.key] ? 'translateX(20px)' : 'translateX(0)' }} />
                  </button>
                </div>
              );
            })}

          {/* Call Ringtones Link */}
          <div
            className="listItem"
            style={{ cursor: 'pointer', background: 'var(--surface-variant)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)' }}
            onClick={() => router.push('/dashboard/parent/settings/ringtones')}
          >
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <Phone className="icon16" />
                {t('settings.parent.notifications.ringtones.title', { defaultValue: 'Call Ringtones' })}
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                {t('settings.parent.notifications.ringtones.subtitle', { defaultValue: 'Customize ringtones and call sounds' })}
              </div>
            </div>
            <ChevronRight className="icon16" style={{ color: 'var(--muted)' }} />
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ color: 'var(--error)', fontSize: 13, marginTop: 'var(--space-2)', textAlign: 'center' }}>
          {error}
        </div>
      )}

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving || loading}
        className="btn btnSecondary"
        style={{ marginTop: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', opacity: saving ? 0.6 : 1 }}
      >
        {saving && <Loader2 className="icon16 animate-spin" />}
        {saveSuccess ? (
          <>
            <Check className="icon16" />
            Saved!
          </>
        ) : saving ? (
          t('settings.parent.notifications.saving', { defaultValue: 'Saving...' })
        ) : (
          t('settings.parent.notifications.save', { defaultValue: 'Save Notification Preferences' })
        )}
      </button>
    </div>
  );
}
