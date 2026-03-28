/**
 * DashAICore (Refactored with Facades)
 * 
 * Slim orchestrator for Dash AI Assistant using facade pattern.
 * All domain-specific operations delegated to facades.
 * 
 * Architecture:
 * DashAICore → Facades → Services
 */

import { DashVoiceService } from '@/services/dash-ai/DashVoiceService';
import { DashMemoryService } from '@/services/dash-ai/DashMemoryService';
import { DashConversationManager } from '@/services/dash-ai/DashConversationManager';
import { DashTaskManager } from '@/services/dash-ai/DashTaskManager';
import { DashAINavigator } from '@/services/dash-ai/DashAINavigator';
import { DashUserProfileManager } from '@/services/dash-ai/DashUserProfileManager';
import { DashAIClient } from '@/services/dash-ai/DashAIClient';
import { DashPromptBuilder } from '@/services/dash-ai/DashPromptBuilder';
import { fetchParentChildren } from '@/lib/parent-children';
import {
  buildCriteriaHeadingTemplate,
  detectOCRTask,
  extractCriteriaHeadings,
  getCriteriaResponsePrompt,
  getOCRPromptForTask,
  isCriteriaResponseIntent,
  isOCRIntent,
  isShortOrAttachmentOnlyPrompt,
} from '@/lib/dash-ai/ocrPrompts';
import { enforceCriteriaResponseWithSingleRewrite } from '@/features/dash-ai/criteriaEnforcement';
import { classifyResponseMode } from '@/lib/dash-ai/responseMode';
import {
  buildLanguageDirectiveForTurn,
  detectLanguageOverrideFromText,
  resolveResponseLocale,
} from '@/lib/dash-ai/languageRouting';
import { sanitizeAssistantReply } from '@/lib/dash-ai/conversationGuards';

// Import facades
import {
  DashAIVoiceFacade,
  DashAIMemoryFacade,
  DashAIConversationFacade,
  DashAITaskFacade,
  DashAINavigationFacade,
} from '@/services/dash-ai/facades';

import type {
  ConversationContextMessage,
  DashAttachment,
  DashMessage,
  DashPersonality,
  DashUserProfile,
} from '@/services/dash-ai/types';

/**
 * Default personality configuration
 */
const DEFAULT_PERSONALITY: DashPersonality = {
  name: 'Dash',
  greeting: 'Ready when you are! What would you like to work on?',
  personality_traits: ['helpful', 'encouraging', 'knowledgeable', 'patient', 'creative'],
  response_style: 'adaptive',
  expertise_areas: ['education', 'lesson planning', 'student assessment'],
  voice_settings: { rate: 1.0, pitch: 1.0, language: 'en-ZA' },
  role_specializations: {
    teacher: {
      greeting: 'Ready to plan something great!',
      capabilities: ['lesson_planning', 'grading_assistance'],
      tone: 'encouraging and professional',
      proactive_behaviors: ['suggest_lesson_improvements'],
      task_categories: ['academic', 'administrative'],
    },
    principal: {
      greeting: 'How can I help lead today?',
      capabilities: ['staff_management', 'budget_analysis'],
      tone: 'professional and strategic',
      proactive_behaviors: ['monitor_school_metrics'],
      task_categories: ['administrative', 'strategic'],
    },
    parent: {
      greeting: 'What shall we explore today?',
      capabilities: ['homework_assistance', 'progress_tracking'],
      tone: 'friendly and supportive',
      proactive_behaviors: ['remind_homework_deadlines'],
      task_categories: ['academic_support', 'communication'],
    },
    student: {
      greeting: 'What are we working on?',
      capabilities: ['homework_help', 'study_techniques'],
      tone: 'friendly and encouraging',
      proactive_behaviors: ['remind_study_sessions'],
      task_categories: ['academic', 'personal'],
    },
  },
  agentic_settings: {
    autonomy_level: 'medium',
    can_create_tasks: true,
    can_schedule_actions: true,
    can_access_data: true,
    can_send_notifications: false,
    requires_confirmation_for: ['send_external_emails', 'modify_grades'],
  },
};

type AgeGroup = 'child' | 'teen' | 'adult';

const MAX_CONTEXT_MESSAGES = 20;
const PDF_TOOL_NAMES = new Set(['export_pdf', 'generate_worksheet', 'generate_pdf_from_prompt', 'generate_chart']);

