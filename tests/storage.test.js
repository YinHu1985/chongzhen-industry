import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, performAction, getProjectInfo, getCombatRating, getTeamActivity, getFinanceInfo, PROJECTS, FACILITIES } from '../src/game.js';
import { isValidState, parseSave } from '../src/storage.js';
import { createWarfare } from '../src/warfare.js';

const ROOT_PROJECT = PROJECTS.find(project => !project.prerequisites.length
  && !project.prerequisiteAny?.length && !project.milestoneRequirements?.length
  && project.category !== 'army');

function toLegacy(current) {
  const state = structuredClone(current);
  state.version = 4; delete state.enemyStrength; delete state.warfare;
  delete state.treasury; delete state.lastSettlement;
  state.plannedEvents = [1, 2, 3].map(stage => ({ id: `crisis_${stage}`, stage,
    turn: Math.round(state.maxTurns * stage / 4), title: '旧军报', description: '地方请求援守。' }));
  state.resolvedEvents = state.plannedEvents.filter(event => event.turn < state.turn).map(event => event.id);
  return state;
}
function toV5(current) {
  const state = structuredClone(current);
  state.version = 5; delete state.treasury; delete state.lastSettlement;
  return state;
}
function legacyState(turn = 1) {
  const state = createGame(); state.turn = turn;
  return toLegacy(state);
}

function roundTrip(state) {
  assert.equal(isValidState(state), true, `valid v6 state rejected at turn ${state.turn}`);
  assert.deepEqual(parseSave(JSON.stringify(state)), state);
  assert.deepEqual(parseSave(JSON.stringify({ state, savedAt: '2026-11-01T00:00:00.000Z' })), state);
  return state;
}

function act(state, action) {
  const result = performAction(state, action);
  assert.equal(result.error, undefined, result.message);
  return roundTrip(result.state);
}

function rescueFixture(inviteCourt = false) {
  for (let index = 1; index <= 512; index += 1) {
    let state = createGame({ seed: Math.imul(index, 0x9e3779b9) >>> 0 });
    state = performAction(state, { type: 'build', id: 'workshop' }).state;
    for (let season = 0; season < 8 && state.status === 'playing'; season += 1) {
      if (getProjectInfo(state, ROOT_PROJECT.id).canInvest) state = performAction(state, { type: 'invest', id: ROOT_PROJECT.id }).state;
      if (getProjectInfo(state, ROOT_PROJECT.id).canTest) {
        state = performAction(state, { type: 'test', id: ROOT_PROJECT.id, inviteCourt }).state;
        if (state.pending?.kind === 'rescue') return state;
        if (state.projects[ROOT_PROJECT.id].completed) break;
      }
      state = performAction(state, { type: 'endTurn' }).state;
      if (state.pending?.kind === 'event') state = performAction(state, { type: 'event', choice: 'ignore' }).state;
    }
  }
  throw new Error('No recoverable trial found');
}

test('v6 campaigns retain named teams and doctrine without serializing derived milestones or scores', () => {
  for (const maxTurns of [24, 40, 64]) for (const doctrine of ['cold', 'cuirassier', 'minie', 'breech']) {
    let state = roundTrip(createGame({ maxTurns, seed: 12345 }));
    assert.equal(state.version, 6);
    assert.equal(state.teams.length, 5);
    assert.equal(state.candidates.length, 3);
    assert.ok(!Object.hasOwn(state, 'routes') && !Object.hasOwn(state, 'usedTeams'));
    assert.ok(!Object.hasOwn(state, 'milestones') && !Object.hasOwn(state, 'score'));
    state = act(state, { type: 'selectDoctrine', id: doctrine });
    assert.equal(state.doctrine, doctrine);
    assert.deepEqual(getCombatRating(parseSave(JSON.stringify(state))), getCombatRating(state));
  }
});

test('recruitment, hiring, dismissing and random candidate refresh survive export and reload', () => {
  let state = roundTrip(createGame({ seed: 12345 }));
  const candidate = [...state.candidates].sort((a, b) => a.hireCost - b.hireCost)[0];
  state = act(state, { type: 'hireTeam', teamId: candidate.id });
  assert.ok(state.teams.some(team => team.id === candidate.id));
  assert.ok(!state.candidates.some(team => team.id === candidate.id));
  state = act(state, { type: 'dismissTeam', teamId: candidate.id });
  const restored = parseSave(JSON.stringify({ state }));
  assert.deepEqual(act(restored, { type: 'refreshCandidates' }), act(state, { type: 'refreshCandidates' }));
  // Keep this roster-boundary check independent of the prestige defeat threshold.
  state.reputation = 30;
  while (state.teams.length > 1) state = act(state, { type: 'dismissTeam', teamId: state.teams.at(-1).id });
  assert.ok(performAction(state, { type: 'dismissTeam', teamId: state.teams[0].id }).error);
  roundTrip(state);
});

