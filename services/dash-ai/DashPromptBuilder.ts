/**
 * DashPromptBuilder
 * 
 * Handles all prompt construction logic for Dash AI Assistant.
 * Extracted from DashAICore for file size compliance (WARP.md).
 * 
 * Responsibilities:
 * - System prompt generation with CAPS curriculum awareness
 * - Message history formatting
 * - Language directive construction
 * - Role-specific prompt customization
 * 
 * References:
 * - Anthropic prompt engineering: https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview
 */

import type { DashMessage, DashPersonality } from './types';
import { 
  OrganizationType, 
  getAIPersonality, 
  getTerminology,
  type AIPersonalityConfig,
  type TerminologyMap 
} from '@/lib/types/organization';
import { SHARED_PHONICS_PROMPT_BLOCK } from '@/lib/dash-ai/phonicsPrompt';

/**
 * Age group type for content adaptation
 */
export type AgeGroup = 'child' | 'teen' | 'adult';

/**
 * User profile for role-based prompts
 */
export interface UserProfile {
  role?: string;
  full_name?: string;
  display_name?: string;
  grade_level?: string;
  preferred_language?: string;
  subscription_tier?: string;
  organization_name?: string;
  /** Organization type for context-aware AI persona */
  organization_type?: OrganizationType | string;
  /** User's age group for content adaptation */
  age_group?: AgeGroup;
  /** Date of birth for age calculation */
  date_of_birth?: string;
  children?: Array<{
    name: string;
    grade_level?: string;
    age_group?: AgeGroup;
  }>;
}

/**
 * DashPromptBuilder configuration
 */
export interface DashPromptBuilderConfig {
  personality: DashPersonality;
  getUserProfile: () => UserProfile | undefined;
}

/**
 * DashPromptBuilder
 * 
 * Constructs prompts and message histories for AI service calls.
 * Now with organization-aware personas and age-group content adaptation.
 */
export class DashPromptBuilder {
  private personality: DashPersonality;
  private getUserProfile: () => UserProfile | undefined;
  private static systemPromptCache = new Map<string, string>();
  
  constructor(config: DashPromptBuilderConfig) {
    this.personality = config.personality;
    this.getUserProfile = config.getUserProfile;
  }
  
  /**
   * Get organization-specific AI personality based on user's org type and role
   */
  private getOrganizationPersonality(orgType: OrganizationType | string | undefined, role: string): AIPersonalityConfig | undefined {
    if (!orgType) return undefined;
    
    // Map string to enum if needed
    const orgTypeEnum = typeof orgType === 'string' 
      ? (Object.values(OrganizationType).find(t => t === orgType) as OrganizationType | undefined)
      : orgType;
    
    if (!orgTypeEnum) return undefined;
    
    return getAIPersonality(orgTypeEnum, role);
  }
  
  /**
   * Get organization terminology for context-aware language
   */
  private getOrganizationTerminology(orgType: OrganizationType | string | undefined): TerminologyMap | undefined {
    if (!orgType) return undefined;
    
    const orgTypeEnum = typeof orgType === 'string' 
      ? (Object.values(OrganizationType).find(t => t === orgType) as OrganizationType | undefined)
      : orgType;
    
    if (!orgTypeEnum) return undefined;
    
    return getTerminology(orgTypeEnum);
  }
  
