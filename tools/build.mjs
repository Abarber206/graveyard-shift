#!/usr/bin/env node
// Builds the shareable copies of Graveyard Shift from index.html + css/ + js/ (the same as build.ps1, for machines
// without PowerShell, such as a cloud session):
//   share/GraveyardShift.html      the whole game in one file: double-click to play, or send it to friends
//   share/web/index.html           the same file, ready to drop onto any static web host
//   share/GraveyardShift-web.zip   the same again, zipped for itch.io ("HTML" project, "played in the browser")
// usage: node tools/build.mjs        (no packages needed)
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8').replace(/^﻿/, '');

let html = read('index.html');
const css = read('css/style.css');

// script order comes from the loader in index.html, so there is only one list to maintain
const list = html.match(/const files = \[([^\]]+)\]/);
if (!list) throw new Error('Could not find the script list in index.html');
const files = [...list[1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]);

let scripts = '';
for (const f of files) {
  const js = read(`js/${f}.js`);
  if (js.includes('</script')) throw new Error(`js/${f}.js contains '</script' and cannot be embedded`);
  scripts += `<script type="text/x-gs" data-file="${f}">\n${js}\n</script>\n`;
}

const link = '<link rel="stylesheet" href="css/style.css">';
if (!html.includes(link)) throw new Error('Could not find the stylesheet link in index.html');
html = html.replace(link, () => `<style>\n${css}\n</style>`);
const at = html.lastIndexOf('<script type="module">');
if (at < 0) throw new Error('Could not find the loader script in index.html');
html = html.slice(0, at) + scripts + html.slice(at);

const out = join(root, 'share'), web = join(out, 'web');
mkdirSync(web, { recursive: true });
writeFileSync(join(out, 'GraveyardShift.html'), html, 'utf8');
writeFileSync(join(web, 'index.html'), html, 'utf8');
writeFileSync(join(out, 'GraveyardShift-web.zip'), zipOne('index.html', Buffer.from(html, 'utf8')));

const kb = Math.round(statSync(join(out, 'GraveyardShift.html')).size / 1024);
console.log(`Built share/GraveyardShift.html (${kb} KB), share/web/index.html and share/GraveyardShift-web.zip`);

// ---- a one-file zip archive (deflated), so no zip tool or package is needed ----
function zipOne(name, data) {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
  let crc = 0xffffffff;
  for (const b of data) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  crc = (crc ^ 0xffffffff) >>> 0;
  const comp = deflateRawSync(data, { level: 9 }), nm = Buffer.from(name, 'utf8');
  const d = new Date();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);
  local.writeUInt16LE(time, 10); local.writeUInt16LE(date, 12); local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nm.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(8, 10); central.writeUInt16LE(time, 12); central.writeUInt16LE(date, 14); central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(comp.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nm.length, 28);
  // (extra, comment, disk, attributes and the local header's offset are all 0)
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + nm.length, 12); end.writeUInt32LE(local.length + nm.length + comp.length, 16);
  return Buffer.concat([local, nm, comp, central, nm, end]);
}
