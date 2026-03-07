/**
 * Teacher Invite Landing Page
 * Handles token + email invites for teachers
 */
'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { setPendingTeacherInvite } from '@/lib/utils/pendingTeacherInvite';

const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.edudashpro';
const APP_STORE_URL = 'https://apps.apple.com/app/edudash-pro/id6478437234';
const APP_SCHEME = 'edudashpro';

function TeacherInviteContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const email = searchParams.get('email') || '';
  const [platform, setPlatform] = useState<'ios' | 'android' | 'desktop'>('desktop');
  const [copied, setCopied] = useState<'token' | 'email' | 'link' | null>(null);

  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(ua)) {
      setPlatform('ios');
    } else if (/android/.test(ua)) {
      setPlatform('android');
    } else {
      setPlatform('desktop');
    }
  }, []);

  const openInApp = () => {
    const deepLink = `${APP_SCHEME}:///screens/teacher-invite-accept?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
    const handleVisibilityChange = () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.location.href = deepLink;
    setTimeout(() => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, 1500);
  };

  const handleSignIn = () => {
    if (token && email) {
      setPendingTeacherInvite({ token, email });
    }
    const query = new URLSearchParams();
    if (email) query.set('email', email);
    window.location.href = `/sign-in${query.toString() ? `?${query.toString()}` : ''}`;
  };

  const handleSignUp = () => {
    if (token && email) {
      setPendingTeacherInvite({ token, email });
    }
    const query = new URLSearchParams();
    if (email) query.set('email', email);
    window.location.href = `/sign-up/teacher${query.toString() ? `?${query.toString()}` : ''}`;
  };

  const copyToClipboard = async (value: string, type: 'token' | 'email' | 'link') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(type);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied(null);
    }
  };

  const getStoreUrl = () => platform === 'ios' ? APP_STORE_URL : PLAY_STORE_URL;
  const getStoreName = () => platform === 'ios' ? 'App Store' : 'Google Play';
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const inviteLink = `${origin}/invite/teacher?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-cyan-500/30 p-8 shadow-2xl">
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
              <svg className="w-12 h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
          </div>

          <h1 className="text-2xl font-bold text-white text-center mb-2">
            Teacher Invitation
          </h1>
          <p className="text-slate-400 text-center mb-6">
            Accept your invite to join a school on EduDash Pro.
          </p>

          {(token || email) && (
            <div className="bg-slate-700/40 rounded-xl p-4 mb-6 space-y-3">
              <div>
                <p className="text-slate-400 text-xs uppercase tracking-widest">Invite Token</p>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-cyan-300 font-mono text-sm break-all">{token || 'Missing token'}</p>
                  <button
                    onClick={() => copyToClipboard(token, 'token')}
                    className="px-3 py-1 text-xs rounded-full bg-slate-600/70 text-white hover:bg-slate-600 transition"
                  >
                    {copied === 'token' ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
              <div>
                <p className="text-slate-400 text-xs uppercase tracking-widest">Email</p>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-cyan-300 text-sm break-all">{email || 'Missing email'}</p>
                  <button
                    onClick={() => copyToClipboard(email, 'email')}
                    className="px-3 py-1 text-xs rounded-full bg-slate-600/70 text-white hover:bg-slate-600 transition"
                  >
                    {copied === 'email' ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
              <div>
                <button
                  onClick={() => copyToClipboard(inviteLink, 'link')}
                  className="w-full py-2 text-xs rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-700 transition"
                >
                  {copied === 'link' ? 'Invite Link Copied' : 'Copy Invite Link'}
                </button>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <button
              onClick={openInApp}
              className="w-full py-4 px-6 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-semibold rounded-xl transition-all duration-200 flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              Open in App
            </button>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={handleSignIn}
                className="w-full py-3 px-4 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-xl transition-all duration-200"
              >
                Sign In
              </button>
              <button
                onClick={handleSignUp}
                className="w-full py-3 px-4 border border-slate-600 text-slate-200 hover:bg-slate-700 font-semibold rounded-xl transition-all duration-200"
              >
                Create Account
              </button>
            </div>

            {platform !== 'desktop' && (
              <a
                href={getStoreUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-4 px-6 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-xl transition-all duration-200 flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download from {getStoreName()}
              </a>
            )}

            {platform === 'desktop' && (
              <div className="text-center py-4">
                <p className="text-slate-400 text-sm mb-3">
                  Install the app on your phone to accept this invite.
                </p>
                <div className="flex justify-center gap-4">
                  <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg transition-all">
                    Google Play
                  </a>
                  <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg transition-all">
                    App Store
                  </a>
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 pt-6 border-t border-slate-700">
            <h3 className="text-white font-medium mb-3">How to accept:</h3>
            <ol className="text-slate-400 text-sm space-y-2">
              <li className="flex gap-2">
                <span className="text-cyan-400 font-bold">1.</span>
                Open EduDash Pro on your phone
              </li>
              <li className="flex gap-2">
                <span className="text-cyan-400 font-bold">2.</span>
                Sign in or create a teacher account
              </li>
              <li className="flex gap-2">
                <span className="text-cyan-400 font-bold">3.</span>
                Paste your invite token to accept the invite
              </li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500"></div>
    </div>
  );
}

export default function TeacherInvitePage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <TeacherInviteContent />
    </Suspense>
  );
}
