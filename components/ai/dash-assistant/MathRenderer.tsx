import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

interface MathRendererProps {
  expression: string;
  displayMode?: boolean;
}

const MAX_INLINE_RENDER_WIDTH = 320;

/**
 * Strip \\ line breaks from simple expressions.
 * Complex environments (aligned, matrix, cases) are preserved.
 */
const COMPLEX_ENV_RE = /\\begin\{|\\end\{|\\hline|&/;
const flattenSimpleExpression = (expr: string): string => {
  if (COMPLEX_ENV_RE.test(expr)) return expr;
  return expr.replace(/\s*\\\\\s*/g, ' ');
};

// ── Native Math Renderer (no WebView) ──────────────────────────────
// Handles 90%+ of K-12 math: exponents, multiplication, fractions,
// roots, basic symbols. Falls back to WebView only for complex LaTeX.

/** LaTeX command → Unicode symbol mapping for the native renderer */
const SYMBOL_MAP: Record<string, string> = {
  '\\times': '×', '\\cdot': '·', '\\div': '÷',
  '\\pm': '±', '\\mp': '∓',
  '\\leq': '≤', '\\geq': '≥', '\\neq': '≠',
  '\\approx': '≈', '\\equiv': '≡',
  '\\rightarrow': '→', '\\leftarrow': '←',
  '\\Rightarrow': '⇒', '\\Leftarrow': '⇐', '\\to': '→',
  '\\infty': '∞', '\\pi': 'π',
  '\\alpha': 'α', '\\beta': 'β', '\\gamma': 'γ', '\\delta': 'δ',
  '\\theta': 'θ', '\\sigma': 'σ', '\\omega': 'ω', '\\phi': 'φ',
  '\\lambda': 'λ', '\\mu': 'μ', '\\epsilon': 'ε',
  '\\sqrt': '√', '\\sum': '∑', '\\prod': '∏', '\\int': '∫',
};

/** Unicode superscript digits + common chars */
const SUPERSCRIPT_MAP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
  'n': 'ⁿ', 'x': 'ˣ', 'y': 'ʸ', 'a': 'ᵃ', 'b': 'ᵇ',
  'c': 'ᶜ', 'd': 'ᵈ', 'e': 'ᵉ', 'i': 'ⁱ', 'k': 'ᵏ',
};

/** Unicode subscript digits */
const SUBSCRIPT_MAP: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
  '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
  'a': 'ₐ', 'e': 'ₑ', 'i': 'ᵢ', 'n': 'ₙ', 'x': 'ₓ',
};

const toSuperscript = (s: string): string =>
  [...String(s || '')].map(c => SUPERSCRIPT_MAP[c] ?? c).join('');

const toSubscript = (s: string): string =>
  [...String(s || '')].map(c => SUBSCRIPT_MAP[c] ?? c).join('');

/**
 * True if the expression contains only constructs the native renderer handles:
 * digits, letters, operators, ^, _, {}, \times, \frac, \sqrt, \text, basic symbols.
 */
const NEEDS_WEBVIEW_RE =
  /\\(?:begin|end|matrix|bmatrix|pmatrix|cases|array|align|gathered|overset|underset|stackrel|overbrace|underbrace|cancel|boxed|color|mathbb|mathcal|displaystyle|textstyle)\b/;

function canRenderNatively(expr: string): boolean {
  if (!expr || expr.length > 500) return false;
  return !NEEDS_WEBVIEW_RE.test(expr);
}

/**
 * Extract a brace-delimited group starting at position `pos` (which should
 * point to the opening `{`). Returns the inner content and the position
 * AFTER the closing `}`.
 */
function extractGroup(expr: string, pos: number): { inner: string; end: number } {
  if (expr[pos] !== '{') return { inner: '', end: pos };
  let depth = 1;
  let i = pos + 1;
  while (i < expr.length && depth > 0) {
    if (expr[i] === '{') depth++;
    else if (expr[i] === '}') depth--;
    i++;
  }
  return { inner: expr.slice(pos + 1, i - 1), end: i };
}

/** Parse a ^ or _ argument: either a brace group or a single character */
function parseScriptArg(expr: string, pos: number): { content: string; end: number } {
  if (pos >= expr.length) return { content: '', end: pos };
  if (expr[pos] === '{') {
    const g = extractGroup(expr, pos);
    return { content: g.inner, end: g.end };
  }
  return { content: expr[pos], end: pos + 1 };
}

type MathToken =
  | { type: 'text'; value: string }
  | { type: 'sup'; value: string }
  | { type: 'sub'; value: string }
  | { type: 'frac'; num: string; den: string }
  | { type: 'sqrt'; value: string };

/**
 * Tokenize a LaTeX expression into renderable segments.
 * Handles: \frac{}{}, \sqrt{}, ^{}, _{}, \times, symbols, text.
 */
