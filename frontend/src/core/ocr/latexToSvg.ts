/**
 * Offline sanitized TeX / LaTeX -> SVG mathematical layout renderer.
 *
 * Produces deterministic, self-contained W3C <svg> elements using explicit
 * box-model typography (fractions, radicals, super/subscripts, big operators,
 * matrices, accents, and Greek/math Unicode glyphs). Every interpolated text or
 * attribute value is XML-escaped and verified against a strict SVG allowlist so
 * hostile LaTeX inputs cannot inject scripts or event handlers.
 */

export interface RenderLatexSvgOptions {
  /** Base font size in SVG user units (default 18px, >= 14px for crisp readability). */
  fontSize?: number;
  /** Padding around the bounding box in SVG user units (default 6px). */
  padding?: number;
  /** Foreground color (default 'currentColor'). */
  color?: string;
}

const SYMBOL_MAP: Record<string, string> = {
  // Lowercase Greek
  alpha: '\u03B1',
  beta: '\u03B2',
  gamma: '\u03B3',
  delta: '\u03B4',
  epsilon: '\u03F5',
  varepsilon: '\u03B5',
  zeta: '\u03B6',
  eta: '\u03B7',
  theta: '\u03B8',
  vartheta: '\u03D1',
  iota: '\u03B9',
  kappa: '\u03BA',
  lambda: '\u03BB',
  mu: '\u03BC',
  nu: '\u03BD',
  xi: '\u03BE',
  pi: '\u03C0',
  varpi: '\u03D6',
  rho: '\u03C1',
  varrho: '\u03F1',
  sigma: '\u03C3',
  varsigma: '\u03C2',
  tau: '\u03C4',
  upsilon: '\u03C5',
  phi: '\u03D5',
  varphi: '\u03C6',
  chi: '\u03C7',
  psi: '\u03C8',
  omega: '\u03C9',
  // Uppercase Greek
  Gamma: '\u0393',
  Delta: '\u0394',
  Theta: '\u0398',
  Lambda: '\u039B',
  Xi: '\u039E',
  Pi: '\u03A0',
  Sigma: '\u03A3',
  Upsilon: '\u03A5',
  Phi: '\u03A6',
  Psi: '\u03A8',
  Omega: '\u03A9',
  // Operators & relations
  pm: '\u00B1',
  mp: '\u2213',
  times: '\u00D7',
  div: '\u00F7',
  cdot: '\u22C5',
  ast: '\u2217',
  star: '\u22C6',
  circ: '\u2218',
  bullet: '\u2022',
  leq: '\u2264',
  le: '\u2264',
  geq: '\u2265',
  ge: '\u2265',
  neq: '\u2260',
  ne: '\u2260',
  approx: '\u2248',
  equiv: '\u2261',
  sim: '\u223C',
  simeq: '\u2243',
  cong: '\u2245',
  propto: '\u221D',
  ll: '\u226A',
  gg: '\u226B',
  in: '\u2208',
  notin: '\u2209',
  ni: '\u220B',
  subset: '\u2282',
  subseteq: '\u2286',
  supset: '\u2283',
  supseteq: '\u2287',
  cup: '\u222A',
  cap: '\u2229',
  setminus: '\u2216',
  emptyset: '\u2205',
  varnothing: '\u2205',
  infty: '\u221E',
  partial: '\u2202',
  nabla: '\u2207',
  forall: '\u2200',
  exists: '\u2203',
  nexists: '\u2204',
  neg: '\u00AC',
  lnot: '\u00AC',
  wedge: '\u2227',
  land: '\u2227',
  vee: '\u2228',
  lor: '\u2228',
  oplus: '\u2295',
  otimes: '\u2297',
  perp: '\u22A5',
  parallel: '\u2225',
  angle: '\u2220',
  therefore: '\u2234',
  because: '\u2235',
  degree: '\u00B0',
  prime: '\u2032',
  hbar: '\u210F',
  ell: '\u2113',
  Re: '\u211C',
  Im: '\u2111',
  aleph: '\u2135',
  // Arrows
  rightarrow: '\u2192',
  to: '\u2192',
  leftarrow: '\u2190',
  gets: '\u2190',
  leftrightarrow: '\u2194',
  Rightarrow: '\u21D2',
  implies: '\u21D2',
  Leftarrow: '\u21D0',
  Leftrightarrow: '\u21D4',
  iff: '\u21D4',
  mapsto: '\u21A6',
  uparrow: '\u2191',
  downarrow: '\u2193',
  // Dots & braces
  ldots: '\u2026',
  cdots: '\u22EF',
  vdots: '\u22EE',
  ddots: '\u22F1',
  dots: '\u2026',
  langle: '\u27E8',
  rangle: '\u27E9',
  lceil: '\u2308',
  rceil: '\u2309',
  lfloor: '\u230A',
  rfloor: '\u230B',
  mid: '\u2223',
};

const BLACKBOARD_MAP: Record<string, string> = {
  N: '\u2115',
  Z: '\u2124',
  Q: '\u211A',
  R: '\u211D',
  C: '\u2102',
  H: '\u210D',
  P: '\u2119',
  E: '\uD835\uDD3C',
};

const BIG_OPERATORS: Record<string, { glyph: string; displayLimits: boolean }> = {
  sum: { glyph: '\u2211', displayLimits: true },
  prod: { glyph: '\u220F', displayLimits: true },
  coprod: { glyph: '\u2210', displayLimits: true },
  bigcup: { glyph: '\u22C3', displayLimits: true },
  bigcap: { glyph: '\u22C2', displayLimits: true },
  bigoplus: { glyph: '\u2A01', displayLimits: true },
  bigotimes: { glyph: '\u2A02', displayLimits: true },
  int: { glyph: '\u222B', displayLimits: false },
  iint: { glyph: '\u222C', displayLimits: false },
  iiint: { glyph: '\u222D', displayLimits: false },
  oint: { glyph: '\u222E', displayLimits: false },
  lim: { glyph: 'lim', displayLimits: true },
  limsup: { glyph: 'lim sup', displayLimits: true },
  liminf: { glyph: 'lim inf', displayLimits: true },
  max: { glyph: 'max', displayLimits: true },
  min: { glyph: 'min', displayLimits: true },
  sup: { glyph: 'sup', displayLimits: true },
  inf: { glyph: 'inf', displayLimits: true },
};

