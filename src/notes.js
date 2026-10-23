// Sticky notes: plain objects, changed only through these functions so the desktop windows, the browser
// demo and the tests all follow the same rules.
//
// A note is just a note: four colors, free text or a checklist, no title. At most three exist at a time.

export const COLORS = ['yellow', 'pink', 'blue', 'green'];
export const MAX_NOTES = 3;
export const SIZE = { w: 260, h: 260, minW: 200, minH: 160 };

export const uid = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
const stamp = (now) => (now ?? new Date()).toISOString();

export const canAdd = (notes) => notes.length < MAX_NOTES;

/** The first color no other note is using, so three notes are easy to tell apart. */
export function freeColor(notes) {
  return COLORS.find((c) => !notes.some((n) => n.color === c)) ?? COLORS[0];
}

/**
 * Where a new note goes. Next to the note the + was pressed on (to its right, or below if there's no room),
 * otherwise cascading from the top-left. `area` is the visible space: the screen or the browser window.
 */
export function nextPosition(notes, { from, area = { x: 0, y: 0, width: 1200, height: 800 } } = {}) {
  const gap = 24;
  const fits = (x, y) => x >= area.x && y >= area.y && x + SIZE.w <= area.x + area.width && y + SIZE.h <= area.y + area.height;
  const free = (x, y) => !notes.some((n) => Math.abs(n.x - x) < 40 && Math.abs(n.y - y) < 40);
  if (from) {
    const tries = [[from.x + from.w + gap, from.y], [from.x, from.y + from.h + gap], [from.x - SIZE.w - gap, from.y], [from.x + 40, from.y + 40]];
    for (const [x, y] of tries) if (fits(x, y) && free(x, y)) return { x, y };
  }
  for (let i = 0; i < 12; i++) {
    const x = area.x + 40 + i * 36; const y = area.y + 40 + i * 36;
    if (fits(x, y) && free(x, y)) return { x, y };
  }
  return { x: area.x + 40, y: area.y + 40 };
}

/** A new empty note, or null when three notes already exist. */
export function createNote(notes, { color, from, area, now } = {}) {
  if (!canAdd(notes)) return null;
  const t = stamp(now);
  return {
    id: uid(), body: '', list: false, checklist: [],
    color: COLORS.includes(color) ? color : freeColor(notes),
    ...nextPosition(notes, { from, area }), w: SIZE.w, h: SIZE.h, created: t, updated: t,
  };
}

/** Returns a changed copy. Size and position are kept at usable values. */
export function updateNote(note, patch, now) {
  const next = { ...note, ...patch, updated: stamp(now) };
  next.x = Math.round(next.x);
  next.y = Math.round(next.y);
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

/**
 * Turns the checklist on or off. Nothing typed is lost: each line of text becomes a checklist item,
 * and turning the checklist off writes the items back as lines.
 */
export function setList(note, on, now) {
  if (on === note.list) return note;
  if (on) {
    const lines = note.body.split('\n').map((l) => l.trim()).filter(Boolean);
    const items = [...note.checklist, ...lines.map((text) => ({ id: uid(), text, done: false }))];
    return updateNote(note, { list: true, checklist: items, body: '' }, now);
  }
  const text = note.checklist.map((i) => i.text).filter((t) => t.trim()).join('\n');
  const body = [note.body.trim(), text].filter(Boolean).join('\n');
  return updateNote(note, { list: false, checklist: [], body }, now);
}

// Checklist items
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

export function progress(note) {
  const total = note.checklist.length;
  const done = note.checklist.filter((i) => i.done).length;
  return { done, total, label: total ? `${done}/${total}` : '' };
}

/** True when the note has nothing in it, so deleting it needs no second click. */
export const isEmpty = (note) => !note.body.trim() && !note.checklist.some((i) => i.text.trim());

/** A short name for the note's window (shown in the taskbar and Alt+Tab). */
export function label(note) {
  const first = note.body.trim().split('\n')[0] || note.checklist.find((i) => i.text.trim())?.text || 'Sticky note';
  return first.length > 40 ? `${first.slice(0, 39)}…` : first;
}
