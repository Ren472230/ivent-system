import test from 'node:test';
import assert from 'node:assert/strict';
import { loadIvent } from './helpers/load-app.mjs';

function memoryStorage() {
  const map = new Map();
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(key, String(value)); },
    removeItem(key) { map.delete(key); },
  };
}

test('built-in games seed as active system manifests', () => {
  const Ivent = loadIvent();
  const library = Ivent.createGameLibrary();
  assert.equal(library.manifests.uno.active, true);
  assert.equal(library.manifests.uno.source, 'system');
  assert.match(Ivent.defaultGameCover(library.manifests.uno), /^data:image\/svg\+xml/);
});

test('archive and restore keep the manifest', () => {
  const Ivent = loadIvent();
  let library = Ivent.createGameLibrary();
  library = Ivent.setGameActive(library, 'uno', false);
  assert.equal(library.manifests.uno.active, false);
  library = Ivent.setGameActive(library, 'uno', true);
  assert.equal(library.manifests.uno.active, true);
});

test('duplicate and revision preserve historical module ids', () => {
  const Ivent = loadIvent();
  let library = Ivent.createGameLibrary();
  const duplicate = Ivent.duplicateGameManifest(library, 'uno', 1700000000000);
  library = duplicate.library;
  assert.equal(duplicate.manifest.source, 'custom');
  assert.notEqual(duplicate.manifest.moduleId, 'uno');

  const oldId = duplicate.manifest.moduleId;
  const revision = Ivent.reviseGameManifest(library, oldId, { name: 'Уно хардкор', rules: 'Новые правила' }, 1700000000100);
  assert.equal(revision.library.manifests[oldId].historical, true);
  assert.equal(revision.library.manifests[oldId].active, false);
  assert.equal(revision.manifest.supersedesModuleId, oldId);
  assert.notEqual(revision.manifest.moduleId, oldId);
});

test('custom manifest registers as a normal game module', () => {
  const Ivent = loadIvent();
  let library = Ivent.createGameLibrary();
  const manifest = Ivent.createCustomGameManifest({ name: 'Моя игра', summary: 'Суть', rules: 'Правила', estimatedMinutes: 7, defaultWinnerReward: 5 }, 1700000000200);
  library = Ivent.upsertGameManifest(library, manifest);
  Ivent.registerLibraryModules(library);
  const module = Ivent.getGameRegistry()[manifest.moduleId];
  assert.equal(module.name, 'Моя игра');
  assert.equal(module.estimatedMinutes, 7);
  assert.equal(module.defaultWinnerReward, 5);
});

test('archived game cannot create a new stage until restored', () => {
  const Ivent = loadIvent();
  const storage = memoryStorage();
  globalThis.localStorage = storage;
  let library = Ivent.createGameLibrary();
  library = Ivent.setGameActive(library, 'uno', false);
  Ivent.saveGameLibrary(library, storage);
  Ivent.installGameLibraryGuards();
  let state = Ivent.createEvent('Тест', { now: 1, seed: 7 });
  state = Ivent.execute(state, { type: 'ADD_STAGE', moduleId: 'uno', now: 2 }).state;
  assert.equal(state.stages.length, 0);
  library = Ivent.setGameActive(library, 'uno', true);
  Ivent.saveGameLibrary(library, storage);
  state = Ivent.execute(state, { type: 'ADD_STAGE', moduleId: 'uno', now: 3 }).state;
  assert.equal(state.stages.length, 1);
});

test('v0.2 save export carries the library and legacy import stays accepted', () => {
  const Ivent = loadIvent();
  const storage = memoryStorage();
  Ivent.installLibraryStorageBundle();
  const adapter = Ivent.createStorageAdapter(storage);
  const state = Ivent.createEvent('Пакет', { now: 1, seed: 3 });
  adapter.save('slot-1', state);
  const bundle = JSON.parse(adapter.export('slot-1'));
  assert.equal(bundle.iventBundleVersion, 2);
  assert.equal(bundle.state.title, 'Пакет');
  assert.ok(bundle.gameLibrary.manifests.uno);

  adapter.import('slot-2', JSON.stringify(state));
  assert.equal(adapter.load('slot-2').title, 'Пакет');
});
