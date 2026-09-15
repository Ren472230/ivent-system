import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
execFileSync('tsc', ['-p', 'tsconfig.json'], { cwd: root, stdio: 'inherit' });
const template = fs.readFileSync(path.join(root, 'src/index.template.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'build/ivent.js'), 'utf8');
const html = template.replace('/*__STYLES__*/', css).replace('/*__SCRIPT__*/', js);
fs.mkdirSync(path.join(root, 'release'), { recursive: true });
fs.writeFileSync(path.join(root, 'release/ivent-system.html'), html, 'utf8');
console.log(`Built release/ivent-system.html (${Buffer.byteLength(html)} bytes)`);
