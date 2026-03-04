/**
 * EduDash Pro Feature Constants
 * 
 * Centralized knowledge base containing all platform features, database schema,
 * screens, subscription tiers, and context for the Dash AI Assistant.
 * 
 * This is the single source of truth for Dash's understanding of EduDash Pro.
 */

export type UserRole = 'teacher' | 'principal' | 'parent' | 'super_admin';
export type TierLevel = 'free' | 'starter' | 'premium' | 'enterprise';
export type RiskLevel = 'low' | 'medium' | 'high';

export interface Feature {
  id: string;
  name: string;
  description: string;
  roles: UserRole[];
  tiers: TierLevel[];
  riskLevel: RiskLevel;
  triggers: string[];
  utterances: string[];
  relatedScreens?: string[];
  relatedTables?: string[];
}

export const EDUDASH_FEATURES: Record<string, Feature> = {
  attendance: {
    id: 'attendance',
    name: 'Attendance Tracking',
    description: 'Mark and track student attendance with quick mark all, notes, and historical reports',
    roles: ['teacher', 'principal'],
    tiers: ['starter', 'premium', 'enterprise'],
    riskLevel: 'medium',
    triggers: ['morning', '8:00-9:30', 'class start', 'daily', 'Monday', 'week start'],
    utterances: [
      'mark attendance',
      'take attendance',
      'who is absent',
      'attendance report',
      'check who is present',
      'attendance register'
    ],
    relatedScreens: ['/(parent)/attendance', '/screens/attendance'],
    relatedTables: ['attendance', 'students', 'classes']
  },
  
  lesson_planning: {
    id: 'lesson_planning',
    name: 'Lesson Planning',
    description: 'Create, organize, and share lesson plans with CAPS alignment',
    roles: ['teacher', 'principal'],
    tiers: ['premium', 'enterprise'],
    riskLevel: 'low',
    triggers: ['Sunday', 'weekend', 'week start', 'planning time', 'curriculum'],
    utterances: [
      'create lesson plan',
      'plan lessons',
      'view lesson plans',
      'share lesson plan',
      'CAPS aligned lessons',
      'activity ideas'
    ],
    relatedScreens: ['/screens/lesson-plans', '/screens/ai-lesson-generator'],
    relatedTables: ['lesson_plans']
  },
  
  grading: {
    id: 'grading',
    name: 'Student Grading',
    description: 'Record assessments, track progress, generate report cards',
    roles: ['teacher', 'principal'],
    tiers: ['starter', 'premium', 'enterprise'],
    riskLevel: 'high',
    triggers: ['end of term', 'Friday', 'afternoon', 'assessment', 'grading time'],
    utterances: [
      'add grades',
      'record assessment',
      'update marks',
      'generate report card',
      'view student progress',
      'mark work'
    ],
    relatedScreens: ['/screens/grades'],
    relatedTables: ['grades', 'assessments', 'students']
  },
  
  parent_communication: {
    id: 'parent_communication',
    name: 'Parent Communication',
    description: 'In-app messaging, notifications, and parent portal access',
    roles: ['teacher', 'principal', 'parent'],
    tiers: ['starter', 'premium', 'enterprise'],
    riskLevel: 'low',
    triggers: ['incident', 'achievement', 'reminder needed', 'update'],
    utterances: [
      'message parents',
      'send note to parent',
      'parent communication',
      'notify parent',
      'view parent messages',
      'contact guardian'
    ],
    relatedScreens: ['/(parent)/home', '/screens/messages', '/screens/teacher-message-list'],
    relatedTables: ['messages', 'users']
  },
  
  financial_dashboard: {
    id: 'financial_dashboard',
    name: 'Financial Dashboard',
    description: 'Track fees, expenses, generate financial reports',
    roles: ['principal', 'super_admin'],
    tiers: ['premium', 'enterprise'],
    riskLevel: 'high',
    triggers: ['month end', 'week end', 'morning', 'fee due', 'payment'],
    utterances: [
      'view finances',
      'check fees',
      'fee collection',
      'financial report',
      'outstanding payments',
      'revenue report'
    ],
    relatedScreens: ['/screens/financial-dashboard'],
    relatedTables: ['fees', 'transactions', 'students']
  },
  
  worksheetGeneration: {
    id: 'worksheet_generation',
    name: 'Worksheet Generator',
    description: 'Generate educational worksheets for practice and assessment',
    roles: ['teacher', 'principal'],
    tiers: ['starter', 'premium', 'enterprise'],
    riskLevel: 'low',
    triggers: ['homework needed', 'practice needed', 'assessment prep', 'activity'],
    utterances: [
      'Create worksheet',
      'Generate math worksheet',
      'Practice activities',
      'Homework sheet',
      'Activity worksheet',
      'Print worksheet'
    ],
    relatedScreens: ['/screens/worksheet-demo'],
    relatedTables: []
  },
  
  student_profiles: {
    id: 'student_profiles',
    name: 'Student Profiles',
    description: 'Manage student information, medical info, emergency contacts',
    roles: ['teacher', 'principal', 'parent'],
    tiers: ['starter', 'premium', 'enterprise'],
    riskLevel: 'medium',
    triggers: ['enrollment', 'new student', 'update needed', 'student info'],
    utterances: [
      'view student profile',
      'student information',
      'update student details',
      'medical information',
      'emergency contacts',
      'student records'
    ],
    relatedScreens: ['/(parent)/students', '/screens/student-profile', '/screens/student-management'],
    relatedTables: ['students', 'medical_info', 'emergency_contacts']
  },
  
  reports: {
    id: 'reports',
    name: 'Reports & Analytics',
    description: 'Generate attendance, academic, financial, and custom reports',
    roles: ['principal', 'teacher'],
    tiers: ['premium', 'enterprise'],
    riskLevel: 'low',
    triggers: ['end of week', 'end of month', 'Friday', 'quarter end'],
    utterances: [
      'generate report',
      'view reports',
      'attendance report',
      'academic report',
      'export report',
      'class analytics'
    ],
    relatedScreens: ['/screens/reports', '/screens/teacher-reports'],
    relatedTables: ['attendance', 'grades', 'students', 'fees']
  },
  
  whatsapp_integration: {
    id: 'whatsapp_integration',
    name: 'WhatsApp Integration',
    description: 'Connect and broadcast messages via WhatsApp',
    roles: ['principal', 'teacher'],
    tiers: ['premium', 'enterprise'],
    riskLevel: 'medium',
    triggers: ['urgent', 'broadcast needed', 'bulk message', 'emergency'],
    utterances: [
      'send WhatsApp',
      'broadcast to parents',
      'WhatsApp message',
      'connect WhatsApp',
      'bulk message',
      'emergency alert'
    ],
    relatedScreens: ['/screens/whatsapp-connector'],
    relatedTables: ['messages']
  },
  
  voice_notes: {
    id: 'voice_notes',
    name: 'Voice Notes',
    description: 'Record, transcribe, and organize voice notes with AI summaries',
    roles: ['teacher', 'principal'],
    tiers: ['premium', 'enterprise'],
    riskLevel: 'low',
    triggers: ['voice message', 'quick note', 'hands-free', 'recording'],
    utterances: [
      'record voice note',
      'voice memo',
      'transcribe audio',
      'view voice notes',
      'audio notes',
      'talk to type'
    ],
    relatedScreens: ['/screens/voice-notes'],
    relatedTables: ['voice_notes']
  },
  
  class_management: {
    id: 'class_management',
    name: 'Class Management',
    description: 'Organize classes, assign teachers, manage schedules',
    roles: ['principal'],
    tiers: ['starter', 'premium', 'enterprise'],
    riskLevel: 'medium',
    triggers: ['new term', 'class setup', 'schedule', 'organization'],
    utterances: [
      'manage classes',
      'assign teacher',
      'class schedule',
      'view classes',
      'create class',
      'class roster'
    ],
    relatedScreens: ['/screens/classes'],
    relatedTables: ['classes', 'teachers', 'students']
  },
  
  announcement_system: {
    id: 'announcement_system',
    name: 'Announcement System',
    description: 'Create and send announcements to parents, teachers, or entire preschool',
    roles: ['principal', 'teacher'],
    tiers: ['starter', 'premium', 'enterprise'],
    riskLevel: 'medium',
    triggers: ['important news', 'school event', 'update needed', 'broadcast'],
    utterances: [
      'send announcement',
      'create announcement',
      'notify parents',
      'broadcast message',
      'school announcement',
      'important notice'
    ],
    relatedScreens: ['/screens/announcements', '/screens/principal-announcement'],
    relatedTables: ['announcements', 'users']
  },

  ai_assistant: {
    id: 'ai_assistant',
    name: 'Dash AI Assistant',
    description: 'Conversational AI assistant with voice support and context awareness',
    roles: ['teacher', 'principal', 'parent'],
    tiers: ['premium', 'enterprise'],
    riskLevel: 'low',
    triggers: [],
    utterances: [
      'ask dash',
      'help me with',
      'dash can you',
      'voice command',
      'ai help',
      'assistant'
    ],
    relatedScreens: ['/(parent)/dash', '/screens/dash-assistant'],
    relatedTables: ['ai_usage_logs', 'conversation_history']
  },

  document_management: {
    id: 'document_management',
    name: 'Document Management',
    description: 'Upload, organize, and share documents with OCR and search',
    roles: ['teacher', 'principal'],
    tiers: ['premium', 'enterprise'],
    riskLevel: 'low',
    triggers: [],
    utterances: [
      'upload document',
      'view documents',
      'search documents',
      'share file',
      'document library',
      'file management'
    ],
    relatedScreens: ['/screens/documents'],
    relatedTables: ['documents']
  },

  activity_feed: {
    id: 'activity_feed',
    name: 'Activity Feed',
    description: 'Real-time feed of preschool activities, announcements, and updates',
    roles: ['teacher', 'principal', 'parent'],
    tiers: ['starter', 'premium', 'enterprise'],
    riskLevel: 'low',
    triggers: [],
    utterances: [
      'view activity feed',
      'recent activities',
      'what\'s new',
      'school updates',
      'activity timeline',
      'recent events'
    ],
    relatedScreens: ['/(parent)/home'],
    relatedTables: ['activities', 'announcements']
  },

  worksheet_generation: {
    id: 'worksheet_generation',
    name: 'Worksheet Generator',
    description: 'Generate educational worksheets for practice and assessment',
    roles: ['teacher', 'principal'],
    tiers: ['starter', 'premium', 'enterprise'],
    riskLevel: 'low',
    triggers: ['homework needed', 'practice needed', 'assessment prep'],
    utterances: [
      'create worksheet',
      'generate math worksheet',
      'practice activities',
      'homework sheet',
      'activity worksheet',
      'print worksheet'
    ],
    relatedScreens: ['/screens/worksheet-demo'],
    relatedTables: []
  }
};