test('team occupancy, research preparation and seasonal release round-trip through actual actions', () => {
  let state = act(createGame({ seed: 1 }), { type: 'build', id: 'workshop' });
  assert.equal(state.facilities.workshop, 1);
  const team = state.teams.find(team => team.usedTurn !== state.turn);
  state = act(state, { type: 'invest', id: ROOT_PROJECT.id, teamId: team.id });
  assert.equal(state.teams.find(item => item.id === team.id).usedTurn, 0);
  assert.equal(state.projects[ROOT_PROJECT.id].progress, 0);
  const restored = parseSave(JSON.stringify(state));
  assert.deepEqual(act(restored, { type: 'endTurn' }), act(state, { type: 'endTurn' }));
});

test('private and court-witnessed rescues retain their stakes and RNG outcomes after reload', () => {
  for (const inviteCourt of [false, true]) {
    const pending = roundTrip(rescueFixture(inviteCourt));
    assert.equal(pending.pending.inviteCourt, inviteCourt);
    assert.equal(pending.pending.cost, getProjectInfo(pending, ROOT_PROJECT.id).rescueCost);
    const restored = parseSave(JSON.stringify({ state: pending }));
    for (const accept of [false, true]) {
      assert.deepEqual(act(restored, { type: 'rescue', accept }), act(pending, { type: 'rescue', accept }));
    }
  }
});

test('existing private rescue records without a court flag remain private after reload', () => {
  const pending = rescueFixture(false);
  const earlierRecord = structuredClone(pending);
  delete earlierRecord.pending.inviteCourt;
  const restored = roundTrip(earlierRecord);
  for (const accept of [false, true]) {
    assert.deepEqual(act(restored, { type: 'rescue', accept }), act(pending, { type: 'rescue', accept }));
  }
});

test('zero prestige and immediate red-pill endings survive reload and remain terminal', () => {
  let state = createGame();
  for (let dismissal = 0; dismissal < 2; dismissal += 1) {
    state = act(state, { type: 'dismissTeam', teamId: state.teams.at(-1).id });
  }
  assert.equal(state.reputation, 0);
  assert.equal(state.status, 'playing');
  const lost = act(state, { type: 'dismissTeam', teamId: state.teams.at(-1).id });
  assert.equal(lost.status, 'lost');
  assert.equal(lost.defeatReason, 'prestige');
  assert.equal(lost.reputation, -5);
  assert.equal(lost.turn, state.turn);
  assert.equal(lost.pending, null);
  const restored = parseSave(JSON.stringify({ state: lost }));
  for (const action of [{ type: 'endTurn' }, { type: 'dismissTeam', teamId: restored.teams.at(-1).id }]) {
    const result = performAction(restored, action);
    assert.ok(result.error);
    assert.equal(result.state, restored);
  }
});

test('legacy pending crises migrate without spending funds or prestige or advancing time', () => {
  const old = legacyState(6);
  old.pending = { kind: 'event', ...old.plannedEvents[0], choices: [
    { id: 'supply', label: '军需', description: '供军', cost: 3500, disabled: true },
    { id: 'dispatch', label: '援军', description: '援守', cost: 2800, disabled: true, successChance: 25 },
    { id: 'ignore', label: '暂缓', description: '待议', cost: 0, disabled: false },
  ] };
  const migrated = parseSave(JSON.stringify(old));
  assert.equal(migrated.version, 6); assert.equal(migrated.turn, 6);
  assert.equal(migrated.money, old.money); assert.equal(migrated.reputation, old.reputation);
  assert.equal(migrated.pending, null); assert.deepEqual(migrated.plannedEvents, []);
  assert.deepEqual(migrated.resolvedEvents, []); assert.equal(migrated.warfare.fronts.wokou.troops > 0, true);
  assert.equal(migrated.warfare.fronts.li.troops, 0); roundTrip(migrated);
});

