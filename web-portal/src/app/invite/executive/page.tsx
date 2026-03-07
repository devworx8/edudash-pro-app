/**
 * Executive Invite Landing Page
 * Handles invite codes for executive/office positions
 */
'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.edudashpro';
const APP_STORE_URL = 'https://apps.apple.com/app/edudash-pro/id6478437234';
const APP_SCHEME = 'edudashpro';

function ExecutiveInviteContent() {
  const searchParams = useSearchParams();
  const code = searchParams.get('code') || '';
  
  const [platform, setPlatform] = useState<'ios' | 'android' | 'desktop'>('desktop');

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
    const deepLink = `${APP_SCHEME}:///invite/executive?code=${encodeURIComponent(code)}`;
    
    const handleVisibilityChange = () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.location.href = deepLink;

    setTimeout(() => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, 1500);
  };

  const getStoreUrl = () => platform === 'ios' ? APP_STORE_URL : PLAY_STORE_URL;
  const getStoreName = () => platform === 'ios' ? 'App Store' : 'Google Play';

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-slate-900 to-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-purple-500/30 p-8 shadow-2xl">
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center">
              <svg className="w-12 h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
              </svg>
            </div>
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold text-white text-center mb-2">
            🌟 Executive Invitation
          </h1>
          <p className="text-slate-400 text-center mb-6">
            You&apos;ve been selected for a leadership position
          </p>

          {/* Invite Code */}
          {code && (
            <div className="bg-purple-900/30 border border-purple-500/30 rounded-xl p-4 mb-6">
              <p className="text-purple-300 text-sm text-center mb-1">Executive Invite Code</p>
              <p className="text-2xl font-mono font-bold text-purple-400 text-center tracking-wider">
                {code}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-3">
            <button
              onClick={openInApp}
              className="w-full py-4 px-6 bg-gradient-to-r from-purple-500 to-violet-600 hover:from-purple-600 hover:to-violet-700 text-white font-semibold rounded-xl transition-all duration-200 flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              Accept in App
            </button>

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
                  Download the app to accept this invitation
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

          {/* Instructions */}
          <div className="mt-6 pt-6 border-t border-slate-700">
            <h3 className="text-white font-medium mb-3">To accept this position:</h3>
            <ol className="text-slate-400 text-sm space-y-2">
              <li className="flex gap-2">
                <span className="text-purple-400 font-bold">1.</span>
                Download the EduDash Pro app
              </li>
              <li className="flex gap-2">
                <span className="text-purple-400 font-bold">2.</span>
                Sign in to your account
              </li>
              <li className="flex gap-2">
                <span className="text-purple-400 font-bold">3.</span>
                Enter code: <span className="font-mono text-purple-400">{code || 'EX-XXXXXX'}</span>
              </li>
              <li className="flex gap-2">
                <span className="text-purple-400 font-bold">4.</span>
                Confirm your appointment
              </li>
            </ol>
          </div>
        </div>

        <p className="text-slate-500 text-sm text-center mt-6">
          © {new Date().getFullYear()} EduDash Pro. All rights reserved.
        </p>
      </div>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-slate-900 to-slate-900 flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
    </div>
  );
}

export default function ExecutiveInvitePage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ExecutiveInviteContent />
    </Suspense>
  );
}
