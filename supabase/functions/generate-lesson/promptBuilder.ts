/**
 * Lesson Plan Prompt Builder
 *
 * Follows the same pattern as generate-exam/promptBuilder.ts.
 * All learner-facing and teacher-facing content is SA-localised,
 * CAPS-aligned, and hallucination-resistant.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type SupportedLanguage =
  | 'English' | 'Afrikaans' | 'isiZulu' | 'isiXhosa'
  | 'Sesotho' | 'Setswana' | 'Sepedi' | 'Xitsonga'
  | 'Siswati' | 'Tshivenda' | 'isiNdebele';

export type CAPSPhase =
  | 'Foundation Phase'    // Grade R–3
  | 'Intermediate Phase'  // Grade 4–6
  | 'Senior Phase'        // Grade 7–9
  | 'FET Phase';          // Grade 10–12

export type LessonDuration = 30 | 45 | 60 | 90;

export interface LessonPlanRequest {
  subject: string;
  grade: number;           // 0 = Grade R, 1–12
  term: 1 | 2 | 3 | 4;
  week?: number;           // 1–10
  topic: string;
  subtopic?: string;
  language: SupportedLanguage;
  duration: LessonDuration;
  learnerCount?: number;
  schoolType?: 'Public' | 'Independent' | 'Preschool';
  priorKnowledge?: string;
  availableResources?: string[];
  differentiationNeeds?: string;
  teacherNotes?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getCAPSPhase(grade: number): CAPSPhase {
  if (grade <= 3) return 'Foundation Phase';
  if (grade <= 6) return 'Intermediate Phase';
  if (grade <= 9) return 'Senior Phase';
  return 'FET Phase';
}

export function gradeLabel(grade: number): string {
  return grade === 0 ? 'Grade R' : `Grade ${grade}`;
}

/**
 * Returns subject-specific CAPS section guidance for the lesson.
 * Mirrors the approach in generate-exam/promptBuilder.ts getSubjectSectionStructure().
 */
