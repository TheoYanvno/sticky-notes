// Electron main process: windows, tray, global shortcut, reminders and the data file.
// The pages never get Node access; everything they can do goes through the small API in preload.cjs.
import { app, BrowserWindow, ipcMain, Tray, Menu, globalShortcut, Notification, dialog, nativeImage, shell } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFile, writeAtomic, serialize, normalize, parseImport } from './src/storage.js';
import { dueNow, nextDelay, markNotified, message } from './src/reminders.js';
import { label } from './src/notes.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ICON = path.join(here, 'build', 'icon.png');
const PRELOAD = path.join(here, 'preload.cjs');
const SHORTCUT = 'CommandOrControl+Shift+N';

let mainWindow = null;
let tray = null;
let quitting = false;
let data = null;               // the current data, kept in memory and written on every save
let saving = Promise.resolve();
let reminderTimer = null;
const pinned = new Map();      // note id → its always-on-top window

const dataFile = () => path.join(app.getPath('userData'), 'sticky-notes.json');

const secureWebPreferences = { preload: PRELOAD, contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: true };

async function save(next, from) {
  data = normalize(next);
  const text = serialize(data);
  // Saves run one after another so an older save can never land after a newer one
  saving = saving.then(() => writeAtomic(fs, dataFile(), text)).catch((e) => console.error('Save failed', e));
  await saving;
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.webContents !== from && !win.isDestroyed()) win.webContents.send('data:changed');
  }
  updatePinnedTitles();
  scheduleReminders();
}

// ── Windows ───────────────────────────────────────────────────────────────

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200, height: 800, minWidth: 640, minHeight: 480,
    title: 'Sticky Notes', icon: ICON, backgroundColor: '#f4efe6', show: false,
    webPreferences: secureWebPreferences,
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(here, 'app', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  // Closing the window keeps the app in the tray, so reminders still fire
  mainWindow.on('close', (e) => {
    if (!quitting) { e.preventDefault(); mainWindow.hide(); }
  });
}

function showMain() {
  if (!mainWindow) createMainWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function newNote() {
  showMain();
  const send = () => mainWindow.webContents.send('note:new');
  if (mainWindow.webContents.isLoading()) mainWindow.webContents.once('did-finish-load', send); else send();
}

function pinNote(id) {
  const note = data.notes.find((n) => n.id === id);
  if (!note) return false;
  const open = pinned.get(id);
  if (open && !open.isDestroyed()) { open.show(); open.focus(); return true; }
  const win = new BrowserWindow({
    width: Math.max(220, note.w), height: Math.max(200, note.h + 36), minWidth: 200, minHeight: 160,
    title: label(note), icon: ICON, alwaysOnTop: true, frame: false, skipTaskbar: false,
    backgroundColor: '#fff7b0', webPreferences: secureWebPreferences,
  });
  win.setAlwaysOnTop(true, 'floating');
  win.loadFile(path.join(here, 'app', 'pin.html'), { query: { id } });
  win.on('closed', () => pinned.delete(id));
  pinned.set(id, win);
  return true;
}

function updatePinnedTitles() {
  for (const [id, win] of pinned) {
    const note = data.notes.find((n) => n.id === id);
    if (!note) win.close(); else if (!win.isDestroyed()) win.setTitle(label(note));
  }
}

// ── Tray and shortcut ─────────────────────────────────────────────────────

function createTray() {
  tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }));
  tray.setToolTip('Sticky Notes');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Sticky Notes', click: showMain },
    { label: 'New note', accelerator: SHORTCUT, click: newNote },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('click', showMain);
}

// ── Reminders ─────────────────────────────────────────────────────────────

function scheduleReminders() {
  clearTimeout(reminderTimer);
  // Already due (e.g. just added with a past time): announce now; otherwise wake for the next one
  const delay = dueNow(data.tasks).length ? 500 : nextDelay(data.tasks) ?? 60_000;
  reminderTimer = setTimeout(checkReminders, delay);
}

async function checkReminders() {
  const due = dueNow(data.tasks);
  if (due.length && Notification.isSupported()) {
    for (const task of due) {
      const n = new Notification({ ...message(task), icon: ICON });
      n.on('click', () => { showMain(); mainWindow.webContents.send('view:tasks'); });
      n.show();
    }
  }
  if (due.length) await save({ ...data, tasks: markNotified(data.tasks, due) });
  else scheduleReminders();
}

// ── What the pages may ask for ────────────────────────────────────────────

function registerIpc() {
  ipcMain.handle('data:load', () => data);
  ipcMain.handle('data:save', (e, next) => save(next, e.sender).then(() => true));
  ipcMain.handle('note:pin', (_e, id) => pinNote(String(id)));
  ipcMain.handle('window:close', (e) => { BrowserWindow.fromWebContents(e.sender)?.close(); });

  ipcMain.handle('data:export', async (e) => {
    const { canceled, filePath } = await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender), {
      title: 'Export notes and tasks',
      defaultPath: `sticky-notes-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'Sticky Notes export', extensions: ['json'] }],
    });
    if (canceled || !filePath) return { ok: false };
    await fs.writeFile(filePath, serialize(data), 'utf8');
    return { ok: true, file: path.basename(filePath) };
  });

  ipcMain.handle('data:import', async (e) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), {
      title: 'Import notes and tasks', properties: ['openFile'],
      filters: [{ name: 'Sticky Notes export', extensions: ['json'] }],
    });
    if (canceled || !filePaths?.[0]) return { ok: false };
    try {
      return { ok: true, data: parseImport(await fs.readFile(filePaths[0], 'utf8')) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
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
  app.on('second-instance', showMain);
  app.setAppUserModelId('com.theoyanvno.stickynotes'); // needed for Windows notifications

  app.whenReady().then(async () => {
    data = await loadFile(fs, dataFile());
    registerIpc();
    createMainWindow();
    createTray();
    if (!globalShortcut.register(SHORTCUT, newNote)) console.warn(`${SHORTCUT} is already used by another app`);
    scheduleReminders();
  });

  app.on('before-quit', () => { quitting = true; });
  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('window-all-closed', () => { /* stay in the tray */ });
  app.on('activate', showMain);
}
