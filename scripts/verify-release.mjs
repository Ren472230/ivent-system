import fs from 'node:fs';
const path = 'release/ivent-system.html';
if (!fs.existsSync(path)) throw new Error('release file missing');
const html = fs.readFileSync(path, 'utf8');
if (html.length < 20000) throw new Error('release file unexpectedly small');
if (/(?:src|href)=["']https?:\/\//i.test(html)) throw new Error('external runtime dependency found');
if (!html.includes('<style>') || !html.includes('<script>')) throw new Error('assets are not embedded');
console.log(`Verified ${path}: offline single-file release, ${Buffer.byteLength(html)} bytes`);
