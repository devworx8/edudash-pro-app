/**
 * Dash AI Type Definitions
 * 
 * All TypeScript interfaces and types for the Dash AI Assistant system.
 * 
 * **Design Principle**: Types have NO dependencies, only exports.
 * This prevents circular dependencies and makes types reusable everywhere.
 * 
 * **Organization**:
 * 1. Core Message Types (DashMessage, DashConversation)
 * 2. Task & Automation Types (DashTask, DashAction, DashReminder)
 * 3. Memory & Context Types (DashMemoryItem, DashUserProfile)
 * 4. Attachment Types (DashAttachment, DashCitation)
 * 5. Personality & Configuration Types (DashPersonality)
 */
// ============================================================================
// 1. CORE MESSAGE TYPES
// ============================================================================

/**
 * DashMessage represents a single message in a conversation
 * 
 * **Usage**: Both user input and AI responses
 * **Storage**: AsyncStorage (local) + Supabase (cloud backup)
 * 
 * **Key Fields**:
 * - `voiceNote`: Optional voice recording metadata
 * - `attachments`: File attachments (PDFs, images, etc.)
 * - `metadata`: Rich context for AI responses (actions, sentiment, etc.)
 */
export interface DashMessage {
  id: string;
  type: 'user' | 'assistant' | 'system' | 'task_result';
  content: string;
  timestamp: number;
  
  /** Voice recording metadata (if voice input) */
  voiceNote?: {
    audioUri: string;
    duration: number;
    transcript?: string;
    storagePath?: string;  // Supabase storage path
    bucket?: string;        // Supabase bucket name
    contentType?: string;   // MIME type
    language?: string;      // Language code (en-ZA, af-ZA, etc.)
    provider?: string;      // STT provider (azure, google, etc.)
  };
  
  /** File attachments (documents, images, PDFs) */
  attachments?: DashAttachment[];
  
  /** RAG citation references */
  citations?: DashCitation[];
  
  /** Extended metadata for AI responses */
  metadata?: {
    context?: string;
    confidence?: number;
    detected_language?: string;
    response_mode?: 'direct_writing' | 'explain_direct' | 'tutor_interactive';
    language_source?: 'explicit_override' | 'auto_detect' | 'preference';
    source?: string;
    voice_turn?: boolean;
    prefer_streaming_latency?: boolean;
    stream_tool_mode?: 'enabled' | 'deferred';
    tutor_entry_source?: 'teacher_dashboard' | 'default';
    suggested_actions?: string[];
    tutor_phase?: string;
    tutor_question?: boolean;
    tutor_question_text?: string;
    ocr_mode?: boolean;
    ocr_task?: string;
    ocr?: {
      extracted_text?: string;
      confidence?: number;
      document_type?: string;
      analysis?: string;
      unclear_spans?: string[];
      [key: string]: any;
    };
    resolution_status?: 'resolved' | 'needs_clarification' | 'escalated';
    confidence_score?: number;
    escalation_offer?: boolean;
    resolution_meta?: Record<string, any>;
    
    /** References to database entities */
    references?: Array<{
      type: 'lesson' | 'student' | 'assignment' | 'resource' | 'parent' | 'class' | 'task';
      id: string;
      title: string;
      url?: string;
    }>;
    
    /** Dashboard action triggers (navigation, task creation, etc.) */
    dashboard_action?: {
      type: 'switch_layout' | 'open_screen' | 'execute_task' | 'create_reminder' | 'send_notification' | 'export_pdf';
      layout?: 'classic' | 'enhanced';
      route?: string;              // Expo Router path
      params?: any;                // Navigation params
      taskId?: string;
      task?: DashTask;
      reminder?: DashReminder;
      title?: string;              // For PDF export
      content?: string;            // For PDF export
    };
    
    /** Emotion and sentiment analysis */
    emotions?: {
      sentiment: 'positive' | 'negative' | 'neutral';
      confidence: number;
      detected_emotions: string[];
    };
    
    /** Intent recognition */
    user_intent?: {
      primary_intent: string;
      secondary_intents: string[];
      confidence: number;
    };
    
    /** Task execution progress */
    task_progress?: {
      taskId: string;
      status: 'pending' | 'in_progress' | 'completed' | 'failed';
      progress: number;  // 0-100
      next_steps: string[];
    };

    /** Tool results attached to this message (LLM function/tool calls) */
    tool_results?: any;
    tool_name?: string;
    tool_result?: any;
    tool_args?: any;
    tool_summary?: string;
    tool_outcome?: {
      status?: 'success' | 'degraded' | 'failed';
      source?: string;
      errorCode?: string;
      userSafeNote?: string;
      [key: string]: any;
    };
    turn_id?: string;
    tool_origin?: 'auto_planner' | 'server_tool' | 'manual_tool';
    auto_tool_merged?: boolean;
    dash_route_intent?: 'tutor' | 'lesson_generation' | 'weekly_theme_plan' | 'daily_routine_plan';
    response_lifecycle_state?: 'draft_streaming' | 'committed' | 'finalized';
    pdf_artifact?: {
      storagePath?: string;
      downloadUrl?: string;
      signedUrl?: string;
      filename?: string;
      linkType?: string;
      warning?: string;
    };

    /** Render helpers for richer chat UIs */
    render_hints?: {
      compact_tool_card?: boolean;
      highlight_mode?: 'advisor' | 'tutor' | 'orb';
      [key: string]: any;
    };

    /** Server-provided generated image metadata (if not mapped to attachments) */
    generated_images?: Array<{
      id?: string;
      bucket?: string;
      path?: string;
      signed_url?: string;
      prompt?: string;
      mime_type?: string;
      width?: number;
      height?: number;
      provider?: string;
      model?: string;
      expires_at?: string;
    }>;
  };
}

