import test from 'node:test';
import assert from 'node:assert/strict';
import { loadIvent } from './helpers/load-app.mjs';

test('game registry contains five classic games and a break module', () => {
  const Ivent = loadIvent();
  const registry = Ivent.getGameRegistry();
  for (const id of ['alias', 'uno', 'durak', 'old-maid', 'solnyshko', 'break']) {
    assert.ok(registry[id], `missing ${id}`);
  }
  assert.equal(registry['old-maid'].name, 'Пиковая дама');
  assert.equal(registry.solnyshko.name, 'Солнышко');
});

test('createStage copies module defaults', () => {
  const Ivent = loadIvent();
  const stage = Ivent.createStage('uno');
  assert.equal(stage.title, 'Уно');
  assert.equal(stage.type, 'GAME');
  assert.equal(stage.status, 'PENDING');
  assert.ok(stage.plannedDurationSeconds > 0);
  assert.equal(stage.itemsAllowed, true);
});

test('stage lifecycle accumulates active elapsed time deterministically', () => {
  const Ivent = loadIvent();
  let state = Ivent.createEvent('Stages', { seed: 12, now: 10 });
  state = Ivent.execute(state, { type: 'ADD_PLAYER', name: 'Саша', now: 11 }).state;
  state = Ivent.execute(state, { type: 'ADD_STAGE', moduleId: 'uno', now: 12 }).state;
  const stageId = state.stages[0].id;
  state = Ivent.execute(state, { type: 'START_STAGE', stageId, now: 100000 }).state;
  state = Ivent.execute(state, { type: 'PAUSE_STAGE', stageId, now: 130000 }).state;
  assert.equal(state.stages[0].elapsedSeconds, 30);
  state = Ivent.execute(state, { type: 'RESUME_STAGE', stageId, now: 150000 }).state;
  state = Ivent.execute(state, { type: 'PAUSE_STAGE', stageId, now: 170000 }).state;
  assert.equal(state.stages[0].elapsedSeconds, 50);
});

test('FINISH_STAGE records result and awards default winner tokens', () => {
  const Ivent = loadIvent();
  let state = Ivent.createEvent('Stages', { startTokens: 0, seed: 12, now: 10 });
  state = Ivent.execute(state, { type: 'ADD_PLAYER', name: 'Саша', now: 11 }).state;
  state = Ivent.execute(state, { type: 'ADD_PLAYER', name: 'Катя', now: 12 }).state;
  state = Ivent.execute(state, { type: 'ADD_STAGE', moduleId: 'uno', now: 13 }).state;
  const [sasha, katya] = state.players;
  const stageId = state.stages[0].id;
  state = Ivent.execute(state, { type: 'START_STAGE', stageId, now: 100000 }).state;
  state = Ivent.execute(state, {
    type: 'FINISH_STAGE', stageId, result: { winnerIds: [sasha.id], loserIds: [katya.id], notes: 'GG' }, now: 160000,
  }).state;
  assert.equal(state.stages[0].status, 'FINISHED');
  assert.equal(state.stages[0].elapsedSeconds, 60);
  assert.equal(state.players[0].walletBalance, 4);
  assert.equal(state.players[0].wins, 1);
  assert.equal(state.players[1].losses, 1);
  assert.equal(state.statistics.completedStages, 1);
  assert.equal(state.status, 'RESULT');
});

test('invalid stage transitions are rejected', () => {
  const Ivent = loadIvent();
  let state = Ivent.createEvent('Stages', { seed: 12, now: 10 });
  state = Ivent.execute(state, { type: 'ADD_STAGE', moduleId: 'durak', now: 11 }).state;
  const stageId = state.stages[0].id;
  assert.throws(() => Ivent.execute(state, { type: 'PAUSE_STAGE', stageId, now: 12 }), /этап/i);
});


test('ADVANCE_STAGE selects the next planned stage after a result', () => {
  const Ivent = loadIvent();
  let state = Ivent.createEvent('Stages', { seed: 12, now: 10 });
  state = Ivent.execute(state, { type: 'ADD_STAGE', moduleId: 'uno', now: 11 }).state;
  state = Ivent.execute(state, { type: 'ADD_STAGE', moduleId: 'break', now: 12 }).state;
  const firstId = state.stages[0].id;
  state = Ivent.execute(state, { type: 'START_STAGE', stageId: firstId, now: 100000 }).state;
  state = Ivent.execute(state, { type: 'FINISH_STAGE', stageId: firstId, result: { winnerIds: [], loserIds: [] }, now: 110000 }).state;
  state = Ivent.execute(state, { type: 'ADVANCE_STAGE', now: 110001 }).state;
  assert.equal(state.currentStageIndex, 1);
  assert.equal(state.stages[1].status, 'PENDING');
});

test('SELECT_STAGE changes current stage through the command layer', () => {
  const Ivent = loadIvent();
  let state = Ivent.createEvent('Stages', { seed: 12, now: 10 });
  state = Ivent.execute(state, { type: 'ADD_STAGE', moduleId: 'uno', now: 11 }).state;
  state = Ivent.execute(state, { type: 'ADD_STAGE', moduleId: 'durak', now: 12 }).state;
  const secondId = state.stages[1].id;
  state = Ivent.execute(state, { type: 'SELECT_STAGE', stageId: secondId, now: 13 }).state;
  assert.equal(state.currentStageIndex, 1);
  assert.equal(state.eventLog.at(-1).type, 'STAGE_SELECTED');
});
