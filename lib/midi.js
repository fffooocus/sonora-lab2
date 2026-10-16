const ascii = text => Array.from(text, c => c.charCodeAt(0));
const u16 = n => [(n >>> 8) & 255, n & 255];
const u32 = n => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

export function vlq(value) {
  if (!Number.isInteger(value) || value < 0 || value > 0x0fffffff) throw new RangeError('Invalid MIDI variable-length quantity');
  const bytes = [value & 127];
  while ((value = Math.floor(value / 128)) > 0) bytes.unshift((value & 127) | 128);
  return bytes;
}

function meta(type, bytes) { return [255, type, ...vlq(bytes.length), ...bytes]; }
function track(events) {
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);
  let lastTick = 0;
  const bytes = [];
  for (const event of events) {
    bytes.push(...vlq(event.tick - lastTick), ...event.bytes);
    lastTick = event.tick;
  }
  return [...ascii('MTrk'), ...u32(bytes.length), ...bytes];
}

/** Standard MIDI File, format 1: conductor track + one melodic track. */
export function encodeMidi(composition) {
  const { config, notes, ppq, totalTicks } = composition;
  const tempo = Math.round(60_000_000 / config.bpm);
  const conductor = track([
    { tick: 0, order: 0, bytes: meta(3, ascii('SONORA - Conductor')) },
    { tick: 0, order: 1, bytes: meta(0x51, [(tempo >> 16) & 255, (tempo >> 8) & 255, tempo & 255]) },
    { tick: 0, order: 2, bytes: meta(0x58, [4, 2, 24, 8]) },
    { tick: totalTicks, order: 9, bytes: meta(0x2f, []) }
  ]);
  const events = [
    { tick: 0, order: 0, bytes: meta(3, ascii('SONORA - Data melody')) },
    { tick: 0, order: 1, bytes: [0xc0, Number(config.instrument)] }
  ];
  for (const n of notes) {
    events.push({ tick: n.tick, order: 3, bytes: [0x90, n.pitch, n.velocity] });
    events.push({ tick: n.tick + n.duration, order: 2, bytes: [0x80, n.pitch, 0] });
  }
  events.push({ tick: totalTicks, order: 9, bytes: meta(0x2f, []) });
  return new Uint8Array([...ascii('MThd'), ...u32(6), ...u16(1), ...u16(2), ...u16(ppq), ...conductor, ...track(events)]);
}