/**
 * Normalized chat history entry used when explicitly overriding model context.
 * This keeps prompt assembly deterministic across Dash clients.
 */
export interface ConversationContextMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * DashConversation represents a conversation thread
 * 
 * **Storage**: AsyncStorage (active conversations)
 * **Lifecycle**: Created on first message, archived after 7 days inactive
 */
export interface DashConversation {
  id: string;
  title: string;              // Auto-generated or user-set
  messages: DashMessage[];
  created_at: number;
  updated_at: number;
  summary?: string;           // AI-generated summary for long conversations
  tags?: string[];            // For categorization/search
}

// ============================================================================
// 2. TASK & AUTOMATION TYPES
// ============================================================================

/**
 * DashTask represents an automated or manual task
 * 
 * **Purpose**: Task automation, workflow management, reminders
 * **Created By**: AI assistant or user
 * **Execution**: Manual (user completes) or Automated (AI executes)
 * 
 * **Example Use Cases**:
 * - "Remind me to grade assignments tomorrow"
 * - "Create weekly lesson plan for Grade 3 Math"
 * - "Send monthly progress reports to parents"
 */
export interface DashTask {
  id: string;
  title: string;
  description: string;
  type: 'one_time' | 'recurring' | 'workflow';
  status: 'pending' | 'in_progress' | 'completed' | 'paused' | 'failed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assignedTo: string;        // User role or specific user ID
  createdBy: string;         // 'Dash' or user ID
  createdAt: number;
  dueDate?: number;
  estimatedDuration?: number;  // In minutes
  steps: DashTaskStep[];
  dependencies?: string[];     // Other task IDs that must complete first
  
  /** Context from the conversation that created this task */
  context: {
    conversationId: string;
    userRole: string;
    relatedEntities: Array<{
      type: 'student' | 'parent' | 'class' | 'lesson' | 'assignment';
      id: string;
      name: string;
    }>;
  };
  
  /** Automation rules (for recurring/workflow tasks) */
  automation?: {
    triggers: string[];                // Event triggers
    conditions: Record<string, any>;   // Conditions to check
    actions: DashAction[];             // Actions to execute
  };
  
  /** Progress tracking */
  progress: {
    currentStep: number;
    completedSteps: string[];
    blockers?: string[];
    notes?: string;
  };
}

