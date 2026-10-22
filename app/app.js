// The main window: the notes board and the task tracker.
import { store } from './store.js';
import { el, renderNote, keepFocus } from './note-view.js';
import * as N from '../src/notes.js';
import * as T from '../src/tasks.js';
import { mergeImport } from '../src/storage.js';
import { dueNow, markNotified, message } from '../src/reminders.js';

const $ = (s) => document.querySelector(s);
const board = $('#board');
const taskLists = $('#taskLists');
const search = $('#search');

const state = { data: null, view: 'board', query: '' };
let saveTimer = null;

// ── Saving ────────────────────────────────────────────────────────────────

function save({ now = false } = {}) {
  clearTimeout(saveTimer);
  saveTimer = null;
  const run = () => { saveTimer = null; return store.save(state.data).catch(() => toast('Couldn’t save. Your last change may be lost.')); };
  if (now) run(); else saveTimer = setTimeout(run, 300);
}
// A change typed in the last moment before closing still gets saved
window.addEventListener('beforeunload', () => { if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; store.save(state.data); } });

function setNotes(notes, { rerender = true } = {}) {
  state.data = { ...state.data, notes };
  save();
  if (rerender) keepFocus(renderBoard);
}
function setTasks(tasks) {
  state.data = { ...state.data, tasks };
  save();
  keepFocus(renderTasks);
}
const noteById = (id) => state.data.notes.find((n) => n.id === id);
const changeNote = (id, fn, opts) => { const n = noteById(id); if (n) setNotes(N.replace(state.data.notes, fn(n)), opts); };

function toast(text) {
  const t = $('#toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 3500);
}

// ── Board ─────────────────────────────────────────────────────────────────

const noteActions = {
  text: (id, field, value) => {
    changeNote(id, (n) => N.updateNote(n, { [field]: value }), { rerender: false });
    if (field === 'title') board.querySelector(`[data-id="${CSS.escape(id)}"]`)?.setAttribute('aria-label', value || 'Note');
  },
  color: (id, color) => changeNote(id, (n) => N.updateNote(n, { color })),
  addItem: (id, text) => changeNote(id, (n) => N.addItem(n, text)),
  toggleItem: (id, itemId) => changeNote(id, (n) => N.toggleItem(n, itemId)),
  editItem: (id, itemId, text) => changeNote(id, (n) => N.editItem(n, itemId, text), { rerender: false }),
  removeItem: (id, itemId) => changeNote(id, (n) => N.removeItem(n, itemId)),
  remove: (id) => {
    const note = noteById(id);
    const empty = note && !note.title.trim() && !note.body.trim() && !note.checklist.length;
    if (!empty && !confirmDelete()) return;
    setNotes(N.remove(state.data.notes, id));
    toast('Note deleted');
  },
  pin: async (id) => {
    clearTimeout(saveTimer);
    await store.save(state.data); // the pinned window reads the saved copy
    if (!(await store.pin(id))) toast('Pinning a note on top of other windows works in the desktop app.');
  },
};

// A small in-page confirmation (no blocking browser dialogs)
let pendingDelete = 0;
function confirmDelete() {
  if (Date.now() - pendingDelete < 3000) { pendingDelete = 0; return true; }
  pendingDelete = Date.now();
  toast('Click delete again to remove this note.');
  return false;
}

function renderBoard() {
  const visible = new Set(N.search(state.data.notes, state.query).map((n) => n.id));
  board.replaceChildren(...state.data.notes.map((note, i) => {
    const node = renderNote(note, noteActions, { canPin: true });
    Object.assign(node.style, { left: `${note.x}px`, top: `${note.y}px`, width: `${note.w}px`, height: `${note.h}px`, zIndex: String(i + 1) });
    if (!visible.has(note.id)) node.hidden = true;
    enableDrag(node, note.id);
    sizeWatcher.observe(node);
    return node;
  }));
  $('#empty').hidden = state.data.notes.length > 0;
  $('#noMatch').hidden = !state.query || visible.size > 0 || !state.data.notes.length;
  $('#noteCount').textContent = String(state.data.notes.length);
}

function enableDrag(node, id) {
  node.addEventListener('pointerdown', () => {
    // Bring to front without redrawing (redrawing would interrupt typing or resizing)
    const top = Math.max(0, ...[...board.children].map((c) => Number(c.style.zIndex) || 0));
    node.style.zIndex = String(top + 1);
    setNotes(N.toFront(state.data.notes, id), { rerender: false });
  });
  const bar = node.querySelector('.note-bar');
  bar.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('button')) return;
    e.preventDefault();
    bar.setPointerCapture(e.pointerId);
    const start = { x: e.clientX, y: e.clientY, left: node.offsetLeft, top: node.offsetTop };
    node.classList.add('dragging');
    const move = (ev) => {
      node.style.left = `${Math.max(0, start.left + ev.clientX - start.x)}px`;
      node.style.top = `${Math.max(0, start.top + ev.clientY - start.y)}px`;
    };
    const up = () => {
      bar.removeEventListener('pointermove', move);
      node.classList.remove('dragging');
      changeNote(id, (n) => N.updateNote(n, { x: node.offsetLeft, y: node.offsetTop }), { rerender: false });
    };
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', up, { once: true });
    bar.addEventListener('pointercancel', up, { once: true });
  });
  // Arrow keys move a focused note's bar, for keyboard users
  bar.tabIndex = 0;
  bar.setAttribute('aria-label', 'Move note with the arrow keys');
  bar.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 40 : 10;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d || e.target !== bar) return;
    e.preventDefault();
    const n = noteById(id);
    changeNote(id, (x) => N.updateNote(x, { x: n.x + d[0], y: n.y + d[1] }));
    board.querySelector(`[data-id="${CSS.escape(id)}"] .note-bar`)?.focus();
  });
}

