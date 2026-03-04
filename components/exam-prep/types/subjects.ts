// CAPS-aligned subjects by phase
export const SUBJECTS_BY_PHASE = {
  // Foundation Phase (Grades R-3)
  foundation: [
    // Languages (all 11 official languages)
    'English Home Language',
    'English First Additional Language',
    'Afrikaans Home Language',
    'Afrikaans First Additional Language',
    'isiZulu Home Language',
    'isiZulu First Additional Language',
    'isiXhosa Home Language',
    'isiXhosa First Additional Language',
    'Sepedi Home Language',
    'Sepedi First Additional Language',
    'Setswana Home Language',
    'Setswana First Additional Language',
    'Sesotho Home Language',
    'Sesotho First Additional Language',
    'Xitsonga Home Language',
    'Xitsonga First Additional Language',
    'Siswati Home Language',
    'Siswati First Additional Language',
    'Tshivenda Home Language',
    'Tshivenda First Additional Language',
    'isiNdebele Home Language',
    'isiNdebele First Additional Language',
    // Core subjects
    'Mathematics',
    'Life Skills',
  ],

  // Intermediate Phase (Grades 4-6)
  intermediate: [
    // Languages (all 11 official languages)
    'English Home Language',
    'English First Additional Language',
    'Afrikaans Home Language',
    'Afrikaans First Additional Language',
    'isiZulu Home Language',
    'isiZulu First Additional Language',
    'isiXhosa Home Language',
    'isiXhosa First Additional Language',
    'Sepedi Home Language',
    'Sepedi First Additional Language',
    'Setswana Home Language',
    'Setswana First Additional Language',
    'Sesotho Home Language',
    'Sesotho First Additional Language',
    'Xitsonga Home Language',
    'Xitsonga First Additional Language',
    'Siswati Home Language',
    'Siswati First Additional Language',
    'Tshivenda Home Language',
    'Tshivenda First Additional Language',
    'isiNdebele Home Language',
    'isiNdebele First Additional Language',
    // Core subjects
    'Mathematics',
    'Natural Sciences & Technology',
    'History',
    'Geography',
    'Life Skills',
  ],

  // Senior Phase (Grades 7-9)
  senior: [
    // Languages (all 11 official languages)
    'English Home Language',
    'English First Additional Language',
    'Afrikaans Home Language',
    'Afrikaans First Additional Language',
    'isiZulu Home Language',
    'isiZulu First Additional Language',
    'isiXhosa Home Language',
    'isiXhosa First Additional Language',
    'Sepedi Home Language',
    'Sepedi First Additional Language',
    'Setswana Home Language',
    'Setswana First Additional Language',
    'Sesotho Home Language',
    'Sesotho First Additional Language',
    'Xitsonga Home Language',
    'Xitsonga First Additional Language',
    'Siswati Home Language',
    'Siswati First Additional Language',
    'Tshivenda Home Language',
    'Tshivenda First Additional Language',
    'isiNdebele Home Language',
    'isiNdebele First Additional Language',
    // Core subjects
    'Mathematics',
    'Natural Sciences',
    'History',
    'Geography',
    'Technology',
    'Economic & Management Sciences',
    'Life Orientation',
    'Creative Arts',
  ],

  // FET Phase (Grades 10-12)
  fet: [
    // Languages (all 11 official languages)
    'English Home Language',
    'English First Additional Language',
    'Afrikaans Home Language',
    'Afrikaans First Additional Language',
    'isiZulu Home Language',
    'isiZulu First Additional Language',
    'isiXhosa Home Language',
    'isiXhosa First Additional Language',
    'Sepedi Home Language',
    'Sepedi First Additional Language',
    'Setswana Home Language',
    'Setswana First Additional Language',
    'Sesotho Home Language',
    'Sesotho First Additional Language',
    'Xitsonga Home Language',
    'Xitsonga First Additional Language',
    'Siswati Home Language',
    'Siswati First Additional Language',
    'Tshivenda Home Language',
    'Tshivenda First Additional Language',
    'isiNdebele Home Language',
    'isiNdebele First Additional Language',
    // Mathematics
    'Mathematics',
    'Mathematical Literacy',
    // Sciences
    'Life Sciences',
    'Physical Sciences',
    // Commercial subjects
    'Accounting',
    'Business Studies',
    'Economics',
    // Social Sciences
    'Geography',
    'History',
    // Other required
    'Life Orientation',
    // Additional subjects
    'Agricultural Sciences',
    'Agricultural Technology',
    'Civil Technology',
    'Computer Applications Technology',
    'Consumer Studies',
    'Dance Studies',
    'Design',
    'Dramatic Arts',
    'Electrical Technology',
    'Engineering Graphics & Design',
    'Hospitality Studies',
    'Information Technology',
    'Mechanical Technology',
    'Music',
    'Tourism',
    'Visual Arts',
  ],
};

// Helper to get phase from grade
export function getPhaseFromGrade(grade: string): keyof typeof SUBJECTS_BY_PHASE {
  if (['grade_r', 'grade_1', 'grade_2', 'grade_3'].includes(grade)) return 'foundation';
  if (['grade_4', 'grade_5', 'grade_6'].includes(grade)) return 'intermediate';
  if (['grade_7', 'grade_8', 'grade_9'].includes(grade)) return 'senior';
  return 'fet';
}

// Get subjects for a specific grade
export function getSubjectsForGrade(grade: string): string[] {
  const phase = getPhaseFromGrade(grade);
  return SUBJECTS_BY_PHASE[phase];
}
