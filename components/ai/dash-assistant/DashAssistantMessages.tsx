import React from 'react';
import { Platform, View, Text, StyleSheet, ViewStyle } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import TutorHome from './TutorHome';
import { ParentDashHome, type ParentChild } from './ParentDashHome';

type LearnerContext = {
  learnerName?: string | null;
  grade?: string | null;
  ageBand?: string | null;
  schoolType?: string | null;
  role?: string | null;
};

export interface DashAssistantMessagesProps {
  flashListRef: any;
  messages: any[];
  renderMessage: (item: any, index: number) => React.ReactElement | null;
  styles: any;
  theme: any;
  isLoading: boolean;
  keyboardVisible?: boolean;
  isNearBottom: boolean;
  setIsNearBottom: (v: boolean) => void;
  unreadCount: number;
  setUnreadCount: (n: number) => void;
  bottomScrollRequestId?: number;
  scrollToBottom: (opts: { animated?: boolean; delay?: number; force?: boolean }) => void;
  renderSuggestedActions: () => React.ReactElement | null;
  onSendMessage?: (text: string) => void;
  onAgeBandChange?: (ageBand: string) => void;
  learnerContext?: LearnerContext | null;
  bottomInset?: number;
  onScroll?: (scrollY: number) => void;
  compactBottomPadding?: boolean;
  webScrollNodeRef?: { current: any };
  /** Parent-specific: list of children */
  parentChildren?: ParentChild[];
  /** Parent-specific: currently selected child */
  activeChild?: ParentChild | null;
  /** Parent-specific: switch active child */
  onSelectChild?: (childId: string) => void;
  /** Parent-specific: open homework scanner */
  onOpenScanner?: () => void;
  /** Last conversation ID for resume link */
  lastConversationId?: string | null;
  /** Actual user role from profile (not learnerContext which may be overridden) */
  userRole?: string | null;
  /** Explicit tutor mode from route/session bootstrap */
  tutorMode?: string | null;
}

