import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, getCombatRating, performAction } from '../src/game.js';
import { combatPanel, enemyStrengthSelector } from '../src/campaign-ui.js';

function act(state, action) {
  const result = performAction(state, action);
  assert.equal(result.error, undefined);
  return result.state;
}
function advance(state, turn) {
  while (state.turn < turn) state = act(state, { type: 'endTurn' });
  return state;
}

test('new-game difficulty exposes every strength from one to ten with a visible multiplier', () => {
  const html = enemyStrengthSelector();
  assert.equal((html.match(/<option /g) || []).length, 10);
  assert.match(html, /value="3" selected>3 \/ 10 · ×0\.70/);
  assert.match(html, /value="1"[^>]*>1 \/ 10 · ×0\.40/);
  assert.match(html, /value="10"[^>]*>10 \/ 10 · ×1\.75/);
  assert.match(enemyStrengthSelector(8), /value="8" selected>/);
});

test('prewar screen shows supply preparation without revealing any enemy or orders', () => {
  const state = createGame({ enemyStrength: 8 });
  const html = combatPanel(state);
  assert.match(html, /边境暂宁/);
  assert.match(html, /8 \/ 10 · ×1\.45/);
  assert.match(html, /每季新增补充/);
  assert.match(html, /预备兵 8,000 人/);
  assert.doesNotMatch(html, /倭寇|流寇|李自成|清军|data-front-orders|NaN|undefined/);
});

test('revealed fronts expose actual troops and persistent editable orders, without future enemies', () => {
  let state = advance(createGame(), 6);
  let html = combatPanel(state);
  assert.match(html, /data-front="wokou"/);
  assert.doesNotMatch(html, /流寇|李自成|清军|data-front="li"|data-front="qing"/);
  assert.match(html, /尚未出兵/);
  assert.match(html, /name="target"[^>]*value="0"/);
  assert.match(html, /name="battleCap"[^>]*value="6000"/);
  state = act(state, { type: 'configureFront', id: 'wokou', target: 4000, battleCap: 2000 });
  html = combatPanel(state);
  assert.match(html, /驻军 <b>4,000<\/b>/);
  assert.match(html, /name="target"[^>]*value="4000"/);
  assert.match(html, /name="battleCap"[^>]*value="2000"/);
  assert.match(html, /敌参战 2,000 · 我参战 4,000/);
  assert.match(html, /持续补员额度/);
  assert.doesNotMatch(html, /NaN|undefined/);
});

test('last seasonal report is retained alongside the next forecast and ended orders are disabled', () => {
  let state = advance(createGame(), 6);
  state = act(state, { type: 'configureFront', id: 'wokou', target: 4000, battleCap: 2000 });
  state = act(state, { type: 'endTurn' });
  const front = getCombatRating(state).fronts[0];
  let html = combatPanel(state);
  assert.match(html, /第 6 季战报/);
  assert.match(html, /name="target"[^>]*value="4000"/);
  assert.match(html, /name="battleCap"[^>]*value="2000"/);
  assert.match(html, /实际补员/);
  assert.match(html, /本季推演/);
  assert.ok(html.includes(`敌余 ${front.lastBattle.enemyAfter.toLocaleString('zh-CN')}`));
  html = combatPanel({ ...state, status: 'stalemate' });
  const inputs = html.match(/<input\b[^>]*>/g);
  assert.equal(inputs.length, 2);
  assert.ok(inputs.every(input => /\bdisabled\b/.test(input)));
  assert.match(html, /type="submit"[^>]*disabled/);
});

test('suppressed enemies at their replenished floor show a holding status, while equal unsuppressed armies stay level', () => {
  let state = advance(createGame(), 6);
  for (const project of Object.values(state.projects)) Object.assign(project, { completed: true, progress: 100 });
  for (const branch of Object.keys(state.army)) state.army[branch] = 100;
  state = act(state, { type: 'configureFront', id: 'wokou', target: 4000, battleCap: 6000 });
  state.warfare.fronts.wokou.troops = 1082;
  let front = getCombatRating(state).fronts[0];
  assert.equal(front.forecast.enemyLosses, front.forecast.enemyReinforcements);
  let html = combatPanel(state);
  assert.match(html, /敌势已压在平定线内 · 维持当前防务/);
  assert.doesNotMatch(html, /敌军仍在增长/);
  state.warfare.fronts.wokou.troops = 3500;
  state.warfare.fronts.wokou.battleCap = 375;
  front = getCombatRating(state).fronts[0];
  assert.equal(front.forecast.enemyLosses, front.forecast.enemyReinforcements);
  html = combatPanel(state);
  assert.match(html, /歼敌与补充相抵 · 敌军兵力持平/);
  assert.doesNotMatch(html, /敌军仍在增长/);
});