export interface DbTable {
  table: string;
  purpose: string;
  keyCols: string[];
  rlsRequired: boolean;
  roles: UserRole[];
}

export const EDUDASH_DB: Record<string, DbTable> = {
  preschools: {
    table: 'preschools',
    purpose: 'Multi-tenant organization root - each preschool is isolated',
    keyCols: ['id', 'name', 'subscription_tier', 'owner_id'],
    rlsRequired: true,
    roles: ['super_admin', 'principal']
  },

  users: {
    table: 'users',
    purpose: 'User accounts with role and preschool association',
    keyCols: ['id', 'email', 'role', 'preschool_id', 'full_name'],
    rlsRequired: true,
    roles: ['teacher', 'principal', 'parent', 'super_admin']
  },

  students: {
    table: 'students',
    purpose: 'Student records with demographic and enrollment data',
    keyCols: ['id', 'first_name', 'last_name', 'preschool_id', 'class_id', 'date_of_birth'],
    rlsRequired: true,
    roles: ['teacher', 'principal', 'parent']
  },

  classes: {
    table: 'classes',
    purpose: 'Class/grade groupings with teacher assignments',
    keyCols: ['id', 'name', 'preschool_id', 'teacher_id', 'age_group'],
    rlsRequired: true,
    roles: ['teacher', 'principal']
  },

  attendance: {
    table: 'attendance',
    purpose: 'Daily attendance records with status and notes',
    keyCols: ['id', 'student_id', 'date', 'status', 'preschool_id'],
    rlsRequired: true,
    roles: ['teacher', 'principal']
  },

  grades: {
    table: 'grades',
    purpose: 'Assessment results and student performance tracking',
    keyCols: ['id', 'student_id', 'assessment_id', 'score', 'preschool_id'],
    rlsRequired: true,
    roles: ['teacher', 'principal']
  },

  assessments: {
    table: 'assessments',
    purpose: 'Assessment definitions with CAPS alignment',
    keyCols: ['id', 'name', 'class_id', 'preschool_id', 'total_marks', 'caps_code'],
    rlsRequired: true,
    roles: ['teacher', 'principal']
  },

  lesson_plans: {
    table: 'lesson_plans',
    purpose: 'Structured lesson plans with CAPS curriculum alignment',
    keyCols: ['id', 'title', 'class_id', 'preschool_id', 'caps_aligned', 'date'],
    rlsRequired: true,
    roles: ['teacher', 'principal']
  },

  announcements: {
    table: 'announcements',
    purpose: 'Preschool-wide or targeted announcements',
    keyCols: ['id', 'title', 'preschool_id', 'author_id', 'target_roles', 'created_at'],
    rlsRequired: true,
    roles: ['teacher', 'principal', 'parent']
  },

  fees: {
    table: 'fees',
    purpose: 'Fee structures and payment tracking',
    keyCols: ['id', 'student_id', 'preschool_id', 'amount', 'due_date', 'status'],
    rlsRequired: true,
    roles: ['principal', 'parent']
  },

  transactions: {
    table: 'transactions',
    purpose: 'Financial transaction records',
    keyCols: ['id', 'preschool_id', 'type', 'amount', 'date', 'student_id'],
    rlsRequired: true,
    roles: ['principal']
  },

  documents: {
    table: 'documents',
    purpose: 'File storage with metadata and OCR text',
    keyCols: ['id', 'preschool_id', 'uploader_id', 'file_path', 'ocr_text'],
    rlsRequired: true,
    roles: ['teacher', 'principal']
  },

  voice_notes: {
    table: 'voice_notes',
    purpose: 'Voice recordings with transcriptions',
    keyCols: ['id', 'preschool_id', 'user_id', 'audio_url', 'transcription'],
    rlsRequired: true,
    roles: ['teacher', 'principal']
  },

  messages: {
    table: 'messages',
    purpose: 'In-app messaging between users',
    keyCols: ['id', 'preschool_id', 'sender_id', 'recipient_id', 'content'],
    rlsRequired: true,
    roles: ['teacher', 'principal', 'parent']
  },

  ai_usage_logs: {
    table: 'ai_usage_logs',
    purpose: 'Track AI requests for billing and rate limiting',
    keyCols: ['id', 'preschool_id', 'user_id', 'model', 'tokens', 'timestamp'],
    rlsRequired: true,
    roles: ['super_admin']
  },

  conversation_history: {
    table: 'conversation_history',
    purpose: 'Chat history for Dash AI assistant',
    keyCols: ['id', 'preschool_id', 'user_id', 'messages', 'context'],
    rlsRequired: true,
    roles: ['teacher', 'principal', 'parent']
  },

  activities: {
    table: 'activities',
    purpose: 'Activity feed items for real-time updates',
    keyCols: ['id', 'preschool_id', 'type', 'actor_id', 'data', 'timestamp'],
    rlsRequired: true,
    roles: ['teacher', 'principal', 'parent']
  },

  medical_info: {
    table: 'medical_info',
    purpose: 'Student medical information and allergies',
    keyCols: ['id', 'student_id', 'preschool_id', 'conditions', 'allergies'],
    rlsRequired: true,
    roles: ['teacher', 'principal', 'parent']
  },

  emergency_contacts: {
    table: 'emergency_contacts',
    purpose: 'Student emergency contact information',
    keyCols: ['id', 'student_id', 'preschool_id', 'name', 'phone', 'relationship'],
    rlsRequired: true,
    roles: ['teacher', 'principal', 'parent']
  }
};

