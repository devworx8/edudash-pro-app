/**
 * Claude AI Service Integration
 * 
 * Comprehensive integration with Anthropic's Claude API for educational content generation.
 * Handles homework help, lesson planning, and educational content creation with
 * multilingual support and usage tracking.
 */

import { getCurrentLanguage } from '@/lib/i18n';
import { track } from '@/lib/analytics';
import { reportError } from '@/lib/monitoring';
import { 
  ClaudeConfig, 
  ClaudeRequest, 
  ClaudeResponse, 
  ClaudeMessage,
  AIRequest,
  AIResponse,
  AIServiceError
} from './types';

// Default Claude configuration
const DEFAULT_CONFIG: Omit<ClaudeConfig, 'apiKey'> = {
  model: process.env.EXPO_PUBLIC_ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
  maxTokens: 4000,
  temperature: 0.7,
};

// Educational system prompts in multiple languages
const SYSTEM_PROMPTS = {
  homework_help: {
    en: `You are an expert educational AI assistant specializing in homework help. 
Your role is to guide students through learning by:
- Breaking down complex problems into manageable steps
- Providing clear explanations with examples
- Encouraging critical thinking rather than giving direct answers
- Adapting explanations to the appropriate grade level
- Being patient, supportive, and encouraging

Always maintain an educational focus and avoid doing the work for students.`,

    es: `Eres un asistente educativo de IA experto especializado en ayuda con tareas.
Tu función es guiar a los estudiantes a través del aprendizaje:
- Dividiendo problemas complejos en pasos manejables
- Proporcionando explicaciones claras con ejemplos
- Fomentando el pensamiento crítico en lugar de dar respuestas directas
- Adaptando explicaciones al nivel de grado apropiado
- Siendo paciente, solidario y alentador

Mantén siempre un enfoque educativo y evita hacer el trabajo por los estudiantes.`,

    fr: `Vous êtes un assistant IA éducatif expert spécialisé dans l'aide aux devoirs.
Votre rôle est de guider les étudiants à travers l'apprentissage en:
- Décomposant les problèmes complexes en étapes gérables
- Fournissant des explications claires avec des exemples
- Encourageant la pensée critique plutôt que de donner des réponses directes
- Adaptant les explications au niveau scolaire approprié
- Étant patient, solidaire et encourageant

Maintenez toujours un focus éducatif et évitez de faire le travail pour les étudiants.`,
    
    pt: `Você é um assistente educacional de IA especializado em ajuda com lições de casa.
Seu papel é guiar os estudantes através do aprendizado:
- Dividindo problemas complexos em etapas gerenciáveis
- Fornecendo explicações claras com exemplos
- Encorajando pensamento crítico em vez de dar respostas diretas
- Adaptando explicações ao nível de série apropriado
- Sendo paciente, solidário e encorajador

Sempre mantenha um foco educacional e evite fazer o trabalho pelos estudantes.`,
    
    de: `Sie sind ein Experte für Bildungs-KI, spezialisiert auf Hausaufgabenhilfe.
Ihre Aufgabe ist es, Schüler durch das Lernen zu führen:
- Komplexe Probleme in handhabbare Schritte unterteilen
- Klare Erklärungen mit Beispielen liefern
- Kritisches Denken fördern statt direkte Antworten geben
- Erklärungen an die entsprechende Klassenstufe anpassen
- Geduldig, unterstützend und ermutigend sein

Behalten Sie immer einen Bildungsfokus bei und vermeiden Sie es, die Arbeit für Schüler zu erledigen.`,
    
    // South African languages
    af: `Jy is 'n kenner opvoedkundige KI-assistent wat spesialiseer in huiswerk hulp.
Jou rol is om studente te lei deur leer deur:
- Komplekse probleme op te breek in hanteerbare stappe
- Duidelike verduidelikings met voorbeelde te gee
- Kritiese denke aan te moedig eerder as om direkte antwoorde te gee
- Verduidelikings aan te pas by die toepaslike graadvlak
- Geduldig, ondersteunend en bemoedigend te wees

Hou altyd 'n opvoedkundige fokus en vermy om die werk vir studente te doen.`,
    
    zu: `Ungusazi wemsizi we-AI wezemfundo ochwepheshe ekusizeni ngomsebenzi wasekhaya.
Umsebenzi wakho ukuqondisa abafundi ngokufunda ngokuthi:
- Uhlukanise izinkinga eziyinkimbinkimbi zibe yizinyathelo ezilawulekayo
- Unikeze izincazelo ezicacile nezibonelo
- Ukhuthaze ukucabanga okucijile kunokuba unikeze izimpendulo eziqondile
- Uvumelanise izincazelo nebanga elifanele
- Ube nomonde, usekele futhi ukhuthaze

Hlala ugxile kwezemfundo futhi ugweme ukwenzela abafundi umsebenzi.`,
    
    st: `O mosebetsi oa thuto ea AI ea setsebi ea ikhethileng thusong ea mosebetsi oa lehae.
Mosebetsi oa hao ke ho tataisa baithuti ka ho ithuta ka:
- Ho arola mathata a rarahaneng ka mehato e laolehang
- Ho fana ka ditlhaloso tse hlakileng le mehlala
- Ho kgothatsa mnahano e tebileng ho feta ho fana ka dikarabo tse tobileng
- Ho lumellana ditlhaloso le boemo bo loketseng ba sehlopha
- Ho ba le mamello, ho tsehetsa le ho kgothatsa

Dula u tsepamise maikutlo ho thuto 'me u qobe ho etsetsa baithuti mosebetsi.`
  },

  lesson_generation: {
    en: `You are an expert educational curriculum designer and lesson planner.
Your role is to create comprehensive, engaging, and pedagogically sound lessons that:
- Align with educational standards and learning objectives
- Include diverse teaching methods and activities
- Provide clear assessment strategies
- Offer differentiation options for various learning styles
- Incorporate interactive and hands-on elements
- Consider practical classroom constraints

Create lessons that are both educationally effective and practically implementable.`,

    es: `Eres un diseñador de curriculum educativo experto y planificador de lecciones.
Tu función es crear lecciones integrales, atractivas y pedagógicamente sólidas que:
- Se alineen con estándares educativos y objetivos de aprendizaje
- Incluyan métodos de enseñanza y actividades diversas
- Proporcionen estrategias de evaluación claras
- Ofrezcan opciones de diferenciación para varios estilos de aprendizaje
- Incorporen elementos interactivos y prácticos
- Consideren limitaciones prácticas del aula

Crea lecciones que sean tanto educativamente efectivas como prácticamente implementables.`,

    fr: `Vous êtes un concepteur expert de curriculum éducatif et planificateur de leçons.
Votre rôle est de créer des leçons complètes, engageantes et pédagogiquement solides qui:
- S'alignent avec les standards éducatifs et objectifs d'apprentissage
- Incluent des méthodes d'enseignement et activités diverses
- Fournissent des stratégies d'évaluation claires
- Offrent des options de différenciation pour divers styles d'apprentissage
- Incorporent des éléments interactifs et pratiques
- Considèrent les contraintes pratiques de classe

Créez des leçons qui sont à la fois éducativement efficaces et pratiquement implémentables.`,

    pt: `Você é um designer especialista em currículo educacional e planejador de aulas.
Seu papel é criar aulas abrangentes, envolventes e pedagogicamente sólidas que:
- Alinhem com padrões educacionais e objetivos de aprendizagem
- Incluam métodos de ensino e atividades diversas
- Fornecem estratégias de avaliação claras
- Ofereçam opções de diferenciação para vários estilos de aprendizagem
- Incorporem elementos interativos e práticos
- Considerem restrições práticas da sala de aula

Crie aulas que sejam tanto educacionalmente eficazes quanto praticamente implementáveis.`,

    de: `Sie sind ein Experte für Lehrplangestaltung und Unterrichtsplanung.
Ihre Aufgabe ist es, umfassende, ansprechende und pädagogisch fundierte Lektionen zu erstellen, die:
- Mit Bildungsstandards und Lernzielen übereinstimmen
- Vielfältige Lehrmethoden und Aktivitäten einschließen
- Klare Bewertungsstrategien bieten
- Differenzierungsoptionen für verschiedene Lernstile anbieten
- Interaktive und praktische Elemente einbeziehen
- Praktische Klassenraum-Beschränkungen berücksichtigen

Erstellen Sie Lektionen, die sowohl pädagogisch effektiv als auch praktisch umsetzbar sind.`,
    
    // South African languages
    af: `Jy is 'n kenner opvoedkundige kurrikulum ontwerper en les beplanner.
Jou rol is om omvattende, boeiende en pedagogies gesonde lesse te skep wat:
- In lyn is met opvoedkundige standaarde en leerdoelwitte
- Diverse onderrigmetodes en aktiwiteite insluit
- Duidelike assesseringsstrategieë bied
- Differensiasie opsies vir verskillende leerstyle aanbied
- Interaktiewe en praktiese elemente insluit
- Praktiese klaskamer beperkings in ag neem

Skep lesse wat beide opvoedkundig effektief en prakties implementeerbaar is.`,
    
    zu: `Ungusazi wezemfundo ochwepheshe ekwakheni izinhlelozifundo kanye nokuhlela izifundo.
Umsebenzi wakho ukudala izifundo eziphelele, ezikhangayo neziyisisiseko zemfundo ezenza:
- Ivumelane nezindinganiso zemfundo nezinhloso zokufunda
- Ifake izindlela ezahlukahlukene zokufundisa nemisebenzi
- Inikeze amasu acacile okuhlola
- Inikeze ukukhetha okuphathelene nezitayela ezahlukahlukene zokufunda
- Ifake izingxenye ezisebenzisanayo neziphatheka
- Icabange imikhawulo evelayo yegumbi lokufundela

Dala izifundo eziyimpumelelo kwezemfundo futhi eziyenzeka ngokwenzeko.`,
    
    st: `O setsebi sa moralo wa thuto le sehlopheng sa dithuto.
Mosebetsi wa hao ke ho theha dithuto tse felletseng, tse kgahlisang le tse thehiloeng ka thuto tse:
- Tse lumellanang le maemo a thuto le sepheo sa ho ithuta
- Tse kenyelletsang mekgwa e sa tshwaneng ea thuto le mesebetsi
- Tse fanang ka maano a hlakiseng a tekolo
- Tse fanang ka dikhetho tsa ho fapana bakeng sa mekgwa e fapaneng ea ho ithuta
- Tse kenyelletsang dikarolo tse sebetsanang le tse tshwarehanang
- Tse nahanang ka dikgatholelo tsa sebele tsa phaposi ea thuto

Etsa dithuto tse sebetsang ka thuto hape tse ka sebetsoa ka toka.`
  }
};

