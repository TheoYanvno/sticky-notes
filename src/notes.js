// Sticky notes: plain objects, changed only through these functions so the board, the pinned windows
// and the tests all agree on the rules.

export const COLORS = ['yellow', 'pink', 'blue', 'green', 'purple', 'orange'];
export const SIZE = { w: 240, h: 220, minW: 160, minH: 120 };

export const uid = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
const stamp = (now) => (now ?? new Date()).toISOString();

/** Where the next note goes: cascade down and right from the last one, wrapping back to the top. */
export function nextPosition(notes, area = { width: 1200, height: 800 }) {
  const step = 32;
  const last = notes.at(-1);
  let x = last ? last.x + step : 40;
  let y = last ? last.y + step : 40;
  if (x + SIZE.w > area.width) x = 40;
  if (y + SIZE.h > area.height) y = 40;
  return { x, y };
}

export function createNote(notes, { title = '', body = '', color, area, now } = {}) {
  const at = nextPosition(notes, area);
  const t = stamp(now);
  return {
    id: uid(), title, body, checklist: [],
    color: COLORS.includes(color) ? color : COLORS[notes.length % COLORS.length],
    ...at, w: SIZE.w, h: SIZE.h, created: t, updated: t,
  };
}

/** Returns a changed copy. Size and position are kept inside sensible limits. */
export function updateNote(note, patch, now) {
  const next = { ...note, ...patch, updated: stamp(now) };
  next.x = Math.max(0, Math.round(next.x));
  next.y = Math.max(0, Math.round(next.y));
  next.w = Math.max(SIZE.minW, Math.round(next.w));
  next.h = Math.max(SIZE.minH, Math.round(next.h));
  if (!COLORS.includes(next.color)) next.color = note.color;
  return next;
}

export const replace = (list, item) => list.map((x) => (x.id === item.id ? item : x));
export const remove = (list, id) => list.filter((x) => x.id !== id);

/** Brings a note to the front (last in the list is drawn on top). */
export function toFront(notes, id) {
  const note = notes.find((n) => n.id === id);
  return note ? [...remove(notes, id), note] : notes;
}

// Checklists
export function addItem(note, text, now) {
  const clean = text.trim();
  if (!clean) return note;
  return updateNote(note, { checklist: [...note.checklist, { id: uid(), text: clean, done: false }] }, now);
}
export const toggleItem = (note, itemId, now) =>
  updateNote(note, { checklist: note.checklist.map((i) => (i.id === itemId ? { ...i, done: !i.done } : i)) }, now);
export const editItem = (note, itemId, text, now) =>
  updateNote(note, { checklist: note.checklist.map((i) => (i.id === itemId ? { ...i, text } : i)) }, now);
export const removeItem = (note, itemId, now) =>
  updateNote(note, { checklist: note.checklist.filter((i) => i.id !== itemId) }, now);
export const clearDone = (note, now) => updateNote(note, { checklist: note.checklist.filter((i) => !i.done) }, now);

export function progress(note) {
  const total = note.checklist.length;
  const done = note.checklist.filter((i) => i.done).length;
  return { done, total, label: total ? `${done}/${total}` : '' };
}

/** Lower-case, accents removed, so "cafe" finds "Café". */
export const fold = (s) => String(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Every word of the query must appear somewhere in the note (title, text or checklist). */
export function matches(note, query) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = fold([note.title, note.body, ...note.checklist.map((i) => i.text)].join('\n'));
  return words.every((w) => hay.includes(w));
}

export const search = (notes, query) => notes.filter((n) => matches(n, query));

/** A short label for the window title of a pinned note. */
export function label(note) {
  const first = note.title.trim() || note.body.trim().split('\n')[0] || note.checklist[0]?.text || 'Note';
  return first.length > 40 ? `${first.slice(0, 39)}…` : first;
}
