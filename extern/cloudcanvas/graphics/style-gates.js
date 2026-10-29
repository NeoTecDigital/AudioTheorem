/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * Style discipline, as a function.
 *
 * Three rules make a stylesheet themable and overridable, and all three are
 * invisible until someone tries to theme or restyle it - at which point they are
 * a bug report rather than a diff. This module turns them into a check any sheet
 * can be run through: the framework's own in `tests/unit/styles.test.js`, a
 * component pack's, and a consumer's.
 *
 *   1. **Token reads.** A themable value (colour, spacing, type, shadow, radius,
 *      stacking) must come from a `var()` read. Literals are allowed *inside* the
 *      fallback, which is where the default lives: `color: var(--cc-text, #e2e8f0)`
 *      is the whole pattern - a host that defines nothing still looks designed,
 *      and a host that defines one token changes exactly one thing.
 *   2. **Namespaced classes.** Every class selector carries the framework's
 *      prefix, so injecting the sheet into a page cannot restyle the page. State
 *      classes (`cc-`, `is-`) are the deliberate exception: they only ever appear
 *      compounded onto a prefixed class, and naming them `cloudcanvas-is-hovered`
 *      would make every state selector unreadable.
 *   3. **No forced declarations.** `!important` is an arms race a consumer always
 *      loses. It is permitted in exactly two places: forcing a value the theme
 *      still owns (the whole value is token reads, so the framework wins the
 *      cascade but the theme still decides what it wins with), and a structural
 *      reset to a bare keyword (`display: none` for `[hidden]`,
 *      `transition: none` under reduced motion). `z-index` is excluded from both:
 *      a stacking order that cannot be overridden is a canvas a consumer cannot
 *      put their own chrome above.
 *
 * The check is textual, not a CSSOM parse: it has to run in a test process with
 * no document, over a sheet that is a template literal, and the properties it
 * cares about are all flat declarations.
 */

/** Rule identifiers carried by every violation. */
export const STYLE_RULES = /* @__PURE__ */ Object.freeze({
  TOKEN: 'token',
  PREFIX: 'prefix',
  IMPORTANT: 'important'
});

/**
 * Properties whose value must come from a token; the rest are structural.
 * Geometry (`width`, `inset`, `position`) is deliberately absent: it is layout,
 * not design, and tokenising it would make the sheet unreadable for no gain.
 */
export const THEMABLE_PROPERTY = /^(?:color|background|background-color|background-image|background-size|box-shadow|font|font-family|font-size|font-weight|border-radius|padding|padding-[a-z]+|margin|margin-[a-z]+|z-index)$/;

/** Properties whose `!important` is a reset, not a design decision. */
export const STRUCTURAL_RESET_PROPERTY = /^(?:display|visibility|transition|animation|pointer-events|overflow|touch-action|user-select)$/;

/** Properties that may never be forced, whatever their value. */
export const UNFORCEABLE_PROPERTY = /^z-index$/;

/** A bare CSS keyword: the only value a structural reset may force. */
const KEYWORD_VALUE = /^[a-z-]+$/i;

/** A word that is allowed to survive token-stripping: a keyword, or a zero. */
const LITERAL_ALLOWED = /^[a-z-]+$/i;

const COMMENT_PATTERN = /\/\*[\s\S]*?\*\//g;
const CLASS_PATTERN = /\.(-?[_a-zA-Z][\w-]*)/g;
const IMPORTANT_PATTERN = /!\s*important/i;

/**
 * Check a stylesheet against the three rules.
 *
 * @param {string} css the stylesheet source
 * @param {object} [options]
 * @param {string} [options.prefix='cloudcanvas-'] required class-name prefix
 * @param {string[]} [options.allowStateClasses=['cc-','is-']] prefixes a class
 *        may carry instead, for state modifiers
 * @param {Array<string|RegExp>} [options.extraTokenReaders=[]] further ways a
 *        value may read a token. A string is a CSS function name whose balanced
 *        calls are stripped alongside `var(` (`'env'`, `'--my-fn'`); a RegExp
 *        exempts any value it matches.
 * @param {RegExp} [options.themableProperty] override the themable-property set
 * @returns {{violations: Array<object>, stats: {rules: number, declarations: number, themable: number, classes: number}}}
 *          `violations` is the contract; `stats` lets a caller assert the check
 *          actually looked at something, so a parser that silently matches
 *          nothing cannot pass as a clean sheet.
 */
export function checkStyleDiscipline(css, options = {}) {
  const prefix = options.prefix === undefined ? 'cloudcanvas-' : options.prefix;
  const statePrefixes = options.allowStateClasses || ['cc-', 'is-'];
  const themable = options.themableProperty || THEMABLE_PROPERTY;
  const readers = tokenReaders(options.extraTokenReaders);

  const violations = [];
  const stats = { rules: 0, declarations: 0, themable: 0, classes: 0 };

  for (const rule of parseRules(css)) {
    stats.rules += 1;
    checkSelector(rule.selector, prefix, statePrefixes, violations, stats);

    for (const declaration of declarationsOf(rule.body)) {
      stats.declarations += 1;
      checkImportant(rule.selector, declaration, readers, violations);
      if (!themable.test(declaration.property)) continue;
      stats.themable += 1;
      checkTokenReads(rule.selector, declaration, readers, violations);
    }
  }

  return { violations, stats };
}

/* ------------------ RULES ------------------ */

