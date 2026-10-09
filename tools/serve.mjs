#!/usr/bin/env node
// Tiny static file server for Graveyard Shift (the same as serve.ps1, for machines without PowerShell).
// usage: node tools/serve.mjs [port]        (no packages needed; default port 8137)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const port = Number(process.argv[2] || process.env.PORT || 8137);
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.md': 'text/plain; charset=utf-8', '.zip': 'application/zip',
};

createServer(async (req, res) => {
  try {
    const rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/+/, '') || 'index.html';
    const full = normalize(join(root, rel));
    if (full !== root && !full.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    if (!(await stat(full)).isFile()) throw new Error('not a file');
    const body = await readFile(full);
    res.writeHead(200, { 'Content-Type': MIME[extname(full).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store', 'Content-Length': body.length });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
}).listen(port, () => {
  console.log(`\n  GRAVEYARD SHIFT is running at http://localhost:${port}/\n  Ctrl+C to stop.\n`);
});
