import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, getFinanceInfo, getProjectInfo, performAction } from '../src/game.js';
import { financePage } from '../src/finance-ui.js';

function act(state, action) {
  const result = performAction(state, action);
  assert.equal(result.error, undefined, result.error);
  return result.state;
}

test('treasury exposes projected research expenses, actual entries and exactly one financial action', () => {
  let state = act(createGame(), { type: 'build', id: 'workshop' });
  state = act(state, { type: 'invest', id: 'survey', teamId: getProjectInfo(state,'survey').selectedTeamId });
  const info = getFinanceInfo(state), before = JSON.stringify(state), html = financePage(state,info);
  assert.ok(info.expenseItems.length > 0);
  assert.ok(html.includes(info.expenseItems[0].label));
  assert.match(html, /内库现银|本季预计支出|已发生收支/);
  const actions = [...html.matchAll(/data-action="([^"]+)"/g)].map(match=>match[1]);
  assert.deepEqual(actions,['levy']);
  assert.equal((html.match(/<button\b/g)||[]).length,1);
  assert.equal(JSON.stringify(state),before);
  assert.doesNotMatch(html,/NaN|undefined/);
});

test('shortfall and unavailable levy explain why the player cannot finance the season', () => {
  const state = createGame();state.reputation = 0;
  const info = { ...getFinanceInfo(state), shortfall: 2500, canEndTurn: false, projectedBalance: -2500 };
  const html = financePage(state,info);
  assert.match(html,/本季资金不足 2,500 两，无法结束本季/);
  assert.match(html,/data-action="levy" disabled/);
  assert.ok(html.includes(info.levy.reason));
});

test('treasury labels are escaped even in imported records', () => {
  const state = createGame(), info = getFinanceInfo(state);
  info.history = [{ id: 1, turn: 1, kind: 'expense', category: 'research', label: '<img src=x onerror=alert(1)>', amount: 100, balance: 34900, teamId: null, projectId: null }];
  const html = financePage(state,info);
  assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html,/<img src=x/);
});