export function getCAPSLessonGuidance(subject: string, phase: CAPSPhase): string | null {
  const s = subject.toLowerCase();

  if (s.includes('mathemat') && !s.includes('literacy')) {
    return `CAPS Mathematics guidance: Structure lesson around Number, Operations & Relationships OR Space & Shape OR Measurement OR Data Handling — whichever the topic falls under. Foundation/Intermediate: concrete → representational → abstract (CRA) progression. Senior/FET: emphasise mathematical reasoning, proof where appropriate. Always show worked examples with step-by-step working.`;
  }
  if (s.includes('mathematical') && s.includes('literacy')) {
    return `CAPS Mathematical Literacy guidance: Always embed maths in real SA contexts (budgets, maps, timetables, data). Use SA Rands, SA distances, SA food prices. Avoid abstract drill — every question must have a realistic scenario.`;
  }
  if (s.includes('english') || s.includes('afrikaans') || s.includes('isizulu') || s.includes('isixhosa') || s.includes('sesotho') || s.includes('setswana') || s.includes('sepedi') || s.includes('xitsonga') || s.includes('siswati') || s.includes('tshivenda') || s.includes('isindebele')) {
    return `CAPS Home/First Additional Language guidance: Include all four skills — Listening & Speaking, Reading & Viewing, Writing & Presenting, Language Structures & Conventions. Foundation Phase: phonics and word recognition activities. Intermediate+: focus on comprehension strategies and text types. Always include a text stimulus (story, poem, poster, etc.) appropriate for the grade.`;
  }
  if (s.includes('life skill')) {
    return `CAPS Life Skills guidance (Foundation Phase): Integrate Beginning Knowledge, Personal & Social Well-being, and Creative Arts/Physical Education strands. Activities must be hands-on and age-appropriate. Emphasise Ubuntu values and SA cultural contexts.`;
  }
  if (s.includes('life orientation')) {
    return `CAPS Life Orientation guidance: Cover the relevant LO strand (Development of Self, Social and Environmental Responsibility, Democracy and Human Rights, or Physical Education). Use SA contexts — Constitution, Bill of Rights, local community examples.`;
  }
  if (s.includes('natural science')) {
    return `CAPS Natural Sciences guidance: Include a scientific investigation or practical activity where possible. Link to CAPS content areas: Life and Living, Matter and Materials, Energy and Change, Earth and Beyond. Emphasise scientific process skills — observe, classify, predict, investigate, communicate.`;
  }
  if (s.includes('physical science')) {
    return `CAPS Physical Sciences guidance: Separate Chemistry and Physics strands where applicable. Include calculations with worked examples. Emphasise conceptual understanding before formulae. Practical demonstrations strongly recommended.`;
  }
  if (s.includes('life science')) {
    return `CAPS Life Sciences guidance: Link to CAPS content topics (Biodiversity, Life Processes, Environmental Studies). Include diagrams where helpful. Use SA flora/fauna and ecosystems as examples — fynbos, savanna, Highveld, etc.`;
  }
  if (s.includes('social science') || s.includes('history') || s.includes('geography')) {
    return `CAPS Social Sciences/History/Geography guidance: Emphasise source work and critical thinking. History: primary and secondary sources, chronology, cause and effect. Geography: map skills, data interpretation, SA-specific physical/human geography. Always contextualise in SA and Africa.`;
  }
  if (s.includes('economic') && s.includes('management')) {
    return `CAPS EMS guidance (Intermediate Phase): Integrate the Economy, Entrepreneurship, and Financial Literacy components. Use SA business contexts — small spaza shops, school tuck shops, local market examples.`;
  }
  if (s.includes('technology')) {
    return `CAPS Technology guidance: Follow the design process — Investigate, Design, Make, Evaluate, Communicate. Use materials and tools available in a typical SA school. Avoid technology-dependent activities without offline fallbacks.`;
  }
  if (s.includes('creative art')) {
    return `CAPS Creative Arts guidance: Cover the relevant strand (Visual Arts, Music, Drama, Dance). Integrate SA cultural art forms — indigenous music, traditional dance, beadwork, etc. Balance theory and practical making/performing.`;
  }

  return null;
}

// ─── System Prompt ────────────────────────────────────────────────────────────

export function buildLessonSystemPrompt(): string {
  return `You are Dash AI, the intelligent teaching assistant embedded in EduDash Pro — a school management platform built exclusively for South African schools.

## Your identity and expertise
You are deeply knowledgeable about the South African CAPS (Curriculum and Assessment Policy Statement) curriculum across all phases, subjects, and grades. You understand:
- The SA school system: public, independent, and preschools (ECD/ECC)
- Township and rural classroom realities: large classes (35–45 learners), limited resources, load-shedding disruptions
- Ubuntu values and communal, collaborative learning approaches
- The diversity of South African communities, languages, and cultural contexts
- CAPS Programme of Assessment (PoA) requirements for formal and informal assessment

## Tone and language
Write in a warm, professional tone for South African educators. Use:
- SA spelling: colour, organise, programme, recognise, practise (verb), practice (noun)
- SA terminology: learners (not students), educator (formal)/teacher (casual), term (not semester), Grade R (not Kindergarten), tuck shop (not cafeteria), sport (not sports)
- SA examples: Rands (R), SA names (Thabo, Nomsa, Pieter, Fatima, Priya), SA places, SA sports (rugby, cricket, netball, soccer), SA food, SA wildlife
- Never use American or British examples, currencies, or cultural references

## CAPS alignment — CRITICAL RULES
- Every lesson MUST reference actual CAPS content areas, concepts, and skills for the subject, grade, and term
- Do NOT invent CAPS outcomes — if uncertain, flag with: [Verify against CAPS document]
- Use correct CAPS phase terminology: Foundation Phase (Gr R–3), Intermediate Phase (Gr 4–6), Senior Phase (Gr 7–9), FET Phase (Gr 10–12)
- Assessment must distinguish between formal (Programme of Assessment) and informal (daily monitoring) assessment
- Lesson structure must reflect the CAPS time allocation for the subject (e.g. Mathematics has 7 hours/week in Intermediate Phase)

## Language rules — CRITICAL
- If the requested language is not English, write ALL content (activities, questions, instructions, teacher steps, key questions) in that language
- For multilingual contexts, key vocabulary may be bilingual, but lesson instructions must be in the target language
- Never mix languages inconsistently within learner-facing or teacher-facing content
- Supported languages: English, Afrikaans, isiZulu, isiXhosa, Sesotho, Setswana, Sepedi, Xitsonga, Siswati, Tshivenda, isiNdebele

## Hallucination prevention — CRITICAL
- Only reference resources the teacher has listed — do not invent tablets, apps, or materials not confirmed available
- Do not cite specific textbook page numbers unless provided by the teacher
- Do not reference specific real people, current events, or news unless provided
- When uncertain about a CAPS detail, flag it rather than inventing

## South African classroom realities
- Load-shedding: if electricity-dependent resources are not listed, always include a paper-based/offline alternative
- Class sizes: plan group activities for 35–45 learners (typical public school)
- Ubuntu: favour collaborative, communal, peer-learning activities
- Language diversity: acknowledge home language may differ from language of instruction

## Output format — CRITICAL
- Return a single valid JSON object matching the schema in the user prompt
- No text before or after the JSON — no preamble, no explanation, no markdown fences
- Never truncate — every field must be complete
- Arrays must contain real, useful content — never placeholder text or empty arrays
- Activity durationMinutes values must sum to exactly the total lesson duration`;
}

