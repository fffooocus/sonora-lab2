import { INSTRUMENTS } from './sonify.js';

export class Player {
  context = null;
  nodes = new Set();
  offset = 0;
  playing = false;
  volume = 0.55;
  timer = null;

  async play(composition) {
    if (this.playing) return;
    const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContext) throw new Error('Браузер не підтримує Web Audio API. Завантажте MIDI для прослуховування.');
    this.context ??= new AudioContext();
    await this.context.resume();
    this.composition = composition;
    if (this.offset >= composition.seconds) this.offset = 0;
    this.master ??= this.context.createGain();
    this.master.gain.value = this.volume * 0.22;
    this.master.disconnect();
    this.master.connect(this.context.destination);
    this.origin = this.context.currentTime - this.offset;
    this.next = Math.floor(this.offset * composition.config.bpm / 60);
    this.playing = true;
    this.schedule();
    this.timer = setInterval(() => this.schedule(), 25);
  }

  schedule() {
    if (!this.playing) return;
    const c = this.composition, beat = 60 / c.config.bpm;
    const horizon = this.context.currentTime + 0.18;
    while (this.next < c.notes.length && this.origin + this.next * beat < horizon) {
      const n = c.notes[this.next++];
      const end = this.origin + (n.tick + n.duration) / c.ppq * beat;
      if (end <= this.context.currentTime) continue;
      const start = Math.max(this.context.currentTime + 0.005, this.origin + n.tick / c.ppq * beat);
      if (end <= start) continue;
      const oscillator = this.context.createOscillator(), gain = this.context.createGain();
      const instrument = INSTRUMENTS[c.config.instrument];
      oscillator.type = instrument.wave;
      oscillator.frequency.value = 440 * 2 ** ((n.pitch - 69) / 12);
      const peak = n.velocity / 127;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(peak, Math.min(start + 0.009, end));
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * Math.exp(-instrument.decay)), Math.max(start + 0.01, end - 0.018));
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      oscillator.connect(gain); gain.connect(this.master);
      this.nodes.add(oscillator);
      oscillator.onended = () => { this.nodes.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(start); oscillator.stop(end);
    }
  }

  get position() { return this.playing ? Math.min(this.composition.seconds, Math.max(0, this.context.currentTime - this.origin)) : this.offset; }
  pause() {
    if (this.playing) this.offset = this.position;
    this.playing = false;
    clearInterval(this.timer);
    for (const node of this.nodes) { try { node.stop(); } catch {} }
    this.nodes.clear();
  }
  stop() { this.pause(); this.offset = 0; }
  setVolume(value) {
    this.volume = value;
    if (this.master) this.master.gain.setTargetAtTime(value * 0.22, this.context.currentTime, 0.015);
  }
  seek(seconds) {
    const wasPlaying = this.playing;
    this.pause(); this.offset = seconds;
    if (wasPlaying) return this.play(this.composition);
  }
}
