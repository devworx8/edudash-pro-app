/**
 * LaTeX Math Symbols Mapping
 *
 * Maps LaTeX commands to Unicode math symbols
 */

export const MATH_SYMBOLS: Record<string, string> = {
  // Operations
  '\\times': '×',
  '\\div': '÷',
  '\\pm': '±',
  '\\mp': '∓',
  '\\cdot': '·',
  '\\ast': '∗',
  '\\star': '★',

  // Relations
  '\\leq': '≤',
  '\\geq': '≥',
  '\\neq': '≠',
  '\\approx': '≈',
  '\\equiv': '≡',
  '\\sim': '∼',
  '\\propto': '∝',

  // Arrows
  '\\rightarrow': '→',
  '\\leftarrow': '←',
  '\\Rightarrow': '⇒',
  '\\Leftarrow': '⇐',
  '\\to': '→',
  '\\gets': '←',

  // Greek letters
  '\\alpha': 'α',
  '\\beta': 'β',
  '\\gamma': 'γ',
  '\\delta': 'δ',
  '\\epsilon': 'ε',
  '\\theta': 'θ',
  '\\lambda': 'λ',
  '\\mu': 'μ',
  '\\pi': 'π',
  '\\sigma': 'σ',
  '\\phi': 'φ',
  '\\omega': 'ω',
  '\\Omega': 'Ω',
  '\\Sigma': 'Σ',
  '\\Pi': 'Π',
  '\\Delta': 'Δ',

  // Sets
  '\\in': '∈',
  '\\notin': '∉',
  '\\subset': '⊂',
  '\\supset': '⊃',
  '\\subseteq': '⊆',
  '\\supseteq': '⊇',
  '\\cup': '∪',
  '\\cap': '∩',
  '\\emptyset': '∅',
  '\\forall': '∀',
  '\\exists': '∃',

  // Misc
  '\\infty': '∞',
  '\\partial': '∂',
  '\\nabla': '∇',
  '\\sqrt': '√',
  '\\sum': '∑',
  '\\prod': '∏',
  '\\int': '∫',
  '\\oint': '∮',
};

/**
 * Replace LaTeX commands with Unicode symbols
 */
export function replaceLatexSymbols(text: string): string {
  let result = text;

  for (const [latex, unicode] of Object.entries(MATH_SYMBOLS)) {
    // Escape backslashes for regex
    const escaped = latex.replace('\\', '\\\\');
    result = result.replace(new RegExp(escaped, 'g'), unicode);
  }

  return result;
}

/**
 * Get symbol for a LaTeX command
 */
export function getMathSymbol(latex: string): string | undefined {
  return MATH_SYMBOLS[latex];
}
