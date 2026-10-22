// A pinned note: one note in its own small window that stays on top of everything else.
// Edits save straight away, and the board updates to match.
import { store } from './store.js';
import { renderNote, keepFocus } from './note-view.js';
import * as N from '../src/notes.js';

const id = new URLSearchParams(location.search).get('id');
const root = document.getElementById('note');
let data = await store.load();
let saveTimer = null;

const note = () => data.notes.find((n) => n.id === id);

function change(fn, rerender = true) {
  const n = note();
  if (!n) return;
  data = { ...data, notes: N.replace(data.notes, fn(n)) };
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveTimer = null; store.save(data); }, 250);
  if (rerender) keepFocus(render);
}

const actions = {
  text: (_id, field, value) => change((n) => N.updateNote(n, { [field]: value }), false),
  color: (_id, color) => change((n) => N.updateNote(n, { color })),
  addItem: (_id, text) => change((n) => N.addItem(n, text)),
  toggleItem: (_id, itemId) => change((n) => N.toggleItem(n, itemId)),
  editItem: (_id, itemId, text) => change((n) => N.editItem(n, itemId, text), false),
  removeItem: (_id, itemId) => change((n) => N.removeItem(n, itemId)),
  close: async () => { if (saveTimer) { clearTimeout(saveTimer); await store.save(data); } store.closeWindow(); },
};

function render() {
  const n = note();
  if (!n) { store.closeWindow(); return; }
  document.title = N.label(n);
  root.replaceChildren(renderNote(n, actions, { pinned: true }));
}

render();
store.onChanged(async () => {
  if (saveTimer) return; // our own edit is about to be saved
  data = await store.load();
  keepFocus(render);
});
