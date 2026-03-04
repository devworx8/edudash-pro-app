export interface GradeComplexity {
  duration: string;
  marks: number;
  questionTypes: string;
  vocabulary: string;
  instructions: string;
  calculator: boolean;
  decimals: boolean;
}

export const GRADE_COMPLEXITY: Record<string, GradeComplexity> = {
  grade_r: {
    duration: '20 minutes',
    marks: 10,
    questionTypes: 'Picture identification, matching, coloring, simple counting',
    vocabulary: 'Basic colors, shapes, numbers 1-5, simple animals',
    instructions:
      'Use LOTS of visual cues, emojis, and simple one-word answers. NO writing required. Focus on recognition and matching.',
    calculator: false,
    decimals: false,
  },
  grade_1: {
    duration: '30 minutes',
    marks: 20,
    questionTypes:
      'Fill-in-the-blank with word bank, matching pictures to words, simple multiple choice (2-3 options), basic counting',
    vocabulary: 'Simple everyday words, numbers 1-10, basic family/animals/food vocabulary',
    instructions:
      'Keep sentences SHORT (3-5 words max). Provide word banks for fill-in-blanks. Use pictures wherever possible.',
    calculator: false,
    decimals: false,
  },
  grade_2: {
    duration: '45 minutes',
    marks: 30,
    questionTypes:
      'Short answer (1-2 sentences), fill-in-blanks, multiple choice (3-4 options), simple problem solving',
    vocabulary: 'Expanded vocabulary, numbers 1-20, basic sentence construction',
    instructions: 'Simple paragraph reading (3-4 sentences). Basic grammar concepts.',
    calculator: false,
    decimals: false,
  },
  grade_3: {
    duration: '60 minutes',
    marks: 40,
    questionTypes: 'Short paragraphs, multiple choice, true/false, matching, basic problem solving',
    vocabulary: 'Age-appropriate vocabulary, numbers 1-100, basic fractions (half, quarter)',
    instructions:
      'Reading comprehension with short stories (1 paragraph). Introduction to simple essays.',
    calculator: false,
    decimals: false,
  },
  grade_4: {
    duration: '90 minutes',
    marks: 50,
    questionTypes:
      'Paragraphs, essays (5-7 sentences), multiple choice, problem solving, data interpretation',
    vocabulary: 'Grade-appropriate vocabulary, decimals to 1 place, basic fractions',
    instructions:
      'Reading passages (2-3 paragraphs). Essay writing with structure. Basic calculator allowed.',
    calculator: true,
    decimals: true,
  },
  grade_5: {
    duration: '90 minutes',
    marks: 60,
    questionTypes:
      'Extended paragraphs, structured essays, complex problem solving, comprehension',
    vocabulary: 'Intermediate vocabulary, decimals to 2 places, common fractions',
    instructions:
      'Multi-paragraph reading. Structured essays with introduction and conclusion.',
    calculator: true,
    decimals: true,
  },
  grade_6: {
    duration: '90 minutes',
    marks: 75,
    questionTypes: 'Essays with clear structure, data analysis, multi-step problem solving',
    vocabulary: 'Advanced intermediate vocabulary, percentages, ratios, algebraic thinking',
    instructions: 'Complex reading comprehension. Essay writing with planning.',
    calculator: true,
    decimals: true,
  },
  grade_7: {
    duration: '2 hours',
    marks: 75,
    questionTypes: 'Analytical essays, data interpretation, multi-step problems, reasoning',
    vocabulary: 'Grade 7 curriculum vocabulary, algebraic expressions, geometry',
    instructions:
      'Extended reading passages. Structured analytical writing. Scientific calculator allowed.',
    calculator: true,
    decimals: true,
  },
  grade_8: {
    duration: '2 hours',
    marks: 100,
    questionTypes:
      'Analytical and creative writing, complex problem solving, research-based questions',
    vocabulary: 'Grade 8 curriculum, algebra, functions, advanced grammar',
    instructions: 'Critical thinking required. Extended essays with evidence.',
    calculator: true,
    decimals: true,
  },
  grade_9: {
    duration: '2 hours',
    marks: 100,
    questionTypes:
      'Critical analysis, extended essays, complex calculations, abstract reasoning',
    vocabulary: 'Grade 9 curriculum, quadratics, trigonometry basics, formal language',
    instructions: 'FET Phase preparation. Formal academic writing.',
    calculator: true,
    decimals: true,
  },
  grade_10: {
    duration: '2.5 hours',
    marks: 100,
    questionTypes: 'FET formal exam format, extended responses, proofs, investigations',
    vocabulary: 'Grade 10 curriculum, advanced algebra, trigonometry, analytical writing',
    instructions: 'NSC preparation format. Extended essay responses.',
    calculator: true,
    decimals: true,
  },
  grade_11: {
    duration: '3 hours',
    marks: 150,
    questionTypes:
      'NSC format, research essays, complex multi-step problems, investigations',
    vocabulary: 'Grade 11 curriculum, calculus introduction, advanced topics',
    instructions: 'Full NSC exam format. University preparation.',
    calculator: true,
    decimals: true,
  },
  grade_12: {
    duration: '3 hours',
    marks: 150,
    questionTypes:
      'Full NSC Matric format, research essays, proofs, investigations, applications',
    vocabulary: 'Grade 12 curriculum, calculus, statistics, formal academic language',
    instructions: 'Official NSC Matric format. University-level expectations.',
    calculator: true,
    decimals: true,
  },
};
