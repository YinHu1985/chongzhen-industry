import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, performAction, getCombatRating, getGoals, getCampaignOutcome, getFinanceInfo, PROJECTS, DOCTRINES } from '../src/game.js';
import { FRONTS, createWarfare, frontStartTurn, strengthMultiplier, isEnemyStrength, normalizeEnemyStrength } from '../src/warfare.js';
import { act, playCampaign } from './helpers/campaign.mjs';

const ids = ['wokou', 'bailian', 'li', 'qing'];
// Preserve the original 0.70× balance for combat fixtures unrelated to difficulty input.
function fixture({ turn = 18, maxTurns = 24, enemyStrength = .70, trained = true } = {}) {
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

for (const maxTurns of [24, 40, 64]) test(`${maxTurns} seasons start with coastal raiders and reveal each later enemy at its quarter boundary`, () => {
  const fresh = createGame({ maxTurns });
  assert.deepEqual(getCombatRating(fresh).fronts.map(item => item.id), ['wokou']);
  assert.deepEqual(getGoals(fresh).map(item => item.id), ['wokou']);
  assert.equal(fresh.warfare.fronts.wokou.lastBattle, null);
  assert.deepEqual(FRONTS.map(item => item.id), ids);
  assert.equal(frontStartTurn(maxTurns, FRONTS[0]), 1);
  for (let stage = 1; stage <= 3; stage++) {
    const revealTurn = Math.ceil(maxTurns * stage / 4);
    const state = fixture({ maxTurns, turn: revealTurn - 1 });
    assert.deepEqual(getCombatRating(state).fronts.map(item => item.id), ids.slice(0, stage));
    assert.ok(performAction(state, { type: 'configureFront', id: ids[stage], target: 1000, battleCap: 1000 }).error);
    const next = act(state, { type: 'endTurn' });
    assert.equal(next.turn, revealTurn);
    assert.deepEqual(getCombatRating(next).fronts.map(item => item.id), ids.slice(0, stage + 1));
    assert.deepEqual(next.lastSettlement.newFronts, [ids[stage]]);
    assert.equal(next.warfare.fronts[ids[stage]].lastBattle, null, 'a newly visible enemy waits until the player can deploy');
    const deployed = deploy(next, ids[stage], 1000);
    assert.equal(deployed.warfare.fronts[ids[stage]].assigned, 1000);
  }
});

test('the default opening allows a real coastal deployment with casualties and industrial replacement in the first season', () => {
  let state = createGame();
  assert.equal(state.enemyStrength, 1);
  assert.equal(state.warfare.fronts.wokou.troops, 400);
  assert.equal(state.warfare.fronts.bailian.troops, 0);
  state = deploy(state, 'wokou', 3000);
  const before = getCombatRating(state), forecast = front(state, 'wokou').forecast;
  assert.ok(forecast.playerLosses > 0);
  assert.ok(forecast.enemyLosses > forecast.enemyReinforcements);
  assert.ok(forecast.playerLosses <= before.reinforcements, 'the introductory fight is sustainable at baseline difficulty with untrained opening equipment');
  const next = act(state, { type: 'endTurn' }), report = next.warfare.fronts.wokou.lastBattle;
  assert.equal(next.turn, 2);
  assert.equal(next.status, 'playing');
  assert.equal(report.turn, 1);
  assert.equal(report.playerLosses, forecast.playerLosses);
  assert.equal(report.reinforcements, report.playerLosses);
  assert.equal(next.warfare.fronts.wokou.assigned, 3000);
  assert.equal(getCombatRating(next).totalTroops, before.totalTroops - report.playerLosses + before.reinforcements);
  assert.deepEqual(next.lastSettlement.battles.map(battle => battle.id), ['wokou']);
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
  for (const id of ['bailian', 'li', 'qing']) assert.ok(performAction(dormant, { type: 'configureFront', id, target: 1000, battleCap: 1000 }).error);
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

test('four fronts share one reinforcement pool and repeat combat without fresh orders', () => {
  let state = fixture();
  state.warfare.reserve = 20_000;
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
  assert.equal(createGame().enemyStrength, 1);
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

test('the White Lotus front is a real step above coastal raiders while Li remains harder at both initial and full commitments', () => {
  for (const doctrine of DOCTRINES) for (const scenario of ['initial', 'full-cap']) {
    for (const [artillery, cavalry] of [[100, 100], [0, 100], [100, 0], [0, 0]]) {
      let state = fixture({ enemyStrength: 1 });
      state.doctrine = doctrine.id;
      state.army.artillery = artillery; state.army.cavalry = cavalry;
      state.warfare.reserve = 400_000;
      for (const definition of FRONTS) {
        if (scenario === 'full-cap') state.warfare.fronts[definition.id].troops = Math.max(definition.initialTroops, definition.battleCap * 2);
        state = deploy(state, definition.id, 100_000);
      }
      const coastal = front(state, 'wokou'), whiteLotus = front(state, 'bailian'), rebels = front(state, 'li');
      const context = `${doctrine.id}/${scenario}/artillery:${artillery}/cavalry:${cavalry}`;
      assert.ok(whiteLotus.forecast.playerLosses > coastal.forecast.playerLosses, `${context}: White Lotus should inflict more casualties than the opening raiders`);
      assert.ok(whiteLotus.forecast.enemyReinforcements > coastal.forecast.enemyReinforcements, `${context}: White Lotus recruits faster than the opening raiders`);
      assert.ok(rebels.forecast.playerLosses > whiteLotus.forecast.playerLosses, `${context}: Li losses ${rebels.forecast.playerLosses} must exceed White Lotus losses ${whiteLotus.forecast.playerLosses}`);
      assert.ok(rebels.forecast.enemyReinforcements > whiteLotus.forecast.enemyReinforcements, `${context}: Li reinforcement pressure must exceed White Lotus`);
      assert.equal(rebels.assigned, whiteLotus.assigned, 'the comparison uses the same player force');
      assert.equal(rebels.battleCap, FRONTS.find(definition => definition.id === 'li').battleCap);
      assert.equal(whiteLotus.battleCap, FRONTS.find(definition => definition.id === 'bailian').battleCap);
    }
  }
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
  state.warfare.reserve = 400_000;
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
  for (const failing of [['wokou'], ['bailian', 'wokou'], ['qing', 'bailian', 'wokou'], ['li', 'qing', 'bailian', 'wokou']]) {
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
  state.warfare.reserve = 400_000;
  for (const definition of FRONTS) {
    state.warfare.fronts[definition.id].troops = { wokou: 1500, bailian: 30_000, li: 100_000, qing: 80_000 }[definition.id];
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
  for (const failing of ['qing', 'bailian', 'wokou']) {
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
  state.warfare.reserve = 156_000;
  for (const id of ids) {
    state.warfare.fronts[id].troops = { wokou: 1000, bailian: 15_000, li: 24_000, qing: 36_000 }[id];
    state = deploy(state, id, { wokou: 6000, bailian: 20_000, li: 100_000, qing: 30_000 }[id]);
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
  state.warfare.reserve = 156_000;
  for (const id of ids) state = deploy(state, id, { wokou: 6000, bailian: 20_000, li: 100_000, qing: 30_000 }[id]);
  state = deploy(state, 'li', 300_000);
  const before = getCombatRating(state);
  const losses = before.fronts.reduce((sum, item) => sum + item.forecast.playerLosses, 0);
  assert.ok(before.reinforcements > losses);
  assert.equal(state.warfare.reserve, 0);
  const next = act(state, { type: 'endTurn' });
  assert.equal(next.warfare.fronts.wokou.assigned, 6000);
  assert.equal(next.warfare.fronts.bailian.assigned, 20_000);
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

test('the 0.50× 24-season cold army campaign survives after financing a recruit from the two-team opening', () => {
  const { state, history } = playCampaign('cold', { enemyStrength: .50, deployFronts: plannedDeployment });
  assert.equal(state.enemyStrength, .50);
  assert.ok(['won', 'stalemate'].includes(state.status), 'ongoing research advances at season end, so survival may remain a stalemate in the shortest campaign');
  assert.equal(state.turn, 24);
  assert.ok(history.some(({action}) => action.type === 'configureFront'));
  assert.ok(history.some(({action}) => action.type === 'hireTeam'));
  assert.ok(state.events.history.length > 0, 'the public campaign keeps random events enabled');
  assert.equal(history.filter(({action}) => action.type === 'acknowledgeEvent').length, state.events.history.length);
  assert.ok(getCombatRating(state).fronts.every(item => item.done || (item.lastBattle.sustainable && item.lastBattle.enemyDeclining)));
});

for (const [doctrine, maxTurns] of [['cold', 40], ['minie', 64], ['cuirassier', 64], ['breech', 64]]) test(`a default-strength ${maxTurns}-season ${doctrine} campaign can win through public hiring, research, training and deployment`, () => {
  const { state, history } = playCampaign(doctrine, { maxTurns, deployFronts: plannedDeployment });
  assert.equal(state.enemyStrength, 1);
  assert.ok(history.some(({action}) => action.type === 'hireTeam'), 'additional staff must be hired through the public action');
  assert.ok(state.events.history.length > 0, 'the public campaign retains its natural event rolls');
  assert.equal(history.filter(({action}) => action.type === 'acknowledgeEvent').length, state.events.history.length, 'every event is acknowledged through the public action');
  assert.equal(state.status, 'won');
  assert.equal(state.turn, maxTurns);
  const capstone = {cold:'mass_production', minie:'minie_rifle', cuirassier:'cuirassier', breech:'metal_cartridges'}[doctrine];
  assert.equal(state.projects[capstone].completed, true, `${doctrine} reaches its actual advanced research group`);
  assert.ok(getGoals(state).every(goal => goal.done));
});

test('difficulty is the direct 0.10–10.00 multiplier with 1.00 as the default', () => {
  assert.equal(createGame().enemyStrength, 1);
  for (const coefficient of [.10, 1, 10]) {
    const state = fixture({ enemyStrength: coefficient });
    const rating = getCombatRating(state);
    assert.equal(state.enemyStrength, coefficient);
    assert.equal(rating.enemyMultiplier, coefficient);
    assert.equal(strengthMultiplier(coefficient), coefficient);
    for (const definition of FRONTS) {
      assert.equal(front(state, definition.id).enemyPower, definition.power * coefficient);
    }
  }
});

test('new-game coefficients normalize to two decimal places while save validation remains strict', () => {
  for (const [input, expected] of [[.1, .1], [.29, .29], [1, 1], [1.005, 1.01], [2.345, 2.35], [10, 10], [99, 10], [-1, .1], [NaN, 1], [Infinity, 1]]) {
    assert.equal(normalizeEnemyStrength(input), expected);
    assert.equal(createGame({ enemyStrength: input }).enemyStrength, expected);
    assert.equal(isEnemyStrength(expected), true);
  }
  for (const invalid of [0, .09, .101, 1.001, 1.0000000000000002, 10.01, NaN, Infinity, '1.00', null, true]) {
    assert.equal(isEnemyStrength(invalid), false, String(invalid));
  }
});
