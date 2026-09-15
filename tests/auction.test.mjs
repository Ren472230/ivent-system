import test from 'node:test';
import assert from 'node:assert/strict';
import { loadIvent } from './helpers/load-app.mjs';

function auction() {
  const Ivent = loadIvent();
  const state = Ivent.createAuction(['shield', 'emerald_heart'], {
    startPrice: 2,
    bidStep: 2,
    lotSeconds: 30,
    revealEffectAfterPurchase: true,
  });
  return { Ivent, state };
}

test('auction game is registered and createAuction builds deterministic lots', () => {
  const { Ivent, state } = auction();
  assert.equal(Ivent.getGameRegistry().auction.name, 'Аукцион артефактов');
  assert.equal(state.currentLotIndex, 0);
  assert.deepEqual(state.lots.map((lot) => lot.itemTemplateId), ['shield', 'emerald_heart']);
  assert.equal(state.lots[0].currentBid, 0);
});

test('first bid must meet start price and later bid must increase by bid step', () => {
  const { Ivent, state } = auction();
  const balances = { p1: 10, p2: 10 };
  assert.throws(() => Ivent.placeAuctionBid(state, 'p1', 1, balances), /ставк/i);
  const first = Ivent.placeAuctionBid(state, 'p1', 2, balances);
  assert.equal(first.lots[0].currentBid, 2);
  assert.throws(() => Ivent.placeAuctionBid(first, 'p2', 3, balances), /ставк/i);
  const second = Ivent.placeAuctionBid(first, 'p2', 4, balances);
  assert.equal(second.lots[0].highestBidderId, 'p2');
});

test('bid cannot exceed current player balance', () => {
  const { Ivent, state } = auction();
  assert.throws(() => Ivent.placeAuctionBid(state, 'p1', 4, { p1: 3 }), /жетон/i);
});

test('closing lot returns winner and advances to next lot', () => {
  const { Ivent, state } = auction();
  const withBid = Ivent.placeAuctionBid(state, 'p1', 4, { p1: 10 });
  const closed = Ivent.closeAuctionLot(withBid);
  assert.equal(closed.winnerId, 'p1');
  assert.equal(closed.amount, 4);
  assert.equal(closed.itemTemplateId, 'shield');
  assert.equal(closed.auction.lots[0].closed, true);
  assert.equal(closed.auction.currentLotIndex, 1);
});

test('lot with no bids closes without a winner', () => {
  const { Ivent, state } = auction();
  const closed = Ivent.closeAuctionLot(state);
  assert.equal(closed.winnerId, null);
  assert.equal(closed.amount, 0);
  assert.equal(closed.auction.currentLotIndex, 1);
});

test('SET_AUCTION_STATE stores the active auction inside event state for saves', () => {
  const Ivent = loadIvent();
  let event = Ivent.createEvent('Auction save', { seed: 5, now: 10 });
  const activeAuction = Ivent.createAuction(['shield'], { startPrice: 2, bidStep: 1, lotSeconds: 30, revealEffectAfterPurchase: true });
  event = Ivent.execute(event, { type: 'SET_AUCTION_STATE', auction: activeAuction, label: 'Аукцион начат', now: 11 }).state;
  assert.deepEqual(event.gameRuntime.auction, activeAuction);
  assert.equal(event.eventLog.at(-1).type, 'AUCTION_STATE_UPDATED');
});
