/**
 * K-12 Game Library — SA-context, CAPS-aligned content
 * 20 games across 10 types, grades 4–12.
 */

import type { K12Game } from './k12Activities.types';

export const K12_GAMES: K12Game[] = [

  // ── MENTAL MATHS ─────────────────────────────────────────────────────────

  {
    id: 'mental-math-gr4-easy',
    title: 'Arithmetic Sprint',
    description: 'Race against the clock — basic operations for Grade 4–6.',
    emoji: '⚡',
    gameType: 'mental_math',
    subject: 'mathematics',
    gradeRange: '4-6',
    difficulty: 'easy',
    durationMinutes: 3,
    gradient: ['#4F46E5', '#7C3AED'],
    globalTimeLimitSeconds: 60,
    tags: ['arithmetic', 'speed', 'multiplication'],
    teacherNotes: 'Great warm-up for the start of a Maths lesson.',
    rounds: [
      { id: 'mm1-1', question: '7 × 8 = ?', options: [{ id:'a',label:'54',isCorrect:false},{id:'b',label:'56',isCorrect:true},{id:'c',label:'63',isCorrect:false},{id:'d',label:'48',isCorrect:false}], xpReward: 10 },
      { id: 'mm1-2', question: '145 + 78 = ?', options: [{ id:'a',label:'213',isCorrect:false},{id:'b',label:'223',isCorrect:true},{id:'c',label:'233',isCorrect:false},{id:'d',label:'219',isCorrect:false}], xpReward: 10 },
      { id: 'mm1-3', question: '200 − 63 = ?', options: [{ id:'a',label:'127',isCorrect:false},{id:'b',label:'147',isCorrect:false},{id:'c',label:'137',isCorrect:true},{id:'d',label:'163',isCorrect:false}], xpReward: 10 },
      { id: 'mm1-4', question: '48 ÷ 6 = ?', options: [{ id:'a',label:'7',isCorrect:false},{id:'b',label:'9',isCorrect:false},{id:'c',label:'8',isCorrect:true},{id:'d',label:'6',isCorrect:false}], xpReward: 10 },
      { id: 'mm1-5', question: '325 + 146 = ?', options: [{ id:'a',label:'461',isCorrect:false},{id:'b',label:'471',isCorrect:true},{id:'c',label:'481',isCorrect:false},{id:'d',label:'451',isCorrect:false}], xpReward: 10 },
      { id: 'mm1-6', question: '9 × 9 = ?', options: [{ id:'a',label:'72',isCorrect:false},{id:'b',label:'81',isCorrect:true},{id:'c',label:'90',isCorrect:false},{id:'d',label:'99',isCorrect:false}], xpReward: 10 },
      { id: 'mm1-7', question: '500 − 178 = ?', options: [{ id:'a',label:'322',isCorrect:true},{id:'b',label:'312',isCorrect:false},{id:'c',label:'332',isCorrect:false},{id:'d',label:'342',isCorrect:false}], xpReward: 10 },
      { id: 'mm1-8', question: '12 × 7 = ?', options: [{ id:'a',label:'74',isCorrect:false},{id:'b',label:'84',isCorrect:true},{id:'c',label:'94',isCorrect:false},{id:'d',label:'77',isCorrect:false}], xpReward: 10 },
      { id: 'mm1-9', question: '81 ÷ 9 = ?', options: [{ id:'a',label:'7',isCorrect:false},{id:'b',label:'8',isCorrect:false},{id:'c',label:'9',isCorrect:true},{id:'d',label:'11',isCorrect:false}], xpReward: 10 },
      { id: 'mm1-10', question: '15% of 200 = ?', options: [{ id:'a',label:'25',isCorrect:false},{id:'b',label:'30',isCorrect:true},{id:'c',label:'35',isCorrect:false},{id:'d',label:'20',isCorrect:false}], xpReward: 15 },
    ],
  },

  {
    id: 'mental-math-gr7-medium',
    title: 'Maths Power',
    description: 'Percentages, algebra basics and square roots — Grade 7–9.',
    emoji: '🧮',
    gameType: 'mental_math',
    subject: 'mathematics',
    gradeRange: '7-9',
    difficulty: 'medium',
    durationMinutes: 4,
    gradient: ['#1D4ED8', '#0F766E'],
    globalTimeLimitSeconds: 90,
    tags: ['algebra', 'percentages', 'square roots'],
    rounds: [
      { id: 'mm2-1', question: '25% of 360 = ?', options: [{ id:'a',label:'80',isCorrect:false},{id:'b',label:'90',isCorrect:true},{id:'c',label:'100',isCorrect:false},{id:'d',label:'85',isCorrect:false}], xpReward: 15 },
      { id: 'mm2-2', question: '√144 = ?', options: [{ id:'a',label:'11',isCorrect:false},{id:'b',label:'12',isCorrect:true},{id:'c',label:'13',isCorrect:false},{id:'d',label:'14',isCorrect:false}], xpReward: 15 },
      { id: 'mm2-3', question: 'If x − 7 = 15, then x = ?', options: [{ id:'a',label:'8',isCorrect:false},{id:'b',label:'22',isCorrect:true},{id:'c',label:'21',isCorrect:false},{id:'d',label:'23',isCorrect:false}], xpReward: 15 },
      { id: 'mm2-4', question: '8² = ?', options: [{ id:'a',label:'56',isCorrect:false},{id:'b',label:'64',isCorrect:true},{id:'c',label:'72',isCorrect:false},{id:'d',label:'80',isCorrect:false}], xpReward: 15 },
      { id: 'mm2-5', question: '(3 × 4) + (2 × 5) = ?', options: [{ id:'a',label:'20',isCorrect:false},{id:'b',label:'22',isCorrect:true},{id:'c',label:'24',isCorrect:false},{id:'d',label:'18',isCorrect:false}], xpReward: 15 },
      { id: 'mm2-6', question: '20% of 450 = ?', options: [{ id:'a',label:'80',isCorrect:false},{id:'b',label:'85',isCorrect:false},{id:'c',label:'90',isCorrect:true},{id:'d',label:'95',isCorrect:false}], xpReward: 15 },
      { id: 'mm2-7', question: '−5 + (−3) = ?', options: [{ id:'a',label:'−2',isCorrect:false},{id:'b',label:'−8',isCorrect:true},{id:'c',label:'8',isCorrect:false},{id:'d',label:'2',isCorrect:false}], xpReward: 15 },
      { id: 'mm2-8', question: '30% of 600 = ?', options: [{ id:'a',label:'160',isCorrect:false},{id:'b',label:'180',isCorrect:true},{id:'c',label:'200',isCorrect:false},{id:'d',label:'120',isCorrect:false}], xpReward: 15 },
    ],
  },

  // ── MATHS LITERACY ───────────────────────────────────────────────────────

  {
    id: 'maths-lit-gr10-medium',
    title: 'Real-World Maths',
    description: 'SA rand, budgets, VAT and everyday calculations.',
    emoji: '💰',
    gameType: 'maths_lit',
    subject: 'maths_literacy',
    gradeRange: '10-12',
    difficulty: 'medium',
    durationMinutes: 5,
    gradient: ['#065F46', '#0D9488'],
    tags: ['VAT', 'budgeting', 'interest', 'percentages'],
    teacherNotes: 'Ideal for Financial Literacy lesson introduction.',
    rounds: [
      {
        id: 'ml1-1',
        question: 'A shirt costs R299 before 15% VAT. What is the final price?',
        subText: 'VAT = 15% of R299',
        options: [{ id:'a',label:'R333.85',isCorrect:false},{id:'b',label:'R343.85',isCorrect:true},{id:'c',label:'R314.00',isCorrect:false},{id:'d',label:'R354.00',isCorrect:false}],
        explanation: 'R299 × 1.15 = R343.85',
        xpReward: 20,
      },
      {
        id: 'ml1-2',
        question: 'You earn R12,500/month. PAYE tax is 18%. How much tax do you pay?',
        options: [{ id:'a',label:'R2,000',isCorrect:false},{id:'b',label:'R2,150',isCorrect:false},{id:'c',label:'R2,250',isCorrect:true},{id:'d',label:'R2,500',isCorrect:false}],
        explanation: 'R12,500 × 0.18 = R2,250',
        xpReward: 20,
      },
      {
        id: 'ml1-3',
        question: 'Petrol costs R22.50/litre. Your car uses 8L per 100 km. What does a 250 km trip cost?',
        options: [{ id:'a',label:'R40.00',isCorrect:false},{id:'b',label:'R45.00',isCorrect:true},{id:'c',label:'R50.00',isCorrect:false},{id:'d',label:'R36.00',isCorrect:false}],
        explanation: '250 km ÷ 100 × 8L × R22.50 = R45',
        xpReward: 25,
      },
      {
        id: 'ml1-4',
        question: 'You borrow R10,000 at 12% simple interest per year. After 2 years, what do you owe?',
        options: [{ id:'a',label:'R11,200',isCorrect:false},{id:'b',label:'R12,400',isCorrect:true},{id:'c',label:'R12,000',isCorrect:false},{id:'d',label:'R11,440',isCorrect:false}],
        explanation: 'Simple interest = R10,000 × 12% × 2 = R2,400. Total = R12,400',
        xpReward: 25,
      },
      {
        id: 'ml1-5',
        question: 'A school tuck shop buys 50 pies at R8 each and sells them at R14 each. What is the profit?',
        options: [{ id:'a',label:'R250',isCorrect:false},{id:'b',label:'R300',isCorrect:true},{id:'c',label:'R350',isCorrect:false},{id:'d',label:'R400',isCorrect:false}],
        explanation: 'Profit per pie = R14 − R8 = R6. Total = 50 × R6 = R300',
        xpReward: 20,
      },
      {
        id: 'ml1-6',
        question: 'Monthly electricity: 145 kWh at R2.18/kWh. What is the bill?',
        options: [{ id:'a',label:'R296.10',isCorrect:false},{id:'b',label:'R316.10',isCorrect:true},{id:'c',label:'R306.10',isCorrect:false},{id:'d',label:'R326.10',isCorrect:false}],
        explanation: '145 × R2.18 = R316.10',
        xpReward: 20,
      },
    ],
  },

  // ── SPELLING BEE ─────────────────────────────────────────────────────────

  {
    id: 'spelling-bee-gr7-medium',
    title: 'Spelling Bee',
    description: 'CAPS Grade 7–9 vocabulary — can you spell them correctly?',
    emoji: '🐝',
    gameType: 'spelling_bee',
    subject: 'english',
    gradeRange: '7-9',
    difficulty: 'medium',
    durationMinutes: 4,
    gradient: ['#D97706', '#92400E'],
    tags: ['vocabulary', 'spelling', 'English'],
    rounds: [
      { id: 'sb1-1', question: 'Select the CORRECT spelling for:\n"To provide space or room for someone"', options: [{ id:'a',label:'Accomodate',isCorrect:false},{id:'b',label:'Accommodate',isCorrect:true},{id:'c',label:'Acommodate',isCorrect:false},{id:'d',label:'Accommodatte',isCorrect:false}], explanation: 'ACCOMMODATE — double c, double m', xpReward: 15 },
      { id: 'sb1-2', question: 'Select the CORRECT spelling for:\n"Something you cannot do without"', options: [{ id:'a',label:'Neccessary',isCorrect:false},{id:'b',label:'Necesary',isCorrect:false},{id:'c',label:'Necessary',isCorrect:true},{id:'d',label:'Necessery',isCorrect:false}], explanation: 'NECESSARY — one c, double s', xpReward: 15 },
      { id: 'sb1-3', question: 'Select the CORRECT spelling for:\n"South Africa\'s law-making body"', options: [{ id:'a',label:'Parliment',isCorrect:false},{id:'b',label:'Parliament',isCorrect:true},{id:'c',label:'Parlamente',isCorrect:false},{id:'d',label:'Parlamentt',isCorrect:false}], explanation: 'PARLIAMENT — parlia-ment', xpReward: 15 },
      { id: 'sb1-4', question: 'Select the CORRECT spelling for:\n"Someone who starts their own business"', options: [{ id:'a',label:'Entrepeneur',isCorrect:false},{id:'b',label:'Entrepreneur',isCorrect:true},{id:'c',label:'Enterpreneur',isCorrect:false},{id:'d',label:'Entrepraneur',isCorrect:false}], explanation: 'ENTREPRENEUR — entre-pre-neur (French origin)', xpReward: 20 },
      { id: 'sb1-5', question: 'Select the CORRECT spelling for:\n"The supreme law of a country"', options: [{ id:'a',label:'Constitucion',isCorrect:false},{id:'b',label:'Constitusion',isCorrect:false},{id:'c',label:'Constitution',isCorrect:true},{id:'d',label:'Constitutoin',isCorrect:false}], explanation: 'CONSTITUTION — consti-tu-tion', xpReward: 15 },
      { id: 'sb1-6', question: 'Select the CORRECT spelling for:\n"To say something is not true"', options: [{ id:'a',label:'Contradikt',isCorrect:false},{id:'b',label:'Contradict',isCorrect:true},{id:'c',label:'Contradick',isCorrect:false},{id:'d',label:'Contredict',isCorrect:false}], explanation: 'CONTRADICT — contra-dict', xpReward: 15 },
      { id: 'sb1-7', question: 'Select the CORRECT spelling for:\n"Showing a lack of respect"', options: [{ id:'a',label:'Disrespectfull',isCorrect:false},{id:'b',label:'Disrespectful',isCorrect:true},{id:'c',label:'Disrespectfal',isCorrect:false},{id:'d',label:'Disrespektful',isCorrect:false}], explanation: 'DISRESPECTFUL — dis-re-spect-ful', xpReward: 15 },
    ],
  },

  {
    id: 'spelling-bee-gr10-hard',
    title: 'Advanced Spelling',
    description: 'Grade 10–12 CAPS vocabulary — challenging words.',
    emoji: '🏆',
    gameType: 'spelling_bee',
    subject: 'english',
    gradeRange: '10-12',
    difficulty: 'hard',
    durationMinutes: 5,
    gradient: ['#7C2D12', '#B45309'],
    tags: ['vocabulary', 'advanced', 'CAPS'],
    rounds: [
      { id: 'sb2-1', question: 'Select the CORRECT spelling for:\n"Having a sense of guilt and remorse"', options: [{ id:'a',label:'Consciencious',isCorrect:false},{id:'b',label:'Conscientious',isCorrect:true},{id:'c',label:'Consientious',isCorrect:false},{id:'d',label:'Conscientous',isCorrect:false}], explanation: 'CONSCIENTIOUS — con-sci-en-tious', xpReward: 25 },
      { id: 'sb2-2', question: 'Select the CORRECT spelling for:\n"Continued effort despite difficulty"', options: [{ id:'a',label:'Perseverence',isCorrect:false},{id:'b',label:'Perserverance',isCorrect:false},{id:'c',label:'Perseverance',isCorrect:true},{id:'d',label:'Perseveranse',isCorrect:false}], explanation: 'PERSEVERANCE — per-sev-er-ance', xpReward: 25 },
      { id: 'sb2-3', question: 'Select the CORRECT spelling for:\n"Bias against a group before knowing facts"', options: [{ id:'a',label:'Prejidice',isCorrect:false},{id:'b',label:'Prejudise',isCorrect:false},{id:'c',label:'Prejudice',isCorrect:true},{id:'d',label:'Predjudice',isCorrect:false}], explanation: 'PREJUDICE — pre-ju-dice', xpReward: 25 },
      { id: 'sb2-4', question: 'Select the CORRECT spelling for:\n"Having no precedent; never done before"', options: [{ id:'a',label:'Unprecedanted',isCorrect:false},{id:'b',label:'Unpresedented',isCorrect:false},{id:'c',label:'Unprecedented',isCorrect:true},{id:'d',label:'Unprecedinted',isCorrect:false}], explanation: 'UNPRECEDENTED — un-prec-e-dent-ed', xpReward: 25 },
    ],
  },

  // ── WORD SCRAMBLE ─────────────────────────────────────────────────────────

  {
    id: 'word-scramble-gr7',
    title: 'Word Scramble',
    description: 'Unscramble the letters to find the hidden word.',
    emoji: '🔤',
    gameType: 'word_scramble',
    subject: 'english',
    gradeRange: '4-9',
    difficulty: 'medium',
    durationMinutes: 4,
    gradient: ['#5B21B6', '#8B5CF6'],
    tags: ['vocabulary', 'spelling', 'fun'],
    rounds: [
      { id: 'ws1-1', question: 'TNEPLIRMA', subText: 'Hint: SA\'s law-making body', options: [{ id:'a',label:'PARLIAMENT',isCorrect:true},{id:'b',label:'PLANET',isCorrect:false},{id:'c',label:'MINERAL',isCorrect:false},{id:'d',label:'MATERIAL',isCorrect:false}], xpReward: 15 },
      { id: 'ws1-2', question: 'CAILMTEHAMT', subText: 'Hint: A school subject', options: [{ id:'a',label:'MECHANICAL',isCorrect:false},{id:'b',label:'MATHEMATICAL',isCorrect:true},{id:'c',label:'ANALYTICAL',isCorrect:false},{id:'d',label:'CATEGORICAL',isCorrect:false}], xpReward: 15 },
      { id: 'ws1-3', question: 'ITCONSUITONT', subText: 'Hint: Supreme law of a land', options: [{ id:'a',label:'CONSTITUTION',isCorrect:true},{id:'b',label:'INSTITUTION',isCorrect:false},{id:'c',label:'CONSTRUCTION',isCorrect:false},{id:'d',label:'CONTRIBUTION',isCorrect:false}], xpReward: 20 },
      { id: 'ws1-4', question: 'CNISEE', subText: 'Hint: Subject studying nature and experiments', options: [{ id:'a',label:'SENSE',isCorrect:false},{id:'b',label:'SEINCE',isCorrect:false},{id:'c',label:'SCIENCE',isCorrect:true},{id:'d',label:'SCENCE',isCorrect:false}], xpReward: 10 },
      { id: 'ws1-5', question: 'YPAORHECGG', subText: 'Hint: Study of Earth\'s places', options: [{ id:'a',label:'GEOGRAPHY',isCorrect:true},{id:'b',label:'PHOTOGRAPHY',isCorrect:false},{id:'c',label:'CHOREOGRAPHY',isCorrect:false},{id:'d',label:'CALLIGRAPHY',isCorrect:false}], xpReward: 15 },
    ],
  },

  // ── LOGIC SEQUENCE ────────────────────────────────────────────────────────

  {
    id: 'logic-seq-gr7',
    title: 'Logic & Patterns',
    description: 'Number patterns, shapes and sequences. What comes next?',
    emoji: '🧩',
    gameType: 'logic_sequence',
    subject: 'mathematics',
    gradeRange: '7-9',
    difficulty: 'medium',
    durationMinutes: 4,
    gradient: ['#0C4A6E', '#0284C7'],
    tags: ['patterns', 'sequences', 'logical thinking'],
    rounds: [
      { id: 'ls1-1', question: '2, 4, 8, 16, ?', options: [{ id:'a',label:'20',isCorrect:false},{id:'b',label:'24',isCorrect:false},{id:'c',label:'32',isCorrect:true},{id:'d',label:'28',isCorrect:false}], explanation: 'Each term doubles (×2)', xpReward: 15 },
      { id: 'ls1-2', question: '1, 1, 2, 3, 5, 8, ?', options: [{ id:'a',label:'11',isCorrect:false},{id:'b',label:'13',isCorrect:true},{id:'c',label:'12',isCorrect:false},{id:'d',label:'10',isCorrect:false}], explanation: 'Fibonacci sequence: each term = sum of previous two', xpReward: 20 },
      { id: 'ls1-3', question: '1, 4, 9, 16, 25, ?', options: [{ id:'a',label:'30',isCorrect:false},{id:'b',label:'35',isCorrect:false},{id:'c',label:'36',isCorrect:true},{id:'d',label:'32',isCorrect:false}], explanation: 'Perfect squares: 1², 2², 3², 4², 5², 6² = 36', xpReward: 15 },
      { id: 'ls1-4', question: '3-sided, 4-sided, 5-sided, ?', subText: 'Triangle, Square, Pentagon, ___?', options: [{ id:'a',label:'Heptagon',isCorrect:false},{id:'b',label:'Hexagon',isCorrect:true},{id:'c',label:'Octagon',isCorrect:false},{id:'d',label:'Decagon',isCorrect:false}], explanation: 'Hexagon has 6 sides — the next in the sequence', xpReward: 15 },
      { id: 'ls1-5', question: '100, 90, 81, 73, ?', options: [{ id:'a',label:'65',isCorrect:false},{id:'b',label:'66',isCorrect:true},{id:'c',label:'67',isCorrect:false},{id:'d',label:'64',isCorrect:false}], explanation: 'Differences: −10, −9, −8, −7... so next difference is −7 → 73−7=66', xpReward: 20 },
      { id: 'ls1-6', question: '2, 6, 12, 20, 30, ?', options: [{ id:'a',label:'40',isCorrect:false},{id:'b',label:'42',isCorrect:true},{id:'c',label:'44',isCorrect:false},{id:'d',label:'36',isCorrect:false}], explanation: 'n(n+1): 1×2, 2×3, 3×4, 4×5, 5×6, 6×7 = 42', xpReward: 25 },
    ],
  },

  // ── MEMORY MATRIX ─────────────────────────────────────────────────────────

  {
    id: 'memory-matrix-gr4',
    title: 'Memory Matrix',
    description: 'Study the pattern, then recreate it from memory.',
    emoji: '🧠',
    gameType: 'memory_matrix',
    subject: 'general',
    gradeRange: '4-12',
    difficulty: 'easy',
    durationMinutes: 3,
    gradient: ['#134E4A', '#0F766E'],
    tags: ['memory', 'concentration', 'cognitive'],
    rounds: [
      { id: 'mx1-1', question: 'Remember this pattern:', matrixPattern: [true,false,true,false,true,false,true,false,true], matrixSize: 3, xpReward: 15 },
      { id: 'mx1-2', question: 'Remember this pattern:', matrixPattern: [false,true,false,true,true,true,false,true,false], matrixSize: 3, xpReward: 15 },
      { id: 'mx1-3', question: 'Remember this pattern:', matrixPattern: [true,true,false,false,true,false,true,true,false], matrixSize: 3, xpReward: 20 },
      { id: 'mx1-4', question: 'Remember this pattern:', matrixPattern: [true,false,false,true,false,true,true,false,false,true,false,true,false,false,true,true], matrixSize: 4, xpReward: 25 },
    ],
  },

  // ── SCIENCE QUIZ ─────────────────────────────────────────────────────────

  {
    id: 'science-quiz-gr7',
    title: 'Science Challenger',
    description: 'CAPS Grade 7–9 Life & Physical Science questions.',
    emoji: '🔬',
    gameType: 'science_quiz',
    subject: 'life_science',
    gradeRange: '7-9',
    difficulty: 'medium',
    durationMinutes: 5,
    gradient: ['#064E3B', '#065F46'],
    tags: ['CAPS', 'life science', 'physical science'],
    rounds: [
      { id: 'sci1-1', question: 'Which organelle is called the "powerhouse of the cell"?', options: [{ id:'a',label:'Nucleus',isCorrect:false},{id:'b',label:'Ribosome',isCorrect:false},{id:'c',label:'Mitochondria',isCorrect:true},{id:'d',label:'Vacuole',isCorrect:false}], explanation: 'Mitochondria produce ATP (energy) for the cell.', xpReward: 15 },
      { id: 'sci1-2', question: 'What is the chemical formula for water?', options: [{ id:'a',label:'CO₂',isCorrect:false},{id:'b',label:'H₂O',isCorrect:true},{id:'c',label:'NaCl',isCorrect:false},{id:'d',label:'O₂',isCorrect:false}], explanation: 'Water = 2 hydrogen + 1 oxygen = H₂O', xpReward: 10 },
      { id: 'sci1-3', question: 'What type of rock forms when magma cools and solidifies?', options: [{ id:'a',label:'Sedimentary',isCorrect:false},{id:'b',label:'Metamorphic',isCorrect:false},{id:'c',label:'Igneous',isCorrect:true},{id:'d',label:'Limestone',isCorrect:false}], explanation: 'Igneous rock = formed from cooled magma or lava.', xpReward: 15 },
      { id: 'sci1-4', question: 'The process by which plants make food using sunlight is called?', options: [{ id:'a',label:'Respiration',isCorrect:false},{id:'b',label:'Digestion',isCorrect:false},{id:'c',label:'Transpiration',isCorrect:false},{id:'d',label:'Photosynthesis',isCorrect:true}], explanation: 'Photosynthesis: CO₂ + H₂O + sunlight → glucose + O₂', xpReward: 10 },
      { id: 'sci1-5', question: 'Approximately how fast does light travel?', options: [{ id:'a',label:'150,000 km/s',isCorrect:false},{id:'b',label:'300,000 km/s',isCorrect:true},{id:'c',label:'450,000 km/s',isCorrect:false},{id:'d',label:'30,000 km/s',isCorrect:false}], explanation: 'Speed of light ≈ 299,792 km/s (about 300,000 km/s)', xpReward: 15 },
      { id: 'sci1-6', question: 'What force keeps planets in orbit around the Sun?', options: [{ id:'a',label:'Magnetism',isCorrect:false},{id:'b',label:'Friction',isCorrect:false},{id:'c',label:'Gravity',isCorrect:true},{id:'d',label:'Electrostatics',isCorrect:false}], explanation: 'Gravity is the attractive force between masses.', xpReward: 15 },
      { id: 'sci1-7', question: 'Which gas do plants absorb during photosynthesis?', options: [{ id:'a',label:'Oxygen',isCorrect:false},{id:'b',label:'Nitrogen',isCorrect:false},{id:'c',label:'Carbon dioxide',isCorrect:true},{id:'d',label:'Hydrogen',isCorrect:false}], explanation: 'Plants absorb CO₂ and release O₂ during photosynthesis.', xpReward: 10 },
    ],
  },

  // ── GEOGRAPHY QUIZ ────────────────────────────────────────────────────────

  {
    id: 'geo-quiz-sa-gr7',
    title: 'SA Geography',
    description: 'South Africa — capitals, biomes, rivers and more.',
    emoji: '🌍',
    gameType: 'geography_quiz',
    subject: 'geography',
    gradeRange: '4-9',
    difficulty: 'easy',
    durationMinutes: 5,
    gradient: ['#92400E', '#B45309'],
    tags: ['South Africa', 'capitals', 'rivers', 'CAPS'],
    rounds: [
      { id: 'geo1-1', question: 'What is the capital city of the Western Cape?', options: [{ id:'a',label:'Stellenbosch',isCorrect:false},{id:'b',label:'Cape Town',isCorrect:true},{id:'c',label:'George',isCorrect:false},{id:'d',label:'Paarl',isCorrect:false}], xpReward: 10 },
      { id: 'geo1-2', question: 'Which is the longest river in South Africa?', options: [{ id:'a',label:'Limpopo River',isCorrect:false},{id:'b',label:'Vaal River',isCorrect:false},{id:'c',label:'Orange River',isCorrect:true},{id:'d',label:'Breede River',isCorrect:false}], explanation: 'The Orange River (Gariep) is South Africa\'s longest river.', xpReward: 15 },
      { id: 'geo1-3', question: 'How many official languages does South Africa have?', options: [{ id:'a',label:'9',isCorrect:false},{id:'b',label:'10',isCorrect:false},{id:'c',label:'11',isCorrect:true},{id:'d',label:'12',isCorrect:false}], xpReward: 10 },
      { id: 'geo1-4', question: 'Which biome covers the largest area of South Africa?', options: [{ id:'a',label:'Fynbos',isCorrect:false},{id:'b',label:'Desert',isCorrect:false},{id:'c',label:'Savanna',isCorrect:true},{id:'d',label:'Grassland',isCorrect:false}], explanation: 'Savanna (bushveld) covers about 34% of South Africa.', xpReward: 15 },
      { id: 'geo1-5', question: 'South Africa\'s administrative capital (where the President works) is?', options: [{ id:'a',label:'Cape Town',isCorrect:false},{id:'b',label:'Pretoria',isCorrect:true},{id:'c',label:'Johannesburg',isCorrect:false},{id:'d',label:'Bloemfontein',isCorrect:false}], explanation: 'SA has 3 capitals: Pretoria (admin), Cape Town (legislative), Bloemfontein (judicial).', xpReward: 20 },
      { id: 'geo1-6', question: 'Which mountain range runs along the south-western Cape?', options: [{ id:'a',label:'Drakensberg',isCorrect:false},{id:'b',label:'Cape Fold Mountains',isCorrect:true},{id:'c',label:'Magaliesberg',isCorrect:false},{id:'d',label:'Langeberg',isCorrect:false}], xpReward: 15 },
    ],
  },

  // ── HISTORY MCQ ───────────────────────────────────────────────────────────

  {
    id: 'history-sa-gr9',
    title: 'SA History',
    description: 'CAPS-aligned South African history from 1948 to democracy.',
    emoji: '📜',
    gameType: 'history_mcq',
    subject: 'history',
    gradeRange: '7-12',
    difficulty: 'medium',
    durationMinutes: 5,
    gradient: ['#1C1917', '#44403C'],
    tags: ['apartheid', 'democracy', 'Mandela', 'CAPS'],
    rounds: [
      { id: 'hist1-1', question: 'In what year did South Africa hold its first democratic election?', options: [{ id:'a',label:'1990',isCorrect:false},{id:'b',label:'1992',isCorrect:false},{id:'c',label:'1994',isCorrect:true},{id:'d',label:'1996',isCorrect:false}], explanation: '27 April 1994 — Nelson Mandela won the first democratic election.', xpReward: 10 },
      { id: 'hist1-2', question: 'Who was South Africa\'s first democratically elected president?', options: [{ id:'a',label:'Thabo Mbeki',isCorrect:false},{id:'b',label:'Nelson Mandela',isCorrect:true},{id:'c',label:'FW de Klerk',isCorrect:false},{id:'d',label:'Oliver Tambo',isCorrect:false}], xpReward: 10 },
      { id: 'hist1-3', question: 'What did the word "apartheid" mean in Afrikaans?', options: [{ id:'a',label:'Freedom',isCorrect:false},{id:'b',label:'Struggle',isCorrect:false},{id:'c',label:'Unity',isCorrect:false},{id:'d',label:'Apartness',isCorrect:true}], explanation: '"Apartheid" = policy of racial separation enforced 1948–1994.', xpReward: 15 },
      { id: 'hist1-4', question: 'The Freedom Charter was adopted in which year?', options: [{ id:'a',label:'1948',isCorrect:false},{id:'b',label:'1955',isCorrect:true},{id:'c',label:'1960',isCorrect:false},{id:'d',label:'1964',isCorrect:false}], explanation: 'The Freedom Charter was adopted at Kliptown, Soweto on 26 June 1955.', xpReward: 20 },
      { id: 'hist1-5', question: 'The Sharpeville Massacre happened in which year?', options: [{ id:'a',label:'1955',isCorrect:false},{id:'b',label:'1960',isCorrect:true},{id:'c',label:'1964',isCorrect:false},{id:'d',label:'1976',isCorrect:false}], explanation: '21 March 1960 — police killed 69 protesters in Sharpeville. Now Human Rights Day.', xpReward: 20 },
      { id: 'hist1-6', question: 'The Soweto Uprising (student protests) occurred in?', options: [{ id:'a',label:'1960',isCorrect:false},{id:'b',label:'1970',isCorrect:false},{id:'c',label:'1976',isCorrect:true},{id:'d',label:'1980',isCorrect:false}], explanation: '16 June 1976 — students protested being taught in Afrikaans. Now Youth Day.', xpReward: 20 },
      { id: 'hist1-7', question: 'Nelson Mandela was released from prison after how many years?', options: [{ id:'a',label:'18 years',isCorrect:false},{id:'b',label:'25 years',isCorrect:false},{id:'c',label:'27 years',isCorrect:true},{id:'d',label:'30 years',isCorrect:false}], explanation: 'Mandela was imprisoned 1964–1990 — 27 years, mostly on Robben Island.', xpReward: 20 },
    ],
  },

  // ── VOCAB MATCH ───────────────────────────────────────────────────────────

  {
    id: 'vocab-science-gr7',
    title: 'Science Vocab Match',
    description: 'Match the definition to the correct scientific term.',
    emoji: '🔭',
    gameType: 'vocab_match',
    subject: 'life_science',
    gradeRange: '7-9',
    difficulty: 'easy',
    durationMinutes: 4,
    gradient: ['#1E3A5F', '#1D4ED8'],
    tags: ['vocabulary', 'science terms', 'CAPS'],
    rounds: [
      { id: 'vm1-1', question: 'The study of living organisms and their interactions with the environment:', options: [{ id:'a',label:'Physics',isCorrect:false},{id:'b',label:'Biology',isCorrect:true},{id:'c',label:'Chemistry',isCorrect:false},{id:'d',label:'Geology',isCorrect:false}], xpReward: 10 },
      { id: 'vm1-2', question: 'The basic unit of all living things:', options: [{ id:'a',label:'Atom',isCorrect:false},{id:'b',label:'Molecule',isCorrect:false},{id:'c',label:'Cell',isCorrect:true},{id:'d',label:'Gene',isCorrect:false}], xpReward: 10 },
      { id: 'vm1-3', question: 'The process by which a liquid turns into a gas:', options: [{ id:'a',label:'Condensation',isCorrect:false},{id:'b',label:'Evaporation',isCorrect:true},{id:'c',label:'Sublimation',isCorrect:false},{id:'d',label:'Precipitation',isCorrect:false}], xpReward: 10 },
      { id: 'vm1-4', question: 'An organism that makes its own food using sunlight:', options: [{ id:'a',label:'Decomposer',isCorrect:false},{id:'b',label:'Consumer',isCorrect:false},{id:'c',label:'Producer',isCorrect:true},{id:'d',label:'Predator',isCorrect:false}], explanation: 'Producers (plants) use photosynthesis to make their own food.', xpReward: 15 },
      { id: 'vm1-5', question: 'The force per unit area acting on a surface:', options: [{ id:'a',label:'Density',isCorrect:false},{id:'b',label:'Volume',isCorrect:false},{id:'c',label:'Pressure',isCorrect:true},{id:'d',label:'Mass',isCorrect:false}], xpReward: 15 },
      { id: 'vm1-6', question: 'The transfer of heat through direct contact:', options: [{ id:'a',label:'Convection',isCorrect:false},{id:'b',label:'Radiation',isCorrect:false},{id:'c',label:'Conduction',isCorrect:true},{id:'d',label:'Reflection',isCorrect:false}], explanation: 'Conduction = heat transfer through direct touch (e.g. a hot pan handle).', xpReward: 15 },
    ],
  },

];

// ── Index for O(1) lookup ─────────────────────────────────────────────────

export const K12_GAMES_BY_ID: Record<string, K12Game> = Object.fromEntries(
  K12_GAMES.map(g => [g.id, g]),
);
