import { cp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseCSV } from '../web/lib/csv.js';
import { createComposition } from '../web/lib/sonify.js';
import { encodeMidi } from '../web/lib/midi.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'dist');
if (path.dirname(output) !== path.resolve(root)) throw new Error('Unsafe build output');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const csv = await readFile(path.join(root, 'examples/kyiv-weather.csv'), 'utf8');
await writeFile(path.join(root, 'examples/sonora-weather.mid'), encodeMidi(createComposition(parseCSV(csv))));
await cp(path.join(root, 'web'), output, { recursive: true });
await cp(path.join(root, 'examples'), path.join(output, 'examples'), { recursive: true });
await cp(path.join(root, 'docs'), path.join(output, 'docs'), { recursive: true });
await writeFile(path.join(output, '.nojekyll'), '');
console.log('Built static application → dist/');