/**
 * DashTaskStep represents a single step in a task workflow
 */
export interface DashTaskStep {
  id: string;
  title: string;
  description: string;
  type: 'manual' | 'automated' | 'approval_required';
  status: 'pending' | 'in_progress' | 'completed' | 'skipped' | 'failed';
  estimatedDuration?: number;  // In minutes
  requiredData?: Record<string, any>;
  validation?: {
    required: boolean;
    criteria: string[];
  };
  actions?: DashAction[];
}

/**
 * DashAction represents an executable action
 * 
 * **Types**:
 * - `navigate`: Navigate to a screen
 * - `api_call`: Call Supabase RPC or Edge Function
 * - `notification`: Send push notification
 * - `data_update`: Update database record
 * - `file_generation`: Generate PDF/document
 * - `email_send`: Send email via Edge Function
 */
export interface DashAction {
  id: string;
  type: 'navigate' | 'api_call' | 'notification' | 'data_update' | 'file_generation' | 'email_send';
  parameters: Record<string, any>;
  condition?: Record<string, any>;  // Execute only if condition met
  retries?: number;                 // Retry count for failures
  timeout?: number;                 // Timeout in milliseconds
}

/**
 * DashReminder represents a time-based reminder
 * 
 * **Storage**: AsyncStorage + Expo Notifications
 * **Triggered By**: Time-based or event-based
 */
export interface DashReminder {
  id: string;
  title: string;
  message: string;
  type: 'one_time' | 'recurring';
  triggerAt: number;  // Unix timestamp
  recurrence?: {
    pattern: 'daily' | 'weekly' | 'monthly';
    interval: number;     // Every N days/weeks/months
    endDate?: number;     // Stop recurring after this date
  };
  userId: string;
  conversationId?: string;
  relatedTaskId?: string;
  priority: 'low' | 'medium' | 'high';
  status: 'active' | 'triggered' | 'dismissed' | 'snoozed';
}

// ============================================================================
// 3. MEMORY & CONTEXT TYPES
// ============================================================================

/**
 * DashMemoryItem represents a piece of persistent memory
 * 
 * **Purpose**: Remember user preferences, facts, patterns, interactions
 * **Storage**: AsyncStorage (local cache) + Supabase (cloud backup)
 * **Tenant Isolation**: Always scoped by `preschool_id` and `user_id`
 * 
 * **Memory Types**:
 * - `preference`: User settings ("I prefer formal communication")
 * - `fact`: Hard facts ("User teaches Grade 3 Math")
 * - `context`: Conversation context
 * - `skill`: User's skills/strengths
 * - `goal`: User's goals
 * - `interaction`: Past interactions
 * - `relationship`: Relationships between entities
 * - `pattern`: Detected patterns
 * - `insight`: AI-generated insights
 * 
 * **Example**:
 * ```typescript
 * {
 *   id: 'mem_123',
 *   type: 'preference',
 *   key: 'communication_style',
 *   value: 'formal',
 *   confidence: 0.95,
 *   created_at: 1704067200000,
 *   updated_at: 1704067200000,
 *   tags: ['communication', 'preference']
 * }
 * ```
 */
export interface DashMemoryItem {
  id: string;
  type: 'preference' | 'fact' | 'context' | 'skill' | 'goal' | 'interaction' | 'relationship' | 'pattern' | 'insight';
  key: string;                    // Unique key for retrieval
  value: any;                     // Any JSON-serializable value
  confidence: number;             // 0.0-1.0 confidence score
  created_at: number;
  updated_at: number;
  expires_at?: number;            // Auto-expire after this timestamp
  
  /** Related database entities */
  relatedEntities?: Array<{
    type: 'user' | 'student' | 'parent' | 'class' | 'subject';
    id: string;
    name: string;
  }>;
  
  /** Vector embeddings for semantic search (future feature) */
  embeddings?: number[];
  
  /** Memory reinforcement (how many times accessed/reinforced) */
  reinforcement_count?: number;
  
  /** Emotional significance (0.0-1.0) */
  emotional_weight?: number;
  
