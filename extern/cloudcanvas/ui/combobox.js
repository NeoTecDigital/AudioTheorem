/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * Combobox: suggestions for a field the host owns.
 *
 *   const box = createCombobox(input, { onPick: (id, option) => insert(option.label) });
 *   box.update({ options: [{ id: 'ana', label: 'Ana' }], open: true });
 *
 * It takes the field, not a host: the list is placed right after the field,
 * and the field becomes a `role="combobox"` that controls it. This is the kit's
 * listbox (`./results.js`) attached to that field, so there is one listbox and
 * one set of keys: focus never leaves the field, Up and Down move
 * `aria-activedescendant`, Enter picks the active option, and Escape lets go of
 * it, after which Enter is the field's again. Nothing is active until the user
 * moves, so typing and Enter mean what they meant before the list appeared.
 *
 * CONTROLLED. `open` and `options` are the model's, and a pick reports
 * `onPick(id, option)`; what goes into the field, and whether the list stays
 * open, is the host's. The list shows only while it is open and has something
 * to offer, and a closed list offers nothing to a screen reader either. A press
 * on the list is swallowed, so the field keeps its focus and its caret.
 *
 * A LONG LIST SCROLLS in the listbox, not in the popup around it: the field
 * controls the listbox, which is the one scroller a keyboard need not reach
 * (the field is operated through `aria-activedescendant`), so a screen-reader
 * check for a scroller with no key to it passes. The popup's `max-height` - the
 * kit's, or a host's - is what the listbox gives way to.
 */
import { createLife, documentOf, el } from './dom.js';
import { createResults } from './results.js';
import { injectUiStyles } from './styles.js';

const CLASS = 'cloudcanvas-ui-combobox';

/**
 * @param {HTMLInputElement|HTMLTextAreaElement} input the field the suggestions are for
 * @param {{onPick?: (id: string, option: object) => void}} [callbacks]
 * @returns {{update(model: {options?: Array<{id: string, label: string}>, open?: boolean, label?: string}): void, destroy(): void}}
 */
export function createCombobox(input, { onPick } = {}) {
  const doc = documentOf(input);
  injectUiStyles(doc);
  const life = createLife();
  const popup = el(doc, 'div', { className: CLASS, attrs: { hidden: true } });
  input.after(popup);
  const state = { options: [] };
  const results = createResults(popup, { onActivate: (id) => onPick?.(id, state.options.find((option) => option.id === id)) });
  const detach = results.attachInput(input);
  life.on(popup, 'mousedown', (event) => event.preventDefault());
  life.add(() => {
    detach();
    results.destroy();
    popup.remove();
  });
  return {
    update(model = {}) {
      if (life.dead) return;
      const options = model.open === true ? model.options ?? [] : [];
      results.update({ label: model.label ?? 'Suggestions', items: options });
      state.options = options;
      popup.hidden = options.length === 0;
    },
    destroy() {
      life.destroy();
    }
  };
}