// Saves a note's size after the user resizes it from the corner
const sizeWatcher = new ResizeObserver((entries) => {
  for (const entry of entries) {
    const node = entry.target;
    if (!node.isConnected) { sizeWatcher.unobserve(node); continue; } // a note that was just redrawn
    const note = noteById(node.dataset.id);
    if (!note) continue;
    const w = node.offsetWidth; const h = node.offsetHeight;
    if (Math.abs(w - note.w) > 1 || Math.abs(h - note.h) > 1) changeNote(note.id, (n) => N.updateNote(n, { w, h }), { rerender: false });
  }
});

function addNote() {
  showView('board');
  if (state.query) { state.query = ''; search.value = ''; }
  const area = { width: board.clientWidth || 1200, height: Math.max(board.clientHeight, window.innerHeight - 80) };
  const note = N.createNote(state.data.notes, { area });
  setNotes([...state.data.notes, note]);
  board.querySelector(`[data-focus="${CSS.escape(`${note.id}:title`)}"]`)?.focus();
}

// ── Tasks ─────────────────────────────────────────────────────────────────

const SECTIONS = [['overdue', 'Overdue'], ['today', 'Today'], ['upcoming', 'Upcoming'], ['someday', 'No date'], ['done', 'Done']];
const PRIORITY_LABEL = { high: 'High', medium: 'Medium', low: 'Low' };

function taskRow(task, now) {
  const update = (patch) => setTasks(T.replaceTask(state.data.tasks, T.updateTask(task, patch)));
  const bucket = T.bucket(task, now);
  return el('li', { class: `task priority-${task.priority} ${bucket}`, dataset: { id: task.id } },
    el('input', { type: 'checkbox', checked: task.done, 'aria-label': `Done: ${task.title}`, dataset: { focus: `${task.id}:done` }, onchange: () => setTasks(T.replaceTask(state.data.tasks, T.toggleDone(task))) }),
    el('div', { class: 'task-main' },
      el('input', { class: 'task-title', type: 'text', value: task.title, 'aria-label': 'Task', maxLength: 300, dataset: { focus: `${task.id}:title` },
        onchange: (e) => (e.target.value.trim() ? update({ title: e.target.value.trim() }) : (e.target.value = task.title)) }),
      el('div', { class: 'task-meta' },
        task.due ? el('span', { class: `due ${bucket}` }, T.dueLabel(task, now)) : null,
        el('span', { class: `chip priority-${task.priority}` }, PRIORITY_LABEL[task.priority]),
      )),
    el('div', { class: 'task-edit' },
      el('input', { type: 'date', value: task.due ?? '', 'aria-label': 'Due date', dataset: { focus: `${task.id}:due` }, onchange: (e) => update({ due: e.target.value || null }) }),
      el('input', { type: 'time', value: task.dueTime ?? '', disabled: !task.due, 'aria-label': 'Due time', dataset: { focus: `${task.id}:time` }, onchange: (e) => update({ dueTime: e.target.value || null }) }),
      el('select', { 'aria-label': 'Priority', dataset: { focus: `${task.id}:priority` }, onchange: (e) => update({ priority: e.target.value }) },
        ...T.PRIORITIES.map((p) => el('option', { value: p, selected: p === task.priority }, PRIORITY_LABEL[p]))),
      el('button', { class: 'icon danger', type: 'button', title: 'Delete task', 'aria-label': `Delete ${task.title}`, onclick: () => { setTasks(state.data.tasks.filter((t) => t.id !== task.id)); toast('Task deleted'); } }, '🗑'),
    ));
}