  /** How often this memory is retrieved */
  retrieval_frequency?: number;
  
  /** Searchable tags */
  tags?: string[];
  
  /** Importance for memory prioritization (0.0-1.0) */
  importance?: number;
  
  /** Access tracking for memory optimization */
  accessed_count?: number;

  /** Combined recency score from DB (used by semantic search ranking) */
  recency_score?: number;

  /** Raw pgvector embedding field (if returned from DB) */
  text_embedding?: number[] | null;
}

/**
 * DashUserProfile represents a user's complete profile and preferences
 * 
 * **Purpose**: Personalization, context, interaction patterns
 * **Scope**: One profile per user
 * **Storage**: AsyncStorage + Supabase (synced)
 */
export interface DashUserProfile {
  userId: string;
  role: 'teacher' | 'principal' | 'parent' | 'student' | 'admin';
  name: string;
  
  /** User preferences */
  preferences: {
    communication_style: 'formal' | 'casual' | 'friendly';
    notification_frequency: 'immediate' | 'daily_digest' | 'weekly_summary';
    preferred_subjects?: string[];
    working_hours?: {
      start: string;      // "08:00"
      end: string;        // "17:00"
      timezone: string;   // "Africa/Johannesburg"
    };
    task_management_style: 'detailed' | 'summary' | 'minimal';
    ai_autonomy_level: 'high' | 'medium' | 'low';  // How much AI can do independently
  };
  
  /** User context (current state) */
  context: {
    current_classes?: string[];
    current_students?: string[];
    current_subjects?: string[];
    organization_id?: string;
    /** Organization type for context-aware AI */
    organization_type?: string;
    /** User's age group for content adaptation */
    age_group?: 'child' | 'teen' | 'adult';
    grade_levels?: string[];
    responsibilities?: string[];
    preferred_language?: string;
  };
  
  /** User goals */
  goals: {
    short_term: DashGoal[];
    long_term: DashGoal[];
    completed: DashGoal[];
  };
  
  /** Interaction pattern analysis */
  interaction_patterns: {
    most_active_times: string[];      // ["09:00", "14:00"]
    preferred_task_types: string[];
    common_requests: Array<{
      pattern: string;
      frequency: number;
      last_used: number;
    }>;
    success_metrics: Record<string, number>;
  };
  
  /** Memory preferences (privacy) */
  memory_preferences: {
    remember_personal_details: boolean;
    remember_work_patterns: boolean;
    remember_preferences: boolean;
    auto_suggest_tasks: boolean;
    proactive_reminders: boolean;
  };
}

/**
 * DashGoal represents a user goal
 */
export interface DashGoal {
  id: string;
  title: string;
  description: string;
  category: 'academic' | 'administrative' | 'personal' | 'professional_development';
  priority: 'low' | 'medium' | 'high';
  target_date?: number;
  progress: number;  // 0-100
  metrics: Array<{
    name: string;
    target: number;
    current: number;
    unit: string;
  }>;
  related_tasks: string[];
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  created_at: number;
  updated_at: number;
}

/**
 * DashInsight represents an AI-generated insight
 * 
 * **Purpose**: Proactive recommendations, pattern detection, predictions
 * **Generated By**: AI analysis of user data/patterns
 */
export interface DashInsight {
  id: string;
  type: 'pattern' | 'recommendation' | 'prediction' | 'alert' | 'opportunity';
  title: string;
  description: string;
  confidence: number;  // 0.0-1.0
  priority: 'low' | 'medium' | 'high' | 'urgent';
  category: string;
  data_sources: string[];  // Which data sources were analyzed
  created_at: number;
  expires_at?: number;     // Insights can expire
  actionable: boolean;     // Can user act on this?
  suggested_actions?: string[];
  impact_estimate?: {
    type: 'time_saved' | 'efficiency_gained' | 'problem_prevented';
    value: number;
    unit: string;
  };
}

// ============================================================================
// 4. ATTACHMENT TYPES (File Upload & RAG)
// ============================================================================

