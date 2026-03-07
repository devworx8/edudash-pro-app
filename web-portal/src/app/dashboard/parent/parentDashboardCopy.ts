/**
 * parentDashboardCopy.ts
 *
 * Extracted i18n copy object for the parent dashboard page.
 * Keeps the page component focused on layout and logic.
 */

import type { TFunction } from 'i18next';

export function getParentDashboardCopy(t: TFunction) {
  return {
    greetings: {
      morning: t('dashboard.good_morning', { defaultValue: 'Good morning' }),
      afternoon: t('dashboard.good_afternoon', { defaultValue: 'Good afternoon' }),
      evening: t('dashboard.good_evening', { defaultValue: 'Good evening' }),
    },
    searchPlaceholder: t('dashboard.parent.search_placeholder', { defaultValue: 'Search homework, messages, children...' }),
    upgradeBanner: {
      title: t('dashboard.parent.upgrade_title', { defaultValue: 'Unlock more parent tools' }),
      description: t('dashboard.parent.upgrade_description', { defaultValue: 'Get homework help, progress insights, and remove ads by upgrading.' }),
    },
    hints: {
      quickActionsTitle: t('dashboard.parent.hint.quick_actions.title', { defaultValue: 'Quick Actions' }),
      quickActionsMessage: t('dashboard.parent.hint.quick_actions.message', { defaultValue: 'Tap any card to quickly access homework, messages, payments, or Dash AI.' }),
      liveClassesTitle: t('dashboard.parent.hint.live_classes.title', { defaultValue: 'Live Classes' }),
      liveClassesMessage: t('dashboard.parent.hint.live_classes.message', { defaultValue: 'When a teacher starts a live class, you can join here instantly.' }),
    },
    sections: {
      myChildren: t('dashboard.parent.section.my_children', { defaultValue: 'My Children' }),
      uniformSizes: t('dashboard.parent.section.uniform_sizes', { defaultValue: 'Uniform Sizes' }),
      recentActivity: t('dashboard.parent.section.recent_activity', { defaultValue: 'Recent Activity' }),
      homework: t('dashboard.parent.section.homework', { defaultValue: 'Homework' }),
      liveClasses: t('dashboard.parent.section.live_classes', { defaultValue: 'Live Classes' }),
      teacherNotes: t('dashboard.parent.section.teacher_notes', { defaultValue: 'Teacher Notes' }),
      progress: t('dashboard.parent.section.progress', { defaultValue: 'Progress & Achievements' }),
      birthdays: t('dashboard.parent.section.birthdays', { defaultValue: 'Upcoming Birthdays' }),
      birthdayChart: t('dashboard.parent.section.birthday_chart', { defaultValue: 'Birthday Chart' }),
      dailyActivity: t('dashboard.parent.section.daily_activity', { defaultValue: 'Daily Activity' }),
      practiceAtHome: t('dashboard.parent.section.practice_at_home', { defaultValue: 'Practice at Home' }),
      earlyLearningActivities: t('dashboard.parent.section.early_learning_activities', { defaultValue: 'Early Learning Activities' }),
      earlyLearningTips: t('dashboard.parent.section.early_learning_tips', { defaultValue: 'Early Learning Tips for Parents' }),
      overview: t('dashboard.parent.section.overview', { defaultValue: "Today's Overview" }),
    },
    sectionDescriptions: {
      myChildren: t('dashboard.parent.section_desc.my_children', { defaultValue: 'Profiles, homework, and updates for each child.' }),
      uniformSizes: t('dashboard.parent.section_desc.uniform_sizes', { defaultValue: 'Confirm sizes, quantities, and upload uniform payment proof.' }),
      recentActivity: t('dashboard.parent.section_desc.recent_activity', { defaultValue: 'Latest messages, announcements, and updates.' }),
      homework: t('dashboard.parent.section_desc.homework', { defaultValue: 'Assignments, due dates, and feedback from teachers.' }),
      liveClasses: t('dashboard.parent.section_desc.live_classes', { defaultValue: 'Join live lessons and school events when they start.' }),
      teacherNotes: t('dashboard.parent.section_desc.teacher_notes', { defaultValue: "Notes and feedback from your child's teacher." }),
      progress: t('dashboard.parent.section_desc.progress', { defaultValue: 'Badges, milestones, and learning progress.' }),
      birthdays: t('dashboard.parent.section_desc.birthdays', { defaultValue: 'Upcoming class birthdays and reminders.' }),
      birthdayChart: t('dashboard.parent.section_desc.birthday_chart', { defaultValue: 'Full month-by-month birthday list.' }),
      dailyActivity: t('dashboard.parent.section_desc.daily_activity', { defaultValue: 'Daily photos, activities, and class updates.' }),
      practiceAtHome: t('dashboard.parent.section_desc.practice_at_home', { defaultValue: 'At-home activities to reinforce learning.' }),
      earlyLearningActivities: t('dashboard.parent.section_desc.early_learning_activities', { defaultValue: 'Age-appropriate activities for preschoolers.' }),
      earlyLearningTips: t('dashboard.parent.section_desc.early_learning_tips', { defaultValue: 'Tips to support your preschooler at home.' }),
      overview: t('dashboard.parent.section_desc.overview', { defaultValue: 'Attendance, fees, and key updates at a glance.' }),
    },
    childCard: {
      homework: t('dashboard.parent.child_card.homework', { defaultValue: 'Homework' }),
      events: t('dashboard.parent.child_card.events', { defaultValue: 'Events' }),
    },
    practiceCards: {
      robotics: {
        title: t('dashboard.parent.practice.robotics.title', { defaultValue: 'Robotics Practice' }),
        description: t('dashboard.parent.practice.robotics.description', { defaultValue: 'Explore robot movements, basic programming, and sensor activities' }),
      },
      aiActivities: {
        title: t('dashboard.parent.practice.ai.title', { defaultValue: 'AI Activities' }),
        description: t('dashboard.parent.practice.ai.description', { defaultValue: 'Age-appropriate AI learning games and pattern recognition activities' }),
      },
      computerLiteracy: {
        title: t('dashboard.parent.practice.computer.title', { defaultValue: 'Computer Literacy' }),
        description: t('dashboard.parent.practice.computer.description', { defaultValue: 'Basic skills practice: typing, mouse control, app navigation, online safety' }),
      },
      preschoolPlay: {
        title: t('dashboard.parent.practice.preschool_play.title', { defaultValue: 'Play-Based Learning' }),
        description: t('dashboard.parent.practice.preschool_play.description', { defaultValue: 'Fun, hands-on activities to build curiosity, creativity, and confidence' }),
      },
      preschoolLiteracy: {
        title: t('dashboard.parent.practice.preschool_literacy.title', { defaultValue: 'Early Literacy' }),
        description: t('dashboard.parent.practice.preschool_literacy.description', { defaultValue: 'Letter sounds, storytelling, and picture-based vocabulary games' }),
      },
      preschoolMath: {
        title: t('dashboard.parent.practice.preschool_math.title', { defaultValue: 'Numbers & Shapes' }),
        description: t('dashboard.parent.practice.preschool_math.description', { defaultValue: 'Counting, patterns, and shape recognition with everyday objects' }),
      },
    },
    earlyLearning: {
      heading: t('dashboard.parent.early_learning.heading', { defaultValue: "Supporting Your Preschooler's Development" }),
      tips: [
        {
          title: t('dashboard.parent.early_learning.tips.creative_play.title', { defaultValue: '🎨 Creative Play' }),
          description: t('dashboard.parent.early_learning.tips.creative_play.description', { defaultValue: 'Encourage drawing, painting, and imaginative play to develop creativity and fine motor skills.' }),
        },
        {
          title: t('dashboard.parent.early_learning.tips.reading.title', { defaultValue: '📚 Reading Together' }),
          description: t('dashboard.parent.early_learning.tips.reading.description', { defaultValue: 'Read stories daily to build language skills, vocabulary, and a love for books.' }),
        },
        {
          title: t('dashboard.parent.early_learning.tips.numbers.title', { defaultValue: '🔢 Numbers & Shapes' }),
          description: t('dashboard.parent.early_learning.tips.numbers.description', { defaultValue: 'Use everyday activities to introduce counting, colors, and shapes in fun ways.' }),
        },
        {
          title: t('dashboard.parent.early_learning.tips.songs.title', { defaultValue: '🎵 Songs & Rhymes' }),
          description: t('dashboard.parent.early_learning.tips.songs.description', { defaultValue: 'Sing songs and recite rhymes to develop memory, rhythm, and phonological awareness.' }),
        },
        {
          title: t('dashboard.parent.early_learning.tips.social.title', { defaultValue: '🤝 Social Skills' }),
          description: t('dashboard.parent.early_learning.tips.social.description', { defaultValue: 'Arrange playdates and teach sharing, turn-taking, and expressing emotions.' }),
        },
      ],
    },
    overviewCards: {
      unreadMessages: t('dashboard.parent.overview.unread_messages', { defaultValue: 'Unread Messages' }),
      missedCalls: t('dashboard.parent.overview.missed_calls', { defaultValue: 'Missed Calls' }),
      homeworkPending: t('dashboard.parent.overview.homework_pending', { defaultValue: 'Homework Pending' }),
      attendanceRate: t('dashboard.parent.overview.attendance_rate', { defaultValue: 'Attendance Rate' }),
    },
    aiModalClose: t('dashboard.parent.ai.close', { defaultValue: 'Close' }),
  };
}

export type ParentDashboardCopy = ReturnType<typeof getParentDashboardCopy>;
