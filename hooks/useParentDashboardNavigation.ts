/**
 * useParentDashboardNavigation — Quick action routing
 * 
 * Extracts the handleQuickAction switch and handlePaymentsPress
 * from the parent dashboard for WARP compliance.
 * 
 * ≤170 lines — WARP-compliant hook.
 */

import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { track } from '@/lib/analytics';

interface NavigationParams {
  activeChild: any;
  children: any[];
  showAlert: (opts: {
    title: string;
    message?: string;
    type?: 'info' | 'warning' | 'success' | 'error';
  }) => void;
}

export function useParentDashboardNavigation({ activeChild, children, showAlert }: NavigationParams) {
  const { t } = useTranslation();

  const handlePaymentsPress = useCallback(() => {
    track('parent.dashboard.quick_action', { action: 'payments', layout: 'enhanced' });
    router.push('/screens/parent-payments');
  }, []);

  const handleQuickAction = useCallback((action: string) => {
    track('parent.dashboard.quick_action', { action, layout: 'enhanced' });

    switch (action) {
      case 'view_homework':
        router.push('/screens/homework');
        break;
      case 'daily_program':
        router.push('/screens/parent-daily-program');
        break;
      case 'weekly_menu':
        router.push('/screens/parent-menu');
        break;
      case 'stationery':
        router.push('/screens/parent-stationery');
        break;
      case 'assigned_lessons':
        router.push('/screens/parent-assigned-lessons');
        break;
      case 'check_attendance':
        router.push('/screens/parent-attendance');
        break;
      case 'view_grades':
        router.push('/screens/grades');
        break;
      case 'messages':
        router.push('/screens/parent-messages');
        break;
      case 'announcements':
        router.push('/screens/parent-announcements');
        break;
      case 'events':
        router.push('/screens/calendar');
        break;
      case 'ai_homework_help':
        router.push('/screens/ai-homework-helper');
        break;
      case 'ask_dash':
      case 'dash_tutor':
        router.push('/screens/dash-assistant');
        break;
      case 'dash_explain':
        router.push({ pathname: '/screens/dash-assistant', params: { initialMessage: t('parent.dash_explain_prompt', { defaultValue: 'Explain a concept to me in simple terms.' }) } });
        break;
      case 'dash_quiz':
        router.push({ pathname: '/screens/dash-assistant', params: { initialMessage: t('parent.dash_quiz_prompt', { defaultValue: 'Create a short practice quiz for my child.' }) } });
        break;
      case 'dash_study_plan':
        router.push({ pathname: '/screens/dash-assistant', params: { initialMessage: t('parent.dash_study_plan_prompt', { defaultValue: 'Create a simple study plan for this week.' }) } });
        break;
      case 'children':
        router.push('/screens/account');
        break;
      case 'calls':
        router.push('/screens/calls');
        break;
      case 'activity_feed':
        router.push('/screens/parent-activity-feed');
        break;
      case 'homework_history':
        router.push('/screens/parent-homework-history');
        break;
      case 'ai_help':
        router.push('/screens/parent-ai-help');
        break;
      case 'calculator':
        router.push('/(k12)/student/calculator');
        break;
      case 'upgrade':
        router.push('/screens/parent-upgrade');
        break;
      case 'my_exams':
        router.push('/screens/parent-my-exams');
        break;
      case 'generate_image':
        router.push('/screens/dash-image-studio');
        break;
      case 'search':
        router.push('/screens/parent-search');
        break;
      case 'payments':
        handlePaymentsPress();
        break;
      case 'dev_notifications':
        router.push('/screens/dev-notification-tester');
        break;
      case 'learning_hub':
        router.push('/screens/learning-hub');
        break;
      case 'dash_playground':
      case 'family_activity':
        router.push('/screens/dash-playground');
        break;
      case 'upload_progress': {
        const child = activeChild || children[0];
        if (!child?.id) {
          showAlert({
            title: t('parent.no_child_selected', { defaultValue: 'No child selected' }),
            message: t('parent.no_child_selected_message', { defaultValue: 'Please link or select a child first, then upload progress evidence.' }),
            type: 'info',
          });
          break;
        }
        const first = child.firstName || child.first_name || '';
        const last = child.lastName || child.last_name || '';
        const fallbackName = child.name || t('parent.child', { defaultValue: 'Child' });
        const childName = `${first} ${last}`.trim() || fallbackName;
        router.push({
          pathname: '/screens/parent-picture-of-progress',
          params: { studentId: String(child.id), studentName: encodeURIComponent(childName) },
        } as any);
        break;
      }
      case 'dash_grade_test': {
        const child = activeChild || children[0];
        const childGrade = child?.grade || child?.grade_level || 'Age 6';
        const childName = child?.firstName || child?.first_name || child?.name || t('parent.child', { defaultValue: 'Child' });
        const childId = child?.id ? String(child.id) : '';
        router.push({
          pathname: '/screens/ai-homework-grader-live',
          params: {
            assignmentTitle: t('parent.family_activity_assignment_title', { defaultValue: 'Family Activity Review' }),
            gradeLevel: childGrade,
            studentId: childId,
            submissionContent: `${childName} completed today's family activity. Add what they did, then press Start Live Grading.`,
          },
        } as any);
        break;
      }
      default:
        showAlert({
          title: t('common.coming_soon', { defaultValue: 'Coming Soon' }),
          message: t('dashboard.feature_coming_soon', { defaultValue: 'This feature is coming soon!' }),
          type: 'info',
        });
    }
  }, [activeChild, children, showAlert, handlePaymentsPress, t]);

  return { handleQuickAction, handlePaymentsPress };
}

export default useParentDashboardNavigation;