/**
 * Attachment type classification
 */
export type DashAttachmentKind =
  | 'document'
  | 'image'
  | 'pdf'
  | 'spreadsheet'
  | 'presentation'
  | 'audio'
  | 'other';

/**
 * Attachment processing status
 */
export type DashAttachmentStatus =
  | 'pending'     // Queued for upload
  | 'uploading'   // Currently uploading
  | 'uploaded'    // Upload complete
  | 'processing'  // Being processed (OCR, text extraction)
  | 'ready'       // Ready for AI queries
  | 'failed';     // Upload/processing failed

/**
 * DashAttachment represents a file attachment
 * 
 * **Purpose**: Document upload, RAG (Retrieval-Augmented Generation)
 * **Storage**: Supabase Storage
 * **Processing**: Text extraction, OCR, chunking, embeddings
 * 
 * **Supported Formats**: PDF, DOCX, TXT, images (OCR), CSV, XLSX
 */
export interface DashAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;           // Bytes
  bucket: string;         // Supabase storage bucket
  storagePath: string;    // Path in bucket
  kind: DashAttachmentKind;
  status: DashAttachmentStatus;
  uri?: string;           // Local or remote URI (UI previews, uploads)
  previewUri?: string;    // Thumbnail or preview URL
  pageCount?: number;     // For PDFs
  textBytes?: number;     // Extracted text size
  sha256?: string;        // File hash for deduplication
  meta?: Record<string, any>;
  uploadProgress?: number;  // 0-100
}

/**
 * DashCitation represents a reference to an attachment
 * 
 * **Purpose**: RAG citation tracking (which document was used for answer)
 * **Display**: Show user which attachment AI used to generate response
 */
export interface DashCitation {
  attachmentId: string;
  title?: string;
  page?: number;         // Page number in PDF
  snippet?: string;      // Relevant text excerpt
  score?: number;        // Relevance score (0.0-1.0)
}

/**
 * DashAttachmentAnalysis represents analysis results
 * 
 * **Generated By**: Edge Function after upload
 * **Used For**: Improving RAG quality
 */
export interface DashAttachmentAnalysis {
  attachmentId: string;
  summary?: string;                    // AI-generated summary
  keywords?: string[];                 // Extracted keywords
  entities?: string[];                 // Named entities
  readingTimeMinutes?: number;         // Estimated reading time
  pageMap?: Array<{ page: number; tokens: number }>;
  error?: string;                      // Processing error
}

// ============================================================================
// 5. PERSONALITY & CONFIGURATION TYPES
// ============================================================================

/**
 * DashPersonality represents AI personality configuration
 * 
 * **Purpose**: Customize AI behavior per role, language, context
 * **Configurable**: Voice settings, tone, autonomy, capabilities
 */
export interface DashPersonality {
  name: string;
  greeting: string;
  personality_traits: string[];
  response_style: 'formal' | 'casual' | 'encouraging' | 'professional' | 'adaptive';
  expertise_areas: string[];
  
  /** Voice configuration */
  voice_settings: {
    rate: number;      // Speech rate (0.5 = slow, 1.0 = normal, 2.0 = fast)
    pitch: number;     // Pitch (0.5 = low, 1.0 = normal, 2.0 = high)
    language: string;  // Language code (en-US, en-ZA, af-ZA, etc.)
    voice?: string;    // Specific voice ID (Azure/Google voices)
    voice_id?: string; // Explicit provider voice ID persisted for runtime lookup
  };
  
  /** Language enforcement settings */
  response_language?: string;       // Force AI to respond in this language
  strict_language_mode?: boolean;   // If true, AI never switches language
  
  /** Role-specific specializations */
  role_specializations: {
    [role: string]: {
      greeting: string;
      capabilities: string[];
      tone: string;
      proactive_behaviors: string[];
      task_categories: string[];
    };
  };
  
  /** Agentic behavior settings */
  agentic_settings: {
    autonomy_level: 'low' | 'medium' | 'high';
    can_create_tasks: boolean;
    can_schedule_actions: boolean;
    can_access_data: boolean;
    can_send_notifications: boolean;
    requires_confirmation_for: string[];  // Actions requiring user approval
  };
}