const ROMAN_FUNCTIONS = new Set([
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc',
  'arcsin', 'arccos', 'arctan',
  'sinh', 'cosh', 'tanh',
  'log', 'ln', 'lg', 'exp',
  'det', 'dim', 'ker', 'deg', 'gcd', 'lcm', 'arg', 'mod', 'Pr',
]);

const BINARY_OPERATORS = new Set([
  '+', '-', '=', '<', '>', '\u00B1', '\u2213', '\u00D7', '\u00F7', '\u22C5',
  '\u2264', '\u2265', '\u2260', '\u2248', '\u2261', '\u223C', '\u2243', '\u2245',
  '\u221D', '\u2208', '\u2209', '\u2282', '\u2286', '\u2283', '\u2287', '\u222A',
  '\u2229', '\u2192', '\u2190', '\u2194', '\u21D2', '\u21D0', '\u21D4', '\u21A6',
  '\u2227', '\u2228', '\u2295', '\u2297',
]);

type AccentKind = 'hat' | 'bar' | 'vec' | 'tilde' | 'dot' | 'ddot' | 'overline' | 'underline';

type MathNode =
  | { kind: 'row'; items: MathNode[] }
  | { kind: 'text'; value: string; variant: 'italic' | 'roman' | 'bold' | 'op' | 'punct' }
  | { kind: 'space'; em: number }
  | { kind: 'frac'; num: MathNode; den: MathNode }
  | { kind: 'sqrt'; radicand: MathNode; degree?: MathNode }
  | { kind: 'script'; base: MathNode; sub?: MathNode; sup?: MathNode }
  | { kind: 'bigop'; op: string; displayLimits: boolean; sub?: MathNode; sup?: MathNode }
  | { kind: 'accent'; accent: AccentKind; body: MathNode }
  | { kind: 'delim'; left: string; right: string; body: MathNode }
  | { kind: 'matrix'; env: string; rows: MathNode[][] };

interface BoxMetrics {
  width: number;
  ascent: number;
  descent: number;
  render: (x: number, baselineY: number) => string[];
}