function firstText(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function flattenToolPayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {};
  const base = value as Record<string, unknown>;
  const nested = base.result && typeof base.result === 'object'
    ? base.result as Record<string, unknown>
    : {};
  return { ...base, ...nested };
}

function isGeneratedPdfPublicUrl(value: unknown): boolean {
  const text = String(value || '').trim();
  if (!text) return false;
  return /\/storage\/v1\/object\/public\/generated-pdfs\//i.test(text);
}

function sanitizePdfArtifactUrl(value: unknown): string | null {
  const text = firstText(value);
  if (!text) return null;
  if (isGeneratedPdfPublicUrl(text)) return null;
  return text;
}

function findLastPdfToolArtifact(toolResults: any[]): null | {
  toolName: string;
  payload: Record<string, unknown>;
  url: string | null;
  filename: string | null;
  storagePath: string | null;
} {
  for (let index = toolResults.length - 1; index >= 0; index -= 1) {
    const item = toolResults[index] as Record<string, unknown>;
    const toolName = String(item?.name || '').toLowerCase();
    if (!PDF_TOOL_NAMES.has(toolName)) continue;
    if (item?.success === false) continue;

    const payload = flattenToolPayload(item?.output);
    const url = sanitizePdfArtifactUrl(firstText(
      payload.downloadUrl,
      payload.download_url,
      payload.signedUrl,
      payload.signed_url,
      payload.uri,
      payload.url,
    ));
    const filename = firstText(payload.filename, payload.file_name, payload.name);
    const storagePath = firstText(payload.storagePath, payload.storage_path);
    if (url || filename || storagePath) {
      return { toolName, payload, url, filename, storagePath };
    }
  }
  return null;
}

function inferAgeGroupFromGrade(gradeLevel?: string): AgeGroup | undefined {
  if (!gradeLevel) return undefined;
  const normalized = gradeLevel.trim().toUpperCase();
  if (normalized.includes('R')) {
    return 'child';
  }
  const match = normalized.match(/\d+/);
  if (!match) return undefined;
  const gradeNum = Number(match[0]);
  if (Number.isNaN(gradeNum)) return undefined;
  if (gradeNum <= 7) return 'child';
  if (gradeNum <= 12) return 'teen';
  return 'adult';
}

export interface DashAICoreConfig {
  supabaseClient: any;
  currentUser?: {
    id: string;
    role: string;
    name?: string;
    email?: string;
    organizationId?: string;
    preschoolId?: string;
  };
  personality?: Partial<DashPersonality>;
}

/**
 * DashAICore - Slim orchestrator using facades
 */
export class DashAICore {
  private static instance: DashAICore | null = null;

  // Facades (public API)
  public voice!: DashAIVoiceFacade;
  public memory!: DashAIMemoryFacade;
  public conversation!: DashAIConversationFacade;
  public tasks!: DashAITaskFacade;
  public navigation!: DashAINavigationFacade;

  // Internal services
  private voiceService!: DashVoiceService;
  private memoryService!: DashMemoryService;
  private conversationManager!: DashConversationManager;
  private taskManager!: DashTaskManager;
  private navigator!: DashAINavigator;
  private profileManager!: DashUserProfileManager;
  private aiClient!: DashAIClient;
  private promptBuilder!: DashPromptBuilder;

  // Configuration
  private personality: DashPersonality;
  private supabaseClient: any;
  private parentChildrenCache: { fetchedAt: number; children: Array<{ id: string; name: string; grade_level?: string; age_group?: 'child' | 'teen' | 'adult' }> } | null = null;
  private parentChildrenInFlight: Promise<Array<{ id: string; name: string; grade_level?: string; age_group?: 'child' | 'teen' | 'adult' }>> | null = null;
  private isInitialized: boolean = false;
  private initializationPromise: Promise<void> | null = null;

  constructor(config: DashAICoreConfig) {
    this.supabaseClient = config.supabaseClient;
    this.personality = { ...DEFAULT_PERSONALITY, ...config.personality };
  }

