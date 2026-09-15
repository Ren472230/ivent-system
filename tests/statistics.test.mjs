import test from 'node:test';
import assert from 'node:assert/strict';
import { loadIvent } from './helpers/load-app.mjs';

function makeState() {
  const Ivent = loadIvent();
  let state = Ivent.createEvent('Stats', { startTokens: 0, seed: 1, now: 10 });
  for (const name of ['Саша', 'Катя', 'Володя']) state = Ivent.execute(state, { type: 'ADD_PLAYER', name, now: state.updatedAt + 1 }).state;
  state.players[0].totalEarned = 10;
  state.players[0].totalSpent = 4;
  state.players[0].wins = 2;
  state.players[0].negativeEffectsUsed = 1;
  state.players[0].timesTargeted = 4;
  state.players[0].inventoryItemIds = ['i1'];

  state.players[1].totalEarned = 14;
  state.players[1].totalSpent = 12;
  state.players[1].wins = 1;
  state.players[1].negativeEffectsUsed = 5;
  state.players[1].timesTargeted = 2;
  state.players[1].inventoryItemIds = ['i2', 'i3', 'i4'];

  state.players[2].totalEarned = 14;
  state.players[2].totalSpent = 3;
  state.players[2].wins = 2;
  state.players[2].negativeEffectsUsed = 2;
  state.players[2].timesTargeted = 7;
  state.players[2].inventoryItemIds = ['i5', 'i6'];
  return { Ivent, state };
}

test('calculateStatistics returns deterministic nomination winners', () => {
  const { Ivent, state } = makeState();
  const stats = Ivent.calculateStatistics(state);
  assert.equal(stats.richestEarned.playerId, state.players[1].id, 'tie must keep earlier player');
  assert.equal(stats.biggestSpender.playerId, state.players[1].id);
  assert.equal(stats.collector.playerId, state.players[1].id);
  assert.equal(stats.aggressor.playerId, state.players[1].id);
  assert.equal(stats.mostTargeted.playerId, state.players[2].id);
  assert.equal(stats.stageWinnerLeader.playerId, state.players[0].id, 'tie must keep earlier player');
});

test('calculateStatistics returns null nominations for an empty party', () => {
  const Ivent = loadIvent();
  const state = Ivent.createEvent('Empty', { seed: 1, now: 10 });
  const stats = Ivent.calculateStatistics(state);
  assert.equal(stats.richestEarned, null);
  assert.equal(stats.collector, null);
  assert.equal(stats.stageWinnerLeader, null);
});
