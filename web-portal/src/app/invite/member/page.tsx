/**
 * Member Invite Landing Page
 * Handles invite codes for joining organizations as members
 */
'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.edudashpro';
const APP_STORE_URL = 'https://apps.apple.com/app/edudash-pro/id6478437234';
const APP_SCHEME = 'edudashpro';

function MemberInviteContent() {
  const searchParams = useSearchParams();
  const code = searchParams.get('code') || '';
  
  const [platform, setPlatform] = useState<'ios' | 'android' | 'desktop'>('desktop');
  const [hasNativeApp, setHasNativeApp] = useState(false);
  const [attemptedOpen, setAttemptedOpen] = useState(false);

  useEffect(() => {
    // Detect platform
    const ua = navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(ua)) {
      setPlatform('ios');
    } else if (/android/.test(ua)) {
      setPlatform('android');
    } else {
      setPlatform('desktop');
    }

    // Check if native app is installed using getInstalledRelatedApps API
    checkNativeApp();
  }, []);

  const checkNativeApp = async () => {
    try {
      if ('getInstalledRelatedApps' in navigator) {
        const relatedApps = await (navigator as any).getInstalledRelatedApps();
        if (relatedApps.length > 0) {
          setHasNativeApp(true);
        }
      }
    } catch (e) {
      console.log('Could not check for installed apps:', e);
    }
  };

  const openInApp = () => {
    setAttemptedOpen(true);
    const deepLink = `${APP_SCHEME}:///invite/member?code=${encodeURIComponent(code)}`;
    
    // Try to open the app
    const start = Date.now();
    let didNavigate = false;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        didNavigate = true;
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Attempt to open the app
    window.location.href = deepLink;

    // Fallback after timeout
    setTimeout(() => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      const elapsed = Date.now() - start;
      
      // If the page is still visible after 1.5s, app probably isn't installed
      if (!didNavigate && elapsed < 2000) {
        // Don't auto-redirect, let user choose
      }
    }, 1500);
  };

  const getStoreUrl = () => {
    return platform === 'ios' ? APP_STORE_URL : PLAY_STORE_URL;
  };

  const getStoreName = () => {
    return platform === 'ios' ? 'App Store' : 'Google Play';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Card */}
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-8 shadow-2xl">
          {/* Logo/Icon */}
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <svg className="w-12 h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold text-white text-center mb-2">
            You&apos;ve Been Invited!
          </h1>
          <p className="text-slate-400 text-center mb-6">
            Join the SOA Youth Wing community
          </p>

          {/* Invite Code Display */}
          {code && (
            <div className="bg-slate-700/50 rounded-xl p-4 mb-6">
              <p className="text-slate-400 text-sm text-center mb-1">Your Invite Code</p>
              <p className="text-2xl font-mono font-bold text-emerald-400 text-center tracking-wider">
                {code}
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-3">
            {/* Open in App Button */}
            <button
              onClick={openInApp}
              className="w-full py-4 px-6 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-semibold rounded-xl transition-all duration-200 flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              Open in App
            </button>

            {/* Download App Button */}
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

            {/* Desktop message */}
            {platform === 'desktop' && (
              <div className="text-center py-4">
                <p className="text-slate-400 text-sm mb-3">
                  Scan this QR code with your phone to download the app
                </p>
                <div className="flex justify-center gap-4">
                  <a
                    href={PLAY_STORE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg transition-all"
                  >
                    Google Play
                  </a>
                  <a
                    href={APP_STORE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg transition-all"
                  >
                    App Store
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* Instructions */}
          <div className="mt-6 pt-6 border-t border-slate-700">
            <h3 className="text-white font-medium mb-3">How to join:</h3>
            <ol className="text-slate-400 text-sm space-y-2">
              <li className="flex gap-2">
                <span className="text-emerald-400 font-bold">1.</span>
                Download the EduDash Pro app
              </li>
              <li className="flex gap-2">
                <span className="text-emerald-400 font-bold">2.</span>
                Create an account or sign in
              </li>
              <li className="flex gap-2">
                <span className="text-emerald-400 font-bold">3.</span>
                Enter invite code: <span className="font-mono text-emerald-400">{code || 'XXXXXX'}</span>
              </li>
              <li className="flex gap-2">
                <span className="text-emerald-400 font-bold">4.</span>
                Complete your registration
              </li>
            </ol>
          </div>
        </div>

        {/* Footer */}
        <p className="text-slate-500 text-sm text-center mt-6">
          © {new Date().getFullYear()} EduDash Pro. All rights reserved.
        </p>
      </div>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
    </div>
  );
}

export default function MemberInvitePage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <MemberInviteContent />
    </Suspense>
  );
}
