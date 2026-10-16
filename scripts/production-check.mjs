import assert from 'node:assert/strict';
import { launchBrowser } from './browser.mjs';
import midiFile from 'midi-file';
import { readFile } from 'node:fs/promises';

const url = process.argv[2] || 'https://fffooocus.github.io/sonora-lab2/';
const paths = ['', 'styles.css', 'app.js', 'lib/csv.js', 'lib/sonify.js', 'lib/midi.js', 'lib/audio.js', 'examples/kyiv-weather.csv', 'examples/energy.csv', 'examples/semicolon.csv', 'examples/sonora-weather.mid', 'docs/report.pdf', 'docs/report.docx', 'docs/DEFENSE.md'];
for (const file of paths) {
  const response = await fetch(new URL(file, url));
  assert.equal(response.status, 200, file || 'index.html');
  const data = Buffer.from(await response.arrayBuffer());
  assert.ok(data.length > 0, file);
  if (file.endsWith('.pdf')) assert.equal(data.subarray(0, 4).toString(), '%PDF');
  if (file.endsWith('.docx')) assert.equal(data.subarray(0, 2).toString(), 'PK');
  if (file.endsWith('.mid')) assert.equal(midiFile.parseMidi(data).header.numTracks, 2);
  console.log(`HTTP 200 ${file || 'index.html'}`);
}
const browser = await launchBrowser();
try {
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await page.waitForFunction(() => document.querySelector('#data-table tbody').rows.length === 24);
  assert.equal(await page.locator('#pitch-column').inputValue(), 'temperature');
  assert.equal(await page.locator('#expression-column').inputValue(), 'precipitation');
  const waiting = page.waitForEvent('download'); await page.locator('#download-midi').click();
  const download = await waiting;
  const parsed = midiFile.parseMidi(await readFile(await download.path()));
  assert.equal(parsed.tracks[1].filter(e => e.type === 'noteOn').length, 24);
  assert.deepEqual(errors, []);
  console.log('Production browser: dataset loaded, MIDI downloaded and independently parsed, no JavaScript errors.');
} finally { await browser.close(); }
