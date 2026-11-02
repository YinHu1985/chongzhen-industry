import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, performAction, getCombatRating, getGoals, getCampaignOutcome, getFinanceInfo, PROJECTS } from '../src/game.js';
import { FRONTS, createWarfare } from '../src/warfare.js';
import { act, playCampaign } from './helpers/campaign.mjs';

const ids = ['wokou', 'li', 'qing'];
function fixture({ turn = 18, maxTurns = 24, enemyStrength = 3, trained = true } = {}) {
  const state = createGame({ maxTurns, enemyStrength });
  state.turn = turn;
  state.warfare = createWarfare(maxTurns, turn);
  if (trained) {
    for (const project of PROJECTS) if (!project.automatic) Object.assign(state.projects[project.id], { completed: true, progress: 100, attempts: 1 });
    for (const branch of Object.keys(state.army)) state.army[branch] = 100;
  }
  return state;
}
function deploy(state, id, target, battleCap = state.warfare.fronts[id].battleCap) {
  return act(state, { type: 'configureFront', id, target, battleCap });
}
function front(state, id) { return getCombatRating(state).fronts.find(item => item.id === id); }

for (const maxTurns of [24, 40, 64]) test(`${maxTurns} seasons reveal each enemy only at its quarter boundary`, () => {
  const fresh = createGame({ maxTurns });
  assert.deepEqual(getCombatRating(fresh).fronts, []);
  assert.deepEqual(getGoals(fresh), []);
  for (let stage = 1; stage <= 3; stage++) {
    const revealTurn = Math.ceil(maxTurns * stage / 4);
    const state = fixture({ maxTurns, turn: revealTurn - 1 });
    assert.deepEqual(getCombatRating(state).fronts.map(item => item.id), ids.slice(0, stage - 1));
    const next = act(state, { type: 'endTurn' });
    assert.equal(next.turn, revealTurn);
    assert.deepEqual(getCombatRating(next).fronts.map(item => item.id), ids.slice(0, stage));
    assert.equal(next.warfare.fronts[ids[stage - 1]].lastBattle, null, 'a newly visible enemy waits until the player can deploy');
  }
});

test('deploying and withdrawing troops conserves the army and remembers its standing orders', () => {
  let state = fixture();
  const total = getCombatRating(state).totalTroops;
  state = deploy(state, 'wokou', 3000);
  state = deploy(state, 'li', 4000);
  assert.equal(state.warfare.fronts.wokou.assigned, 3000);
  assert.equal(state.warfare.fronts.li.assigned, 4000);
  assert.equal(getCombatRating(state).totalTroops, total);
  state = deploy(state, 'wokou', 1000);
  assert.equal(state.warfare.fronts.wokou.assigned, 1000);
  assert.equal(state.warfare.reserve, total - 5000);
  state = deploy(state, 'qing', 10000);
  assert.equal(state.warfare.fronts.qing.assigned, total - 5000);
  assert.equal(state.warfare.fronts.qing.target, 10000, 'an unfunded target waits for actual recruits');
  assert.equal(state.warfare.reserve, 0);
  assert.equal(getCombatRating(state).totalTroops, total);
});

test('invalid deployment orders neither mutate the state nor consume randomness', () => {
  for (const action of [
    { id: 'unknown', target: 1000, battleCap: 1000 },
    { id: 'li', target: -1, battleCap: 1000 },
    { id: 'li', target: 1.5, battleCap: 1000 },
    { id: 'li', target: 1_000_001, battleCap: 1000 },
    { id: 'li', target: 1000, battleCap: 0 },
    { id: 'li', target: 1000, battleCap: 0.5 },
    { id: 'li', target: 1000, battleCap: Number.NaN },
    { id: 'li', target: 1000, battleCap: 1_000_000_001 },
  ]) {
    const state = fixture(), before = JSON.stringify(state);
    const result = performAction(state, { type: 'configureFront', ...action });
    assert.ok(result.error, JSON.stringify(action));
    assert.equal(result.state, state);
    assert.equal(JSON.stringify(state), before);
  }
  const dormant = createGame();
  assert.ok(performAction(dormant, { type: 'configureFront', id: 'wokou', target: 1000, battleCap: 1000 }).error);
});