test('v4 research methods migrate without losing research or team progress', () => {
  let state = act(createGame({ seed: 1 }), { type: 'build', id: 'workshop' });
  state = act(state, { type: 'invest', id: 'standards', teamId: state.teams[0].id });
  state = act(state, { type: 'endTurn' });
  const oldSave = toLegacy(state);
  for (const project of Object.values(oldSave.projects)) project.method = 'standard';
  oldSave.projects.standards.method = 'makeshift';
  const restored = parseSave(JSON.stringify({ state: oldSave }));
  assert.deepEqual(restored.projects, state.projects);
  assert.deepEqual(restored.teams.map(team => ({ ...team, activity: null })), state.teams.map(team => ({ ...team, activity: null })));
  assert.ok(restored.teams.every(team => team.activity?.kind !== 'research'));
  assert.ok(Object.values(restored.projects).every(project => !Object.hasOwn(project, 'method')));
  assert.equal(getTeamActivity(restored, state.teams[0].id).kind, 'idle');
  roundTrip(restored);
  const badSave = structuredClone(oldSave); badSave.projects.standards.method = 'unknown';
  assert.throws(() => parseSave(JSON.stringify(badSave)));
});

test('growing warfronts and threshold defeats reload across every campaign length', () => {
  for (const maxTurns of [24, 40, 64]) {
    let state = roundTrip(createGame({ maxTurns }));
    while (state.status === 'playing') {
      state = act(state, { type: 'endTurn' });
      if (state.pending?.kind === 'event') state = act(state, { type: 'event', choice: 'ignore' });
    }
    assert.equal(state.status, 'lost');
    assert.equal(getCombatRating(state).ready, false);
  }
});

test('all four natural doctrines restore intermediate actions, deployments and final results', async () => {
  const { playCampaign } = await import('./helpers/campaign.mjs');
  for (const doctrine of ['cold', 'cuirassier', 'minie', 'breech']) {
    const { state } = playCampaign(doctrine, { seed: 12345, maxTurns: 24, onAction: roundTrip });
    assert.notEqual(state.status, 'playing', doctrine);
    const restored = roundTrip(state);
    assert.deepEqual(getCombatRating(restored), getCombatRating(state));
    const result = performAction(restored, { type: 'endTurn' });
    assert.ok(result.error); assert.equal(result.state, restored);
  }
});

test('missing required fields and unknown or missing project and building records are rejected', () => {
  const pristine = createGame();
  for (const key of Object.keys(pristine)) {
    const state = structuredClone(pristine);
    delete state[key];
    assert.equal(isValidState(state), false, `missing ${key}`);
    assert.throws(() => parseSave(JSON.stringify(state)));
  }
  for (const { id } of PROJECTS) {
    const state = structuredClone(pristine);
    delete state.projects[id];
    assert.equal(isValidState(state), false, `missing project ${id}`);
  }
  for (const { id } of FACILITIES) {
    const state = structuredClone(pristine);
    delete state.facilities[id];
    assert.equal(isValidState(state), false, `missing facility ${id}`);
  }
  const extra = structuredClone(pristine);
  extra.projects.unknown = structuredClone(extra.projects[ROOT_PROJECT.id]);
  assert.equal(isValidState(extra), false);
});

test('malformed rosters, duplicated identities and invalid specialties are rejected', () => {
  const mutations = [
    state => { state.teams = []; },
    state => { state.teams = 5; },
    state => { state.teams.push(...state.candidates, structuredClone(state.teams[0])); },
    state => { state.candidates.push(structuredClone(state.candidates[0])); },
    state => { state.candidates[0].id = state.teams[0].id; },
    state => { state.teams[0].id = 'unknown'; },
    state => { state.teams[0].id = `team_${state.nextTeamId}`; },
    state => { state.nextTeamId = 1.5; },
    state => { state.recruitmentRound = -1; },
    state => { state.teams[0].usedTurn = state.turn + 1; },
    state => { state.teams[0].hireCost = 123; },
    state => { state.teams[0].name = null; },
    state => { state.teams[0].specialties.math = 101; },
    state => { state.teams[0].specialties.math = -1; },
    state => { state.teams[0].specialties.math = 2.5; },
    state => { delete state.teams[0].specialties.foreign; },
    state => { state.teams[0].specialties.unknown = 5; },
  ];
  for (const mutate of mutations) {
    const state = createGame(); mutate(state);
    assert.equal(isValidState(state), false, mutate.toString());
  }
});

