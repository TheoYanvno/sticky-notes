// Saved data: one JSON document with every note and task. Shared by the Electron main process (file on disk)
// and the browser demo (localStorage), so nothing here touches the DOM or Electron.
import { COLORS } from './notes.js';
import { PRIORITIES } from './tasks.js';

export const VERSION = 1;
export const emptyData = () => ({ app: 'sticky-notes', version: VERSION, notes: [], tasks: [] });

const text = (v, max = 20000) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v, fallback, min = -1e6, max = 1e6) => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback);
const time = (v) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : null);
const id = (v) => (typeof v === 'string' && /^[\w-]{1,64}$/.test(v) ? v : null);

function cleanNote(n) {
  if (!n || typeof n !== 'object' || !id(n.id)) return null;
  const now = new Date().toISOString();
  return {
    id: n.id,
    title: text(n.title, 200),
    body: text(n.body),
    checklist: Array.isArray(n.checklist)
      ? n.checklist.filter((i) => i && id(i.id)).slice(0, 500).map((i) => ({ id: i.id, text: text(i.text, 500), done: i.done === true }))
      : [],
    color: COLORS.includes(n.color) ? n.color : COLORS[0],
    x: num(n.x, 40, 0, 20000), y: num(n.y, 40, 0, 20000),
    w: num(n.w, 240, 160, 1200), h: num(n.h, 220, 120, 1200),
    created: time(n.created) ?? now,
    updated: time(n.updated) ?? now,
  };
}

function cleanTask(t) {
  if (!t || typeof t !== 'object' || !id(t.id) || !text(t.title, 300).trim()) return null;
  const now = new Date().toISOString();
  return {
    id: t.id,
    title: text(t.title, 300),
    due: typeof t.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.due) ? t.due : null,
    dueTime: typeof t.dueTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t.dueTime) ? t.dueTime : null,
    priority: PRIORITIES.includes(t.priority) ? t.priority : 'medium',
    done: t.done === true,
    notified: t.notified === true,
    created: time(t.created) ?? now,
    updated: time(t.updated) ?? now,
  };
}

/** Turns anything (a saved file, an import, an old version) into valid data, dropping what can't be repaired. */
export function normalize(raw) {
  const data = emptyData();
  if (!raw || typeof raw !== 'object') return data;
  const seen = new Set();
  const unique = (x) => x && !seen.has(x.id) && seen.add(x.id);
  data.notes = (Array.isArray(raw.notes) ? raw.notes : []).map(cleanNote).filter(unique);
  data.tasks = (Array.isArray(raw.tasks) ? raw.tasks : []).map(cleanTask).filter(unique);
  return data;
}

export const serialize = (data) => JSON.stringify(normalize(data), null, 2);

/** Reads an export file's text. Throws a readable error when it isn't one. */
export function parseImport(textContent) {
  let raw;
  try { raw = JSON.parse(textContent); } catch { throw new Error('That file is not valid JSON.'); }
  if (!raw || raw.app !== 'sticky-notes' || !Array.isArray(raw.notes) || !Array.isArray(raw.tasks)) {
    throw new Error('That file is not a Sticky Notes export.');
  }
  return normalize(raw);
}

/** Adds imported notes and tasks to the current ones. Same id on both sides: the most recently updated copy wins. */
export function mergeImport(current, incoming) {
  const merge = (a, b) => {
    const byId = new Map(a.map((x) => [x.id, x]));
    for (const x of b) {
      const mine = byId.get(x.id);
      if (!mine || Date.parse(x.updated) > Date.parse(mine.updated)) byId.set(x.id, x);
    }
    return [...byId.values()];
  };
  const cur = normalize(current); const inc = normalize(incoming);
  return { ...cur, notes: merge(cur.notes, inc.notes), tasks: merge(cur.tasks, inc.tasks) };
}

/**
 * Saves without ever leaving a half-written file: write a temporary file, then rename it over the old one
 * (rename is atomic on the same disk). The previous version is kept as .bak. `fs` is node:fs/promises.
 */
export async function writeAtomic(fs, file, contents) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  const handle = await fs.open(tmp, 'w');
  try {
    await handle.writeFile(contents, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  try { await fs.copyFile(file, `${file}.bak`); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  await fs.rename(tmp, file);
}

/** Loads the data file. A missing file is a fresh start; a damaged one falls back to the .bak copy. */
export async function loadFile(fs, file) {
  try {
    return normalize(JSON.parse(await fs.readFile(file, 'utf8')));
  } catch (e) {
    // Keep a damaged file for inspection instead of overwriting it on the next save
    if (e.code !== 'ENOENT') await fs.copyFile(file, `${file}.corrupt`).catch(() => {});
  }
  try {
    return normalize(JSON.parse(await fs.readFile(`${file}.bak`, 'utf8')));
  } catch {
    return emptyData();
  }
}