test('only the enemy commitment cap enters combat even when its total force is much larger', () => {
  let state = fixture();
  state.warfare.reserve = 100_000;
  state.warfare.fronts.li.troops = 100_000;
  state = deploy(state, 'li', 80_000, 20_000);
  const forecast = front(state, 'li').forecast;
  assert.equal(forecast.enemyCommitted, 20_000);
  assert.ok(forecast.enemyLosses <= 20_000);
  const next = act(state, { type: 'endTurn' }), report = next.warfare.fronts.li.lastBattle;
  assert.equal(report.enemyCommitted, 20_000);
  assert.equal(report.enemyLosses, forecast.enemyLosses);
  assert.equal(next.warfare.fronts.li.troops, 100_000 - report.enemyLosses + report.enemyReinforcements);
});

test('three fronts share one reinforcement pool and repeat combat without fresh orders', () => {
  let state = fixture();
  state.warfare.reserve = 15_000;
  for (const id of ids) state = deploy(state, id, 5000);
  const before = getCombatRating(state), original = JSON.stringify(state);
  let next = act(state, { type: 'endTurn' });
  const reports = ids.map(id => next.warfare.fronts[id].lastBattle);
  const losses = reports.reduce((sum, report) => sum + report.playerLosses, 0);
  const budgets = reports.reduce((sum, report) => sum + report.replacementCapacity, 0);
  assert.equal(JSON.stringify(state), original);
  assert.ok(budgets <= before.reinforcements);
  assert.equal(getCombatRating(next).totalTroops, before.totalTroops - losses + before.reinforcements);
  assert.equal(next.rng, state.rng, 'combat is deterministic and independent of research rolls');
  assert.ok(reports.every(report => report.turn === state.turn));
  next = act(next, { type: 'endTurn' });
  for (const id of ids) {
    assert.equal(next.warfare.fronts[id].target, 5000);
    assert.equal(next.warfare.fronts[id].lastBattle.turn, state.turn + 1);
  }
});

test('unopposed enemy reinforcements cause compounding force growth', () => {
  let state = fixture({ turn: 6 });
  const original = state.warfare.fronts.wokou.troops;
  state = act(state, { type: 'endTurn' });
  const first = state.warfare.fronts.wokou.lastBattle;
  assert.equal(first.enemyLosses, 0);
  assert.equal(first.playerLosses, 0);
  assert.equal(state.warfare.fronts.wokou.troops, original + first.enemyReinforcements);
  state = act(state, { type: 'endTurn' });
  assert.ok(state.warfare.fronts.wokou.lastBattle.enemyReinforcements > first.enemyReinforcements);
});

test('enemy strength settings change combat power and losses, not starting numbers or industrial output', () => {
  const states = [1, 10].map(enemyStrength => {
    let state = fixture({ enemyStrength });
    state.warfare.reserve = 10_000;
    return deploy(state, 'wokou', 10_000);
  });
  const [easy, hard] = states.map(state => front(state, 'wokou'));
  assert.equal(easy.troops, hard.troops);
  assert.ok(hard.enemyPower > easy.enemyPower);
  assert.ok(hard.forecast.playerLosses > easy.forecast.playerLosses);
  assert.ok(hard.forecast.enemyLosses <= easy.forecast.enemyLosses);
  assert.equal(getCombatRating(states[0]).reinforcements, getCombatRating(states[1]).reinforcements);
  assert.equal(createGame().enemyStrength, 3);
});

test('missing cavalry and artillery gives the Qing additional combat advantages', () => {
  let full = fixture();
  full = deploy(full, 'qing', 8000);
  const without = structuredClone(full);
  without.army.cavalry = 0; without.army.artillery = 0;
  const supported = front(full, 'qing'), unsupported = front(without, 'qing');
  assert.ok(unsupported.enemyPower > supported.enemyPower);
  assert.ok(unsupported.forecast.playerLosses > supported.forecast.playerLosses);
});

test('inadequate fighting power and depleted reserves cause actual troop decline despite automatic recruitment', () => {
  let state = fixture({ turn: 6, enemyStrength: 10, trained: false });
  state.warfare.reserve = 5000;
  state = deploy(state, 'wokou', 5000);
  const before = state.warfare.fronts.wokou.assigned;
  state = act(state, { type: 'endTurn' });
  const record = state.warfare.fronts.wokou.lastBattle;
  assert.ok(record.playerLosses > record.replacementCapacity);
  assert.ok(state.warfare.fronts.wokou.assigned < before);
  assert.equal(state.warfare.fronts.wokou.target, 5000);
});

