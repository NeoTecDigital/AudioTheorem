/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * Inline markdown: code spans, strong, emphasis, strike, links, autolinks and
 * (when the host resolves them) @mentions, written as DOM nodes.
 *
 * NO HTML IS EVER PARSED. Every character the source holds ends up in a text
 * node or an attribute set through the DOM, so `<script>` in a note is the
 * eight characters it looks like. A link's destination must pass `safeHref`;
 * one that does not is rendered as its text alone.
 *
 * LINEAR. A delimiter whose close was not found is remembered, so a line of a
 * thousand unmatched `**` costs one scan, not a thousand.
 */

/** Schemes a link may use; anything else (javascript:, data:, file:, ...) is refused. */
const SAFE_SCHEMES = /* @__PURE__ */ new Set(['http', 'https', 'mailto', 'tel']);
const SCHEME = /^([a-z][a-z0-9+.-]*):/i;
const CONTROL = /[\u0000- \u007F-\u009F]/g;
const WORD = /[\p{L}\p{N}_]/u;
const URL_TAIL = /[.,;:!?)\]'"]+$/;
const MENTION = /^@([\p{L}\p{N}_][\p{L}\p{N}_.-]{0,63})/u;

/** The longest link label read, so a line of `[` never rescans the line. */
const MAX_LINK_TEXT = 1000;

/** The deepest emphasis nesting rendered as markup; deeper stays text. */
const MAX_INLINE_DEPTH = 4;

/**
 * A destination safe to put in `href`, or null.
 * @param {string} value
 * @param {{allowRelative?: boolean}} [options]
 * @returns {{href: string, external: boolean}|null}
 */
export function safeHref(value, { allowRelative = true } = {}) {
  const text = String(value ?? '').trim();
  if (text === '' || text.length > 2048) return null;
  const probe = text.replace(CONTROL, '');
  const scheme = SCHEME.exec(probe);
  if (scheme) {
    const name = scheme[1].toLowerCase();
    if (!SAFE_SCHEMES.has(name) || probe !== text.replace(/\s/g, '')) return null;
    return { href: text, external: name === 'http' || name === 'https' };
  }
  if (!allowRelative || probe.startsWith('//') || probe.startsWith('\\') || probe !== text) return null;
  return { href: text, external: false };
}

function finder(text) {
  const cache = new Map();
  return (token, from) => {
    const known = cache.get(token);
    if (known !== undefined && (known === -1 || known >= from)) return known;
    const at = text.indexOf(token, from);
    cache.set(token, at);
    return at;
  };
}

function appendLink(ctx, parent, label, target, title) {
  const safe = safeHref(target, ctx);
  if (!safe) { parent.append(ctx.doc.createTextNode(label)); return; }
  const link = ctx.doc.createElement('a');
  link.setAttribute('href', safe.href);
  link.setAttribute('rel', 'noopener noreferrer nofollow');
  if (safe.external && ctx.externalTarget !== false) link.setAttribute('target', '_blank');
  if (title) link.setAttribute('title', title);
  link.append(ctx.doc.createTextNode(label));
  parent.append(link);
}

/** The `)` closing a link destination that starts at `from` (nested pairs allowed), or -1. */
function closingParen(text, from) {
  let depth = 0;
  const limit = Math.min(text.length, from + 2048);
  for (let j = from; j < limit; j += 1) {
    const char = text[j];
    if (char === '\n') return -1;
    if (char === '(') depth += 1;
    else if (char === ')' && depth === 0) return j;
    else if (char === ')') depth -= 1;
  }
  return -1;
}

/** `[label](target "title")` at `i`, or null. */
function readLink(text, i, find) {
  const close = find('](', i + 1);
  if (close === -1 || close - i > MAX_LINK_TEXT || text.slice(i + 1, close).includes('\n')) return null;
  const end = closingParen(text, close + 2);
  if (end === -1) return null;
  const inside = text.slice(close + 2, end).trim();
  const titled = /^(\S+)\s+"([^"]*)"$/.exec(inside);
  return { label: text.slice(i + 1, close), target: titled ? titled[1] : inside, title: titled?.[2] ?? '', next: end + 1 };
}

function readBareUrl(text, i) {
  if (i > 0 && WORD.test(text[i - 1])) return null;
  const head = text.slice(i, i + 8).toLowerCase();
  if (!head.startsWith('http://') && !head.startsWith('https://')) return null;
  let end = i;
  while (end < text.length && !/\s|</.test(text[end])) end += 1;
  const url = text.slice(i, end).replace(URL_TAIL, '');
  return url.length > 8 ? { url, next: i + url.length } : null;
}

