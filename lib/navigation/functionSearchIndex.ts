import { EDUDASH_SCREENS } from '@/lib/constants/edudash-features';

export type FunctionSearchRole =
  | 'student'
  | 'parent'
  | 'teacher'
  | 'principal'
  | 'principal_admin'
  | 'super_admin'
  | 'all';

export type FunctionSearchScope = 'all' | 'dash';

export interface FunctionSearchItem {
  id: string;
  title: string;
  description: string;
  route: string;
  icon: string;
  section: string;
  keywords: string[];
  roles?: FunctionSearchRole[];
  scope?: FunctionSearchScope;
  priority?: number;
}

const DASH_ROLES: FunctionSearchRole[] = ['student', 'parent', 'teacher', 'principal', 'principal_admin', 'super_admin'];
const STAFF_ROLES: FunctionSearchRole[] = ['teacher', 'principal', 'principal_admin', 'super_admin'];
const PRINCIPAL_ROLES: FunctionSearchRole[] = ['principal', 'principal_admin', 'super_admin'];
const LEARNER_ROLES: FunctionSearchRole[] = ['student', 'parent', 'teacher', 'principal', 'principal_admin'];

export const FUNCTION_SEARCH_INDEX: FunctionSearchItem[] = [
  // Dash AI surfaces (explicitly included)
  {
    id: 'dash-assistant',
    title: 'Dash Assistant',
    description: 'Chat with Dash for planning, support, and school operations.',
    route: '/screens/dash-assistant',
    icon: 'sparkles',
    section: 'Dash AI',
    keywords: ['dash', 'assistant', 'chat', 'ai', 'advisor', 'help'],
    roles: DASH_ROLES,
    scope: 'dash',
    priority: 100,
  },
  {
    id: 'dash-orb-voice',
    title: 'Dash Orb Voice',
    description: 'Voice-first Dash Orb experience with live speech interaction.',
    route: '/screens/dash-voice?mode=orb',
    icon: 'radio',
    section: 'Dash AI',
    keywords: ['dash', 'orb', 'voice', 'tts', 'stt', 'speak'],
    roles: DASH_ROLES,
    scope: 'dash',
    priority: 99,
  },
  {
    id: 'dash-tutor',
    title: 'Dash Tutor',
    description: 'Interactive tutor mode for guided learning and practice.',
    route: '/screens/dash-tutor',
    icon: 'school',
    section: 'Dash AI',
    keywords: ['dash', 'tutor', 'quiz', 'practice', 'study', 'learn'],
    roles: LEARNER_ROLES,
    scope: 'dash',
    priority: 97,
  },
  {
    id: 'dash-playground',
    title: 'Dash Playground',
    description: 'Child-friendly activity player and assignments practice area.',
    route: '/screens/dash-playground',
    icon: 'game-controller',
    section: 'Dash AI',
    keywords: ['dash', 'playground', 'activities', 'child', 'practice'],
    roles: ['parent', 'student', 'teacher', 'principal', 'principal_admin'],
    scope: 'dash',
    priority: 95,
  },
  {
    id: 'dash-studio',
    title: 'Dash Studio',
    description: 'Principal workflow planning studio with AI-assisted automation.',
    route: '/screens/dash-studio',
    icon: 'color-wand',
    section: 'Dash AI',
    keywords: ['dash', 'studio', 'workflow', 'principal', 'automation'],
    roles: PRINCIPAL_ROLES,
    scope: 'dash',
    priority: 94,
  },
  {
    id: 'dash-image-studio',
    title: 'Dash Image Studio',
    description: 'Generate visual content and concept images with Dash.',
    route: '/screens/dash-image-studio',
    icon: 'image',
    section: 'Dash AI',
    keywords: ['dash', 'image', 'studio', 'visual', 'generate'],
    roles: STAFF_ROLES,
    scope: 'dash',
    priority: 92,
  },
  {
    id: 'dash-history',
    title: 'Dash Conversation History',
    description: 'Review previous Dash conversations and continue where you left off.',
    route: '/screens/dash-conversations-history',
    icon: 'time',
    section: 'Dash AI',
    keywords: ['dash', 'history', 'conversations', 'chat history'],
    roles: DASH_ROLES,
    scope: 'dash',
    priority: 91,
  },
  {
    id: 'dash-settings',
    title: 'Dash AI Settings',
    description: 'Manage Dash behavior, voice, and personalization settings.',
    route: '/screens/dash-ai-settings',
    icon: 'settings',
    section: 'Dash AI',
    keywords: ['dash', 'settings', 'voice', 'model', 'preferences'],
    roles: DASH_ROLES,
    scope: 'dash',
    priority: 90,
  },
  {
    id: 'dash-settings-enhanced',
    title: 'Dash AI Settings (Enhanced)',
    description: 'Advanced controls for Dash AI and voice behavior.',
    route: '/screens/dash-ai-settings-enhanced',
    icon: 'options',
    section: 'Dash AI',
    keywords: ['dash', 'advanced', 'settings', 'enhanced'],
    roles: DASH_ROLES,
    scope: 'dash',
    priority: 89,
  },
  {
    id: 'dash-ai-chat',
    title: 'Dash AI Ops Chat',
    description: 'Operations-focused Dash AI chat for super admin workflows.',
    route: '/screens/dash-ai-chat',
    icon: 'construct',
    section: 'Dash AI',
    keywords: ['dash', 'ops', 'chat', 'super admin'],
    roles: ['super_admin'],
    scope: 'dash',
    priority: 86,
  },
  {
    id: 'dash-orb-route',
    title: 'Dash Orb Entry',
    description: 'Dedicated Dash Orb entry route for voice tutor mode.',
    route: '/screens/dash-orb',
    icon: 'planet',
    section: 'Dash AI',
    keywords: ['dash', 'orb', 'entry', 'voice'],
    roles: ['parent', 'student'],
    scope: 'dash',
    priority: 84,
  },

  // Core navigation / app functions
  {
    id: 'home-dashboard',
    title: 'Main Dashboard',
    description: 'Go to your role-based dashboard home.',
    route: '/screens/teacher-dashboard',
    icon: 'home',
    section: 'Navigation',
    keywords: ['home', 'dashboard', 'start'],
    roles: ['teacher'],
    priority: 80,
  },
  {
    id: 'parent-dashboard',
    title: 'Parent Dashboard',
    description: 'Parent home with learner updates and quick actions.',
    route: '/screens/parent-dashboard',
    icon: 'home',
    section: 'Navigation',
    keywords: ['parent', 'dashboard', 'children'],
    roles: ['parent'],
    priority: 80,
  },
  {
    id: 'principal-dashboard',
    title: 'Principal Dashboard',
    description: 'School operations dashboard for principals and admins.',
    route: '/screens/principal-dashboard',
    icon: 'school',
    section: 'Navigation',
    keywords: ['principal', 'dashboard', 'school', 'admin'],
    roles: ['principal', 'principal_admin', 'super_admin'],
    priority: 80,
  },
  {
    id: 'learner-dashboard',
    title: 'Learner Dashboard',
    description: 'Student learning dashboard and progress entry point.',
    route: '/screens/learner-dashboard',
    icon: 'person',
    section: 'Navigation',
    keywords: ['student', 'learner', 'dashboard', 'progress'],
    roles: ['student'],
    priority: 79,
  },
  {
    id: 'teacher-messages',
    title: 'Teacher Messages',
    description: 'Open teacher message threads and communication inbox.',
    route: '/screens/teacher-message-list',
    icon: 'chatbubbles',
    section: 'Messaging',
    keywords: ['messages', 'chat', 'teacher', 'threads', 'inbox'],
    roles: ['teacher', 'principal', 'principal_admin', 'super_admin'],
    priority: 76,
  },
  {
    id: 'parent-messages',
    title: 'Parent Messages',
    description: 'Open parent communication threads and inbox.',
    route: '/screens/parent-messages',
    icon: 'chatbubbles',
    section: 'Messaging',
    keywords: ['messages', 'chat', 'parent', 'inbox'],
    roles: ['parent'],
    priority: 76,
  },
  {
    id: 'principal-messages',
    title: 'Principal Messages',
    description: 'Open principal message inbox and thread management.',
    route: '/screens/principal-messages',
    icon: 'chatbubbles',
    section: 'Messaging',
    keywords: ['messages', 'principal', 'chat', 'inbox'],
    roles: ['principal', 'principal_admin', 'super_admin'],
    priority: 76,
  },
  {
    id: 'student-management',
    title: 'Student Management',
    description: 'Manage students, enrollment, and class assignments.',
    route: '/screens/student-management',
    icon: 'people',
    section: 'School Ops',
    keywords: ['students', 'manage', 'enrollment', 'classes'],
    roles: ['teacher', 'principal', 'principal_admin', 'super_admin'],
    priority: 75,
  },
  {
    id: 'teacher-management',
    title: 'Teacher Management',
    description: 'Manage teachers, hiring, and approvals.',
    route: '/screens/teacher-management',
    icon: 'briefcase',
    section: 'School Ops',
    keywords: ['teachers', 'hiring', 'approval', 'staff'],
    roles: ['principal', 'principal_admin', 'super_admin'],
    priority: 74,
  },
  {
    id: 'principal-uniforms',
    title: 'Uniform Orders',
    description: 'Track uniform orders, statuses, numbering, and export PDF.',
    route: '/screens/principal-uniforms',
    icon: 'shirt',
    section: 'School Ops',
    keywords: ['uniform', 'orders', 'sizes', 'payments', 'pdf'],
    roles: ['principal', 'principal_admin', 'super_admin'],
    priority: 73,
  },
  {
    id: 'weekly-menu',
    title: 'Weekly Menu',
    description: 'Upload and publish school weekly menus for families.',
    route: '/screens/principal-menu',
    icon: 'restaurant',
    section: 'School Ops',
    keywords: ['menu', 'weekly', 'publish', 'parents'],
    roles: ['principal', 'principal_admin', 'super_admin'],
    priority: 73,
  },
  {
    id: 'announcements',
    title: 'Announcements',
    description: 'Create and publish announcements to school audiences.',
    route: '/screens/principal-announcement',
    icon: 'megaphone',
    section: 'Communication',
    keywords: ['announcement', 'broadcast', 'parents', 'school'],
    roles: ['principal', 'principal_admin', 'teacher', 'super_admin'],
    priority: 72,
  },
  {
    id: 'calendar',
    title: 'Calendar',
    description: 'View and manage school schedules and events.',
    route: '/screens/calendar',
    icon: 'calendar',
    section: 'Planning',
    keywords: ['calendar', 'schedule', 'events'],
    roles: ['all'],
    priority: 71,
  },
  {
    id: 'finance-control',
    title: 'Finance Control Center',
    description: 'Track collections, outstanding balances, and approvals.',
    route: '/screens/finance-control-center?tab=overview',
    icon: 'cash',
    section: 'Finance',
    keywords: ['finance', 'fees', 'payments', 'outstanding', 'collections'],
    roles: ['principal', 'principal_admin', 'super_admin'],
    priority: 70,
  },
  {
    id: 'principal-payments',
    title: 'Principal Payments and Fees',
    description: 'Open school payment and fee management overview for principals.',
    route: '/screens/principal-fee-overview',
    icon: 'wallet',
    section: 'Finance',
    keywords: ['payment', 'payments', 'fees', 'collections', 'billing', 'school fees'],
    roles: ['principal', 'principal_admin', 'super_admin'],
    priority: 71,
  },
  {
    id: 'parent-payments',
    title: 'Parent Payments',
    description: 'View balances, upcoming fees, payment history, and upload POP.',
    route: '/screens/parent-payments',
    icon: 'cash',
    section: 'Finance',
    keywords: ['payment', 'payments', 'fees', 'billing', 'balance', 'outstanding', 'proof of payment', 'pop', 'pay', 'school fees', 'money', 'owe', 'owing', 'invoice'],
    roles: ['parent'],
    priority: 70,
  },
  {
    id: 'parent-payments-upload',
    title: 'Upload Proof of Payment',
    description: 'Open payment upload flow for pending fees and verification.',
    route: '/screens/parent-payments?tab=upload',
    icon: 'cloud-upload',
    section: 'Finance',
    keywords: ['proof of payment', 'pop', 'upload', 'payment upload', 'receipt', 'receipts', 'pay', 'submit payment'],
    roles: ['parent'],
    priority: 69,
  },
  {
    id: 'parent-pop-history',
    title: 'Payment Upload History',
    description: 'Review submitted proof-of-payment uploads and statuses.',
    route: '/screens/parent-pop-history',
    icon: 'time',
    section: 'Finance',
    keywords: ['payment history', 'pop history', 'proofs', 'receipts', 'uploads', 'payment records'],
    roles: ['parent'],
    priority: 68,
  },
  {
    id: 'principal-fee-overview',
    title: 'Fee Overview',
    description: 'Principal fee analytics, collections, and outstanding accounts.',
    route: '/screens/principal-fee-overview',
    icon: 'stats-chart',
    section: 'Finance',
    keywords: ['fee overview', 'fees', 'payments', 'collections', 'arrears'],
    roles: ['principal', 'principal_admin', 'super_admin'],
    priority: 69,
  },
  {
    id: 'principal-student-fees',
    title: 'Student Fees',
    description: 'Manage and inspect learner fee records and balances.',
    route: '/screens/principal-student-fees',
    icon: 'people',
    section: 'Finance',
    keywords: ['student fees', 'learner fees', 'payments', 'balances', 'accounts'],
    roles: ['principal', 'principal_admin', 'super_admin'],
    priority: 68,
  },
  {
    id: 'admin-fee-management',
    title: 'Fee Management',
    description: 'Configure and manage fee structures and payment controls.',
    route: '/screens/admin/fee-management',
    icon: 'build',
    section: 'Finance',
    keywords: ['fee management', 'fees', 'payments', 'billing settings'],
    roles: ['principal', 'principal_admin', 'super_admin'],
    priority: 67,
  },
  {
    id: 'parent-documents',
    title: 'Parent Documents',
    description: 'Upload required learner registration and verification documents.',
    route: '/screens/parent-document-upload',
    icon: 'documents',
    section: 'Documents',
    keywords: ['documents', 'document', 'uploads', 'registration docs', 'files', 'docs', 'receipts', 'certificates', 'records'],
    roles: ['parent'],
    priority: 70,
  },
  {
    id: 'learner-documents',
    title: 'Learner Documents',
    description: 'Open learner document hub for certificates and files.',
    route: '/screens/learner/documents',
    icon: 'folder-open',
    section: 'Documents',
    keywords: ['documents', 'document hub', 'files', 'certificates', 'records'],
    roles: ['student'],
    priority: 68,
  },
  {
    id: 'membership-documents',
    title: 'Document Vault',
    description: 'Membership organization document vault and governance files.',
    route: '/screens/membership/documents',
    icon: 'folder',
    section: 'Documents',
    keywords: ['documents', 'document vault', 'governance docs', 'policies', 'files'],
    roles: ['teacher', 'principal', 'principal_admin', 'super_admin'],
    priority: 66,
  },
  {
    id: 'pop-review',
    title: 'POP Review',
    description: 'Review pending proof-of-payment submissions.',
    route: '/screens/pop-review',
    icon: 'card',
    section: 'Finance',
    keywords: ['pop', 'proof of payment', 'review', 'approvals'],
    roles: ['principal', 'principal_admin', 'super_admin'],
    priority: 69,
  },
  {
    id: 'dash-exam-prep',
    title: 'Exam Prep',
    description: 'Launch exam preparation workflows and tutoring support.',
    route: '/screens/exam-prep',
    icon: 'school',
    section: 'Learning',
    keywords: ['exam', 'prep', 'study', 'practice'],
    roles: ['student', 'parent', 'teacher', 'principal', 'principal_admin'],
    priority: 68,
  },
  {
    id: 'ai-homework-helper',
    title: 'Homework Helper',
    description: 'Use Dash AI to explain and solve homework step-by-step.',
    route: '/screens/ai-homework-helper',
    icon: 'help-circle',
    section: 'Learning',
    keywords: ['homework', 'helper', 'ai', 'learning'],
    roles: ['student', 'parent', 'teacher', 'principal', 'principal_admin'],
    priority: 67,
  },
  {
    id: 'ai-homework-grader',
    title: 'AI Homework Grader',
    description: 'Capture and grade homework with AI feedback.',
    route: '/screens/ai-homework-grader-live',
    icon: 'checkmark-done',
    section: 'Learning',
    keywords: ['grader', 'homework', 'scan', 'ai'],
    roles: ['teacher', 'principal', 'principal_admin', 'super_admin'],
    priority: 66,
  },
  {
    id: 'teacher-lessons',
    title: 'Teacher Lessons',
    description: 'Browse, edit, and assign lessons to learners.',
    route: '/screens/teacher-lessons',
    icon: 'book',
    section: 'Planning',
    keywords: ['lessons', 'teacher', 'assign', 'planning'],
    roles: ['teacher', 'principal', 'principal_admin', 'super_admin'],
    priority: 65,
  },
  {
    id: 'settings',
    title: 'Settings',
    description: 'Open app settings, preferences, and account controls.',
    route: '/screens/settings',
    icon: 'settings',
    section: 'Navigation',
    keywords: ['settings', 'preferences', 'account'],
    roles: ['all'],
    priority: 64,
  },
  // K12 parent-specific screens
  {
    id: 'parent-grades',
    title: 'Grades',
    description: 'View learner grades, assessments, and academic progress.',
    route: '/screens/grades',
    icon: 'ribbon',
    section: 'Learning',
    keywords: ['grades', 'marks', 'results', 'assessments', 'report card', 'academic', 'progress', 'scores'],
    roles: ['parent', 'student'],
    priority: 72,
  },
  {
    id: 'parent-activity-feed',
    title: 'Activity Feed',
    description: 'Recent learner activity, submissions, and school updates.',
    route: '/screens/parent-activity-feed',
    icon: 'pulse',
    section: 'Navigation',
    keywords: ['activity', 'feed', 'updates', 'recent', 'submissions', 'timeline'],
    roles: ['parent'],
    priority: 68,
  },
  {
    id: 'parent-announcements',
    title: 'School Announcements',
    description: 'View school announcements, news, and communications.',
    route: '/screens/parent-announcements',
    icon: 'megaphone',
    section: 'Communication',
    keywords: ['announcements', 'news', 'school', 'communication', 'notices', 'updates', 'newsletter'],
    roles: ['parent'],
    priority: 68,
  },
  {
    id: 'birthday-donations',
    title: 'Birthday Donations',
    description: 'Mark and track birthday collection payments for your class or school.',
    icon: 'gift',
    route: '/screens/birthday-donation-reminders',
    roles: ['teacher', 'principal', 'principal_admin', 'super_admin'],
    section: 'Classroom',
    keywords: ['birthday', 'donation', 'collection', 'fee', 'register', 'contribution'],
    priority: 65,
  },
];