test('overwhelming victories cannot erase enemy remnants and final victory waits until seasonal settlement', () => {
  let state = fixture({ turn: 24, enemyStrength: 1 });
  state.warfare.reserve = 300_000;
  for (const definition of FRONTS) {
    state.warfare.fronts[definition.id].troops = definition.minTroops + 1000;
    state = deploy(state, definition.id, 100_000, definition.maxTroops);
  }
  assert.equal(state.status, 'playing');
  state = act(state, { type: 'endTurn' });
  assert.equal(state.status, 'won');
  assert.equal(state.projects.joint_trials.completed, true);
  for (const definition of FRONTS) {
    const record = state.warfare.fronts[definition.id];
    assert.equal(record.lastBattle.enemyLosses, 1000, 'even overwhelming force cannot kill the protected remnants');
    assert.ok(record.troops >= definition.minTroops);
    assert.ok(record.troops <= definition.victoryThreshold);
  }
  assert.equal(getCampaignOutcome(state).status, 'won');
  assert.ok(performAction(state, { type: 'endTurn' }).error);
});

test('crossing any enemy collapse threshold immediately ends the campaign with ordered endings', () => {
  for (const failing of [['wokou'], ['qing', 'wokou'], ['li', 'qing', 'wokou']]) {
    let state = fixture();
    for (const definition of FRONTS) if (failing.includes(definition.id)) state.warfare.fronts[definition.id].troops = definition.defeatThreshold;
    const turn = state.turn, money = state.money, netIncome = getFinanceInfo(state).netIncome;
    state = act(state, { type: 'endTurn' });
    assert.equal(state.status, 'lost');
    assert.equal(state.defeatReason, failing[0]);
    assert.equal(state.turn, turn);
    assert.equal(state.money, money + netIncome, 'the terminal season still settles its own income and expense');
    assert.equal(state.lastSettlement.moneyAfter, state.money);
    assert.equal(state.lastSettlement.netIncome, netIncome);
    assert.equal(getCampaignOutcome(state).reason, failing[0]);
  }
});

function sustainedFrontFixture() {
  let state = fixture({ turn: 24 });
  state.warfare.reserve = 300_000;
  for (const definition of FRONTS) {
    state.warfare.fronts[definition.id].troops = { wokou: 15_000, li: 100_000, qing: 80_000 }[definition.id];
    state = deploy(state, definition.id, 100_000);
  }
  return state;
}

test('final sustainable attrition is a stalemate when enemy numbers are still above pacification targets', () => {
  let state = sustainedFrontFixture();
  state = act(state, { type: 'endTurn' });
  assert.equal(state.status, 'stalemate');
  assert.equal(state.projects.joint_trials.completed, false);
  assert.ok(getGoals(state).some(goal => !goal.done));
  for (const record of Object.values(state.warfare.fronts)) {
    assert.ok(record.lastBattle.playerLosses <= record.lastBattle.replacementCapacity);
    assert.ok(record.lastBattle.enemyLosses > record.lastBattle.enemyReinforcements);
  }
  assert.equal(getCampaignOutcome(state).status, 'stalemate');
  assert.ok(performAction(state, { type: 'endTurn' }).error);
});

test('a pacified front at its reinforcement floor does not prevent stalemate on the remaining fronts', () => {
  let state = sustainedFrontFixture();
  state.warfare.fronts.li.troops = 4995;
  state = act(state, { type: 'endTurn' });
  const report = state.warfare.fronts.li.lastBattle;
  assert.equal(report.enemyLosses, report.enemyReinforcements, 'residual bandits cannot decline below their replenished floor');
  assert.equal(state.status, 'stalemate');
});

test('already pacified fronts cannot steal the ending from the actually collapsed front', () => {
  for (const failing of ['qing', 'wokou']) {
    let state = sustainedFrontFixture();
    for (const definition of FRONTS) if (definition.id !== failing) state.warfare.fronts[definition.id].troops = definition.minTroops;
    state = deploy(state, failing, 0);
    state = act(state, { type: 'endTurn' });
    assert.equal(state.status, 'lost');
    assert.equal(state.defeatReason, failing);
  }
});

test('matching enemy reinforcements is insufficient to call an unresolved line a sustainable stalemate', () => {
  let state = sustainedFrontFixture();
  state = deploy(state, 'li', 100_000, 7793);
  const prediction = front(state, 'li').forecast;
  assert.equal(prediction.enemyLosses, prediction.enemyReinforcements);
  assert.equal(prediction.sustainable, true);
  state = act(state, { type: 'endTurn' });
  assert.equal(state.status, 'lost');
  assert.equal(state.defeatReason, 'li');
});

test('reserve-funded replacement cannot disguise losses above recurring industrial replacement capacity', () => {
  let state = fixture({ turn: 24, trained: false, enemyStrength: 10 });
  state.warfare.reserve = 1_000_000;
  for (const id of ids) state = deploy(state, id, 100_000);
  state = act(state, { type: 'endTurn' });
  assert.equal(state.status, 'lost');
  for (const record of Object.values(state.warfare.fronts)) {
    assert.ok(record.lastBattle.reinforcements >= record.lastBattle.playerLosses);
    assert.ok(record.lastBattle.playerLosses > record.lastBattle.replacementCapacity);
    assert.equal(record.lastBattle.sustainable, false);
  }
});