function readMention(ctx, text, i) {
  if (!ctx.mentions || (i > 0 && WORD.test(text[i - 1]))) return null;
  const match = MENTION.exec(text.slice(i, i + 66));
  if (!match) return null;
  const handle = match[1].replace(/[.-]+$/, '');
  const resolved = ctx.mentions(handle);
  return resolved ? { handle, resolved, next: i + 1 + handle.length } : null;
}

function appendMention(ctx, parent, { handle, resolved }) {
  const label = String(resolved.label ?? `@${handle}`);
  if (resolved.href && safeHref(resolved.href, ctx)) { appendLink(ctx, parent, label, resolved.href, ''); return; }
  const span = ctx.doc.createElement('span');
  span.className = 'cloudcanvas-ui-markdown-mention';
  span.setAttribute('data-mention', handle);
  span.append(ctx.doc.createTextNode(label));
  parent.append(span);
}

const WRAPS = /* @__PURE__ */ Object.freeze([['**', 'strong'], ['__', 'strong'], ['~~', 'del'], ['*', 'em'], ['_', 'em']]);

/** A wrapped span (`**x**`, `_x_`, ...) at `i`, or null. */
function readWrap(text, i, find) {
  for (const [token, tag] of WRAPS) {
    if (!text.startsWith(token, i)) continue;
    if (token[0] === '_' && i > 0 && WORD.test(text[i - 1])) return null;
    const start = i + token.length;
    const end = find(token, start + 1);
    if (end === -1 || /\s/.test(text[start] ?? ' ') || /\s/.test(text[end - 1])) continue;
    if (token[0] === '_' && WORD.test(text[end + token.length] ?? '')) continue;
    return { tag, inner: text.slice(start, end), next: end + token.length };
  }
  return null;
}

/** One inline construct at `i`, appended to `parent`; returns the index after it, or -1 for plain text. */
function construct(ctx, text, i, parent, depth, find) {
  const char = text[i];
  if (char === '\\' && i + 1 < text.length && /[\\`*_~[\]()@<>#!-]/.test(text[i + 1])) {
    parent.append(ctx.doc.createTextNode(text[i + 1]));
    return i + 2;
  }
  if (char === '`') {
    const end = find('`', i + 1);
    if (end === -1) return -1;
    const code = ctx.doc.createElement('code');
    code.append(ctx.doc.createTextNode(text.slice(i + 1, end)));
    parent.append(code);
    return end + 1;
  }
  if (char === '[') {
    const link = readLink(text, i, find);
    if (!link) return -1;
    appendLink(ctx, parent, link.label, link.target, link.title);
    return link.next;
  }
  if (char === '<' && /^<https?:\/\/[^\s>]+>/i.test(text.slice(i, i + 2050))) {
    const end = text.indexOf('>', i);
    appendLink(ctx, parent, text.slice(i + 1, end), text.slice(i + 1, end), '');
    return end + 1;
  }
  return formatted(ctx, text, i, parent, depth, find);
}

function formatted(ctx, text, i, parent, depth, find) {
  const char = text[i];
  if (char === 'h' || char === 'H') {
    const bare = readBareUrl(text, i);
    if (!bare) return -1;
    appendLink(ctx, parent, bare.url, bare.url, '');
    return bare.next;
  }
  if (char === '@') {
    const mention = readMention(ctx, text, i);
    if (!mention) return -1;
    appendMention(ctx, parent, mention);
    return mention.next;
  }
  if (depth >= MAX_INLINE_DEPTH || !'*_~'.includes(char)) return -1;
  const wrap = readWrap(text, i, find);
  if (!wrap) return -1;
  const node = ctx.doc.createElement(wrap.tag);
  appendInline(ctx, wrap.inner, node, depth + 1);
  parent.append(node);
  return wrap.next;
}

/** Characters that may open an inline construct. */
const TRIGGERS = '\\`[<hH@*_~';

/**
 * Append `text`'s inline markdown to `parent`.
 * @param {{doc: Document, mentions?: (handle: string) => ({label?: string, href?: string}|null),
 *   allowRelative?: boolean, externalTarget?: boolean}} ctx
 */
export function appendInline(ctx, text, parent, depth = 0) {
  const find = finder(text);
  let plain = '';
  let i = 0;
  while (i < text.length) {
    const scratch = TRIGGERS.includes(text[i]) ? ctx.doc.createDocumentFragment() : null;
    const next = scratch ? construct(ctx, text, i, scratch, depth, find) : -1;
    if (next === -1) {
      plain += text[i];
      i += 1;
      continue;
    }
    if (plain) parent.append(ctx.doc.createTextNode(plain));
    plain = '';
    parent.append(scratch);
    i = next;
  }
  if (plain) parent.append(ctx.doc.createTextNode(plain));
}
