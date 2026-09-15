import test from 'node:test';
import assert from 'node:assert/strict';
import { loadIvent } from './helpers/load-app.mjs';

function eventWithPlayers() {
  const Ivent = loadIvent();
  let state = Ivent.createEvent('Test', { startTokens: 5, seed: 7, now: 100 });
  state = Ivent.execute(state, { type: 'ADD_PLAYER', name: 'Саша', now: 101 }).state;
  state = Ivent.execute(state, { type: 'ADD_PLAYER', name: 'Катя', now: 102 }).state;
  return { Ivent, state };
}

test('ADD_PLAYER grants configured starting tokens and allows repeated visible names', () => {
  const Ivent = loadIvent();
  let state = Ivent.createEvent('Test', { startTokens: 5, seed: 7, now: 100 });
  state = Ivent.execute(state, { type: 'ADD_PLAYER', name: 'Саша', now: 101 }).state;
  state = Ivent.execute(state, { type: 'ADD_PLAYER', name: 'Саша', now: 102 }).state;
  assert.equal(state.players.length, 2);
  assert.equal(state.players[0].walletBalance, 5);
  assert.notEqual(state.players[0].id, state.players[1].id);
  assert.equal(state.eventLog.at(-1).type, 'PLAYER_ADDED');
});

test('ADD_PLAYER rejects blank names without changing input state', () => {
  const Ivent = loadIvent();
  const state = Ivent.createEvent('Test', { seed: 1, now: 100 });
  const before = JSON.stringify(state);
  assert.throws(() => Ivent.execute(state, { type: 'ADD_PLAYER', name: '   ', now: 101 }), /имя/i);
  assert.equal(JSON.stringify(state), before);
});

test('SPEND_TOKENS rejects negative balance atomically', () => {
  const { Ivent, state } = eventWithPlayers();
  const before = JSON.stringify(state);
  assert.throws(() => Ivent.execute(state, {
    type: 'SPEND_TOKENS', playerId: state.players[0].id, amount: 6, reason: 'shop', now: 103,
  }), /жетон/i);
  assert.equal(JSON.stringify(state), before);
});

test('TRANSFER_TOKENS moves balance and UNDO restores both balances', () => {
  const { Ivent, state } = eventWithPlayers();
  const from = state.players[0].id;
  const to = state.players[1].id;
  const moved = Ivent.execute(state, {
    type: 'TRANSFER_TOKENS', fromPlayerId: from, toPlayerId: to, amount: 3, reason: 'gift', now: 103,
  }).state;
  assert.equal(moved.players[0].walletBalance, 2);
  assert.equal(moved.players[1].walletBalance, 8);
  const undone = Ivent.execute(moved, { type: 'UNDO_LAST_ACTION', now: 104 }).state;
  assert.equal(undone.players[0].walletBalance, 5);
  assert.equal(undone.players[1].walletBalance, 5);
  assert.equal(undone.eventLog.at(-1).type, 'ACTION_UNDONE');
});

test('status lifecycle accepts valid transitions and rejects invalid ones', () => {
  const Ivent = loadIvent();
  let state = Ivent.createEvent('Test', { seed: 1, now: 100 });
  state = Ivent.execute(state, { type: 'SET_STATUS', status: 'LOBBY', now: 101 }).state;
  state = Ivent.execute(state, { type: 'SET_STATUS', status: 'PLAYING', now: 102 }).state;
  assert.equal(state.status, 'PLAYING');
  assert.throws(() => Ivent.execute(state, { type: 'SET_STATUS', status: 'PREPARATION', now: 103 }), /переход/i);
});

test('AWARD_TOKENS updates earned totals and log', () => {
  const { Ivent, state } = eventWithPlayers();
  const playerId = state.players[0].id;
  const result = Ivent.execute(state, { type: 'AWARD_TOKENS', playerId, amount: 4, reason: 'win', now: 103 }).state;
  assert.equal(result.players[0].walletBalance, 9);
  assert.equal(result.players[0].totalEarned, 4);
  assert.equal(result.eventLog.at(-1).type, 'TOKENS_AWARDED');
});
