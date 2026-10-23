// Saved data: one small JSON document with the notes. Shared by the Electron main process (a file on disk)
// and the browser demo (localStorage), so nothing here touches the DOM or Electron.
import { COLORS, MAX_NOTES, SIZE } from './notes.js';

export const VERSION = 2;
export const emptyData = () => ({ app: 'sticky-notes', version: VERSION, notes: [] });

const text = (v, max = 20000) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v, fallback, min, max) => (Number.isFinite(v) ? Math.round(Math.min(max, Math.max(min, v))) : fallback);
const time = (v) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : null);
const id = (v) => (typeof v === 'string' && /^[\w-]{1,64}$/.test(v) ? v : null);

// Version 1 had six colors; the two that were dropped become the nearest of the four that are left
const OLD_COLORS = { purple: 'blue', orange: 'yellow' };

function cleanNote(n) {
  if (!n || typeof n !== 'object' || !id(n.id)) return null;
  const now = new Date().toISOString();
  const checklist = Array.isArray(n.checklist)
    ? n.checklist.filter((i) => i && id(i.id)).slice(0, 500).map((i) => ({ id: i.id, text: text(i.text, 500), done: i.done === true }))
    : [];
  // Version 1 notes had a title; it becomes the first line so nothing is lost
  const body = [text(n.title, 200).trim(), text(n.body)].filter(Boolean).join('\n');
  const color = COLORS.includes(n.color) ? n.color : OLD_COLORS[n.color] ?? COLORS[0];
  return {
    id: n.id,
    body,
    list: typeof n.list === 'boolean' ? n.list : checklist.length > 0 && !body.trim(),
    checklist,
    color,
    // Windows can sit on a screen to the left of or above the main one, so positions may be negative
    x: num(n.x, 40, -20000, 20000), y: num(n.y, 40, -20000, 20000),
    w: num(n.w, SIZE.w, SIZE.minW, 1200), h: num(n.h, SIZE.h, SIZE.minH, 1200),
    created: time(n.created) ?? now,
    updated: time(n.updated) ?? now,
  };
}

/**
 * Turns anything (a saved file, an older version, a damaged edit) into valid data, dropping what can't be
 * repaired. Only three notes are allowed; if an older file has more, the three edited most recently stay.
 */
export function normalize(raw) {
  const data = emptyData();
  if (!raw || typeof raw !== 'object') return data;
  const seen = new Set();
  const unique = (x) => x && !seen.has(x.id) && seen.add(x.id);
  let notes = (Array.isArray(raw.notes) ? raw.notes : []).map(cleanNote).filter(unique);
  if (notes.length > MAX_NOTES) {
    const keep = new Set([...notes].sort((a, b) => Date.parse(b.updated) - Date.parse(a.updated)).slice(0, MAX_NOTES).map((n) => n.id));
    notes = notes.filter((n) => keep.has(n.id));
  }
  data.notes = notes;
  return data;
}

export const serialize = (data) => JSON.stringify(normalize(data), null, 2);

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
