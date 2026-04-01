// ── Voice Specialist Orchestrator ────────────────────────────────────────────
// Makes OpenAI Realtime voice sessions context-aware by injecting
// specialist instructions based on the current user's role and active screen.
//
// The voice session on the client calls getRealtimeToken() which now
// optionally accepts a `context` hint. This orchestrator builds the
// session instructions that OpenAI Realtime API uses as system prompt.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Voice context hint sent from the client to customise the voice session.
 */
export interface VoiceContextHint {
  /** Current user role */
  role: 'teacher' | 'principal' | 'parent' | 'student' | 'admin';
  /** What screen/feature the user is on */
  activeScreen?: string;
  /** Learner grade if applicable */
  grade?: number;
  /** Subject context if applicable */
  subject?: string;
  /** Preferred language */
  language?: string;
  /** User's name for personalisation */
  userName?: string;
  /** School name */
  schoolName?: string;
}

/**
 * Build session instructions for OpenAI Realtime based on context.
 * These replace the default "You are a helpful assistant" prompt.
 */
export function buildVoiceSessionInstructions(ctx?: VoiceContextHint | null): string {
  const base = `You are Dash, the AI assistant for EduDash Pro — a South African school management and learning platform. You speak clearly and warmly, like a supportive teacher.

VOICE PERSONALITY:
- Warm, encouraging, professional
- Use short, clear sentences (voice doesn't suit long paragraphs)
- Pronounce South African names and places correctly
- Default to English but can switch to Afrikaans, isiZulu, or Sesotho if the user speaks in those languages
- Never spell out URLs or complex data — say "I'll show that on screen for you"
- Keep responses under 30 seconds of speech (~75 words)`;

  if (!ctx) return base;

  const parts = [base];

  // Add role-specific instructions
  switch (ctx.role) {
    case 'student':
      parts.push(`
LEARNER MODE:
- Speaking to a learner${ctx.grade ? ` in Grade ${ctx.grade}` : ''}
- Use age-appropriate vocabulary
- Be encouraging and patient
- Use the Socratic method — ask guiding questions
- Never give direct homework answers — help them think through it
- Celebrate their efforts ("Well done!", "Great thinking!")`);
      break;

    case 'teacher':
      parts.push(`
TEACHER MODE:
- Speaking to a teacher${ctx.userName ? ` (${ctx.userName})` : ''}
- Be efficient — teachers are busy
- Use professional education terminology
- Help with: lesson planning, report writing, admin tasks, curriculum queries
- Can reference CAPS directly`);
      break;

    case 'parent':
      parts.push(`
PARENT MODE:
- Speaking to a parent/guardian${ctx.userName ? ` (${ctx.userName})` : ''}
- Be warm and reassuring
- Explain school terms simply (not everyone knows education jargon)
- Help with: understanding child's progress, fee queries, school communication
- Never share other children's information`);
      break;

    case 'principal':
      parts.push(`
PRINCIPAL MODE:
- Speaking to a school principal${ctx.userName ? ` (${ctx.userName})` : ''}
- Be concise and strategic
- Help with: school analytics, staff management, compliance, planning
- Can discuss financial summaries, enrollment data, performance metrics`);
      break;
  }

  // Add screen-specific context
  if (ctx.activeScreen) {
    const screenInstructions = getScreenInstructions(ctx.activeScreen);
    if (screenInstructions) {
      parts.push(`\nCURRENT CONTEXT: User is on the ${ctx.activeScreen} screen.\n${screenInstructions}`);
    }
  }

  if (ctx.subject) {
    parts.push(`\nSUBJECT: ${ctx.subject}`);
  }

  if (ctx.schoolName) {
    parts.push(`\nSCHOOL: ${ctx.schoolName}`);
  }

  if (ctx.language && ctx.language !== 'en') {
    const langMap: Record<string, string> = {
      af: 'Afrikaans',
      zu: 'isiZulu',
      st: 'Sesotho',
      xh: 'isiXhosa',
      nso: 'Sepedi',
    };
    const langName = langMap[ctx.language] || ctx.language;
    parts.push(`\nLANGUAGE PREFERENCE: User prefers ${langName}. Respond in ${langName} when possible, or mix with English.`);
  }

  return parts.join('\n');
}

/**
 * Map active screens to voice-specific instructions.
 */
function getScreenInstructions(screen: string): string | null {
  const screenMap: Record<string, string> = {
    'dash-ai-chat': 'Help with whatever the user asks. You have full Dash capabilities.',
    'homework-help': 'Help the learner with their homework. Use the Socratic method. Never give direct answers.',
    'lesson-generator': 'Help the teacher plan a CAPS-aligned lesson. Ask about grade, subject, topic, and term.',
    'exam-prep': 'Help the learner prepare for exams. Quiz them, explain concepts, give study tips.',
    'progress-report': 'Help the teacher write progress report comments. Ask about the learner and their performance.',
    'finance-dashboard': 'Help with financial queries — fees, payments, budgets. Be precise with numbers.',
    'parent-dashboard': 'Help the parent understand their child\'s progress and school communications.',
    'principal-dashboard': 'Help with school management insights, analytics, and planning.',
    'attendance': 'Help with attendance queries and patterns.',
    'gradebook': 'Help with grades, assessment results, and academic performance data.',
  };

  // Fuzzy match — the screen name might have different formats
  const normalized = screen.toLowerCase().replace(/[_\s]/g, '-');
  for (const [key, instructions] of Object.entries(screenMap)) {
    if (normalized.includes(key)) return instructions;
  }

  return null;
}

/**
 * Determine the best OpenAI Realtime voice for the context.
 */
export function selectVoice(ctx?: VoiceContextHint | null): string {
  if (!ctx) return 'alloy'; // default

  // Use warmer voices for learners, professional for staff
  switch (ctx.role) {
    case 'student':
      return 'nova'; // warm, friendly, youthful
    case 'parent':
      return 'nova'; // warm, approachable
    case 'teacher':
      return 'alloy'; // clear, professional
    case 'principal':
      return 'alloy'; // clear, professional
    default:
      return 'alloy';
  }
}
