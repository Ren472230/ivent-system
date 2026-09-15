import test from 'node:test';
import assert from 'node:assert/strict';
import { loadIvent } from './helpers/load-app.mjs';

test('library markup shows active games, archive and actions', () => {
  const Ivent = loadIvent();
  let library = Ivent.createGameLibrary();
  library = Ivent.setGameActive(library, 'uno', false);
  const html = Ivent.renderGameLibraryHtml(library);
  assert.match(html, /Создать игру/);
  assert.match(html, /Активные/);
  assert.match(html, /Архив/);
  assert.match(html, /data-gl-action="passport"/);
  assert.match(html, /data-gl-action="restore"/);
});

test('passport contains goal, rules, reward and props', () => {
  const Ivent = loadIvent();
  const manifest = Ivent.createCustomGameManifest({
    name: 'Проверка', summary: 'Короткая суть', goal: 'Набрать очки', rules: 'Первое правило',
    estimatedMinutes: 12, defaultWinnerReward: 6, requiredProps: ['бумага'],
  }, 1700000000300);
  const html = Ivent.renderGamePassportHtml(manifest);
  assert.match(html, /Набрать очки/);
  assert.match(html, /Первое правило/);
  assert.match(html, /6<\/b> жет/);
  assert.match(html, /бумага/);
});

test('editor exposes image, rules, props, AI and create-and-add mode', () => {
  const Ivent = loadIvent();
  const html = Ivent.renderGameEditorHtml(null, true);
  assert.match(html, /type="file"/);
  assert.match(html, /Название/);
  assert.match(html, /Правила/);
  assert.match(html, /Реквизит/);
  assert.match(html, /ИИ/);
  assert.match(html, /Создать и добавить этап/);
});

test('active module ids exclude archived and historical manifests', () => {
  const Ivent = loadIvent();
  let library = Ivent.createGameLibrary();
  library = Ivent.setGameActive(library, 'uno', false);
  const active = Ivent.getActiveGameModuleIds(library);
  assert.equal(active.includes('uno'), false);
  assert.equal(active.includes('alias'), true);
});
