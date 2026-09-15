import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { loadIvent } from './helpers/load-app.mjs';

test('host application exposes mount function', () => {
  const Ivent = loadIvent();
  assert.equal(typeof Ivent.mountHostApp, 'function');
});

test('release build is one offline HTML file with core party surfaces', () => {
  execFileSync('node', ['scripts/build.mjs'], { stdio: 'pipe' });
  const path = 'release/ivent-system.html';
  assert.equal(fs.existsSync(path), true);
  const html = fs.readFileSync(path, 'utf8');
  assert.ok(html.length > 20000, 'release should contain embedded app assets');
  assert.match(html, /<style>[\s\S]+<\/style>/);
  assert.match(html, /<script>[\s\S]+<\/script>/);
  assert.doesNotMatch(html, /(?:src|href)=["']https?:\/\//i);
  for (const label of ['Игроки', 'Жетоны', 'Магазин', 'Этап', 'Сохранения', 'Элиас', 'Уно', 'Дурак', 'Пиковая дама', 'Солнышко', 'Аукцион артефактов']) {
    assert.ok(html.includes(label), `missing label ${label}`);
  }
});