test('invalid numbers, project metadata, forged scores and impossible endings are rejected', () => {
  const mutations = [
    state => { state.maxTurns = 25; },
    state => { state.turn = 0; },
    state => { state.turn = 25; },
    state => { state.money = NaN; },
    state => { state.money = -1; },
    state => { state.money = 100_000_000_001; },
    state => { state.reputation = Infinity; },
    state => { state.reputation = -1; },
    state => { state.status = 'lost'; state.reputation = -1; },
    state => { state.status = 'lost'; state.defeatReason = 'prestige'; },
    state => { state.defeatReason = 'prestige'; state.reputation = -1; },
    state => { state.status = 'lost'; state.defeatReason = 'unknown'; state.reputation = -1; },
    state => { state.rng = 0; },
    state => { state.seed = 2 ** 32; },
    state => { state.doctrine = 'unknown'; },
    state => { state.score = 999; },
    state => { state.projects[ROOT_PROJECT.id].method = undefined; },
    state => { state.projects[ROOT_PROJECT.id].method = 'unknown'; },
    state => { state.projects[ROOT_PROJECT.id].progress = 101; },
    state => { state.projects[ROOT_PROJECT.id].completed = true; },
    state => { state.projects.joint_trials.attempts = 1; },
    state => { state.status = 'lost'; },
    state => { state.status = 'won'; state.projects.joint_trials.completed = true; state.projects.joint_trials.progress = 100; },
    state => { state.resolvedEvents = ['unknown']; },
    state => { state.plannedEvents.push({ id: 'crisis_1', turn: 6 }); },
    state => { state.log[0].id = state.nextLogId; },
    state => { state.log.push(structuredClone(state.log[0])); },
    state => { state.stats.spent = -1; },
  ];
  for (const mutate of mutations) {
    const state = createGame(); mutate(state);
    assert.equal(isValidState(state), false, mutate.toString());
  }
  for (const project of PROJECTS) {
    const state = createGame(); state.projects[project.id].method = 'makeshift';
    assert.equal(isValidState(state), false, project.id);
  }
});

test('pending decisions cannot reference unrelated projects or resurrect old event choices', () => {
  const rescue = rescueFixture();
  for (const change of [pending => { pending.projectId = 'joint_trials'; }, pending => { pending.projectId = 'unknown'; }, pending => { pending.cost = -100; }, pending => { pending.successChance = 96; }, pending => { pending.inviteCourt = 'yes'; }, pending => { pending.inviteCourt = null; }, pending => { pending.inviteCourt = 1; }]) {
    const state = structuredClone(rescue); change(state.pending);
    assert.equal(isValidState(state), false);
  }
  const state = createGame();
  state.pending = { kind: 'event', id: 'crisis_1', title: '旧军报', description: '旧军报', choices: [] };
  assert.equal(isValidState(state), false);
});

test('unsupported versions and malformed or oversized imports are rejected', () => {
  for (const version of [1, 2, 3, 7]) {
    const state = createGame(); state.version = version;
    const before = structuredClone(state);
    assert.equal(isValidState(state), false);
    assert.throws(() => parseSave(JSON.stringify(state)));
    assert.deepEqual(state, before);
  }
  for (const raw of [null, undefined, 3, '', '{', 'null', '[]', '{}', '{"state":null}', ' '.repeat(2 * 1024 * 1024 + 1)]) {
    assert.throws(() => parseSave(raw));
  }
});


test('optional team activities preserve saves without fabricated assignments',()=>{
  let state=act(createGame(),{type:'build',id:'workshop'});
  const teamId=state.teams.find(team=>team.usedTurn!==state.turn).id;
  state=act(state,{type:'invest',id:ROOT_PROJECT.id,teamId});
  for(const team of [...state.teams,...state.candidates])delete team.activity;
  const raw=JSON.stringify(state),restored=parseSave(raw);
  assert.deepEqual(restored,state);assert.equal(JSON.stringify(restored),raw);
  assert.ok(restored.teams.every(team=>getTeamActivity(restored,team.id).kind==='idle'));
  assert.ok(restored.teams.every(team=>!Object.hasOwn(team,'activity')));
  roundTrip(restored);
});

test('research and construction activity survive saves, seasons, failed attempts and completion',()=>{
  let state=act(createGame({seed:12345}),{type:'build',id:'workshop'});
  const buildingTeam=state.teams.find(t=>t.activity?.kind==='build');
  assert.equal(getTeamActivity(parseSave(JSON.stringify(state)),buildingTeam.id).kind,'build');
  const teamId=state.teams.find(t=>t.usedTurn!==state.turn).id;
  state=act(state,{type:'invest',id:ROOT_PROJECT.id,teamId});
  assert.equal(getTeamActivity(state,teamId).projectId,ROOT_PROJECT.id);
  state=act(state,{type:'endTurn'});
  assert.equal(getTeamActivity(state,teamId).active,true);
  assert.equal(getTeamActivity(state,buildingTeam.id).kind,'idle');
  assert.deepEqual(getTeamActivity(parseSave(JSON.stringify(state)),teamId),getTeamActivity(state,teamId));
  const rescue=roundTrip(rescueFixture());
  const researcher=rescue.teams.find(t=>t.activity?.kind==='research'&&t.activity.targetId===rescue.pending.projectId);
  assert.ok(researcher);assert.equal(getTeamActivity(rescue,researcher.id).statusLabel,'等待抢险决策');
  const failed=act(rescue,{type:'rescue',accept:false});
  assert.equal(getTeamActivity(failed,researcher.id).active,true);
  assert.equal(getTeamActivity(failed,researcher.id).progress,getProjectInfo(failed,ROOT_PROJECT.id).progress);
});