test('sufficient shared industrial output sustains every line regardless of uneven garrison targets', () => {
  let state = fixture({ turn: 24 });
  state.warfare.reserve = 136_000;
  for (const id of ids) {
    state.warfare.fronts[id].troops = { wokou: 10_000, li: 24_000, qing: 36_000 }[id];
    state = deploy(state, id, { wokou: 6000, li: 100_000, qing: 30_000 }[id]);
  }
  assert.equal(state.warfare.reserve, 0);
  const before = getCombatRating(state);
  const losses = before.fronts.reduce((sum, item) => sum + item.forecast.playerLosses, 0);
  assert.ok(before.reinforcements > losses);
  assert.ok(before.fronts.every(item => item.forecast.sustainable));
  const next = act(state, { type: 'endTurn' });
  assert.equal(next.status, 'stalemate');
  for (const item of before.fronts) {
    const record = next.warfare.fronts[item.id];
    assert.equal(record.assigned, item.assigned);
    assert.equal(record.lastBattle.reinforcements, record.lastBattle.playerLosses);
    assert.ok(record.lastBattle.replacementCapacity >= record.lastBattle.playerLosses);
  }
  assert.equal(next.warfare.reserve, before.reinforcements - losses);
});

test('expanding one garrison uses surplus after all current battle losses are replaced', () => {
  let state = fixture({ turn: 18 });
  state.warfare.reserve = 136_000;
  for (const id of ids) state = deploy(state, id, { wokou: 6000, li: 100_000, qing: 30_000 }[id]);
  state = deploy(state, 'li', 300_000);
  const before = getCombatRating(state);
  const losses = before.fronts.reduce((sum, item) => sum + item.forecast.playerLosses, 0);
  assert.ok(before.reinforcements > losses);
  assert.equal(state.warfare.reserve, 0);
  const next = act(state, { type: 'endTurn' });
  assert.equal(next.warfare.fronts.wokou.assigned, 6000);
  assert.equal(next.warfare.fronts.qing.assigned, 30_000);
  assert.equal(next.warfare.fronts.li.assigned, 100_000 + before.reinforcements - losses);
  assert.equal(next.warfare.reserve, 0);
  for (const record of Object.values(next.warfare.fronts)) {
    assert.ok(record.lastBattle.reinforcements >= record.lastBattle.playerLosses);
    assert.equal(record.lastBattle.sustainable, true);
  }
});

// Issue only public deployment orders. Match commitments to what the army can
// destroy, and request enough soldiers to outpace the enemy's current recruitment.
function plannedDeployment(state) {
  const fronts = getCombatRating(state).fronts;
  return [
    ...fronts.map(item => ({ type: 'configureFront', id: item.id, target: 0, battleCap: item.battleCap })),
    ...fronts.map(item => {
      const desiredKills = Math.min(item.troops - item.minTroops, Math.ceil(item.enemyReinforcements * 2));
      return { type: 'configureFront', id: item.id, target: Math.min(300_000, Math.ceil(desiredKills / (.34 * item.playerPower / item.enemyPower))), battleCap: Math.max(1, desiredKills) };
    }),
  ];
}

test('the default 24-season cold army campaign survives using financed public actions and recurring deployment', () => {
  const { state, history } = playCampaign('cold', { deployFronts: plannedDeployment });
  assert.equal(state.enemyStrength, 3);
  assert.ok(['won', 'stalemate'].includes(state.status), 'ongoing research advances at season end, so survival may remain a stalemate in the shortest campaign');
  assert.equal(state.turn, 24);
  assert.ok(history.some(({action}) => action.type === 'configureFront'));
  assert.ok(getCombatRating(state).fronts.every(item => item.done || (item.lastBattle.sustainable && item.lastBattle.enemyDeclining)));
});

for (const [doctrine, maxTurns] of [['cold', 40], ['minie', 40], ['cuirassier', 40], ['breech', 64]]) test(`a ${maxTurns}-season ${doctrine} campaign can win through public research, training and deployment`, () => {
  const { state } = playCampaign(doctrine, { maxTurns, deployFronts: plannedDeployment });
  assert.equal(state.status, 'won');
  assert.equal(state.turn, maxTurns);
  assert.ok(getGoals(state).every(goal => goal.done));
});
