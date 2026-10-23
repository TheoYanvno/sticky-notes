import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { emptyData, normalize, serialize, writeAtomic, loadFile } from '../src/storage.js';

const note = (id, extra = {}) => ({ id, body: 'B', list: false, checklist: [], color: 'blue', x: 10, y: 20, w: 260, h: 260, created: '2026-10-01T10:00:00.000Z', updated: '2026-10-01T10:00:00.000Z', ...extra });

test('normalize repairs or drops bad records', () => {
  const data = normalize({
    notes: [note('a', { color: 'neon', w: 5, x: -50 }), { body: 'no id' }, note('a'), null, note('b', { checklist: [{ id: 'i1', text: 'x', done: 1 }, { text: 'no id' }] })],
  });
  assert.equal(data.notes.length, 2, 'duplicate id, missing id and null dropped');
  assert.equal(data.notes[0].color, 'yellow');
  assert.equal(data.notes[0].w, 200, 'too small: raised to the minimum');
  assert.equal(data.notes[0].x, -50, 'a screen to the left of the main one has negative positions');
  assert.deepEqual(data.notes[1].checklist, [{ id: 'i1', text: 'x', done: false }]);
  assert.deepEqual(normalize('garbage'), emptyData());
});

test('only three notes are kept: the three edited most recently', () => {
  const data = normalize({ notes: ['a', 'b', 'c', 'd', 'e'].map((id, i) => note(id, { updated: `2026-10-0${[3, 9, 1, 7, 5][i]}T00:00:00.000Z` })) });
  assert.deepEqual(data.notes.map((n) => n.id), ['b', 'd', 'e'], 'kept in their original order');
});

test('version 1 files carry over: titles become the first line, removed colors map to the nearest', () => {
  const v1 = {
    app: 'sticky-notes', version: 1, tasks: [{ id: 't1', title: 'old task' }],
    notes: [
      { ...note('a', { color: 'purple' }), title: 'Groceries', body: '', checklist: [{ id: 'i1', text: 'Milk', done: true }] },
      { ...note('b', { color: 'orange' }), title: 'Idea', body: 'Write it down' },
    ],
  };
  delete v1.notes[0].list; delete v1.notes[1].list;
  const data = normalize(v1);
  assert.equal(data.version, 2);
  assert.equal('tasks' in data, false, 'tasks are gone in version 2');
  assert.deepEqual(data.notes.map((n) => [n.body, n.color, n.list]), [['Groceries', 'blue', false], ['Idea\nWrite it down', 'yellow', false]]);
  assert.equal(data.notes[0].checklist[0].text, 'Milk');
});

test('a saved file round-trips unchanged', () => {
  const data = normalize({ notes: [note('a'), note('b', { list: true, checklist: [{ id: 'i1', text: 'x', done: true }] })] });
  assert.deepEqual(normalize(JSON.parse(serialize(data))), data);
});

test('atomic writes keep a backup and recover from a damaged file', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sticky-'));
  const file = path.join(dir, 'data.json');
  assert.deepEqual(await loadFile(fs, file), emptyData(), 'no file yet: fresh start');

  await writeAtomic(fs, file, serialize({ notes: [note('a')] }));
  await writeAtomic(fs, file, serialize({ notes: [note('a'), note('b')] }));
  assert.equal((await loadFile(fs, file)).notes.length, 2);
  assert.equal(JSON.parse(await fs.readFile(`${file}.bak`, 'utf8')).notes.length, 1, '.bak is the previous version');
  assert.deepEqual((await fs.readdir(dir)).filter((f) => f.endsWith('.tmp')), [], 'no temporary files left');

  await fs.writeFile(file, '{"notes": [ half a file');
  assert.equal((await loadFile(fs, file)).notes.length, 1, 'damaged file: falls back to .bak');
  assert.ok((await fs.readdir(dir)).includes('data.json.corrupt'), 'damaged file kept');
  await fs.rm(dir, { recursive: true });
});
