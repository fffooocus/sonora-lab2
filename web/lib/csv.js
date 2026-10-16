export const MAX_ROWS = 512;
export const MAX_BYTES = 1024 * 1024;

function delimiterOf(text) {
  const counts = { ',': 0, ';': 0, '\t': 0 };
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') i++;
      else quoted = !quoted;
    } else if (!quoted) {
      if (c === '\n' || c === '\r') break;
      if (c in counts) counts[c]++;
    }
  }
  return Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
}

export function parseCSV(source) {
  if (typeof source !== 'string' || !source.trim()) throw new Error('CSV порожній. Додайте заголовок і щонайменше два рядки даних.');
  if (new TextEncoder().encode(source).length > MAX_BYTES) throw new Error('Файл завеликий. Максимальний розмір — 1 МБ.');
  const text = source.replace(/^\uFEFF/, '');
  const delimiter = delimiterOf(text);
  const rows = [];
  let row = [], field = '', quoted = false, closed = false;
  const pushField = () => { row.push(field.trim()); field = ''; closed = false; };
  const pushRow = () => {
    pushField();
    if (row.some(c => c !== '')) rows.push(row);
    row = [];
    if (rows.length > MAX_ROWS + 1) throw new Error(`Максимум ${MAX_ROWS} рядків даних.`);
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { quoted = false; closed = true; }
      } else field += c;
    } else if (c === delimiter) pushField();
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      pushRow();
    } else if (c === '"') {
      if (field.trim() || closed) throw new Error('Некоректні лапки у CSV. Використовуйте подвійні лапки навколо всього поля.');
      field = ''; quoted = true;
    } else {
      if (closed && c.trim()) throw new Error('Зайвий текст після закривальних лапок у CSV.');
      field += c;
    }
  }
  if (quoted) throw new Error('У CSV є незакриті подвійні лапки.');
  if (field || row.length || closed) pushRow();
  if (rows.length < 3) throw new Error('Потрібні заголовок та щонайменше два рядки даних.');
  const headers = rows.shift();
  if (headers.some(h => !h) || new Set(headers).size !== headers.length) throw new Error('Заголовки стовпців мають бути непорожніми та унікальними.');
  if (headers.length > 32) throw new Error('Максимум 32 стовпці у CSV.');
  rows.forEach((r, i) => {
    if (r.length !== headers.length) throw new Error(`Рядок даних ${i + 1}: очікується ${headers.length} полів, отримано ${r.length}.`);
  });
  const numericValue = value => {
    const s = delimiter === ',' ? value : value.replace(',', '.');
    return /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(s) && Number.isFinite(Number(s)) ? Number(s) : null;
  };
  const numeric = headers.flatMap((name, index) => {
    const values = rows.map(r => numericValue(r[index]));
    return values.every(v => v !== null) ? [{ name, index, values }] : [];
  });
  if (numeric.length < 2) throw new Error('Потрібні щонайменше два повністю числові стовпці без пропусків, NaN або Infinity. Для десяткової коми оберіть роздільник «;».');
  return { headers, rows, numeric, delimiter };
}
