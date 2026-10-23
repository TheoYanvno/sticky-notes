// Draws one sticky note. Used by each desktop note window and by the browser demo.
// User text only ever goes in through .value / .textContent, never as HTML.
import { COLORS, MAX_NOTES, isEmpty, progress } from '../src/notes.js';

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k in node) node[k] = v;
    else node.setAttribute(k, v);
  }
  node.append(...children.filter((c) => c != null && c !== false));
  return node;
}

const COLOR_NAMES = { yellow: 'Yellow', pink: 'Pink', blue: 'Blue', green: 'Green' };

/**
 * actions: { color(c), list(on), text(value), addItem(text), toggleItem(itemId), editItem(itemId, text),
 *            removeItem(itemId), add(), remove() }
 * options: { canAdd } — whether + may make another note (only three at a time)
 */
export function renderNote(note, actions, { canAdd = true } = {}) {
  const key = (part) => `${note.id}:${part}`;
  const p = progress(note);

  // Deleting a note with something in it takes a second click, so a slip of the mouse loses nothing
  let confirmTimer = null;
  const del = el('button', {
    class: 'icon delete', type: 'button', title: 'Delete note', 'aria-label': 'Delete note',
    onclick: () => {
      if (isEmpty(note) || del.classList.contains('confirm')) { clearTimeout(confirmTimer); actions.remove(); return; }
      del.classList.add('confirm'); del.textContent = 'Delete?'; del.setAttribute('aria-label', 'Click again to delete');
      confirmTimer = setTimeout(() => { del.classList.remove('confirm'); del.textContent = '🗑'; del.setAttribute('aria-label', 'Delete note'); }, 3000);
    },
  }, '🗑');

  const bar = el('header', { class: 'note-bar' },
    el('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Note color' },
      ...COLORS.map((c) => el('button', {
        class: `swatch swatch-${c}`, type: 'button', title: COLOR_NAMES[c], role: 'radio',
        'aria-checked': String(c === note.color), 'aria-label': COLOR_NAMES[c],
        onclick: () => actions.color(c),
      }))),
    el('span', { class: 'spacer' }),
    p.total ? el('span', { class: 'progress', title: 'Checklist items done' }, p.label) : null,
    el('button', {
      class: 'icon', type: 'button', title: note.list ? 'Back to plain text' : 'Make this a checklist',
      'aria-label': 'Checklist', 'aria-pressed': String(note.list), dataset: { focus: key('list') },
      onclick: () => actions.list(!note.list),
    }, '☑'),
    el('button', {
      class: 'icon add', type: 'button', disabled: !canAdd, dataset: { focus: key('new') },
      title: canAdd ? 'New sticky note' : `You can have ${MAX_NOTES} notes at a time. Delete one to make another.`,
      'aria-label': canAdd ? 'New sticky note' : `New sticky note (limit of ${MAX_NOTES} reached)`,
      onclick: () => actions.add(),
    }, '+'),
    del,
  );

  let content;
  if (!note.list) {
    content = el('textarea', {
      class: 'note-body', value: note.body, placeholder: 'Write something…', 'aria-label': 'Note text',
      dataset: { focus: key('body') }, oninput: (e) => actions.text(e.target.value),
    });
  } else {
    const list = el('ul', { class: 'checklist' }, ...note.checklist.map((item) => el('li', { class: item.done ? 'done' : '' },
      el('input', { type: 'checkbox', checked: item.done, 'aria-label': `Done: ${item.text}`, dataset: { focus: key(`check-${item.id}`) }, onchange: () => actions.toggleItem(item.id) }),
      el('input', { class: 'item-text', type: 'text', value: item.text, maxLength: 500, 'aria-label': 'Checklist item', dataset: { focus: key(`item-${item.id}`) }, oninput: (e) => actions.editItem(item.id, e.target.value) }),
      el('button', { class: 'icon small', type: 'button', title: 'Remove item', 'aria-label': `Remove ${item.text}`, onclick: () => actions.removeItem(item.id) }, '✕'),
    )));
    const addInput = el('input', { type: 'text', placeholder: '+ Add an item', 'aria-label': 'Add a checklist item', dataset: { focus: key('add') }, maxLength: 500 });
    const add = el('form', {
      class: 'add-item',
      onsubmit: (e) => { e.preventDefault(); if (addInput.value.trim()) actions.addItem(addInput.value); },
    }, addInput);
    content = el('div', { class: 'list-wrap' }, list, add);
  }

  return el('article', { class: `note note-${note.color}`, dataset: { id: note.id }, 'aria-label': 'Sticky note' },
    bar, el('div', { class: 'note-content' }, content));
}

/** Re-rendering replaces elements; put the cursor back where it was. */
export function keepFocus(rerender) {
  const active = document.activeElement;
  const focusKey = active?.dataset?.focus;
  const sel = focusKey && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd] : null;
  rerender();
  if (!focusKey) return;
  const again = document.querySelector(`[data-focus="${CSS.escape(focusKey)}"]`);
  if (!again) return;
  again.focus({ preventScroll: true });
  if (sel && again.setSelectionRange && again.type !== 'checkbox') { try { again.setSelectionRange(...sel); } catch { /* not a text field */ } }
}

/** Applies a change to a note; shared by the desktop window and the browser demo. */
export function noteActions(N, change, { add, remove }) {
  return {
    color: (color) => change((n) => N.updateNote(n, { color })),
    list: (on) => change((n) => N.setList(n, on), true, on ? 'add' : 'body'),
    text: (body) => change((n) => N.updateNote(n, { body }), false),
    addItem: (text) => change((n) => N.addItem(n, text), true, 'add'),
    toggleItem: (itemId) => change((n) => N.toggleItem(n, itemId)),
    editItem: (itemId, text) => change((n) => N.editItem(n, itemId, text), false),
    removeItem: (itemId) => change((n) => N.removeItem(n, itemId)),
    add, remove,
  };
}
