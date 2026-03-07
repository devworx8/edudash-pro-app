'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { signOutEverywhere } from '@/lib/auth/signOut';
import { useTenantSlug } from '@/lib/tenant/useTenantSlug';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { TeacherShell } from '@/components/dashboard/teacher/TeacherShell';
import { User, Bell, Lock, Globe, Moon, Sun, LogOut, Camera, Phone, Mail, Check, X, Loader2, ChevronRight } from 'lucide-react';

export default function TeacherSettingsPage() {
  const router = useRouter();
  const supabase = createClient();
  const [userEmail, setUserEmail] = useState<string>();
  const [userId, setUserId] = useState<string>();
  const { slug } = useTenantSlug(userId);
  const { profile, loading: profileLoading } = useUserProfile(userId);
  const [loading, setLoading] = useState(true);
  const [darkMode, setDarkMode] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  
  // Profile form state
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  
  // Notification preferences
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [pushNotifications, setPushNotifications] = useState(false);
  
  // Language preference
  const [language, setLanguage] = useState('en-ZA');
  
  // Password change modal
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  
  // Avatar upload
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/sign-in');
        return;
      }
      setUserEmail(session.user.email);
      setUserId(session.user.id);
      setLoading(false);
    };
    initAuth();
  }, [router, supabase]);
  
  // Load profile data
  useEffect(() => {
    let isMounted = true;
    
    const loadProfileData = async () => {
      if (!userId) return;
      
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name, phone, avatar_url')
        .eq('id', userId)
        .single();
      
      if (data && !error && isMounted) {
        setFullName(data.full_name || '');
        setPhoneNumber(data.phone || '');
        setAvatarUrl(data.avatar_url || null);
      }
    };
    
    loadProfileData();
    
    // Reload when page becomes visible
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        loadProfileData();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      isMounted = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [userId, supabase]);
  
  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !userId) return;
    
    // Validate file
    if (file.size > 2 * 1024 * 1024) {
      setSaveError('Image must be less than 2MB');
      return;
    }
    
    if (!file.type.startsWith('image/')) {
      setSaveError('Please upload an image file');
      return;
    }
    
    try {
      setUploadingAvatar(true);
      setSaveError(null);
      
      // Upload to Supabase storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${userId}-${Date.now()}.${fileExt}`;
      const filePath = `avatars/${fileName}`;
      
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });
      
      if (uploadError) throw uploadError;
      
      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);
      
      // Update profile
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', userId);
      
      if (updateError) throw updateError;
      
      setAvatarUrl(publicUrl);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error: any) {
      console.error('Avatar upload failed:', error);
      setSaveError(error.message || 'Failed to upload avatar');
    } finally {
      setUploadingAvatar(false);
    }
  };
  
  const handleSaveProfile = async () => {
    if (!userId) return;
    
    try {
      setSaving(true);
      setSaveError(null);
      
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName.trim(),
          phone: phoneNumber.trim(),
        })
        .eq('id', userId);
      
      if (error) throw error;
      
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error: any) {
      console.error('Save failed:', error);
      setSaveError(error.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };
  
  const handlePasswordChange = async () => {
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }
    
    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      return;
    }
    
    try {
      setChangingPassword(true);
      setPasswordError(null);
      
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      
      if (error) throw error;
      
      setShowPasswordModal(false);
      setNewPassword('');
      setConfirmPassword('');
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error: any) {
      console.error('Password change failed:', error);
      setPasswordError(error.message || 'Failed to change password');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOutEverywhere({ timeoutMs: 2500 });
    router.push('/sign-in');
  };

  if (loading || profileLoading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <TeacherShell tenantSlug={slug} userEmail={userEmail} hideHeader={true}>
      <div className="container">
        {/* Success Banner */}
        {saveSuccess && (
          <div className="fixed top-4 right-4 z-50 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-slide-in">
            <Check className="w-5 h-5" />
            <span>Changes saved successfully!</span>
          </div>
        )}
        
        <div className="section">
          <h1 className="h1">Settings</h1>
          <p className="muted">Manage your account preferences</p>
        </div>
        <div className="section">
          <div className="grid gap-6 max-w-3xl">

            {/* Profile Settings */}
            <div className="card p-md">
              <div className="flex items-center gap-3 mb-6">
                <User className="w-5 h-5 text-blue-500" />
                <h2 className="text-lg font-semibold">Profile</h2>
              </div>
              <div className="space-y-5">
                {/* Profile Picture */}
                <div>
                  <label className="block text-sm text-gray-400 mb-4">Profile Picture</label>
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      {uploadingAvatar ? (
                        <div className="w-20 h-20 rounded-full bg-gray-700 flex items-center justify-center">
                          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                        </div>
                      ) : avatarUrl ? (
                        <img
                          src={avatarUrl}
                          alt="Profile"
                          className="w-20 h-20 rounded-full object-cover border-2 border-blue-500"
                        />
                      ) : (
                        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white text-2xl font-bold border-2 border-blue-500">
                          {fullName?.[0]?.toUpperCase() || userEmail?.[0]?.toUpperCase() || 'T'}
                        </div>
                      )}
                      <label className="absolute bottom-0 right-0 w-7 h-7 bg-blue-600 hover:bg-blue-700 rounded-full flex items-center justify-center cursor-pointer shadow-lg transition-colors">
                        <Camera className="w-4 h-4 text-white" />
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleAvatarUpload}
                          className="hidden"
                          disabled={uploadingAvatar}
                        />
                      </label>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-gray-300 mb-1">Upload a profile picture</p>
                      <p className="text-xs text-gray-500">JPG, PNG or GIF (Max 2MB)</p>
                    </div>
                  </div>
                </div>

                {/* Email (Read-only) */}
                <div>
                  <label className="block text-sm text-gray-400 mb-2 flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    Email
                  </label>
                  <input
                    type="email"
                    value={userEmail}
                    disabled
                    className="w-full bg-gray-700/50 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm cursor-not-allowed opacity-60"
                  />
                </div>
                
                {/* Full Name */}
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Full Name</label>
                  <input
                    type="text"
                    placeholder="Enter your full name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                {/* Phone Number */}
                <div>
                  <label className="block text-sm text-gray-400 mb-2 flex items-center gap-2">
                    <Phone className="w-4 h-4" />
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    placeholder="e.g. +27 82 123 4567"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Used for notifications and account recovery</p>
                </div>
                
                {saveError && (
                  <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-3 flex items-start gap-2">
                    <X className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-200">{saveError}</p>
                  </div>
                )}
                
                <button 
                  onClick={handleSaveProfile}
                  disabled={saving}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg text-sm font-semibold transition-colors flex items-center gap-2"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>

            {/* Notifications */}
            <div className="card p-md">
              <div className="flex items-center gap-3 mb-6">
                <Bell className="w-5 h-5 text-blue-500" />
                <h2 className="text-lg font-semibold">Notifications</h2>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">Email Notifications</div>
                    <div className="text-xs text-gray-400">Receive updates via email</div>
                  </div>
                  <button 
                    onClick={() => setEmailNotifications(!emailNotifications)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${emailNotifications ? 'bg-blue-600' : 'bg-gray-600'}`}
                  >
                    <span className={`${emailNotifications ? 'translate-x-6' : 'translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition`} />
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">Push Notifications</div>
                    <div className="text-xs text-gray-400">Receive push notifications</div>
                  </div>
                  <button 
                    onClick={() => setPushNotifications(!pushNotifications)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${pushNotifications ? 'bg-blue-600' : 'bg-gray-600'}`}
                  >
                    <span className={`${pushNotifications ? 'translate-x-6' : 'translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition`} />
                  </button>
                </div>
                
                {/* Call Ringtones Link */}
                <div 
                  className="flex items-center justify-between p-3 bg-gray-800 rounded-lg cursor-pointer hover:bg-gray-750 transition-colors"
                  onClick={() => router.push('/dashboard/teacher/settings/ringtones')}
                >
                  <div>
                    <div className="text-sm font-medium flex items-center gap-2">
                      <Phone className="w-4 h-4" />
                      Call Ringtones
                    </div>
                    <div className="text-xs text-gray-400">Customize ringtones and call sounds</div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </div>
              </div>
            </div>

            {/* Appearance */}
            <div className="card p-md">
              <div className="flex items-center gap-3 mb-6">
                {darkMode ? <Moon className="w-5 h-5 text-blue-500" /> : <Sun className="w-5 h-5 text-blue-500" />}
                <h2 className="text-lg font-semibold">Appearance</h2>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">Dark Mode</div>
                  <div className="text-xs text-gray-400">Toggle dark mode</div>
                </div>
                <button
                  onClick={() => setDarkMode(!darkMode)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${darkMode ? 'bg-blue-600' : 'bg-gray-600'}`}
                >
                  <span className={`${darkMode ? 'translate-x-6' : 'translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition`} />
                </button>
              </div>
            </div>

            {/* Language */}
            <div className="card p-md">
              <div className="flex items-center gap-3 mb-6">
                <Globe className="w-5 h-5 text-blue-500" />
                <h2 className="text-lg font-semibold">Language</h2>
              </div>
              <select 
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="en-ZA">English (South Africa)</option>
                <option value="af-ZA">Afrikaans</option>
                <option value="zu-ZA">Zulu</option>
                <option value="xh-ZA">Xhosa</option>
                <option value="st-ZA">Sesotho</option>
                <option value="tn-ZA">Setswana</option>
              </select>
            </div>

            {/* Security */}
            <div className="card p-md">
              <div className="flex items-center gap-3 mb-6">
                <Lock className="w-5 h-5 text-blue-500" />
                <h2 className="text-lg font-semibold">Security</h2>
              </div>
              <button 
                onClick={() => setShowPasswordModal(true)}
                className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors text-left flex items-center justify-between"
              >
                <span>Change Password</span>
                <Lock className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            {/* Sign Out */}
            <div className="card p-md border-2 border-red-900/30">
              <div className="flex items-center gap-3 mb-6">
                <LogOut className="w-5 h-5 text-red-500" />
                <h2 className="text-lg font-semibold">Sign Out</h2>
              </div>
              <p className="text-sm text-gray-400 mb-4">Sign out from your account on this device.</p>
              <button
                onClick={handleSignOut}
                disabled={signingOut}
                className="w-full px-4 py-3 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 disabled:from-gray-700 disabled:to-gray-700 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2 disabled:cursor-not-allowed shadow-lg hover:shadow-red-600/30"
              >
                <LogOut className="w-4 h-4" />
                {signingOut ? 'Signing out...' : 'Sign Out'}
              </button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Password Change Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl shadow-2xl max-w-md w-full p-6 border border-gray-700">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold flex items-center gap-2">
                <Lock className="w-5 h-5 text-blue-500" />
                Change Password
              </h3>
              <button
                onClick={() => {
                  setShowPasswordModal(false);
                  setPasswordError(null);
                  setNewPassword('');
                  setConfirmPassword('');
                }}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">New Password</label>
                <input
                  type="password"
                  placeholder="Enter new password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm text-gray-400 mb-2">Confirm Password</label>
                <input
                  type="password"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              {passwordError && (
                <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-3 flex items-start gap-2">
                  <X className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-200">{passwordError}</p>
                </div>
              )}
              
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => {
                    setShowPasswordModal(false);
                    setPasswordError(null);
                    setNewPassword('');
                    setConfirmPassword('');
                  }}
                  className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePasswordChange}
                  disabled={changingPassword || !newPassword || !confirmPassword}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  {changingPassword && <Loader2 className="w-4 h-4 animate-spin" />}
                  {changingPassword ? 'Changing...' : 'Change Password'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </TeacherShell>
  );
}
