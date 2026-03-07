/**
 * Lazy-loaded component exports for better code splitting
 * Import these instead of direct imports to improve initial load time
 */

import { Suspense, lazy } from 'react';

// Loading fallbacks
export const DashboardSkeleton = () => (
  <div className="animate-pulse space-y-4 p-6">
    <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="h-32 bg-gray-200 dark:bg-gray-700 rounded"></div>
      ))}
    </div>
  </div>
);

export const ExamSkeleton = () => (
  <div className="animate-pulse space-y-4 p-6">
    <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded"></div>
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-24 bg-gray-200 dark:bg-gray-700 rounded"></div>
      ))}
    </div>
  </div>
);

// Lazy-loaded dashboard components
export const LazyExamPrepWidget = lazy(() => 
  import('@/components/dashboard/exam-prep/ExamPrepWidget').then(m => ({ default: m.ExamPrepWidget }))
);

export const LazyExamInteractiveView = lazy(() =>
  import('@/components/dashboard/exam-prep/ExamInteractiveView').then(m => ({ default: m.ExamInteractiveView }))
);

export const LazyConversationalExamBuilder = lazy(() =>
  import('@/components/dashboard/exam-prep/ConversationalExamBuilder').then(m => ({ default: m.ConversationalExamBuilder }))
);

export const LazyDashChat = lazy(() =>
  import('@/components/dash-chat/ChatInterface').then(m => ({ default: m.ChatInterface }))
);

export const LazySuperAdminDashboard = lazy(() =>
  import('@/components/admin/SuperAdminDashboard')
);

// Wrapper components with Suspense
export function ExamPrepWidgetLazy(props: any) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <LazyExamPrepWidget {...props} />
    </Suspense>
  );
}

export function ExamInteractiveViewLazy(props: any) {
  return (
    <Suspense fallback={<ExamSkeleton />}>
      <LazyExamInteractiveView {...props} />
    </Suspense>
  );
}

export function ConversationalExamBuilderLazy(props: any) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <LazyConversationalExamBuilder {...props} />
    </Suspense>
  );
}

export function DashChatLazy(props: any) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <LazyDashChat {...props} />
    </Suspense>
  );
}

export function SuperAdminDashboardLazy(props: any) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <LazySuperAdminDashboard {...props} />
    </Suspense>
  );
}
