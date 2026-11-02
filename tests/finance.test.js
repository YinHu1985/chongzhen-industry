import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, performAction, getFinanceInfo, getProjectInfo, getTeamActivity, getSummary } from '../src/game.js';
import { act, finishSeason } from './helpers/campaign.mjs';

function workshop() {
  const state = createGame();
  state.facilities.workshop = 1;
  return state;
}
function rollSeed(min, max) {
  for (let index = 1; index < 10000; index++) {
    let seed = Math.imul(index, 0x9e3779b9) >>> 0, value = seed;
    value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
    const roll = (value >>> 0) / 4294967296 * 100;
    if (roll >= min && roll < max) return seed;
  }
  throw new Error('No matching RNG seed');
}

test('research assignments are reversible plans with no immediate financial or random effects', () => {
  let state = workshop();
  const original = JSON.stringify(state), money = state.money, rng = state.rng;
  state = act(state, { type: 'assignResearch', id: 'survey', teamId: state.teams[0].id });
  assert.notEqual(JSON.stringify(state), original);
  assert.equal(state.money, money); assert.equal(state.rng, rng);
  assert.equal(state.projects.survey.progress, 0);
  assert.equal(state.stats.investments, 0);
  assert.equal(state.treasury.entries.length, 0);
  const finance = getFinanceInfo(state);
  assert.equal(finance.expenses, getProjectInfo(state, 'survey').investCost);
  assert.equal(finance.netIncome, finance.income - finance.expenses);
  assert.equal(finance.projectedBalance, money + finance.netIncome);
  assert.equal(finance.expenseItems[0].projectId, 'survey');
  state = act(state, { type: 'cancelResearch', teamId: state.teams[0].id });
  assert.equal(getFinanceInfo(state).expenses, 0);
  assert.equal(state.money, money); assert.equal(state.rng, rng);
  assert.equal(state.treasury.entries.length, 0);
});

test('changing research ownership neither double-bills a project nor advances abandoned plans', () => {
  let state = workshop();
  state = act(state, { type: 'invest', id: 'survey', teamId: state.teams[0].id });
  state = act(state, { type: 'invest', id: 'survey', teamId: state.teams[1].id });
  assert.equal(getFinanceInfo(state).expenseItems.length, 1);
  assert.equal(getFinanceInfo(state).expenseItems[0].teamId, state.teams[1].id);
  state = act(state, { type: 'invest', id: 'standards', teamId: state.teams[1].id });
  assert.equal(getFinanceInfo(state).expenseItems[0].projectId, 'standards');
  state = finishSeason(state);
  assert.equal(state.projects.survey.progress, 0);
  assert.ok(state.projects.standards.progress > 0);
  assert.equal(state.treasury.entries.filter(entry => entry.category === 'research').length, 1);
  assert.equal(state.treasury.entries.find(entry => entry.category === 'research').projectId, 'standards');
});

test('seasonal research expenses and the full allowance match both the preview and the permanent ledger', () => {
  let state = workshop();
  state = act(state, { type: 'invest', id: 'survey', teamId: state.teams[0].id });
  state = act(state, { type: 'invest', id: 'standards', teamId: state.teams[1].id });
  const before = getFinanceInfo(state), original = JSON.stringify(state);
  assert.equal(before.expenses, before.expenseItems.reduce((sum, item) => sum + item.amount, 0));
  assert.equal(before.income, before.incomeItems.reduce((sum, item) => sum + item.amount, 0));
  const next = finishSeason(state);
  assert.equal(JSON.stringify(state), original);
  assert.equal(next.money, before.projectedBalance);
  assert.equal(next.stats.spent, before.expenses);
  assert.equal(next.stats.earned, before.income);
  assert.equal(next.lastSettlement.income, before.income);
  assert.equal(next.lastSettlement.expenses, before.expenses);
  assert.equal(next.lastSettlement.moneyBefore, state.money);
  assert.equal(next.lastSettlement.moneyAfter, next.money);
  assert.equal(next.lastSettlement.research.length, 2);
  let balance = state.money;
  for (const entry of next.treasury.entries) {
    balance += entry.kind === 'income' ? entry.amount : -entry.amount;
    assert.equal(entry.balance, balance);
    assert.equal(entry.turn, state.turn);
  }
  assert.deepEqual(getFinanceInfo(next).history, [...next.treasury.entries].reverse());
});

test('upcoming allowance cannot fund an unaffordable research queue and a blocked turn has no side effects', () => {
  let state = workshop();
  state.money = 0;
  assert.equal(getProjectInfo(state, 'survey', state.teams[0].id).canInvest, true);
  state = act(state, { type: 'invest', id: 'survey', teamId: state.teams[0].id });
  const finance = getFinanceInfo(state), before = JSON.stringify(state);
  assert.ok(finance.projectedBalance > 0, 'future income would cover the expense, but is not yet available');
  assert.ok(finance.shortfall > 0);
  assert.equal(finance.canEndTurn, false);
  const denied = performAction(state, { type: 'endTurn' });
  assert.ok(denied.error); assert.equal(denied.state, state);
  assert.equal(JSON.stringify(state), before);
  const cancelled = act(state, { type: 'cancelResearch', teamId: state.teams[0].id });
  assert.equal(getFinanceInfo(cancelled).canEndTurn, true);
  assert.equal(finishSeason(cancelled).money, finance.income);
});

