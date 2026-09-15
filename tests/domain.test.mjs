import test from 'node:test';
import assert from 'node:assert/strict';
import { loadIvent } from './helpers/load-app.mjs';

test('createEvent returns deterministic initial event state', () => {
  const Ivent = loadIvent();
  const state = Ivent.createEvent('Birthday', { startTokens: 5, seed: 123 });
  assert.equal(state.title, 'Birthday');
  assert.equal(state.status, 'PREPARATION');
  assert.equal(state.configuration.startTokens, 5);
  assert.equal(state.randomSeed, 123);
  assert.deepEqual(state.players, []);
  assert.deepEqual(state.eventLog, []);
});

test('seededNext repeats the same sequence for the same seed', () => {
  const Ivent = loadIvent();
  const a1 = Ivent.seededNext(42);
  const a2 = Ivent.seededNext(a1.seed);
  const b1 = Ivent.seededNext(42);
  const b2 = Ivent.seededNext(b1.seed);
  assert.equal(a1.value, b1.value);
  assert.equal(a2.value, b2.value);
});

test('new event reserves persisted runtime state for the active auction', () => {
  const Ivent = loadIvent();
  const state = Ivent.createEvent('Runtime', { seed: 5, now: 10 });
  assert.deepEqual(state.gameRuntime, { auction: null });
});
