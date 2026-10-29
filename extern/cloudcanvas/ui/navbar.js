/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * Nav bar: an application's destinations, as one labelled landmark.
 *
 *   const nav = createNavBar(host, { onSelect: (id) => go(id) });
 *   nav.update({ label: 'Workspace views', activeId: 'today', placement: 'top',
 *     items: [{ id: 'today', label: 'Today' }, { id: 'people', label: 'People', badge: { count: 3, label: '{count} unread' } }] });
 *
 * A `<nav>` of real buttons, so Tab, Enter and Space are the platform's. The
 * active item carries `aria-current="page"`. CONTROLLED: a press reports
 * `onSelect(id)` - the current item included, since going there again is the
 * host's to answer - and the bar shows what the next model says.
 *
 * `badge` is the kit badge (`./badge.js`) inside its button: the model
 * `createBadge` takes, or a bare number for the count. What the badge says is
 * part of the button's name. `placement` is 'top', or 'bottom' for a phone's
 * bar; it is written as `data-placement` and the sheet lays the same buttons
 * out either way. Where the bar sits on the page is the host's.
 *
 * An item may carry an `icon` - a kit icon name (`./icons.js`) or an element, drawn before its label and hidden from
 * readers - and a `title`: the tooltip, which a reader gives as the button's description. The label is still its name.
 */
import { badgeModel, createBadge } from './badge.js';
import { createLife, documentOf, el, textNode, uniqueItems, writeText } from './dom.js';
import { iconSlot, writeIcon } from './icons.js';
import { keepFocus, placeChildren } from './render.js';
import { injectUiStyles } from './styles.js';

const CLASS = 'cloudcanvas-ui-navbar';

/** One destination: its list item, its button, the label's text node and the badge mounted in the button. */
function entryFor(doc, id) {
  const node = el(doc, 'li', { className: `${CLASS}-item` });
  const link = el(doc, 'button', { className: `${CLASS}-link`, attrs: { type: 'button', 'data-ui-id': id } });
  const slot = iconSlot(doc, `${CLASS}-icon`);
  const label = el(doc, 'span', { className: `${CLASS}-label` });
  link.append(slot, label);
  node.append(link);
  return { node, link, slot, text: textNode(doc, label), badge: createBadge(link) };
}

/** Redraw the destinations in place: entries are kept by id, and one the model dropped takes its badge with it. */
function draw(nav, items, activeId) {
  const { doc, list, entries } = nav;
  const kept = new Set(items.map((item) => item.id));
  for (const [id, entry] of entries) {
    if (kept.has(id)) continue;
    entry.badge.destroy();
    entries.delete(id);
  }
  const active = doc.activeElement;
  placeChildren(list, items.map((item) => {
    if (!entries.has(item.id)) entries.set(item.id, entryFor(doc, item.id));
    const entry = entries.get(item.id);
    writeText(entry.text, item.label ?? item.id);
    writeIcon(entry.slot, item.icon);
    if (item.title) entry.link.setAttribute('title', String(item.title));
    else entry.link.removeAttribute('title');
    if (item.id === activeId) entry.link.setAttribute('aria-current', 'page');
    else entry.link.removeAttribute('aria-current');
    entry.badge.update(badgeModel(item.badge));
    return entry.node;
  }));
  keepFocus(list, active);
}

/**
 * @param {HTMLElement} host
 * @param {{onSelect?: (id: string) => void}} [callbacks]
 * @returns {{update(model: {label?: string, items?: Array<{id: string, label?: string, icon?: string|Element, title?: string, badge?: number|object}>,
 *   activeId?: string, placement?: 'top'|'bottom'}): void, destroy(): void}}
 */
export function createNavBar(host, { onSelect } = {}) {
  const doc = documentOf(host);
  injectUiStyles(doc);
  const life = createLife();
  const root = el(doc, 'nav', { className: CLASS });
  const list = el(doc, 'ul', { className: `${CLASS}-list`, attrs: { role: 'list' } });
  root.append(list);
  host.append(root);
  const nav = { doc, list, entries: new Map() };
  life.on(list, 'click', (event) => {
    const link = event.target.closest?.(`.${CLASS}-link`);
    if (link && list.contains(link)) onSelect?.(link.getAttribute('data-ui-id'));
  });
  life.add(() => { for (const entry of nav.entries.values()) entry.badge.destroy(); });
  return {
    update(model = {}) {
      if (life.dead) return;
      const items = uniqueItems(model.items ?? [], 'navbar');
      root.setAttribute('aria-label', String(model.label ?? 'Navigation'));
      root.setAttribute('data-placement', model.placement === 'bottom' ? 'bottom' : 'top');
      draw(nav, items, model.activeId ?? null);
    },
    destroy() {
      if (life.destroy()) root.remove();
    }
  };
}
