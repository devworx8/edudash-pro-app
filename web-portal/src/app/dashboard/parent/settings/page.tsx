'use client';

import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/navigation';
import { useTenantSlug } from '@/lib/tenant/useTenantSlug';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { useParentSettings } from '@/lib/hooks/parent/useParentSettings';
import { ParentShell } from '@/components/dashboard/parent/ParentShell';
import { NotificationPreferencesCard } from '@/components/settings/NotificationPreferencesCard';
import {
  User, Lock, Globe, Moon, Sun, LogOut,
  Camera, AlertTriangle, CreditCard, ChevronRight,
  Phone, Mail, Check, X, Loader2, Users,
} from 'lucide-react';

export default function SettingsPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const s = useParentSettings();
  const { slug } = useTenantSlug(s.userId);
  const { profile } = useUserProfile(s.userId);

  if (s.loading) {
    return (
      <div className="app">
        <header className="topbar">
          <div className="container topbarRow">
            <div className="brand">EduDash Pro</div>
          </div>
        </header>
        <main className="content container">
          {t('settings.parent.loading', { defaultValue: 'Loading...' })}
        </main>
      </div>
    );
  }

  return (
    <ParentShell tenantSlug={slug} userEmail={s.userEmail}>
      <div className="container">
        {/* Success notification banner */}
        {s.saveSuccess && (
          <div style={{
            position: 'fixed', top: 80, right: 20,
            background: 'var(--success)', color: 'white',
            padding: '12px 20px', borderRadius: 8,
            display: 'flex', alignItems: 'center', gap: 8,
            boxShadow: 'var(--shadow-lg)', zIndex: 1000,
            animation: 'slideIn 0.3s ease-out',
          }}>
            <Check className="icon16" />
            <span>{t('settings.parent.saved_success', { defaultValue: 'Settings saved successfully!' })}</span>
          </div>
        )}

        {/* Header */}
        <div className="section">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
            <button
              onClick={() => router.back()}
              style={{
                background: 'none', border: 'none',
                color: 'var(--text-primary)', cursor: 'pointer',
                padding: 8, display: 'flex', alignItems: 'center',
                justifyContent: 'center', borderRadius: 8, transition: 'background 0.2s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="h1" style={{ marginBottom: 0 }}>
                {t('settings.parent.title', { defaultValue: 'Settings' })}
              </h1>
              <p className="muted">
                {t('settings.parent.subtitle', { defaultValue: 'Manage your account preferences' })}
              </p>
            </div>
          </div>
        </div>

        <div className="section">
          <div style={{ maxWidth: 800, display: 'grid', gap: 'var(--space-4)' }}>

            {/* Profile Settings */}
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
                <User className="icon20" style={{ color: 'var(--primary)' }} />
                <h2 className="h2" style={{ margin: 0 }}>
                  {t('settings.parent.profile.title', { defaultValue: 'Profile' })}
                </h2>
              </div>
              <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
                {/* Profile Picture */}
                <div>
                  <label className="label">
                    {t('settings.parent.profile.picture', { defaultValue: 'Profile Picture' })}
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
                    <div style={{ position: 'relative' }}>
                      {s.uploadingAvatar ? (
                        <div className="w-20 h-20 rounded-full bg-gray-700 flex items-center justify-center">
                          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                        </div>
                      ) : s.avatarUrl ? (
                        <img
                          src={s.avatarUrl}
                          alt={t('settings.parent.profile.picture_alt', { defaultValue: 'Profile' })}
                          style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--primary)' }}
                        />
                      ) : (
                        <div className="avatar" style={{ width: 80, height: 80, fontSize: 28, border: '2px solid var(--primary)' }}>
                          {s.fullName?.[0]?.toUpperCase() || s.userEmail?.[0]?.toUpperCase() || 'U'}
                        </div>
                      )}
                      <label style={{
                        position: 'absolute', bottom: 0, right: 0,
                        width: 28, height: 28, background: 'var(--primary)',
                        borderRadius: '50%', display: 'flex', alignItems: 'center',
                        justifyContent: 'center',
                        cursor: s.uploadingAvatar ? 'not-allowed' : 'pointer',
                        boxShadow: 'var(--shadow-md)',
                        opacity: s.uploadingAvatar ? 0.5 : 1,
                      }}>
                        <Camera className="icon16" style={{ color: 'white' }} />
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => s.handleAvatarUpload(e, t)}
                          style={{ display: 'none' }}
                          disabled={s.uploadingAvatar}
                        />
                      </label>
                    </div>
                    <div>
                      <p style={{ fontSize: 14, marginBottom: 4 }}>
                        {t('settings.parent.profile.upload_hint', { defaultValue: 'Upload a profile picture' })}
                      </p>
                      <p className="muted" style={{ fontSize: 12 }}>
                        {t('settings.parent.profile.upload_formats', { defaultValue: 'JPG, PNG or GIF (Max 2MB)' })}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Email (read-only) */}
                <div>
                  <label className="label">
                    <Mail className="icon16" style={{ marginRight: 'var(--space-1)', display: 'inline-block', verticalAlign: 'middle' }} />
                    {t('settings.parent.profile.email', { defaultValue: 'Email' })}
                  </label>
                  <input type="email" value={s.userEmail} disabled className="input" style={{ opacity: 0.6, cursor: 'not-allowed' }} />
                </div>

                {/* Full Name */}
                <div>
                  <label className="label">{t('settings.parent.profile.full_name', { defaultValue: 'Full Name' })}</label>
                  <input
                    type="text"
                    placeholder={t('settings.parent.profile.full_name_placeholder', { defaultValue: 'Enter your full name' })}
                    value={s.fullName}
                    onChange={(e) => s.setFullName(e.target.value)}
                    className="input"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="label">
                    <Phone className="icon16" style={{ marginRight: 'var(--space-1)', display: 'inline-block', verticalAlign: 'middle' }} />
                    {t('settings.parent.profile.phone', { defaultValue: 'Phone Number' })}
                  </label>
                  <input
                    type="tel"
                    placeholder={t('settings.parent.profile.phone_placeholder', { defaultValue: 'e.g. +27 82 123 4567' })}
                    value={s.phoneNumber}
                    onChange={(e) => s.setPhoneNumber(e.target.value)}
                    className="input"
                  />
                  <p className="muted" style={{ fontSize: 12, marginTop: 'var(--space-1)' }}>
                    {t('settings.parent.profile.phone_hint', { defaultValue: 'Used for notifications and account recovery' })}
                  </p>
                </div>

                {s.saveError && (
                  <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', display: 'flex', alignItems: 'start', gap: 'var(--space-2)' }}>
                    <X className="icon16" style={{ color: 'var(--danger)', flexShrink: 0, marginTop: 2 }} />
                    <p style={{ fontSize: 14, color: 'var(--danger)' }}>{s.saveError}</p>
                  </div>
                )}

                <button
                  onClick={() => s.handleSaveProfile(t)}
                  disabled={s.saving}
                  className="btn btnPrimary"
                  style={{ width: 'fit-content', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', opacity: s.saving ? 0.6 : 1, cursor: s.saving ? 'not-allowed' : 'pointer' }}
                >
                  {s.saving && <Loader2 className="icon16 animate-spin" />}
                  {s.saving
                    ? t('settings.parent.profile.saving', { defaultValue: 'Saving...' })
                    : t('settings.parent.profile.save_changes', { defaultValue: 'Save Changes' })}
                </button>
              </div>
            </div>

            {/* Notifications */}
            <NotificationPreferencesCard userId={s.userId} />

            {/* Linked Children */}
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-4)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <Users className="icon20" style={{ color: 'var(--primary)' }} />
                  <h2 className="h2" style={{ margin: 0 }}>
                    {t('settings.parent.children.title', { defaultValue: 'Linked Children' })}
                  </h2>
                </div>
                <button onClick={() => router.push('/dashboard/parent/register-child')} className="btn btnSmall btnPrimary">
                  {t('settings.parent.children.add_child', { defaultValue: 'Add Child' })}
                </button>
              </div>
              {s.loadingChildren ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-4)' }}>
                  <Loader2 className="icon20 animate-spin" style={{ color: 'var(--muted)' }} />
                </div>
              ) : s.linkedChildren.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 'var(--space-4)', color: 'var(--muted)' }}>
                  <p>{t('settings.parent.children.empty', { defaultValue: 'No children linked to your account yet.' })}</p>
                  <button onClick={() => router.push('/dashboard/parent/register-child')} className="btn btnPrimary" style={{ marginTop: 'var(--space-3)' }}>
                    {t('settings.parent.children.register_child', { defaultValue: 'Register a Child' })}
                  </button>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
                  {s.linkedChildren.map((child) => (
                    <div key={child.id} className="listItem" style={{ cursor: 'pointer' }} onClick={() => router.push(`/dashboard/parent/children/${child.id}`)}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                        <div className="avatar" style={{ width: 40, height: 40, fontSize: 14 }}>
                          {child.first_name?.[0]}{child.last_name?.[0]}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, marginBottom: 2 }}>{child.first_name} {child.last_name}</div>
                          <div className="muted" style={{ fontSize: 12 }}>
                            {child.grade || t('settings.parent.children.no_grade', { defaultValue: 'No grade' })} {child.class?.name ? `• ${child.class.name}` : ''}
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="icon20" style={{ color: 'var(--textMuted)' }} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Subscription & Billing */}
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
                <CreditCard className="icon20" style={{ color: 'var(--primary)' }} />
                <h2 className="h2" style={{ margin: 0 }}>
                  {t('settings.parent.billing.title', { defaultValue: 'Subscription & Billing' })}
                </h2>
              </div>
              <div className="listItem" style={{ cursor: 'pointer' }} onClick={() => router.push('/dashboard/parent/subscription')}>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>
                    {t('settings.parent.billing.manage.title', { defaultValue: 'Manage Subscription' })}
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {t('settings.parent.billing.manage.subtitle', { defaultValue: 'View your plan, usage, and upgrade options' })}
                  </div>
                </div>
                <ChevronRight className="icon20" style={{ color: 'var(--textMuted)' }} />
              </div>
            </div>

            {/* Appearance */}
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
                {s.darkMode ? <Moon className="icon20" style={{ color: 'var(--primary)' }} /> : <Sun className="icon20" style={{ color: 'var(--primary)' }} />}
                <h2 className="h2" style={{ margin: 0 }}>
                  {t('settings.parent.appearance.title', { defaultValue: 'Appearance' })}
                </h2>
              </div>
              <div className="listItem">
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>
                    {t('settings.parent.appearance.dark_mode', { defaultValue: 'Dark Mode' })}
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {t('settings.parent.appearance.dark_mode_hint', { defaultValue: 'Toggle dark mode' })}
                  </div>
                </div>
                <button onClick={s.handleDarkModeToggle} className={`toggle ${s.darkMode ? 'toggleActive' : ''}`}>
                  <span className="toggleThumb" style={{ transform: s.darkMode ? 'translateX(20px)' : 'translateX(0)' }} />
                </button>
              </div>
            </div>

            {/* Language */}
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
                <Globe className="icon20" style={{ color: 'var(--primary)' }} />
                <h2 className="h2" style={{ margin: 0 }}>
                  {t('settings.parent.language.title', { defaultValue: 'Language' })}
                </h2>
              </div>
              <select value={s.language} onChange={(e) => s.handleLanguageChange(e.target.value)} className="input">
                <option value="en-ZA">{t('settings.parent.language.en', { defaultValue: 'English (South Africa)' })}</option>
                <option value="af-ZA">{t('settings.parent.language.af', { defaultValue: 'Afrikaans' })}</option>
                <option value="zu-ZA">{t('settings.parent.language.zu', { defaultValue: 'Zulu' })}</option>
                <option value="xh-ZA">{t('settings.parent.language.xh', { defaultValue: 'Xhosa' })}</option>
                <option value="st-ZA">{t('settings.parent.language.st', { defaultValue: 'Sesotho' })}</option>
                <option value="tn-ZA">{t('settings.parent.language.tn', { defaultValue: 'Setswana' })}</option>
              </select>
            </div>

            {/* Security */}
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
                <Lock className="icon20" style={{ color: 'var(--primary)' }} />
                <h2 className="h2" style={{ margin: 0 }}>
                  {t('settings.parent.security.title', { defaultValue: 'Security' })}
                </h2>
              </div>
              <button
                onClick={() => s.setShowPasswordModal(true)}
                className="btn btnSecondary"
                style={{ width: '100%', justifyContent: 'flex-start', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
              >
                <span>{t('settings.parent.security.change_password', { defaultValue: 'Change Password' })}</span>
                <Lock className="icon16" style={{ marginLeft: 'auto', color: 'var(--textMuted)' }} />
              </button>
            </div>

            {/* Sign Out */}
            <div className="card" style={{ borderColor: 'var(--danger-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
                <LogOut className="icon20" style={{ color: 'var(--danger)' }} />
                <h2 className="h2" style={{ margin: 0 }}>
                  {t('settings.parent.sign_out.title', { defaultValue: 'Sign Out' })}
                </h2>
              </div>
              <p className="muted" style={{ marginBottom: 'var(--space-3)' }}>
                {t('settings.parent.sign_out.description', { defaultValue: 'Sign out from your account on this device.' })}
              </p>
              <button
                onClick={s.handleSignOut}
                disabled={s.signingOut}
                className="btn"
                style={{
                  width: '100%',
                  background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                  color: 'white', opacity: s.signingOut ? 0.5 : 1,
                  cursor: s.signingOut ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)',
                }}
              >
                <LogOut className="icon16" />
                {s.signingOut
                  ? t('settings.parent.sign_out.signing_out', { defaultValue: 'Signing out...' })
                  : t('settings.parent.sign_out.button', { defaultValue: 'Sign Out' })}
              </button>
            </div>

            {/* Delete Account */}
            <div className="card p-md border-2 border-red-800/40 bg-red-950/20">
              <div className="flex items-center gap-3 mb-6">
                <AlertTriangle className="w-5 h-5 text-red-400" />
                <h2 className="text-lg font-semibold text-red-200">
                  {t('settings.parent.delete.title', { defaultValue: 'Delete Account' })}
                </h2>
              </div>
              <p className="text-sm text-red-200/80 mb-3">
                {t('settings.parent.delete.description', { defaultValue: 'Permanently delete your EduDash Pro account, remove access to all Dash AI features, and end your subscription. This cannot be undone.' })}
              </p>
              <ul className="text-xs text-red-100/70 mb-4 space-y-1 list-disc list-inside">
                <li>{t('settings.parent.delete.bullet.sign_out', { defaultValue: 'All devices will be signed out immediately' })}</li>
                <li>{t('settings.parent.delete.bullet.subscription_stop', { defaultValue: 'Your subscription and trial benefits will stop' })}</li>
                <li>{t('settings.parent.delete.bullet.retention', { defaultValue: 'Some records may be retained for regulatory requirements' })}</li>
              </ul>
              {s.deleteError && (
                <div className="mb-3 rounded-md border border-red-500/50 bg-red-900/40 px-3 py-2 text-xs text-red-100">
                  {s.deleteError}
                </div>
              )}
              <button
                onClick={() => s.handleDeleteAccount(t)}
                disabled={s.deletingAccount}
                className="w-full px-4 py-3 bg-gradient-to-r from-red-700 to-red-800 hover:from-red-800 hover:to-red-900 disabled:from-gray-700 disabled:to-gray-700 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2 disabled:cursor-not-allowed shadow-lg hover:shadow-red-700/40"
              >
                <AlertTriangle className="w-4 h-4" />
                {s.deletingAccount
                  ? t('settings.parent.delete.deleting', { defaultValue: 'Deleting account?' })
                  : t('settings.parent.delete.button', { defaultValue: 'Delete My Account' })}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Password Change Modal */}
      {s.showPasswordModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div style={{ background: 'var(--cardBg)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-2xl)', maxWidth: 480, width: '100%', padding: 24, border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <h3 style={{ fontSize: 20, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Lock className="icon20" style={{ color: 'var(--primary)' }} />
                {t('settings.parent.password.modal_title', { defaultValue: 'Change Password' })}
              </h3>
              <button onClick={s.dismissPasswordModal} style={{ color: 'var(--textMuted)', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                <X className="icon20" />
              </button>
            </div>

            <div style={{ display: 'grid', gap: 16 }}>
              <div>
                <label className="label">{t('settings.parent.password.new_label', { defaultValue: 'New Password' })}</label>
                <input type="password" placeholder={t('settings.parent.password.new_placeholder', { defaultValue: 'Enter new password' })} value={s.newPassword} onChange={(e) => s.setNewPassword(e.target.value)} className="input" />
              </div>
              <div>
                <label className="label">{t('settings.parent.password.confirm_label', { defaultValue: 'Confirm Password' })}</label>
                <input type="password" placeholder={t('settings.parent.password.confirm_placeholder', { defaultValue: 'Confirm new password' })} value={s.confirmPassword} onChange={(e) => s.setConfirmPassword(e.target.value)} className="input" />
              </div>

              {s.passwordError && (
                <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 'var(--radius-md)', padding: 12, display: 'flex', alignItems: 'start', gap: 8 }}>
                  <X className="icon16" style={{ color: 'var(--danger)', flexShrink: 0, marginTop: 2 }} />
                  <p style={{ fontSize: 14, color: 'var(--danger)' }}>{s.passwordError}</p>
                </div>
              )}

              <div style={{ display: 'flex', gap: 12, paddingTop: 8 }}>
                <button onClick={s.dismissPasswordModal} className="btn btnSecondary" style={{ flex: 1 }}>
                  {t('common.cancel', { defaultValue: 'Cancel' })}
                </button>
                <button
                  onClick={() => s.handlePasswordChange(t)}
                  disabled={s.changingPassword || !s.newPassword || !s.confirmPassword}
                  className="btn btnPrimary"
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    opacity: (s.changingPassword || !s.newPassword || !s.confirmPassword) ? 0.6 : 1,
                    cursor: (s.changingPassword || !s.newPassword || !s.confirmPassword) ? 'not-allowed' : 'pointer',
                  }}
                >
                  {s.changingPassword && <Loader2 className="icon16 animate-spin" />}
                  {s.changingPassword
                    ? t('settings.parent.password.changing', { defaultValue: 'Changing...' })
                    : t('settings.parent.password.change_button', { defaultValue: 'Change Password' })}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </ParentShell>
  );
}
