/**
 * Calculator evaluator aligned to the Casio full-model spec.
 * Safe parser/evaluator with no eval() usage.
 */

const PI = Math.PI;
const E = Math.E;

type FunctionToken =
  | 'asin'
  | 'acos'
  | 'atan'
  | 'sinh'
  | 'cosh'
  | 'tanh'
  | 'sqrt'
  | 'cbrt'
  | 'log'
  | 'ln'
  | 'sin'
  | 'cos'
  | 'tan'
  | 'abs'
  | 'exp';

type Token =
  | { type: 'number'; value: number }
  | { type: 'fn'; value: FunctionToken }
  | { type: 'op'; value: '+' | '−' | '×' | '÷' | '^' | '%' }
  | { type: 'unary'; value: '−' }
  | { type: 'post'; value: '!' }
  | { type: 'lp' }
  | { type: 'rp' };

interface ParseContext {
  radians: boolean;
}

function tokenize(raw: string): Token[] {
  const tokens: Token[] = [];
  const source = raw.replace(/\s/g, '');

  let index = 0;
  while (index < source.length) {
    const ch = source[index];

    if (/[0-9.]/.test(ch)) {
      let num = '';
      while (index < source.length && /[0-9.]/.test(source[index])) {
        num += source[index];
        index += 1;
      }
      const parsed = Number.parseFloat(num);
      if (Number.isNaN(parsed)) return [];
      tokens.push({ type: 'number', value: parsed });
      continue;
    }

    const functionMatchers: ReadonlyArray<readonly [string, FunctionToken]> = [
      ['asin', 'asin'],
      ['acos', 'acos'],
      ['atan', 'atan'],
      ['sinh', 'sinh'],
      ['cosh', 'cosh'],
      ['tanh', 'tanh'],
      ['sqrt', 'sqrt'],
      ['cbrt', 'cbrt'],
      ['log', 'log'],
      ['ln', 'ln'],
      ['sin', 'sin'],
      ['cos', 'cos'],
      ['tan', 'tan'],
      ['abs', 'abs'],
      ['exp', 'exp'],
    ];

    let matchedFunction = false;
    for (const [literal, fn] of functionMatchers) {
      const candidate = source.slice(index, index + literal.length);
      const nextChar = source[index + literal.length];
      if (candidate === literal && (nextChar == null || !/[a-z]/i.test(nextChar))) {
        tokens.push({ type: 'fn', value: fn });
        index += literal.length;
        matchedFunction = true;
        break;
      }
    }
    if (matchedFunction) continue;

    if (ch === 'π') {
      tokens.push({ type: 'number', value: PI });
      index += 1;
      continue;
    }

    if (ch === 'e' && (index + 1 >= source.length || !/[a-z0-9]/i.test(source[index + 1]))) {
      tokens.push({ type: 'number', value: E });
      index += 1;
      continue;
    }

    if (ch === '(') {
      tokens.push({ type: 'lp' });
      index += 1;
      continue;
    }

    if (ch === ')') {
      tokens.push({ type: 'rp' });
      index += 1;
      continue;
    }

    if (ch === '+' || ch === '-') {
      tokens.push({ type: 'op', value: ch === '+' ? '+' : '−' });
      index += 1;
      continue;
    }

    if (ch === '−') {
      tokens.push({ type: 'op', value: '−' });
      index += 1;
      continue;
    }

    if (ch === '×' || ch === '*') {
      tokens.push({ type: 'op', value: '×' });
      index += 1;
      continue;
    }

    if (ch === '÷' || ch === '/') {
      tokens.push({ type: 'op', value: '÷' });
      index += 1;
      continue;
    }

    if (ch === '^') {
      tokens.push({ type: 'op', value: '^' });
      index += 1;
      continue;
    }

    if (ch === '%') {
      tokens.push({ type: 'op', value: '%' });
      index += 1;
      continue;
    }

    if (ch === '!') {
      tokens.push({ type: 'post', value: '!' });
      index += 1;
      continue;
    }

    return [];
  }

  return tokens;
}

function insertImplicitMultiplication(tokens: Token[]): Token[] {
  if (tokens.length < 2) return tokens;
  const out: Token[] = [];

  for (let i = 0; i < tokens.length; i += 1) {
    out.push(tokens[i]);
    const current = tokens[i];
    const next = tokens[i + 1];
    if (!next) continue;

    const currentEndsFactor = current.type === 'number' || current.type === 'rp' || current.type === 'post';
    const nextStartsFactor = next.type === 'number' || next.type === 'lp' || next.type === 'fn';
    if (currentEndsFactor && nextStartsFactor) {
      out.push({ type: 'op', value: '×' });
    }
  }

  return out;
}

function normalizeUnary(tokens: Token[]): Token[] {
  const out: Token[] = [];
  let needUnary = true;

  for (const token of tokens) {
    if (needUnary && token.type === 'op' && token.value === '−') {
      out.push({ type: 'unary', value: '−' });
      needUnary = false;
      continue;
    }

    needUnary = token.type === 'op' || token.type === 'lp' || token.type === 'fn';
    out.push(token);
  }

  return out;
}

function factorial(value: number): number {
  if (value < 0 || !Number.isInteger(value)) return Number.NaN;
  if (value <= 1) return 1;
  let acc = 1;
  for (let n = 2; n <= value; n += 1) {
    acc *= n;
  }
  return acc;
}