function tokenize(expr: string): MathToken[] {
  const tokens: MathToken[] = [];
  let i = 0;
  let textBuf = '';

  const flush = () => {
    if (textBuf) { tokens.push({ type: 'text', value: textBuf }); textBuf = ''; }
  };

  while (i < expr.length) {
    const ch = expr[i];

    // Superscript
    if (ch === '^') {
      flush();
      const arg = parseScriptArg(expr, i + 1);
      tokens.push({ type: 'sup', value: arg.content });
      i = arg.end;
      continue;
    }

    // Subscript
    if (ch === '_') {
      flush();
      const arg = parseScriptArg(expr, i + 1);
      tokens.push({ type: 'sub', value: arg.content });
      i = arg.end;
      continue;
    }

    // LaTeX command
    if (ch === '\\') {
      // Fraction
      if (expr.startsWith('\\frac', i)) {
        flush();
        const numArg = extractGroup(expr, i + 5);
        const denArg = extractGroup(expr, numArg.end);
        tokens.push({ type: 'frac', num: numArg.inner, den: denArg.inner });
        i = denArg.end;
        continue;
      }
      // Square root
      if (expr.startsWith('\\sqrt', i)) {
        flush();
        const arg = extractGroup(expr, i + 5);
        tokens.push({ type: 'sqrt', value: arg.inner });
        i = arg.end;
        continue;
      }
      // \text{...}
      if (expr.startsWith('\\text', i)) {
        flush();
        const arg = extractGroup(expr, i + 5);
        tokens.push({ type: 'text', value: arg.inner });
        i = arg.end;
        continue;
      }
      // \left, \right — skip
      if (expr.startsWith('\\left', i) || expr.startsWith('\\right', i)) {
        const cmdEnd = expr.startsWith('\\left', i) ? i + 5 : i + 6;
        // Skip the delimiter char after \left or \right
        i = Math.min(cmdEnd + 1, expr.length);
        continue;
      }
      // Known symbol
      const match = expr.slice(i).match(/^\\[a-zA-Z]+/);
      if (match) {
        const cmd = match[0];
        const sym = SYMBOL_MAP[cmd];
        if (sym) {
          textBuf += sym;
        }
        // Unknown commands (e.g. \mathrm) — skip silently
        i += cmd.length;
        continue;
      }
      // Escape sequences (\, \; \! etc.)
      i += 2;
      continue;
    }

    // Braces — skip (leftover grouping)
    if (ch === '{' || ch === '}') { i++; continue; }

    textBuf += ch;
    i++;
  }
  flush();
  return tokens;
}

/** Render tokenized math as React Native Text elements */
function NativeMathLine({ tokens, fontSize, color }: {
  tokens: MathToken[];
  fontSize: number;
  color: string;
}) {
  return (
    <Text style={{ fontSize, color, lineHeight: fontSize * 1.6 }}>
      {tokens.map((tok, idx) => {
        switch (tok.type) {
          case 'text':
            return <Text key={idx}>{tok.value}</Text>;
          case 'sup':
            return (
              <Text key={idx} style={{ fontSize: fontSize * 0.65, lineHeight: fontSize * 0.9 }}>
                {toSuperscript(tok.value)}
              </Text>
            );
          case 'sub':
            return (
              <Text key={idx} style={{ fontSize: fontSize * 0.65, lineHeight: fontSize * 1.8 }}>
                {toSubscript(tok.value)}
              </Text>
            );
          case 'frac':
            return (
              <View key={idx} style={nativeStyles.fraction}>
                <Text style={[nativeStyles.fracPart, { fontSize: fontSize * 0.85, color }]}>{tok.num}</Text>
                <View style={[nativeStyles.fracLine, { backgroundColor: color }]} />
                <Text style={[nativeStyles.fracPart, { fontSize: fontSize * 0.85, color }]}>{tok.den}</Text>
              </View>
            );
          case 'sqrt':
            return (
              <Text key={idx}>
                <Text style={{ fontSize: fontSize * 1.1 }}>√</Text>
                <Text style={{ textDecorationLine: 'underline' as const }}>{tok.value}</Text>
              </Text>
            );
          default:
            return null;
        }
      })}
    </Text>
  );
}

const nativeStyles = StyleSheet.create({
  fraction: {
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 2,
  },
  fracPart: {
    textAlign: 'center',
  },
  fracLine: {
    height: 1.5,
    width: '100%',
    minWidth: 16,
    marginVertical: 1,
  },
  displayWrap: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  inlineWrap: {
    // inline math should flow with text
  },
});

