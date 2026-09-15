import test from 'node:test';
import assert from 'node:assert/strict';
import { loadIvent } from './helpers/load-app.mjs';

class MemoryStorage {
  constructor() { this.data = new Map(); }
  getItem(key) { return this.data.has(key) ? this.data.get(key) : null; }
  setItem(key, value) { this.data.set(key, String(value)); }
  removeItem(key) { this.data.delete(key); }
}

function stateWithPlayer(Ivent, name, now) {
  let state = Ivent.createEvent('Storage', { seed: 22, now });
  state = Ivent.execute(state, { type: 'ADD_PLAYER', name, now: now + 1 }).state;
  return state;
}

test('save writes primary and metadata for a valid slot', () => {
  const Ivent = loadIvent();
  const storage = new MemoryStorage();
  const adapter = Ivent.createStorageAdapter(storage);
  const state = stateWithPlayer(Ivent, 'Саша', 100);
  adapter.save('slot-1', state);
  assert.ok(storage.getItem('ivent:v1:slot-1:primary'));
  const meta = JSON.parse(storage.getItem('ivent:v1:slot-1:meta'));
  assert.equal(meta.title, 'Storage');
  assert.equal(meta.playerCount, 1);
  assert.ok(meta.checksum);
});

test('second save keeps previous valid primary as backup and load falls back after corruption', () => {
  const Ivent = loadIvent();
  const storage = new MemoryStorage();
  const adapter = Ivent.createStorageAdapter(storage);
  const first = stateWithPlayer(Ivent, 'Саша', 100);
  adapter.save('slot-1', first);
  const second = Ivent.execute(first, { type: 'ADD_PLAYER', name: 'Катя', now: 200 }).state;
  adapter.save('slot-1', second);
  assert.ok(storage.getItem('ivent:v1:slot-1:backup'));
  storage.setItem('ivent:v1:slot-1:primary', '{broken');
  const loaded = adapter.load('slot-1');
  assert.equal(loaded.players.length, 1);
  assert.equal(loaded.players[0].name, 'Саша');
});

test('invalid import does not overwrite a valid slot', () => {
  const Ivent = loadIvent();
  const storage = new MemoryStorage();
  const adapter = Ivent.createStorageAdapter(storage);
  const state = stateWithPlayer(Ivent, 'Саша', 100);
  adapter.save('slot-1', state);
  assert.throws(() => adapter.import('slot-1', '{bad json'), /импорт|json|файл/i);
  const loaded = adapter.load('slot-1');
  assert.equal(loaded.players[0].name, 'Саша');
});

test('export and import round trip preserves event state', () => {
  const Ivent = loadIvent();
  const storage = new MemoryStorage();
  const adapter = Ivent.createStorageAdapter(storage);
  const state = stateWithPlayer(Ivent, 'Саша', 100);
  adapter.save('slot-1', state);
  const exported = adapter.export('slot-1');
  adapter.import('slot-2', exported);
  assert.deepEqual(adapter.load('slot-2'), state);
});

test('schema version 1 is accepted and unsupported versions are rejected', () => {
  const Ivent = loadIvent();
  const storage = new MemoryStorage();
  const adapter = Ivent.createStorageAdapter(storage);
  const state = stateWithPlayer(Ivent, 'Саша', 100);
  adapter.import('slot-1', JSON.stringify(state));
  assert.equal(adapter.load('slot-1').schemaVersion, 1);
  const future = { ...state, schemaVersion: 999 };
  assert.throws(() => adapter.import('slot-2', JSON.stringify(future)), /верс/i);
});