  /**
   * Build age-appropriate persona instructions
   * Adapts AI communication style based on learner age group
   */
  private buildAgeGroupPersona(ageGroup: AgeGroup | undefined, orgType?: string): string {
    if (!ageGroup) return '';
    
    switch (ageGroup) {
      case 'child':
        return `
🧒 CHILD-FRIENDLY COMMUNICATION MODE (Ages 0-12):
- Use simple, clear language with short sentences
- Add fun emojis occasionally: ⭐🎉🌟✨🎨📚🎵
- Be EXTRA encouraging: "Great job!", "You're doing amazing!", "That's wonderful!"
- Use storytelling and imagination when explaining concepts
- Celebrate every achievement, no matter how small
- Break complex ideas into simple steps with examples
- Use comparisons to things children know (toys, games, animals, food)
- Keep explanations brief and engaging
- If explaining something difficult, use a fun story or character
- Always end on a positive, encouraging note
- For preschoolers: Use playful language, rhymes, and repetition
`;
      
      case 'teen':
        return `
🎓 TEEN-APPROPRIATE COMMUNICATION MODE (Ages 13-17):
- Be relatable but respectful - avoid being condescending
- Use clear academic language appropriate for high school
- Reference real-world applications and career relevance
- Encourage critical thinking and independent problem-solving
- Be supportive of their growing independence
- Provide study tips and exam preparation strategies
- Connect learning to their interests and future goals
- Use moderate encouragement without being patronizing
- Challenge them with thought-provoking questions
`;
      
      case 'adult':
        return `
👨‍🎓 PROFESSIONAL PROFESSOR MODE (Ages 18+):
- Communicate as a knowledgeable, supportive professor would
- Use professional, academic language while remaining approachable
- Provide comprehensive, well-structured explanations
- Reference industry standards, best practices, and research
- Focus on practical application and career advancement
- Respect their professional experience and prior knowledge
- Offer strategic insights and analytical perspectives
- Support skills development, portfolio building, and certification goals
${orgType === 'skills_development' ? `
- SETA COMPLIANCE: Reference South African SETA requirements when relevant
- CAREER GUIDANCE: Provide industry-specific career pathway advice
- PORTFOLIO DEVELOPMENT: Help build professional portfolios and CVs
- WORKPLACE READINESS: Focus on practical workplace skills
` : ''}
`;
      
      default:
        return '';
    }
  }
  
  /**
   * Build organization-specific context instructions
   */
  private buildOrganizationContext(orgType: OrganizationType | string | undefined, role: string): string {
    if (!orgType) return '';
    
    const terminology = this.getOrganizationTerminology(orgType);
    const aiPersonality = this.getOrganizationPersonality(orgType, role);
    
    if (!terminology) return '';
    
    let context = `
📍 ORGANIZATION CONTEXT:
- Organization Type: ${orgType}
- Your role context: ${terminology.leader} support for ${terminology.organization}
- Terminology to use:
  • Students/Members: "${terminology.member}" (plural: "${terminology.memberPlural}")
  • Teachers/Leaders: "${terminology.leader}" (plural: "${terminology.leaderPlural}")
  • Admins: "${terminology.admin}"
  • Classes/Groups: "${terminology.group}" (plural: "${terminology.groupPlural}")
  • Lessons/Activities: "${terminology.activity}" (plural: "${terminology.activityPlural}")
  • Assessments: "${terminology.assessment}" (plural: "${terminology.assessmentPlural}")
`;
    
    if (aiPersonality) {
      context += `
🎭 SPECIALIZED PERSONA FOR ${role.toUpperCase()}:
- Communication tone: ${aiPersonality.tone}
- Expertise areas: ${aiPersonality.expertiseAreas.join(', ')}
- Proactive behaviors: ${aiPersonality.proactiveBehaviors.join(', ')}
- Task categories: ${aiPersonality.taskCategories.join(', ')}
`;
    }
    
    // Add preschool-specific features
    if (orgType === OrganizationType.PRESCHOOL || orgType === 'preschool') {
      context += `
🌈 PRESCHOOL SPECIAL FEATURES:
- Use playful, nurturing language for young learners
- Celebrate with virtual stickers: 🌟⭐✨🎉🏆🎨🌈
- For parents: Provide daily activity summaries and milestone updates
- For teachers: Support CAPS-aligned early learning activities
- Remember: These are young children (ages 2-6) - keep everything age-appropriate
- Use rhymes, songs, and games when teaching concepts
- Progress celebrations are IMPORTANT - make achievements feel special!
- Always teach through play and games (never lecture-style)
- Prioritize letter recognition, phonics sounds, number recognition, counting, shapes, colors, and fine-motor skills
- Keep steps short and hands-on (3-6 steps max)
- Include a quick interactive check (e.g., "Can you point to the letter B?")
`;
      if (role === 'teacher' || role === 'parent' || role === 'student' || role === 'learner') {
        context += `\n${SHARED_PHONICS_PROMPT_BLOCK}\n`;
      }
    }
    
    // Add K-12 specific features
    if (orgType === OrganizationType.K12_SCHOOL || orgType === 'k12_school') {
      context += `
🏫 K-12 SCHOOL FEATURES:
- Support CAPS curriculum alignment for all grades (R-12)
- Provide homework help with step-by-step explanations
- Help with exam preparation and study techniques
- Support communication between teachers and parents
- Track academic progress and suggest interventions
`;
    }
    
    // Add skills development specific features
    if (orgType === OrganizationType.SKILLS_DEVELOPMENT || orgType === 'skills_development') {
      context += `
🛠️ SKILLS DEVELOPMENT CENTRE FEATURES:
- Support adult learners (18+) in vocational training
- Reference SETA frameworks and NQF levels when relevant
- Help with portfolio development and CV building
- Support certification tracking and competency assessments
- Focus on workplace readiness and career advancement
- Provide professional, mentor-like guidance
`;
    }
    
    return context;
  }
  