const FEATURE_ROLE_MAP: Record<string, FunctionSearchRole> = {
  parent: 'parent',
  teacher: 'teacher',
  principal: 'principal',
  principal_admin: 'principal_admin',
  super_admin: 'super_admin',
  learner: 'student',
  student: 'student',
  admin: 'principal_admin',
  superadmin: 'super_admin',
};

const APP_WIDE_ROUTE_CANDIDATES: string[] = [
  '/(k12)/library',
  '/(k12)/parent/dashboard',
  '/(k12)/student/assignments',
  '/(k12)/student/classes',
  '/(k12)/student/dashboard',
  '/(k12)/student/grades',
  '/(k12)/student/messages',
  '/(k12)/student/schedule',
  '/screens/account',
  '/screens/app-search',
  '/screens/aftercare-activities',
  '/screens/aftercare-admin',
  '/screens/assign-lesson',
  '/screens/attendance',
  '/screens/birthday-chart',
  '/screens/budget-management',
  '/screens/calendar-management',
  '/screens/campaigns',
  '/screens/class-teacher-management',
  '/screens/cleaning-roster',
  '/screens/compliance-dashboard',
  '/screens/dash-voice',
  '/screens/family-activity-review',
  '/screens/finance-control-center',
  '/screens/group-management',
  '/screens/homework',
  '/screens/learner/browse-programs',
  '/screens/learner/messages',
  '/screens/learner/portfolio',
  '/screens/learner/programs',
  '/screens/learner/submissions',
  '/screens/log-expense',
  '/screens/membership/analytics',
  '/screens/membership/announcements',
  '/screens/membership/branch-manager-invite-code',
  '/screens/membership/broadcast',
  '/screens/membership/budget-proposals',
  '/screens/membership/budget-requests',
  '/screens/membership/ceo-dashboard',
  '/screens/membership/dashboard',
  '/screens/membership/events',
  '/screens/membership/finance',
  '/screens/membership/financial-authorizations',
  '/screens/membership/governance',
  '/screens/membership/groups',
  '/screens/membership/heritage',
  '/screens/membership/id-card',
  '/screens/membership/initiatives',
  '/screens/membership/members',
  '/screens/membership/members-list',
  '/screens/membership/messages',
  '/screens/membership/pending-approvals',
  '/screens/membership/programs',
  '/screens/membership/regional-invite-code',
  '/screens/membership/regional-manager-applications',
  '/screens/membership/regional-managers',
  '/screens/membership/reports',
  '/screens/membership/settings',
  '/screens/membership/strategy',
  '/screens/membership/veterans-dashboard',
  '/screens/membership/veterans-executive-invite',
  '/screens/membership/veterans-invite-code',
  '/screens/membership/veterans-league-dashboard',
  '/screens/membership/women-dashboard',
  '/screens/membership/women-executive-invite',
  '/screens/membership/women-invite-code',
  '/screens/membership/womens-invite-code',
  '/screens/membership/womens-league-dashboard',
  '/screens/membership/youth-executive-invite',
  '/screens/membership/youth-invite-code',
  '/screens/membership/youth-president-dashboard',
  '/screens/org-admin-dashboard',
  '/screens/org-admin/certifications',
  '/screens/org-admin/cohorts',
  '/screens/org-admin/data-import',
  '/screens/org-admin/enrollments',
  '/screens/org-admin/instructors',
  '/screens/org-admin/invoices',
  '/screens/org-admin/placements',
  '/screens/org-admin/programs',
  '/screens/org-admin/settings',
  '/screens/parent-aftercare-registration',
  '/screens/parent-ai-help',
  '/screens/parent-announcements',
  '/screens/parent-attendance',
  '/screens/parent-children',
  '/screens/parent-homework-history',
  '/screens/parent-menu',
  '/screens/parent-my-exams',
  '/screens/parent-progress',
  '/screens/parent-upgrade',
  '/screens/parent-weekly-report',
  '/screens/petty-cash-request',
  '/screens/principal-ai-year-planner',
  '/screens/principal-curriculum-themes',
  '/screens/principal-daily-program-planner',
  '/screens/principal-excursions',
  '/screens/principal-learner-activity-control',
  '/screens/principal-lesson-templates',
  '/screens/principal-meetings',
  '/screens/principal-parent-requests',
  '/screens/principal-reports',
  '/screens/principal-registrations',
  '/screens/principal-routine-requests',
  '/screens/principal-seat-management',
  '/screens/principal-stationery',
  '/screens/principal-weekly-plans',
  '/screens/principal-year-planner',
  '/screens/room-display-connect',
  '/screens/school-settings',
  '/screens/start-live-lesson',
  '/screens/staff-leave',
  '/screens/super-admin-admin-management',
  '/screens/super-admin-ai-command-center',
  '/screens/super-admin-ai-quotas',
  '/screens/super-admin-announcements',
  '/screens/super-admin-dashboard',
  '/screens/super-admin-moderation',
  '/screens/super-admin-platform-command-center',
  '/screens/super-admin-system-monitoring',
  '/screens/super-admin-system-test',
  '/screens/super-admin-users',
  '/screens/super-admin-whatsapp',
  '/screens/super-admin/school-onboarding-wizard',
  '/screens/teacher-approval',
  '/screens/teacher-daily-program-planner',
  '/screens/teacher-reports',
  '/screens/teacher-routine-requests',
  '/screens/timetable-management',
  '/screens/waitlist-management',
];