test('malformed or duplicated team activity and candidate assignments are rejected',()=>{
  let base=act(createGame(),{type:'build',id:'workshop'});
  const teamId=base.teams.find(team=>team.usedTurn!==base.turn).id;
  base=act(base,{type:'invest',id:ROOT_PROJECT.id,teamId});
  const index=base.teams.findIndex(team=>team.id===teamId);
  const mutations=[
    state=>{state.teams[index].activity='research';},
    state=>{state.teams[index].activity={};},
    state=>{state.teams[index].activity.kind='unknown';},
    state=>{state.teams[index].activity.targetId='unknown';},
    state=>{state.teams[index].activity.targetId='joint_trials';},
    state=>{state.teams[index].activity.turn=0;},
    state=>{state.teams[index].activity.turn=state.turn+1;},
    state=>{state.teams[index].activity.extra=true;},
    state=>{state.teams[index].activity.kind='build';},
    state=>{state.teams[index].activity={kind:'build',targetId:'furnace',turn:state.turn};},
    state=>{state.teams[index].activity={kind:'train',targetId:'infantry',turn:state.turn};},
    state=>{state.candidates[0].activity=structuredClone(state.teams[index].activity);state.candidates[0].usedTurn=state.turn;},
    state=>{const other=state.teams.find((t,i)=>i!==index);other.activity=structuredClone(state.teams[index].activity);other.usedTurn=state.turn;},
  ];
  for(const mutate of mutations){
    const state=structuredClone(base);mutate(state);
    assert.equal(isValidState(state),false,mutate.toString());
    assert.throws(()=>parseSave(JSON.stringify(state)));
  }
});

test('deployed armies, automatic targets, enemy caps and battle reports round-trip', () => {
  let state = createGame({ enemyStrength: 7 });
  while (state.turn < 6) state = act(state, { type: 'endTurn' });
  state = act(state, { type: 'configureFront', id: 'wokou', target: 5000, battleCap: 2500 });
  const before = roundTrip(state), restored = parseSave(JSON.stringify(before));
  state = act(state, { type: 'endTurn' });
  assert.deepEqual(state, act(restored, { type: 'endTurn' }));
  assert.equal(state.enemyStrength, 7);
  assert.equal(state.warfare.fronts.wokou.target, 5000);
  assert.equal(state.warfare.fronts.wokou.battleCap, 2500);
  assert.equal(state.warfare.fronts.wokou.lastBattle.turn, 6);
});

test('invalid difficulty, dormant deployments, enemy bounds and malformed battle reports are rejected', () => {
  const mutations = [
    state => { state.enemyStrength = 0; }, state => { state.enemyStrength = 11; },
    state => { state.enemyStrength = 1.5; }, state => { state.enemyStrength = '3'; },
    state => { state.warfare.reserve = -1; }, state => { state.warfare.reserve = Infinity; },
    state => { state.warfare.lastSettledTurn = state.turn + 1; },
    state => { state.warfare.fronts.wokou.target = 2000; },
    state => { state.warfare.fronts.wokou.troops = 100; },
    state => { state.warfare.fronts.wokou.battleCap = 0; },
    state => { state.warfare.fronts.wokou.battleCap = 1.5; },
    state => { state.warfare.fronts.wokou.extra = 100; },
    state => { delete state.warfare.fronts.qing; },
  ];
  for (const mutate of mutations) {
    const state = createGame(); mutate(state);
    assert.equal(isValidState(state), false, mutate.toString());
    assert.throws(() => parseSave(JSON.stringify(state)));
  }
  let fought = createGame();
  while (fought.turn < 7) fought = act(fought, { type: 'endTurn' });
  for (const mutate of [
    battle => { battle.enemyLosses = battle.enemyCommitted + 1; },
    battle => { battle.playerLosses = battle.playerCommitted + 1; },
    battle => { battle.enemyAfter += 1; }, battle => { battle.turn = 24; },
    battle => { battle.reinforcements = -1; }, battle => { battle.sustainable = 'true'; },
    battle => { battle.extra = 1; }, battle => { delete battle.replacementCapacity; },
  ]) {
    const state = structuredClone(fought); mutate(state.warfare.fronts.wokou.lastBattle);
    assert.equal(isValidState(state), false, mutate.toString());
  }
});

