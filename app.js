import { parseCSV, MAX_BYTES } from './lib/csv.js';
import { createComposition, noteName } from './lib/sonify.js';
import { encodeMidi } from './lib/midi.js';
import { Player } from './lib/audio.js';

const $ = id => document.getElementById(id);
const player = new Player();
let dataset, composition, csvText = '', filename = '', frame = 0, toastTimer, playPending = false;
const time = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

function toast(message) {
  $('toast').textContent = message; $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 4500);
}
function showError(message) { $('data-error').textContent = message; $('data-error').hidden = !message; }
function setPlayingUI() {
  $('play').classList.toggle('is-playing', player.playing);
  $('play').setAttribute('aria-label', player.playing ? 'Призупинити' : 'Відтворити');
  $('play').querySelector('use').setAttribute('href', player.playing ? '#i-pause' : '#i-play');
}
function stop() {
  player.stop(); cancelAnimationFrame(frame); setPlayingUI();
  $('playback-status').textContent = 'Композиція готова до прослуховування'; updatePosition();
}
function renderTable() {
  const tr = document.createElement('tr');
  dataset.headers.forEach(header => {
    const th = document.createElement('th'); th.textContent = header; th.scope = 'col';
    if (header === $('pitch-column').value) th.className = 'pitch';
    if (header === $('expression-column').value) th.className = 'expression';
    tr.append(th);
  });
  $('data-table').tHead.replaceChildren(tr);
  const body = document.createDocumentFragment();
  dataset.rows.forEach(row => {
    const tr = document.createElement('tr');
    row.forEach((cell, index) => {
      const td = document.createElement('td'); td.textContent = cell;
      if (dataset.headers[index] === $('pitch-column').value) td.className = 'pitch';
      if (dataset.headers[index] === $('expression-column').value) td.className = 'expression';
      tr.append(td);
    }); body.append(tr);
  });
  $('data-table').tBodies[0].replaceChildren(body);
  $('row-count').textContent = `${dataset.rows.length} рядків · числових стовпців: ${dataset.numeric.length}`;
}
function regenerate() {
  if (!dataset) return;
  try {
    const result = createComposition(dataset, { pitchColumn: $('pitch-column').value, expressionColumn: $('expression-column').value, bpm: Number($('tempo').value), scale: $('scale').value, instrument: Number($('instrument').value) });
    stop(); composition = result;
    $('tempo-value').replaceChildren(document.createTextNode(`${composition.config.bpm} `), Object.assign(document.createElement('span'), { textContent: 'BPM' }));
    $('note-count').textContent = composition.notes.length;
    $('total-time').textContent = $('duration-stat').textContent = time(composition.seconds);
    showError(''); renderTable(); updatePosition();
  } catch (error) { showError(error.message); }
}
function applyDataset(text, name, synthetic = false) {
  const parsed = parseCSV(text); // Validate before replacing the working state.
  dataset = parsed; csvText = text; filename = name;
  for (const id of ['pitch-column', 'expression-column']) {
    $(id).replaceChildren(...dataset.numeric.map(c => new Option(c.name, c.name)));
  }
  $('pitch-column').selectedIndex = 0; $('expression-column').selectedIndex = 1;
  $('dataset-name').textContent = name;
  $('dataset-description').textContent = synthetic ? 'Навчальні синтетичні дані' : 'Ваші дані · обробляються лише у браузері';
  $('demo-weather').classList.toggle('selected', name === 'kyiv-weather.csv' && synthetic);
  $('demo-energy').classList.toggle('selected', name === 'energy.csv' && synthetic);
  regenerate();
}
async function loadDemo(name) {
  try {
    const response = await fetch(new URL(`./examples/${name}`, import.meta.url));
    if (!response.ok) throw new Error('Не вдалося відкрити приклад CSV.');
    applyDataset(await response.text(), name, true);
  } catch (error) { showError(error.message); }
}
async function importFile(file) {
  if (!file) return;
  try {
    if (file.size > MAX_BYTES) throw new Error('Файл завеликий. Максимальний розмір — 1 МБ.');
    applyDataset(await file.text(), file.name); toast('CSV перевірено. Нову композицію сформовано.');
  } catch (error) { showError(error.message); }
  $('file-input').value = '';
}
function drawPiano(position = 0) {
  if (!composition || $('view-studio').hidden) return;
  const canvas = $('piano-roll'), box = canvas.getBoundingClientRect();
  const width = box.width, height = box.height;
  if (!width || !height) return;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
  }
  const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
  const left = 35, top = 13, bottom = height - 22, right = width - 12;
  const low = Math.min(...composition.notes.map(n => n.pitch)) - 2;
  const high = Math.max(...composition.notes.map(n => n.pitch)) + 2;
  const y = note => bottom - (note - low) / (high - low) * (bottom - top);
  ctx.font = '8px Consolas, monospace'; ctx.textBaseline = 'middle';
  const labels = [...new Set([low + 2, Math.round((low + high) / 2), high - 2])];
  for (const note of labels) {
    const py = y(note); ctx.fillStyle = '#8b9a7c'; ctx.fillText(noteName(note), 7, py);
    ctx.strokeStyle = '#303b2b'; ctx.beginPath(); ctx.moveTo(left, py); ctx.lineTo(right, py); ctx.stroke();
  }
  const count = composition.notes.length, cell = (right - left) / count;
  const step = Math.max(1, Math.ceil(count / (width < 500 ? 6 : 12)));
  for (let i = 0; i <= count; i++) {
    if (i % step !== 0) continue;
    const x = left + i * cell;
    ctx.strokeStyle = i % 4 === 0 ? '#34402f' : '#232f24'; ctx.beginPath(); ctx.moveTo(x, 7); ctx.lineTo(x, bottom + 5); ctx.stroke();
    if (i < count) { ctx.fillStyle = '#7e9070'; ctx.fillText(String(i + 1).padStart(2, '0'), x + 2, height - 9); }
  }
  const activeIndex = Math.floor(position * composition.config.bpm / 60);
  for (const n of composition.notes) {
    const x = left + n.sourceIndex * cell, py = y(n.pitch), intensity = n.normalizedExpression;
    const r = Math.round(154 + intensity * 78), g = Math.round(195 - intensity * 15), b = Math.round(168 - intensity * 61);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    if (player.playing && n.sourceIndex === activeIndex) { ctx.shadowColor = '#e8c78a'; ctx.shadowBlur = 10; }
    const w = Math.max(1, cell * n.duration / composition.ppq - 1);
    ctx.beginPath(); ctx.roundRect(x + .5, py - 3, w, 6, Math.min(2, w / 2)); ctx.fill(); ctx.shadowBlur = 0;
  }
  if (position > 0) {
    const x = left + Math.min(1, position / composition.seconds) * (right - left);
    ctx.strokeStyle = '#f0d4a0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, 5); ctx.lineTo(x, bottom + 6); ctx.stroke();
  }
}
function updatePosition() {
  const position = player.position;
  $('current-time').textContent = time(position);
  $('seek').value = composition ? Math.round(position / composition.seconds * 1000) : 0;
  drawPiano(position);
}
function animate() {
  updatePosition();
  if (player.playing && player.position >= composition.seconds) {
    player.pause(); setPlayingUI(); $('playback-status').textContent = 'Відтворення завершено'; return;
  }
  if (player.playing) frame = requestAnimationFrame(animate);
}
async function togglePlay() {
  if (!composition || playPending) return;
  if (player.playing) {
    player.pause(); cancelAnimationFrame(frame); setPlayingUI(); updatePosition();
    $('playback-status').textContent = 'Відтворення призупинено';
  } else {
    playPending = true; $('play').disabled = true;
    try { await player.play(composition); setPlayingUI(); if (player.playing) { $('playback-status').textContent = 'Відтворення · синтез Web Audio'; animate(); } }
    catch (error) { toast(error.message); }
    finally { playPending = false; $('play').disabled = false; }
  }
}
function navigate() {
  const name = ['studio', 'guide', 'report'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'studio';
  if (name !== 'studio') { player.pause(); cancelAnimationFrame(frame); setPlayingUI(); }
  document.querySelectorAll('.view').forEach(el => el.hidden = el.id !== `view-${name}`);
  document.querySelectorAll('[data-view]').forEach(el => { el.classList.toggle('active', el.dataset.view === name); if (el.dataset.view === name) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current'); });
  $('page-title').textContent = { studio: 'Студія', guide: 'Як це працює', report: 'Матеріали роботи' }[name];
  if (name === 'studio') requestAnimationFrame(updatePosition);
}

$('upload-zone').addEventListener('click', () => $('file-input').click());
$('file-input').addEventListener('change', e => importFile(e.target.files[0]));
for (const event of ['dragenter', 'dragover']) $('upload-zone').addEventListener(event, e => { e.preventDefault(); $('upload-zone').classList.add('dragover'); });
for (const event of ['dragleave', 'drop']) $('upload-zone').addEventListener(event, e => { e.preventDefault(); $('upload-zone').classList.remove('dragover'); });
$('upload-zone').addEventListener('drop', e => importFile(e.dataTransfer.files[0]));
$('demo-weather').addEventListener('click', () => loadDemo('kyiv-weather.csv'));
$('demo-energy').addEventListener('click', () => loadDemo('energy.csv'));
for (const id of ['pitch-column', 'expression-column']) $(id).addEventListener('change', () => {
  const other = $(id === 'pitch-column' ? 'expression-column' : 'pitch-column');
  if (other.value === $(id).value) other.value = dataset.numeric.find(c => c.name !== $(id).value).name;
  regenerate();
});
for (const id of ['scale', 'instrument']) $(id).addEventListener('change', regenerate);
$('tempo').addEventListener('input', regenerate);
$('play').addEventListener('click', togglePlay); $('stop').addEventListener('click', stop);
$('volume').addEventListener('input', e => player.setVolume(Number(e.target.value) / 100));
$('seek').addEventListener('input', async e => {
  if (!composition) return;
  try { await player.seek(Number(e.target.value) / 1000 * composition.seconds); updatePosition(); }
  catch (error) { toast(error.message); }
});
$('download-midi').addEventListener('click', () => {
  if (!composition) return;
  const blob = new Blob([encodeMidi(composition)], { type: 'audio/midi' });
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = `${filename.replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N}_-]/gu, '_') || 'sonora'}-${composition.config.bpm}bpm.mid`;
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('MIDI завантажено. Відкрийте його у плеєрі або музичному редакторі.');
});
$('edit-data').addEventListener('click', () => { $('csv-editor').value = csvText; $('editor-error').hidden = true; $('csv-dialog').showModal(); });
$('apply-csv').addEventListener('click', () => {
  try { applyDataset($('csv-editor').value, 'custom-data.csv'); $('csv-dialog').close(); toast('Дані оновлено, MIDI сформовано автоматично.'); }
  catch (error) { $('editor-error').textContent = error.message; $('editor-error').hidden = false; }
});
document.addEventListener('keydown', e => {
  if ($('csv-dialog').open || /INPUT|TEXTAREA|SELECT|BUTTON|A/.test(e.target.tagName) || e.target.isContentEditable || $('view-studio').hidden || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
  if (e.code === 'Escape') stop();
});
window.addEventListener('hashchange', navigate);
new ResizeObserver(() => drawPiano(player.position)).observe($('piano-roll'));
document.addEventListener('visibilitychange', () => { if (document.hidden && player.playing) { player.pause(); cancelAnimationFrame(frame); setPlayingUI(); $('playback-status').textContent = 'Пауза · вкладка неактивна'; } });
navigate();
await loadDemo('kyiv-weather.csv');
