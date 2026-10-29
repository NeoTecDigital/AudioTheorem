/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * The menu add-on's commands (`./menu.js`): a registry per menu, and which of
 * its commands apply to one click. An item is `{id, label, group, parent,
 * when(subject, context), action(subject, context)}`; a command another names
 * as `parent` is a submenu trigger, so it carries no action of its own.
 */

const ALWAYS = () => true;

/** Commands by id, in registration order (render order); `clear()` replays the default providers. */
export class MenuRegistry {
  constructor() {
    this._items = new Map();
    this._defaultProviders = new Set();
  }

  /** Run a registrar of default commands now and keep it for `clear()`. */
  registerDefaults(provider) {
    provider(this);
    this._defaultProviders.add(provider);
    return this;
  }

  /**
   * Register a command; an id is unique, and an `action` is required unless the
   * command becomes a submenu trigger (which then may not have one).
   * @returns {object} the normalised, frozen definition
   */
  register(item) {
    const { id, label, action } = item || {};
    if (typeof id !== 'string' || id === '') throw new Error('MenuRegistry.register: id must be a non-empty string');
    if (typeof label !== 'string' || label === '') throw new Error(`MenuRegistry.register: "${id}" requires a label`);
    if (action !== undefined && typeof action !== 'function') {
      throw new Error(`MenuRegistry.register: "${id}" action, if given, must be a function`);
    }
    if (item.renderItem !== undefined && typeof item.renderItem !== 'function') {
      throw new Error(`MenuRegistry.register: "${id}" renderItem, if given, must be a function`);
    }
    if (this._items.has(id)) throw new Error(`MenuRegistry.register: "${id}" is already registered`);

    const definition = Object.freeze({
      id,
      label,
      group: typeof item.group === 'string' ? item.group : '',
      parent: this._resolveParent(item, id),
      when: typeof item.when === 'function' ? item.when : ALWAYS,
      action: typeof action === 'function' ? action : null,
      // Opt-in seams: decorate the built button; keep the menu open after a toggle; open a flyout on hover.
      renderItem: typeof item.renderItem === 'function' ? item.renderItem : null,
      closeOnRun: item.closeOnRun !== false,
      openOnHover: Boolean(item.openOnHover)
    });
    this._items.set(id, definition);
    return definition;
  }

  /** A parent must already exist (an acyclic forest, rendered top-down) and carry no action. */
  _resolveParent(item, id) {
    const parent = typeof item.parent === 'string' ? item.parent : '';
    if (parent === '') return '';
    const target = this._items.get(parent);
    if (!target) throw new Error(`MenuRegistry.register: "${id}" names parent "${parent}", which is not registered`);
    if (typeof target.action === 'function') {
      throw new Error(`MenuRegistry.register: "${parent}" cannot be both a submenu trigger and an action `
        + `(named as parent by "${id}")`);
    }
    return parent;
  }

  unregister(id) { return this._items.delete(id); }

  has(id) { return this._items.has(id); }

  get(id) { return this._items.get(id); }

  hasChildren(id) {
    for (const item of this._items.values()) if (item.parent === id) return true;
    return false;
  }

  childrenOf(id) { return this.list().filter((item) => item.parent === id); }

  list() { return Array.from(this._items.values()); }

  clear() {
    this._items.clear();
    for (const provider of this._defaultProviders) provider(this);
  }
}

/* ------------------ RESOLUTION ------------------ */

/** Whether a command is a trigger: some other command names it as parent. */
export function isTrigger(m, item) {
  return m.registry.hasChildren(item.id);
}

/** A leaf shows when `when()` passes and it can act; a trigger when `when()` passes and a descendant shows. */
function isVisible(m, context, item) {
  if (!item.when(m.subject, context)) return false;
  if (isTrigger(m, item)) return m.registry.childrenOf(item.id).some((child) => isVisible(m, context, child));
  return typeof item.action === 'function';
}

/** The commands directly under `parentId` ('' for the top level) that apply to one click. */
export function visibleItems(m, context, parentId = '') {
  return m.registry.list().filter((item) => item.parent === parentId && isVisible(m, context, item));
}