/**
 * Default personality configuration
 * 
 * **Customizable Per**:
 * - Organization (school-wide settings)
 * - User (personal preferences)
 * - Role (teacher, principal, parent, student)
 */
export const DEFAULT_PERSONALITY: DashPersonality = {
  name: 'Dash',
  greeting: "Hi! I'm Dash, your AI teaching assistant. How can I help you today?",
  personality_traits: [
    'helpful',
    'encouraging',
    'knowledgeable',
    'patient',
    'creative',
    'supportive',
    'proactive',
    'adaptive',
    'insightful'
  ],
  response_style: 'adaptive',
  expertise_areas: [
    'education',
    'lesson planning',
    'student assessment',
    'classroom management',
    'curriculum development',
    'educational technology',
    'parent communication',
    'task automation',
    'data analysis',
    'workflow optimization'
  ],
  voice_settings: {
    rate: 1.0,
    pitch: 1.0,
    language: 'en-US'
  },
  role_specializations: {
    teacher: {
      greeting: "Hello! I'm Dash, your teaching assistant. Ready to help with lesson planning, grading, and classroom management!",
      capabilities: [
        'lesson_planning',
        'grading_assistance',
        'parent_communication',
        'student_progress_tracking',
        'curriculum_alignment',
        'resource_suggestions',
        'behavior_management_tips',
        'assessment_creation'
      ],
      tone: 'encouraging and professional',
      proactive_behaviors: [
        'suggest_lesson_improvements',
        'remind_upcoming_deadlines',
        'flag_student_concerns',
        'recommend_resources'
      ],
      task_categories: ['academic', 'administrative', 'communication']
    },
    principal: {
      greeting: "Good morning! I'm Dash, your administrative assistant. Here to help with school management, staff coordination, and strategic planning.",
      capabilities: [
        'staff_management',
        'budget_analysis',
        'policy_recommendations',
        'parent_communication',
        'data_analytics',
        'strategic_planning',
        'crisis_management',
        'compliance_tracking'
      ],
      tone: 'professional and strategic',
      proactive_behaviors: [
        'monitor_school_metrics',
        'suggest_policy_updates',
        'flag_budget_concerns',
        'track_compliance_deadlines'
      ],
      task_categories: ['administrative', 'strategic', 'compliance', 'communication']
    },
    parent: {
      greeting: "Hi there! I'm Dash, your family's education assistant. I'm here to help with homework, track progress, and keep you connected with school.",
      capabilities: [
        'homework_assistance',
        'progress_tracking',
        'school_communication',
        'learning_resources',
        'study_planning',
        'activity_suggestions',
        'behavioral_support',
        'academic_guidance'
      ],
      tone: 'friendly and supportive',
      proactive_behaviors: [
        'remind_homework_deadlines',
        'suggest_learning_activities',
        'flag_progress_concerns',
        'recommend_parent_involvement'
      ],
      task_categories: ['academic_support', 'communication', 'personal']
    },
    student: {
      greeting: "Hey! I'm Dash, your study buddy. Ready to help with homework, learning, and making school awesome!",
      capabilities: [
        'homework_help',
        'study_techniques',
        'concept_explanation',
        'practice_problems',
        'goal_setting',
        'time_management',
        'learning_games',
        'motivation_boost'
      ],
      tone: 'friendly and encouraging',
      proactive_behaviors: [
        'remind_study_sessions',
        'suggest_break_times',
        'celebrate_achievements',
        'recommend_study_methods'
      ],
      task_categories: ['academic', 'personal', 'motivational']
    }
  },
  agentic_settings: {
    autonomy_level: 'medium',
    can_create_tasks: true,
    can_schedule_actions: true,
    can_access_data: true,
    can_send_notifications: false,
    requires_confirmation_for: [
      'send_external_emails',
      'modify_grades',
      'delete_important_data',
      'share_personal_information'
    ]
  }
};

