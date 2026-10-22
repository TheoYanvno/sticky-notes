import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { emptyData, normalize, serialize, parseImport, mergeImport, writeAtomic, loadFile } from '../src/storage.js';

const note = (id, extra = {}) => ({ id, title: 'T', body: 'B', checklist: [], color: 'blue', x: 10, y: 20, w: 240, h: 220, created: '2026-10-01T10:00:00.000Z', updated: '2026-10-01T10:00:00.000Z', ...extra });
const task = (id, extra = {}) => ({ id, title: 'Do it', due: '2026-10-22', dueTime: '09:30', priority: 'high', done: false, created: '2026-10-01T10:00:00.000Z', updated: '2026-10-01T10:00:00.000Z', ...extra });

test('normalize repairs or drops bad records', () => {
  const data = normalize({
    notes: [note('a', { color: 'neon', w: 5, x: -50 }), { title: 'no id' }, note('a'), null, note('b', { checklist: [{ id: 'i1', text: 'x', done: 1 }, { text: 'no id' }] })],
    tasks: [task('t1', { priority: 'urgent', dueTime: '25:00' }), task('t2', { title: '   ' }), task('t3', { due: 'tomorrow' })],
  });
  assert.equal(data.notes.length, 2, 'duplicate id, missing id and null dropped');
  assert.equal(data.notes[0].color, 'yellow');
  assert.equal(data.notes[0].w, 160);
  assert.equal(data.notes[0].x, 0);
  assert.deepEqual(data.notes[1].checklist, [{ id: 'i1', text: 'x', done: false }]);
  assert.deepEqual(data.tasks.map((t) => t.id), ['t1', 't3']);
  assert.equal(data.tasks[0].priority, 'medium');
  assert.equal(data.tasks[0].dueTime, null);
  assert.equal(data.tasks[1].due, null);
  assert.deepEqual(normalize('garbage'), emptyData());
});

test('export round-trips through import', () => {
  const data = normalize({ notes: [note('a')], tasks: [task('t1')] });
  assert.deepEqual(parseImport(serialize(data)), data);
});

test('import rejects files that are not exports', () => {
  assert.throws(() => parseImport('{oops'), /not valid JSON/);
  assert.throws(() => parseImport('{"notes":[]}'), /not a Sticky Notes export/);
});

test('merging an import keeps the newest copy of each note', () => {
  const current = { notes: [note('a', { title: 'mine', updated: '2026-10-05T00:00:00.000Z' }), note('b')], tasks: [] };
  const incoming = { notes: [note('a', { title: 'older', updated: '2026-10-02T00:00:00.000Z' }), note('c')], tasks: [task('t1')] };
  const merged = mergeImport(current, incoming);
  assert.deepEqual(merged.notes.map((n) => n.id).sort(), ['a', 'b', 'c']);
  assert.equal(merged.notes.find((n) => n.id === 'a').title, 'mine');
  assert.equal(merged.tasks.length, 1);
  const newer = mergeImport(current, { notes: [note('a', { title: 'newer', updated: '2026-10-09T00:00:00.000Z' })], tasks: [] });
  assert.equal(newer.notes.find((n) => n.id === 'a').title, 'newer');
});

test('atomic writes keep a backup and recover from a damaged file', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sticky-'));
  const file = path.join(dir, 'data.json');
  assert.deepEqual(await loadFile(fs, file), emptyData(), 'no file yet: fresh start');

  await writeAtomic(fs, file, serialize({ notes: [note('a')], tasks: [] }));
  await writeAtomic(fs, file, serialize({ notes: [note('a'), note('b')], tasks: [] }));
  assert.equal((await loadFile(fs, file)).notes.length, 2);
  assert.equal(JSON.parse(await fs.readFile(`${file}.bak`, 'utf8')).notes.length, 1, '.bak is the previous version');
  assert.deepEqual((await fs.readdir(dir)).filter((f) => f.endsWith('.tmp')), [], 'no temporary files left');

  await fs.writeFile(file, '{"notes": [ half a file');
  assert.equal((await loadFile(fs, file)).notes.length, 1, 'damaged file: falls back to .bak');
  assert.ok((await fs.readdir(dir)).includes('data.json.corrupt'), 'damaged file kept');
  await fs.rm(dir, { recursive: true });
});