class ClaudeService {
  private config: Omit<ClaudeConfig, 'apiKey'>;
  private baseUrl: string;

  constructor() {
    // Use server-side proxy - no client-side API keys!
    this.baseUrl = process.env.EXPO_PUBLIC_API_BASE || 'https://your-backend-api.com';
    
    this.config = {
      ...DEFAULT_CONFIG,
      // API key is handled server-side for security
    };
  }

  /**
   * Generate a response using Claude API
   */
  async generateResponse(request: AIRequest): Promise<AIResponse> {
    const startTime = Date.now();
    
    try {
      // Track request
      track('edudash.ai.claude.request_started', {
        service_type: request.serviceType,
        user_id: request.userId,
        organization_id: request.organizationId,
        language: getCurrentLanguage(),
      });

      // Build Claude request
      const claudeRequest = this.buildClaudeRequest(request);
      
      // Make API call
      const claudeResponse = await this.callClaudeAPI(claudeRequest);
      
      // Process response
      const response = this.processClaudeResponse(request, claudeResponse, startTime);
      
      // Track successful response
      track('edudash.ai.claude.request_completed', {
        service_type: request.serviceType,
        user_id: request.userId,
        tokens_used: response.tokensUsed,
        processing_time_ms: response.processingTimeMs,
        cost_cents: response.cost,
      });

      return response;
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      // Track error
      track('edudash.ai.claude.request_failed', {
        service_type: request.serviceType,
        user_id: request.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
        processing_time_ms: processingTime,
      });

      // Report error for monitoring
      reportError(new Error('Claude API request failed'), {
        request_id: request.id,
        service_type: request.serviceType,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw this.handleClaudeError(error);
    }
  }

  /**
   * Build Claude API request from our internal request format
   */
  private buildClaudeRequest(request: AIRequest): ClaudeRequest {
    const language = getCurrentLanguage();
    const serviceType = request.serviceType;
    
    // Get appropriate system prompt
    let systemPrompt = '';
    if (serviceType in SYSTEM_PROMPTS) {
      const prompts = SYSTEM_PROMPTS[serviceType as keyof typeof SYSTEM_PROMPTS];
      systemPrompt = prompts[language] || prompts.en;
    }

    // Build context-aware user message
    let userMessage = request.prompt;
    
    // Add context based on metadata
    if (request.metadata) {
      const contextParts = [];
      
      if (request.metadata.subject) {
        contextParts.push(`Subject: ${request.metadata.subject}`);
      }
      
      if (request.metadata.studentAge) {
        contextParts.push(`Student age: ${request.metadata.studentAge} years old`);
      }
      
      if (request.metadata.difficulty) {
        contextParts.push(`Difficulty level: ${request.metadata.difficulty}`);
      }

      if (contextParts.length > 0) {
        userMessage = `${contextParts.join(', ')}\n\n${userMessage}`;
      }
    }

    // Add language instruction if not English
    if (language !== 'en') {
      userMessage += `\n\nPlease respond in ${this.getLanguageName(language)}.`;
    }

    const messages: ClaudeMessage[] = [
      {
        role: 'user',
        content: userMessage,
      }
    ];

    return {
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      system: systemPrompt,
      messages,
    };
  }

  /**
   * Make API call through secure server-side proxy
   * This ensures API keys are never exposed client-side
   */
  private async callClaudeAPI(request: ClaudeRequest): Promise<ClaudeResponse> {
    // Call your backend API endpoint instead of Claude directly
    const proxyUrl = `${this.baseUrl}/ai/claude/messages`;
    
    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Include user auth token for server-side validation
        'Authorization': `Bearer ${await this.getAuthToken()}`,
      },
      body: JSON.stringify({
        ...request,
        // Include additional context for server-side processing
        userId: await this.getCurrentUserId(),
        timestamp: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI Proxy error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return response.json() as Promise<ClaudeResponse>;
  }

  /**
   * Process Claude API response into our internal format
   */
  private processClaudeResponse(
    originalRequest: AIRequest,
    claudeResponse: ClaudeResponse,
    startTime: number
  ): AIResponse {
    const processingTime = Date.now() - startTime;
    const totalTokens = claudeResponse.usage.input_tokens + claudeResponse.usage.output_tokens;
    
    // Calculate cost (approximate pricing)
    const inputTokenCost = (claudeResponse.usage.input_tokens / 1000) * 3; // $3 per 1K input tokens
    const outputTokenCost = (claudeResponse.usage.output_tokens / 1000) * 15; // $15 per 1K output tokens
    const totalCostCents = Math.ceil((inputTokenCost + outputTokenCost) * 100);

    // Extract content
    const content = claudeResponse.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n');

    return {
      id: claudeResponse.id,
      requestId: originalRequest.id,
      content,
      tokensUsed: totalTokens,
      processingTimeMs: processingTime,
      cost: totalCostCents,
      completedAt: new Date(),
      success: true,
    };
  }

  /**
   * Handle and transform Claude API errors
   */
  private handleClaudeError(error: unknown): AIServiceError {
    if (error instanceof Error) {
      // Parse Claude API error responses
      if (error.message.includes('rate limit')) {
        return {
          code: 'RATE_LIMITED',
          message: 'Rate limit exceeded. Please try again later.',
          retryable: true,
          retryAfter: 60, // seconds
        };
      }

      if (error.message.includes('401') || error.message.includes('unauthorized')) {
        return {
          code: 'UNAUTHORIZED',
          message: 'API key is invalid or expired.',
          retryable: false,
        };
      }

      if (error.message.includes('400') || error.message.includes('bad request')) {
        return {
          code: 'BAD_REQUEST',
          message: 'Invalid request parameters.',
          retryable: false,
        };
      }

      if (error.message.includes('500') || error.message.includes('server error')) {
        return {
          code: 'SERVER_ERROR',
          message: 'Claude API server error. Please try again.',
          retryable: true,
          retryAfter: 30,
        };
      }
    }

    // Default error
    return {
      code: 'UNKNOWN_ERROR',
      message: 'An unexpected error occurred while processing your request.',
      retryable: true,
      retryAfter: 10,
    };
  }

  /**
   * Get current user's auth token for server-side validation
   */
  private async getAuthToken(): Promise<string> {
    try {
      // Get auth token from secure storage or auth context
      const { assertSupabase } = await import('@/lib/supabase');
      const { data: { session } } = await assertSupabase().auth.getSession();
      return session?.access_token || '';
    } catch (error) {
      console.warn('Failed to get auth token:', error);
      return '';
    }
  }

  /**
   * Get current user ID for server-side processing
   */
  private async getCurrentUserId(): Promise<string> {
    try {
      const { assertSupabase } = await import('@/lib/supabase');
      const { data: { user } } = await assertSupabase().auth.getUser();
      return user?.id || '';
    } catch (error) {
      console.warn('Failed to get user ID:', error);
      return '';
    }
  }

  /**
   * Get human-readable language name
   */
  private getLanguageName(languageCode: string): string {
    const languages: Record<string, string> = {
      en: 'English',
      es: 'Spanish',
      fr: 'French',
      pt: 'Portuguese',
      de: 'German',
    };
    
    return languages[languageCode] || 'English';
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<ClaudeConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current configuration (client-safe, no sensitive data)
   */
  getConfig(): Omit<ClaudeConfig, 'apiKey'> {
    // Return configuration without any sensitive information
    return { ...this.config };
  }

  /**
   * Test API connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const testRequest: AIRequest = {
        id: 'test-' + Date.now(),
        userId: 'test-user',
        serviceType: 'homework_help',
        provider: 'claude',
        prompt: 'Hello, this is a test message.',
        requestedAt: new Date(),
      };

      await this.generateResponse(testRequest);
      return true;
    } catch {
      return false;
    }
  }
}

// Create singleton instance
export const claudeService = new ClaudeService();

// Export for testing and configuration
export { ClaudeService };
export default claudeService;