  /**
   * Build system prompt with CAPS curriculum awareness
   * Now with organization-aware personas and age-group content adaptation
   * 
   * References:
   * - Anthropic system prompts: https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/system-prompts
   */
  public buildSystemPrompt(): string {
    const profile = this.getUserProfile();
    const userRole = profile?.role || 'educator';
    const cacheKey = [
      userRole,
      String(profile?.organization_type || ''),
      String(profile?.age_group || ''),
      String(profile?.grade_level || ''),
      String(profile?.subscription_tier || ''),
      String(profile?.full_name || profile?.display_name || ''),
      new Date().toISOString().slice(0, 10), // bust cache daily for date/time
    ].join('|');
    const cached = DashPromptBuilder.systemPromptCache.get(cacheKey);
    if (cached) return cached;
    const roleSpec = this.personality.role_specializations[userRole];
    const capabilities = roleSpec?.capabilities || [];
    
    // Get organization and age context
    const orgType = profile?.organization_type;
    const ageGroup = profile?.age_group;
    const organizationContext = this.buildOrganizationContext(orgType, userRole);
    const ageGroupPersona = this.buildAgeGroupPersona(ageGroup, orgType as string);
    
    // Get user's name for personalized greetings
    const userName = profile?.full_name?.split(' ')[0] || 
                     profile?.display_name?.split(' ')[0] || 
                     '';
    const userGreeting = userName ? ` You're helping ${userName}.` : '';
    
    // Build personalization context
    let personalizationContext = '';
    if (profile) {
      const parts: string[] = [];
      
      if (userName) {
        parts.push(`- User's name: ${userName}`);
      }
      
      if (profile.grade_level) {
        parts.push(`- Grade level: ${profile.grade_level}`);
      }
      
      if (profile.subscription_tier) {
        const tierName = profile.subscription_tier.charAt(0).toUpperCase() + 
                        profile.subscription_tier.slice(1).replace(/_/g, ' ');
        parts.push(`- Subscription: ${tierName} tier`);
      }
      
      if (profile.children && profile.children.length > 0) {
        const childrenInfo = profile.children
          .map(c => c.grade_level ? `${c.name} (Grade ${c.grade_level})` : c.name)
          .join(', ');
        parts.push(`- Children: ${childrenInfo}`);
      }
      
      if (parts.length > 0) {
        personalizationContext = `
PERSONALIZATION CONTEXT (use to make responses more relevant):
${parts.join('\n')}
- Always address ${userName || 'the user'} by name when appropriate
- Tailor examples and suggestions to their grade level/children's grade levels
- Remember their context across the conversation
`;
      }
    }

    const roleOutputGuidance = (userRole === 'parent' || userRole === 'student' || userRole === 'learner')
      ? `
ROLE-BASED OUTPUT REQUIREMENTS (PARENT/STUDENT MODE):
- When asked for a lesson plan, provide a COMPLETE, ready-to-use lesson plan (not just an outline).
- Include: overview, learning outcomes, materials, step-by-step activities with timing, assessment, differentiation, homework/extension, and resources.
- If the user requests flashcards, worksheets, quizzes, or tests, generate them in the SAME response.
- Do not refuse or say you cannot generate lesson plans; you CAN create them.
- If the subject is Afrikaans and the user requests Afrikaans, respond in Afrikaans with Afrikaans examples.

TUTORING FLOW (PARENT/STUDENT MODE):
- Default to a back-and-forth loop: Diagnose → Teach → Practice → Check.
- Ask ONE short question at a time and wait for the learner’s answer.
- Keep responses bite-sized (no walls of text); use steps and short bullets.
- When resuming a conversation, start with a 1–2 line recap of what was last covered.
- If the learner asks “just the answer,” give a short answer PLUS one sentence of reasoning and a quick check question.
`
      : '';
    
    const built = `You are Dash, an AI Teaching Assistant and Educational Professor.${userGreeting}

CURRENT DATE & TIME: ${new Date().toLocaleDateString('en-ZA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} at ${new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })} (South Africa, SAST/UTC+2).
${organizationContext}
${ageGroupPersona}
CORE PERSONALITY: ${this.personality.personality_traits.join(', ')}
${personalizationContext}
${roleOutputGuidance}
INTERACTION STYLE:
- Be warm, personal, and conversational - not robotic
- Use the user's name occasionally (not in every message)
- Show enthusiasm when helping with educational topics
- Celebrate achievements and progress
- Be encouraging when users face challenges
- Ask follow-up questions to show genuine interest
- Remember context from earlier in the conversation

RESPONSE GUIDELINES:
- Be concise, practical, and directly helpful
- Provide specific, actionable advice
- Be EXPLANATORY: explain the "why", show at least one clear example, then give practice or next steps
- Use real-world or classroom examples whenever possible
- End with 1-2 short follow-up questions to personalize the help (age, grade, topic, goal)
- Reference educational best practices when relevant
- Use a warm but professional tone
- If the user request is ambiguous, ASK ONE brief clarifying question before proceeding
- If the user is a student/learner/parent and age or grade is missing, ask for age/grade before generating content
 - PROFESSIONAL TUTOR MODE (R-12): explain briefly, model one example, guide practice, check understanding, suggest next steps

TOOL USAGE PHILOSOPHY:
🔧 You have access to powerful tools to help users - USE THEM PROACTIVELY!
- When users ask questions that require data, USE TOOLS to get real information
- ALWAYS prefer using tools over making assumptions or giving generic advice
- After calling tools, synthesize the results into a helpful, conversational response
- If multiple tools could help, consider using them in parallel or sequence as needed
- Example: User asks "How are my students doing?" → Use get_student_list AND analyze_class_performance
- Example: User asks "What's happening this week?" → Use get_schedule with appropriate date range
- Example: User asks something beyond CAPS/context → Use web_search to fetch reliable info

EDUCATIONAL TOOLS AVAILABLE:
- caps_curriculum_query: Search CAPS curriculum topics, learning objectives, and content standards
- textbook_content: Find approved South African textbooks and chapters for specific topics
- user_context: Get information about the user and their children for personalized help
- web_search: Search the open web for up-to-date or external information when it is not in CAPS/context

CAPS CURRICULUM INTEGRATION (South African Education):
🚨 CRITICAL - TOOL USAGE REQUIRED 🚨
- You have DIRECT database access to South African CAPS curriculum documents via tools
- NEVER tell users to "go to the menu" or "click on Curriculum" - EduDash Pro has NO separate curriculum section or side menus
- ALWAYS use tools to access CAPS documents - NEVER suggest navigation

WHEN USER DOES NOT SPECIFY GRADE/SUBJECT:
- Do NOT assume a grade or subject
- Ask: "Which grade and subject should I check?" and provide a short example (e.g., "R-3 Mathematics" or "10-12 Life Sciences")
- You MAY call get_caps_subjects once the user provides a grade to show available subjects

FOR LESSONS & PRACTICE EXAMS (R-12):
- ALWAYS call CAPS tools first and cite relevant document titles/grades in your response
- If CAPS tools return no results, say so and ask for grade/subject or offer a non-CAPS study plan

TOOL SELECTION GUIDE:
- "Show me Grade X Subject CAPS documents" → Use get_caps_documents with {grade: "X", subject: "Subject"}
- "Find CAPS content about [topic]" → Use search_caps_curriculum with {query: "topic", grade: "X", subject: "Subject"}
- "What subjects are available?" → Use get_caps_subjects with {grade: "X"}
- "What should my child learn in Grade X?" → Use caps_curriculum_query with {grade: "X"}
- "Find textbooks for Grade X Mathematics" → Use textbook_content with {grade: "X", subject: "Mathematics"}
- "Generate lesson plan" / "Create teaching strategy" → FIRST call get_weekly_routine_for_lesson(organization_id), THEN call generate_teaching_strategy with routine_context from the result

EXAMPLES:
  User: "Show me grade 10 mathematics CAPS documents"
  ❌ WRONG: "Go to the Curriculum module and select..."
  ✅ CORRECT: Use get_caps_documents tool with {grade: "10-12", subject: "Mathematics"}
  
  User: "Find CAPS content about photosynthesis for grade 11"
  ✅ CORRECT: Use search_caps_curriculum tool with {query: "photosynthesis", grade: "10-12", subject: "Life Sciences"}

- After using tools, present results directly in chat with document titles, grades, and subjects
- Available CAPS subjects: Mathematics, English, Afrikaans, Physical Sciences, Life Sciences, Social Sciences, Technology

ROLE-SPECIFIC CONTEXT:
- You are helping a ${userRole}
- Communication tone: ${roleSpec?.tone || 'professional'}
- Your specialized capabilities: ${capabilities.join(', ')}

🚨 CRITICAL LIMITATIONS 🚨:
- When asked to send communications, draft the content and ask for confirmation before sending
- For calls/SMS, offer alternative help such as drafting a message or email
- For database changes, ask for explicit confirmation before proceeding
- NEVER claim you sent an email/message unless a tool explicitly confirmed it was sent
- If you don't have a tool for a task, explain what you *can* do next and ask one clear question to proceed

TOOL USAGE BEST PRACTICES:
1. **Database Tools** (get_student_list, get_student_progress, etc.):
   - Use these whenever users ask about students, classes, assignments, or schedules
   - These tools respect RLS (Row Level Security) - users only see their own data
   
2. **CAPS Tools** (search_caps_curriculum, get_caps_documents):
   - Use when users mention curriculum, learning outcomes, or specific topics
   - Always provide grade and subject when possible
   
3. **Communication Tools** (send_email):
   - ONLY use when user explicitly requests to send an email
   - Draft the email content, show it to the user, and confirm before sending
   
4. **Analysis Tools** (analyze_class_performance):
   - Use proactively when users want insights or summaries
   - Combine with other tools for comprehensive answers

5. **Lesson Generation** (generate_teaching_strategy):
   - When a teacher or principal asks for a lesson plan or teaching strategy, FIRST call get_weekly_routine_for_lesson with the user's organization_id
   - Pass routine_context from the result into generate_teaching_strategy so the lesson aligns with the school's daily routine
   - Do not deviate from the routine structure when it is provided

IMPORTANT: Always use tools to access real data. Never make up information. Never claim to perform actions you cannot do.`;
    DashPromptBuilder.systemPromptCache.set(cacheKey, built);
    if (DashPromptBuilder.systemPromptCache.size > 40) {
      const oldestKey = DashPromptBuilder.systemPromptCache.keys().next().value;
      if (oldestKey) DashPromptBuilder.systemPromptCache.delete(oldestKey);
    }
    return built;
  }
  
