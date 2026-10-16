import http from 'node:http';
import path from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.csv': 'text/csv; charset=utf-8', '.mid': 'audio/midi', '.md': 'text/plain; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.pdf': 'application/pdf', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };

export function createAppServer({ production = false } = {}) {
  return http.createServer(async (req, res) => {
    try {
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      let base = production ? path.join(root, 'dist') : path.join(root, 'web');
      let relative = pathname.replace(/^\/+/, '') || 'index.html';
      if (!production && /^(examples|docs)\//.test(relative)) base = root;
      const target = path.resolve(base, relative);
      if (!target.startsWith(path.resolve(base) + path.sep)) { res.writeHead(403); res.end(); return; }
      if (!(await stat(target)).isFile()) throw new Error('Not a file');
      const data = await readFile(target);
      res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream', 'Content-Length': data.length, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not found'); }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4173);
  createAppServer({ production: process.argv.includes('--production') }).listen(port, '127.0.0.1', () => console.log(`SONORA: http://127.0.0.1:${port}`));
}
