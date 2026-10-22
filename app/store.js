// Where the pages keep their data. In the desktop app that's the main process (a JSON file in the user's
// app-data folder, reached through preload.cjs). In a browser, the GitHub Pages demo, it's localStorage.
import { emptyData, normalize, parseImport, serialize } from '../src/storage.js';
import { createNote, addItem, toggleItem } from '../src/notes.js';
import { createTask, dateKey } from '../src/tasks.js';

const KEY = 'sticky-notes-demo';

/** A few notes and tasks so the demo isn't an empty board the first time. */
function sampleData() {
  const notes = [];
  const add = (opts, items = [], done = []) => {
    let n = createNote(notes, opts);
    for (const text of items) n = addItem(n, text);
    for (const i of done) n = toggleItem(n, n.checklist[i].id);
    notes.push(n);
  };
  add({ title: 'Welcome 👋', body: 'Drag a note by its top bar, resize it from the corner, and pick a color with the dots. Everything saves as you type.', color: 'yellow' });
  add({ title: 'Groceries', color: 'green' }, ['Coffee beans', 'Oat milk', 'Bananas', 'Bread'], [0, 2]);
  add({ title: 'Ideas', body: 'Pin a note (📌) in the desktop app and it stays on top of every other window.\n\nPress Ctrl+Shift+N anywhere in Windows for a new note.', color: 'blue' });
  notes[0] = { ...notes[0], x: 40, y: 40 }; notes[1] = { ...notes[1], x: 310, y: 40 }; notes[2] = { ...notes[2], x: 580, y: 40, h: 250 };
  const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return dateKey(d); };
  const tasks = [
    createTask({ title: 'Send the invoice', due: day(-1), priority: 'high' }),
    createTask({ title: 'Team call', due: day(0), dueTime: '23:30', priority: 'medium' }),
    createTask({ title: 'Book dentist appointment', due: day(2), priority: 'low' }),
    createTask({ title: 'Read the README', priority: 'low' }),
  ];
  return { ...emptyData(), notes, tasks };
}

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function pickFile() {
  return new Promise((resolve) => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.json,application/json' });
    input.addEventListener('change', () => resolve(input.files[0] ?? null));
    input.click();
  });
}

const browserStore = {
  desktop: false,
  async load() {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved) return normalize(JSON.parse(saved));
    } catch { /* storage blocked or damaged: start from the sample */ }
    return sampleData();
  },
  async save(data) {
    try { localStorage.setItem(KEY, serialize(data)); } catch { /* private mode: keep working in memory */ }
    return true;
  },
  async exportData(data) {
    const name = `sticky-notes-${new Date().toISOString().slice(0, 10)}.json`;
    download(name, serialize(data));
    return { ok: true, file: name };
  },
  async importData() {
    const file = await pickFile();
    if (!file) return { ok: false };
    try { return { ok: true, data: parseImport(await file.text()) }; } catch (e) { return { ok: false, error: e.message }; }
  },
  async pin() { return false; },
  async closeWindow() { window.close(); },
  onChanged(callback) {
    const listener = (e) => { if (e.key === KEY) callback(); };
    window.addEventListener('storage', listener);
    return () => window.removeEventListener('storage', listener);
  },
  onNewNote() { return () => {}; },
  onShowTasks() { return () => {}; },
};

function desktopStore(api) {
  return {
    desktop: true,
    load: () => api.load(),
    save: (data) => api.save(data),
    exportData: () => api.exportData(),
    importData: () => api.importData(),
    pin: (id) => api.pin(id),
    closeWindow: () => api.closeWindow(),
    onChanged: api.onChanged,
    onNewNote: api.onNewNote,
    onShowTasks: api.onShowTasks,
  };
}

export const store = window.sticky?.desktop ? desktopStore(window.sticky) : browserStore;
