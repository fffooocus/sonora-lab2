export const PPQ = 480;
export const SCALES = {
  pentatonic: { name: 'До мажор · пентатоніка', notes: [48, 50, 52, 55, 57, 60, 62, 64, 67, 69, 72, 74, 76, 79, 81] },
  major: { name: 'До мажор', notes: [48, 50, 52, 53, 55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81] },
  minor: { name: 'Ля мінор', notes: [45, 47, 48, 50, 52, 53, 55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77] },
  chromatic: { name: 'Хроматична', notes: Array.from({ length: 37 }, (_, i) => 48 + i) }
};
export const INSTRUMENTS = {
  0: { name: 'Фортепіано', wave: 'triangle', decay: 3.5 },
  10: { name: 'Музична скринька', wave: 'sine', decay: 5 },
  11: { name: 'Вібрафон', wave: 'sine', decay: 2.5 },
  80: { name: 'Синтезатор', wave: 'square', decay: 1.8 }
};

export function normalize(values) {
  const min = Math.min(...values), max = Math.max(...values);
  // Scaling first avoids overflow when finite endpoints have an infinite difference.
  const magnitude = Math.max(Math.abs(min), Math.abs(max), 1);
  const lo = min / magnitude, hi = max / magnitude;
  return { min, max, values: values.map(v => min === max ? 0.5 : Math.max(0, Math.min(1, (v / magnitude - lo) / (hi - lo)))) };
}

export function createComposition(dataset, options = {}) {
  const config = { pitchColumn: dataset.numeric[0]?.name, expressionColumn: dataset.numeric[1]?.name, bpm: 108, scale: 'pentatonic', instrument: 11, ...options };
  const pitch = dataset.numeric.find(c => c.name === config.pitchColumn);
  const expression = dataset.numeric.find(c => c.name === config.expressionColumn);
  if (!pitch || !expression || pitch === expression) throw new Error('Оберіть два різні числові показники.');
  if (!Number.isInteger(config.bpm) || config.bpm < 40 || config.bpm > 240) throw new Error('Темп має бути цілим числом від 40 до 240 BPM.');
  const scale = SCALES[config.scale];
  if (!scale || !INSTRUMENTS[config.instrument]) throw new Error('Невідома гама або MIDI-інструмент.');
  const p = normalize(pitch.values), e = normalize(expression.values);
  const notes = p.values.map((value, i) => ({
    tick: i * PPQ,
    pitch: scale.notes[Math.round(value * (scale.notes.length - 1))],
    velocity: Math.round(40 + 75 * e.values[i]),
    duration: Math.round(PPQ * (0.35 + 0.55 * e.values[i])),
    sourceIndex: i, pitchValue: pitch.values[i], expressionValue: expression.values[i],
    normalizedPitch: value, normalizedExpression: e.values[i]
  }));
  return { config, notes, ppq: PPQ, totalTicks: notes.length * PPQ,
    seconds: notes.length * 60 / config.bpm,
    ranges: { pitch: { min: p.min, max: p.max }, expression: { min: e.min, max: e.max } } };
}

export function noteName(note) {
  return `${['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][note % 12]}${Math.floor(note / 12) - 1}`;
}
