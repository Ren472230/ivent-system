import test from 'node:test';
import assert from 'node:assert/strict';
import { loadIvent } from './helpers/load-app.mjs';

function setup(startTokens = 10) {
  const Ivent = loadIvent();
  let state = Ivent.createEvent('Items', { startTokens, maxActiveItems: 1, seed: 9, now: 100 });
  state = Ivent.execute(state, { type: 'ADD_PLAYER', name: 'Саша', now: 101 }).state;
  state = Ivent.execute(state, { type: 'ADD_PLAYER', name: 'Катя', now: 102 }).state;
  return { Ivent, state };
}

function register(Ivent, state, templateId, now = 103) {
  return Ivent.execute(state, { type: 'REGISTER_ITEM', templateId, now }).state;
}

test('default catalog contains high-impact and physical prize items', () => {
  const Ivent = loadIvent();
  const ids = Ivent.createDefaultCatalog().map((item) => item.templateId);
  for (const id of ['redirect', 'shield', 'swap_result', 'steal_tokens', 'double_reward', 'reveal_balance', 'big_lollipop', 'emerald_heart']) {
    assert.ok(ids.includes(id), `missing ${id}`);
  }
});

test('BUY_ITEM is atomic and assigns one owner', () => {
  const { Ivent, state: base } = setup(10);
  let state = register(Ivent, base, 'reveal_balance');
  const itemId = state.inventory[0].id;
  const buyerId = state.players[0].id;
  state = Ivent.execute(state, { type: 'BUY_ITEM', itemId, playerId: buyerId, now: 104 }).state;
  assert.equal(state.inventory[0].ownerId, buyerId);
  assert.deepEqual(state.players[0].inventoryItemIds, [itemId]);
  assert.equal(state.players[0].walletBalance, 7);
  assert.equal(state.players[0].totalSpent, 3);
  assert.equal(state.eventLog.at(-1).type, 'ITEM_PURCHASED');
});

test('BUY_ITEM rejects insufficient funds and keeps state unchanged', () => {
  const { Ivent, state: base } = setup(2);
  const state = register(Ivent, base, 'reveal_balance');
  const before = JSON.stringify(state);
  assert.throws(() => Ivent.execute(state, {
    type: 'BUY_ITEM', itemId: state.inventory[0].id, playerId: state.players[0].id, now: 104,
  }), /жетон/i);
  assert.equal(JSON.stringify(state), before);
});

test('activation respects max active items and decrements uses', () => {
  const { Ivent, state: base } = setup(30);
  let state = register(Ivent, base, 'shield', 103);
  state = register(Ivent, state, 'reveal_balance', 104);
  const playerId = state.players[0].id;
  const first = state.inventory[0].id;
  const second = state.inventory[1].id;
  state = Ivent.execute(state, { type: 'BUY_ITEM', itemId: first, playerId, now: 105 }).state;
  state = Ivent.execute(state, { type: 'BUY_ITEM', itemId: second, playerId, now: 106 }).state;
  const beforeUses = state.inventory.find((item) => item.id === first).usesRemaining;
  state = Ivent.execute(state, { type: 'ACTIVATE_ITEM', itemId: first, playerId, now: 107 }).state;
  assert.equal(state.inventory.find((item) => item.id === first).usesRemaining, beforeUses - 1);
  assert.throws(() => Ivent.execute(state, { type: 'ACTIVATE_ITEM', itemId: second, playerId, now: 108 }), /актив/i);
});

test('GIVE_ITEM changes ownership consistently', () => {
  const { Ivent, state: base } = setup(20);
  let state = register(Ivent, base, 'shield');
  const itemId = state.inventory[0].id;
  const fromId = state.players[0].id;
  const toId = state.players[1].id;
  state = Ivent.execute(state, { type: 'BUY_ITEM', itemId, playerId: fromId, now: 104 }).state;
  state = Ivent.execute(state, { type: 'GIVE_ITEM', itemId, fromPlayerId: fromId, toPlayerId: toId, now: 105 }).state;
  assert.equal(state.inventory[0].ownerId, toId);
  assert.deepEqual(state.players[0].inventoryItemIds, []);
  assert.deepEqual(state.players[1].inventoryItemIds, [itemId]);
});