export function escapeXml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const ALLOWED_SVG_TAGS = new Set(['svg', 'g', 'text', 'line', 'path', 'rect']);
const DANGEROUS_ATTR_NAME_RE = /^(on[a-z]+|href|xlink:href|src|style|xmlns:xlink)$/i;
const ATTR_PAIR_RE = /([a-zA-Z0-9:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
const RAW_TAG_RE = /<\/?([a-zA-Z0-9:-]+)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;

/**
 * Verifies generated SVG markup only contains safe geometric SVG tags and has
 * no event handlers, script elements, HTML embeds, or external URLs.
 */
export function sanitizeMathSvg(svg: string): string {
  // Check raw unescaped tags (ignores XML-escaped &lt;script&gt; in text nodes)
  RAW_TAG_RE.lastIndex = 0;
  let tagMatch: RegExpExecArray | null;
  let sawSvgRoot = false;
  while ((tagMatch = RAW_TAG_RE.exec(svg)) !== null) {
    const tagName = tagMatch[1]!.toLowerCase();
    if (!ALLOWED_SVG_TAGS.has(tagName)) {
      return buildFallbackTextSvg('Formula unavailable');
    }
    if (tagName === 'svg') {
      sawSvgRoot = true;
    }
    const attrBlob = tagMatch[2] ?? '';
    ATTR_PAIR_RE.lastIndex = 0;
    let attrMatch: RegExpExecArray | null;
    while ((attrMatch = ATTR_PAIR_RE.exec(attrBlob)) !== null) {
      const attrName = attrMatch[1]!;
      const attrVal = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? '';
      if (DANGEROUS_ATTR_NAME_RE.test(attrName)) {
        return buildFallbackTextSvg('Formula unavailable');
      }
      if (attrName.toLowerCase() !== 'aria-label' && /javascript:/i.test(attrVal)) {
        return buildFallbackTextSvg('Formula unavailable');
      }
    }
  }
  return sawSvgRoot ? svg : buildFallbackTextSvg('Formula unavailable');
}

function buildFallbackTextSvg(label: string): string {
  const safe = escapeXml(label);
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${safe}" viewBox="0 0 180 30" width="180" height="30"><text x="6" y="21" font-size="15" font-family="Cambria Math, STIX Two Math, Times New Roman, serif" fill="currentColor">${safe}</text></svg>`;
}

function stripMathDelimiters(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('$$') && trimmed.endsWith('$$') && trimmed.length >= 4) {
    return trimmed.slice(2, -2).trim();
  }
  if (trimmed.startsWith('$') && trimmed.endsWith('$') && trimmed.length >= 2) {
    return trimmed.slice(1, -1).trim();
  }
  if (trimmed.startsWith('\\(') && trimmed.endsWith('\\)') && trimmed.length >= 4) {
    return trimmed.slice(2, -2).trim();
  }
  if (trimmed.startsWith('\\[') && trimmed.endsWith('\\]') && trimmed.length >= 4) {
    return trimmed.slice(2, -2).trim();
  }
  return trimmed;
}

class LatexParser {
  private pos = 0;
  private readonly src: string;

  constructor(src: string) {
    this.src = src;
  }

  parse(): MathNode {
    return this.parseSequence([]);
  }

  private skipWs(): void {
    while (this.pos < this.src.length && /\s/.test(this.src[this.pos]!)) {
      this.pos += 1;
    }
  }

  private peek(): string | undefined {
    return this.src[this.pos];
  }

  private parseSequence(stopTokens: string[]): MathNode {
    const items: MathNode[] = [];
    while (this.pos < this.src.length) {
      this.skipWs();
      if (this.pos >= this.src.length) break;

      if (stopTokens.some((tok) => this.src.startsWith(tok, this.pos))) {
        break;
      }

      const node = this.parseScriptedAtom();
      if (node) {
        items.push(node);
      } else {
        this.pos += 1;
      }
    }
    return items.length === 1 ? items[0]! : { kind: 'row', items };
  }

  private parseScriptedAtom(): MathNode | null {
    const base = this.parseAtom();
    if (!base) return null;

    let sub: MathNode | undefined;
    let sup: MathNode | undefined;

    while (this.pos < this.src.length) {
      this.skipWs();
      const ch = this.peek();
      if (ch === '_' && !sub) {
        this.pos += 1;
        sub = this.parseRequiredGroupOrAtom();
      } else if (ch === '^' && !sup) {
        this.pos += 1;
        sup = this.parseRequiredGroupOrAtom();
      } else if (ch === "'") {
        let count = 0;
        while (this.peek() === "'") {
          count += 1;
          this.pos += 1;
        }
        const primeNode: MathNode = {
          kind: 'text',
          value: '\u2032'.repeat(count),
          variant: 'punct',
        };
        sup = sup ? { kind: 'row', items: [sup, primeNode] } : primeNode;
      } else {
        break;
      }
    }

    if (base.kind === 'bigop') {
      return {
        ...base,
        sub: sub ?? base.sub,
        sup: sup ?? base.sup,
      };
    }

    if (sub || sup) {
      return { kind: 'script', base, sub, sup };
    }
    return base;
  }

  private parseRequiredGroupOrAtom(): MathNode {
    this.skipWs();
    if (this.peek() === '{') {
      this.pos += 1;
      const body = this.parseSequence(['}']);
      if (this.peek() === '}') this.pos += 1;
      return body;
    }
    return this.parseAtom() ?? { kind: 'row', items: [] };
  }

  private parseOptionalBracket(): MathNode | undefined {
    this.skipWs();
    if (this.peek() !== '[') return undefined;
    this.pos += 1;
    const node = this.parseSequence([']']);
    if (this.peek() === ']') this.pos += 1;
    return node;
  }

  private parseRawBraceText(): string {
    this.skipWs();
    if (this.peek() !== '{') return '';
    this.pos += 1;
    let depth = 1;
    let out = '';
    while (this.pos < this.src.length && depth > 0) {
      const ch = this.src[this.pos]!;
      this.pos += 1;
      if (ch === '{') {
        depth += 1;
        out += ch;
      } else if (ch === '}') {
        depth -= 1;
        if (depth > 0) out += ch;
      } else {
        out += ch;
      }
    }
    return out;
  }

  private parseDelimToken(): string {
    this.skipWs();
    if (this.pos >= this.src.length) return '';
    const ch = this.src[this.pos]!;
    if (ch === '\\') {
      this.pos += 1;
      if (this.pos < this.src.length && !/[a-zA-Z]/.test(this.src[this.pos]!)) {
        const escaped = this.src[this.pos]!;
        this.pos += 1;
        return escaped === '|' ? '\u2016' : escaped;
      }
      const cmd = this.readCommandName();
      return SYMBOL_MAP[cmd] ?? cmd;
    }
    this.pos += 1;
    return ch === '.' ? '' : ch;
  }

  private readCommandName(): string {
    const start = this.pos;
    while (this.pos < this.src.length && /[a-zA-Z]/.test(this.src[this.pos]!)) {
      this.pos += 1;
    }
    return this.src.slice(start, this.pos);
  }

  private parseAtom(): MathNode | null {
    this.skipWs();
    if (this.pos >= this.src.length) return null;
    const ch = this.src[this.pos]!;

    if (ch === '{') {
      this.pos += 1;
      const inner = this.parseSequence(['}']);
      if (this.peek() === '}') this.pos += 1;
      return inner;
    }

    if (ch === '}') {
      return null;
    }

    if (ch === '\\') {
      this.pos += 1;
      if (this.pos >= this.src.length) return null;
      const next = this.src[this.pos]!;

      if (!/[a-zA-Z]/.test(next)) {
        this.pos += 1;
        if (next === ',' || next === ':' || next === ';') {
          return { kind: 'space', em: next === ',' ? 0.17 : next === ':' ? 0.22 : 0.28 };
        }
        if (next === '!' || next === ' ') {
          return { kind: 'space', em: next === '!' ? 0 : 0.25 };
        }
        if (next === '|') return { kind: 'text', value: '\u2016', variant: 'punct' };
        return { kind: 'text', value: next, variant: 'punct' };
      }

      const cmd = this.readCommandName();
      return this.resolveCommand(cmd);
    }

    // Number literal
    if (/[0-9]/.test(ch)) {
      const start = this.pos;
      while (this.pos < this.src.length && /[0-9.]/.test(this.src[this.pos]!)) {
        this.pos += 1;
      }
      return { kind: 'text', value: this.src.slice(start, this.pos), variant: 'roman' };
    }

    // Single Latin variable letter -> italic math glyph
    if (/[a-zA-Z]/.test(ch)) {
      this.pos += 1;
      return { kind: 'text', value: ch, variant: 'italic' };
    }

    // Punctuation or operator symbol
    this.pos += 1;
    const normalized = ch === '-' ? '\u2212' : ch;
    return {
      kind: 'text',
      value: normalized,
      variant: BINARY_OPERATORS.has(ch) || BINARY_OPERATORS.has(normalized) ? 'op' : 'punct',
    };
  }

  private resolveCommand(cmd: string): MathNode {
    if (cmd === 'frac' || cmd === 'dfrac' || cmd === 'tfrac') {
      const num = this.parseRequiredGroupOrAtom();
      const den = this.parseRequiredGroupOrAtom();
      return { kind: 'frac', num, den };
    }

    if (cmd === 'sqrt') {
      const degree = this.parseOptionalBracket();
      const radicand = this.parseRequiredGroupOrAtom();
      return { kind: 'sqrt', radicand, degree };
    }

    if (cmd === 'quad' || cmd === 'qquad') {
      return { kind: 'space', em: cmd === 'quad' ? 0.75 : 1.4 };
    }

    if (cmd === 'text' || cmd === 'mathrm' || cmd === 'operatorname' || cmd === 'mbox') {
      const rawText = this.parseRawBraceText();
      return { kind: 'text', value: rawText || '', variant: 'roman' };
    }

    if (cmd === 'mathbf' || cmd === 'boldsymbol' || cmd === 'bm') {
      const rawText = this.parseRawBraceText();
      if (rawText) {
        return { kind: 'text', value: rawText, variant: 'bold' };
      }
      return this.parseRequiredGroupOrAtom();
    }

    if (cmd === 'mathbb') {
      const rawText = this.parseRawBraceText().trim();
      const mapped = Array.from(rawText)
        .map((c) => BLACKBOARD_MAP[c] ?? c)
        .join('');
      return { kind: 'text', value: mapped, variant: 'bold' };
    }

    if (cmd === 'mathcal' || cmd === 'mathit') {
      const rawText = this.parseRawBraceText();
      return { kind: 'text', value: rawText, variant: 'italic' };
    }

    if (cmd === 'hat' || cmd === 'bar' || cmd === 'vec' || cmd === 'tilde' || cmd === 'dot' || cmd === 'ddot' || cmd === 'overline' || cmd === 'underline') {
      return { kind: 'accent', accent: cmd, body: this.parseRequiredGroupOrAtom() };
    }

    if (cmd === 'left') {
      const left = this.parseDelimToken();
      const body = this.parseSequence(['\\right']);
      let right = '';
      if (this.src.startsWith('\\right', this.pos)) {
        this.pos += '\\right'.length;
        right = this.parseDelimToken();
      }
      return { kind: 'delim', left, right, body };
    }

    if (cmd === 'begin') {
      const env = this.parseRawBraceText().trim();
      const endToken = `\\end{${env}}`;
      const rows: MathNode[][] = [];
      let currentRow: MathNode[] = [];

      while (this.pos < this.src.length) {
        this.skipWs();
        if (this.src.startsWith(endToken, this.pos)) {
          this.pos += endToken.length;
          break;
        }
        const cell = this.parseSequence(['&', '\\\\', endToken]);
        currentRow.push(cell);
        this.skipWs();
        if (this.peek() === '&') {
          this.pos += 1;
        } else if (this.src.startsWith('\\\\', this.pos)) {
          this.pos += 2;
          rows.push(currentRow);
          currentRow = [];
        } else if (this.src.startsWith(endToken, this.pos)) {
          this.pos += endToken.length;
          break;
        }
      }
      if (currentRow.length > 0) {
        rows.push(currentRow);
      }
      return { kind: 'matrix', env, rows };
    }

    if (cmd in BIG_OPERATORS) {
      const info = BIG_OPERATORS[cmd]!;
      return { kind: 'bigop', op: info.glyph, displayLimits: info.displayLimits };
    }

    if (ROMAN_FUNCTIONS.has(cmd)) {
      return { kind: 'text', value: cmd, variant: 'roman' };
    }

    if (cmd in SYMBOL_MAP) {
      const sym = SYMBOL_MAP[cmd]!;
      return {
        kind: 'text',
        value: sym,
        variant: BINARY_OPERATORS.has(sym) ? 'op' : 'roman',
      };
    }

    // Unrecognized macro name -> preserve visibly as escaped roman token
    return { kind: 'text', value: cmd, variant: 'roman' };
  }
}

function estimateCharWidth(ch: string, fontSize: number, variant: string): number {
  if (ch === ' ') return fontSize * 0.28;
  if ('iljtfr1|.,:;!\'()`.'.includes(ch)) return fontSize * 0.36;
  if ('mwWM\u2211\u220F\u222B\u221E\u2261\u2248'.includes(ch)) return fontSize * 0.82;
  if (variant === 'bold') return fontSize * 0.64;
  return fontSize * 0.58;
}

function estimateTextWidth(value: string, fontSize: number, variant: string): number {
  let total = 0;
  for (const ch of Array.from(value)) {
    total += estimateCharWidth(ch, fontSize, variant);
  }
  return Math.max(total, value.length > 0 ? fontSize * 0.35 : 0);
}

function layoutNode(node: MathNode, fontSize: number): BoxMetrics {
  switch (node.kind) {
    case 'space': {
      return {
        width: fontSize * node.em,
        ascent: fontSize * 0.7,
        descent: fontSize * 0.2,
        render: () => [],
      };
    }

    case 'text': {
      const extraMargin = node.variant === 'op' ? fontSize * 0.28 : 0;
      const coreWidth = estimateTextWidth(node.value, fontSize, node.variant);
      const width = coreWidth + extraMargin * 2;
      const ascent = fontSize * 0.78;
      const descent = fontSize * 0.24;
      const fontStyleAttr = node.variant === 'italic' ? ' font-style="italic"' : '';
      const fontWeightAttr = node.variant === 'bold' ? ' font-weight="700"' : '';
      const escaped = escapeXml(node.value);

      return {
        width,
        ascent,
        descent,
        render: (x, baselineY) => {
          if (!escaped) return [];
          const drawX = (x + extraMargin).toFixed(2);
          const drawY = baselineY.toFixed(2);
          return [
            `<text x="${drawX}" y="${drawY}" font-size="${fontSize.toFixed(2)}" font-family="Cambria Math, STIX Two Math, Times New Roman, serif"${fontStyleAttr}${fontWeightAttr} fill="currentColor">${escaped}</text>`,
          ];
        },
      };
    }

    case 'row': {
      if (node.items.length === 0) {
        return { width: fontSize * 0.25, ascent: fontSize * 0.72, descent: fontSize * 0.22, render: () => [] };
      }
      const gap = fontSize * 0.08;
      const children = node.items.map((item) => layoutNode(item, fontSize));
      const width =
        children.reduce((sum, child) => sum + child.width, 0) +
        gap * Math.max(0, children.length - 1);
      const ascent = children.reduce((max, c) => Math.max(max, c.ascent), fontSize * 0.72);
      const descent = children.reduce((max, c) => Math.max(max, c.descent), fontSize * 0.22);

      return {
        width,
        ascent,
        descent,
        render: (x, baselineY) => {
          const out: string[] = [];
          let cursorX = x;
          for (const child of children) {
            out.push(...child.render(cursorX, baselineY));
            cursorX += child.width + gap;
          }
          return out;
        },
      };
    }

    case 'frac': {
      const childFont = Math.max(10, fontSize * 0.84);
      const numBox = layoutNode(node.num, childFont);
      const denBox = layoutNode(node.den, childFont);
      const padX = Math.max(4, fontSize * 0.24);
      const width = Math.max(numBox.width, denBox.width) + padX * 2;
      const axisOffset = fontSize * 0.3;
      const ruleGap = Math.max(3, fontSize * 0.18);
      const numHeight = numBox.ascent + numBox.descent;
      const denHeight = denBox.ascent + denBox.descent;
      const ascent = axisOffset + ruleGap + numHeight;
      const descent = Math.max(fontSize * 0.24, ruleGap + denHeight - axisOffset);
      const strokeW = Math.max(1.1, fontSize * 0.065);

      return {
        width,
        ascent,
        descent,
        render: (x, baselineY) => {
          const barY = baselineY - axisOffset;
          const numBaseline = barY - ruleGap - numBox.descent;
          const denBaseline = barY + ruleGap + denBox.ascent;
          const numX = x + (width - numBox.width) / 2;
          const denX = x + (width - denBox.width) / 2;

          return [
            ...numBox.render(numX, numBaseline),
            `<line x1="${(x + 1).toFixed(2)}" y1="${barY.toFixed(2)}" x2="${(x + width - 1).toFixed(2)}" y2="${barY.toFixed(2)}" stroke="currentColor" stroke-width="${strokeW.toFixed(2)}" stroke-linecap="round" />`,
            ...denBox.render(denX, denBaseline),
          ];
        },
      };
    }

    case 'sqrt': {
      const inner = layoutNode(node.radicand, fontSize);
      const degBox = node.degree ? layoutNode(node.degree, Math.max(9, fontSize * 0.62)) : null;
      const hookW = Math.max(11, fontSize * 0.65);
      const degLead = degBox ? Math.max(0, degBox.width - hookW * 0.35) : 0;
      const rightPad = Math.max(3, fontSize * 0.15);
      const topClearance = Math.max(4, fontSize * 0.22);
      const width = degLead + hookW + inner.width + rightPad;
      const ascent = Math.max(inner.ascent + topClearance, degBox ? degBox.ascent + degBox.descent + fontSize * 0.48 : 0);
      const descent = inner.descent + 1;
      const strokeW = Math.max(1.25, fontSize * 0.07);

      return {
        width,
        ascent,
        descent,
        render: (x, baselineY) => {
          const topY = baselineY - inner.ascent - topClearance * 0.72;
          const bottomY = baselineY + inner.descent;
          const bodyX = x + degLead + hookW;
          const midY = baselineY - inner.ascent * 0.32;
          const hookLeft = x + degLead;
          const pathD = [
            `M${hookLeft.toFixed(2)},${midY.toFixed(2)}`,
            `L${(hookLeft + hookW * 0.25).toFixed(2)},${midY.toFixed(2)}`,
            `L${(hookLeft + hookW * 0.56).toFixed(2)},${bottomY.toFixed(2)}`,
            `L${bodyX.toFixed(2)},${topY.toFixed(2)}`,
            `L${(bodyX + inner.width + rightPad * 0.6).toFixed(2)},${topY.toFixed(2)}`,
          ].join(' ');

          const elements = [
            `<path d="${pathD}" fill="none" stroke="currentColor" stroke-width="${strokeW.toFixed(2)}" stroke-linejoin="round" stroke-linecap="round" />`,
            ...inner.render(bodyX + 1.5, baselineY),
          ];

          if (degBox) {
            const degX = x + 1;
            const degBaseline = midY - degBox.descent - 2;
            elements.push(...degBox.render(degX, degBaseline));
          }

          return elements;
        },
      };
    }

    case 'script': {
      const base = layoutNode(node.base, fontSize);
      const scriptFont = Math.max(9.5, fontSize * 0.68);
      const subBox = node.sub ? layoutNode(node.sub, scriptFont) : null;
      const supBox = node.sup ? layoutNode(node.sup, scriptFont) : null;

      const supShift = supBox ? Math.max(fontSize * 0.42, base.ascent * 0.55) : 0;
      const subShift = subBox ? Math.max(fontSize * 0.24, base.descent * 0.45 + scriptFont * 0.25) : 0;
      const scriptWidth = Math.max(subBox?.width ?? 0, supBox?.width ?? 0);
      const gap = scriptWidth > 0 ? Math.max(1, fontSize * 0.05) : 0;

      const width = base.width + gap + scriptWidth;
      const ascent = Math.max(base.ascent, supBox ? supShift + supBox.ascent : 0);
      const descent = Math.max(base.descent, subBox ? subShift + subBox.descent : 0);

      return {
        width,
        ascent,
        descent,
        render: (x, baselineY) => {
          const out = [...base.render(x, baselineY)];
          const scriptX = x + base.width + gap;
          if (supBox) {
            out.push(...supBox.render(scriptX, baselineY - supShift));
          }
          if (subBox) {
            out.push(...subBox.render(scriptX, baselineY + subShift));
          }
          return out;
        },
      };
    }

    case 'bigop': {
      const isWordOp = /^[a-zA-Z ]+$/.test(node.op);
      const opFont = isWordOp ? fontSize : fontSize * 1.38;
      const opWidth = estimateTextWidth(node.op, opFont, 'roman');
      const opAscent = opFont * 0.74;
      const opDescent = opFont * 0.26;
      const limitFont = Math.max(9.5, fontSize * 0.68);
      const subBox = node.sub ? layoutNode(node.sub, limitFont) : null;
      const supBox = node.sup ? layoutNode(node.sup, limitFont) : null;
      const safeOp = escapeXml(node.op);

      if (node.displayLimits && (subBox || supBox)) {
        const width = Math.max(opWidth, subBox?.width ?? 0, supBox?.width ?? 0) + fontSize * 0.16;
        const limitGap = Math.max(2, fontSize * 0.12);
        const supHeight = supBox ? supBox.ascent + supBox.descent + limitGap : 0;
        const subHeight = subBox ? subBox.ascent + subBox.descent + limitGap : 0;
        const ascent = opAscent + supHeight;
        const descent = opDescent + subHeight;

        return {
          width,
          ascent,
          descent,
          render: (x, baselineY) => {
            const opX = x + (width - opWidth) / 2;
            const out = [
              `<text x="${opX.toFixed(2)}" y="${baselineY.toFixed(2)}" font-size="${opFont.toFixed(2)}" font-family="Cambria Math, STIX Two Math, Times New Roman, serif" fill="currentColor">${safeOp}</text>`,
            ];
            if (supBox) {
              const supBaseline = baselineY - opAscent - limitGap - supBox.descent;
              out.push(...supBox.render(x + (width - supBox.width) / 2, supBaseline));
            }
            if (subBox) {
              const subBaseline = baselineY + opDescent + limitGap + subBox.ascent;
              out.push(...subBox.render(x + (width - subBox.width) / 2, subBaseline));
            }
            return out;
          },
        };
      }

      const scriptWidth = Math.max(subBox?.width ?? 0, supBox?.width ?? 0);
      const width = opWidth + (scriptWidth > 0 ? scriptWidth + 2 : 0) + fontSize * 0.12;
      const supShift = supBox ? opAscent * 0.55 : 0;
      const subShift = subBox ? opDescent + limitFont * 0.35 : 0;
      const ascent = Math.max(opAscent, supBox ? supShift + supBox.ascent : 0);
      const descent = Math.max(opDescent, subBox ? subShift + subBox.descent : 0);

      return {
        width,
        ascent,
        descent,
        render: (x, baselineY) => {
          const out = [
            `<text x="${x.toFixed(2)}" y="${baselineY.toFixed(2)}" font-size="${opFont.toFixed(2)}" font-family="Cambria Math, STIX Two Math, Times New Roman, serif" fill="currentColor">${safeOp}</text>`,
          ];
          const scriptX = x + opWidth + 2;
          if (supBox) out.push(...supBox.render(scriptX, baselineY - supShift));
          if (subBox) out.push(...subBox.render(scriptX, baselineY + subShift));
          return out;
        },
      };
    }

    case 'accent': {
      const body = layoutNode(node.body, fontSize);
      const padAbove = node.accent === 'underline' ? 0 : fontSize * 0.32;
      const padBelow = node.accent === 'underline' ? fontSize * 0.24 : 0;
      const strokeW = Math.max(1.1, fontSize * 0.06);

      return {
        width: body.width,
        ascent: body.ascent + padAbove,
        descent: body.descent + padBelow,
        render: (x, baselineY) => {
          const out = [...body.render(x, baselineY)];
          const yTop = baselineY - body.ascent - fontSize * 0.12;
          const xMid = x + body.width / 2;

          if (node.accent === 'overline' || node.accent === 'bar') {
            out.push(`<line x1="${x.toFixed(2)}" y1="${yTop.toFixed(2)}" x2="${(x + body.width).toFixed(2)}" y2="${yTop.toFixed(2)}" stroke="currentColor" stroke-width="${strokeW.toFixed(2)}" />`);
          } else if (node.accent === 'underline') {
            const yBot = baselineY + body.descent + fontSize * 0.12;
            out.push(`<line x1="${x.toFixed(2)}" y1="${yBot.toFixed(2)}" x2="${(x + body.width).toFixed(2)}" y2="${yBot.toFixed(2)}" stroke="currentColor" stroke-width="${strokeW.toFixed(2)}" />`);
          } else if (node.accent === 'hat') {
            const w = Math.min(body.width * 0.7, fontSize * 0.42);
            out.push(`<path d="M${(xMid - w / 2).toFixed(2)},${(yTop + 2).toFixed(2)} L${xMid.toFixed(2)},${(yTop - 3).toFixed(2)} L${(xMid + w / 2).toFixed(2)},${(yTop + 2).toFixed(2)}" fill="none" stroke="currentColor" stroke-width="${strokeW.toFixed(2)}" stroke-linecap="round" stroke-linejoin="round" />`);
          } else if (node.accent === 'vec') {
            const x1 = x + 1;
            const x2 = x + Math.max(body.width - 1, 6);
            out.push(`<path d="M${x1.toFixed(2)},${yTop.toFixed(2)} L${x2.toFixed(2)},${yTop.toFixed(2)} M${(x2 - 3.5).toFixed(2)},${(yTop - 2.5).toFixed(2)} L${x2.toFixed(2)},${yTop.toFixed(2)} L${(x2 - 3.5).toFixed(2)},${(yTop + 2.5).toFixed(2)}" fill="none" stroke="currentColor" stroke-width="${strokeW.toFixed(2)}" stroke-linecap="round" />`);
          } else if (node.accent === 'tilde') {
            const w = Math.max(fontSize * 0.38, body.width * 0.6);
            const sx = xMid - w / 2;
            out.push(`<path d="M${sx.toFixed(2)},${yTop.toFixed(2)} Q${(sx + w * 0.25).toFixed(2)},${(yTop - 3.5).toFixed(2)} ${xMid.toFixed(2)},${yTop.toFixed(2)} T${(sx + w).toFixed(2)},${yTop.toFixed(2)}" fill="none" stroke="currentColor" stroke-width="${strokeW.toFixed(2)}" />`);
          } else {
            const safeDot = node.accent === 'ddot' ? '\u00A8' : '\u02D9';
            out.push(`<text x="${(xMid - 2).toFixed(2)}" y="${(yTop + 3).toFixed(2)}" font-size="${fontSize.toFixed(2)}" font-family="Cambria Math, serif" fill="currentColor">${safeDot}</text>`);
          }
          return out;
        },
      };
    }

    case 'delim': {
      const inner = layoutNode(node.body, fontSize);
      const delimPad = fontSize * 0.36;
      const leftW = node.left ? delimPad : 0;
      const rightW = node.right ? delimPad : 0;
      const width = leftW + inner.width + rightW;
      const ascent = inner.ascent + 2;
      const descent = inner.descent + 2;

      return {
        width,
        ascent,
        descent,
        render: (x, baselineY) => {
          const out: string[] = [];
          const topY = baselineY - ascent + 1;
          const bottomY = baselineY + descent - 1;
          if (node.left) {
            out.push(...renderScaledDelimiter(node.left, x, topY, bottomY, leftW, fontSize));
          }
          out.push(...inner.render(x + leftW, baselineY));
          if (node.right) {
            out.push(...renderScaledDelimiter(node.right, x + leftW + inner.width, topY, bottomY, rightW, fontSize));
          }
          return out;
        },
      };
    }

    case 'matrix': {
      const env = node.env;
      const cellFont = Math.max(12, fontSize * 0.88);
      const laidRows = node.rows.map((r) => r.map((cell) => layoutNode(cell, cellFont)));
      const numCols = laidRows.reduce((max, r) => Math.max(max, r.length), 0);
      const colWidths = Array.from({ length: numCols }, (_, c) =>
        laidRows.reduce((max, r) => Math.max(max, r[c]?.width ?? 0), 0),
      );
      const colGap = fontSize * 0.65;
      const rowGap = fontSize * 0.35;
      const rowMetrics = laidRows.map((r) => ({
        ascent: r.reduce((m, c) => Math.max(m, c.ascent), cellFont * 0.72),
        descent: r.reduce((m, c) => Math.max(m, c.descent), cellFont * 0.22),
      }));

      const contentWidth =
        colWidths.reduce((s, w) => s + w, 0) + colGap * Math.max(0, numCols - 1);
      const totalHeight =
        rowMetrics.reduce((s, m) => s + m.ascent + m.descent, 0) +
        rowGap * Math.max(0, rowMetrics.length - 1);

      const leftDelim =
        env === 'pmatrix' ? '(' : env === 'bmatrix' ? '[' : env === 'vmatrix' ? '|' : env === 'cases' ? '{' : '';
      const rightDelim =
        env === 'pmatrix' ? ')' : env === 'bmatrix' ? ']' : env === 'vmatrix' ? '|' : '';

      const delimW = fontSize * 0.42;
      const leftPad = leftDelim ? delimW : 0;
      const rightPad = rightDelim ? delimW : 0;
      const width = leftPad + contentWidth + rightPad;
      const ascent = totalHeight / 2 + fontSize * 0.28;
      const descent = Math.max(fontSize * 0.24, totalHeight / 2 - fontSize * 0.28);

      return {
        width,
        ascent,
        descent,
        render: (x, baselineY) => {
          const out: string[] = [];
          const topY = baselineY - ascent + 1;
          const bottomY = baselineY + descent - 1;
          if (leftDelim) out.push(...renderScaledDelimiter(leftDelim, x, topY, bottomY, leftPad, fontSize));

          let cursorY = baselineY - ascent + fontSize * 0.08;
          for (let rIdx = 0; rIdx < laidRows.length; rIdx += 1) {
            const rm = rowMetrics[rIdx]!;
            const rowBaseline = cursorY + rm.ascent;
            let cursorX = x + leftPad;
            const row = laidRows[rIdx]!;
            for (let cIdx = 0; cIdx < numCols; cIdx += 1) {
              const cell = row[cIdx];
              const colW = colWidths[cIdx]!;
              if (cell) {
                const cellX = env === 'cases' ? cursorX : cursorX + (colW - cell.width) / 2;
                out.push(...cell.render(cellX, rowBaseline));
              }
              cursorX += colW + colGap;
            }
            cursorY += rm.ascent + rm.descent + rowGap;
          }

          if (rightDelim) out.push(...renderScaledDelimiter(rightDelim, x + leftPad + contentWidth, topY, bottomY, rightPad, fontSize));
          return out;
        },
      };
    }
  }
}

function renderScaledDelimiter(
  delim: string,
  x: number,
  topY: number,
  bottomY: number,
  width: number,
  fontSize: number,
): string[] {
  const height = bottomY - topY;
  const strokeW = Math.max(1.2, fontSize * 0.07);
  const midY = (topY + bottomY) / 2;

  if (delim === '[') {
    const xLine = x + width * 0.38;
    const xTip = x + width * 0.85;
    return [`<path d="M${xTip.toFixed(2)},${topY.toFixed(2)} L${xLine.toFixed(2)},${topY.toFixed(2)} L${xLine.toFixed(2)},${bottomY.toFixed(2)} L${xTip.toFixed(2)},${bottomY.toFixed(2)}" fill="none" stroke="currentColor" stroke-width="${strokeW.toFixed(2)}" />`];
  }
  if (delim === ']') {
    const xTip = x + width * 0.15;
    const xLine = x + width * 0.62;
    return [`<path d="M${xTip.toFixed(2)},${topY.toFixed(2)} L${xLine.toFixed(2)},${topY.toFixed(2)} L${xLine.toFixed(2)},${bottomY.toFixed(2)} L${xTip.toFixed(2)},${bottomY.toFixed(2)}" fill="none" stroke="currentColor" stroke-width="${strokeW.toFixed(2)}" />`];
  }
  if (delim === '|' || delim === '\u2016') {
    const x1 = x + width * 0.45;
    const items = [`<line x1="${x1.toFixed(2)}" y1="${topY.toFixed(2)}" x2="${x1.toFixed(2)}" y2="${bottomY.toFixed(2)}" stroke="currentColor" stroke-width="${strokeW.toFixed(2)}" />`];
    if (delim === '\u2016') {
      items.push(`<line x1="${(x1 + 3).toFixed(2)}" y1="${topY.toFixed(2)}" x2="${(x1 + 3).toFixed(2)}" y2="${bottomY.toFixed(2)}" stroke="currentColor" stroke-width="${strokeW.toFixed(2)}" />`);
    }
    return items;
  }
  if (delim === '(') {
    const xEdge = x + width * 0.78;
    const xCurve = x + width * 0.14;
    return [`<path d="M${xEdge.toFixed(2)},${topY.toFixed(2)} Q${xCurve.toFixed(2)},${midY.toFixed(2)} ${xEdge.toFixed(2)},${bottomY.toFixed(2)}" fill="none" stroke="currentColor" stroke-width="${strokeW.toFixed(2)}" stroke-linecap="round" />`];
  }
  if (delim === ')') {
    const xEdge = x + width * 0.22;
    const xCurve = x + width * 0.86;
    return [`<path d="M${xEdge.toFixed(2)},${topY.toFixed(2)} Q${xCurve.toFixed(2)},${midY.toFixed(2)} ${xEdge.toFixed(2)},${bottomY.toFixed(2)}" fill="none" stroke="currentColor" stroke-width="${strokeW.toFixed(2)}" stroke-linecap="round" />`];
  }
  if (delim === '{') {
    const xTip = x + width * 0.82;
    const xSpine = x + width * 0.48;
    const xPoint = x + width * 0.18;
    return [`<path d="M${xTip.toFixed(2)},${topY.toFixed(2)} Q${xSpine.toFixed(2)},${topY.toFixed(2)} ${xSpine.toFixed(2)},${(midY - height * 0.1).toFixed(2)} Q${xSpine.toFixed(2)},${midY.toFixed(2)} ${xPoint.toFixed(2)},${midY.toFixed(2)} Q${xSpine.toFixed(2)},${midY.toFixed(2)} ${xSpine.toFixed(2)},${(midY + height * 0.1).toFixed(2)} Q${xSpine.toFixed(2)},${bottomY.toFixed(2)} ${xTip.toFixed(2)},${bottomY.toFixed(2)}" fill="none" stroke="currentColor" stroke-width="${strokeW.toFixed(2)}" stroke-linecap="round" />`];
  }
  if (delim === '}') {
    const xTip = x + width * 0.18;
    const xSpine = x + width * 0.52;
    const xPoint = x + width * 0.82;
    return [`<path d="M${xTip.toFixed(2)},${topY.toFixed(2)} Q${xSpine.toFixed(2)},${topY.toFixed(2)} ${xSpine.toFixed(2)},${(midY - height * 0.1).toFixed(2)} Q${xSpine.toFixed(2)},${midY.toFixed(2)} ${xPoint.toFixed(2)},${midY.toFixed(2)} Q${xSpine.toFixed(2)},${midY.toFixed(2)} ${xSpine.toFixed(2)},${(midY + height * 0.1).toFixed(2)} Q${xSpine.toFixed(2)},${bottomY.toFixed(2)} ${xTip.toFixed(2)},${bottomY.toFixed(2)}" fill="none" stroke="currentColor" stroke-width="${strokeW.toFixed(2)}" stroke-linecap="round" />`];
  }

  const safeDelim = escapeXml(delim);
  const textFont = Math.max(fontSize, height * 0.85);
  return [
    `<text x="${(x + width * 0.2).toFixed(2)}" y="${(midY + textFont * 0.34).toFixed(2)}" font-size="${textFont.toFixed(2)}" font-family="Cambria Math, STIX Two Math, Times New Roman, serif" fill="currentColor">${safeDelim}</text>`,
  ];
}

/**
 * Parses and lays out a TeX/LaTeX math string into a sanitized W3C <svg> string.
 */
export function renderLatexToSvgSync(
  latex: string,
  options: RenderLatexSvgOptions = {},
): string {
  const fontSize = Math.max(14, options.fontSize ?? 18);
  const padding = Math.max(2, options.padding ?? 6);
  const color = options.color && /^[#a-zA-Z0-9(),.% -]+$/.test(options.color)
    ? escapeXml(options.color)
    : 'currentColor';

  const body = stripMathDelimiters(latex);
  const safeAria = escapeXml(body || 'Empty equation');

  if (!body) {
    return buildFallbackTextSvg('Empty equation');
  }

  const ast = new LatexParser(body).parse();
  const box = layoutNode(ast, fontSize);
  const width = Math.max(24, Math.ceil(box.width + padding * 2));
  const height = Math.max(24, Math.ceil(box.ascent + box.descent + padding * 2));
  const baselineY = padding + box.ascent;
  const elements = box.render(padding, baselineY);

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${safeAria}" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" data-latex-svg="true">`,
    `<g color="${color}" fill="${color}">`,
    ...elements,
    '</g>',
    '</svg>',
  ].join('');

  return sanitizeMathSvg(svg);
}