export const DashAssistantMessages: React.FC<DashAssistantMessagesProps> = ({
  flashListRef,
  messages,
  renderMessage,
  styles,
  theme,
  isLoading,
  isNearBottom,
  setIsNearBottom,
  setUnreadCount,
  bottomScrollRequestId,
  scrollToBottom,
  renderSuggestedActions,
  onSendMessage,
  onAgeBandChange,
  learnerContext,
  onScroll,
  compactBottomPadding = false,
  bottomInset = 0,
  keyboardVisible = false,
  parentChildren,
  activeChild,
  onSelectChild,
  onOpenScanner,
  lastConversationId,
  userRole,
  tutorMode,
  webScrollNodeRef,
}) => {
  const contentHeightRef = React.useRef(0);
  const lastAutoScrollAtRef = React.useRef(0);
  const forceAlignUntilRef = React.useRef(0);
  const lastBottomScrollRequestRef = React.useRef(0);
  const forceAlignTimersRef = React.useRef<Array<ReturnType<typeof setTimeout>>>([]);
  // True when user deliberately scrolled away from bottom mid-stream.
  // Prevents bottomScrollRequestId effect from re-hijacking the viewport.
  const userScrolledAwayRef = React.useRef(false);
  const getTutorPhase = (message: any) => {
    const explicitPhase = message?.metadata?.tutor_phase || message?.metadata?.phase;
    if (explicitPhase) {
      return String(explicitPhase);
    }
    const content = (message?.content || '').toLowerCase();
    if (!content) return null;
    if (/(quiz|practice|exercise|try it|solve|work through)/.test(content)) {
      return 'Practice';
    }
    if (/(diagnose|check in|quick check|question|assess)/.test(content) || (content.endsWith('?') && content.length < 180)) {
      return 'Diagnose';
    }
    if (/(explain|example|step|here's how|why this works)/.test(content)) {
      return 'Teach';
    }
    return null;
  };

  const currentPhase = React.useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg?.type === 'assistant') {
        return getTutorPhase(msg);
      }
    }
    return null;
  }, [messages]);

  const phaseOrder = ['Diagnose', 'Teach', 'Practice'];
  const phaseIndex = currentPhase ? phaseOrder.indexOf(currentPhase) : -1;
  
  // Only show phase indicator for student/learner roles in tutoring context
  // Parents and staff don't need clinical Diagnose→Teach→Practice labels
  const showPhaseIndicator = React.useMemo(() => {
    const role = (userRole || learnerContext?.role || '').toLowerCase();
    return ['student', 'learner'].includes(role);
  }, [userRole, learnerContext?.role]);

  // Use actual profile role — learnerContext.role is 'student' for parents with children
  const isParent = (userRole || learnerContext?.role || '').toLowerCase() === 'parent';

  const renderEmptyState = () => {
    // Parents always get the #NEXT-GEN ParentDashHome — with or without children
    if (isParent) {
      return (
        <ParentDashHome
          children={parentChildren || []}
          activeChild={activeChild ?? null}
          onSelectChild={onSelectChild || (() => {})}
          onSendMessage={onSendMessage || (() => {})}
          onOpenScanner={onOpenScanner}
          lastConversationId={lastConversationId}
        />
      );
    }

    // All other roles get the standard TutorHome
    return (
      <TutorHome
        styles={styles}
        theme={theme}
        onSendMessage={onSendMessage}
        onAgeBandChange={onAgeBandChange}
        learnerContext={learnerContext}
      />
    );
  };

  const listStyle = StyleSheet.flatten([
    styles.messagesContainer,
    { backgroundColor: 'transparent' },
  ]) as ViewStyle;
  const listContentStyle = StyleSheet.flatten([
    styles.messagesContent,
    {
      backgroundColor: 'transparent',
      flexGrow: 1,
      paddingBottom: compactBottomPadding
        ? Math.max(8, (styles.messagesContent?.paddingBottom || 0))
        : Math.max(
            keyboardVisible ? 80 : 104,
            (styles.messagesContent?.paddingBottom || 0) + bottomInset + 16
          ),
    },
  ]) as ViewStyle;

  React.useEffect(() => () => {
    if (forceAlignTimersRef.current.length > 0) {
      forceAlignTimersRef.current.forEach((timer) => clearTimeout(timer));
      forceAlignTimersRef.current = [];
    }
  }, []);

  React.useEffect(() => {
    if (!bottomScrollRequestId) return;
    if (bottomScrollRequestId === lastBottomScrollRequestRef.current) return;

    lastBottomScrollRequestRef.current = bottomScrollRequestId;

    // Don't force-scroll if the user deliberately scrolled away during streaming.
    if (userScrolledAwayRef.current) return;

    forceAlignUntilRef.current = Date.now() + 1800;

    if (forceAlignTimersRef.current.length > 0) {
      forceAlignTimersRef.current.forEach((timer) => clearTimeout(timer));
      forceAlignTimersRef.current = [];
    }

    scrollToBottom({ animated: false, delay: 0 });

    [60, 220, 480].forEach((timeoutMs) => {
      const timer = setTimeout(() => {
        scrollToBottom({ animated: false, delay: 0 });
      }, timeoutMs);
      forceAlignTimersRef.current.push(timer);
    });
  }, [bottomScrollRequestId, scrollToBottom]);

  return (
    <FlashList
      ref={flashListRef}
      data={messages}
      keyExtractor={(item: any, index: number) => item.id || `msg-${index}`}
      renderItem={({ item, index }) => renderMessage(item, index)}
      estimatedItemSize={220}
      style={listStyle}
      contentContainerStyle={listContentStyle}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      removeClippedSubviews={false}
      onScroll={(e: any) => {
        try {
          const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent as any;
          const currentScrollY = contentOffset.y;

          // Cache the actual DOM scroll container on first scroll (web only)
          if (Platform.OS === 'web' && webScrollNodeRef && !webScrollNodeRef.current) {
            try {
              const target = e.nativeEvent?.target ?? e.nativeEvent?.currentTarget;
              if (target?.scrollHeight !== undefined) {
                webScrollNodeRef.current = target;
              }
            } catch {}
          }

          // Call parent scroll handler for header auto-hide
          if (onScroll) {
            onScroll(currentScrollY);
          }
          
          const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
          const near = distanceFromBottom <= 200;
          if (near !== isNearBottom) {
            setIsNearBottom(near);
            if (near) {
              setUnreadCount(0);
              userScrolledAwayRef.current = false;
            } else {
              // User deliberately scrolled up — cancel any pending force-align window
              // so onContentSizeChange and bottomScrollRequestId effect don't spring them back.
              userScrolledAwayRef.current = true;
              forceAlignUntilRef.current = 0;
              if (forceAlignTimersRef.current.length > 0) {
                forceAlignTimersRef.current.forEach((t) => clearTimeout(t));
                forceAlignTimersRef.current = [];
              }
            }
          }
        } catch {}
      }}
      scrollEventThrottle={16}
      onContentSizeChange={(_width: number, height: number) => {
        const previousHeight = contentHeightRef.current;
        contentHeightRef.current = height;
        const forceAligning = Date.now() < forceAlignUntilRef.current;

        // Keep the viewport stable when the user is reading older messages.
        if (!isNearBottom && !forceAligning) return;
        if (Math.abs(height - previousHeight) < 6) return;

        const now = Date.now();
        if (now - lastAutoScrollAtRef.current < 220) return;
        lastAutoScrollAtRef.current = now;
        scrollToBottom({ animated: !isLoading && !forceAligning, delay: 0, force: forceAligning });
      }}
      onLoad={() => {
        if (messages.length === 0) return;
        requestAnimationFrame(() => {
          scrollToBottom({ animated: false, delay: 0, force: true });
        });
      }}
      ListHeaderComponent={
        messages.length > 0 ? (
          <View style={{ gap: 8 }}>
            {showPhaseIndicator && (
              <View style={[styles.phaseRailContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={[styles.phaseRailTrack, { backgroundColor: theme.border }]} />
                {phaseOrder.map((phase, index) => {
                  const active = index === phaseIndex;
                  const completed = phaseIndex >= 0 && index < phaseIndex;
                  const dotColor = active ? theme.primary : completed ? theme.primary : theme.border;
                  const labelColor = active ? theme.primary : completed ? theme.text : theme.textTertiary;
                  return (
                    <View key={phase} style={styles.phaseRailStep}>
                      <View style={[styles.phaseRailDot, { backgroundColor: dotColor }]} />
                      <Text style={[styles.phaseRailLabel, { color: labelColor }]}>{phase}</Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        ) : null
      }
      ListEmptyComponent={messages.length === 0 ? renderEmptyState : null}
      ListFooterComponent={
        <>
          {renderSuggestedActions()}
          {Platform.OS === 'web' && (
            <View nativeID="dash-scroll-sentinel" style={{ height: 1 }} />
          )}
        </>
      }
    />
  );
};

export default DashAssistantMessages;