  private initializeServices(config?: { supabaseClient?: any; currentUser?: any }) {
    if (config?.supabaseClient) {
      this.supabaseClient = config.supabaseClient;
    }

    // Initialize core services
    this.voiceService = new DashVoiceService({
      voiceSettings: this.personality.voice_settings,
      supabaseClient: this.supabaseClient,
    });

    this.memoryService = new DashMemoryService({
      supabaseClient: this.supabaseClient,
      userId: config?.currentUser?.id,
      organizationId: config?.currentUser?.organizationId,
    });

    // Only initialize conversation manager if we have valid userId and organizationId/preschoolId
    const userId = config?.currentUser?.id;
    const organizationId = config?.currentUser?.organizationId || config?.currentUser?.preschoolId;
    
    if (!userId || !organizationId) {
      // Standalone users (no organization) are allowed; avoid noisy warnings.
      if (__DEV__) {
        console.log('[DashAICore] Skipping conversation manager init (standalone user):', {
          hasUserId: !!userId,
          hasOrganizationId: !!organizationId,
        });
      }
      // Create a dummy conversation manager that will fail gracefully
      // Users without organizations can still use other Dash features
      this.conversationManager = null as any;
    } else {
      this.conversationManager = new DashConversationManager({
        userId,
        preschoolId: organizationId,
      });
    }

    this.taskManager = new DashTaskManager({ userId: config?.currentUser?.id });
    this.navigator = new DashAINavigator({});
    this.profileManager = new DashUserProfileManager({ currentUser: config?.currentUser });

    this.aiClient = new DashAIClient({
      supabaseClient: this.supabaseClient,
      getUserProfile: () => this.profileManager.getUserProfile(),
    });

    // Create a mapper function to convert DashUserProfile to the simpler UserProfile format
    // used by DashPromptBuilder (which needs organization_type, age_group, etc. at top level)
    const mapProfileForPromptBuilder = () => {
      const dashProfile = this.profileManager.getUserProfile();
      if (!dashProfile) return undefined;
      const gradeLevel = dashProfile.context?.grade_levels?.[0];
      const inferredAgeGroup = inferAgeGroupFromGrade(gradeLevel);
      const resolvedAgeGroup = dashProfile.context?.age_group || inferredAgeGroup;
      const children = this.parentChildrenCache?.children || [];

      return {
        role: dashProfile.role,
        full_name: dashProfile.name,
        display_name: dashProfile.name,
        grade_level: gradeLevel,
        preferred_language: dashProfile.context?.preferred_language,
        subscription_tier: dashProfile.preferences?.ai_autonomy_level, // Map to subscription context
        organization_name: dashProfile.context?.organization_id, // Will be resolved by caller
        organization_type: dashProfile.context?.organization_type,
        age_group: resolvedAgeGroup,
        children: children.map(child => ({
          name: child.name,
          grade_level: child.grade_level,
          age_group: child.age_group,
        })),
      };
    };

    this.promptBuilder = new DashPromptBuilder({
      personality: this.personality,
      getUserProfile: mapProfileForPromptBuilder,
    });

    // Initialize facades
    this.voice = new DashAIVoiceFacade(this.voiceService);
    this.memory = new DashAIMemoryFacade(this.memoryService);
    // Create conversation facade - it will handle null manager gracefully
    this.conversation = new DashAIConversationFacade(this.conversationManager, config?.currentUser?.id);
    this.tasks = new DashAITaskFacade(this.taskManager);
    this.navigation = new DashAINavigationFacade(this.navigator);
  }

  public static getInstance(): DashAICore | null {
    return DashAICore.instance;
  }

  public static setInstance(instance: DashAICore): void {
    DashAICore.instance = instance;
  }

  private lastInitUserId: string | null = null;

  public async initialize(config?: { supabaseClient?: any; currentUser?: any }): Promise<void> {
    // Determine if config represents a meaningful change (different user).
    // DashAICompat always passes config, so we must check content, not just presence.
    const incomingUserId = config?.currentUser?.id ?? null;
    const isNewUser = incomingUserId && incomingUserId !== this.lastInitUserId;

    // If already initialized and the user hasn't changed, skip re-init
    if (this.isInitialized && !isNewUser) {
      if (this.initializationPromise) {
        return this.initializationPromise;
      }
      return Promise.resolve();
    }

    // If initialization is in progress for the same user, return the existing promise
    if (this.initializationPromise && !isNewUser) {
      return this.initializationPromise;
    }

    // Track which user we're initializing for
    if (incomingUserId) {
      this.lastInitUserId = incomingUserId;
    }

    // Start new initialization
    this.initializationPromise = this._doInitialize(config);
    return this.initializationPromise;
  }