/** Rule 2: every class in a selector is namespaced or an allowed state class. */
function checkSelector(selector, prefix, statePrefixes, violations, stats) {
  const seen = new Set();

  for (const match of selector.matchAll(CLASS_PATTERN)) {
    const className = match[1];
    if (seen.has(className)) continue;
    seen.add(className);
    stats.classes += 1;

    if (className.startsWith(prefix)) continue;
    if (statePrefixes.some((state) => className.startsWith(state))) continue;

    violations.push({
      rule: STYLE_RULES.PREFIX,
      selector,
      className,
      message: `"${selector}" - class ".${className}" is not namespaced "${prefix}"`
    });
  }
}

/** Rule 3: `!important` only over a token read, or as a structural keyword reset. */
function checkImportant(selector, { property, value }, readers, violations) {
  if (!IMPORTANT_PATTERN.test(value)) return;

  const bare = value.replace(IMPORTANT_PATTERN, '').trim();
  const forced = !UNFORCEABLE_PROPERTY.test(property)
    && (isPureTokenRead(bare, readers)
      || (STRUCTURAL_RESET_PROPERTY.test(property) && KEYWORD_VALUE.test(bare)));
  if (forced) return;

  violations.push({
    rule: STYLE_RULES.IMPORTANT,
    selector,
    property,
    value,
    message: `"${selector}" - ${property}: ${value} forces a value a consumer cannot override`
  });
}

/** Rule 1: a themable value carries no literal outside a token fallback. */
function checkTokenReads(selector, { property, value }, readers, violations) {
  if (readers.exempt.some((pattern) => pattern.test(value))) return;

  const literal = stripTokenReads(value.replace(IMPORTANT_PATTERN, ''), readers.functions);
  for (const word of literal.split(/[\s,()]+/)) {
    if (word === '' || word === '0' || LITERAL_ALLOWED.test(word)) continue;

    violations.push({
      rule: STYLE_RULES.TOKEN,
      selector,
      property,
      value,
      literal: word,
      message: `"${selector}" - ${property}: ${value} - "${word}" is a literal outside a var() fallback`
    });
  }
}

/* ------------------ TOKEN READS ------------------ */

/** Normalise `extraTokenReaders` into stripped function names and exempting patterns. */
function tokenReaders(extra = []) {
  const functions = ['var'];
  const exempt = [];

  for (const entry of extra) {
    if (entry instanceof RegExp) exempt.push(entry);
    else if (typeof entry === 'string' && entry.length > 0) functions.push(entry);
  }

  return { functions, exempt };
}

/** Whether a value is nothing but token reads (and whitespace). */
function isPureTokenRead(value, readers) {
  if (readers.exempt.some((pattern) => pattern.test(value))) return true;
  return stripTokenReads(value, readers.functions).trim() === '';
}

/**
 * Remove every balanced token-reading call, nesting included.
 *
 * Balanced rather than regular: `var(--a, var(--b, #fff))` has to disappear
 * whole, and a regular expression cannot count parentheses. What is left is the
 * part of the value the author wrote literally.
 */
function stripTokenReads(value, functions) {
  let out = '';
  let index = 0;

  while (index < value.length) {
    const call = nextCall(value, index, functions);
    if (!call) {
      out += value.slice(index);
      break;
    }

    out += value.slice(index, call.start);
    index = closingParen(value, call.open) + 1;
  }

  return out;
}

/** The next `name(` at or after `from`, at an identifier boundary. */
function nextCall(value, from, functions) {
  let best = null;

  for (const name of functions) {
    const needle = `${name}(`;
    const start = value.indexOf(needle, from);
    if (start === -1) continue;
    if (start > 0 && /[\w-]/.test(value[start - 1])) continue;
    if (!best || start < best.start) best = { start, open: start + name.length };
  }

  return best;
}

/** Index of the `)` closing the `(` at `open`; the end of the string when unbalanced. */
function closingParen(value, open) {
  let depth = 0;

  for (let cursor = open; cursor < value.length; cursor += 1) {
    if (value[cursor] === '(') depth += 1;
    else if (value[cursor] === ')') {
      depth -= 1;
      if (depth === 0) return cursor;
    }
  }

  return value.length;
}

/* ------------------ PARSING ------------------ */

/**
 * Every rule in the sheet as `{ selector, body }`, at-rules included.
 *
 * Splitting on `}` and reading back to the last `{` handles nesting without a
 * parser: the text after the last brace is the declaration body, and the text
 * after the brace before it is the selector - so a rule inside `@media` reports
 * its own selector rather than the media prelude.
 */
function parseRules(css) {
  const stripped = String(css || '').replace(COMMENT_PATTERN, '');
  const rules = [];

  for (const chunk of stripped.split('}')) {
    const open = chunk.lastIndexOf('{');
    if (open === -1) continue;

    const prelude = chunk.slice(0, open);
    const nested = prelude.lastIndexOf('{');
    rules.push({
      selector: prelude.slice(nested + 1).replace(/\s+/g, ' ').trim(),
      body: chunk.slice(open + 1)
    });
  }

  return rules;
}

/** The `property: value` pairs of one declaration body. */
function declarationsOf(body) {
  const declarations = [];

  for (const raw of body.split(';')) {
    const colon = raw.indexOf(':');
    if (colon === -1) continue;
    declarations.push({
      property: raw.slice(0, colon).trim().toLowerCase(),
      value: raw.slice(colon + 1).trim()
    });
  }

  return declarations;
}
