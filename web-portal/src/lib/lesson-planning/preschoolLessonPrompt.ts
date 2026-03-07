/**
 * Preschool Lesson Specialist — Prompt Library
 *
 * State-of-the-art content guidance for AI-generated preschool/ECD lesson plans.
 * Aligns with developmentally appropriate practice, play-based pedagogy,
 * DBE/CAPS early years, and South African context.
 *
 * @module lib/lesson-planning/preschoolLessonPrompt
 */

import type { QuickLessonThemeContext } from './quickLessonThemeContext';

/** ECD development domains to reference in objectives and activities */
export const ECD_DOMAINS = [
  'Cognitive (thinking, problem-solving, early numeracy/literacy)',
  'Social-emotional (self-regulation, sharing, empathy, relationships)',
  'Physical (fine and gross motor, coordination, body awareness)',
  'Language (listening, speaking, vocabulary, phonological awareness)',
  'Creative (expression through art, music, movement, pretend play)',
] as const;

/** Standard section headings for consistent AI output and parsing */
export const PRESCHOOL_LESSON_SECTIONS = [
  'Lesson Title',
  'Learning Objectives',
  'Materials Needed',
  'Opening / Circle Time',
  'Main Activities',
  'Movement & Transition',
  'Closing & Reflection',
  'Differentiation & Inclusion',
  'Teacher Notes',
  'Take-Home Activity',
] as const;

/**
 * Build the core preschool specialist instruction block.
 * Use when isPreschool is true to get developmentally appropriate, play-based content.
 */
export function buildPreschoolSpecialistBlock(options: {
  ageGroup: string;
  ageRange: string;
  durationMinutes: number;
  language: 'en' | 'af' | 'zu' | 'st';
  quickMode?: boolean;
  themeContext?: QuickLessonThemeContext | null;
  subjectHint?: string;
}): string {
  const {
    ageGroup,
    ageRange,
    durationMinutes,
    language,
    quickMode = false,
    themeContext,
    subjectHint,
  } = options;

  const langLabel =
    language === 'af'
      ? 'Afrikaans'
      : language === 'zu'
        ? 'isiZulu'
        : language === 'st'
          ? 'Sesotho'
          : 'English';

  const attentionSpan =
    ageRange === '1-2'
      ? '2–5 minutes per activity; frequent transitions; sensory focus'
      : ageRange === '3-4'
        ? '5–10 minutes per activity; high variety; hands-on'
        : ageRange === '4-5'
          ? '10–15 minutes per activity; structured progression'
          : '10–20 minutes per activity; clear objectives and closure';

  const themeBlock = themeContext
    ? `
**SCHOOL PLANNING ALIGNMENT (follow closely):**
- Weekly focus: ${themeContext.weeklyFocus || 'General'}
- Theme: ${themeContext.themeTitle || 'N/A'}${themeContext.themeDescription ? ` — ${themeContext.themeDescription}` : ''}
- Objectives to support: ${(themeContext.themeObjectives || themeContext.weeklyObjectives || []).slice(0, 5).join('; ')}
`
    : '';

  const quickBlock = quickMode
    ? `
**QUICK LESSON MODE:** Low-prep, high-engagement. Use minimal materials, clear transitions, and instructions that any practitioner can follow in under 5 minutes of setup.`
    : '';

  return `
You are an expert early childhood educator and curriculum specialist creating a developmentally appropriate preschool lesson plan. Your practice is grounded in:
- **Developmentally Appropriate Practice (DAP)** and NAEYC/ECD guidelines
- **Play-based learning** — learning through guided play, exploration, and discovery
- **South African context** — DBE/CAPS early years, inclusive classrooms, multilingualism, and local relevance
- **Whole-child focus** — activities that touch multiple development domains where possible

**AUDIENCE & TIMING:**
- Age group: ${ageGroup} (${ageRange} years)
- Duration: ${durationMinutes} minutes total
- Language of instruction: ${langLabel}
${subjectHint ? `- Subject/area: ${subjectHint}` : ''}
${themeBlock}
${quickBlock}

**ECD DEVELOPMENT DOMAINS (reference where relevant):**
${ECD_DOMAINS.map((d) => `- ${d}`).join('\n')}

**DESIGN PRINCIPLES:**
- **Age-appropriate:** Simple, concrete language and concepts; activities matched to ${ageRange} developmental milestones. Attention span: ${attentionSpan}.
- **Multi-modal:** Combine visual, auditory, kinesthetic, and tactile learning in each lesson.
- **Inclusive:** Include differentiation (simplify for some, extend for others) and consider diverse abilities and home languages.
- **Practical:** Clear step-by-step instructions; materials that are easy to source (common classroom or recyclable); timing for each section.
- **Engaging:** Strong hook (story, song, mystery, or dramatic play); movement and transition activities; reflection and sharing.
- **SA-relevant:** Use examples, names, and scenarios that South African children can relate to; acknowledge multiple languages and cultures where natural.
`.trim();
}

/**
 * Build the required output format so the AI returns a consistent, parseable structure.
 */
export function buildPreschoolOutputFormat(options: {
  durationMinutes: number;
  includeTakeHome?: boolean;
  includeTeacherNotes?: boolean;
}): string {
  const { durationMinutes, includeTakeHome = true, includeTeacherNotes = true } = options;
  const open = Math.max(3, Math.floor(durationMinutes * 0.15));
  const main = Math.max(10, Math.floor(durationMinutes * 0.55));
  const move = Math.max(2, Math.floor(durationMinutes * 0.1));
  const close = Math.max(3, Math.floor(durationMinutes * 0.2));

  return `
**FORMAT YOUR RESPONSE EXACTLY AS FOLLOWS (use these section headings):**

## Lesson Title
[One engaging, descriptive title]

## Learning Objectives
- [3–4 specific, observable objectives; reference ECD domains where relevant]
- Use verbs like: identify, name, sort, create, demonstrate, share, describe

## Materials Needed
- **Essential:** [5–8 items with quantities where helpful; include low-cost/DIY options]
- **Optional:** [1–3 extension materials]

## Opening / Circle Time (${open} min)
- **Hook:** [Story, song, mystery box, or dramatic element that connects to the topic]
- **Discussion:** [1–2 questions to activate prior knowledge]
- **Transition:** [Clear cue to move to main activities]

## Main Activities (${main} min)
**Activity 1: [Name]**
- Setup: [Brief prep]
- Steps: [3–5 clear steps]
- Teacher prompts: [Questions to guide learning]
- Learning check: [How to see if children are with you]

**Activity 2: [Name]** (or one longer activity with two parts)
- [Same structure]

## Movement & Transition (${move} min)
- [Short physical activity that reinforces the concept; clear transition cue]

## Closing & Reflection (${close} min)
- [Review 1–2 key ideas]
- [Children share or show what they did]
- [Closing ritual or song]

## Differentiation & Inclusion
- **Simplify:** [One way to support struggling or younger learners]
- **Extend:** [One way to challenge advanced learners]
- **Inclusion:** [One tip for diverse abilities or languages]

${includeTeacherNotes ? '## Teacher Notes\n- [2–3 practical tips: management, common pitfalls, or follow-up ideas]\n' : ''}
${includeTakeHome ? '## Take-Home Activity\n- **Name:** [Short name]\n- **Instructions:** [3–4 steps for parents; household materials only]\n- **Conversation starters:** [2–3 questions for parents to ask]\n' : ''}
`.trim();
}