  private async _doInitialize(config?: { supabaseClient?: any; currentUser?: any }): Promise<void> {
    console.log('[DashAICore] Initializing...');

    try {
      // Only re-create services if they don't exist yet.
      // The guard in initialize() already ensures we only reach here
      // when there's a genuine need (first init or user change).
      if (!this.voiceService) {
        this.initializeServices(config);
      } else if (config?.currentUser) {
        // User change: update config references but DON'T re-init audio
        // (audio mode is user-independent)
        this.initializeServices(config);
      }

      // Skip if already initialized (shouldn't happen due to guard, but safety net)
      if (this.isInitialized) {
        console.log('[DashAICore] Already initialized, skipping...');
        return;
      }

      await Promise.all([
        this.voiceService.initializeAudio(),
        this.memoryService.initialize(),
        this.conversationManager?.initialize().catch(err => {
          console.warn('[DashAICore] Conversation manager initialization failed (user may not have organization):', err);
        }),
        this.taskManager.initialize(),
        this.profileManager.initialize(),
      ]);

      // Hydrate personality from stored user preferences (if any)
      this.hydratePersonalityFromProfile();

      this.isInitialized = true;
      console.log('[DashAICore] Initialization complete');
    } catch (error) {
      this.isInitialized = false;
      this.initializationPromise = null;
      console.error('[DashAICore] Initialization failed:', error);
      throw error;
    }
  }

  // ==================== PROFILE & SETTINGS ====================

  public getUserProfile() {
    return this.profileManager.getUserProfile();
  }

  private async hydrateParentChildren(force: boolean = false): Promise<Array<{ id: string; name: string; grade_level?: string; age_group?: 'child' | 'teen' | 'adult' }>> {
    const profile = this.getUserProfile();
    if (!profile || profile.role !== 'parent') {
      return [];
    }

    const now = Date.now();
    if (!force && this.parentChildrenCache && now - this.parentChildrenCache.fetchedAt < 5 * 60 * 1000) {
      return this.parentChildrenCache.children;
    }

    if (this.parentChildrenInFlight) {
      return this.parentChildrenInFlight;
    }

    this.parentChildrenInFlight = (async () => {
      try {
        const schoolId = profile.context?.organization_id;
        const children = await fetchParentChildren(profile.userId, {
          includeInactive: false,
          schoolId,
        });

        const normalized = (children || []).map((child: any) => {
          const classData = Array.isArray(child.classes) ? child.classes[0] : child.classes;
          const gradeLevel = child.grade_level || child.grade || classData?.grade_level || undefined;
          return {
            id: child.id,
            name: `${child.first_name} ${child.last_name}`.trim(),
            grade_level: gradeLevel,
            age_group: inferAgeGroupFromGrade(gradeLevel),
          };
        }).filter((c: any) => c.id);

        this.parentChildrenCache = { fetchedAt: Date.now(), children: normalized };
        return normalized;
      } catch (error) {
        console.warn('[DashAICore] Failed to load parent children:', error);
        return [];
      } finally {
        this.parentChildrenInFlight = null;
      }
    })();

    return this.parentChildrenInFlight;
  }

  private async buildParentChildrenContext(): Promise<string | null> {
    const children = await this.hydrateParentChildren();
    if (!children || children.length === 0) return null;
    const list = children
      .map(child => child.grade_level ? `${child.name} (Grade ${child.grade_level})` : child.name)
      .join(', ');
    return `Children: ${list}`;
  }

  public async updateUserPreferences(preferences: Partial<any>): Promise<void> {
    return this.profileManager.updatePreferences(preferences);
  }

  public async setLanguage(language: string): Promise<void> {
    await this.profileManager.setLanguage(language);
    this.voiceService.updateConfig({
      voiceSettings: { ...this.personality.voice_settings, language },
      supabaseClient: this.supabaseClient,
    });
  }

  public async updateUserContext(
    context: Partial<DashUserProfile['context']> & Record<string, any>
  ): Promise<void> {
    await this.profileManager.updateContext(context);
  }

  public getLanguage(): string | undefined {
    return this.profileManager.getLanguage();
  }

  public getPersonality(): DashPersonality {
    return this.personality;
  }

  private hydratePersonalityFromProfile(): void {
    const profile = this.profileManager.getUserProfile();
    const prefs = (profile?.preferences as any) || {};
    const overrides: Partial<DashPersonality> = {};

    if (prefs.response_style) overrides.response_style = prefs.response_style;
    if (prefs.personality_traits) overrides.personality_traits = prefs.personality_traits;
    if (prefs.voice_settings) {
      overrides.voice_settings = { ...this.personality.voice_settings, ...prefs.voice_settings };
    }
    if (prefs.response_language) overrides.response_language = prefs.response_language;
    if (typeof prefs.strict_language_mode === 'boolean') {
      overrides.strict_language_mode = prefs.strict_language_mode;
    }

    if (Object.keys(overrides).length > 0) {
      this.updatePersonality(overrides);
    }
  }

