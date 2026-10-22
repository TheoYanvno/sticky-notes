// Due-time reminders. The desktop app checks from the main process (so reminders fire while the window
// is hidden in the tray); the browser demo checks from the page.
import { dueAt } from './tasks.js';

const GRACE = 12 * 60 * 60 * 1000; // don't announce something that was due more than 12 hours ago (e.g. after a long sleep)

/** Tasks with a due time that has just passed and that haven't been announced yet. */
export function dueNow(tasks, now = new Date()) {
  return tasks.filter((t) => {
    if (t.done || t.notified || !t.due || !t.dueTime) return false;
    const at = dueAt(t).getTime();
    return at <= now.getTime() && now.getTime() - at <= GRACE;
  });
}

/** Milliseconds until the next reminder is due (capped, so the timer also catches edits), or null if none. */
export function nextDelay(tasks, now = new Date(), cap = 60_000) {
  const upcoming = tasks
    .filter((t) => !t.done && !t.notified && t.due && t.dueTime)
    .map((t) => dueAt(t).getTime() - now.getTime())
    .filter((ms) => ms > 0);
  if (!upcoming.length) return null;
  return Math.min(cap, Math.max(1000, Math.min(...upcoming)));
}

/** The notification text for a task. */
export function message(task) {
  const icon = { high: '❗ ', medium: '', low: '' }[task.priority] ?? '';
  return { title: `${icon}Due now: ${task.title}`, body: task.priority === 'high' ? 'High priority task' : 'Sticky Notes reminder' };
}

/** Marks announced tasks so each reminder fires once. */
export function markNotified(tasks, announced) {
  const ids = new Set(announced.map((t) => t.id));
  return tasks.map((t) => (ids.has(t.id) ? { ...t, notified: true } : t));
}
