// Task tracker: tasks with an optional due date (and time), a priority, and done/not done.
// Dates are local calendar dates "YYYY-MM-DD"; the views compare them with the local "today".
import { uid } from './notes.js';

export const PRIORITIES = ['high', 'medium', 'low'];
const RANK = { high: 0, medium: 1, low: 2 };
const stamp = (now) => (now ?? new Date()).toISOString();

/** Local date as YYYY-MM-DD (not UTC, so a task due "today" is today where the user is). */
export function dateKey(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** The moment a task is due: its time on its date, or the end of that day when it has no time. */
export function dueAt(task) {
  if (!task.due) return null;
  const [y, m, d] = task.due.split('-').map(Number);
  const [hh, mm] = task.dueTime ? task.dueTime.split(':').map(Number) : [23, 59];
  return new Date(y, m - 1, d, hh, mm, task.dueTime ? 0 : 59);
}

export function createTask({ title, due = null, dueTime = null, priority = 'medium', now } = {}) {
  const clean = String(title ?? '').trim();
  if (!clean) throw new Error('A task needs a title.');
  const t = stamp(now);
  return {
    id: uid(), title: clean, due: due || null, dueTime: due && dueTime ? dueTime : null,
    priority: PRIORITIES.includes(priority) ? priority : 'medium',
    done: false, notified: false, created: t, updated: t,
  };
}

export function updateTask(task, patch, now) {
  const next = { ...task, ...patch, updated: stamp(now) };
  if (!PRIORITIES.includes(next.priority)) next.priority = task.priority;
  if (!next.due) next.dueTime = null;
  // A new due date or time means a new reminder
  if ('due' in patch || 'dueTime' in patch) next.notified = false;
  return next;
}

export const replaceTask = (list, task) => list.map((t) => (t.id === task.id ? task : t));

export const toggleDone = (task, now) => updateTask(task, { done: !task.done }, now);

/** Which list a task belongs in. */
export function bucket(task, now = new Date()) {
  if (task.done) return 'done';
  if (!task.due) return 'someday';
  const today = dateKey(now);
  if (task.due < today) return 'overdue';
  if (task.due === today) return dueAt(task) < now ? 'overdue' : 'today';
  return 'upcoming';
}

/** Soonest first, then high priority first, then oldest first. */
export function compare(a, b) {
  const da = dueAt(a)?.getTime() ?? Infinity;
  const db = dueAt(b)?.getTime() ?? Infinity;
  return da - db || RANK[a.priority] - RANK[b.priority] || a.created.localeCompare(b.created);
}

export function views(tasks, now = new Date()) {
  const out = { overdue: [], today: [], upcoming: [], someday: [], done: [] };
  for (const t of tasks) out[bucket(t, now)].push(t);
  for (const k of Object.keys(out)) out[k].sort(compare);
  out.done.reverse();
  return out;
}

/** "Today 3:00 PM", "Tomorrow", "Fri 23 Oct", "2 days ago". */
export function dueLabel(task, now = new Date(), locale = undefined) {
  if (!task.due) return '';
  const at = dueAt(task);
  const day = Math.round((new Date(at.getFullYear(), at.getMonth(), at.getDate()) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5);
  const clock = task.dueTime ? ` ${at.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })}` : '';
  if (day === 0) return `Today${clock}`;
  if (day === 1) return `Tomorrow${clock}`;
  if (day === -1) return `Yesterday${clock}`;
  if (day < 0) return `${-day} days ago`;
  if (day < 7) return `${at.toLocaleDateString(locale, { weekday: 'long' })}${clock}`;
  return `${at.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })}${clock}`;
}

export function counts(tasks, now = new Date()) {
  const v = views(tasks, now);
  return Object.fromEntries(Object.entries(v).map(([k, list]) => [k, list.length]));
}
