import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, performAction, getProjectInfo, getFinanceInfo, PROJECTS } from '../src/game.js';
import { EVENTS, EVENT_TRIGGERS, triggerRandomEvent, pendingEvent } from '../src/events.js';

function act(state, action) {
  const result = performAction(state, action);
  assert.equal(result.error, undefined, result.error);
  return result.state;
}
function roll(seed) {
  let value = seed >>> 0;
  value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
  return value >>> 0;
}
function eventRng(eventId) {
  const index = EVENTS.findIndex(event => event.id === eventId);
  for (let seed = 1; seed < 10000; seed++) {
    const rng = Math.imul(seed, 0x9e3779b9) >>> 0, first = roll(rng), second = roll(first);
    if (first / 2 ** 32 < .2 && Math.floor(second / 2 ** 32 * 3) === index) return rng;
  }
  throw new Error('No event fixture seed');
}
function nextEvent(eventId, setup = () => {}) {
  const state = createGame();
  setup(state);
  state.events.rng = eventRng(eventId);
  return { before: state, after: act(state, { type: 'endTurn' }) };
}

test('all three events share a 20% roll and all can be selected on the opening turn', () => {
  assert.equal(EVENT_TRIGGERS.before_turn.chance, .2);
  const counts = Object.fromEntries(EVENTS.map(event => [event.id, 0]));
  let occurred = 0;
  for (let seed = 1; seed <= 3000; seed++) {
    const state = createGame({ seed });
    assert.equal(state.events.lastChecked.before_turn, 1);
    assert.equal(state.lastSettlement, null);
    assert.ok(state.events.history.length <= 1);
    const event = pendingEvent(state);
    if (!event) continue;
    occurred++;
    counts[event.eventId]++;
    assert.equal(event.turn, 1);
    assert.equal(event.timing, 'before_turn');
    assert.ok(state.log.some(entry => entry.title === event.title && entry.turn === 1));
  }
  assert.ok(occurred > 500 && occurred < 700, `approximately 20% across 3000 fixed seeds: ${occurred}`);
  assert.ok(Object.values(counts).every(count => count > 140 && count < 260), JSON.stringify(counts));
});

test('the village can prepare locked technology, raises prestige, and grants no silver', () => {
  const { before, after } = nextEvent('hidden_village');
  const event = pendingEvent(after), research = event.effects.find(effect => effect.type === 'research_progress');
  assert.equal(event.eventId, 'hidden_village');
  assert.equal(getProjectInfo(before, research.projectId).locked, true, 'the unbuilt opening has no unlocked research');
  assert.equal(after.projects[research.projectId].progress, 40);
  assert.equal(after.projects[research.projectId].completed, false);
  assert.equal(getProjectInfo(after, research.projectId).canTest, false);
  assert.equal(after.reputation, before.reputation + 1);
  assert.equal(after.money, before.money + getFinanceInfo(before).income);
  assert.deepEqual(event.effects.map(effect => effect.type), ['research_progress', 'reputation']);
  assert.equal(after.stats.investments, before.stats.investments);
  assert.equal(after.projects.joint_trials.progress, 0);
});

test('village progress clamps at 100 without accepting the project, and excludes already full or automatic projects', () => {
  const { after } = nextEvent('hidden_village', state => {
    for (const project of PROJECTS.filter(project => !project.automatic)) state.projects[project.id].progress = 100;
    state.projects.metal_cartridges.progress = 85;
  });
  const research = pendingEvent(after).effects[0];
  assert.deepEqual({ id: research.projectId, before: research.before, after: research.after, amount: research.amount },
    { id: 'metal_cartridges', before: 85, after: 100, amount: 15 });
  assert.equal(after.projects.metal_cartridges.completed, false);
  assert.equal(after.projects.metal_cartridges.attempts, 0);
  assert.equal(after.projects.joint_trials.progress, 0);
});

test('village progress adds to inherited preparation visible to the player', () => {
  const { before, after } = nextEvent('hidden_village', state => {
    for (const project of PROJECTS.filter(project => !project.automatic)) state.projects[project.id].progress = 100;
    Object.assign(state.projects.civil_works, { progress: 100, completed: true, attempts: 1 });
    state.projects.lathe.progress = 0;
  });
  const starting = getProjectInfo(before, 'lathe').progress;
  assert.ok(starting > 0);
  const research = pendingEvent(after).effects[0];
  assert.equal(research.before, starting);
  assert.equal(research.after, Math.min(100, starting + 40));
  assert.equal(getProjectInfo(after, 'lathe').progress, research.after);
});

