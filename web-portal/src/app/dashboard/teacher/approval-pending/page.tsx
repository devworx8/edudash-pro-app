'use client';

/**
 * Teacher Approval Pending Page (Web)
 *
 * Shown when a teacher's approval status is 'pending' or 'rejected'.
 * Mirrors the native teacher-approval-pending screen.
 */

import { useSearchParams, useRouter } from 'next/navigation';
import { Clock, XCircle, ArrowLeft, Mail } from 'lucide-react';
import { Suspense } from 'react';

function ApprovalPendingContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const state = searchParams.get('state');
  const isRejected = state === 'rejected';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 text-center">
        {/* Icon */}
        <div className={`w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center ${
          isRejected ? 'bg-red-500/20' : 'bg-amber-500/20'
        }`}>
          {isRejected ? (
            <XCircle className="w-10 h-10 text-red-400" />
          ) : (
            <Clock className="w-10 h-10 text-amber-400" />
          )}
        </div>

        {/* Title */}
        <h1 className={`text-2xl font-bold mb-3 ${
          isRejected ? 'text-red-300' : 'text-amber-300'
        }`}>
          {isRejected ? 'Access Not Approved' : 'Approval Pending'}
        </h1>

        {/* Description */}
        <p className="text-slate-300 mb-6 leading-relaxed">
          {isRejected
            ? 'Your request to join this school has not been approved by the principal. Please contact your school administrator for more information.'
            : 'Your account is awaiting approval from the school principal. You\'ll receive a notification once your access has been approved.'}
        </p>

        {/* Status indicator */}
        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium mb-8 ${
          isRejected
            ? 'bg-red-500/10 text-red-400 border border-red-500/20'
            : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
        }`}>
          <span className={`w-2 h-2 rounded-full ${
            isRejected ? 'bg-red-400' : 'bg-amber-400 animate-pulse'
          }`} />
          {isRejected ? 'Not Approved' : 'Waiting for Approval'}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <button
            onClick={() => router.push('/sign-in')}
            className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-white/10 hover:bg-white/15 text-white rounded-xl transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Sign In with Different Account
          </button>
          <a
            href="mailto:support@edudashpro.org.za"
            className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl transition-colors"
          >
            <Mail className="w-4 h-4" />
            Contact Support
          </a>
        </div>
      </div>
    </div>
  );
}

export default function TeacherApprovalPendingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-slate-400">Loading...</p>
      </div>
    }>
      <ApprovalPendingContent />
    </Suspense>
  );
}