export interface Screen {
  route: string;
  title: string;
  description: string;
  roles: UserRole[];
  quickActions?: string[];
  relatedFeatures?: string[];
}

export const EDUDASH_SCREENS: Record<string, Screen> = {
  parent_home: {
    route: '/(parent)/home',
    title: 'Home',
    description: 'Parent dashboard with activity feed, quick actions, and notifications',
    roles: ['parent'],
    quickActions: ['View Attendance', 'Check Fees', 'Send Message', 'View Announcements'],
    relatedFeatures: ['activity_feed', 'parent_communication', 'attendance']
  },

  parent_students: {
    route: '/(parent)/students',
    title: 'My Children',
    description: 'View and manage children profiles, attendance, grades',
    roles: ['parent'],
    quickActions: ['View Profile', 'Check Attendance', 'View Grades', 'Medical Info'],
    relatedFeatures: ['student_profiles', 'attendance', 'grading']
  },

  parent_attendance: {
    route: '/(parent)/attendance',
    title: 'Attendance',
    description: 'View children attendance history and patterns',
    roles: ['parent'],
    relatedFeatures: ['attendance']
  },

  parent_dash: {
    route: '/(parent)/dash',
    title: 'Dash AI',
    description: 'AI assistant for questions, help, and automation',
    roles: ['parent', 'teacher', 'principal'],
    quickActions: ['Voice Input', 'Ask Question', 'Quick Commands'],
    relatedFeatures: ['ai_assistant']
  },
  
  teacher_attendance: {
    route: '/screens/attendance',
    title: 'Mark Attendance',
    description: 'Take attendance for classes with quick mark all',
    roles: ['teacher', 'principal'],
    quickActions: ['Mark All Present', 'Mark All Absent', 'Add Note', 'View Report'],
    relatedFeatures: ['attendance']
  },

  teacher_grades: {
    route: '/screens/grades',
    title: 'Grades & Assessments',
    description: 'Record grades, create assessments, generate reports',
    roles: ['teacher', 'principal'],
    quickActions: ['Add Grade', 'Create Assessment', 'Generate Report Card'],
    relatedFeatures: ['grading']
  },

  teacher_lessons: {
    route: '/screens/lesson-plans',
    title: 'Lesson Plans',
    description: 'Create and manage CAPS-aligned lesson plans',
    roles: ['teacher', 'principal'],
    quickActions: ['New Lesson', 'View Plans', 'Share Plan', 'CAPS Search'],
    relatedFeatures: ['lesson_planning']
  },

  ai_lesson_generator: {
    route: '/screens/ai-lesson-generator',
    title: 'AI Lesson Generator',
    description: 'Generate CAPS-aligned lessons with AI',
    roles: ['teacher', 'principal'],
    quickActions: ['Generate Lesson', 'View Templates', 'Save Draft'],
    relatedFeatures: ['lesson_planning', 'ai_assistant']
  },

  principal_financial: {
    route: '/screens/financial-dashboard',
    title: 'Financial Dashboard',
    description: 'Fee tracking, expenses, financial reports',
    roles: ['principal'],
    quickActions: ['View Fees', 'Add Expense', 'Generate Report', 'Outstanding Payments'],
    relatedFeatures: ['financial_dashboard']
  },

  principal_reports: {
    route: '/screens/reports',
    title: 'Reports & Analytics',
    description: 'Generate and export various reports',
    roles: ['principal', 'teacher'],
    quickActions: ['Attendance Report', 'Financial Report', 'Academic Report', 'Custom Report'],
    relatedFeatures: ['reports']
  },

  teacher_reports: {
    route: '/screens/teacher-reports',
    title: 'Teacher Reports',
    description: 'Student progress and analytics',
    roles: ['teacher', 'principal'],
    quickActions: ['Generate Report', 'View Analytics', 'Export Data'],
    relatedFeatures: ['reports']
  },

  announcements: {
    route: '/screens/principal-announcement',
    title: 'Announcements',
    description: 'Create and manage preschool announcements',
    roles: ['principal', 'teacher'],
    quickActions: ['New Announcement', 'View Sent', 'Schedule Announcement'],
    relatedFeatures: ['announcement_system']
  },

  principal_announcement: {
    route: '/screens/principal-announcement',
    title: 'Principal Announcements',
    description: 'Create school-wide announcements',
    roles: ['principal'],
    quickActions: ['New Announcement', 'View History', 'Schedule'],
    relatedFeatures: ['announcement_system']
  },

  classes: {
    route: '/screens/classes',
    title: 'Class Management',
    description: 'Manage classes, assign teachers, organize students',
    roles: ['principal'],
    quickActions: ['Create Class', 'Assign Teacher', 'View Students', 'Edit Schedule'],
    relatedFeatures: ['class_management']
  },

  documents: {
    route: '/screens/documents',
    title: 'Documents',
    description: 'Upload, organize, and search documents',
    roles: ['teacher', 'principal'],
    quickActions: ['Upload Document', 'Search', 'Create Folder', 'Share'],
    relatedFeatures: ['document_management']
  },

  voice_notes: {
    route: '/screens/voice-notes',
    title: 'Voice Notes',
    description: 'Record and manage voice notes with transcriptions',
    roles: ['teacher', 'principal'],
    quickActions: ['Record Note', 'View All', 'Search Transcriptions'],
    relatedFeatures: ['voice_notes']
  },

  messages: {
    route: '/screens/messages',
    title: 'Messages',
    description: 'In-app messaging with parents and staff',
    roles: ['teacher', 'principal', 'parent'],
    quickActions: ['New Message', 'View Inbox', 'Mark Read'],
    relatedFeatures: ['parent_communication']
  },

  teacher_messages: {
    route: '/screens/teacher-message-list',
    title: 'Teacher Messages',
    description: 'Communicate with parents',
    roles: ['teacher', 'principal'],
    quickActions: ['New Message', 'View Inbox', 'Templates'],
    relatedFeatures: ['parent_communication']
  },

  student_profile: {
    route: '/screens/student-profile',
    title: 'Student Profile',
    description: 'Detailed student information and records',
    roles: ['teacher', 'principal', 'parent'],
    quickActions: ['Edit Info', 'View Attendance', 'View Grades', 'Medical Info', 'Emergency Contacts'],
    relatedFeatures: ['student_profiles']
  },

  student_management: {
    route: '/screens/student-management',
    title: 'Student Management',
    description: 'Manage student enrollment and profiles',
    roles: ['teacher', 'principal'],
    quickActions: ['Add Student', 'View Roster', 'Export List'],
    relatedFeatures: ['student_profiles']
  },

  worksheet_demo: {
    route: '/screens/worksheet-demo',
    title: 'Worksheet Generator',
    description: 'Create printable worksheets',
    roles: ['teacher', 'principal'],
    quickActions: ['Generate Worksheet', 'Customize', 'Download PDF'],
    relatedFeatures: ['worksheet_generation']
  },

  dash_assistant: {
    route: '/screens/dash-assistant',
    title: 'Dash AI Assistant',
    description: 'AI-powered educational assistant',
    roles: ['teacher', 'principal', 'parent'],
    quickActions: ['Ask Question', 'Voice Note', 'View History'],
    relatedFeatures: ['ai_assistant']
  },

  dash_settings: {
    route: '/screens/dash-ai-settings',
    title: 'Dash Settings',
    description: 'Configure AI assistant preferences',
    roles: ['teacher', 'principal', 'parent'],
    quickActions: ['Autonomy Level', 'Voice Settings', 'Clear Memory'],
    relatedFeatures: ['ai_assistant']
  },

  whatsapp_connector: {
    route: '/screens/whatsapp-connector',
    title: 'WhatsApp Integration',
    description: 'Connect and manage WhatsApp broadcasting',
    roles: ['principal', 'teacher'],
    quickActions: ['Connect Account', 'Broadcast', 'View History'],
    relatedFeatures: ['whatsapp_integration']
  }
};

