/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * Markdown, the safe subset: headings, paragraphs (a newline is a line break),
 * bullet, numbered and task lists (nested by indent), block quotes, fenced code,
 * rules, and the inline set in `./markdown-inline.js`.
 *
 *   host.append(renderMarkdown(note.body, { mentions: (handle) => people.get(handle) }));
 *   const view = createMarkdownView(host, { onTaskToggle: (line, done) => save(toggleTaskLine(body, line, done)) });
 *
 * RAW HTML IS TEXT. There is no HTML parser here and no `innerHTML` anywhere:
 * the output is built with `createElement` and `createTextNode`, so markup in
 * the source renders as the characters it is. Links pass `safeHref`. The input
 * is capped (`maxLength`, 100000 characters) and nesting is capped at six
 * levels, so hostile input costs bounded time and depth.
 */
import { appendInline, safeHref } from './markdown-inline.js';
import { createLife, documentOf, el } from './dom.js';
import { injectUiStyles } from './styles.js';

export { safeHref };

const CLASS = 'cloudcanvas-ui-markdown';
const MAX_DEPTH = 6;
const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([\w+-]*)\s*$/;
const HEADING = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^ {0,3}([-*_])(\s*\1){2,}\s*$/;
const QUOTE = /^ {0,3}>\s?/;
const ITEM = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const TASK = /^\[([ xX])\]\s+(.*)$/;

function isBlockStart(line) {
  return FENCE.test(line) || HEADING.test(line) || RULE.test(line) || QUOTE.test(line) || ITEM.test(line);
}

function indentOf(line) {
  return line.length - line.trimStart().length;
}

function fenced(ctx, lines, i, parent) {
  const open = FENCE.exec(lines[i]);
  let end = i + 1;
  while (end < lines.length && !lines[end].trim().startsWith(open[1])) end += 1;
  const pre = ctx.doc.createElement('pre');
  const code = ctx.doc.createElement('code');
  if (open[2]) code.setAttribute('data-language', open[2]);
  code.append(ctx.doc.createTextNode(lines.slice(i + 1, end).join('\n')));
  pre.append(code);
  parent.append(pre);
  return Math.min(end + 1, lines.length);
}

function quote(ctx, lines, i, parent, depth, offset) {
  let end = i;
  while (end < lines.length && QUOTE.test(lines[end])) end += 1;
  const node = ctx.doc.createElement('blockquote');
  renderBlocks(ctx, lines.slice(i, end).map((line) => line.replace(QUOTE, '')), node, depth + 1, offset + i);
  parent.append(node);
  return end;
}

function paragraph(ctx, lines, i, parent) {
  let end = i;
  while (end < lines.length && lines[end].trim() !== '' && (end === i || !isBlockStart(lines[end]))) end += 1;
  const node = ctx.doc.createElement('p');
  lines.slice(i, end).forEach((line, index) => {
    if (index > 0) node.append(ctx.doc.createElement('br'));
    appendInline(ctx, line.trim(), node);
  });
  parent.append(node);
  return end;
}

/** The lines of one list, from `i`: items at the first item's indent and what nests under them. */
function listExtent(lines, i) {
  const base = indentOf(lines[i]);
  const ordered = /\d/.test(ITEM.exec(lines[i])[2]);
  let end = i + 1;
  while (end < lines.length) {
    const line = lines[end];
    const item = ITEM.exec(line);
    if (item && indentOf(line) === base && /\d/.test(item[2]) === ordered) { end += 1; continue; }
    if (line.trim() === '' && end + 1 < lines.length && indentOf(lines[end + 1]) > base) { end += 1; continue; }
    if (line.trim() !== '' && indentOf(line) > base) { end += 1; continue; }
    break;
  }
  return { base, ordered, end };
}

function taskBox(ctx, checked, line) {
  const box = ctx.doc.createElement('input');
  box.type = 'checkbox';
  box.checked = checked;
  box.className = `${CLASS}-task`;
  box.setAttribute('data-line', String(line));
  box.disabled = !ctx.tasks;
  return box;
}

function listItem(ctx, lines, start, end, depth, offset, base) {
  const li = ctx.doc.createElement('li');
  const first = ITEM.exec(lines[start])[3];
  const task = TASK.exec(first);
  const body = [task ? task[2] : first, ...lines.slice(start + 1, end).map((line) => line.slice(Math.min(indentOf(line), base + 2)))];
  if (task) {
    li.className = `${CLASS}-task-item`;
    const label = ctx.doc.createElement('label');
    label.append(taskBox(ctx, task[1] !== ' ', offset + start), ctx.doc.createTextNode(' '));
    appendInline(ctx, body[0], label);
    li.append(label);
    body.shift();
  }
  if (body.length === 1 && !isBlockStart(body[0])) appendInline(ctx, body[0].trim(), li);
  else if (body.length > 0) renderBlocks(ctx, body, li, depth + 1, offset + start + (task ? 1 : 0));
  return li;
}

