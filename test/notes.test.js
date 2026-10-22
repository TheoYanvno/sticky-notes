import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COLORS, createNote, updateNote, nextPosition, toFront, addItem, toggleItem, editItem, removeItem, clearDone, progress, search, matches, label, replace, remove } from '../src/notes.js';

const now = new Date('2026-10-20T12:00:00Z');

test('new notes cascade across the board and cycle colors', () => {
  const notes = [];
  for (let i = 0; i < 3; i++) notes.push(createNote(notes, { now }));
  assert.deepEqual(notes.map((n) => [n.x, n.y]), [[40, 40], [72, 72], [104, 104]]);
  assert.deepEqual(notes.map((n) => n.color), COLORS.slice(0, 3));
  assert.equal(new Set(notes.map((n) => n.id)).size, 3);
  assert.equal(notes[0].created, now.toISOString());
});

test('the cascade wraps back to the top-left when it reaches the edge', () => {
  assert.deepEqual(nextPosition([{ x: 1000, y: 700 }], { width: 1200, height: 800 }), { x: 40, y: 40 });
});

test('updates keep notes on the board and at a usable size', () => {
  const n = createNote([], { now });
  const moved = updateNote(n, { x: -30.4, y: 12.6, w: 50, h: 900, color: 'nope' }, now);
  assert.deepEqual([moved.x, moved.y, moved.w, moved.h, moved.color], [0, 13, 160, 900, n.color]);
  assert.equal(n.x, 40, 'original unchanged');
});

test('clicking a note brings it to the front', () => {
  const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(toFront(list, 'a').map((n) => n.id), ['b', 'c', 'a']);
  assert.deepEqual(remove(list, 'b').map((n) => n.id), ['a', 'c']);
  assert.deepEqual(replace(list, { id: 'b', x: 1 })[1], { id: 'b', x: 1 });
});

test('checklists: add, tick, edit, remove, clear done', () => {
  let n = createNote([], { now });
  n = addItem(n, '  Milk ', now);
  n = addItem(n, '', now);
  n = addItem(n, 'Eggs', now);
  assert.deepEqual(n.checklist.map((i) => i.text), ['Milk', 'Eggs']);
  n = toggleItem(n, n.checklist[0].id, now);
  assert.equal(progress(n).label, '1/2');
  n = editItem(n, n.checklist[1].id, 'Free-range eggs', now);
  assert.equal(n.checklist[1].text, 'Free-range eggs');
  n = clearDone(n, now);
  assert.deepEqual(n.checklist.map((i) => i.text), ['Free-range eggs']);
  n = removeItem(n, n.checklist[0].id, now);
  assert.equal(progress(n).label, '');
});

test('search looks in titles, text and checklist items, ignoring case and accents', () => {
  const a = { ...createNote([], { title: 'Groceries', now }), checklist: [{ id: '1', text: 'Café beans', done: false }] };
  const b = createNote([a], { body: 'Call the dentist about Thursday', now });
  assert.deepEqual(search([a, b], 'cafe').map((n) => n.id), [a.id]);
  assert.deepEqual(search([a, b], 'DENTIST thursday').map((n) => n.id), [b.id]);
  assert.equal(search([a, b], '   ').length, 2);
  assert.equal(matches(a, 'dentist'), false);
});

test('pinned windows get a short title', () => {
  assert.equal(label({ title: '', body: '\n', checklist: [] }), 'Note');
  assert.equal(label({ title: '', body: 'First line\nsecond', checklist: [] }), 'First line');
  assert.equal(label({ title: 'x'.repeat(60), body: '', checklist: [] }).length, 40);
});