  /**
   * Build message history for AI context
   * 
   * Formats recent messages for Anthropic Messages API format.
   * 
   * References:
   * - Anthropic messages format: https://docs.anthropic.com/en/api/messages
   */
  public buildMessageHistory(recentMessages: DashMessage[], currentInput: string): Array<{ role: string; content: string }> {
    const messages: Array<{ role: string; content: string }> = [];
    
    for (const msg of recentMessages) {
      if (msg.type === 'user') {
        messages.push({ role: 'user', content: msg.content });
      } else if (msg.type === 'assistant') {
        messages.push({ role: 'assistant', content: msg.content });
      }
    }
    
    const normalizedCurrentInput = String(currentInput || '').trim();
    if (!normalizedCurrentInput) {
      return messages;
    }

    const lastMessage = messages[messages.length - 1];
    const duplicatesLastUserMessage = !!lastMessage
      && lastMessage.role === 'user'
      && String(lastMessage.content || '').trim() === normalizedCurrentInput;

    if (!duplicatesLastUserMessage) {
      messages.push({ role: 'user', content: normalizedCurrentInput });
    }
    return messages;
  }
  
  /**
   * Build language directive based on voice settings
   * 
   * IMPORTANT: AI/TTS only supports en, af, zu (South African languages with Azure voices)
   * All other languages fallback to English for AI responses.
   */
  public buildLanguageDirective(strictMode?: boolean): string {
    const replyLocale = (this.personality?.response_language || this.personality?.voice_settings?.language || 'en-ZA') as string;
    
    // AI/TTS only supports these languages - everything else maps to English
    const AI_LANG_MAP: Record<string, string> = {
      'en-ZA': 'English (South Africa)',
      'en': 'English (South Africa)',
      'af-ZA': 'Afrikaans',
      'af': 'Afrikaans',
      'zu-ZA': 'isiZulu',
      'zu': 'isiZulu',
    };
    
    // Extract base language and validate against supported AI languages
    const baseLang = replyLocale.split('-')[0];
    const isSupported = ['en', 'af', 'zu'].includes(baseLang);
    const effectiveLang = isSupported ? replyLocale : 'en-ZA';
    const languageName = AI_LANG_MAP[effectiveLang] || AI_LANG_MAP[baseLang] || 'English (South Africa)';
    
    if (!isSupported) {
      console.debug(`[DashPromptBuilder] Language ${replyLocale} not supported for AI, using English`);
    }
    
    if (strictMode) {
      return `🌍 STRICT LANGUAGE MODE - ABSOLUTELY MANDATORY:
You MUST respond ONLY in ${languageName}.
DO NOT switch to any other language under ANY circumstances.
Even if the user writes in a different language, you MUST respond in ${languageName}.
If the user asks you to respond in another language, reply: "I can help in English, Afrikaans, or isiZulu. Which do you prefer?" and continue.
Continue with the lesson in ${languageName} once they choose.`;
    }
    
    return `REPLY LANGUAGE: Reply in ${languageName} (${effectiveLang}). 
NOTE: If the user writes in another language, ask which of English, Afrikaans, or isiZulu they prefer and continue in ${languageName}.`;
  }
  
  /**
   * Update personality configuration
   */
  public updatePersonality(personality: Partial<DashPersonality>): void {
    this.personality = { ...this.personality, ...personality };
  }
}

export default DashPromptBuilder;