// ============================================================================
// 6. AUTONOMY & DECISION TYPES
// ============================================================================

/**
 * Autonomy level for AI decision-making
 */
export type AutonomyLevel = 'observer' | 'assistant' | 'partner' | 'autonomous';

/**
 * Risk level classification
 */
export type RiskLevel = 'low' | 'medium' | 'high';

/**
 * DecisionRecord tracks AI autonomous decisions
 * 
 * **Purpose**: Audit trail, explainability, user trust
 * **Storage**: Supabase (ai_decision_logs table)
 */
export interface DecisionRecord {
  id: string;
  timestamp: number;
  action: DashAction;
  risk: RiskLevel;
  confidence: number;  // 0.0-1.0
  requiresApproval: boolean;
  createdAt: number;
  context: Record<string, any>;  // Full context for decision
}

// ============================================================================
// 7. TOOL REGISTRY TYPES (Agentic Function Calling)
// ============================================================================

/**
 * Tool category classification
 */
export type ToolCategory = 'database' | 'navigation' | 'file' | 'communication' | 'report' | 'analysis' | 'education' | 'profile';

/**
 * Tool parameter definition for function calling
 */
export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required: boolean;
  enum?: string[]; // Allowed values
  default?: any;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    maxLength?: number;
  };
}

/**
 * Tool execution result
 */
export interface ToolExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
  metadata?: {
    executionTime?: number;
    rowsAffected?: number;
    cached?: boolean;
    // Extended metadata for specific tools
    toolId?: string;
    requiredTier?: string;
    feature?: string;
    // Allow additional custom metadata
    [key: string]: unknown;
  };
}

/**
 * Context provided to tool during execution
 * 
 * **Organization-Agnostic Design**:
 * - organizationId is NULLABLE (supports independent users)
 * - Independent users: organizationId = null, filter by userId only
 * - Affiliated users: organizationId set, filter by organization
 * - Legacy support: preschoolId maintained for backwards compatibility
 */
export interface ToolExecutionContext {
  userId: string;
  organizationId: string | null;  // NULL for independent users
  role: string;  // 'parent', 'teacher', 'independent_user', etc.
  tier: string;
  sessionToken?: string;
  
  // User type flags
  hasOrganization: boolean;  // False for independent users
  isGuest: boolean;  // True for temporary/demo access
  
  // Legacy support (deprecated)
  preschoolId?: string | null;  // Use organizationId instead
  
  // For database tools
  supabaseClient?: any;
  
  // For navigation tools
  navigate?: (route: string) => void;
  
  // For file tools
  fileSystem?: any;
}

/**
 * Tool definition for Claude function calling
 * 
 * **Purpose**: Define autonomous functions Dash can call
 * **Used By**: ai-proxy Edge Function, Tool Registry
 * **Examples**: Database queries, navigation, file operations
 */
export interface Tool {
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
  riskLevel: RiskLevel;
  
  // Role-based access control
  allowedRoles: Array<'parent' | 'teacher' | 'principal' | 'superadmin' | 'student'>;
  
  // Subscription tier requirements
  requiredTier?: 'free' | 'starter' | 'basic' | 'premium' | 'pro' | 'enterprise';
  
  // Parameters this tool accepts
  parameters: ToolParameter[];
  
  // Claude tool use format (Anthropic API)
  claudeToolDefinition: {
    name: string;
    description: string;
    input_schema: {
      type: 'object';
      properties: Record<string, any>;
      required: string[];
    };
  };
  
  // Execution function (server-side only)
  execute: (params: Record<string, any>, context: ToolExecutionContext) => Promise<ToolExecutionResult>;
}

/**
 * Tool execution request (client → server)
 */
export interface ToolExecutionRequest {
  toolId: string;
  parameters: Record<string, any>;
  context: ToolExecutionContext;
}

/**
 * Tool registry statistics
 */
export interface ToolRegistryStats {
  totalTools: number;
  toolsByCategory: Record<ToolCategory, number>;
  toolsByRisk: Record<RiskLevel, number>;
  recentExecutions: number;
  successRate: number;
}
