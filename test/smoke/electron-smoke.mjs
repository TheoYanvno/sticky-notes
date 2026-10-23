// End-to-end check of the real desktop app, run by GitHub Actions under a virtual screen:
//   xvfb-run npx electron test/smoke/electron-smoke.mjs
// It starts the app with an empty data folder, then clicks through it like a person would:
// type in the first note, make a checklist, press + until the limit, delete a note, restart and look again.
import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sticky-smoke-'));
app.setPath('userData', dir);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const notes = () => BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed()).sort((a, b) => a.id - b.id);
const run = (win, js) => win.webContents.executeJavaScript(js, true);
const saved = () => JSON.parse(fs.readFileSync(path.join(dir, 'sticky-notes.json'), 'utf8')).notes;
const fail = (msg) => { console.error(`SMOKE FAIL: ${msg}`); app.exit(1); };
const check = (ok, msg) => { if (!ok) throw new Error(msg); console.log(`ok - ${msg}`); };

async function untilLoaded(win) {
  for (let i = 0; i < 50 && (win.webContents.isLoading() || !(await run(win, '!!document.querySelector(".note")'))); i++) await wait(100);
}

// Electron only fires "ready" once this file has finished loading, so nothing here may wait at the top level
import '../../main.js';

// Never hang a build: give up after two minutes
setTimeout(() => fail('timed out'), 120_000).unref?.();

app.whenReady().then(async () => {
try {
  await wait(1500);
  check(notes().length === 1, 'a fresh start shows one empty note');
  const first = notes()[0];
  await untilLoaded(first);
  check(await run(first, 'document.querySelectorAll(".swatch").length') === 4, 'four color options');
  check(await run(first, '!document.querySelector(".note-title, input[placeholder=Title]")'), 'no title field');

  await run(first, `const t = document.querySelector('textarea'); t.value = 'Milk\\nEggs'; t.dispatchEvent(new Event('input', { bubbles: true })); 1`);
  await run(first, `document.querySelector('.swatch-green').click(); 1`);
  await run(first, `document.querySelector('[aria-label=Checklist]').click(); 1`);
  await wait(600);
  check(saved()[0].list === true && saved()[0].checklist.length === 2 && saved()[0].color === 'green', 'text, color and checklist save');

  await run(first, `document.querySelector('.icon.add').click(); 1`);
  await wait(1000);
  await run(notes()[1], `document.querySelector('.icon.add').click(); 1`);
  await wait(1000);
  check(notes().length === 3 && saved().length === 3, '+ makes new notes, up to three');
  await untilLoaded(notes()[2]);
  await wait(300);
  check(await run(notes()[2], 'document.querySelector(".icon.add").disabled') === true, '+ is switched off at three notes');

  const [x1] = notes()[0].getPosition();
  const [x2] = notes()[1].getPosition();
  check(x1 !== x2, 'new notes open beside the old ones, not on top');

  check(notes()[0].isResizable() === false && await run(first, 'getComputedStyle(document.body).backgroundColor') === 'rgba(0, 0, 0, 0)', 'just the note: the window around it is see-through');
  check(await run(first, '!!document.querySelector(".grip")'), 'the note has a corner grip to resize it');
  await run(first, 'window.sticky.resize(400, 320).then(() => 1)');
  await wait(800);
  check(saved()[0].w === 400 && saved()[0].h === 320, 'resizing with the grip is remembered');

  notes()[1].setPosition(700, 500);
  await wait(800);
  check(saved().some((n) => n.x === 700 && n.y === 500), 'moving a note window is remembered');

  await run(notes()[2], `document.querySelector('.delete').click(); 1`); // empty note: one click
  await wait(800);
  check(notes().length === 2 && saved().length === 2, 'deleting a note closes it and forgets it');
  await untilLoaded(notes()[0]);
  check(await run(notes()[0], 'document.querySelector(".icon.add").disabled') === false, '+ works again after a delete');

  console.log('SMOKE PASS');
  app.exit(0);
} catch (e) {
  fail(e.message);
}
});