test('legacy completed campaigns retain their original endings without reopening play', () => {
  for (const status of ['won', 'lost']) {
    const old = legacyState(status === 'won' ? 20 : 24);
    old.status = status;
    if (status === 'won') {
      for (const project of Object.values(old.projects)) {
        project.completed = true; project.progress = 100; project.attempts = 1;
      }
      old.projects.joint_trials.attempts = 0;
      Object.keys(old.army).forEach(branch => { old.army[branch] = 100; });
    }
    const restored = parseSave(JSON.stringify({ state: old }));
    assert.equal(restored.status, status); assert.equal(restored.legacyEnding, status);
    assert.deepEqual(restored.projects, old.projects); assert.deepEqual(restored.army, old.army);
    roundTrip(restored);
    assert.ok(performAction(restored, { type: 'endTurn' }).error);
  }
});

test('invalid legacy saves are rejected before migration and rescue decisions remain pending', () => {
  const malformed = legacyState(); malformed.teams[0].specialties.math = 500;
  assert.throws(() => parseSave(JSON.stringify(malformed)));
  const forged = legacyState(); forged.status = 'won'; forged.projects.joint_trials.completed = true;
  forged.projects.joint_trials.progress = 100;
  assert.throws(() => parseSave(JSON.stringify(forged)));
  const pending = rescueFixture(true), old = toLegacy(pending);
  const restored = parseSave(JSON.stringify(old));
  assert.deepEqual(restored.pending, pending.pending);
  assert.equal(restored.rng, pending.rng); assert.equal(restored.money, pending.money);
  assert.deepEqual(act(restored, { type: 'rescue', accept: true }).projects,
    act(pending, { type: 'rescue', accept: true }).projects);
});

test('final victory, stalemate and each front-specific ending remain valid after reloading', () => {
  for (const ending of ['won', 'stalemate', 'li', 'qing', 'wokou']) {
    let state = createGame({ enemyStrength: 3 });
    state.turn = state.maxTurns;
    state.warfare = createWarfare(state.maxTurns, state.turn);
    state.warfare.reserve = 300000;
    for (const project of PROJECTS.filter(project => !project.automatic)) {
      Object.assign(state.projects[project.id], { completed: true, progress: 100, attempts: 1 });
    }
    Object.keys(state.army).forEach(branch => { state.army[branch] = 100; });
    if (ending === 'stalemate') Object.values(state.warfare.fronts).forEach(front => { front.troops *= 2; });
    for (const [id, front] of Object.entries(state.warfare.fronts)) {
      if (ending !== id) state = act(state, { type: 'configureFront', id, target: 60000, battleCap: front.battleCap });
    }
    state = act(state, { type: 'endTurn' });
    assert.equal(state.status, ['won', 'stalemate'].includes(ending) ? ending : 'lost');
    if (state.status === 'lost') assert.equal(state.defeatReason, ending);
    const restored = roundTrip(state);
    assert.deepEqual(restored.warfare, state.warfare);
    const migratedV5 = parseSave(JSON.stringify(toV5(state)));
    assert.equal(migratedV5.status, state.status); assert.equal(migratedV5.defeatReason, state.defeatReason);
    assert.equal(migratedV5.money, state.money); assert.deepEqual(migratedV5.warfare, state.warfare);
    assert.equal(migratedV5.lastSettlement, null); assert.deepEqual(migratedV5.treasury, { entries: [], nextId: 1 });
    roundTrip(migratedV5);
    const corrupted = structuredClone(state);
    corrupted.status = state.status === 'stalemate' ? 'lost' : 'stalemate';
    assert.equal(isValidState(corrupted), false);
  }
});