export interface SubscriptionTier {
  id: string;
  name: string;
  features: string[];
  aiLimits: {
    requestsPerHour: number;
    requestsPerDay: number;
    modelsAllowed: string[];
  };
  storage: {
    documents: number; // -1 = unlimited
    voiceNotes: number;
  };
}

export const SUBSCRIPTION_TIERS: Record<string, SubscriptionTier> = {
  free: {
    id: 'free',
    name: 'Free Trial',
    features: ['basic_attendance', 'limited_students'],
    aiLimits: {
      requestsPerHour: 5,
      requestsPerDay: 20,
      modelsAllowed: ['haiku']
    },
    storage: {
      documents: 10,
      voiceNotes: 5
    }
  },

  starter: {
    id: 'starter',
    name: 'Starter',
    features: [
      'attendance',
      'student_profiles',
      'class_management',
      'announcement_system',
      'parent_communication',
      'activity_feed',
      'worksheet_generation'
    ],
    aiLimits: {
      requestsPerHour: 15,
      requestsPerDay: 100,
      modelsAllowed: ['haiku', 'sonnet']
    },
    storage: {
      documents: 100,
      voiceNotes: 50
    }
  },

  premium: {
    id: 'premium',
    name: 'Premium',
    features: [
      'all_starter_features',
      'grading',
      'lesson_planning',
      'financial_dashboard',
      'reports',
      'ai_assistant',
      'document_management',
      'voice_notes',
      'whatsapp_integration'
    ],
    aiLimits: {
      requestsPerHour: 50,
      requestsPerDay: 500,
      modelsAllowed: ['haiku', 'sonnet', 'opus']
    },
    storage: {
      documents: 1000,
      voiceNotes: 500
    }
  },

  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    features: [
      'all_premium_features',
      'custom_integrations',
      'advanced_analytics',
      'dedicated_support',
      'custom_branding'
    ],
    aiLimits: {
      requestsPerHour: 200,
      requestsPerDay: 2000,
      modelsAllowed: ['haiku', 'sonnet', 'opus']
    },
    storage: {
      documents: -1, // unlimited
      voiceNotes: -1
    }
  }
};

