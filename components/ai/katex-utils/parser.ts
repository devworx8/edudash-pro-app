/**
 * LaTeX Math Parser
 *
 * Parses LaTeX math expressions into renderable nodes
 */

// =============================================================================
// Types
// =============================================================================

export interface MathNode {
  type: 'text' | 'symbol' | 'fraction' | 'sqrt' | 'superscript' | 'subscript' | 'group';
  content: string | MathNode[];
  exponent?: MathNode;
  subscript?: MathNode;
  numerator?: MathNode[];
  denominator?: MathNode[];
}

export interface ProcessedMathContent {
  type: 'text' | 'inline-math' | 'display-math' | 'fraction' | 'equation';
  content: string;
  numerator?: string;
  denominator?: string;
}

// =============================================================================
// Parser Functions
// =============================================================================

/**
 * Parse a LaTeX string into math nodes
 */
export function parseLatex(latex: string): MathNode[] {
  const nodes: MathNode[] = [];
  let i = 0;

  while (i < latex.length) {
    // Handle escape sequences
    if (latex[i] === '\\') {
      let j = i + 1;
      while (j < latex.length && /[a-zA-Z]/.test(latex[j])) {
        j++;
      }
      const command = latex.substring(i, j);

      if (command === '\\frac') {
        const numerator = parseGroup(latex, j);
        const denominator = parseGroup(latex, numerator.end);
        nodes.push({
          type: 'fraction',
          content: '',
          numerator: numerator.nodes,
          denominator: denominator.nodes,
        });
        i = denominator.end;
      } else if (command === '\\sqrt') {
        const group = parseGroup(latex, j);
        nodes.push({
          type: 'sqrt',
          content: group.nodes,
        });
        i = group.end;
      } else {
        nodes.push({
          type: 'symbol',
          content: command,
        });
        i = j;
      }
    }
    // Handle superscript
    else if (latex[i] === '^') {
      const lastNode = nodes[nodes.length - 1];
      if (lastNode && latex[i + 1] === '{') {
        const group = parseGroup(latex, i + 1);
        lastNode.exponent = group.nodes[0];
        i = group.end;
      } else {
        i++;
        nodes.push({
          type: 'text',
          content: latex[i] || '',
        });
        i++;
      }
    }
    // Handle subscript
    else if (latex[i] === '_') {
      const lastNode = nodes[nodes.length - 1];
      if (lastNode && latex[i + 1] === '{') {
        const group = parseGroup(latex, i + 1);
        lastNode.subscript = group.nodes[0];
        i = group.end;
      } else {
        i++;
        nodes.push({
          type: 'text',
          content: latex[i] || '',
        });
        i++;
      }
    }
    // Handle groups
    else if (latex[i] === '{') {
      const group = parseGroup(latex, i);
      nodes.push({
        type: 'group',
        content: group.nodes,
      });
      i = group.end;
    }
    // Handle regular text
    else if (!/\s/.test(latex[i])) {
      nodes.push({
        type: 'text',
        content: latex[i],
      });
      i++;
    } else {
      i++;
    }
  }

  return nodes;
}

/**
 * Parse a group enclosed in braces
 */
export function parseGroup(latex: string, start: number): { nodes: MathNode[]; end: number } {
  let i = start;
  let depth = 0;

  // Find opening brace
  while (i < latex.length && latex[i] !== '{') {
    i++;
  }
  if (latex[i] === '{') {
    depth = 1;
    i++;
  }

  const groupStart = i;
  while (i < latex.length && depth > 0) {
    if (latex[i] === '{') depth++;
    else if (latex[i] === '}') depth--;
    i++;
  }

  return {
    nodes: parseLatex(latex.substring(groupStart, i - 1)),
    end: i,
  };
}

/**
 * Process text containing math content
 */
export function processMathContent(text: string): ProcessedMathContent[] {
  const results: ProcessedMathContent[] = [];

  // Match display math $$...$$
  const displayMathRegex = /\$\$([^$]+)\$\$/g;
  // Match inline math $...$
  const inlineMathRegex = /\$([^$]+)\$/g;

  let lastIndex = 0;
  let match;

  // Process display math first
  let processedText = text;
  while ((match = displayMathRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      results.push({
        type: 'text',
        content: text.substring(lastIndex, match.index).trim(),
      });
    }
    results.push({
      type: 'display-math',
      content: match[1],
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    const remaining = text.substring(lastIndex);

    // Process inline math
    let inlineLastIndex = 0;
    while ((match = inlineMathRegex.exec(remaining)) !== null) {
      if (match.index > inlineLastIndex) {
        const textPart = remaining.substring(inlineLastIndex, match.index).trim();
        if (textPart) {
          results.push({ type: 'text', content: textPart });
        }
      }
      results.push({
        type: 'inline-math',
        content: match[1],
      });
      inlineLastIndex = match.index + match[0].length;
    }

    if (inlineLastIndex < remaining.length) {
      const finalText = remaining.substring(inlineLastIndex).trim();
      if (finalText) {
        results.push({ type: 'text', content: finalText });
      }
    }
  }

  return results;
}