// ─── User Prompt ──────────────────────────────────────────────────────────────

export function buildLessonUserPrompt(req: LessonPlanRequest): string {
  const phase = getCAPSPhase(req.grade);
  const grade = gradeLabel(req.grade);
  const capsGuidance = getCAPSLessonGuidance(req.subject, phase);
  const resources = req.availableResources?.length
    ? req.availableResources.join(', ')
    : 'chalkboard, textbooks — assume standard South African public school resources only';

  const lines: string[] = [
    `Generate a complete, CAPS-aligned lesson plan with the following details:`,
    ``,
    `Subject: ${req.subject}`,
    `Grade: ${grade} (${phase})`,
    `Term: Term ${req.term}${req.week ? `, Week ${req.week}` : ''}`,
    `Topic: ${req.topic}${req.subtopic ? `\nSubtopic: ${req.subtopic}` : ''}`,
    `Duration: ${req.duration} minutes`,
    `Language of instruction: ${req.language}`,
    `Number of learners: ${req.learnerCount ?? '35–40 (standard SA public school class)'}`,
    `School type: ${req.schoolType ?? 'Public'}`,
    ``,
    `Prior knowledge: ${req.priorKnowledge ?? 'Not specified — infer from CAPS progression for this grade and topic.'}`,
    `Available resources: ${resources}`,
    `Differentiation needs: ${req.differentiationNeeds ?? 'None specified — include standard support and extension activities.'}`,
    `Teacher notes: ${req.teacherNotes ?? 'None.'}`,
  ];

  if (capsGuidance) {
    lines.push(``, capsGuidance);
  }

  lines.push(
    ``,
    `IMPORTANT REMINDERS:`,
    `- All content must be in ${req.language}`,
    `- Use SA spelling, SA examples, SA Rands where relevant`,
    `- Activity durations must sum to exactly ${req.duration} minutes`,
    `- Only reference resources from the list above`,
    `- Return ONLY valid JSON — no markdown, no preamble`,
    ``,
    `Return a JSON object with EXACTLY this structure:`,
    ``,
    `{`,
    `  "subject": "${req.subject}",`,
    `  "grade": "${grade}",`,
    `  "capsPhase": "${phase}",`,
    `  "term": ${req.term},`,
    req.week ? `  "week": ${req.week},` : '',
    `  "topic": "${req.topic}",`,
    req.subtopic ? `  "subtopic": "${req.subtopic}",` : '',
    `  "duration": ${req.duration},`,
    `  "language": "${req.language}",`,
    `  "generatedAt": "<ISO 8601 timestamp>",`,
    ``,
    `  "capsLearningOutcomes": [`,
    `    "<Specific CAPS learning outcome 1 for this topic, grade, and term>",`,
    `    "<Specific CAPS learning outcome 2 — real, not invented>"`,
    `  ],`,
    `  "capsContentArea": "<The exact CAPS content area or strand this lesson falls under>",`,
    `  "capsConceptsAndSkills": [`,
    `    "<Key concept or skill 1 from CAPS>",`,
    `    "<Key concept or skill 2>"`,
    `  ],`,
    ``,
    `  "priorKnowledge": [`,
    `    "<What learners must already know — inferred from CAPS progression>",`,
    `    "<Another prerequisite>"`,
    `  ],`,
    `  "resources": [`,
    `    "<Resource 1 — ONLY from what was listed above>",`,
    `    "<Resource 2>"`,
    `  ],`,
    ``,
    `  "activities": [`,
    `    {`,
    `      "phase": "Introduction",`,
    `      "durationMinutes": <number — typically 5–10 min>,`,
    `      "title": "<Short descriptive title>",`,
    `      "teacherActions": [`,
    `        "<Specific, actionable step the teacher takes>",`,
    `        "<Another step>"`,
    `      ],`,
    `      "learnerActions": [`,
    `        "<What learners are doing>",`,
    `        "<Another learner action>"`,
    `      ],`,
    `      "keyQuestions": [`,
    `        "<Higher-order question to activate prior knowledge>",`,
    `        "<Another question>"`,
    `      ]`,
    `    },`,
    `    {`,
    `      "phase": "Development",`,
    `      "durationMinutes": <number — largest portion, typically 60–70% of lesson>,`,
    `      "title": "<Main teaching activity title>",`,
    `      "teacherActions": ["<...>"],`,
    `      "learnerActions": ["<...>"],`,
    `      "keyQuestions": ["<Higher-order question>"]`,
    `    },`,
    `    {`,
    `      "phase": "Consolidation",`,
    `      "durationMinutes": <number — typically 10–15 min>,`,
    `      "title": "<Closing/consolidation activity title>",`,
    `      "teacherActions": ["<...>"],`,
    `      "learnerActions": ["<...>"],`,
    `      "keyQuestions": ["<Question to check understanding>"]`,
    `    }`,
    `  ],`,
    ``,
    `  "assessment": {`,
    `    "type": "<'Informal' or 'Formal'>",`,
    `    "method": "<Specific assessment method e.g. exit ticket, class test, observation, oral questioning>",`,
    `    "tool": "<Assessment tool if applicable e.g. rubric, checklist, rating scale — or null>",`,
    `    "criteria": [`,
    `      "<Success criterion 1 — observable, measurable>",`,
    `      "<Success criterion 2>"`,
    `    ]`,
    `  },`,
    ``,
    `  "differentiation": {`,
    `    "support": [`,
    `      "<Scaffolding strategy for learners needing extra support>",`,
    `      "<Another support strategy>"`,
    `    ],`,
    `    "extension": [`,
    `      "<Challenge activity for advanced learners>",`,
    `      "<Another extension>"`,
    `    ]`,
    `  },`,
    ``,
    `  "homework": "<A meaningful, CAPS-appropriate homework task — or null if not suitable>",`,
    ``,
    `  "teacherReflectionPrompts": [`,
    `    "<A reflective question for the teacher after the lesson>",`,
    `    "<Another reflection prompt>"`,
    `  ],`,
    ``,
    `  "saContextNote": "<A note from Dash AI about SA-specific context, load-shedding fallbacks, language tips, or anything the teacher should know — or null>"`,
    `}`,
  );

  return lines.filter((l) => l !== '').join('\n');
}
