import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTask, updateTask, toggleDone, bucket, views, dueAt, dueLabel, counts, dateKey } from '../src/tasks.js';
import { dueNow, nextDelay, markNotified, message } from '../src/reminders.js';

// Local times, so the tests pass in any time zone
const now = new Date(2026, 9, 20, 14, 0); // Tue 20 Oct 2026, 2:00 PM
const day = (offset) => dateKey(new Date(2026, 9, 20 + offset));

test('a task needs a title; a time without a date is dropped', () => {
  assert.throws(() => createTask({ title: '  ' }), /needs a title/);
  const t = createTask({ title: ' Pay rent ', dueTime: '09:00', priority: 'urgent' });
  assert.deepEqual([t.title, t.due, t.dueTime, t.priority, t.done], ['Pay rent', null, null, 'medium', false]);
});

test('tasks are sorted into overdue, today, upcoming, someday and done', () => {
  const t = (title, due, dueTime, extra = {}) => ({ ...createTask({ title, due, dueTime }), ...extra });
  const list = [
    t('yesterday', day(-1)), t('this morning', day(0), '09:00'), t('tonight', day(0), '20:00'),
    t('today, no time', day(0)), t('friday', day(3)), t('no date'), t('finished', day(-2), null, { done: true }),
  ];
  const v = views(list, now);
  assert.deepEqual(v.overdue.map((x) => x.title), ['yesterday', 'this morning']);
  assert.deepEqual(v.today.map((x) => x.title), ['tonight', 'today, no time']);
  assert.deepEqual(v.upcoming.map((x) => x.title), ['friday']);
  assert.deepEqual(v.someday.map((x) => x.title), ['no date']);
  assert.deepEqual(v.done.map((x) => x.title), ['finished']);
  assert.deepEqual(counts(list, now), { overdue: 2, today: 2, upcoming: 1, someday: 1, done: 1 });
});

test('same due time: high priority comes first', () => {
  const a = createTask({ title: 'low', due: day(1), priority: 'low' });
  const b = createTask({ title: 'high', due: day(1), priority: 'high' });
  assert.deepEqual(views([a, b], now).upcoming.map((x) => x.title), ['high', 'low']);
});

test('ticking a task done and back', () => {
  const t = createTask({ title: 'x', due: day(0) });
  assert.equal(bucket(toggleDone(t), now), 'done');
  assert.equal(bucket(toggleDone(toggleDone(t)), now), 'today');
});

test('due labels read naturally', () => {
  const t = (due, dueTime) => ({ due, dueTime });
  assert.match(dueLabel(t(day(0), '15:00'), now, 'en-US'), /^Today 3:00\sPM$/);
  assert.equal(dueLabel(t(day(1)), now, 'en-US'), 'Tomorrow');
  assert.equal(dueLabel(t(day(-3)), now, 'en-US'), '3 days ago');
  assert.equal(dueLabel(t(day(3)), now, 'en-US'), 'Friday');
  assert.equal(dueLabel(t(day(10)), now, 'en-US'), 'Fri, Oct 30');
  assert.equal(dueLabel({ due: null }), '');
  assert.equal(dueAt(t(day(0))).getHours(), 23, 'no time: due at the end of the day');
});

test('reminders fire once, when the due time passes', () => {
  let tasks = [
    createTask({ title: 'now', due: day(0), dueTime: '13:58' }),
    createTask({ title: 'later', due: day(0), dueTime: '14:30' }),
    createTask({ title: 'no time', due: day(0) }),
    createTask({ title: 'long ago', due: day(-2), dueTime: '10:00' }),
    { ...createTask({ title: 'done', due: day(0), dueTime: '13:00' }), done: true },
  ];
  const due = dueNow(tasks, now);
  assert.deepEqual(due.map((t) => t.title), ['now']);
  tasks = markNotified(tasks, due);
  assert.deepEqual(dueNow(tasks, now), []);
  assert.equal(nextDelay(tasks, now), 60_000, 'capped at a minute');
  assert.equal(nextDelay(tasks, new Date(2026, 9, 20, 14, 29, 30)), 30_000);
  assert.equal(nextDelay([], now), null);
});

test('changing the due time re-arms the reminder', () => {
  const t = { ...createTask({ title: 'x', due: day(0), dueTime: '13:00' }), notified: true };
  assert.equal(updateTask(t, { dueTime: '16:00' }).notified, false);
  assert.equal(updateTask(t, { title: 'y' }).notified, true);
  assert.equal(updateTask(t, { due: null }).dueTime, null);
});

test('reminder text flags high priority', () => {
  assert.deepEqual(message({ title: 'Call', priority: 'high' }), { title: '❗ Due now: Call', body: 'High priority task' });
  assert.equal(message({ title: 'Call', priority: 'low' }).title, 'Due now: Call');
});