export const EDGE_FUNCTIONS = {
  ai_proxy: {
    name: 'ai-proxy',
    description: 'Secure AI request proxy with usage tracking and PII redaction',
    endpoint: '/functions/v1/ai-proxy',
    roles: ['teacher', 'principal', 'parent']
  },
  
  report_generator: {
    name: 'report-generator',
    description: 'Generate PDF reports for attendance, grades, financials',
    endpoint: '/functions/v1/report-generator',
    roles: ['teacher', 'principal']
  },

  notification_dispatcher: {
    name: 'notification-dispatcher',
    description: 'Send push notifications and emails',
    endpoint: '/functions/v1/notification-dispatcher',
    roles: ['teacher', 'principal']
  },

  data_sync: {
    name: 'data-sync',
    description: 'Sync data across devices and handle offline changes',
    endpoint: '/functions/v1/data-sync',
    roles: ['teacher', 'principal', 'parent']
  }
};

export const SA_CONTEXT = {
  curriculum: 'CAPS',
  locale: 'en-ZA',
  targetAudience: 'South African preschools',
  ageRange: '3-7 years',
  focusAreas: ['Early Childhood Development', 'Foundation Phase', 'Grade R'],
  notes: [
    'CAPS (Curriculum and Assessment Policy Statement) aligned',
    'Focus on early childhood development (ages 3-7)',
    'Multi-lingual support (English, Afrikaans, Zulu, Sesotho)',
    'Culturally appropriate content for South African context',
    'Mobile-first design for low-bandwidth environments',
    'Emphasis on play-based learning and holistic development'
  ],
  languages: [
    { code: 'en', name: 'English', official: true },
    { code: 'af', name: 'Afrikaans', official: true },
    { code: 'zu', name: 'Zulu', official: true },
    { code: 'st', name: 'Sesotho', official: true }
  ]
};

/**
 * Navigation notes for Dash AI Assistant
 * CRITICAL: EduDash Pro uses STACK navigation, not tabs!
 */
export const NAVIGATION_CONTEXT = {
  type: 'Stack',
  notes: [
    'Stack navigation - NO tabs, NO drawer menu',
    'Use back button or swipe to go back',
    'router.push() for forward navigation',
    'Deep linking supported for all screens',
    'No hamburger menu - actions are contextual'
  ]
};

/**
 * Security and RLS context for database operations
 */
export const SECURITY_CONTEXT = {
  multiTenant: true,
  tenantKey: 'preschool_id',
  rlsEnforced: true,
  notes: [
    'All database queries MUST filter by preschool_id',
    'RLS (Row Level Security) enforced at database level',
    'Never query across tenants - data isolation is critical',
    'PII includes: full_name, date_of_birth, contact information',
    'High-risk operations require explicit approval',
    'Client-side must use Edge Functions for AI calls'
  ],
  piiFields: [
    'full_name',
    'date_of_birth',
    'email',
    'phone_number',
    'address',
    'id_number',
    'parent_name'
  ]
};