function renderTasks() {
  const now = new Date();
  const q = state.query;
  const tasks = q ? state.data.tasks.filter((t) => N.matches({ title: t.title, body: '', checklist: [] }, q)) : state.data.tasks;
  const v = T.views(tasks, now);
  taskLists.replaceChildren(...SECTIONS.filter(([k]) => v[k].length).map(([k, name]) => el('section', { class: `task-section section-${k}` },
    el('h2', {}, name, el('span', { class: 'count' }, String(v[k].length))),
    el('ul', { class: 'tasks' }, ...v[k].map((t) => taskRow(t, now))),
  )));
  $('#noTasks').hidden = tasks.length > 0;
  $('#noTasks').textContent = q && state.data.tasks.length ? 'No tasks match your search.' : 'No tasks yet. Add one above.';
  const c = T.counts(state.data.tasks, now);
  const badge = $('#taskBadge');
  badge.textContent = c.overdue ? `${c.overdue} overdue` : c.today ? `${c.today} today` : '';
  badge.className = `badge${c.overdue ? ' alert' : ''}`;
  badge.hidden = !badge.textContent;
}

$('#taskForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  try {
    const task = T.createTask({ title: f.title.value, due: f.due.value || null, dueTime: f.time.value || null, priority: f.priority.value });
    f.title.value = ''; f.time.value = '';
    setTasks([...state.data.tasks, task]);
    f.title.focus();
    checkReminders();
  } catch (err) {
    toast(err.message);
  }
});
$('#taskForm').due.addEventListener('change', (e) => { $('#taskForm').time.disabled = !e.target.value; });

// ── Reminders in the browser demo (the desktop app sends them from the main process) ─────

function checkReminders() {
  if (store.desktop || !state.data) return;
  const due = dueNow(state.data.tasks);
  if (!due.length) return;
  for (const task of due) {
    const { title, body } = message(task);
    if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body, icon: 'icon.png' });
    else toast(title);
  }
  setTasks(markNotified(state.data.tasks, due));
}

// ── Views, search, import and export ──────────────────────────────────────

function showView(view) {
  state.view = view;
  for (const tab of document.querySelectorAll('[role="tab"]')) {
    const on = tab.dataset.view === view;
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
  }
  $('#boardView').hidden = view !== 'board';
  $('#tasksView').hidden = view !== 'tasks';
  search.placeholder = view === 'board' ? 'Search notes' : 'Search tasks';
  if (view === 'tasks') renderTasks();
  try { localStorage.setItem('sticky-notes-view', view); } catch { /* not important */ }
}
for (const tab of document.querySelectorAll('[role="tab"]')) {
  tab.addEventListener('click', () => showView(tab.dataset.view));
  tab.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const next = state.view === 'board' ? 'tasks' : 'board'; showView(next); $(`[data-view="${next}"]`).focus(); }
  });
}

search.addEventListener('input', () => {
  state.query = search.value;
  if (state.view === 'board') renderBoard(); else renderTasks();
});

$('#newNote').addEventListener('click', addNote);

$('#exportBtn').addEventListener('click', async () => {
  save({ now: true });
  const r = await store.exportData(state.data);
  if (r.ok) toast(`Exported to ${r.file}`);
});
$('#importBtn').addEventListener('click', async () => {
  const r = await store.importData();
  if (!r.ok) { if (r.error) toast(r.error); return; }
  const before = { notes: state.data.notes.length, tasks: state.data.tasks.length };
  state.data = mergeImport(state.data, r.data);
  save({ now: true });
  renderAll();
  toast(`Imported ${state.data.notes.length - before.notes} new notes and ${state.data.tasks.length - before.tasks} new tasks.`);
});

$('#notifyBtn').addEventListener('click', async () => {
  const result = await Notification.requestPermission();
  $('#notifyBtn').hidden = result !== 'default';
  toast(result === 'granted' ? 'Reminders will pop up when a task is due.' : 'Reminders will show inside the page.');
});

document.addEventListener('keydown', (e) => {
  const typing = e.target.closest('input, textarea, select, [contenteditable]');
  if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'n') { e.preventDefault(); addNote(); }
  if (!typing && e.key === '/') { e.preventDefault(); search.focus(); }
  if (e.key === 'Escape' && document.activeElement === search) { search.value = ''; search.dispatchEvent(new Event('input')); }
});

function renderAll() {
  renderBoard();
  renderTasks();
}

// ── Start ─────────────────────────────────────────────────────────────────

state.data = await store.load();
document.body.classList.toggle('desktop', store.desktop);
$('#notifyBtn').hidden = store.desktop || !('Notification' in window) || Notification.permission !== 'default';
let savedView = 'board';
try { savedView = localStorage.getItem('sticky-notes-view') === 'tasks' ? 'tasks' : 'board'; } catch { /* default */ }
renderAll();
showView(savedView);
if (!store.desktop) save({ now: true });

store.onNewNote(addNote);
store.onShowTasks(() => showView('tasks'));
store.onChanged(async () => {
  // Another window (a pinned note, or another tab) saved: reload, unless we're mid-typing
  state.data = await store.load();
  keepFocus(renderAll);
});
setInterval(checkReminders, 30_000);
setInterval(() => { if (state.view === 'tasks' && !document.activeElement?.closest('#tasksView')) renderTasks(); }, 60_000);
checkReminders();
