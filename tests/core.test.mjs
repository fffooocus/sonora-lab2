import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import midiFile from 'midi-file';
import { parseCSV, MAX_ROWS, MAX_BYTES } from '../web/lib/csv.js';
import { createComposition, normalize, SCALES } from '../web/lib/sonify.js';
import { encodeMidi, vlq } from '../web/lib/midi.js';

const sample = () => parseCSV('day,x,y\nA,-10,0\nB,0,5\nC,10,10');

test('CSV: BOM, CRLF, quoted delimiters, escaped quotes and multiline labels', () => {
  const d = parseCSV('\uFEFFlabel,x,y\r\n"one, ""two""",-2,3\r\n"line\nnext",4,5\r\n');
  assert.equal(d.rows[0][0], 'one, "two"');
  assert.equal(d.rows[1][0], 'line\nnext');
  assert.deepEqual(d.numeric.map(c => c.name), ['x', 'y']);
});
test('CSV: semicolon with decimal comma; tab separated data', () => {
  assert.deepEqual(parseCSV('x;y\n-2,5;3,5\n0;4').numeric[0].values, [-2.5, 0]);
  assert.equal(parseCSV('x\ty\n1\t2\n3\t4').delimiter, '\t');
});
test('CSV: scientific notation, trailing empty lines, constant columns', () => {
  const d = parseCSV('x,y\n1e2,0\n.5,0\n\n');
  assert.deepEqual(d.numeric[0].values, [100, .5]);
  assert.deepEqual(normalize(d.numeric[1].values).values, [.5, .5]);
});
for (const [name, text] of [
  ['empty', ''], ['one row', 'x,y\n1,2'], ['duplicate headings', 'x,x\n1,2\n3,4'],
  ['empty heading', 'x,\n1,2\n3,4'], ['ragged data', 'x,y\n1,2\n3'],
  ['unclosed quotes', 'x,y\n"1,2\n3,4'], ['characters after quotes', 'x,y\n"1"oops,2\n3,4'],
  ['quote in value', 'x,y\n1"2,3\n4,5'], ['missing numeric value', 'x,y\n1,\n2,3'],
  ['NaN', 'x,y\nNaN,1\n2,3'], ['Infinity', 'x,y\nInfinity,1\n2,3'],
  ['partial number', 'x,y\n12abc,1\n2,3'], ['overflow', 'x,y\n1e999,1\n2,3']
]) test(`CSV rejects ${name}`, () => assert.throws(() => parseCSV(text)));
test('CSV: row and byte limits are enforced', () => {
  const atLimit = 'x,y\n' + Array(MAX_ROWS).fill('1,2').join('\n');
  assert.equal(parseCSV(atLimit).rows.length, MAX_ROWS);
  assert.throws(() => parseCSV(atLimit + '\n3,4'), /512/);
  assert.throws(() => parseCSV('x'.repeat(MAX_BYTES + 1)), /1 МБ/);
});
test('normalization handles negative, constant and extreme finite data', () => {
  assert.deepEqual(normalize([-10, 0, 10]).values, [0, .5, 1]);
  assert.deepEqual(normalize([7, 7]).values, [.5, .5]);
  assert.deepEqual(normalize([-1e308, 0, 1e308]).values, [0, .5, 1]);
});
test('mapping: independent indicators control pitch, velocity and duration', () => {
  const c = createComposition(sample(), { bpm: 120 });
  assert.deepEqual(c.notes.map(n => n.pitch), [48, 64, 81]);
  assert.deepEqual(c.notes.map(n => n.velocity), [40, 78, 115]);
  assert.deepEqual(c.notes.map(n => n.duration), [168, 300, 432]);
  assert.equal(c.seconds, 1.5);
  const swapped = createComposition(parseCSV('x,y\n0,10\n10,0'));
  assert.ok(swapped.notes[0].pitch < swapped.notes[1].pitch);
  assert.ok(swapped.notes[0].velocity > swapped.notes[1].velocity);
});
test('all scales and instruments produce bounded notes', () => {
  for (const scale of Object.keys(SCALES)) for (const instrument of [0, 10, 11, 80]) {
    const c = createComposition(sample(), { scale, instrument });
    assert.ok(c.notes.every(n => n.pitch >= 0 && n.pitch <= 127 && n.velocity >= 1 && n.velocity <= 127 && n.duration < c.ppq));
  }
});
test('invalid mappings and unsupported configuration fail explicitly', () => {
  for (const options of [{ bpm: 39 }, { bpm: 241 }, { bpm: 100.5 }, { scale: 'oops' }, { instrument: 128 }, { expressionColumn: 'x' }, { pitchColumn: 'missing' }]) {
    assert.throws(() => createComposition(sample(), options));
  }
});
test('VLQ boundary encoding and invalid values', () => {
  assert.deepEqual(vlq(0), [0]); assert.deepEqual(vlq(127), [127]);
  assert.deepEqual(vlq(128), [129, 0]); assert.deepEqual(vlq(16383), [255, 127]);
  assert.deepEqual(vlq(0x0fffffff), [255, 255, 255, 127]);
  for (const n of [-1, 1.5, 0x10000000, NaN]) assert.throws(() => vlq(n));
});
test('independent MIDI parser validates header, tempo, programs, notes and durations', () => {
  const c = createComposition(sample(), { bpm: 120, instrument: 10 });
  const parsed = midiFile.parseMidi(encodeMidi(c));
  assert.deepEqual(parsed.header, { format: 1, numTracks: 2, ticksPerBeat: 480 });
  assert.equal(parsed.tracks[0].find(e => e.type === 'setTempo').microsecondsPerBeat, 500000);
  assert.equal(parsed.tracks[1].find(e => e.type === 'programChange').programNumber, 10);
  for (const track of parsed.tracks) assert.equal(track.at(-1).type, 'endOfTrack');
  let tick = 0; const active = new Map(), found = [];
  for (const event of parsed.tracks[1]) {
    tick += event.deltaTime;
    if (event.type === 'noteOn') { active.set(event.noteNumber, { tick, velocity: event.velocity }); }
    if (event.type === 'noteOff') {
      const on = active.get(event.noteNumber); assert.ok(on);
      found.push({ pitch: event.noteNumber, tick: on.tick, duration: tick - on.tick, velocity: on.velocity });
      active.delete(event.noteNumber);
    }
  }
  assert.equal(active.size, 0); assert.equal(tick, c.totalTicks);
  assert.deepEqual(found, c.notes.map(({ pitch, tick, duration, velocity }) => ({ pitch, tick, duration, velocity })));
});
test('long MIDI with 512 repeated pitches remains valid and all note-offs match', () => {
  const d = parseCSV('x,y\n' + Array.from({ length: 512 }, (_, i) => `5,${i}`).join('\n'));
  const c = createComposition(d), parsed = midiFile.parseMidi(encodeMidi(c));
  assert.equal(parsed.tracks[1].filter(e => e.type === 'noteOn').length, 512);
  assert.equal(parsed.tracks[1].filter(e => e.type === 'noteOff').length, 512);
  assert.equal(parsed.tracks[0].reduce((n, e) => n + e.deltaTime, 0), 512 * 480);
});
test('bundled demonstration datasets generate playable MIDI', () => {
  for (const name of ['kyiv-weather.csv', 'energy.csv', 'semicolon.csv']) {
    const d = parseCSV(readFileSync(new URL(`../examples/${name}`, import.meta.url), 'utf8'));
    const c = createComposition(d);
    assert.equal(midiFile.parseMidi(encodeMidi(c)).tracks[1].filter(e => e.type === 'noteOn').length, d.rows.length);
  }
});
test('weather demo maps two measurements instead of the row label', () => {
  const d = parseCSV(readFileSync(new URL('../examples/kyiv-weather.csv', import.meta.url), 'utf8'));
  const c = createComposition(d);
  assert.equal(d.numeric.length, 2);
  assert.equal(c.config.pitchColumn, 'temperature');
  assert.equal(c.config.expressionColumn, 'precipitation');
});
