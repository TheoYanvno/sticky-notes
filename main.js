// Electron main process. Every note is its own small window that sits on the desktop, where you left it,
// until you delete it. Closing the app keeps the notes; they come back on the next start (and at sign-in).
// The pages never get Node access; everything they can do goes through the small API in preload.cjs.
import { app, BrowserWindow, ipcMain, Tray, Menu, globalShortcut, nativeImage, screen, shell } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFile, writeAtomic, serialize, normalize } from './src/storage.js';
import { createNote, updateNote, canAdd, label, remove, MAX_NOTES, SIZE } from './src/notes.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ICON = path.join(here, 'build', 'icon.png');
const PRELOAD = path.join(here, 'preload.cjs');
const SHORTCUT = 'CommandOrControl+Shift+N';
// The window is see-through: only the note itself (and its soft shadow) shows on the desktop, with no frame,
// title bar or square edges. MARGIN is the room around the note for that shadow.
const MARGIN = 10;

let tray = null;
let data = null;               // the notes, kept in memory and written on every change
let saving = Promise.resolve();
const windows = new Map();     // note id → its window

const dataFile = () => path.join(app.getPath('userData'), 'sticky-notes.json');
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');

const secureWebPreferences = { preload: PRELOAD, contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: true };

function persist() {
  data = normalize(data);
  const text = serialize(data);
  // Saves run one after another so an older save can never land after a newer one
  saving = saving.then(() => writeAtomic(fs, dataFile(), text)).catch((e) => console.error('Save failed', e));
  return saving;
}

/** Tells every note window how many notes exist, so + can switch itself off at three. */
function broadcastCount() {
  for (const win of windows.values()) if (!win.isDestroyed()) win.webContents.send('notes:count', data.notes.length);
  updateTray();
}

// ── Note windows ──────────────────────────────────────────────────────────

/** Keeps a note on a screen that still exists (a second monitor may have been unplugged). */
function onScreen(note) {
  const visible = screen.getAllDisplays().some(({ workArea: a }) =>
    note.x + 40 > a.x && note.y + 20 > a.y && note.x < a.x + a.width - 40 && note.y < a.y + a.height - 40);
  if (visible) return note;
  const a = screen.getPrimaryDisplay().workArea;
  return { ...note, x: a.x + 40, y: a.y + 40 };
}

function openNote(note) {
  const existing = windows.get(note.id);
  if (existing && !existing.isDestroyed()) { existing.show(); return existing; }
  const n = onScreen(note);
  const win = new BrowserWindow({
    x: n.x, y: n.y, width: n.w + 2 * MARGIN, height: n.h + 2 * MARGIN,
    title: label(n), icon: ICON, frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false,
    // Transparent windows can't be resized from their edges, so the note has its own corner grip (note:resize)
    resizable: false, maximizable: false, fullscreenable: false,
    show: false, skipTaskbar: true, webPreferences: secureWebPreferences,
  });
  win.loadFile(path.join(here, 'app', 'note.html'), { query: { id: n.id } });
  win.once('ready-to-show', () => win.showInactive());

  // Remember where the note was moved or resized to
  let timer = null;
  const remember = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (win.isDestroyed()) return;
      const [x, y] = win.getPosition(); const [ww, wh] = win.getSize(); const w = ww - 2 * MARGIN; const h = wh - 2 * MARGIN;
      const current = data.notes.find((x2) => x2.id === note.id);
      if (!current) return;
      data.notes = data.notes.map((x2) => (x2.id === note.id ? { ...current, x, y, w, h } : x2));
      persist();
    }, 400);
  };
  win.on('move', remember);
  win.on('resize', remember);
  win.on('closed', () => windows.delete(note.id));
  windows.set(note.id, win);
  return win;
}

function newNote(fromId) {
  if (!canAdd(data.notes)) {
    // Already three: show them instead, so it's clear why there's no new one
    for (const win of windows.values()) win.show();
    return null;
  }
  const from = data.notes.find((n) => n.id === fromId);
  const display = from ? screen.getDisplayNearestPoint({ x: from.x, y: from.y }) : screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const note = createNote(data.notes, { from, area: display.workArea });
  data.notes = [...data.notes, note];
  persist();
  const win = openNote(note);
  win.once('ready-to-show', () => win.focus());
  broadcastCount();
  return note.id;
}

