import React from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/ThemeContext';
import { useAds } from '@/contexts/AdsContext';
import { Colors } from '@/constants/Colors';
import { track } from '@/lib/analytics';
import { navigateToUpgrade } from '@/lib/upgrade/upgradeRoutes';
import { EmptyClassesState, EmptyAssignmentsState, EmptyEventsState } from '@/components/ui/EmptyState';
import AdBannerWithUpgrade from '@/components/ui/AdBannerWithUpgrade';
import { getStyles } from './styles';
import type { Assignment, AITool, QuickAction } from './types';
import { ratioToPercent } from '@/lib/progress/clampPercent';
// Quick Actions Component
interface TeacherQuickActionsProps {
  quickActions: QuickAction[];
}
export const TeacherQuickActions: React.FC<TeacherQuickActionsProps> = ({ quickActions }) => {
  const { t } = useTranslation();
  const { theme, isDark } = useTheme();
  const styles = getStyles(theme, isDark);
  const renderQuickAction = (action: QuickAction) => (
    <TouchableOpacity
      key={action.id}
      style={[styles.quickActionButton, { backgroundColor: action.color }]}
      onPress={action.onPress}
    >
      <Ionicons name={action.icon as any} size={24} color="white" />
      <Text style={styles.quickActionText}>{action.title}</Text>
    </TouchableOpacity>
  );
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t("dashboard.quick_actions_section")}</Text>
      <View style={styles.quickActionsGrid}>{quickActions.map(renderQuickAction)}</View>
    </View>
  );
};
// AI Tools Component
interface TeacherAIToolsProps {
  aiTools: AITool[];
  aiLessonEnabled: boolean;
  aiGradingEnabled: boolean;
  aiHelperEnabled: boolean;
  hasActiveSeat: boolean;
  canCreateAssignments: boolean;
  canGradeAssignments: boolean;
  canViewAnalytics: boolean;
  hasPremiumOrHigher: boolean;
  aiLessonCap: boolean;
  aiGradingCap: boolean;
  aiTempUnlocks: Record<string, number>;
  setAiTempUnlocks: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  showAds: boolean;
  showUpgradeNudge: boolean;
  setShowUpgradeNudge: (show: boolean) => void;
  setShowUpgradeModal: (show: boolean) => void;
  orgLimits: any;
  userRole: string | undefined;
}
export const TeacherAITools: React.FC<TeacherAIToolsProps> = ({
  aiTools,
  aiLessonEnabled,
  aiGradingEnabled,
  aiHelperEnabled,
  hasActiveSeat,
  canCreateAssignments,
  canGradeAssignments,
  canViewAnalytics,
  hasPremiumOrHigher,
  aiLessonCap,
  aiGradingCap,
  aiTempUnlocks,
  setAiTempUnlocks,
  showAds,
  showUpgradeNudge,
  setShowUpgradeNudge,
  setShowUpgradeModal,
  orgLimits,
  userRole,
}) => {
  const { t } = useTranslation();
  const { theme, isDark } = useTheme();
  const { offerRewarded } = useAds();
  const styles = getStyles(theme, isDark);
  const renderAIToolCard = (tool: AITool) => {
    const enabled = hasActiveSeat
      ? tool.id === "lesson-generator"
        ? aiLessonEnabled
        : tool.id === "homework-grader"
          ? aiGradingEnabled
          : tool.id === "homework-helper"
            ? aiHelperEnabled
            : tool.id === "progress-analysis"
              ? true
              : true
      : tool.id === "lesson-generator"
        ? aiLessonEnabled && canCreateAssignments
        : tool.id === "homework-grader"
          ? aiGradingEnabled && canGradeAssignments
          : tool.id === "homework-helper"
            ? aiHelperEnabled
            : tool.id === "progress-analysis"
              ? (canViewAnalytics && hasPremiumOrHigher)
              : true;
    const hasTemporaryUnlock = aiTempUnlocks[tool.id] > 0;
    const isActuallyEnabled = enabled || hasTemporaryUnlock;
    const handlePress = async () => {
      if (hasTemporaryUnlock) {
        setAiTempUnlocks(prev => ({
          ...prev,
          [tool.id]: Math.max(0, prev[tool.id] - 1)
        }));
      }
      tool.onPress();
    };
    return (
      <TouchableOpacity
        key={tool.id}
        style={[
          styles.aiToolCard,
          { backgroundColor: tool.color + "10", opacity: isActuallyEnabled ? 1 : 0.5 },
        ]}
        onPress={handlePress}
        disabled={!isActuallyEnabled}
        accessibilityRole="button"
        accessibilityLabel={tool.title}
      >
        <View style={[styles.aiToolIcon, { backgroundColor: tool.color }]}>
          <Ionicons name={tool.icon as any} size={24} color="white" />
        </View>
        <View style={styles.aiToolContent}>
          <Text style={styles.aiToolTitle}>{tool.title}</Text>
          <Text style={styles.aiToolSubtitle}>{tool.subtitle}</Text>
          {!enabled && hasTemporaryUnlock && (
            <Text style={{ color: "#10B981", marginTop: 4, fontWeight: '600' }}>
              {aiTempUnlocks[tool.id]} trial use{aiTempUnlocks[tool.id] !== 1 ? 's' : ''} remaining
            </Text>
          )}
          {!enabled && !hasTemporaryUnlock && tool.id !== 'progress-analysis' && (
            <Text style={{ color: theme.textSecondary, marginTop: 4 }}>
              {t("dashboard.ai_upgrade_required_cta", { defaultValue: "Upgrade to use" })}
            </Text>
          )}
          {!enabled && tool.id === 'progress-analysis' && (
            <TouchableOpacity
              style={{ marginTop: 6, alignSelf: 'flex-start', backgroundColor: '#7C3AED', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 }}
              onPress={(e) => {
                e.stopPropagation();
                navigateToUpgrade({ source: 'teacher_ai_progress', reason: 'feature_needed' });
              }}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 12 }}>Upgrade</Text>
            </TouchableOpacity>
          )}
          {!enabled && !hasTemporaryUnlock && showAds && ['lesson-generator', 'homework-grader'].includes(tool.id) && (
            <TouchableOpacity
              style={{ marginTop: 6, paddingVertical: 4 }}
              onPress={async (e) => {
                e.stopPropagation();
                const { shown, rewarded } = await offerRewarded(`ai_tool_${tool.id}`);
                if (rewarded) {
                  setAiTempUnlocks(prev => ({ ...prev, [tool.id]: 1 }));
                  Alert.alert('Unlocked!', 'You can try this AI tool once for free.');
                }
              }}
            >
              <Text style={{ color: theme.primary, fontWeight: '600', fontSize: 12 }}>
                📺 Watch ad to try once
              </Text>
            </TouchableOpacity>
          )}
        </View>
        <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
      </TouchableOpacity>
    );
  };
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t("dashboard.ai_teaching_tools")}</Text>
      {(aiLessonEnabled || aiHelperEnabled || aiGradingEnabled) ? (
        <Text style={{ color: Colors.light.tabIconDefault, marginBottom: 8 }}>
          {t("dashboard.ai_tools_enabled")}
        </Text>
      ) : (
        <Text style={{ color: Colors.light.tabIconDefault, marginBottom: 8 }}>
          {t("dashboard.ai_tools_disabled")}
        </Text>
      )}
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
        <Ionicons name="information-circle-outline" size={16} color={Colors.light.tabIconDefault} />
        <Text style={{ color: Colors.light.tabIconDefault, marginLeft: 6, flex: 1 }}>
          {t("dashboard.ai_tools_info", { defaultValue: "AI runs on a secure server. Access and usage are limited by your plan or trial." })}
        </Text>
      </View>
      {userRole === "principal_admin" && orgLimits && (
        <View style={styles.orgUsageRow}>
          <Text style={styles.orgUsagePill}>Lessons: {orgLimits.used.lesson_generation}/{orgLimits.quotas.lesson_generation}</Text>
          <Text style={styles.orgUsagePill}>Grading: {orgLimits.used.grading_assistance}/{orgLimits.quotas.grading_assistance}</Text>
          <Text style={styles.orgUsagePill}>Helper: {orgLimits.used.homework_help}/{orgLimits.quotas.homework_help}</Text>
          <TouchableOpacity onPress={() => router.push("/screens/admin-ai-allocation")}>
            <Text style={styles.orgUsageLink}>Manage</Text>
          </TouchableOpacity>
        </View>
      )}
      {!(aiLessonCap || aiGradingCap) && showUpgradeNudge && (
        <View style={styles.upgradeNudge}>
          <View style={{ flex: 1 }}>
            <Text style={styles.upgradeNudgeText}>
              {t("dashboard.ai_upgrade_nudge", { defaultValue: "Unlock AI tools with Basic, Premium or Pro." })}
            </Text>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
              <TouchableOpacity onPress={() => setShowUpgradeModal(true)}>
                <Text style={styles.upgradeNudgeLink}>{t("dashboard.upgrade_now", { defaultValue: "Upgrade now" })}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.push("/pricing")}>
                <Text style={styles.upgradeNudgeLink}>{t("dashboard.see_plans", { defaultValue: "See plans" })}</Text>
              </TouchableOpacity>
            </View>
          </View>
          <TouchableOpacity onPress={() => setShowUpgradeNudge(false)} accessibilityLabel="Dismiss upgrade message">
            <Ionicons name="close" size={16} color={Colors.light.tabIconDefault} />
          </TouchableOpacity>
        </View>
      )}
      <View style={styles.aiToolsContainer}>{aiTools.map(renderAIToolCard)}</View>
    </View>
  );
};
// Classes Component
interface TeacherClassesProps {
  myClasses: any[];
  showAds: boolean;
}
export const TeacherClasses: React.FC<TeacherClassesProps> = ({ myClasses, showAds }) => {
  const { t } = useTranslation();
  const { theme, isDark } = useTheme();
  const styles = getStyles(theme, isDark);
  const renderClassCard = (classInfo: any) => (
    <TouchableOpacity
      key={classInfo.id}
      style={styles.classCard}
      onPress={() => {
        router.push(`/screens/class-teacher-management?classId=${classInfo.id}&className=${encodeURIComponent(classInfo.name)}`);
      }}
    >
      <View style={styles.classHeader}>
        <View>
          <Text style={styles.className}>{classInfo.name}</Text>
          <Text style={styles.classDetails}>{classInfo.grade} • {classInfo.room}</Text>
        </View>
        <View style={styles.studentCount}>
          <Ionicons name="people" size={16} color={theme.textSecondary} />
          <Text style={styles.studentCountText}>{classInfo.studentCount}</Text>
        </View>
      </View>
      <View style={styles.nextLesson}>
        <Ionicons name="time-outline" size={16} color={theme.primary} />
        <Text style={styles.nextLessonText}>{classInfo.nextLesson}</Text>
      </View>
      {classInfo.presentToday !== undefined && (
        <View style={styles.attendanceInfo}>
          <View style={styles.attendanceBadge}>
            <Ionicons name="checkmark-circle" size={14} color="#059669" />
            <Text style={styles.attendanceText}>{classInfo.presentToday}/{classInfo.studentCount} present today</Text>
          </View>
          {classInfo.attendanceRate !== undefined && (
            <Text style={styles.attendanceRate}>{classInfo.attendanceRate}% attendance</Text>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t("dashboard.my_classes")}</Text>
      <View style={styles.classesContainer}>
        {myClasses && myClasses.length > 0 ? (
          myClasses.map((classCard, index) => {
            if (showAds && index === 2 && myClasses.length > 2) {
              return (
                <React.Fragment key={`class-${classCard.id}`}>
                  {renderClassCard(classCard)}
                  <AdBannerWithUpgrade screen="teacher_dashboard" showUpgradeCTA={false} margin={8} />
                </React.Fragment>
              );
            }
            return renderClassCard(classCard);
          })
        ) : (
          <EmptyClassesState onCreateClass={() => router.push("/screens/class-teacher-management")} />
        )}
      </View>
    </View>
  );
};
// Assignments Component
interface TeacherAssignmentsProps {
  recentAssignments: Assignment[];
}
export const TeacherAssignments: React.FC<TeacherAssignmentsProps> = ({ recentAssignments }) => {
  const { t } = useTranslation();
  const { theme, isDark } = useTheme();
  const styles = getStyles(theme, isDark);
  const renderAssignmentCard = (assignment: Assignment) => (
    <TouchableOpacity
      key={assignment.id}
      style={styles.assignmentCard}
      onPress={() => {
        router.push(`/screens/assignment-details?assignmentId=${assignment.id}&title=${encodeURIComponent(assignment.title)}`);
      }}
    >
      <View style={styles.assignmentHeader}>
        <Text style={styles.assignmentTitle}>{assignment.title}</Text>
        <View
          style={[
            styles.statusBadge,
            {
              backgroundColor:
                assignment.status === "graded" ? "#059669" :
                assignment.status === "overdue" ? "#DC2626" : "#EA580C",
            },
          ]}
        >
          <Text style={styles.statusText}>
            {assignment.status === "graded" ? "Graded" :
             assignment.status === "overdue" ? "Overdue" : "Pending"}
          </Text>
        </View>
      </View>
      <Text style={styles.assignmentDue}>Due: {assignment.dueDate}</Text>
      <View style={styles.assignmentProgress}>
        <Text style={styles.progressText}>{assignment.submitted}/{assignment.total} submitted</Text>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${ratioToPercent(
                  assignment.submitted,
                  assignment.total,
                  { source: 'teacher-dashboard.assignment-progress' },
                )}%`,
              },
            ]}
          />
        </View>
      </View>
    </TouchableOpacity>
  );
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t("dashboard.recent_assignments")}</Text>
      <View style={styles.assignmentsContainer}>
        {recentAssignments && recentAssignments.length > 0 ? (
          recentAssignments.map(renderAssignmentCard)
        ) : (
          <EmptyAssignmentsState onCreateAssignment={() => router.push("/screens/assign-lesson")} />
        )}
      </View>
    </View>
  );
};
// Events Component
interface TeacherEventsProps {
  upcomingEvents: any[];
}
export const TeacherEvents: React.FC<TeacherEventsProps> = ({ upcomingEvents }) => {
  const { t } = useTranslation();
  const { theme, isDark } = useTheme();
  const styles = getStyles(theme, isDark);
  return (
    <View style={styles.section}>
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>{t("dashboard.upcoming_events")}</Text>
        {upcomingEvents && upcomingEvents.length > 0 ? (
          upcomingEvents.map((event) => (
            <View key={event.id} style={styles.eventItem}>
              <View
                style={[
                  styles.eventIcon,
                  {
                    backgroundColor:
                      event.type === "meeting" ? "#4F46E5" :
                      event.type === "activity" ? "#059669" : "#DC2626",
                  },
                ]}
              >
                <Ionicons
                  name={
                    event.type === "meeting" ? "people" :
                    event.type === "activity" ? "color-palette" : "document-text"
                  }
                  size={16}
                  color="white"
                />
              </View>
              <View style={styles.eventContent}>
                <Text style={styles.eventTitle}>{event.title}</Text>
                <Text style={styles.eventTime}>{event.time}</Text>
              </View>
            </View>
          ))
        ) : (
          <EmptyEventsState onCreateEvent={() => router.push("/screens/teacher-reports")} />
        )}
      </View>
    </View>
  );
};
