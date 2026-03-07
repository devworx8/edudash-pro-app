'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, FileText, Brain, Target, Sparkles, GraduationCap, Clock, Award, Globe, MessageSquare } from 'lucide-react';
import { ConversationalExamBuilder } from './ConversationalExamBuilder';
import { useQuotaCheck } from '@/hooks/useQuotaCheck';
import { UpgradeModal } from '@/components/modals/UpgradeModal';
import { createClient } from '@/lib/supabase/client';
import {
  type SouthAfricanLanguage,
  LANGUAGE_OPTIONS,
  GRADES,
  SUBJECTS_BY_PHASE,
  GRADE_COMPLEXITY,
} from '@/lib/exam-prep/types';

interface ExamPrepWidgetProps {
  onAskDashAI?: (prompt: string, display: string, language?: string, enableInteractive?: boolean) => void;
  guestMode?: boolean;
  userId?: string;
}

const EXAM_TYPES = [
  { id: 'practice_test', label: 'Practice Test', description: 'Full exam paper with memo', icon: FileText, color: 'primary', duration: '60-120 min' },
  { id: 'revision_notes', label: 'Revision Notes', description: 'Topic summaries & key points', icon: BookOpen, color: 'accent', duration: '30 min read' },
  { id: 'study_guide', label: 'Study Guide', description: 'Week-long study schedule', icon: Target, color: 'warning', duration: '7-day plan' },
  { id: 'flashcards', label: 'Flashcards', description: 'Quick recall questions', icon: Brain, color: 'danger', duration: '15 min' },
];