test('paying exactly the recurring budget is allowed and no debt is created', () => {
  let state = workshop();
  state = act(state, { type: 'invest', id: 'standards', teamId: state.teams[0].id });
  const expense = getFinanceInfo(state).expenses;
  state.money = expense;
  assert.equal(getFinanceInfo(state).shortfall, 0);
  assert.equal(getFinanceInfo(state).canEndTurn, true);
  const next = finishSeason(state);
  assert.equal(next.money, getFinanceInfo(state).income);
  assert.ok(next.treasury.entries.every(entry => entry.balance >= 0));
});

test('a levy converts prestige into immediate cash while permanently lowering prestige-based allowance', () => {
  let state = workshop(); state.money = 0;
  state = act(state, { type: 'invest', id: 'survey', teamId: state.teams[0].id });
  const before = getFinanceInfo(state), rng = state.rng;
  assert.equal(before.levy.canUse, true);
  state = act(state, { type: 'levy' });
  const after = getFinanceInfo(state);
  assert.equal(state.money, before.levy.moneyGain);
  assert.equal(state.reputation, 10 - before.levy.prestigeCost);
  assert.equal(after.income, before.income - before.levy.prestigeCost * 200);
  assert.equal(after.canEndTurn, true);
  assert.equal(state.rng, rng);
  assert.equal(after.history[0].kind, 'income');
  assert.equal(after.history[0].amount, before.levy.moneyGain);
  state = act(state, { type: 'levy' });
  assert.equal(state.reputation, 0);
  assert.equal(getFinanceInfo(state).levy.canUse, false);
  const denied = performAction(state, { type: 'levy' });
  assert.ok(denied.error); assert.equal(denied.state, state);
  assert.equal(state.status, 'playing');
});

test('construction, trials, rescue and recruitment are recorded as actual payments rather than recurring forecasts', () => {
  let state = act(createGame(), { type: 'build', id: 'workshop' });
  assert.equal(getFinanceInfo(state).expenses, 0);
  assert.equal(getFinanceInfo(state).history[0].category, 'construction');
  state.projects.survey.progress = 60; state.rng = rollSeed(70, 85);
  state = act(state, { type: 'test', id: 'survey' });
  assert.equal(getFinanceInfo(state).history[0].category, 'trial');
  assert.equal(state.pending.kind, 'rescue');
  state.rng = rollSeed(0, 1); state = act(state, { type: 'rescue', accept: true });
  assert.equal(getFinanceInfo(state).history[0].category, 'rescue');
  state = act(state, { type: 'refreshCandidates' });
  assert.equal(getFinanceInfo(state).history[0].category, 'recruitment');
  assert.equal(state.stats.spent, state.treasury.entries.filter(entry => entry.kind === 'expense').reduce((sum, entry) => sum + entry.amount, 0));
});

test('partial preparation permits independent trials and a failed trial may be retried in the same season', () => {
  let state = workshop(); state.reputation = 100;
  state.projects.survey.progress = 30;
  for (const team of state.teams) team.usedTurn = state.turn;
  assert.equal(getProjectInfo(state, 'survey').canTest, true);
  state.rng = rollSeed(99, 100);
  state = act(state, { type: 'test', id: 'survey' });
  assert.equal(state.pending, null);
  assert.equal(state.projects.survey.progress, 15);
  assert.equal(getProjectInfo(state, 'survey').canTest, true);
  state.rng = rollSeed(0, 1);
  const before = state.money;
  state = act(state, { type: 'test', id: 'survey' });
  assert.equal(state.projects.survey.completed, true);
  assert.equal(state.projects.survey.attempts, 2);
  assert.equal(state.turn, 1);
  assert.equal(state.money, before - getProjectInfo(state, 'survey').testCost);
  assert.ok(state.teams.every(team => getTeamActivity(state, team.id).queued === false));
});

test('zero preparation and exhausted funds block trials without changing the state', () => {
  const state = workshop();
  assert.equal(getProjectInfo(state, 'survey').canTest, false);
  const unprepared = performAction(state, { type: 'test', id: 'survey' });
  assert.ok(unprepared.error); assert.equal(unprepared.state, state);
  state.projects.survey.progress = 1; state.money = 0;
  assert.equal(getProjectInfo(state, 'survey').canTest, false);
  const poor = performAction(state, { type: 'test', id: 'survey' });
  assert.ok(poor.error); assert.equal(poor.state, state);
});
