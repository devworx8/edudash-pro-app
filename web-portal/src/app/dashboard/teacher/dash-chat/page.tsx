'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useTenantSlug } from '@/lib/tenant/useTenantSlug';
import { TeacherShell } from '@/components/dashboard/teacher/TeacherShell';
import { ChatInterface } from '@/components/dash-chat/ChatInterface';
import { ConversationList } from '@/components/dash-chat/ConversationList';
import { QuotaProgress } from '@/components/dash-chat/QuotaProgress';
import { ArrowLeft, Sparkles, Menu, X } from 'lucide-react';

export default function TeacherDashChatPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState<string>('');
  const [userId, setUserId] = useState<string>();
  const { slug } = useTenantSlug(userId);
  const [activeConversationId, setActiveConversationId] = useState<string>('');
  const [showSidebar, setShowSidebar] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [quotaRefreshTrigger, setQuotaRefreshTrigger] = useState(0);

  // Keyboard navigation - Escape to close sidebar
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showSidebar && isMobile) {
        setShowSidebar(false);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [showSidebar, isMobile]);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { 
        router.push('/sign-in'); 
        return; 
      }
      setEmail(session.user.email || '');
      setUserId(session.user.id);
      
      if (!activeConversationId) {
        setActiveConversationId(`dash_conv_${Date.now()}_${Math.random().toString(36).substring(7)}`);
      }
    })();
  }, [router, supabase.auth]);

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) setShowSidebar(false);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleNewConversation = () => {
    const newId = `dash_conv_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    setActiveConversationId(newId);
    if (isMobile) setShowSidebar(false);
  };

  const handleSelectConversation = (conversationId: string) => {
    setActiveConversationId(conversationId);
    if (isMobile) setShowSidebar(false);
  };

  return (
    <TeacherShell 
      tenantSlug={slug} 
      userEmail={email} 
      hideHeader={true}
      contentClassName="content-fullscreen"
    >
      <div className="h-[100dvh] flex flex-col bg-gray-950" style={{ overflow: 'hidden' }}>
        <header className="px-3 sm:px-5 py-3 sm:py-4 border-b border-gray-800 bg-gradient-to-r from-gray-950 via-gray-900 to-gray-950 flex items-center justify-between gap-2 sm:gap-4 flex-shrink-0 z-20 shadow-lg shadow-purple-900/10">
          {/* Left section - Back button and Menu button on mobile */}
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            <button
              onClick={() => router.push('/dashboard/teacher')}
              aria-label="Go back to dashboard"
              className="inline-flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 bg-gray-800/80 hover:bg-gray-700 border border-gray-700 rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-purple-500 active:scale-95"
            >
              <ArrowLeft size={18} aria-hidden="true" />
            </button>
            {isMobile && (
              <button
                onClick={() => setShowSidebar(!showSidebar)}
                aria-label={showSidebar ? 'Close conversations' : 'Open conversations'}
                aria-expanded={showSidebar}
                aria-controls="conversations-sidebar"
                className="inline-flex items-center justify-center w-9 h-9 bg-gray-800/80 hover:bg-gray-700 border border-gray-700 rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-purple-500 active:scale-95"
              >
                {showSidebar ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
              </button>
            )}
          </div>

          {/* Center section - Logo and title */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-purple-600 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/30 ring-2 ring-purple-400/20 flex-shrink-0">
              <Sparkles size={isMobile ? 18 : 20} color="white" aria-hidden="true" className="drop-shadow-md" />
            </div>
            <div className="min-w-0 hidden xs:block">
              <h1 className="m-0 text-base sm:text-lg font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent truncate">Dash AI</h1>
              <p className="m-0 text-[10px] sm:text-xs text-gray-400 font-medium hidden sm:block">
                Teaching Assistant
              </p>
            </div>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Right section - New Chat button */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleNewConversation}
              aria-label="Start new conversation"
              className="px-2.5 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold rounded-xl inline-flex items-center gap-1.5 sm:gap-2 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white transition-all duration-200 shadow-lg shadow-purple-600/30 hover:shadow-xl hover:shadow-purple-600/40 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-offset-2 focus:ring-offset-gray-950"
            >
              <Sparkles size={isMobile ? 14 : 16} aria-hidden="true" />
              <span className="hidden xs:inline">New</span>
              <span className="hidden sm:inline">Chat</span>
            </button>
          </div>
        </header>

        {/* Quota Progress Bar */}
        <div className="flex-shrink-0">
          {userId && <QuotaProgress userId={userId} refreshTrigger={quotaRefreshTrigger} />}
        </div>

        <div className="flex flex-1 min-h-0" style={{ overflow: 'hidden' }}>
          <aside
            id="conversations-sidebar"
            className={`
              ${showSidebar && isMobile ? 'w-[85%] max-w-[320px]' : 'w-0'} md:w-80
              border-r border-gray-800
              flex-shrink-0
              ${isMobile ? 'absolute z-20 h-full shadow-2xl shadow-black/50' : 'relative'}
              bg-gradient-to-b from-gray-950 to-gray-900
            `}
            style={{ overflow: 'hidden' }}
          >
            {(!isMobile || showSidebar) && (
              <ConversationList
                activeConversationId={activeConversationId}
                onSelectConversation={handleSelectConversation}
                onNewConversation={handleNewConversation}
              />
            )}
          </aside>

          <main className="flex-1 flex flex-col" style={{ overflow: 'hidden' }}>
            <ChatInterface
              scope="teacher"
              conversationId={activeConversationId}
              userId={userId}
              onMessageSent={() => setQuotaRefreshTrigger(prev => prev + 1)}
              showTutorPanel={false}
            />
          </main>
        </div>

        {isMobile && showSidebar && (
          <div
            onClick={() => setShowSidebar(false)}
            onKeyDown={(e) => e.key === 'Enter' && setShowSidebar(false)}
            role="button"
            tabIndex={0}
            aria-label="Close sidebar overlay"
            className="fixed inset-0 bg-black/60 z-[15]"
          />
        )}
      </div>
    </TeacherShell>
  );
}