function deleteNote(id) {
  data.notes = remove(data.notes, id);
  persist();
  windows.get(id)?.destroy();
  windows.delete(id);
  broadcastCount();
}

function showAll() {
  if (!data.notes.length) { newNote(); return; }
  for (const note of data.notes) openNote(note).show();
}

// ── Tray, shortcut and start with Windows ─────────────────────────────────

async function readSettings() {
  try { return JSON.parse(await fs.readFile(settingsFile(), 'utf8')); } catch { return {}; }
}

function updateTray() {
  if (!tray) return;
  const full = !canAdd(data.notes);
  const startsWithWindows = app.getLoginItemSettings().openAtLogin;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: full ? `New note (${MAX_NOTES} is the limit)` : 'New note', accelerator: SHORTCUT, enabled: !full, click: () => newNote() },
    { label: 'Show my notes', click: showAll },
    { type: 'separator' },
    {
      label: 'Start with Windows', type: 'checkbox', checked: startsWithWindows,
      click: async (item) => {
        app.setLoginItemSettings({ openAtLogin: item.checked });
        await writeAtomic(fs, settingsFile(), JSON.stringify({ ...(await readSettings()), startWithWindows: item.checked }));
      },
    },
    { label: 'Quit (notes stay saved)', click: () => app.quit() },
  ]));
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }));
  tray.setToolTip('Sticky Notes');
  tray.on('click', showAll);
  updateTray();
}

// ── What the note pages may ask for ───────────────────────────────────────

function registerIpc() {
  ipcMain.handle('note:get', (_e, id) => ({ note: data.notes.find((n) => n.id === String(id)) ?? null, count: data.notes.length }));

  // The page owns what's written on the note; the window owns where it is. So only these fields come from the page.
  ipcMain.handle('note:save', (e, incoming) => {
    const current = data.notes.find((n) => n.id === incoming?.id);
    if (!current) return false;
    const { body, list, checklist, color } = incoming;
    const next = normalize({ notes: [updateNote(current, { body, list, checklist, color })] }).notes[0];
    data.notes = data.notes.map((n) => (n.id === next.id ? next : n));
    const win = BrowserWindow.fromWebContents(e.sender);
    if (win && !win.isDestroyed()) win.setTitle(label(next));
    return persist().then(() => true);
  });

  // Dragging the note's corner grip: the page asks for a new note size, the window grows around it
  ipcMain.handle('note:resize', (e, size) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const w = Math.round(Math.min(1200, Math.max(SIZE.minW, Number(size?.w) || SIZE.w)));
    const h = Math.round(Math.min(1200, Math.max(SIZE.minH, Number(size?.h) || SIZE.h)));
    if (win && !win.isDestroyed()) win.setSize(w + 2 * MARGIN, h + 2 * MARGIN);
    return { w, h };
  });

  ipcMain.handle('note:new', (_e, fromId) => newNote(String(fromId ?? '')));
  ipcMain.handle('note:delete', (_e, id) => { deleteNote(String(id)); return true; });
}

// Pages may not navigate away or open new windows; links open in the default browser instead
app.on('web-contents-created', (_e, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) e.preventDefault();
  });
});

// ── Start-up ──────────────────────────────────────────────────────────────

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showAll);
  app.setAppUserModelId('com.theoyanvno.stickynotes');

  app.whenReady().then(async () => {
    data = await loadFile(fs, dataFile());
    // Notes stay on screen until they're deleted, so the app starts with Windows unless that was switched off
    const settings = await readSettings();
    if (app.isPackaged && settings.startWithWindows !== false) app.setLoginItemSettings({ openAtLogin: true });
    registerIpc();
    createTray();
    if (data.notes.length) for (const note of data.notes) openNote(note);
    else newNote();
    if (!globalShortcut.register(SHORTCUT, () => newNote())) console.warn(`${SHORTCUT} is already used by another app`);
  });

  app.on('will-quit', () => globalShortcut.unregisterAll());
  // Deleting the last note closes its window; the app stays in the tray so a new one is a click away
  app.on('window-all-closed', () => {});
  app.on('activate', showAll);
}
