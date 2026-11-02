import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, getProjectInfo, performAction } from '../src/game.js';
import { renderTurnSummary, renderTurnTransition, renderRandomEvent, animateTurnSummary } from '../src/turn-summary.js';
import { settlementScene, SETTLEMENT_DISTRICTS } from '../src/settlement.js';
import { pendingEvent } from '../src/events.js';

function act(state, action) {
  if (state.pending?.kind === 'event' && action.type !== 'acknowledgeEvent') {
    const acknowledged = performAction(state, { type:'acknowledgeEvent' });
    assert.equal(acknowledged.error,undefined,acknowledged.error);
    state = acknowledged.state;
  }
  const result = performAction(state, action);
  assert.equal(result.error,undefined,result.error);
  return result.state;
}

test('season report displays every research result and animates from previous balances without changing state', () => {
  let state = act(createGame(), { type:'build',id:'workshop' });
  state = act(state, { type:'endTurn' });
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

test('random event notices show already granted rewards and only one acknowledgement action', () => {
  const occurrences = [
    {id:1,eventId:'hidden_village',timing:'before_turn',turn:1,title:'隐世村庄',description:'访得民间技艺。',effects:[
      {type:'research_progress',amount:40,projectId:'rifling',name:'膛线加工',before:0,after:40},
      {type:'reputation',amount:1,before:10,after:11},
    ]},
    {id:2,eventId:'corrupt_official',timing:'before_turn',turn:2,title:'查抄贪官',description:'赃银归入内库。',effects:[{type:'money',amount:2000,before:35000,after:37000}]},
    {id:3,eventId:'auspicious_omen',timing:'before_turn',turn:3,title:'祥瑞',description:'四方呈报祥瑞。',effects:[{type:'reputation',amount:2,before:11,after:13}]},
  ];
  for (const occurrence of occurrences) {
    const snapshot = JSON.stringify(occurrence), html = renderRandomEvent(occurrence);
    assert.ok(html.includes(occurrence.title));
    assert.match(html,/以上奖励已记入卷宗/);
    assert.equal((html.match(/<button\b/g)||[]).length,1);
    assert.match(html,/data-action="acknowledge-event">阅毕/);
    assert.doesNotMatch(html,/event-choice|领取|NaN|undefined/);
    assert.equal(JSON.stringify(occurrence),snapshot);
    assert.equal(renderRandomEvent(structuredClone(occurrence)),html);
  }
  const village = renderRandomEvent(occurrences[0]);
  assert.match(village,/准备度 \+40%/);
  assert.match(village,/朝廷威望/);
  assert.doesNotMatch(village,/内库银两|1,000|2,000/);
  assert.match(renderRandomEvent(occurrences[1]),/\+2,000 两/);
  assert.match(renderRandomEvent(occurrences[2]),/\+2 点/);
});

test('event research growth uses actual capped progress and preserves prerequisites and acceptance requirements', () => {
  const occurrence = {id:4,eventId:'hidden_village',timing:'before_turn',turn:5,title:'<村庄>',description:'古法 & 新知',effects:[
    {type:'research_progress',amount:6,projectId:'rifling',name:'膛线 <技艺>',before:94,after:100},
    {type:'reputation',amount:1,before:10,after:11},
  ]};
  const animated = renderRandomEvent(occurrence), still = renderRandomEvent(occurrence,{animate:false});
  assert.match(animated,/准备度 \+6%/);
  assert.match(animated,/data-progress-from="94" data-progress-to="100" style="width:94%"/);
  assert.match(animated,/data-count-from="94" data-count-to="100">94<\/span>/);
  assert.match(still,/data-progress-from="94" data-progress-to="100" style="width:100%"/);
  assert.match(still,/data-count-from="94" data-count-to="100">100<\/span>/);
  assert.match(still,/未解锁项目仍须满足前置条件，之后通过验收才会生效/);
  assert.match(animated,/&lt;村庄&gt;|古法 &amp; 新知/);
  assert.doesNotMatch(animated,/<村庄>|<技艺>|自动解锁|验收成功/);
});

test('seasonal reports show handover rewards once and lead to the pending new-season notice', () => {
  const state = act(createGame(),{type:'endTurn'});
  const occurrence = {id:5,eventId:'corrupt_official',timing:'before_turn',turn:2,title:'查抄贪官',description:'赃银入库。',effects:[{type:'money',amount:2000,before:43000,after:45000}]};
  const report = {...state.lastSettlement,events:[occurrence],moneyBefore:35000,moneyAfter:45000,income:10000,netIncome:10000,incomeItems:[{id:'base',label:'常例拨款',amount:8000},{id:'event:5',label:'查抄贪官',amount:2000}]};
  const snapshot = JSON.stringify(report), html = renderTurnSummary(report);
  assert.equal((html.match(/data-settlement-event-id="5"/g)||[]).length,1);
  assert.match(html,/奖励已计入本季结算/);
  assert.match(html,/data-count-from="35000" data-count-to="45000"/);
  assert.match(html,/阅毕，查看新季奏报/);
  assert.doesNotMatch(html,/acknowledge-event|event-choice/);
  assert.equal(JSON.stringify(report),snapshot);
  assert.doesNotMatch(renderTurnSummary({...report,events:[]}),/settlement-events|查看新季奏报/);
});

test('opening event notices survive a serialized reload and acknowledgement does not grant rewards again', () => {
  for (const [seed,eventId] of [[4,'hidden_village'],[15,'auspicious_omen'],[20,'corrupt_official']]) {
    const state = createGame({seed}), event = pendingEvent(state);
    assert.equal(event.eventId,eventId);
    assert.equal(state.lastSettlement,null);
    const restored = JSON.parse(JSON.stringify(state));
    assert.equal(renderRandomEvent(pendingEvent(restored)),renderRandomEvent(event));
    const after = act(restored,{type:'acknowledgeEvent'});
    assert.equal(after.pending,null);
    assert.equal(after.money,state.money);
    assert.equal(after.reputation,state.reputation);
    assert.deepEqual(after.projects,state.projects);
    assert.deepEqual(after.events,state.events);
    assert.equal(after.lastSettlement,null);
    assert.equal(renderRandomEvent(pendingEvent(after)),'');
  }
});

test('real seasonal research rewards appear in both the handover report and the pending notice', () => {
  let state = createGame({seed:42});
  while(state.turn < 3) state = act(state,{type:'endTurn'});
  const event = pendingEvent(state), effect = event.effects.find(item=>item.type==='research_progress');
  assert.equal(event.eventId,'hidden_village');
  assert.equal(event.turn,3);
  assert.equal(getProjectInfo(state,effect.projectId).locked,true);
  const reportHtml = renderTurnSummary(state.lastSettlement), eventHtml = renderRandomEvent(event);
  for (const html of [reportHtml,eventHtml]) {
    assert.ok(html.includes(effect.name));
    assert.match(html,/data-progress-from="0" data-progress-to="40"/);
    assert.match(html,/未解锁项目仍须满足前置条件/);
  }
  assert.match(reportHtml,/第 2 季.*季末结算/);
  assert.match(eventHtml,/第 3 季 · 民间奏报/);
  assert.equal(state.projects[effect.projectId].completed,false);
});

test('report precedes the ending and the transition contains no repeated-turn action', () => {
  const state = act(createGame(),{type:'endTurn'});
  assert.match(renderTurnSummary({...state.lastSettlement,status:'lost'}),/阅毕，查看本局结局/);
  const html = renderTurnTransition({turn:24,date:'崇祯十七年·春季'});
  assert.match(html,/百工报绩，三军报功/);
  assert.doesNotMatch(html,/<button\b|data-action/);
});

test('opening reports include coastal fighting and the first quarter arrival names the White Lotus front', () => {
  let state = act(createGame(), { type:'configureFront', id:'wokou', target:3000, battleCap:600 });
  state = act(state, { type:'endTurn' });
  let html = renderTurnSummary(state.lastSettlement);
  assert.match(html, /倭寇/);
  assert.doesNotMatch(html, /白莲教|流寇|清军/);
  assert.ok(state.lastSettlement.battles[0].playerLosses > 0);
  while(state.turn < 6) state = act(state, { type:'endTurn' });
  assert.deepEqual(state.lastSettlement.newFronts, ['bailian']);
  html = renderTurnSummary(state.lastSettlement);
  assert.match(html, /新军情：白莲教战线出现/);
  assert.doesNotMatch(html, /bailian|undefined/);
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

test('only the newly built district fades and the ninth district is not hidden by the completed base image', () => {
  assert.equal(SETTLEMENT_DISTRICTS.length,9);
  for(let count=1;count<=SETTLEMENT_DISTRICTS.length;count++){
    const built = SETTLEMENT_DISTRICTS.slice(0,count), latest = built.at(-1).id;
    const state = {facilities:Object.fromEntries(built.map(item=>[item.id,1]))};
    const html = settlementScene(state,[],{revealFacilityId:latest});
    const animated = [...html.matchAll(/<image\b[^>]*class="estate-district is-revealing"[^>]*data-facility="([^"]+)"/g)].map(match=>match[1]);
    assert.deepEqual(animated,[latest]);
    assert.match(html,/<image class="estate-base" href="[^"]*estate-panorama-unbuilt.png"/);
    assert.doesNotMatch(settlementScene(state),/is-revealing/);
    if(count===SETTLEMENT_DISTRICTS.length){
      assert.match(html,/class="estate-completion-surround"/);
      assert.match(html,/mask="url\(#district-surround\)"/);
      assert.match(settlementScene(state),/<image class="estate-base" href="[^"]*estate-panorama-complete.png"/);
    }else{
      assert.doesNotMatch(html,/class="estate-completion-surround"/);
      assert.match(settlementScene(state),/<image class="estate-base" href="[^"]*estate-panorama-unbuilt.png"/);
    }
  }
});