test('a full research catalog removes the village from the pool but other events can still occur', () => {
  const { after } = nextEvent('hidden_village', state => {
    for (const project of PROJECTS.filter(project => !project.automatic)) state.projects[project.id].progress = 100;
  });
  assert.ok(['corrupt_official', 'auspicious_omen'].includes(pendingEvent(after).eventId));
  assert.ok(pendingEvent(after).effects.every(effect => effect.type !== 'research_progress'));
});

test('confiscated silver is recorded once in the finance ledger and the handover report', () => {
  const { before, after } = nextEvent('corrupt_official');
  const event = pendingEvent(after), report = after.lastSettlement;
  assert.deepEqual(event.effects, [{ type: 'money', amount: 2000, before: before.money + getFinanceInfo(before).income, after: after.money }]);
  assert.equal(after.money, before.money + getFinanceInfo(before).income + 2000);
  assert.equal(after.reputation, before.reputation);
  assert.deepEqual(after.projects, before.projects);
  const entry = after.treasury.entries.find(entry => entry.category === 'event');
  assert.equal(entry.amount, 2000);
  assert.equal(entry.label, event.title);
  assert.equal(entry.turn, report.turn);
  assert.equal(event.turn, report.turn + 1);
  assert.equal(report.income, getFinanceInfo(before).income + 2000);
  assert.equal(report.moneyAfter, report.moneyBefore + report.netIncome);
  assert.equal(report.incomeItems.filter(item => item.id === `event:${event.id}`).length, 1);
  assert.deepEqual(report.events, [event]);
});

test('auspicious omens only add prestige and affect the upcoming season allowance', () => {
  const { before, after } = nextEvent('auspicious_omen');
  const event = pendingEvent(after);
  assert.deepEqual(event.effects, [{ type: 'reputation', amount: 2, before: 10, after: 12 }]);
  assert.equal(after.money, before.money + getFinanceInfo(before).income);
  assert.deepEqual(after.projects, before.projects);
  assert.equal(after.lastSettlement.reputationAfter - after.lastSettlement.reputationBefore, 2);
  assert.equal(getFinanceInfo(after).income, getFinanceInfo(before).income + 400);
});

test('acknowledging events never repeats rewards and pending events block other orders', () => {
  const { after } = nextEvent('corrupt_official');
  assert.ok(performAction(after, { type: 'endTurn' }).error);
  assert.ok(performAction(after, { type: 'build', id: 'workshop' }).error);
  const snapshot = JSON.stringify(after);
  const next = act(after, { type: 'acknowledgeEvent' });
  assert.equal(JSON.stringify(after), snapshot);
  assert.equal(next.pending, null);
  assert.deepEqual({ ...next, pending: after.pending }, after);
  assert.ok(performAction(next, { type: 'acknowledgeEvent' }).error);
});

test('no event is rolled on an unaffordable transition or after the final seasonal battle', () => {
  let state = createGame();
  state.facilities.workshop = 1;
  state = act(state, { type: 'assignResearch', id: 'survey', teamId: state.teams[0].id });
  state.money = 0;
  const snapshot = JSON.stringify(state), failed = performAction(state, { type: 'endTurn' });
  assert.ok(failed.error);
  assert.equal(failed.state, state);
  assert.equal(JSON.stringify(state), snapshot);

  state = createGame({ maxTurns: 4 });
  for (let turn = 1; turn < 4; turn++) {
    if (state.pending) state = act(state, { type: 'acknowledgeEvent' });
    state = act(state, { type: 'endTurn' });
  }
  if (state.pending) state = act(state, { type: 'acknowledgeEvent' });
  state.events.rng = eventRng('corrupt_official');
  const events = structuredClone(state.events);
  state = act(state, { type: 'endTurn' });
  assert.notEqual(state.status, 'playing');
  assert.deepEqual(state.events, events);
  assert.deepEqual(state.lastSettlement.events, []);
});

test('a new timing and data-only event reuse the dispatcher and cannot roll twice for one turn', () => {
  const state = createGame(), rng = state.rng;
  const options = {
    triggers: { after_battle: { chance: 1 } },
    catalog: [{ id: 'test_dispatch', timing: 'after_battle', weight: 1, title: '捷报', description: '测试另一时机', effects: [{ type: 'reputation', amount: 3 }] }],
  };
  const result = triggerRandomEvent(state, 'after_battle', options);
  assert.equal(result.eventId, 'test_dispatch');
  assert.equal(state.reputation, 13);
  assert.equal(state.rng, rng, 'event rolls do not consume research or recruitment randomness');
  state.pending = null;
  const snapshot = JSON.stringify(state);
  assert.equal(triggerRandomEvent(state, 'after_battle', options), null);
  assert.equal(triggerRandomEvent(state, 'unknown_timing'), null);
  assert.equal(JSON.stringify(state), snapshot);
});