test('a pacified front below its victory line does not invalidate a saved stalemate', () => {
  let state = createGame({ enemyStrength: 3 });
  state.turn = state.maxTurns;
  state.warfare = createWarfare(state.maxTurns, state.turn);
  state.warfare.reserve = 200000;
  state.warfare.fronts.li.troops = 3000;
  state.warfare.fronts.qing.troops = 36000;
  for (const project of PROJECTS.filter(project => !project.automatic)) {
    Object.assign(state.projects[project.id], { completed: true, progress: 100, attempts: 1 });
  }
  Object.keys(state.army).forEach(branch => { state.army[branch] = 100; });
  for (const id of ['wokou', 'qing']) {
    state = act(state, { type: 'configureFront', id, target: 60000, battleCap: state.warfare.fronts[id].battleCap });
  }
  state = act(state, { type: 'endTurn' });
  assert.equal(state.status, 'stalemate');
  assert.equal(state.warfare.fronts.li.lastBattle.sustainable, false);
  assert.equal(state.warfare.fronts.li.lastBattle.enemyDeclining, false);
  assert.ok(state.warfare.fronts.li.troops <= 8000);
  roundTrip(state);
});

test('standing research orders reload without spending until settlement and stop charging at full preparation', () => {
  let state = act(createGame({ seed: 12345 }), { type: 'build', id: 'workshop' });
  const teamId = state.teams.find(team => team.usedTurn !== state.turn).id;
  const before = structuredClone(state);
  state = act(state, { type: 'invest', id: 'standards', teamId });
  assert.equal(state.money, before.money); assert.equal(state.rng, before.rng);
  assert.deepEqual(state.projects, before.projects); assert.deepEqual(state.treasury, before.treasury);
  assert.equal(state.teams.find(team => team.id === teamId).usedTurn, 0);
  const expense = getFinanceInfo(state).expenses;
  assert.ok(expense > 0);
  while (state.projects.standards.progress < 100) {
    const restored = parseSave(JSON.stringify(state));
    const expected = act(state, { type: 'endTurn' });
    state = act(restored, { type: 'endTurn' });
    assert.deepEqual(state, expected);
    assert.equal(state.lastSettlement.expenses, expense);
    assert.equal(state.lastSettlement.research[0].teamId, teamId);
    assert.equal(state.lastSettlement.expenseItems[0].projectId, 'standards');
    assert.equal(state.teams.find(team => team.id === teamId).activity.turn, 1);
  }
  const rng = state.rng;
  assert.equal(getFinanceInfo(state).expenses, 0);
  state = act(state, { type: 'endTurn' });
  assert.equal(state.lastSettlement.expenses, 0); assert.deepEqual(state.lastSettlement.research, []);
  assert.equal(state.rng, rng);
});

test('cancelled research stays cancelled across reload and never creates a future charge', () => {
  let state = act(createGame(), { type: 'build', id: 'workshop' });
  const teamId = state.teams.find(team => team.usedTurn !== state.turn).id;
  state = act(state, { type: 'invest', id: 'standards', teamId });
  state = act(state, { type: 'cancelResearch', teamId });
  state = act(parseSave(JSON.stringify(state)), { type: 'endTurn' });
  assert.equal(state.lastSettlement.expenses, 0);
  assert.equal(state.projects.standards.progress, 0);
  assert.equal(state.teams.find(team => team.id === teamId).activity, null);
});

test('multiple trials in one quarter persist attempts beyond the season number and each actual charge', () => {
  let state = act(createGame(), { type: 'build', id: 'workshop' });
  state.projects.standards.progress = 80; state.reputation = 50;
  let failureSeed = 1;
  for (;; failureSeed++) {
    let x = failureSeed; x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    if ((x >>> 0) / 4294967296 > .99) break;
  }
  for (let index = 1; index <= 3; index++) {
    state.rng = failureSeed;
    state = act(state, { type: 'test', id: 'standards' });
    assert.equal(state.pending, null);
    assert.equal(state.projects.standards.attempts, index);
    assert.equal(state.projects.standards.testedTurn, 1);
    assert.equal(state.turn, 1);
  }
  assert.equal(state.treasury.entries.filter(entry => entry.category === 'trial').length, 3);
  roundTrip(state);
  const old = toV5(state);
  assert.throws(() => parseSave(JSON.stringify(old)), 'v5 attempts still obey the former seasonal limit');
});