function parsePrimary(tokens: Token[], pos: { i: number }, ctx: ParseContext): number | null {
  if (pos.i >= tokens.length) return null;
  const token = tokens[pos.i];

  if (token.type === 'number') {
    pos.i += 1;
    return token.value;
  }

  if (token.type === 'unary' && token.value === '−') {
    pos.i += 1;
    const inner = parseUnary(tokens, pos, ctx);
    return inner == null ? null : -inner;
  }

  if (token.type === 'fn') {
    const fn = token.value;
    pos.i += 1;
    if (pos.i >= tokens.length || tokens[pos.i].type !== 'lp') return null;
    pos.i += 1;
    const arg = parseExpression(tokens, pos, ctx);
    if (arg == null) return null;
    if (pos.i >= tokens.length || tokens[pos.i].type !== 'rp') return null;
    pos.i += 1;

    const trigArg = ctx.radians ? arg : (arg * PI) / 180;
    switch (fn) {
      case 'sin':
        return Math.sin(trigArg);
      case 'cos':
        return Math.cos(trigArg);
      case 'tan':
        return Math.tan(trigArg);
      case 'asin':
        return ctx.radians ? Math.asin(arg) : (Math.asin(arg) * 180) / PI;
      case 'acos':
        return ctx.radians ? Math.acos(arg) : (Math.acos(arg) * 180) / PI;
      case 'atan':
        return ctx.radians ? Math.atan(arg) : (Math.atan(arg) * 180) / PI;
      case 'sinh':
        return Math.sinh(arg);
      case 'cosh':
        return Math.cosh(arg);
      case 'tanh':
        return Math.tanh(arg);
      case 'sqrt':
        return arg < 0 ? Number.NaN : Math.sqrt(arg);
      case 'cbrt':
        return Math.cbrt(arg);
      case 'log':
        return Math.log10(arg);
      case 'ln':
        return Math.log(arg);
      case 'abs':
        return Math.abs(arg);
      case 'exp':
        return Math.exp(arg);
      default:
        return null;
    }
  }

  if (token.type === 'lp') {
    pos.i += 1;
    const inner = parseExpression(tokens, pos, ctx);
    if (inner == null) return null;
    if (pos.i >= tokens.length || tokens[pos.i].type !== 'rp') return null;
    pos.i += 1;
    return inner;
  }

  return null;
}

function parseUnary(tokens: Token[], pos: { i: number }, ctx: ParseContext): number | null {
  const token = tokens[pos.i];
  if (token?.type === 'unary' && token.value === '−') {
    pos.i += 1;
    const value = parseUnary(tokens, pos, ctx);
    return value == null ? null : -value;
  }
  return parsePrimary(tokens, pos, ctx);
}

function parsePostfix(tokens: Token[], pos: { i: number }, ctx: ParseContext): number | null {
  let value = parseUnary(tokens, pos, ctx);
  if (value == null) return null;

  while (true) {
    const token = tokens[pos.i];
    if (token?.type !== 'post' || token.value !== '!') break;
    pos.i += 1;
    value = factorial(value);
  }

  return value;
}

function parsePower(tokens: Token[], pos: { i: number }, ctx: ParseContext): number | null {
  let left = parsePostfix(tokens, pos, ctx);
  if (left == null) return null;

  const token = tokens[pos.i];
  if (token?.type === 'op' && token.value === '^') {
    pos.i += 1;
    const right = parseUnary(tokens, pos, ctx);
    if (right == null) return null;
    left = Math.pow(left, right);
  }

  return left;
}

function parseTerm(tokens: Token[], pos: { i: number }, ctx: ParseContext): number | null {
  let left = parsePower(tokens, pos, ctx);
  if (left == null) return null;

  while (pos.i < tokens.length) {
    const token = tokens[pos.i];
    if (token.type !== 'op' || (token.value !== '×' && token.value !== '÷' && token.value !== '%')) break;
    pos.i += 1;
    const right = parsePower(tokens, pos, ctx);
    if (right == null) return null;

    if (token.value === '×') left *= right;
    else if (token.value === '÷') left = right === 0 ? Number.NaN : left / right;
    else left = right === 0 ? Number.NaN : left % right;
  }

  return left;
}

function parseExpression(tokens: Token[], pos: { i: number }, ctx: ParseContext): number | null {
  let left = parseTerm(tokens, pos, ctx);
  if (left == null) return null;

  while (pos.i < tokens.length) {
    const token = tokens[pos.i];
    if (token.type !== 'op' || (token.value !== '+' && token.value !== '−')) break;
    pos.i += 1;
    const right = parseTerm(tokens, pos, ctx);
    if (right == null) return null;
    left = token.value === '+' ? left + right : left - right;
  }

  return left;
}

export function evaluateExpression(expr: string, radians = true): number | null {
  const normalized = expr
    .replace(/\s/g, '')
    .replace(/√\(/g, 'sqrt(')
    .replace(/∛\(/g, 'cbrt(')
    .replace(/√/g, 'sqrt')
    .replace(/∛/g, 'cbrt');

  let tokens = tokenize(normalized);
  if (tokens.length === 0 && expr.trim().length > 0) return null;

  tokens = insertImplicitMultiplication(tokens);
  tokens = normalizeUnary(tokens);

  const pos = { i: 0 };
  const result = parseExpression(tokens, pos, { radians });
  if (result == null || pos.i !== tokens.length) return null;
  if (Number.isNaN(result) || !Number.isFinite(result)) return null;
  return result;
}

export function formatResult(value: number): string {
  if (value === 0) return '0';
  if (value % 1 === 0 && Math.abs(value) < 1e15) return String(value);
  if (Math.abs(value) < 1e-6 || Math.abs(value) >= 1e15) return value.toExponential(6);

  const fixed = Number.parseFloat(value.toFixed(10)).toString();
  return fixed === '-0' ? '0' : fixed;
}
