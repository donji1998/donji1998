#!/usr/bin/env node
// Tiny static server for the player. `npm run preview` then open the printed URL.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2' };

export function serve(port = 0) {
  const server = http.createServer((req, res) => {
    const p = path.normalize(path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    if (!p.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(p, (err, data) => {
      if (err) { res.writeHead(404).end('not found'); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(p)] ?? 'application/octet-stream', 'cache-control': 'no-store' }).end(data);
    });
  });
  return new Promise(ok => server.listen(port, '127.0.0.1', () => ok({ server, port: server.address().port })));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const ep = process.argv[2] ?? 'city/episodes/day-1.json';
  const { port } = await serve(+(process.env.PORT ?? 4173));
  console.log(`Preview: http://127.0.0.1:${port}/web/index.html?ep=/${ep}`);
}