  public updatePersonality(personality: Partial<DashPersonality>): void {
    this.personality = { ...this.personality, ...personality };

    if (personality.voice_settings) {
      this.voiceService.updateConfig({
        voiceSettings: this.personality.voice_settings,
        supabaseClient: this.supabaseClient,
      });
    }

    if (this.promptBuilder) {
      this.promptBuilder.updatePersonality(this.personality);
    }
  }

  public async savePersonality(personality: Partial<DashPersonality>): Promise<void> {
    this.updatePersonality(personality);
    try {
      const prefsUpdate: Record<string, any> = {};
      if (personality.response_style) prefsUpdate.response_style = personality.response_style;
      if (personality.personality_traits) prefsUpdate.personality_traits = personality.personality_traits;
      if (personality.voice_settings) prefsUpdate.voice_settings = personality.voice_settings;
      if (personality.response_language) prefsUpdate.response_language = personality.response_language;
      if (typeof personality.strict_language_mode === 'boolean') {
        prefsUpdate.strict_language_mode = personality.strict_language_mode;
      }
      if (Object.keys(prefsUpdate).length > 0) {
        await this.profileManager.updatePreferences(prefsUpdate);
      }
    } catch (error) {
      console.warn('[DashAICore] Failed to persist personality preferences:', error);
    }
  }

  public getPersonalizedGreeting(): string {
    return this.profileManager.getPersonalizedGreeting(this.personality);
  }

  // ==================== AI INTEGRATION ====================

  private sanitizeAttachmentsForStorage(attachments?: any[]) {
    if (!Array.isArray(attachments)) return attachments;
    return attachments.map((att) => {
      if (!att || typeof att !== 'object') return att;
      const meta = (att as any).meta;
      if (!meta || typeof meta !== 'object') return att;
      const rest = { ...(meta as Record<string, unknown>) };
      delete rest.image_base64;
      delete rest.image_media_type;
      const cleanedMeta = Object.keys(rest).length > 0 ? rest : undefined;
      return { ...att, meta: cleanedMeta };
    });
  }

  private mapGeneratedImagesToAttachments(
    generatedImages?: Array<{
      id: string;
      bucket: string;
      path: string;
      signed_url: string;
      mime_type: string;
      prompt: string;
      width: number;
      height: number;
      provider: string;
      model: string;
      expires_at: string;
    }>,
  ): DashAttachment[] | undefined {
    if (!Array.isArray(generatedImages) || generatedImages.length === 0) {
      return undefined;
    }

    return generatedImages.map((image): DashAttachment => ({
      id: `generated_${image.id}`,
      name: `Dash Image ${image.width}x${image.height}`,
      mimeType: image.mime_type || 'image/png',
      size: 0,
      bucket: image.bucket,
      storagePath: image.path,
      kind: 'image',
      status: 'ready',
      previewUri: image.signed_url,
      meta: {
        source: 'dash_image_generation',
        prompt: image.prompt,
        model: image.model,
        provider: image.provider,
        expires_at: image.expires_at,
      },
    }));
  }

  public async sendMessage(
    content: string,
    conversationId?: string,
    attachments?: any[],
    onStreamChunk?: (chunk: string) => void,
    options?: {
      contextOverride?: string | null;
      modelOverride?: string | null;
      messagesOverride?: ConversationContextMessage[];
      metadata?: Record<string, unknown>;
      signal?: AbortSignal;
    }
  ): Promise<DashMessage> {
    let convId = conversationId || this.conversation.getCurrentConversationId();
    if (!convId) {
      // Auto-create conversation if none exists (for users without organizations, creates temp conversation)
      convId = await this.conversation.startNewConversation();
      this.conversation.setCurrentConversationId(convId);
    }

    const storedAttachments = this.sanitizeAttachmentsForStorage(attachments);
    const userMessage: DashMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'user',
      content,
      timestamp: Date.now(),
      attachments: storedAttachments,
    };

    await this.conversation.addMessageToConversation(convId, userMessage);

