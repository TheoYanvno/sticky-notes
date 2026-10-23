import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COLORS, MAX_NOTES, canAdd, createNote, updateNote, nextPosition, toFront, setList, addItem, toggleItem, editItem, removeItem, progress, isEmpty, label, replace, remove } from '../src/notes.js';

const now = new Date('2026-10-23T12:00:00Z');
const area = { x: 0, y: 0, width: 1200, height: 800 };

test('four colors, and new notes take a color no other note is using', () => {
  assert.deepEqual(COLORS, ['yellow', 'pink', 'blue', 'green']);
  const notes = [];
  for (let i = 0; i < 3; i++) notes.push(createNote(notes, { area, now }));
  assert.deepEqual(notes.map((n) => n.color), ['yellow', 'pink', 'blue']);
  const afterDelete = remove(notes, notes[1].id);
  assert.equal(createNote(afterDelete, { area, now }).color, 'pink', 'the freed-up color is reused');
  assert.equal(new Set(notes.map((n) => n.id)).size, 3);
  assert.equal(notes[0].created, now.toISOString());
});

test('only three notes at a time', () => {
  assert.equal(MAX_NOTES, 3);
  const notes = [];
  for (let i = 0; i < 3; i++) notes.push(createNote(notes, { area }));
  assert.equal(canAdd(notes), false);
  assert.equal(createNote(notes, { area }), null, 'a fourth note is refused');
  assert.equal(canAdd(remove(notes, notes[0].id)), true, 'deleting one makes room again');
});

test('new notes start empty: no title, plain text, no checklist', () => {
  const n = createNote([], { area, now });
  assert.deepEqual([n.body, n.list, n.checklist, 'title' in n], ['', false, [], false]);
  assert.ok(isEmpty(n));
});

test('a note made with + appears beside the one it came from, or below when there is no room', () => {
  const from = { x: 100, y: 100, w: 260, h: 260 };
  assert.deepEqual(nextPosition([from], { from, area }), { x: 384, y: 100 });
  const nearEdge = { x: 900, y: 100, w: 260, h: 260 };
  assert.deepEqual(nextPosition([nearEdge], { from: nearEdge, area }), { x: 900, y: 384 });
  assert.deepEqual(nextPosition([], { area: { x: 1920, y: 0, width: 1280, height: 1000 } }), { x: 1960, y: 40 }, 'works on a second screen');
  assert.notDeepEqual(nextPosition([{ x: 40, y: 40 }], { area }), { x: 40, y: 40 }, 'never exactly on top of another note');
});

test('updates keep notes at a usable size and reject unknown colors', () => {
  const n = createNote([], { area, now });
  const moved = updateNote(n, { x: -300.4, y: 12.6, w: 50, h: 900, color: 'purple' }, now);
  assert.deepEqual([moved.x, moved.y, moved.w, moved.h, moved.color], [-300, 13, 200, 900, n.color]);
  assert.equal(n.w, 260, 'original unchanged');
});

test('turning the checklist on and off keeps everything that was typed', () => {
  let n = updateNote(createNote([], { area, now }), { body: 'Milk\n\n Eggs \nBread' }, now);
  n = setList(n, true, now);
  assert.equal(n.list, true);
  assert.equal(n.body, '');
  assert.deepEqual(n.checklist.map((i) => i.text), ['Milk', 'Eggs', 'Bread']);
  n = toggleItem(n, n.checklist[1].id, now);
  assert.deepEqual(progress(n), { done: 1, total: 3, label: '1/3' });
  n = setList(n, false, now);
  assert.deepEqual([n.list, n.body, n.checklist.length], [false, 'Milk\nEggs\nBread', 0]);
  assert.equal(setList(n, false, now), n, 'already off: unchanged');
});

test('checklist items can be added, edited and removed', () => {
  let n = setList(createNote([], { area, now }), true, now);
  n = addItem(n, '  Buy milk ', now);
  n = addItem(n, '   ', now);
  assert.equal(n.checklist.length, 1, 'blank items are ignored');
  assert.equal(n.checklist[0].text, 'Buy milk');
  const itemId = n.checklist[0].id;
  n = editItem(n, itemId, 'Buy oat milk', now);
  assert.equal(label(n), 'Buy oat milk');
  assert.equal(isEmpty(n), false);
  n = removeItem(n, itemId, now);
  assert.equal(n.checklist.length, 0);
  assert.equal(label(n), 'Sticky note');
});

test('bring to front, replace and remove', () => {
  const notes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(toFront(notes, 'a').map((n) => n.id), ['b', 'c', 'a']);
  assert.deepEqual(replace(notes, { id: 'b', x: 1 })[1], { id: 'b', x: 1 });
  assert.deepEqual(remove(notes, 'b').map((n) => n.id), ['a', 'c']);
});

test('window titles use the first line, shortened', () => {
  const n = updateNote(createNote([], { area, now }), { body: `${'x'.repeat(60)}\nsecond line` }, now);
  assert.equal(label(n).length, 40);
  assert.ok(label(n).endsWith('…'));
});
