import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, performAction, getProjectInfo, getCombatRating, getTeamActivity, PROJECTS, FACILITIES } from '../src/game.js';
import { isValidState, parseSave } from '../src/storage.js';

const ROOT_PROJECT = PROJECTS.find(project => !project.prerequisites.length
  && !project.prerequisiteAny?.length && !project.milestoneRequirements?.length
  && project.category !== 'army');

function roundTrip(state) {
  assert.equal(isValidState(state), true, `valid v4 state rejected at turn ${state.turn}`);
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

test('v4 campaigns retain named teams and doctrine without serializing derived milestones or scores', () => {
  for (const maxTurns of [24, 40, 64]) for (const doctrine of ['cold', 'cuirassier', 'minie', 'breech']) {
    let state = roundTrip(createGame({ maxTurns, seed: 12345 }));
    assert.equal(state.version, 4);
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
  assert.equal(state.teams.find(item => item.id === team.id).usedTurn, state.turn);
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

test('red-pill defeat can retain a crisis resolved in the same quarter without advancing time', () => {
  let state = createGame();
  for (let dismissal = 0; dismissal < 2; dismissal += 1) {
    state = act(state, { type: 'dismissTeam', teamId: state.teams.at(-1).id });
  }
  while (!state.pending) state = act(state, { type: 'endTurn' });
  const eventId = state.pending.id;
  const lost = act(state, { type: 'event', choice: 'ignore' });
  assert.equal(lost.status, 'lost');
  assert.equal(lost.defeatReason, 'prestige');
  assert.equal(lost.turn, state.turn);
  assert.equal(lost.money, state.money);
  assert.equal(lost.pending, null);
  assert.ok(lost.resolvedEvents.includes(eventId));
});

test('existing v4 method choices are discarded on load without losing research or team progress', () => {
  let state = act(createGame({ seed: 1 }), { type: 'build', id: 'workshop' });
  state = act(state, { type: 'invest', id: 'standards', teamId: state.teams[0].id });
  const oldSave = structuredClone(state);
  for (const project of Object.values(oldSave.projects)) project.method = 'standard';
  oldSave.projects.standards.method = 'makeshift';
  const restored = parseSave(JSON.stringify({ state: oldSave }));
  assert.deepEqual(restored, state);
  assert.ok(Object.values(restored.projects).every(project => !Object.hasOwn(project, 'method')));
  assert.deepEqual(getTeamActivity(restored, state.teams[0].id), getTeamActivity(state, state.teams[0].id));
  assert.deepEqual(act(restored, { type: 'endTurn' }), act(state, { type: 'endTurn' }));
  const badSave = structuredClone(oldSave); badSave.projects.standards.method = 'unknown';
  assert.throws(() => parseSave(JSON.stringify(badSave)));
});

test('military news, resolved events and final defeat reload across every campaign length', () => {
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

test('all four natural doctrines restore intermediate actions, combat ratings and immediate victories', async () => {
  const { playCampaign } = await import('./helpers/campaign.mjs');
  for (const doctrine of ['cold', 'cuirassier', 'minie', 'breech']) {
    const { state } = playCampaign(doctrine, { seed: 12345, maxTurns: 24, onAction: roundTrip });
    assert.equal(state.status, 'won', doctrine);
    assert.equal(state.projects.joint_trials.completed, true);
    const restored = roundTrip(state);
    assert.deepEqual(getCombatRating(restored), getCombatRating(state));
    assert.ok(getCombatRating(restored).fronts.every(front => front.done));
    const result = performAction(restored, { type: 'endTurn' });
    assert.ok(result.error);
    assert.equal(result.state, restored);
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
    state => { state.plannedEvents[0].turn += 1; },
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

test('pending decisions cannot reference unrelated projects or invent extra event choices', () => {
  const rescue = rescueFixture();
  for (const change of [pending => { pending.projectId = 'joint_trials'; }, pending => { pending.projectId = 'unknown'; }, pending => { pending.cost = -100; }, pending => { pending.successChance = 96; }, pending => { pending.inviteCourt = 'yes'; }, pending => { pending.inviteCourt = null; }, pending => { pending.inviteCourt = 1; }]) {
    const state = structuredClone(rescue); change(state.pending);
    assert.equal(isValidState(state), false);
  }
  let event = createGame();
  while (!event.pending) event = performAction(event, { type: 'endTurn' }).state;
  roundTrip(event);
  const duplicate = structuredClone(event); duplicate.pending.choices[1] = structuredClone(duplicate.pending.choices[0]);
  assert.equal(isValidState(duplicate), false);
  const unrelated = structuredClone(event); unrelated.pending.id = 'unknown';
  assert.equal(isValidState(unrelated), false);
});

test('only v4 JSON is accepted; malformed and oversized imports fail without migration', () => {
  for (const version of [1, 2, 3, 5]) {
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


test('optional team activities preserve existing v4 saves without migration or fabricated assignments',()=>{
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
    state=>{state.teams[index].usedTurn=0;},
    state=>{state.candidates[0].activity=structuredClone(state.teams[index].activity);state.candidates[0].usedTurn=state.turn;},
    state=>{const other=state.teams.find((t,i)=>i!==index);other.activity=structuredClone(state.teams[index].activity);other.usedTurn=state.turn;},
  ];
  for(const mutate of mutations){
    const state=structuredClone(base);mutate(state);
    assert.equal(isValidState(state),false,mutate.toString());
    assert.throws(()=>parseSave(JSON.stringify(state)));
  }
});
