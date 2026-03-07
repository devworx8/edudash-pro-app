'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useTenantSlug } from '@/lib/tenant/useTenantSlug';
import { ParentShell } from '@/components/dashboard/parent/ParentShell';
import { ChatInterface } from '@/components/dash-chat/ChatInterface';
import { ConversationList } from '@/components/dash-chat/ConversationList';
import { ExamBuilderLauncher } from '@/components/dash-chat/ExamBuilderLauncher';
import { QuotaProgress } from '@/components/dash-chat/QuotaProgress';
import { useChildrenData } from '@/lib/hooks/parent/useChildrenData';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { getGradeNumber, isExamEligibleChild } from '@/lib/utils/gradeUtils';
import { calculateAgeOnDate } from '@/lib/utils/dateUtils';
import { Sparkles, Menu, X, FileText } from 'lucide-react';

// Format school name for display
function formatSchoolName(slug: string | null): string {
  if (!slug) return 'EduDash Pro';
  if (slug === 'edudash-pro-community-school') return 'EduDash Pro Community School';
  return slug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function DashChatPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const [email, setEmail] = useState<string>('');
  const [userId, setUserId] = useState<string>();
  const { slug } = useTenantSlug(userId);
  const [activeConversationId, setActiveConversationId] = useState<string>('');
  const [showSidebar, setShowSidebar] = useState(false);
  const [showExamBuilder, setShowExamBuilder] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [quotaRefreshTrigger, setQuotaRefreshTrigger] = useState(0);
  const initialPrompt = searchParams.get('prompt') || '';
  const { childrenCards, activeChildId } = useChildrenData(userId || undefined);
  const { profile } = useUserProfile(userId);
  const activeChild = useMemo(
    () => childrenCards.find((child) => child.id === activeChildId),
    [childrenCards, activeChildId]
  );
  const childAgeYears = useMemo(() => {
    if (!activeChild?.dateOfBirth) return null;
    return calculateAgeOnDate(activeChild.dateOfBirth, new Date());
  }, [activeChild?.dateOfBirth]);
  const hasExamEligibleChild = useMemo(() => {
    if (!activeChild) return false;
    return isExamEligibleChild(activeChild.grade, activeChild.dateOfBirth);
  }, [activeChild]);
  const normalizedUsage = String(profile?.usageType || '').toLowerCase();
  const inferredPreschool = getGradeNumber(activeChild?.grade) < 1 || (typeof childAgeYears === 'number' && childAgeYears < 6);
  const isPreschoolContext = normalizedUsage === 'preschool' || inferredPreschool;
  const isEarlyLearner = isPreschoolContext || getGradeNumber(activeChild?.grade) < 4 || (typeof childAgeYears === 'number' && childAgeYears <= 6);
  const canUseExamBuilder = hasExamEligibleChild && !isPreschoolContext;
  const effectiveUsageType = isPreschoolContext ? 'preschool' : (profile?.usageType || null);

  // Keyboard navigation - Escape to close overlays
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showSidebar) setShowSidebar(false);
        if (showExamBuilder) setShowExamBuilder(false);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [showSidebar, showExamBuilder]);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/sign-in');
        return;
      }
      setEmail(session.user.email || '');
      setUserId(session.user.id);
    })();
  }, [router, supabase.auth]);

  // Hydration flag
  useEffect(() => { setHydrated(true); }, []);

  const handleNewConversation = () => {
    const newId = `dash_conv_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    setActiveConversationId(newId);
    setShowSidebar(false);
  };

  const handleSelectConversation = (conversationId: string) => {
    setActiveConversationId(conversationId);
    setShowSidebar(false);
  };

  useEffect(() => {
    if (initialPrompt && !activeConversationId) {
      handleNewConversation();
    }
  }, [initialPrompt, activeConversationId]);

  return (
    <ParentShell tenantSlug={formatSchoolName(slug)} userEmail={email}>
      {/* Full viewport height container - No scroll */}
      <div
        className="flex flex-col bg-gray-950 overflow-hidden relative"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          height: '100dvh',
          maxHeight: '100dvh',
          paddingLeft: 'var(--sidebar-w, 0px)'
        }}
      >
        {/* Header - Fixed below topnav, aligned with content */}
        <header className="flex-shrink-0 py-3 border-b border-gray-800 bg-gray-950 flex items-center justify-between gap-3 z-20" style={{
          marginTop: 'var(--topnav-offset, 56px)',
          paddingLeft: 'max(1rem, env(safe-area-inset-left))',
          paddingRight: 'max(1rem, env(safe-area-inset-right))',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)'
        }}>
          <div className="flex items-center gap-3">
            {/* Mobile/Tablet toggle button */}
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              aria-label={showSidebar ? 'Close conversations' : 'Open conversations'}
              aria-expanded={showSidebar}
              aria-controls="conversations-sidebar"
              className="inline-flex lg:hidden items-center bg-slate-900 hover:bg-slate-800 border border-gray-800 p-2 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              {showSidebar ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
            </button>

            <div className="flex items-center gap-3">
              <div className={`
                w-10 h-10
                rounded-full bg-gradient-to-br from-purple-600 to-pink-500
                flex items-center justify-center flex-shrink-0
              `}>
                <Sparkles size={22} color="white" aria-hidden="true" />
              </div>
              <div>
                <h1 className="m-0 text-lg font-bold">Dash</h1>
                <p className="m-0 text-xs text-gray-400">
                  AI Assistant • Multilingual • Context-aware
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {canUseExamBuilder && (
              <button
                onClick={() => setShowExamBuilder(true)}
                aria-label="Build full exam paper"
                className="px-3 md:px-4 py-1.5 md:py-2 text-[13px] md:text-sm font-semibold rounded-lg inline-flex items-center gap-1.5 bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600 text-white border-0 transition-all focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-950"
              >
                <FileText size={14} aria-hidden="true" />
                <span className="hidden md:inline">Build Full Exam (Printable)</span>
              </button>
            )}
            <button
              onClick={handleNewConversation}
              aria-label="Start new conversation"
              className="px-3 md:px-4 py-1.5 md:py-2 text-[13px] md:text-sm font-semibold rounded-lg inline-flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-950"
            >
              <Sparkles size={14} aria-hidden="true" />
              <span className="hidden md:inline">New Chat</span>
            </button>
          </div>
        </header>

        {/* Quota Progress Bar */}
        {userId && <QuotaProgress userId={userId} refreshTrigger={quotaRefreshTrigger} />}

        {/* Main Content - Takes remaining height */}
        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* Desktop Sidebar - Fixed position on desktop */}
          <aside
            id="conversations-sidebar"
            className="hidden lg:flex flex-col bg-gradient-to-b from-gray-950 to-gray-900 border-r border-gray-800 overflow-hidden"
            style={{
              position: 'fixed',
              left: 0,
              top: 'calc(var(--topnav-offset, 56px) + 57px)',
              bottom: 0,
              width: '280px',
              zIndex: 10
            }}
          >
            <ConversationList
              activeConversationId={activeConversationId}
              onSelectConversation={handleSelectConversation}
              onNewConversation={handleNewConversation}
            />
          </aside>

          {/* Mobile Sidebar Overlay */}
          {hydrated && showSidebar && (
            <>
              <div
                onClick={() => setShowSidebar(false)}
                onKeyDown={(e) => e.key === 'Enter' && setShowSidebar(false)}
                role="button"
                tabIndex={0}
                aria-label="Close sidebar overlay"
                className="fixed inset-0 bg-black/60 z-[999] lg:hidden"
              />
              <aside
                id="conversations-sidebar"
                className="fixed top-10 left-0 bottom-0 w-[85%] max-w-[320px] bg-gradient-to-b from-gray-950 to-gray-900 z-[1000] flex flex-col shadow-2xl shadow-black/50 lg:hidden"
              >
                <div className="p-4 border-b border-gray-800 flex items-center justify-between bg-gray-950/80 backdrop-blur-sm">
                  <h2 className="m-0 text-base font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">Conversations</h2>
                  <button
                    onClick={() => setShowSidebar(false)}
                    aria-label="Close conversations sidebar"
                    className="bg-gray-800 hover:bg-gray-700 border-0 p-2 cursor-pointer text-white rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <X size={20} aria-hidden="true" />
                  </button>
                </div>
                <ConversationList
                  activeConversationId={activeConversationId}
                  onSelectConversation={handleSelectConversation}
                  onNewConversation={handleNewConversation}
                />
              </aside>
            </>
          )}

          {/* Chat Area - Offset by sidebar on desktop */}
          <main className="flex-1 overflow-hidden flex flex-col relative" style={{
            marginLeft: 'var(--conversations-w, 0px)'
          }}>
            {hydrated && activeConversationId && (
              <ChatInterface
                scope="parent"
                conversationId={activeConversationId}
                userId={userId}
                onMessageSent={() => setQuotaRefreshTrigger(prev => prev + 1)}
                initialPrompt={initialPrompt || undefined}
                canUseExamBuilder={canUseExamBuilder}
                learnerContext={{
                  learnerName: activeChild ? `${activeChild.firstName} ${activeChild.lastName}`.trim() : null,
                  grade: activeChild?.grade || null,
                  ageYears: childAgeYears,
                  usageType: effectiveUsageType,
                  schoolType: effectiveUsageType,
                }}
              />
            )}

            {hydrated && !activeConversationId && (
              <div className="flex flex-1 items-center justify-center overflow-hidden">
                <div className="max-w-md w-full text-center flex flex-col items-center gap-3">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-600 to-pink-500 flex items-center justify-center mb-2">
                    <Sparkles size={32} aria-hidden="true" />
                  </div>
                  <h2 className="text-xl font-bold m-0">Start Your First Chat</h2>
                  <p className="text-sm text-gray-400 m-0 mb-2">
                    {isEarlyLearner
                      ? 'Ask Dash for play-based learning ideas, simple explanations, and age-appropriate practice.'
                      : canUseExamBuilder
                        ? 'Use Tutor Mode for one-question-at-a-time learning, or build a full CAPS-aligned formal exam paper.'
                        : 'Ask Dash anything about curriculum topics, multilingual support, or age-appropriate learning support.'}
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center w-full">
                    <button
                      onClick={handleNewConversation}
                      className="px-4 py-2 text-sm font-semibold rounded-lg inline-flex items-center justify-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-950"
                    >
                      <Sparkles size={16} aria-hidden="true" />
                      New Chat
                    </button>
                    {canUseExamBuilder && (
                      <button
                        onClick={() => setShowExamBuilder(true)}
                        className="px-4 py-2 text-sm font-semibold rounded-lg inline-flex items-center justify-center gap-1.5 bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600 text-white transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-950"
                      >
                        <FileText size={16} aria-hidden="true" />
                        Build Full Exam (Printable)
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
            
            {/* Exam Builder Modal */}
            {hydrated && showExamBuilder && canUseExamBuilder && (
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Exam builder"
                className="absolute inset-0 z-[100]"
              >
                <ExamBuilderLauncher onClose={() => setShowExamBuilder(false)} />
              </div>
            )}
          </main>
        </div>
      </div>
    </ParentShell>
  );
}

export default function DashChatPage() {
  return (
    <Suspense fallback={null}>
      <DashChatPageInner />
    </Suspense>
  );
}