export function ExamPrepWidget({ onAskDashAI, guestMode = false, userId }: ExamPrepWidgetProps) {
  const router = useRouter();
  const { checkQuota, incrementUsage } = useQuotaCheck(userId);
  const supabase = createClient();
  const [selectedGrade, setSelectedGrade] = useState<string>('grade_9');
  const [selectedSubject, setSelectedSubject] = useState<string>('Mathematics');
  const [selectedExamType, setSelectedExamType] = useState<string>('practice_test');
  const [selectedLanguage, setSelectedLanguage] = useState<SouthAfricanLanguage>('en-ZA');
  const [subjectSearch, setSubjectSearch] = useState('');
  const [showPromptPreview, setShowPromptPreview] = useState(false);
  const [showConversationalBuilder, setShowConversationalBuilder] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeModalData, setUpgradeModalData] = useState<{ currentUsage: number; currentLimit: number } | null>(null);
  const [userEmail, setUserEmail] = useState<string>('');
  const [userName, setUserName] = useState<string>('');
  const [currentTier, setCurrentTier] = useState<'free' | 'trial' | 'parent_starter' | 'parent_plus' | 'premium' | 'school'>('free');

  const [customPrompt, setCustomPrompt] = useState('');
  const [promptSystemPrefix, setPromptSystemPrefix] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Fetch user info for UpgradeModal
  useEffect(() => {
    const fetchUserInfo = async () => {
      if (!userId) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserEmail(user.email || '');
        setUserName(user.user_metadata?.full_name || '');
      }

      const { data: tierData } = await supabase
        .from('user_ai_tiers')
        .select('tier')
        .eq('user_id', userId)
        .single();
      if (tierData) {
        setCurrentTier(tierData.tier || 'free');
      }
    };
    fetchUserInfo();
  }, [userId, supabase]);

  // Show conversational builder if requested
  if (showConversationalBuilder) {
    return (
      <ConversationalExamBuilder
        grade={selectedGrade}
        subject={selectedSubject}
        language={LANGUAGE_OPTIONS[selectedLanguage]}
        onClose={() => setShowConversationalBuilder(false)}
        onSave={(exam) => {
          console.log('Exam saved:', exam);
          setShowConversationalBuilder(false);
          // TODO: Save to database
        }}
      />
    );
  }

  const getPhase = (grade: string): keyof typeof SUBJECTS_BY_PHASE => {
    if (grade === 'grade_r' || grade === 'grade_1' || grade === 'grade_2' || grade === 'grade_3') return 'foundation';
    if (grade === 'grade_4' || grade === 'grade_5' || grade === 'grade_6') return 'intermediate';
    if (grade === 'grade_7' || grade === 'grade_8' || grade === 'grade_9') return 'senior';
    return 'fet';
  };

  const phase = getPhase(selectedGrade);
  const availableSubjects = SUBJECTS_BY_PHASE[phase];

  const gradeInfo = GRADES.find(g => g.value === selectedGrade);
  const examType = EXAM_TYPES.find(e => e.id === selectedExamType);

  const handleGenerate = async () => {
    if (!onAskDashAI) return;

    setGenerating(true);
    setGenerateError(null);

    try {
    // ✅ CHECK QUOTA BEFORE GENERATING EXAM (for logged-in users)
    if (userId && !guestMode) {
      const quotaResult = await checkQuota('exam_generation');
      
      if (quotaResult && !quotaResult.allowed) {
        setUpgradeModalData({
          currentUsage: quotaResult.remaining === 0 ? quotaResult.limit : quotaResult.limit - quotaResult.remaining,
          currentLimit: quotaResult.limit,
        });
        setShowUpgradeModal(true);
        return;
      }
      
      console.log('[ExamPrep] Quota check passed:', quotaResult);
    }

    // Check guest mode limit
    if (guestMode) {
      const key = 'EDUDASH_EXAM_PREP_FREE_USED';
      const today = new Date().toDateString();
      const stored = typeof window !== 'undefined' ? localStorage.getItem(key) : null;
      
      if (stored === today) {
        router.push('/sign-in?message=Sign in to continue generating exams');
        return;
      }
      
      if (typeof window !== 'undefined') {
        localStorage.setItem(key, today);
      }
    }

    let prompt = '';
    let display = '';
    
    // Get language name and grade complexity
    const languageName = LANGUAGE_OPTIONS[selectedLanguage];
    const complexity = GRADE_COMPLEXITY[selectedGrade as keyof typeof GRADE_COMPLEXITY];
    const isAdditionalLanguage = selectedSubject.includes('Additional');
    const isFoundationPhase = phase === 'foundation';

    if (selectedExamType === 'practice_test') {
      // Direct generation approach - Dash generates exam directly in markdown format
      prompt = `You are Dash, a South African CAPS curriculum expert helping a ${gradeInfo?.label} student prepare for a ${selectedSubject} exam in ${languageName}.

**Student Context:**
- Grade: ${gradeInfo?.label} (Ages ${gradeInfo?.age})
- Subject: ${selectedSubject}
- Language: ${languageName} (${selectedLanguage})
- Duration: ${complexity.duration}
- Total marks: ${complexity.marks}

**Your Task:**
Have a brief conversation to understand what the student needs, THEN generate a CAPS-aligned practice test directly in markdown format.

**Conversation Flow:**
1. First, greet warmly and ask what specific topics they'd like to focus on
2. If they're unsure, suggest 2-3 main topics from the CAPS curriculum
3. Ask about difficulty preference (easier warm-up, standard, or challenging)
4. AFTER understanding their needs, generate the exam directly in markdown with proper sections and questions

**Important Guidelines:**
- Be conversational and helpful, not robotic
- Understand context from their short answers ("Yes", "Algebra", "harder", etc.)
- You have access to CAPS curriculum tools: use 'get_curriculum_for_topic' or 'search_caps_curriculum' if you need official CAPS content
- Once you have enough info (and retrieved any needed CAPS content), generate the exam immediately in markdown
- The exam MUST be in ${languageName} - every question, instruction, and memo
- Format the exam with clear sections (## SECTION A, ## SECTION B, etc.)
- Include a MARKING MEMORANDUM at the end

**CAPS Curriculum Focus:**
${complexity.questionTypes}

**CRITICAL CAPS ALIGNMENT REQUIREMENTS:**
You MUST ensure all educational content strictly follows the South African CAPS curriculum for Grade ${gradeInfo?.label}:

1. **Curriculum Accuracy**: All topics, learning objectives, and assessment standards MUST align with the official CAPS document for ${selectedSubject} Grade ${gradeInfo?.label}
2. **Content Appropriateness**: Questions must match the cognitive demand level specified in CAPS for this grade
3. **Local Context**: Use South African examples, contexts, and scenarios (ZAR currency, local geography, culturally relevant situations)
4. **Assessment Standards**: Follow CAPS assessment guidelines for question distribution, mark allocation, and difficulty progression
5. **Topic Coverage**: Only include topics that are in the CAPS curriculum for this specific grade and term
6. **Language Policy**: Adhere to CAPS language policy - use ${languageName} consistently throughout

**Before generating content, verify:**
- The topics you choose are in the official CAPS curriculum for Grade ${gradeInfo?.label} ${selectedSubject}
- The difficulty level matches CAPS cognitive levels for this grade
- Your question types align with CAPS assessment requirements
- All contexts and examples are South African and age-appropriate

**Age-Appropriate Instructions:**
${complexity.instructions}

Let's start: Say hello and ask what specific topics they'd like to practice for their ${selectedSubject} exam.`;
      
      // OLD PROMPT (keep as fallback if tool fails):
      const fallbackPrompt = `You are Dash, a South African education assistant specializing in CAPS (Curriculum and Assessment Policy Statement) curriculum.

**IMPORTANT: Generate ALL content in ${languageName} (${selectedLanguage}). Use ONLY this language throughout the entire exam and memorandum. Do NOT switch languages unless the user explicitly requests it.**

**CRITICAL AGE-APPROPRIATE REQUIREMENTS:**
- **Student Age**: ${gradeInfo?.age} years old
- **Exam Duration**: ${complexity.duration} (STRICTLY ENFORCE - this is the attention span for this age group)
- **Total Marks**: ${complexity.marks} MAXIMUM (do not exceed)
- **Question Types**: ${complexity.questionTypes}
- **Vocabulary Level**: ${complexity.vocabulary}
- **Language Proficiency**: ${isAdditionalLanguage ? 'BEGINNER/ELEMENTARY - This is a FIRST ADDITIONAL LANGUAGE, assume students are just learning this language' : 'Age-appropriate home language proficiency'}
- **Special Instructions**: ${complexity.instructions}
- **Calculator Use**: ${complexity.calculator ? 'Allowed' : 'NOT ALLOWED - too young for calculator'}
- **Decimal Places**: ${complexity.decimals ? 'Use 2 decimal places where needed' : 'NO DECIMALS - too advanced for this grade'}

${isFoundationPhase ? `
**FOUNDATION PHASE SPECIFIC REQUIREMENTS:**
- Use EMOJIS and symbols to make it engaging (??, ??, ??, ??)
- Provide WORD BANKS for fill-in-the-blank questions
- Use [PICTURE: description] to indicate where images should be shown
- Keep ALL sentences under 5 words for Grade R-1
- NO essay writing - max 1-2 sentences
- NO abstract concepts
- Focus on concrete, everyday objects and experiences
` : ''}

Generate an interactive, age-appropriate practice examination paper for ${gradeInfo?.label} ${selectedSubject} strictly aligned to the CAPS curriculum.

**Exam Format:**
- Grade: ${gradeInfo?.label} (Ages ${gradeInfo?.age})
- Subject: ${selectedSubject}
- Phase: ${phase === 'foundation' ? 'Foundation Phase' : phase === 'intermediate' ? 'Intermediate Phase' : phase === 'senior' ? 'Senior Phase' : 'FET Phase'}
- Duration: ${complexity.duration}
- Total Marks: ${complexity.marks}

**CAPS Curriculum Alignment:**
- Follow ${gradeInfo?.label} CAPS document exactly
- Use South African context (ZAR currency, local places, culturally relevant examples)
- ${isFoundationPhase ? 'Focus on play-based learning and visual recognition' : 'Balance knowledge, application, and reasoning'}

**CRITICAL CAPS COMPLIANCE CHECKLIST:**
Before generating ANY content, you MUST verify:
1. ✓ All topics are explicitly listed in the CAPS curriculum for ${selectedSubject} Grade ${gradeInfo?.label}
2. ✓ Question difficulty matches CAPS cognitive demand levels (Bloom's Taxonomy alignment)
3. ✓ Mark allocation follows CAPS assessment guidelines
4. ✓ Question types align with CAPS recommended assessment methods
5. ✓ Content sequencing follows CAPS term/topic progression
6. ✓ Language level appropriate for CAPS language policy (${isAdditionalLanguage ? 'First Additional Language' : 'Home Language'})
7. ✓ All examples and contexts are South African (no foreign references)
8. ✓ Assessment standards match CAPS requirements for this phase

**CAPS Cognitive Levels for ${phase === 'foundation' ? 'Foundation' : phase === 'intermediate' ? 'Intermediate' : phase === 'senior' ? 'Senior' : 'FET'} Phase:**
${phase === 'foundation' ? '- Recognition and recall (50%), Application (30%), Reasoning (20%)' : 
  phase === 'intermediate' ? '- Knowledge (40%), Routine procedures (35%), Complex procedures and reasoning (25%)' : 
  phase === 'senior' ? '- Knowledge (30%), Routine procedures (30%), Complex procedures (20%), Problem-solving (20%)' :
  '- Knowledge (20%), Routine procedures (25%), Complex procedures (30%), Problem-solving and reasoning (25%)'}

**Output Structure (INTERACTIVE FORMAT):**

# ?? DEPARTMENT OF BASIC EDUCATION
# ${gradeInfo?.label} ${selectedSubject}
# PRACTICE EXAMINATION ${new Date().getFullYear()}

**INSTRUCTIONS:**
${isFoundationPhase ? `
1. Listen to your teacher read the questions
2. Point to or circle the correct answer
3. Ask for help if you need it
4. Take your time - there is no rush
` : `
1. Answer ALL questions
2. ${complexity.calculator ? 'You may use a calculator' : 'Work without a calculator'}
3. ${complexity.decimals ? 'Round to 2 decimal places where needed' : 'Show all your work'}
4. Write neatly and clearly
`}

**TIME:** ${complexity.duration}
**MARKS:** ${complexity.marks}

---

## SECTION A: [Simple topic appropriate for age]

**Question 1.** [COMPLETE question with ALL DATA needed to answer it] (X marks)
${isFoundationPhase ? '[PICTURE: simple everyday object]' : ''}
${complexity.questionTypes.includes('word bank') ? `
**Word Bank:** [word1] [word2] [word3]
` : ''}

**PEDAGOGICAL FRAMEWORK - WRITE QUESTIONS LIKE A TEACHER:**

Imagine you are a South African CAPS teacher preparing an exam for your ${gradeInfo?.label} class. You know your students' abilities and attention span (${gradeInfo?.age} years old). Every question must be:
- Clear enough that students know EXACTLY what to do
- Complete with all information needed (like you're speaking directly to the student)
- Age-appropriate in language and complexity
- Answerable within the time limit

**AGE-APPROPRIATE INSTRUCTION VERBS (Use these):**
${isFoundationPhase ? `
**Foundation Phase (Ages 4-9):**
- Point to, Circle, Color, Match, Draw, Count, Say, Show, Find, Name, Choose
- Example: "Circle the animal that lives in water: cat, fish, bird, dog"` : 
phase === 'intermediate' ? `
**Intermediate Phase (Ages 10-12):**
- List, Identify, Name, Calculate, Describe, Compare, Explain (simple), Choose, Give, State
- Example: "List THREE ways that plants and animals are different"` : 
phase === 'senior' ? `
**Senior Phase (Ages 13-15):**
- Analyze, Compare, Explain (detailed), Evaluate, Calculate (multi-step), Describe (detailed), Justify, Classify, Apply
- Example: "Explain TWO ways that climate change affects coastal ecosystems in South Africa"` : `
**FET Phase (Ages 16-18):**
- Critically analyze, Evaluate, Justify, Synthesize, Formulate, Investigate, Prove, Derive, Discuss, Argue
- Example: "Critically evaluate the impact of apartheid policies on South African economic development"`}

**CRITICAL QUESTION FORMAT RULES (NON-NEGOTIABLE):**
1. Start with an ACTION VERB appropriate for the age group
2. Include ALL data, options, sequences, or information needed
3. Specify HOW MANY items to provide ("List TWO", "Give THREE reasons", "Name FOUR")
4. NO vague scenarios without questions
5. NO references to diagrams/images (use text descriptions)
6. Questions must be answerable in the allocated time

**WRONG - Too vague (teacher would NEVER write this):**
? "A building contractor is planning to construct a house. The contractor wants to use suitable materials."
   - No question! What should the student do?
? "A teacher wants to demonstrate the process of melting to the class."
   - No clear instruction! What is being asked?
? "Find the common difference in the sequence."
   - Missing data! Which sequence?

**CORRECT - Clear teacher instructions:**
? "A building contractor must choose between brick, wood, and steel for house walls. **List TWO advantages** of using brick."
? "Ice is heated from 0?C to 10?C. **Describe what happens** to the water particles during this process."
? "**Calculate** the common difference in this sequence: 2, 5, 8, 11, 14"
? "A substance has tightly packed particles in a fixed pattern. **Identify** the state of matter."
? "**Choose** the correct answer: Which animal is a mammal? A) Snake  B) Eagle  C) Dolphin  D) Frog"

[Continue with ${complexity.marks / 2} questions max]

---

## SECTION B: [Another age-appropriate topic]

[Continue with remaining questions - keep total under ${complexity.marks} marks]

---

# MARKING MEMORANDUM

## SECTION A
**Question 1:** (X marks)
- Correct answer: [simple, clear answer] ?
${isFoundationPhase ? '- Accept phonetic spelling for Foundation Phase' : '- Award marks for method and answer'}

[Complete memo for all questions]

---

## PARENT/TEACHER GUIDANCE

**Age-Appropriate Expectations for ${gradeInfo?.label} (${gradeInfo?.age} years):**
- Students at this age can: [realistic capabilities]
- Common developmental stage: [appropriate level]

**Key Concepts Assessed:**
- [Age-appropriate topics]

**Support Tips:**
- ${isFoundationPhase ? 'Read questions aloud, allow pointing/verbal answers, use lots of encouragement' : 'Provide quiet space, encourage showing work, help with time management'}
- ${isAdditionalLanguage ? 'Remember: This is a new language for them - focus on basic vocabulary and simple sentences' : 'Age-appropriate language support'}

**Assessment Criteria:**
- 80-100%: Outstanding
- 60-79%: Good progress
- 40-59%: Developing
- Below 40%: Needs support

---

? ${new Date().getFullYear()} EduDash Pro ? Age-Appropriate CAPS-Aligned Resources`;

      display = `Practice Test: ${gradeInfo?.label} ${selectedSubject} ? CAPS-Aligned Exam Paper with Marking Memo (${languageName})`;
    } else if (selectedExamType === 'revision_notes') {
      prompt = `You are Dash, a South African education assistant specializing in CAPS curriculum.

**IMPORTANT: Generate ALL content in ${languageName} (${selectedLanguage}). Use ONLY this language throughout the entire document. Do NOT switch languages.**

Generate comprehensive revision notes for ${gradeInfo?.label} ${selectedSubject} aligned to CAPS Term 4 assessment topics.

**Requirements:**
- Grade: ${gradeInfo?.label}
- Subject: ${selectedSubject}
- Format: Structured revision guide with clear headings
- Include: Key concepts, formulas, definitions, examples, diagrams (described in text)
- Use South African context and terminology
- Highlight exam-critical content

**Output Structure:**

# ${gradeInfo?.label} ${selectedSubject} Revision Notes
## CAPS Term 4 Focus Areas

### Topic 1: [Main Topic Name]
**Key Concepts:**
- [Concept 1 with clear explanation]
- [Concept 2 with clear explanation]

**Important Formulas/Rules:**
- [Formula 1 with when to use it]
- [Formula 2 with when to use it]

**Worked Example:**
[Step-by-step example problem with solution]

**Common Exam Questions:**
- [Type of question students should expect]
- [How to approach it]

**Memory Tips:**
- [Mnemonics or shortcuts]

---

[Continue for all major topics...]

---

## Quick Reference Summary
[One-page summary of all key formulas, definitions, and concepts]

## Exam Preparation Checklist
- [ ] Understand all key concepts
- [ ] Memorize essential formulas
- [ ] Practice worked examples
- [ ] Complete past papers
- [ ] Review common mistakes

---

? ${new Date().getFullYear()} EduDash Pro ? CAPS-Aligned Revision Resources`;

      display = `Revision Notes: ${gradeInfo?.label} ${selectedSubject} ? CAPS Term 4 Focus Areas (${languageName})`;
    } else if (selectedExamType === 'study_guide') {
      prompt = `You are Dash, a South African education assistant specializing in CAPS curriculum.

**IMPORTANT: Generate ALL content in ${languageName} (${selectedLanguage}). Use ONLY this language throughout the entire study guide. Do NOT switch languages.**

Generate a 7-day intensive study schedule for ${gradeInfo?.label} ${selectedSubject} exam preparation aligned to CAPS curriculum.

**Requirements:**
- Grade: ${gradeInfo?.label}
- Subject: ${selectedSubject}
- Timeline: 7 days leading up to exam
- Include: Daily topics, practice exercises, review sessions, rest periods
- Realistic time allocations
- South African school context (?? daily homework, other subjects)

**Output Structure:**

# 7-Day Study Plan: ${gradeInfo?.label} ${selectedSubject}
## CAPS-Aligned Exam Preparation Schedule

**Exam Date:** [One week from today]  
**Daily Commitment:** 60-90 minutes  
**Total Topics:** [Number based on CAPS curriculum]

---

## Day 1 (Monday): [Main Topic]
? **Time:** 75 minutes  
?? **Focus:** [Specific CAPS topic]

**Morning Session (40 min):**
- [ ] Review notes: [Specific subtopic 1]
- [ ] Review notes: [Specific subtopic 2]
- [ ] Watch/read: [Resource suggestion]

**Afternoon Session (35 min):**
- [ ] Practice: 5 questions on [topic]
- [ ] Self-assess using memo
- [ ] Identify weak areas

**Evening Quick Review (10 min):**
- [ ] Flashcards: Key formulas/concepts
- [ ] Tomorrow's preview: [Next topic]

**Progress Check:**
- Can you explain [concept] to someone else?
- Can you solve [problem type] without notes?

---

[Continue for Days 2-6...]

---

## Day 7 (Sunday): Final Review & Rest
? **Time:** 45 minutes + rest  
?? **Focus:** Consolidation & confidence building

**Morning (45 min):**
- [ ] Quick revision: All key formulas
- [ ] Skim through all notes (don't study deeply)
- [ ] Review common mistakes list
- [ ] Practice 3 easy warm-up questions

**Afternoon:**
- ?? NO HEAVY STUDYING
- ? Light review of one-page summary
- ? Pack exam materials (calculator, pens, ID)
- ? Prepare healthy snacks for exam day
- ? Set 2 alarms for exam morning

**Evening:**
- ?? Early bedtime (8-9 hours sleep)
- ?? No screens 1 hour before bed
- ?? Relaxation or light exercise

---

## Study Tips for Success

**Before You Start:**
- Gather all materials (textbook, notes, calculator)
- Find quiet study space
- Tell family your study schedule
- Prepare healthy snacks

**During Study Sessions:**
- Use Pomodoro technique (25 min study, 5 min break)
- Practice active recall (close book, try to remember)
- Explain concepts out loud
- Make notes of what you don't understand

**Self-Care Reminders:**
- ?? Drink water regularly
- ?? Eat brain-healthy foods
- ?? Get 8 hours sleep each night
- ?? Take movement breaks
- ?? Don't cram the night before

---

## Parent Support Guide

**How to Help:**
- Provide quiet study environment
- Ensure regular meals and snacks
- Check daily progress (not pressuring)
- Offer encouragement, not criticism
- Help with practice testing (read questions)

**Warning Signs to Watch:**
- Excessive stress or anxiety
- Sleeping too little
- Skipping meals
- Isolation from family

**When to Seek Help:**
- If student is completely stuck on topic
- If panic/anxiety is overwhelming
- If additional tutoring might help

---

? ${new Date().getFullYear()} EduDash Pro ? CAPS-Aligned Study Resources`;

      display = `Study Guide: ${gradeInfo?.label} ${selectedSubject} ? 7-Day Exam Preparation Plan (${languageName})`;
    } else if (selectedExamType === 'flashcards') {
      prompt = `You are Dash, a South African education assistant specializing in CAPS curriculum.

**IMPORTANT: Generate ALL content in ${languageName} (${selectedLanguage}). Use ONLY this language for all flashcard content. Do NOT switch languages.**

Generate 30 flashcards for ${gradeInfo?.label} ${selectedSubject} covering essential exam concepts aligned to CAPS curriculum.

**Requirements:**
- Grade: ${gradeInfo?.label}
- Subject: ${selectedSubject}
- Format: Question on front, detailed answer on back
- Cover: Definitions, formulas, problem-solving strategies, key facts
- Difficulty: Mix of easy recall and challenging application

**Output Structure:**

# ${gradeInfo?.label} ${selectedSubject} Flashcards
## CAPS Exam Essentials

---

### Flashcard 1
**FRONT (Question):**
[Clear, concise question or prompt]

**BACK (Answer):**
[Detailed answer with explanation]
[Example if applicable]
[Common mistake to avoid]

---

### Flashcard 2
**FRONT (Question):**
[Clear, concise question or prompt]

**BACK (Answer):**
[Detailed answer with explanation]

---

[Continue for 30 flashcards covering all major topics...]

---

## How to Use These Flashcards

**Study Methods:**
1. **Spaced Repetition:** Review cards you got wrong more frequently
2. **Active Recall:** Try to answer before flipping
3. **Teach Someone:** Explain the answer out loud
4. **Mix Order:** Don't memorize sequence, shuffle daily
5. **Practice Application:** Don't just memorize, understand why

**Daily Routine:**
- Morning: 10 new cards
- Afternoon: Review all cards once
- Evening: Focus on difficult cards

**Mastery Levels:**
- ? Got it right immediately ? Review in 3 days
- ?? Got it right after thinking ? Review tomorrow
- ? Got it wrong ? Review today + tomorrow

---

? ${new Date().getFullYear()} EduDash Pro ? CAPS-Aligned Study Resources`;

      display = `Flashcards: ${gradeInfo?.label} ${selectedSubject} ? 30 Essential CAPS Concepts (${languageName})`;
    }
    
    // Store prompt and display for preview
    setCustomPrompt(prompt);
    setPromptSystemPrefix(extractPromptParts(prompt).systemPrefix);
    setShowPromptPreview(true);
    } catch (err) {
      setGenerateError('Failed to prepare exam generation. Please try again.');
      console.error('[ExamPrep] Generation error:', err);
    } finally {
      setGenerating(false);
    }
  };

  const handleConfirmGenerate = () => {
    if (!customPrompt) return;

    if (userId && !guestMode) {
      incrementUsage('exam_generation', 'success').catch(err => {
        console.error('[ExamPrep] Failed to increment usage:', err);
      });
    }
    
    // For practice tests, navigate to dedicated exam generation page
    const isInteractive = selectedExamType === 'practice_test';
    
    if (isInteractive) {
      // Navigate to dedicated page for better UX
      const params = new URLSearchParams({
        grade: selectedGrade,
        subject: selectedSubject,
        type: selectedExamType,
        language: selectedLanguage,
        prompt: customPrompt
      });
      
      router.push(`/dashboard/parent/generate-exam?${params.toString()}`);
      setShowPromptPreview(false);
      return;
    }
    
    // For non-interactive (study guides, memos), use modal if available
    if (onAskDashAI) {
      const display = `${EXAM_TYPES.find(e => e.id === selectedExamType)?.label}: ${gradeInfo?.label} ${selectedSubject} (${LANGUAGE_OPTIONS[selectedLanguage]})`;
      onAskDashAI(customPrompt, display, selectedLanguage, false);
      setShowPromptPreview(false);
    }
  };

  const handleCancelPreview = () => {
    setShowPromptPreview(false);
    setCustomPrompt('');
    setPromptSystemPrefix('');
  };

  /**
   * Split prompt into immutable system prefix + user-editable body.
   * This keeps hidden guardrails intact when parents edit visible instructions.
   */
  const extractPromptParts = (fullPrompt: string): { systemPrefix: string; userContent: string } => {
    if (!fullPrompt) {
      return { systemPrefix: '', userContent: '' };
    }

    const contentMarkers = [
      'Have a brief conversation to understand what the student needs',
      'Generate an interactive, age-appropriate practice examination paper',
      'Generate comprehensive revision notes',
      'Generate a 7-day intensive study',
      'Generate 30 flashcards',
    ];

    let markerIndex = -1;
    for (const marker of contentMarkers) {
      const index = fullPrompt.indexOf(marker);
      if (index !== -1 && (markerIndex === -1 || index < markerIndex)) {
        markerIndex = index;
      }
    }

    if (markerIndex === -1) {
      return {
        systemPrefix: promptSystemPrefix || '',
        userContent: fullPrompt.trim(),
      };
    }

    const rawPrefix = fullPrompt.slice(0, markerIndex);
    const normalizedPrefix = rawPrefix.endsWith('\n\n')
      ? rawPrefix
      : `${rawPrefix.replace(/\s+$/, '')}\n\n`;

    return {
      systemPrefix: normalizedPrefix,
      userContent: fullPrompt.slice(markerIndex).trim(),
    };
  };

  const getDefaultPromptSystemHeader = (): string => {
    const languageName = LANGUAGE_OPTIONS[selectedLanguage];
    return `You are Dash, a South African education assistant specializing in CAPS curriculum.\n\n**IMPORTANT: Generate ALL content in ${languageName} (${selectedLanguage}). Use ONLY this language throughout the entire document. Do NOT switch languages.**\n\n`;
  };

  const getUserEditablePrompt = (fullPrompt: string): string => {
    if (!fullPrompt) return '';

    if (promptSystemPrefix && fullPrompt.startsWith(promptSystemPrefix)) {
      return fullPrompt.slice(promptSystemPrefix.length).trim();
    }

    return extractPromptParts(fullPrompt).userContent;
  };

  /**
   * Reconstruct full prompt by prepending system instructions to user-edited content.
   */
  const reconstructFullPrompt = (userContent: string): string => {
    if (!userContent) return '';

    const systemHeader = promptSystemPrefix || getDefaultPromptSystemHeader();
    return `${systemHeader}${userContent.trim()}`;
  };

  return (
    <>
      {/* Prompt Preview Modal */}
      {showPromptPreview && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: 'var(--space-4)'
        }}>
          <div className="card" style={{
            maxWidth: 700,
            width: '100%',
            maxHeight: '80vh',
            display: 'flex',
            flexDirection: 'column',
            padding: 0
          }}>
            {/* Header */}
            <div style={{
              padding: 'var(--space-4)',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <Sparkles className="icon20" style={{ color: 'var(--primary)' }} />
                <span style={{ fontWeight: 700, fontSize: 16 }}>Review & Customize Prompt</span>
              </div>
              <button onClick={handleCancelPreview} className="iconBtn" aria-label="Close">
                <span style={{ fontSize: 20 }}>&times;</span>
              </button>
            </div>

            {/* Content */}
            <div style={{
              padding: 'var(--space-4)',
              flex: 1,
              overflowY: 'auto'
            }}>
              <div style={{ marginBottom: 'var(--space-3)' }}>
                <div style={{ fontWeight: 600, marginBottom: 'var(--space-2)', fontSize: 14 }}>
                  Selected Configuration:
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                  <span className="badge" style={{ background: 'var(--primary)', color: '#fff' }}>
                    {gradeInfo?.label}
                  </span>
                  <span className="badge" style={{ background: 'var(--accent)', color: '#fff' }}>
                    {selectedSubject}
                  </span>
                  <span className="badge" style={{ background: 'var(--warning)', color: '#fff' }}>
                    {EXAM_TYPES.find(e => e.id === selectedExamType)?.label}
                  </span>
                  <span className="badge" style={{ background: 'var(--danger)', color: '#fff' }}>
                    {LANGUAGE_OPTIONS[selectedLanguage]}
                  </span>
                </div>
              </div>

              <div style={{ marginBottom: 'var(--space-3)' }}>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 'var(--space-2)', fontSize: 14 }}>
                  Content Instructions (You can edit this):
                </label>
                <textarea
                  value={getUserEditablePrompt(customPrompt)}
                  onChange={(e) => {
                    // User edits the visible portion, but we reconstruct full prompt behind the scenes
                    const userContent = e.target.value;
                    const fullPrompt = reconstructFullPrompt(userContent);
                    setCustomPrompt(fullPrompt);
                  }}
                  style={{
                    width: '100%',
                    minHeight: 300,
                    padding: 'var(--space-3)',
                    borderRadius: 'var(--radius-2)',
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    color: 'var(--text)',
                    fontSize: 13,
                    fontFamily: 'monospace',
                    resize: 'vertical'
                  }}
                  placeholder="Customize the content requirements, topics to focus on, difficulty adjustments, etc..."
                />
                <div style={{ marginTop: 'var(--space-2)', fontSize: 12, color: 'var(--text-secondary)' }}>
                  💡 <strong>Note:</strong> Internal AI instructions are hidden. You're editing the content requirements only.
                </div>
              </div>

              <div className="card" style={{
                padding: 'var(--space-3)',
                background: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid rgba(59, 130, 246, 0.3)'
              }}>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  <strong>✨ Customization Tips:</strong>
                  <ul style={{ margin: '0.5rem 0', paddingLeft: '1.5rem' }}>
                    <li>Want specific topics? Add: "Focus on [topic1], [topic2]"</li>
                    <li>Adjust difficulty? Add: "Make questions [easier/harder] than usual"</li>
                    <li>Need more/fewer questions? Modify the marks allocation</li>
                    <li>Want a specific theme? Add: "Use [theme] context for all questions"</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div style={{
              padding: 'var(--space-4)',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              gap: 'var(--space-3)',
              justifyContent: 'flex-end'
            }}>
              <button onClick={handleCancelPreview} className="btn">
                Cancel
              </button>
              <button onClick={handleConfirmGenerate} className="btn btnPrimary">
                <Sparkles className="icon16" />
                {selectedExamType === 'practice_test' ? 'Generate Exam' :
                 selectedExamType === 'study_guide' ? 'Generate Study Guide' :
                 selectedExamType === 'flashcards' ? 'Generate Flashcards' :
                 selectedExamType === 'revision_notes' ? 'Generate Revision Notes' :
                 'Generate Resource'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="sectionTitle" style={{ marginBottom: 'var(--space-4)' }}>
        <GraduationCap className="w-5 h-5" style={{ color: 'var(--primary)' }} />
        CAPS Exam Preparation
      </div>

      {guestMode && (
        <div style={{
          padding: 'var(--space-3)',
          background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(168, 85, 247, 0.1) 100%)',
          border: '1px solid rgba(99, 102, 241, 0.3)',
          borderRadius: 'var(--radius-2)',
          marginBottom: 'var(--space-4)',
          fontSize: 13
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
            <Award className="w-4 h-4" style={{ color: 'var(--primary)' }} />
            <strong>Free Trial: 1 exam resource per day</strong>
          </div>
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>
            Upgrade to Parent Starter (R49.50/month) for unlimited practice tests, study guides, and more.
          </p>
        </div>
      )}

      {/* Grade Selector */}
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: 'var(--space-2)', fontSize: 14 }}>
          Select Grade
        </label>
        <select
          value={selectedGrade}
          onChange={(e) => setSelectedGrade(e.target.value)}
          aria-label="Select grade"
          style={{
            width: '100%',
            padding: 'var(--space-3)',
            borderRadius: 'var(--radius-2)',
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            color: 'var(--text)',
            fontSize: 14
          }}
        >
          {GRADES.map((grade) => (
            <option key={grade.value} value={grade.value}>
              {grade.label} (Ages {grade.age})
            </option>
          ))}
        </select>
      </div>

      {/* Language Selector */}
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: 'var(--space-2)', fontSize: 14 }}>
          <Globe className="w-4 h-4" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
          Select Language
        </label>
        <select
          value={selectedLanguage}
          onChange={(e) => setSelectedLanguage(e.target.value as SouthAfricanLanguage)}
          aria-label="Select language"
          style={{
            width: '100%',
            padding: 'var(--space-3)',
            borderRadius: 'var(--radius-2)',
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            color: 'var(--text)',
            fontSize: 14
          }}
        >
          {Object.entries(LANGUAGE_OPTIONS).map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
        <p className="muted" style={{ fontSize: 11, marginTop: 'var(--space-2)' }}>
          ???? All exam content will be generated in your selected language
        </p>
      </div>

      {/* Subject Selector with Search */}
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: 'var(--space-2)', fontSize: 14 }}>
          Select Subject
        </label>
        
        {/* Search Input */}
        <input
          type="text"
          aria-label="Search subjects"
          placeholder="🔍 Search subjects... (Math, Physics, English, etc.)"
          value={subjectSearch}
          onChange={(e) => {
            setSubjectSearch(e.target.value);
            // Auto-select first match if search narrows down to one subject
            const matches = availableSubjects.filter(s => 
              s.toLowerCase().includes(e.target.value.toLowerCase())
            );
            if (matches.length === 1) {
              setSelectedSubject(matches[0]);
            }
          }}
          style={{
            width: '100%',
            padding: 'var(--space-3)',
            borderRadius: 'var(--radius-2)',
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            color: 'var(--text)',
            fontSize: 14,
            marginBottom: 'var(--space-2)'
          }}
        />
        
        {/* Subject Dropdown - filtered */}
        <select
          value={selectedSubject}
          onChange={(e) => setSelectedSubject(e.target.value)}
          aria-label="Select subject"
          style={{
            width: '100%',
            padding: 'var(--space-3)',
            borderRadius: 'var(--radius-2)',
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            color: 'var(--text)',
            fontSize: 14
          }}
        >
          {availableSubjects
            .filter(subject => 
              subject.toLowerCase().includes(subjectSearch.toLowerCase())
            )
            .map((subject) => (
              <option key={subject} value={subject}>
                {subject}
              </option>
            ))
          }
        </select>
        
        <p className="muted" style={{ fontSize: 11, marginTop: 'var(--space-2)' }}>
          {subjectSearch ? 
            `Showing ${availableSubjects.filter(s => s.toLowerCase().includes(subjectSearch.toLowerCase())).length} of ${availableSubjects.length} subjects` :
            `${availableSubjects.length} subjects available for ${phase === 'foundation' ? 'Foundation Phase' : phase === 'intermediate' ? 'Intermediate Phase' : phase === 'senior' ? 'Senior Phase' : 'FET Phase'}`
          }
        </p>
      </div>

      {/* Exam Type Selector */}
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: 'var(--space-3)', fontSize: 14 }}>
          Select Resource Type
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--space-3)' }}>
          {EXAM_TYPES.map((type) => {
            const Icon = type.icon;
            const isSelected = selectedExamType === type.id;
            return (
              <button
                key={type.id}
                onClick={() => setSelectedExamType(type.id)}
                className="card"
                aria-label={`${type.label}: ${type.description}`}
                aria-pressed={isSelected}
                style={{
                  padding: 'var(--space-3)',
                  cursor: 'pointer',
                  border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border)',
                  background: isSelected ? 'rgba(var(--primary-rgb), 0.1)' : 'var(--card)',
                  transition: 'all 0.2s'
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)', textAlign: 'center' }}>
                  <div style={{
                    padding: 8,
                    borderRadius: 'var(--radius-2)',
                    background: `var(--${type.color})`
                  }}>
                    <Icon className="icon16" style={{ color: '#fff' }} />
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{type.label}</div>
                  <div className="muted" style={{ fontSize: 11 }}>{type.description}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }} className="muted">
                    <Clock className="icon12" />
                    {type.duration}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Generation Error */}
      {generateError && (
        <div role="alert" style={{
          padding: 'var(--space-3)',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: 'var(--radius-2)',
          marginBottom: 'var(--space-3)',
          fontSize: 13,
          color: 'var(--danger, #ef4444)',
        }}>
          {generateError}
        </div>
      )}

      {/* Generate Button */}
      <button
        className="btn btnPrimary"
        onClick={handleGenerate}
        disabled={generating}
        aria-label={generating ? 'Generating exam content…' : `Generate ${examType?.label} with Dash AI`}
        style={{
          width: '100%',
          fontSize: 14,
          padding: 'var(--space-3)',
          marginBottom: 'var(--space-3)',
          opacity: generating ? 0.7 : 1,
          cursor: generating ? 'not-allowed' : 'pointer',
        }}
      >
        {generating ? (
          <>
            <span className="spinner" style={{ width: 16, height: 16 }} aria-hidden="true" />
            Preparing…
          </>
        ) : (
          <>
            <Sparkles className="icon16" />
            Generate {examType?.label} with Dash AI
          </>
        )}
      </button>

      <p className="muted" style={{ fontSize: 11, marginBottom: 'var(--space-4)', textAlign: 'center' }}>
        ✨ CAPS-aligned content generated by Dash AI • Exams next week? We've got you covered!
      </p>

      {/* Conversational Builder Banner - Moved to Bottom */}
      {(
        <>
          <div style={{
            textAlign: 'center',
            color: 'var(--muted)',
            fontSize: '13px',
            margin: 'var(--space-3) 0',
            position: 'relative',
          }}>
            <span style={{ background: 'var(--background)', padding: '0 12px', position: 'relative', zIndex: 1 }}>
              or try our new feature
            </span>
            <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: '1px', background: 'var(--border)', zIndex: 0 }} />
          </div>

          <div style={{
            padding: 'var(--space-4)',
            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(168, 85, 247, 0.1) 100%)',
            border: '2px solid rgba(99, 102, 241, 0.3)',
            borderRadius: 'var(--radius-3)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              <div style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                background: 'var(--primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                flexShrink: 0,
              }}>
                <MessageSquare className="w-6 h-6" />
              </div>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <Sparkles className="w-4 h-4" style={{ color: 'var(--primary)' }} />
                  <span>NEW: Conversational Exam Builder</span>
                </h3>
                <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: '12px' }}>
                  Let Dash AI guide you step-by-step. Choose topics, adjust difficulty, and refine each section in real-time!
                </p>
                <button
                  onClick={() => setShowConversationalBuilder(true)}
                  className="btn btnPrimary"
                  style={{ fontSize: '14px' }}
                >
                  <MessageSquare className="icon16" />
                  Start Conversational Builder
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* UpgradeModal for quota exceeded */}
      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        currentTier={currentTier}
        userId={userId || ''}
        userEmail={userEmail}
        userName={userName}
        featureBlocked="exam_generation"
        currentUsage={upgradeModalData?.currentUsage}
        currentLimit={upgradeModalData?.currentLimit}
      />
    </>
  );
}
