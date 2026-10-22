// Draws one sticky note. Used by the board and by the pinned always-on-top window.
// User text only ever goes in through .value / .textContent, never as HTML.
import { COLORS, progress } from '../src/notes.js';

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

const COLOR_NAMES = { yellow: 'Yellow', pink: 'Pink', blue: 'Blue', green: 'Green', purple: 'Purple', orange: 'Orange' };

/**
 * actions: { text(id, field, value), color(id, c), addItem(id, text), toggleItem(id, itemId), editItem(id, itemId, text),
 *            removeItem(id, itemId), remove(id), pin(id) }
 */
export function renderNote(note, actions, { pinned = false, canPin = true } = {}) {
  const p = progress(note);
  const key = (part) => `${note.id}:${part}`;

  const bar = el('header', { class: 'note-bar' },
    el('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Note color' },
      ...COLORS.map((c) => el('button', {
        class: `swatch swatch-${c}`, type: 'button', title: COLOR_NAMES[c], role: 'radio',
        'aria-checked': String(c === note.color), 'aria-label': COLOR_NAMES[c],
        onclick: () => actions.color(note.id, c),
      }))),
    p.total ? el('span', { class: 'progress', title: 'Checklist items done' }, p.label) : null,
    el('span', { class: 'spacer' }),
    !pinned && canPin ? el('button', { class: 'icon', type: 'button', title: 'Pin on top of other windows', 'aria-label': 'Pin on top', onclick: () => actions.pin(note.id) }, '📌') : null,
    !pinned ? el('button', { class: 'icon danger', type: 'button', title: 'Delete note', 'aria-label': 'Delete note', onclick: () => actions.remove(note.id) }, '🗑') : null,
    pinned ? el('button', { class: 'icon', type: 'button', title: 'Close (the note stays on the board)', 'aria-label': 'Close', onclick: () => actions.close() }, '✕') : null,
  );

  const title = el('input', {
    class: 'note-title', type: 'text', value: note.title, placeholder: 'Title', maxLength: 200, 'aria-label': 'Note title',
    dataset: { focus: key('title') }, oninput: (e) => actions.text(note.id, 'title', e.target.value),
  });
  const body = el('textarea', {
    class: 'note-body', value: note.body, placeholder: 'Write something…', 'aria-label': 'Note text',
    dataset: { focus: key('body') }, oninput: (e) => actions.text(note.id, 'body', e.target.value),
  });

  const list = el('ul', { class: 'checklist' }, ...note.checklist.map((item) => el('li', { class: item.done ? 'done' : '' },
    el('input', { type: 'checkbox', checked: item.done, 'aria-label': `Done: ${item.text}`, dataset: { focus: key(`check-${item.id}`) }, onchange: () => actions.toggleItem(note.id, item.id) }),
    el('input', { class: 'item-text', type: 'text', value: item.text, 'aria-label': 'Checklist item', dataset: { focus: key(`item-${item.id}`) }, oninput: (e) => actions.editItem(note.id, item.id, e.target.value) }),
    el('button', { class: 'icon small', type: 'button', title: 'Remove item', 'aria-label': `Remove ${item.text}`, onclick: () => actions.removeItem(note.id, item.id) }, '✕'),
  )));

  const addInput = el('input', { type: 'text', placeholder: '+ Add a checklist item', 'aria-label': 'Add a checklist item', dataset: { focus: key('add') }, maxLength: 500 });
  const add = el('form', {
    class: 'add-item',
    onsubmit: (e) => { e.preventDefault(); if (addInput.value.trim()) actions.addItem(note.id, addInput.value); },
  }, addInput);

  return el('article', { class: `note note-${note.color}${pinned ? ' pinned' : ''}${note.checklist.length ? ' has-list' : ''}`, dataset: { id: note.id }, 'aria-label': note.title || 'Note' },
    bar, el('div', { class: 'note-content' }, title, body, list, add));
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