test('v5 migration preserves money, progress, troop records and occupied teams without opting into recurring expenses', () => {
  let state = act(createGame(), { type: 'build', id: 'workshop' });
  const teamId = state.teams.find(team => team.usedTurn !== state.turn).id;
  state = act(state, { type: 'invest', id: 'standards', teamId });
  state = act(state, { type: 'endTurn' });
  const old = toV5(state), restored = parseSave(JSON.stringify({ state: old }));
  assert.equal(restored.version, 6);
  assert.deepEqual(restored.projects, old.projects);
  assert.deepEqual(restored.warfare, old.warfare);
  assert.equal(restored.money, old.money); assert.equal(restored.rng, old.rng);
  assert.equal(restored.teams.find(team => team.id === teamId).usedTurn, old.teams.find(team => team.id === teamId).usedTurn);
  assert.equal(restored.teams.find(team => team.id === teamId).activity, null);
  assert.deepEqual(restored.treasury, { entries: [], nextId: 1 });
  assert.equal(restored.lastSettlement, null); assert.equal(getFinanceInfo(restored).expenses, 0);
  const next = act(restored, { type: 'endTurn' });
  assert.equal(next.lastSettlement.expenses, 0); assert.deepEqual(next.lastSettlement.research, []);
  assert.ok(next.treasury.entries.every(entry => entry.turn === restored.turn));
  const corrupt = structuredClone(old); corrupt.teams.find(team => team.id === teamId).usedTurn = 0;
  assert.throws(() => parseSave(JSON.stringify(corrupt)));
});

test('financial histories retain immediate levy and building entries separately from settlement summaries', () => {
  let state = act(createGame(), { type: 'levy' });
  state = act(state, { type: 'build', id: 'workshop' });
  const before = state.money;
  const immediate = structuredClone(state.treasury.entries);
  state = act(state, { type: 'endTurn' });
  assert.equal(state.lastSettlement.moneyBefore, before);
  assert.equal(state.lastSettlement.expenses, 0);
  assert.ok(state.lastSettlement.entries.every(entry => entry.kind === 'income' && entry.category === 'grant'));
  assert.deepEqual(state.treasury.entries.slice(0, immediate.length), immediate);
  const report = structuredClone(state.lastSettlement);
  state = act(state, { type: 'levy' });
  assert.deepEqual(state.lastSettlement, report);
  assert.notEqual(state.money, report.moneyAfter);
  assert.equal(state.treasury.entries.at(-1).category, 'prestige');
  roundTrip(state);
});

test('forged ledger balances and malformed settlement totals or records are rejected', () => {
  let state = act(createGame(), { type: 'build', id: 'workshop' });
  const teamId = state.teams.find(team => team.usedTurn !== state.turn).id;
  state = act(state, { type: 'invest', id: 'standards', teamId });
  state = act(state, { type: 'endTurn' });
  const mutations = [
    copy => { delete copy.treasury.nextId; }, copy => { copy.treasury.nextId++; },
    copy => { copy.treasury.entries[0].amount = -1; }, copy => { copy.treasury.entries[0].balance++; },
    copy => { copy.treasury.entries[0].kind = 'transfer'; }, copy => { copy.treasury.entries[0].category = 'unknown'; },
    copy => { copy.treasury.entries[0].teamId = `team_${copy.nextTeamId}`; },
    copy => { copy.treasury.entries[1].id = copy.treasury.entries[0].id; },
    copy => { copy.lastSettlement.moneyAfter++; }, copy => { copy.lastSettlement.netIncome--; },
    copy => { copy.lastSettlement.incomeItems[0].amount++; }, copy => { copy.lastSettlement.expenseItems[0].amount++; },
    copy => { copy.lastSettlement.entries[0].amount++; }, copy => { copy.lastSettlement.research[0].gain++; },
    copy => { copy.lastSettlement.research[0].passed = 1; }, copy => { copy.lastSettlement.turn++; },
    copy => { copy.lastSettlement.totalTroopsAfter++; }, copy => { copy.lastSettlement.newFronts = ['qing']; },
    copy => { copy.lastSettlement.battles.push({ id: 'unknown' }); },
  ];
  for (const mutate of mutations) {
    const copy = structuredClone(state); mutate(copy);
    assert.equal(isValidState(copy), false, mutate.toString());
    assert.throws(() => parseSave(JSON.stringify(copy)));
  }
});

test('v5 pending rescue migrates without charging or discarding the unresolved trial', () => {
  const pending = rescueFixture(true), old = toV5(pending);
  const restored = parseSave(JSON.stringify(old));
  assert.deepEqual(restored.pending, pending.pending);
  assert.equal(restored.money, pending.money); assert.equal(restored.rng, pending.rng);
  assert.ok(restored.teams.every(team => team.activity?.kind !== 'research'));
  assert.deepEqual(restored.treasury.entries, []);
  for (const accept of [false, true]) {
    const after = act(restored, { type: 'rescue', accept });
    const expected = act(pending, { type: 'rescue', accept });
    assert.deepEqual(after.projects, expected.projects);
    assert.equal(after.money, expected.money); assert.equal(after.reputation, expected.reputation);
    assert.equal(after.treasury.entries.length, accept ? 1 : 0);
  }
});
