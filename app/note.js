// One note in its own desktop window. Edits save as you type; the window remembers where it was moved.
import { renderNote, keepFocus, noteActions } from './note-view.js';
import * as N from '../src/notes.js';

const api = window.sticky;
const id = new URLSearchParams(location.search).get('id');
const root = document.getElementById('note');
let { note, count } = await api.getNote(id);
let saveTimer = null;

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveTimer = null; api.saveNote(note); }, 250);
}

/** focusAfter: put the cursor in this part of the note afterwards (e.g. the "add an item" box). */
function change(fn, rerender = true, focusAfter = null) {
  note = fn(note);
  save();
  if (!rerender) { document.title = N.label(note); return; }
  keepFocus(render);
  if (focusAfter) root.querySelector(`[data-focus="${CSS.escape(`${note.id}:${focusAfter}`)}"]`)?.focus();
}

const actions = noteActions(N, change, {
  add: () => api.newNote(id),
  remove: async () => { clearTimeout(saveTimer); await api.deleteNote(id); },
});

// The window around the note is see-through and has no edges to drag, so the note gets a corner grip
function grip() {
  const handle = document.createElement('div');
  handle.className = 'grip';
  handle.title = 'Drag to resize';
  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    const start = { x: e.screenX, y: e.screenY, w: note.w, h: note.h };
    let frame = 0;
    const move = (ev) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(async () => {
        const size = await api.resize(start.w + ev.screenX - start.x, start.h + ev.screenY - start.y);
        note = { ...note, ...size };
      });
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', () => handle.removeEventListener('pointermove', move), { once: true });
  });
  return handle;
}

function render() {
  document.title = N.label(note);
  const card = renderNote(note, actions, { canAdd: N.canAdd({ length: count }) });
  card.append(grip());
  root.replaceChildren(card);
}

if (!note) window.close();
else {
  render();
  if (N.isEmpty(note)) root.querySelector('textarea, .add-item input')?.focus();
  api.onCount((n) => { count = n; keepFocus(render); });
  // Don't lose the last few keystrokes if the app quits mid-save
  window.addEventListener('beforeunload', () => { if (saveTimer) api.saveNote(note); });
}