    const assistantMessage = await this.generateAIResponse(
      content,
      convId,
      attachments,
      onStreamChunk,
      options?.contextOverride,
      options?.modelOverride,
      options?.messagesOverride,
      options?.metadata,
      options?.signal
    );

    await this.conversation.addMessageToConversation(convId, assistantMessage);

    return assistantMessage;
  }

  private async generateAIResponse(
    userInput: string,
    conversationId: string,
    attachments?: any[],
    onStreamChunk?: (chunk: string) => void,
    contextOverride?: string | null,
    modelOverride?: string | null,
    messagesOverride?: ConversationContextMessage[],
    metadataOverride?: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<DashMessage> {
    try {
      const conversation = await this.conversation.getConversation(conversationId);
      const recentMessages = conversation?.messages?.slice(-MAX_CONTEXT_MESSAGES) || [];

      // Check if strict language mode is enabled in personality settings
      const personality = this.profileManager.getPersonality();
      const languageOverride = detectLanguageOverrideFromText(userInput);
      const strictLanguageMode = personality?.strict_language_mode === true && !languageOverride;
      const langDirective = this.promptBuilder.buildLanguageDirective(strictLanguageMode);
      const systemPrompt = this.promptBuilder.buildSystemPrompt();
      const shouldStream = typeof onStreamChunk === 'function';
      const userProfile = this.getUserProfile();
      const preferredLocale =
        (personality as any)?.response_language ||
        (personality as any)?.voice_settings?.language ||
        userProfile?.context?.preferred_language ||
        null;
      const requestLanguage = resolveResponseLocale({
        explicitOverride: languageOverride,
        responseText: userInput,
        fallbackPreference: preferredLocale,
      });
      const languageOverrideDirective = buildLanguageDirectiveForTurn({
        locale: requestLanguage.locale,
        source: requestLanguage.source,
      });

      let childrenContext: string | null = null;
      if (userProfile?.role === 'parent') {
        childrenContext = await this.buildParentChildrenContext();
      }

      const hasScannableAttachment = Array.isArray(attachments)
        && attachments.some((attachment: any) => {
          const kind = String(attachment?.kind || '').toLowerCase();
          return kind === 'image' || kind === 'pdf' || kind === 'document';
        });
      const responseMode = classifyResponseMode({
        text: userInput,
        hasAttachments: hasScannableAttachment,
      });
      const modeGuidance = responseMode === 'direct_writing'
        ? 'RESPONSE MODE: direct_writing. Produce a polished, complete writing output (essay/paragraph/speech/etc.) based on the learner request and attachment context. Do not force a quiz loop unless asked.'
        : responseMode === 'tutor_interactive'
          ? 'RESPONSE MODE: tutor_interactive. Use a one-question-at-a-time interactive tutor flow and wait for learner responses between questions.'
          : 'RESPONSE MODE: explain_direct. Explain the task directly and clearly. Avoid quiz loops unless the user explicitly asks for testing.';
      const tutoringGuidance = (userProfile?.role === 'parent' || userProfile?.role === 'student')
        ? (responseMode === 'tutor_interactive'
            ? 'Tutoring guidance: Ask ONE question at a time and stop after each question. Adapt based on the learner answer.'
            : 'Tutoring guidance: Provide direct, clear help first. Add optional practice only when requested.')
        : '';
      const detectedOcrTask = hasScannableAttachment ? detectOCRTask(userInput) : null;
      const shouldForceAttachmentOCR = hasScannableAttachment && (
        isShortOrAttachmentOnlyPrompt(userInput) ||
        responseMode === 'tutor_interactive'
      );
      const ocrMode = hasScannableAttachment && (
        shouldForceAttachmentOCR ||
        isOCRIntent(userInput) ||
        detectedOcrTask !== null
      );
      const ocrTask = detectedOcrTask || 'document';
      const serviceType = ocrMode ? 'image_analysis' : (responseMode === 'direct_writing' ? 'chat_message' : 'homework_help');
      const criteriaContext = getCriteriaResponsePrompt(userInput);
      const criteriaIntentDetected = isCriteriaResponseIntent(userInput);
      const criteriaHeadings = criteriaIntentDetected ? extractCriteriaHeadings(userInput) : [];
      const criteriaTemplateContext = criteriaHeadings.length > 0
        ? buildCriteriaHeadingTemplate(criteriaHeadings)
        : null;

      const contextParts = [
        systemPrompt,
        `User role: ${userProfile?.role || 'educator'}`,
        childrenContext,
        modeGuidance,
        tutoringGuidance,
        criteriaContext,
        criteriaTemplateContext,
        ocrMode ? getOCRPromptForTask(ocrTask) : null,
        languageOverrideDirective || langDirective,
        contextOverride || null,
      ].filter(Boolean);

      const normalizedMessagesOverride = Array.isArray(messagesOverride) && messagesOverride.length > 0
        ? messagesOverride
            .map((msg) => ({
              role: msg.role === 'assistant' ? 'assistant' : 'user',
              content: String(msg.content || '').trim(),
            }))
            .filter((msg) => msg.content.length > 0)
        : null;

      let response = await this.aiClient.callAIService({
        action: 'general_assistance',
        messages: normalizedMessagesOverride || this.promptBuilder.buildMessageHistory(recentMessages, userInput),
        context: contextParts.join('\n'),
        attachments,
        serviceType,
        ocrMode,
        ocrTask,
        ocrResponseFormat: ocrMode ? 'json' : undefined,
        stream: shouldStream,
        onChunk: onStreamChunk,
        model: modelOverride || undefined,
        metadata: {
          ...(metadataOverride || {}),
          response_mode: responseMode,
          language_source: requestLanguage.source || (languageOverride ? 'explicit_override' : 'preference'),
          detected_language: requestLanguage.locale || undefined,
        },
        signal,
      });

      let criteriaValidationMeta: Record<string, unknown> | null = null;
      const criteriaEnforcement = await enforceCriteriaResponseWithSingleRewrite({
        userInput,
        responseContent: String(response.content || ''),
        extractedHeadings: criteriaHeadings,
        rewriteAttempt: criteriaIntentDetected && criteriaHeadings.length > 0
          ? async (rewritePrompt) => {
              const correction = await this.aiClient.callAIService({
                action: 'general_assistance',
                messages: [
                  { role: 'user', content: userInput },
                  { role: 'assistant', content: String(response.content || '') },
                  { role: 'user', content: rewritePrompt },
                ],
                context: [
                  ...contextParts,
                  'CRITERIA CORRECTION PASS: Fix heading/label mapping exactly as requested.',
                ].join('\n'),
                attachments,
                serviceType,
                ocrMode,
                ocrTask,
                ocrResponseFormat: ocrMode ? 'json' : undefined,
                stream: false,
                model: modelOverride || undefined,
                metadata: {
                  ...(metadataOverride || {}),
                  criteria_rewrite_pass: true,
                  response_mode: responseMode,
                },
                signal,
              });
              return correction?.content || null;
            }
          : undefined,
      });
      if (criteriaEnforcement.outcome !== 'skipped') {
        criteriaValidationMeta = {
          intent_detected: criteriaEnforcement.intentDetected,
          expected_count: criteriaEnforcement.headings.length,
          expected_headings: criteriaEnforcement.headings.map((item) => item.heading),
          outcome: criteriaEnforcement.outcome,
          rewrite_attempted: criteriaEnforcement.rewriteAttempted,
          mismatch_reason:
            criteriaEnforcement.finalValidation?.mismatchReason ||
            criteriaEnforcement.initialValidation?.mismatchReason ||
            null,
          warning_code: criteriaEnforcement.warningCode || null,
        };
      }
      if (criteriaEnforcement.content && criteriaEnforcement.content !== response.content) {
        response = {
          ...response,
          content: criteriaEnforcement.content,
        };
      }

      const sanitizedResponseContent = sanitizeAssistantReply(String(response.content || ''), userInput);
      if (sanitizedResponseContent && sanitizedResponseContent !== response.content) {
        response = {
          ...response,
          content: sanitizedResponseContent,
        };
      }

      const generatedImages = response.metadata?.generated_images || [];
      const generatedAttachments = this.mapGeneratedImagesToAttachments(generatedImages);
      const toolResults = Array.isArray(response.metadata?.tool_results)
        ? response.metadata.tool_results
        : [];
      const responseMetadata: Record<string, unknown> = {};
      const resolvedLocale = resolveResponseLocale({
        explicitOverride: languageOverride,
        responseText: response.content || '',
        fallbackPreference: preferredLocale,
      });
      if (resolvedLocale.locale) {
        responseMetadata.detected_language = resolvedLocale.locale;
      } else if (requestLanguage.locale) {
        responseMetadata.detected_language = requestLanguage.locale;
      }
      if (resolvedLocale.source) {
        responseMetadata.language_source = resolvedLocale.source;
      } else if (requestLanguage.source) {
        responseMetadata.language_source = requestLanguage.source;
      }
      responseMetadata.response_mode = responseMode;
      if (criteriaValidationMeta) {
        responseMetadata.criteria_validation = criteriaValidationMeta;
        if (criteriaValidationMeta.outcome === 'failed_after_rewrite') {
          responseMetadata.criteria_warning =
            criteriaValidationMeta.warning_code || 'criteria_mapping_mismatch';
        }
      }
      if (generatedImages.length > 0) {
        responseMetadata.generated_images = generatedImages;
      }
      if (response.metadata?.resolution_status) {
        responseMetadata.resolution_status = response.metadata.resolution_status;
      }
      if (typeof response.metadata?.confidence_score === 'number') {
        responseMetadata.confidence_score = response.metadata.confidence_score;
      }
      if (typeof response.metadata?.escalation_offer === 'boolean') {
        responseMetadata.escalation_offer = response.metadata.escalation_offer;
      }
      if (response.metadata?.resolution_meta) {
        responseMetadata.resolution_meta = response.metadata.resolution_meta as Record<string, unknown>;
      }
      if ((response as any).metadata?.ocr) {
        responseMetadata.ocr = (response as any).metadata.ocr as Record<string, unknown>;
      }
      if (ocrMode || Boolean((response as any).metadata?.ocr)) {
        responseMetadata.ocr_mode = true;
        if (ocrTask) {
          responseMetadata.ocr_task = ocrTask;
        }
      }
      if (toolResults.length > 0) {
        responseMetadata.tool_results = toolResults;
        const primaryTool = toolResults[toolResults.length - 1] as Record<string, unknown>;
        const toolName = String(primaryTool?.name || '').trim();
        if (toolName) responseMetadata.tool_name = toolName;
        if (primaryTool?.input && typeof primaryTool.input === 'object') {
          responseMetadata.tool_args = primaryTool.input as Record<string, unknown>;
        }
        responseMetadata.tool_result = {
          success: primaryTool?.success !== false,
          result: primaryTool?.output,
          error: primaryTool?.success === false ? String(primaryTool?.output || 'Tool execution failed') : undefined,
        };
      }

      const pdfArtifact = findLastPdfToolArtifact(toolResults);
      if (pdfArtifact) {
        const canonicalPdfPayload = {
          ...pdfArtifact.payload,
          filename: pdfArtifact.filename || pdfArtifact.payload?.filename || undefined,
          storagePath: pdfArtifact.storagePath || pdfArtifact.payload?.storagePath || undefined,
          downloadUrl: pdfArtifact.url || pdfArtifact.payload?.downloadUrl || undefined,
          signedUrl:
            pdfArtifact.payload?.signedUrl ||
            pdfArtifact.payload?.signed_url ||
            undefined,
        };
        responseMetadata.tool_name = pdfArtifact.toolName;
        responseMetadata.tool_result = {
          success: true,
          result: canonicalPdfPayload,
        };
        responseMetadata.tool_summary = pdfArtifact.filename
          ? `PDF ready: ${pdfArtifact.filename}`
          : 'PDF ready to preview';
        responseMetadata.pdf_artifact = canonicalPdfPayload;

        const conciseStatus = pdfArtifact.filename
          ? `Your PDF is ready: ${pdfArtifact.filename}. Tap Preview PDF to open it.`
          : 'Your PDF is ready. Tap Preview PDF to open it.';
        response = {
          ...response,
          content: conciseStatus,
        };
      }

      return {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'assistant',
        content: response.content || 'I ran into a hiccup while preparing your help. Please try again or add a bit more detail.',
        timestamp: Date.now(),
        attachments: generatedAttachments,
        metadata: Object.keys(responseMetadata).length > 0 ? responseMetadata as any : undefined,
      };
    } catch (error) {
      console.error('[DashAICore] Failed to generate response:', error);
      return {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'assistant',
        content: "I’m having trouble right now. Please try again, or tell me your grade/subject and I’ll guide you step-by-step.",
        timestamp: Date.now(),
      };
    }
  }

  // ==================== LIFECYCLE ====================

  public dispose(): void {
    console.log('[DashAICore] Disposing...');
    this.voice.dispose();
    this.memory.dispose();
    this.conversation.dispose();
    this.tasks.dispose();
    this.profileManager.dispose();
    console.log('[DashAICore] Disposal complete');
  }
}

export default DashAICore;
