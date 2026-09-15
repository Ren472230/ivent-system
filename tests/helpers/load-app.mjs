import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';

let cached = null;

export function loadIvent() {
  if (cached) return cached;
  execFileSync('tsc', ['-p', 'tsconfig.json'], { stdio: 'pipe' });
  const source = fs.readFileSync('build/ivent.js', 'utf8');
  vm.runInThisContext(source, { filename: 'build/ivent.js' });
  if (!globalThis.Ivent) throw new Error('Ivent global missing');
  cached = globalThis.Ivent;
  return cached;
}
