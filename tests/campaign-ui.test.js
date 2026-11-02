import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, getCombatRating, performAction } from '../src/game.js';
import { combatPanel, enemyStrengthSelector } from '../src/campaign-ui.js';

function act(state, action) {
  if (state.pending?.kind === 'event' && action.type !== 'acknowledgeEvent') {
    state = act(state, { type: 'acknowledgeEvent' });
  }
  const result = performAction(state, action);
  assert.equal(result.error, undefined);
  return result.state;
}
function advance(state, turn) {
  while (state.turn < turn) state = act(state, { type: 'endTurn' });
  if (state.pending?.kind === 'event') state = act(state, { type: 'acknowledgeEvent' });
  return state;
}

test('new-game difficulty offers precise direct coefficients with matching range, number and output', () => {
  const html = enemyStrengthSelector();
  assert.doesNotMatch(html, /<select|<option| \/ 10/);
  const inputs = [...html.matchAll(/<input\b[^>]+>/g)].map(match => match[0]);
  assert.equal(inputs.length, 2);
  assert.match(inputs[0], /type="range"/);
  assert.match(inputs[0], /data-enemy-strength(?: |>|$)/);
  assert.match(inputs[1], /type="number"/);
  assert.match(inputs[1], /data-enemy-strength-number(?: |>|$)/);
  for (const input of inputs) {
    assert.match(input, /min="0\.10" max="10\.00" step="0\.01"/);
    assert.match(input, /value="1\.00"/);
  }
  assert.match(html, /data-enemy-strength-output[^>]*>×1\.00<\/output>/);
  assert.match(html, /1\.00 为基准，10\.00 为十倍/);
  assert.match(html, /开局后固定/);
  for (const value of [.1, .37, 1, 2.56, 10]) {
    const rendered = enemyStrengthSelector(value), label = value.toFixed(2);
    assert.equal((rendered.match(new RegExp(`value="${label.replace('.', '\\.') }"`, 'g')) || []).length, 2);
    assert.ok(rendered.includes(`>×${label}</output>`));
  }
});

test('the opening screen shows only coastal raiders and immediately available deployment orders', () => {
  const state = createGame({ enemyStrength: 2.56 });
  const html = combatPanel(state);
  assert.match(html, /倭寇/);
  assert.match(html, /data-front="wokou"/);
  assert.match(html, /data-front-orders="wokou"/);
  assert.match(html, /敌军战斗力 ×2\.56/);
  assert.doesNotMatch(html, / \/ 10 ·/);
  assert.match(html, /每季新增补充/);
  assert.match(html, /预备兵 8,000 人/);
  assert.doesNotMatch(html, /白莲|闯王军|流寇|李自成|清军|暂无可部署战线|NaN|undefined/);
  assert.equal((html.match(/data-front="/g) || []).length, 1);
});

test('revealed fronts expose actual troops and persistent editable orders, without future enemies', () => {
  let state = advance(createGame(), 6);
  let html = combatPanel(state);
  assert.match(html, /data-front="wokou"/);
  assert.match(html, /data-front="bailian"/);
  assert.match(html, /白莲教/);
  assert.doesNotMatch(html, /闯王军|流寇|李自成|清军|data-front="li"|data-front="qing"/);
  assert.match(html, /尚未出兵/);
  assert.match(html, /name="target"[^>]*value="0"/);
  assert.match(html, /name="battleCap"[^>]*value="5500"/);
  state = act(state, { type: 'configureFront', id: 'bailian', target: 4000, battleCap: 2000 });
  html = combatPanel(state);
  assert.match(html, /驻军 <b>4,000<\/b>/);
  assert.match(html, /name="target"[^>]*value="4000"/);
  assert.match(html, /name="battleCap"[^>]*value="2000"/);
  assert.match(html, /敌参战 2,000 · 我参战 4,000/);
  assert.match(html, /持续补员额度/);
  assert.doesNotMatch(html, /NaN|undefined/);
});

test('the displayed front names advance from raiders to White Lotus, the Chuang army and Qing in stage order', () => {
  let state = createGame();
  const expected = ['倭寇', '白莲教', '闯王军', '清军'];
  for (const [index, turn] of [1, 6, 12, 18].entries()) {
    state = advance(state, turn);
    const html = combatPanel(state);
    const headings = [...html.matchAll(/class="warfront-heading"[\s\S]*?<h4>([^<]+)<\/h4>/g)].map(match => match[1]);
    assert.deepEqual(headings, expected.slice(0, index + 1));
    assert.equal((html.match(/data-front-orders="/g) || []).length, index + 1);
  }
});

test('last seasonal report is retained alongside the next forecast and ended orders are disabled', () => {
  let state = createGame();
  state = act(state, { type: 'configureFront', id: 'wokou', target: 4000, battleCap: 2000 });
  state = act(state, { type: 'endTurn' });
  const front = getCombatRating(state).fronts[0];
  let html = combatPanel(state);
  assert.match(html, /第 1 季战报/);
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
  let state = createGame();
  for (const project of Object.values(state.projects)) Object.assign(project, { completed: true, progress: 100 });
  for (const branch of Object.keys(state.army)) state.army[branch] = 100;
  state = act(state, { type: 'configureFront', id: 'wokou', target: 4000, battleCap: 600 });
  state.warfare.fronts.wokou.troops = 107;
  let front = getCombatRating(state).fronts[0];
  assert.equal(front.forecast.enemyLosses, front.forecast.enemyReinforcements);
  let html = combatPanel(state);
  assert.match(html, /敌势已压在平定线内 · 维持当前防务/);
  assert.doesNotMatch(html, /敌军仍在增长/);
  state.warfare.fronts.wokou.troops = 400;
  state.warfare.fronts.wokou.battleCap = 34;
  front = getCombatRating(state).fronts[0];
  assert.equal(front.forecast.enemyLosses, front.forecast.enemyReinforcements);
  html = combatPanel(state);
  assert.match(html, /歼敌与补充相抵 · 敌军兵力持平/);
  assert.doesNotMatch(html, /敌军仍在增长/);
});
