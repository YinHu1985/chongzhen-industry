import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, getProjectInfo, performAction } from '../src/game.js';
import { renderTurnSummary, renderTurnTransition, animateTurnSummary } from '../src/turn-summary.js';
import { settlementScene, SETTLEMENT_DISTRICTS } from '../src/settlement.js';

function act(state, action) {
  const result = performAction(state, action);
  assert.equal(result.error,undefined,result.error);
  return result.state;
}

test('season report displays every research result and animates from previous balances without changing state', () => {
  let state = act(createGame(), { type:'build',id:'workshop' });
  for(const id of ['survey','school'])state = act(state,{type:'invest',id,teamId:getProjectInfo(state,id).selectedTeamId});
  state = act(state,{type:'endTurn'});
  const report = state.lastSettlement, before = JSON.stringify(state), html = renderTurnSummary(report);
  assert.equal(report.research.length,2);
  for(const item of report.research){
    assert.ok(html.includes(item.name));
    assert.ok(html.includes(`data-progress-from="${item.before}" data-progress-to="${item.after}"`));
  }
  assert.ok(html.includes(`data-count-from="${report.moneyBefore}" data-count-to="${report.moneyAfter}"`));
  assert.match(html,/data-action="settlement-continue"/);
  assert.doesNotMatch(html,/data-action="end-turn"|NaN|undefined/);
  assert.equal(JSON.stringify(state),before);
  const still = renderTurnSummary(report,{animate:false});
  assert.ok(still.includes(`>${report.moneyAfter.toLocaleString('zh-CN')}</span>`));
});

test('report precedes the ending and the transition contains no repeated-turn action', () => {
  const state = act(createGame(),{type:'endTurn'});
  assert.match(renderTurnSummary({...state.lastSettlement,status:'lost'}),/阅毕，查看本局结局/);
  const html = renderTurnTransition({turn:24,date:'崇祯十七年·春季'});
  assert.match(html,/百工报绩，三军报功/);
  assert.doesNotMatch(html,/<button\b|data-action/);
});

test('all report counters and progress bars use the same animation clock, including decreases', () => {
  const counters = [{dataset:{countFrom:'1000',countTo:'800'},textContent:''},{dataset:{countFrom:'50',countTo:'90'},textContent:''}];
  const bars = [{dataset:{progressFrom:'20',progressTo:'70'},style:{width:''}},{dataset:{progressFrom:'40',progressTo:'100'},style:{width:''}}];
  const root = { querySelectorAll: selector => selector === '[data-count-to]' ? counters : bars };
  const frames = [];
  let cancelled = null;
  const stop = animateTurnSummary(root,{requestFrame:callback=>(frames.push(callback),frames.length),cancelFrame:id=>cancelled=id,duration:1000});
  frames.shift()(0);frames.shift()(500);
  assert.equal(counters[0].textContent,'825');assert.equal(counters[1].textContent,'85');
  assert.equal(bars[0].style.width,'63.75%');assert.equal(bars[1].style.width,'92.5%');
  frames.shift()(1000);
  assert.equal(counters[0].textContent,'800');assert.equal(counters[1].textContent,'90');
  assert.equal(bars[0].style.width,'70%');assert.equal(bars[1].style.width,'100%');
  stop();assert.ok(cancelled!==null);
  animateTurnSummary(root,{reducedMotion:true,requestFrame:()=>assert.fail('reduced motion must not schedule frames'),cancelFrame:()=>{}});
  assert.equal(counters[0].textContent,'800');assert.equal(bars[1].style.width,'100%');
});

test('only the newly built district fades and a fourth building is not hidden by the completed base image', () => {
  for(let count=1;count<=SETTLEMENT_DISTRICTS.length;count++){
    const built = SETTLEMENT_DISTRICTS.slice(0,count), latest = built.at(-1).id;
    const state = {facilities:Object.fromEntries(built.map(item=>[item.id,1]))};
    const html = settlementScene(state,[],{revealFacilityId:latest});
    const animated = [...html.matchAll(/<image\b[^>]*class="estate-district is-revealing"[^>]*data-facility="([^"]+)"/g)].map(match=>match[1]);
    assert.deepEqual(animated,[latest]);
    assert.match(html,/<image class="estate-base" href="[^"]*estate-panorama-unbuilt.png"/);
    assert.doesNotMatch(settlementScene(state),/is-revealing/);
    if(count===4){
      assert.match(html,/class="estate-completion-surround"/);
      assert.match(html,/mask="url\(#district-surround\)"/);
      assert.match(settlementScene(state),/<image class="estate-base" href="[^"]*estate-panorama-complete.png"/);
    }
  }
});