test('undo purchase restores balance and item ownership', () => {
  const { Ivent, state: base } = setup(10);
  let state = register(Ivent, base, 'reveal_balance');
  const itemId = state.inventory[0].id;
  const playerId = state.players[0].id;
  const beforePurchaseBalance = state.players[0].walletBalance;
  state = Ivent.execute(state, { type: 'BUY_ITEM', itemId, playerId, now: 104 }).state;
  state = Ivent.execute(state, { type: 'UNDO_LAST_ACTION', now: 105 }).state;
  assert.equal(state.players[0].walletBalance, beforePurchaseBalance);
  assert.equal(state.inventory[0].ownerId, null);
  assert.deepEqual(state.players[0].inventoryItemIds, []);
});

test('CLAIM_AUCTION_ITEM atomically charges winning bid and creates owned item', () => {
  const { Ivent, state: base } = setup(20);
  const playerId = base.players[0].id;
  const state = Ivent.execute(base, {
    type: 'CLAIM_AUCTION_ITEM', templateId: 'shield', playerId, amount: 7, now: 110,
  }).state;
  assert.equal(state.players[0].walletBalance, 13);
  assert.equal(state.players[0].totalSpent, 7);
  assert.equal(state.inventory.length, 1);
  assert.equal(state.inventory[0].templateId, 'shield');
  assert.equal(state.inventory[0].ownerId, playerId);
  assert.equal(state.eventLog.at(-1).type, 'AUCTION_ITEM_CLAIMED');
});

test('CLAIM_AUCTION_ITEM rejects a winning bid above current balance', () => {
  const { Ivent, state } = setup(3);
  const before = JSON.stringify(state);
  assert.throws(() => Ivent.execute(state, {
    type: 'CLAIM_AUCTION_ITEM', templateId: 'shield', playerId: state.players[0].id, amount: 7, now: 110,
  }), /жетон/i);
  assert.equal(JSON.stringify(state), before);
});

test('steal token item applies its effect to a selected target on activation', () => {
  const { Ivent, state: base } = setup(20);
  let state = register(Ivent, base, 'steal_tokens');
  const ownerId = state.players[0].id;
  const targetId = state.players[1].id;
  const itemId = state.inventory[0].id;
  state = Ivent.execute(state, { type: 'BUY_ITEM', itemId, playerId: ownerId, now: 120 }).state;
  state = Ivent.execute(state, { type: 'ACTIVATE_ITEM', itemId, playerId: ownerId, targetPlayerId: targetId, now: 121 }).state;
  assert.equal(state.players[0].walletBalance, 13);
  assert.equal(state.players[1].walletBalance, 18);
  assert.equal(state.players[1].timesTargeted, 1);
  assert.equal(state.inventory[0].active, false, 'instant effect should resolve immediately');
});

test('double reward item doubles the next winning stage reward and then deactivates', () => {
  const { Ivent, state: base } = setup(20);
  let state = register(Ivent, base, 'double_reward');
  const ownerId = state.players[0].id;
  const itemId = state.inventory[0].id;
  state = Ivent.execute(state, { type: 'BUY_ITEM', itemId, playerId: ownerId, now: 130 }).state;
  state = Ivent.execute(state, { type: 'ACTIVATE_ITEM', itemId, playerId: ownerId, now: 131 }).state;
  state = Ivent.execute(state, { type: 'ADD_STAGE', moduleId: 'uno', now: 132 }).state;
  const stageId = state.stages[0].id;
  state = Ivent.execute(state, { type: 'START_STAGE', stageId, now: 200000 }).state;
  state = Ivent.execute(state, { type: 'FINISH_STAGE', stageId, result: { winnerIds: [ownerId], loserIds: [] }, now: 220000 }).state;
  assert.equal(state.players[0].walletBalance, 20, '20 start - 8 item + 8 doubled reward');
  assert.equal(state.players[0].totalEarned, 8);
  assert.equal(state.inventory[0].active, false);
  assert.deepEqual(state.players[0].activeItemIds, []);
});