function list(ctx, lines, i, parent, depth, offset) {
  const { base, ordered, end } = listExtent(lines, i);
  const node = ctx.doc.createElement(ordered ? 'ol' : 'ul');
  const number = Number.parseInt(ITEM.exec(lines[i])[2], 10);
  if (ordered && number !== 1) node.setAttribute('start', String(number));
  let start = i;
  for (let line = i + 1; line <= end; line += 1) {
    const next = line < end ? ITEM.exec(lines[line]) : null;
    if (line === end || (next && indentOf(lines[line]) === base)) {
      node.append(listItem(ctx, lines, start, line, depth, offset, base));
      start = line;
    }
  }
  parent.append(node);
  return end;
}

function block(ctx, lines, i, parent, depth, offset) {
  const line = lines[i];
  if (FENCE.test(line)) return fenced(ctx, lines, i, parent);
  const heading = HEADING.exec(line);
  if (heading) {
    const level = Math.min(6, heading[1].length + ctx.headingOffset);
    const node = el(ctx.doc, `h${level}`);
    appendInline(ctx, heading[2], node);
    parent.append(node);
    return i + 1;
  }
  if (RULE.test(line)) { parent.append(ctx.doc.createElement('hr')); return i + 1; }
  if (QUOTE.test(line)) return quote(ctx, lines, i, parent, depth, offset);
  if (ITEM.test(line)) return list(ctx, lines, i, parent, depth, offset);
  return paragraph(ctx, lines, i, parent);
}

function renderBlocks(ctx, lines, parent, depth, offset) {
  if (depth > MAX_DEPTH) {
    parent.append(ctx.doc.createTextNode(lines.join('\n')));
    return;
  }
  let i = 0;
  while (i < lines.length) {
    if (lines[i].trim() === '') { i += 1; continue; }
    i = block(ctx, lines, i, parent, depth, offset);
  }
}

/**
 * Render `source` as a fragment of safe DOM.
 * @param {string} source
 * @param {{doc?: Document, mentions?: Function, allowRelativeLinks?: boolean, externalTarget?: boolean,
 *   headingOffset?: number, maxLength?: number, tasks?: boolean}} [options]
 * @returns {DocumentFragment}
 */
export function renderMarkdown(source, options = {}) {
  const doc = options.doc ?? globalThis.document;
  const text = String(source ?? '').slice(0, options.maxLength ?? 100000).replace(/\r\n?/g, '\n');
  const ctx = { doc, mentions: options.mentions, allowRelative: options.allowRelativeLinks !== false,
    externalTarget: options.externalTarget, headingOffset: Math.max(0, options.headingOffset ?? 0),
    tasks: options.tasks === true };
  const fragment = doc.createDocumentFragment();
  renderBlocks(ctx, text.split('\n'), fragment, 0, 0);
  return fragment;
}

/**
 * `source` with the task on line `line` set to `checked`; unchanged when that
 * line is not a task item. The helper a host saves a toggle with.
 */
export function toggleTaskLine(source, line, checked) {
  const lines = String(source ?? '').split('\n');
  const match = /^(\s*(?:[-*+]|\d{1,9}[.)])\s+\[)([ xX])(\].*)$/.exec(lines[line] ?? '');
  if (!match) return String(source ?? '');
  lines[line] = `${match[1]}${checked ? 'x' : ' '}${match[3]}`;
  return lines.join('\n');
}

/**
 * A mounted markdown view that re-renders when its source changes.
 * `onTaskToggle(line, checked)` enables task checkboxes; without it they are read-only.
 * @returns {{update(model: {source?: string}): void, destroy(): void}}
 */
export function createMarkdownView(host, options = {}) {
  const doc = documentOf(host);
  injectUiStyles(doc);
  const life = createLife();
  const root = el(doc, 'div', { className: CLASS });
  host.append(root);
  let source = null;
  life.on(root, 'change', (event) => {
    const box = event.target.closest?.(`.${CLASS}-task`);
    if (box) options.onTaskToggle?.(Number(box.getAttribute('data-line')), box.checked);
  });
  return {
    update(model = {}) {
      if (life.dead || model.source === source) return;
      source = model.source ?? '';
      root.replaceChildren(renderMarkdown(source, { ...options, doc, tasks: typeof options.onTaskToggle === 'function' }));
    },
    destroy() {
      if (life.destroy()) root.remove();
    }
  };
}
