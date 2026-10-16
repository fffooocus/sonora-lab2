import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.join(root, 'artifacts');
const excluded = new Set(['node_modules', '.git', 'dist', 'artifacts', '.tmp', '.agents', '.codex', '.aws']);
async function collect(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (excluded.has(entry.name) || entry.name.startsWith('.env') || entry.name.endsWith('.log')) continue;
    const relative = prefix + entry.name;
    if (entry.isDirectory()) files.push(...await collect(path.join(directory, entry.name), relative + '/'));
    else if (entry.isFile()) files.push({ name: relative, data: await readFile(path.join(directory, entry.name)) });
  }
  return files;
}
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
// ZIP store mode: no platform-specific archiver or runtime dependencies required.
function zip(files) {
  const chunks = [], directory = []; let offset = 0;
  for (const { name, data } of files) {
    const filename = Buffer.from(name, 'utf8'), crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(33, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(filename.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(33, 14); central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(filename.length, 28); central.writeUInt32LE(offset, 42);
    chunks.push(local, filename, data); directory.push(central, filename); offset += local.length + filename.length + data.length;
  }
  const central = Buffer.concat(directory), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, central, end]);
}
await mkdir(out, { recursive: true });
const files = await collect(root);
for (const required of ['docs/report.pdf', 'docs/report.docx', 'examples/sonora-weather.mid', 'docs/verification.json']) {
  if (!files.find(f => f.name === required)) throw new Error(`Missing required artifact: ${required}. Run checks, docs and build first.`);
}
const archive = zip(files), name = 'SONORA-lab2-IPS41.zip';
await writeFile(path.join(out, name), archive);
await writeFile(path.join(out, 'SHA256SUMS.txt'), `${createHash('sha256').update(archive).digest('hex')}  ${name}\n`);
console.log(`${name}: ${files.length} files, ${archive.length} bytes`);