function mapFeatureRolesToSearchRoles(roles: unknown): FunctionSearchRole[] | undefined {
  if (!Array.isArray(roles)) return undefined;
  const mapped = roles
    .map((role) => FEATURE_ROLE_MAP[String(role || '').toLowerCase()])
    .filter(Boolean) as FunctionSearchRole[];
  return mapped.length > 0 ? Array.from(new Set(mapped)) : undefined;
}

function toTitleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');
}

function cleanRouteForTokens(route: string): string {
  return String(route || '')
    .replace(/\?.*$/, '')
    .replace(/[()]/g, '')
    .replace(/^\//, '');
}

function routeToTitle(route: string): string {
  const cleaned = cleanRouteForTokens(route);
  if (!cleaned) return 'Feature';
  const segments = cleaned.split('/').filter(Boolean);
  const last = segments[segments.length - 1] || cleaned;
  const phrase = last.replace(/[-_]+/g, ' ');
  return toTitleCase(phrase);
}

function routeToSection(route: string): string {
  const value = route.toLowerCase();
  if (value.includes('/membership/')) return 'Membership';
  if (value.includes('/org-admin')) return 'Organization';
  if (value.includes('/super-admin')) return 'Platform Admin';
  if (value.includes('/dash')) return 'Dash AI';
  if (value.includes('message')) return 'Messaging';
  if (value.includes('payment') || value.includes('fee') || value.includes('finance') || value.includes('budget')) return 'Finance';
  if (value.includes('document') || value.includes('report')) return 'Documents';
  if (value.includes('attendance') || value.includes('lesson') || value.includes('homework') || value.includes('exam')) return 'Learning';
  return 'Navigation';
}

function routeToKeywords(route: string, title: string, description: string): string[] {
  const routeTokens = cleanRouteForTokens(route)
    .split(/[\/_-]+/)
    .filter(Boolean);
  const titleTokens = title.toLowerCase().split(/\s+/).filter(Boolean);
  const descriptionTokens = description.toLowerCase().split(/[^\w]+/).filter((token) => token.length > 2);
  return Array.from(new Set([...routeTokens, ...titleTokens, ...descriptionTokens]));
}

function inferRolesFromRoute(route: string): FunctionSearchRole[] | undefined {
  const value = route.toLowerCase();
  if (value.includes('/super-admin')) return ['super_admin'];
  if (value.includes('/principal-')) return ['principal', 'principal_admin', 'super_admin'];
  if (value.includes('/teacher-') || value.includes('/assign-lesson') || value.includes('/class-teacher')) {
    return ['teacher', 'principal', 'principal_admin', 'super_admin'];
  }
  if (value.includes('/parent-') || value.includes('/(k12)/parent/')) return ['parent'];
  if (value.includes('/learner/') || value.includes('/(k12)/student/')) return ['student'];
  if (value.includes('/org-admin')) return ['principal', 'principal_admin', 'super_admin'];
  if (value.includes('/membership/')) return ['teacher', 'principal', 'principal_admin', 'super_admin'];
  return undefined;
}

/**
 * Routes known to not have corresponding screen files.
 * These are excluded from auto-generated search results to prevent
 * navigation to non-existent screens.
 */
const INVALID_ROUTE_BLOCKLIST = new Set([
  '/screens/parent-events',
  '/screens/search',
]);

function buildAutoScreenIndex(base: FunctionSearchItem[]): FunctionSearchItem[] {
  const existingRoutes = new Set(base.map((item) => item.route));
  const autoItems: FunctionSearchItem[] = [];

  Object.entries(EDUDASH_SCREENS).forEach(([key, screen]) => {
    const route = String(screen.route || '');
    if (!route || existingRoutes.has(route)) return;
    if (!route.startsWith('/screens/') && !route.startsWith('/(k12)/')) return;
    if (INVALID_ROUTE_BLOCKLIST.has(route)) return;
    const title = String(screen.title || routeToTitle(route));
    const description = String(screen.description || `Open ${title}`);
    const section = routeToSection(route);
    autoItems.push({
      id: `feature-${key}`,
      title,
      description,
      route,
      icon: section === 'Dash AI' ? 'sparkles' : section === 'Finance' ? 'cash' : section === 'Documents' ? 'documents' : 'grid',
      section,
      keywords: routeToKeywords(route, title, description),
      roles: mapFeatureRolesToSearchRoles(screen.roles) || inferRolesFromRoute(route),
      priority: 24,
    });
    existingRoutes.add(route);
  });

  APP_WIDE_ROUTE_CANDIDATES.forEach((route) => {
    if (!route || existingRoutes.has(route)) return;
    if (INVALID_ROUTE_BLOCKLIST.has(route)) return;
    const title = routeToTitle(route);
    const description = `Open ${title} screen`;
    const section = routeToSection(route);
    autoItems.push({
      id: `route-${cleanRouteForTokens(route).replace(/[^\w]+/g, '-')}`,
      title,
      description,
      route,
      icon: section === 'Dash AI' ? 'sparkles' : section === 'Finance' ? 'cash' : section === 'Documents' ? 'documents' : 'grid',
      section,
      keywords: routeToKeywords(route, title, description),
      roles: inferRolesFromRoute(route),
      priority: 18,
    });
    existingRoutes.add(route);
  });

  return autoItems;
}

const ALL_FUNCTION_SEARCH_INDEX: FunctionSearchItem[] = [
  ...FUNCTION_SEARCH_INDEX,
  ...buildAutoScreenIndex(FUNCTION_SEARCH_INDEX),
];

const ROLE_EQUIVALENTS: Record<string, FunctionSearchRole> = {
  learner: 'student',
  admin: 'principal_admin',
  superadmin: 'super_admin',
};

function normalizeRoleForSearch(rawRole?: string | null): FunctionSearchRole {
  const normalized = String(rawRole || '').trim().toLowerCase();
  if (!normalized) return 'parent';
  if (normalized in ROLE_EQUIVALENTS) return ROLE_EQUIVALENTS[normalized];
  if (normalized === 'principal' || normalized === 'principal_admin' || normalized === 'teacher' || normalized === 'parent' || normalized === 'student' || normalized === 'super_admin') {
    return normalized;
  }
  if (normalized.includes('super')) return 'super_admin';
  if (normalized.includes('principal')) return 'principal_admin';
  if (normalized.includes('teacher')) return 'teacher';
  if (normalized.includes('student') || normalized.includes('learner')) return 'student';
  return 'parent';
}

function canRoleAccess(item: FunctionSearchItem, role: FunctionSearchRole): boolean {
  if (!item.roles || item.roles.length === 0) return true;
  return item.roles.includes('all') || item.roles.includes(role);
}

function matchesScope(item: FunctionSearchItem, scope: FunctionSearchScope): boolean {
  if (scope === 'all') return true;
  return (item.scope || 'all') === scope;
}

function withVariantForms(token: string): string[] {
  const t = token.trim().toLowerCase();
  if (!t) return [];
  const variants = new Set<string>([t]);
  if (t.endsWith('ies') && t.length > 3) variants.add(`${t.slice(0, -3)}y`);
  if (t.endsWith('es') && t.length > 3) variants.add(t.slice(0, -2));
  if (t.endsWith('s') && t.length > 2) variants.add(t.slice(0, -1));
  if (!t.endsWith('s')) variants.add(`${t}s`);
  return [...variants].filter(Boolean);
}

function buildQueryTokenSet(query: string): string[] {
  const rawTokens = query
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const expanded = new Set<string>();
  rawTokens.forEach((token) => {
    withVariantForms(token).forEach((variant) => expanded.add(variant));
  });
  return [...expanded];
}

function scoreItem(item: FunctionSearchItem, queryTokens: string[]): number {
  const title = item.title.toLowerCase();
  const description = item.description.toLowerCase();
  const section = item.section.toLowerCase();
  const keywordText = item.keywords.join(' ').toLowerCase();
  const route = item.route.toLowerCase();
  const haystack = `${title} ${description} ${section} ${keywordText} ${route}`;

  let score = 0;
  queryTokens.forEach((token) => {
    if (title.startsWith(token)) score += 30;
    if (title.includes(token)) score += 18;
    if (keywordText.includes(token)) score += 12;
    if (description.includes(token)) score += 8;
    if (section.includes(token)) score += 6;
    if (route.includes(token)) score += 6;
    if (haystack.includes(token)) score += 2;
  });

  if (score <= 0) return 0;
  return score + ((item.priority || 0) / 1000);
}

export interface FunctionSearchQuery {
  role?: string | null;
  query?: string | null;
  scope?: FunctionSearchScope;
}

export function getFunctionSearchItems({
  role,
  query,
  scope = 'all',
}: FunctionSearchQuery): FunctionSearchItem[] {
  const normalizedRole = normalizeRoleForSearch(role);
  const tokens = buildQueryTokenSet(String(query || ''));

  const base = ALL_FUNCTION_SEARCH_INDEX.filter((item) => canRoleAccess(item, normalizedRole) && matchesScope(item, scope));
  if (tokens.length === 0) {
    return [...base]
      .filter((item) => (item.priority || 0) >= 30)
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  const ranked = base
    .map((item) => ({
      item,
      score: scoreItem(item, tokens),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);

  return ranked.map(({ item }) => item);
}