function buildMathHtml(expression: string, displayMode: boolean): string {
  const escapedExpression = JSON.stringify(expression || '');
  const escapedDisplayMode = displayMode ? 'true' : 'false';
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.25/dist/katex.min.css" />
    <style>
      html, body {
        margin: 0;
        padding: 0;
        background: transparent;
        color: #e2e8f0;
        overflow: visible;
      }
      #math-root {
        box-sizing: border-box;
        padding: ${displayMode ? 8 : 5}px ${displayMode ? 8 : 4}px;
        font-size: 17px;
        line-height: 1.45;
        display: ${displayMode ? 'block' : 'inline-block'};
        width: ${displayMode ? '100%' : 'auto'};
      }
      .katex-display { margin: 0; }
      .katex {
        line-height: 1.45;
      }
      .katex .frac-line {
        border-bottom-width: 0.08em;
      }
    </style>
  </head>
  <body>
    <div id="math-root"></div>
    <script src="https://cdn.jsdelivr.net/npm/katex@0.16.25/dist/katex.min.js"></script>
    <script>
      const expression = ${escapedExpression};
      const displayMode = ${escapedDisplayMode};
      const root = document.getElementById('math-root');

      function postSize() {
        if (!window.ReactNativeWebView || !window.ReactNativeWebView.postMessage || !root) return;
        const rect = root.getBoundingClientRect();
          const payload = {
            type: 'size',
            width: Math.max(24, Math.ceil(rect.width)),
            height: Math.max(displayMode ? 64 : 38, Math.ceil(rect.height)),
          };
          window.ReactNativeWebView.postMessage(JSON.stringify(payload));
        }

      try {
        katex.render(expression, root, { throwOnError: false, displayMode });
      } catch (error) {
        root.textContent = expression;
      }

      requestAnimationFrame(() => {
        postSize();
        setTimeout(postSize, 40);
      });
      window.addEventListener('load', postSize);
      window.addEventListener('resize', postSize);
    </script>
  </body>
</html>`;
}

export const MathRenderer: React.FC<MathRendererProps> = ({ expression, displayMode = true }) => {
  const cleaned = flattenSimpleExpression(String(expression || '').trim());

  // ── Native rendering for simple K-12 math (fast, no WebView) ─────
  const useNative = useMemo(() => canRenderNatively(cleaned), [cleaned]);
  const tokens = useMemo(() => (useNative ? tokenize(cleaned) : []), [useNative, cleaned]);

  const initialSize = useMemo(
    () => ({
      width: displayMode ? 0 : 96,
      height: displayMode ? 78 : 42,
    }),
    [displayMode],
  );
  const [nativeSize, setNativeSize] = useState(initialSize);

  useEffect(() => {
    setNativeSize(initialSize);
  }, [initialSize, cleaned]);

  const handleNativeMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const payload = JSON.parse(event.nativeEvent.data || '{}') as {
        type?: string;
        width?: number;
        height?: number;
      };
      if (payload.type !== 'size') return;

      const width = Math.max(24, Math.round(Number(payload.width || 0)));
      const height = Math.max(displayMode ? 44 : 32, Math.round(Number(payload.height || 0)));
      setNativeSize((prev) => {
        if (!displayMode) {
          const safeWidth = Math.min(width, MAX_INLINE_RENDER_WIDTH);
          if (safeWidth !== prev.width || height !== prev.height) {
            return { width: safeWidth, height };
          }
          return prev;
        }

        if (height !== prev.height) {
          return { ...prev, height };
        }
        return prev;
      });
    } catch {
      // Ignore malformed postMessage payloads
    }
  }, [displayMode]);

  if (!cleaned) return null;

  // ── Native render path (simple expressions) ──────────────────────
  if (useNative && Platform.OS !== 'web') {
    const fontSize = displayMode ? 18 : 15;
    const color = '#e2e8f0';
    return (
      <View style={displayMode ? nativeStyles.displayWrap : nativeStyles.inlineWrap}>
        <NativeMathLine tokens={tokens} fontSize={fontSize} color={color} />
      </View>
    );
  }

  if (Platform.OS === 'web') {
    try {
      const katex = require('react-katex');
      const BlockMath = katex.BlockMath as React.ComponentType<{ math: string }>;
      const InlineMath = katex.InlineMath as React.ComponentType<{ math: string }>;
      return (
        // color cascades to KaTeX's currentColor — ensures math is visible on dark backgrounds
        <View style={{ marginVertical: displayMode ? 8 : 0, color: '#e2e8f0' } as any}>
          {displayMode ? <BlockMath math={cleaned} /> : <InlineMath math={cleaned} />}
        </View>
      );
    } catch {
      return (
        <Text style={{ color: '#cbd5e1', fontFamily: 'monospace' }}>
          {cleaned}
        </Text>
      );
    }
  }

  return (
    <View
      style={{
        marginVertical: displayMode ? 8 : 0,
        borderWidth: displayMode ? 1 : 0,
        borderColor: 'rgba(148,163,184,0.28)',
        borderRadius: displayMode ? 12 : 0,
        overflow: displayMode ? 'hidden' : 'visible',
        minHeight: displayMode ? Math.max(nativeSize.height, 44) : Math.max(nativeSize.height, 32),
        width: displayMode ? '100%' : nativeSize.width,
        alignSelf: displayMode ? 'stretch' : 'flex-start',
      }}
    >
      <WebView
        originWhitelist={['*']}
        source={{ html: buildMathHtml(cleaned, displayMode) }}
        style={{
          backgroundColor: 'transparent',
          height: nativeSize.height,
          width: displayMode ? '100%' : nativeSize.width,
          flex: displayMode ? 1 : 0,
          opacity: 0.9999, // Ensures Android paints first frame correctly.
        }}
        onMessage={handleNativeMessage}
        scrollEnabled={false}
      />
    </View>
  );
};

export default MathRenderer;
