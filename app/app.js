// The browser version (the GitHub Pages demo): the same notes on a desk, saved in localStorage.
// In the desktop app each note is its own window instead (see note.js).
import { renderNote, keepFocus, noteActions } from './note-view.js';
import { normalize, serialize, emptyData } from '../src/storage.js';
import * as N from '../src/notes.js';

const KEY = 'sticky-notes-demo-v2';
const desk = document.getElementById('desk');

function load() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) return normalize(JSON.parse(saved)).notes;
  } catch { /* storage blocked or damaged: start fresh */ }
  const first = N.createNote([], { area: area() });
  return [{ ...first, body: 'Hi! Pick a color at the top, tap ☑ to make a checklist, or + for another note (up to 3).\n\nNotes stay here until you delete them.' }];
}

let notes = load();
let saveTimer = null;

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, serialize({ ...emptyData(), notes })); } catch { /* private mode: keep working in memory */ }
  }, 250);
}

function area() {
  return { x: 0, y: 0, width: Math.max(desk.clientWidth, N.SIZE.w + 80), height: Math.max(desk.clientHeight, N.SIZE.h + 80) };
}

function update(id, fn, rerender = true, focusAfter = null) {
  notes = notes.map((n) => (n.id === id ? fn(n) : n));
  save();
  if (!rerender) return;
  keepFocus(render);
  if (focusAfter) desk.querySelector(`[data-focus="${CSS.escape(`${id}:${focusAfter}`)}"]`)?.focus();
}

function addNote(fromId) {
  const from = notes.find((n) => n.id === fromId);
  const note = N.createNote(notes, { from, area: area() });
  if (!note) return;
  notes = [...notes, note];
  save();
  render();
  desk.querySelector(`[data-focus="${CSS.escape(`${note.id}:body`)}"]`)?.focus();
}

function removeNote(id) {
  notes = N.remove(notes, id);
  save();
  render();
}

// Dragging a note by its top bar (not by its buttons)
function draggable(card, note) {
  const bar = card.querySelector('.note-bar');
  bar.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('button')) return;
    e.preventDefault();
    notes = N.toFront(notes, note.id);
    desk.append(card); // on top while dragging
    const start = { x: e.clientX, y: e.clientY, left: note.x, top: note.y };
    card.classList.add('dragging');
    bar.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const a = area();
      // Keep the whole note on the desk (or at least its top bar, if the window is smaller than the note)
      const x = Math.max(0, Math.min(start.left + ev.clientX - start.x, a.width - card.offsetWidth));
      const y = Math.max(0, Math.min(start.top + ev.clientY - start.y, a.height - Math.min(card.offsetHeight, a.height)));
      card.style.left = `${x}px`; card.style.top = `${y}px`;
    };
    const up = () => {
      card.classList.remove('dragging');
      bar.removeEventListener('pointermove', move);
      update(note.id, (n) => N.updateNote(n, { x: parseFloat(card.style.left), y: parseFloat(card.style.top) }), false);
    };
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', up, { once: true });
    bar.addEventListener('pointercancel', up, { once: true });
  });
  // Resizing uses the corner handle the browser draws (CSS resize); remember the new size
  new ResizeObserver(() => {
    const w = card.offsetWidth; const h = card.offsetHeight;
    const current = notes.find((n) => n.id === note.id);
    if (current && (Math.abs(current.w - w) > 1 || Math.abs(current.h - h) > 1) && !matchMedia('(max-width: 600px)').matches) {
      update(note.id, (n) => N.updateNote(n, { w, h }), false);
    }
  }).observe(card);
}

function render() {
  const canAdd = N.canAdd(notes);
  desk.replaceChildren(...notes.map((note) => {
    const actions = noteActions(N, (fn, rerender, focusAfter) => update(note.id, fn, rerender, focusAfter), {
      add: () => addNote(note.id),
      remove: () => removeNote(note.id),
    });
    const card = renderNote(note, actions, { canAdd });
    Object.assign(card.style, { left: `${note.x}px`, top: `${note.y}px`, width: `${note.w}px`, height: `${note.h}px` });
    draggable(card, note);
    return card;
  }));
  document.getElementById('empty').hidden = notes.length > 0;
}

document.getElementById('firstNote').addEventListener('click', () => addNote());
// Another tab changed the notes: show the latest
window.addEventListener('storage', (e) => { if (e.key === KEY) { notes = load(); keepFocus(render); } });
render();
