import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, performAction, getProjectInfo, getFacilityInfo, getFacilityLevel, hasFacility, getCombatRating, PROJECTS, FACILITIES } from '../src/game.js';
import { BUILDING_CATEGORIES, MILESTONES } from '../src/technology.js';
import { isValidState, parseSave } from '../src/storage.js';
import { act } from './helpers/campaign.mjs';

const byProject = Object.fromEntries(PROJECTS.map(project => [project.id, project]));
const byFacility = Object.fromEntries(FACILITIES.map(facility => [facility.id, facility]));
const ordinary = PROJECTS.filter(project => !project.automatic);
function complete(state, ids) {
  for (const id of ids) Object.assign(state.projects[id], { completed: true, progress: 100, attempts: 1 });
}
function allBuildings(state) {
  for (const facility of FACILITIES) state.facilities[facility.buildingId] = Math.max(state.facilities[facility.buildingId] || 0, facility.level);
}
function upgradeFixture(id) {
  const state = createGame(), facility = byFacility[id];
  state.money = 1_000_000;
  allBuildings(state);
  state.facilities[facility.buildingId] = facility.level - 1;
  complete(state, ordinary.map(project => project.id));
  return state;
}

test('nineteen research groups uniquely own all ordinary technologies across five building categories', () => {
  assert.equal(FACILITIES.length, 19);
  assert.equal(new Set(FACILITIES.map(item => item.id)).size, FACILITIES.length);
  assert.deepEqual(BUILDING_CATEGORIES.map(item => item.id), ['workshop', 'furnace', 'machine_shop', 'arsenal', 'drill_ground']);
  assert.deepEqual(MILESTONES, []);
  for (const project of ordinary) {
    const group = byFacility[project.researchGroup];
    assert.ok(group, `${project.id} has a real research group`);
    assert.deepEqual(project.facilityRequirements, [group.id]);
    assert.ok(BUILDING_CATEGORIES.some(category => category.id === group.category));
    assert.ok(project.prerequisites.every(id => byProject[id]?.researchGroup === project.researchGroup), `${project.id} has only internal technology dependencies`);
    for (const alternatives of project.prerequisiteAny || []) assert.ok(alternatives.every(id => byProject[id]?.researchGroup === project.researchGroup));
    assert.deepEqual(project.milestoneRequirements, []);
  }
  assert.deepEqual(FACILITIES.flatMap(group => group.unlocks).toSorted(), ordinary.map(project => project.id).toSorted());
  for (const project of PROJECTS.filter(project => project.automatic)) assert.deepEqual(project.facilityRequirements, []);
});

test('the combined building and technology dependency graph is acyclic and every group is reachable', () => {
  const graph = new Map();
  for (const project of ordinary) graph.set(`p:${project.id}`, [...project.prerequisites, ...(project.prerequisiteAny || []).flat()].map(id => `p:${id}`).concat(project.facilityRequirements.map(id => `b:${id}`)));
  const empty = createGame();
  for (const facility of FACILITIES) {
    const info = getFacilityInfo(empty, facility.id);
    graph.set(`b:${facility.id}`, [...info.prerequisites, ...info.prerequisiteAny.flat()].map(id => `p:${id}`).concat(info.facilityRequirements.map(id => `b:${id}`)));
  }
  const completeNodes = new Set(), visiting = new Set();
  function visit(id) {
    assert.ok(graph.has(id), `unknown dependency ${id}`);
    assert.ok(!visiting.has(id), `cycle reaches ${id}`);
    if (completeNodes.has(id)) return;
    visiting.add(id);
    for (const dependency of graph.get(id)) visit(dependency);
    visiting.delete(id); completeNodes.add(id);
  }
  for (const id of graph.keys()) visit(id);
  const state = createGame();
  for (let sweep = 0; sweep < graph.size; sweep++) {
    let changed = false;
    for (const facility of FACILITIES) {
      if (!hasFacility(state, facility.id) && getFacilityInfo(state, facility.id).unlocked) {
        state.facilities[facility.buildingId] = facility.level;
        changed = true;
      }
    }
    for (const project of ordinary) if (!state.projects[project.id].completed && !getProjectInfo(state, project.id).locked) {
      complete(state, [project.id]); changed = true;
    }
    if (!changed) break;
  }
  assert.deepEqual(ordinary.filter(project => !state.projects[project.id].completed).map(project => project.id), []);
  assert.ok(FACILITIES.every(facility => hasFacility(state, facility.id)));
});

test('mechanical workshop II needs boring, planing, quality inspection and schooling together', () => {
  const required = ['boring_machine', 'planer', 'quality_control', 'school'];
  assert.deepEqual(byFacility.machine_shop_2.prerequisites.toSorted(), required.toSorted());
  for (const missing of required) {
    const state = upgradeFixture('machine_shop_2');
    state.projects[missing].completed = false; state.projects[missing].progress = 0;
    const info = getFacilityInfo(state, 'machine_shop_2');
    assert.equal(info.unlocked, false, missing);
    assert.equal(info.canBuild, false, missing);
    assert.ok(info.missingIds.includes(missing));
    const result = performAction(state, { type: 'build', id: 'machine_shop_2' });
    assert.ok(result.error); assert.equal(result.state, state);
  }
  assert.equal(getFacilityInfo(upgradeFixture('machine_shop_2'), 'machine_shop_2').canBuild, true);
});

test('direct construction combines all missing levels into one paid project and persists the highest level', () => {
  let state = upgradeFixture('machine_shop_2');
  state.facilities.machine_shop = 0;
  const original = structuredClone(state), info = getFacilityInfo(state, 'machine_shop_2');
  const expectedCost = byFacility.machine_shop.cost + byFacility.machine_shop_2.cost;
  assert.equal(info.canBuild, true);
  assert.equal(info.baseCost, byFacility.machine_shop_2.cost);
  assert.equal(info.cost, expectedCost);
  assert.deepEqual(info.constructionLevels.map(level => level.id), ['machine_shop', 'machine_shop_2']);
  assert.deepEqual(info.skippedLevels.map(level => level.id), ['machine_shop']);
  assert.deepEqual(state, original, 'previewing a target does not spend funds or build anything');
  const before = state.money, expenseCount = state.treasury.entries.length, spent = state.stats.spent;
  state = act(state, { type: 'build', id: 'machine_shop_2' });
  assert.equal(getFacilityLevel(state, 'machine_shop'), 2);
  assert.equal(state.money, before - expectedCost);
  assert.equal(state.stats.spent, spent + expectedCost);
  assert.equal(state.treasury.entries.length, expenseCount + 1);
  assert.equal(state.treasury.entries.at(-1).amount, expectedCost);
  assert.equal(state.teams.filter(team => team.usedTurn === state.turn).length, 1, 'combined work occupies one engineering team');
  assert.deepEqual(state.projects, original.projects, 'construction opens research groups without completing their technologies');
  assert.equal(isValidState(state), true);
  assert.equal(parseSave(JSON.stringify(state)).facilities.machine_shop, 2);
  assert.equal(hasFacility(state, 'machine_shop'), true);
  assert.equal(hasFacility(state, 'machine_shop_2'), true);
  assert.equal(hasFacility(state, 'machine_shop_3'), false);
  for (const id of ['machine_shop', 'machine_shop_2']) {
    const builtInfo = getFacilityInfo(state, id);
    assert.equal(builtInfo.cost, 0);
    assert.deepEqual(builtInfo.constructionLevels, []);
    assert.deepEqual(builtInfo.skippedLevels, []);
    const again = performAction(state, { type: 'build', id });
    assert.ok(again.error); assert.equal(again.state, state);
    assert.equal(again.state.money, state.money, 'duplicate nodes and lower target levels never charge or refund');
  }
});

test('furnace I can advance directly to III without researching the separate crucible steel branch', () => {
  let state = createGame();
  state.money = 150_000;
  Object.assign(state.facilities, { workshop: 2, furnace: 1, machine_shop: 2 });
  complete(state, ['bloomery', 'coking']);
  const info = getFacilityInfo(state, 'furnace_3');
  assert.equal(info.canBuild, true);
  assert.equal(info.cost, 106_000);
  assert.equal(info.baseCost, 64_000);
  assert.deepEqual(info.constructionLevels.map(level => level.id), ['furnace_2', 'furnace_3']);
  assert.deepEqual(info.skippedLevels.map(level => level.id), ['furnace_2']);
  assert.deepEqual(info.prerequisites, ['coking']);
  assert.deepEqual(info.facilityRequirements, ['machine_shop_2']);
  state = act(state, { type: 'build', id: 'furnace_3' });
  assert.equal(state.money, 44_000);
  assert.equal(state.facilities.furnace, 3);
  assert.equal(getProjectInfo(state, 'bessemer_steel').locked, false);
  assert.equal(getProjectInfo(state, 'wrought_iron').locked, false, 'the skipped level remains available for later research');
  for (const id of ['wrought_iron', 'crucible_steel', 'rolling_mill']) assert.equal(state.projects[id].completed, false);
});

test('direct upgrades still require every intermediate AND condition and a sufficient final alternative', () => {
  const base = upgradeFixture('machine_shop_3');
  base.facilities.machine_shop = 1;
  for (const id of ['boring_machine', 'planer', 'quality_control', 'school']) {
    const state = structuredClone(base);
    Object.assign(state.projects[id], { completed: false, progress: 0 });
    const info = getFacilityInfo(state, 'machine_shop_3');
    assert.equal(info.canBuild, false, `intermediate mechanical II still needs ${id}`);
    assert.ok(info.missingIds.includes(id));
    const result = performAction(state, { type: 'build', id: 'machine_shop_3' });
    assert.ok(result.error); assert.equal(result.state, state);
  }
  for (const id of ['crucible_steel', 'bessemer_steel']) Object.assign(base.projects[id], { completed: false, progress: 0 });
  assert.equal(getFacilityInfo(base, 'machine_shop_3').canBuild, false);
  for (const id of ['crucible_steel', 'bessemer_steel']) {
    const state = structuredClone(base); complete(state, [id]);
    assert.equal(getFacilityInfo(state, 'machine_shop_3').canBuild, true, `${id} supplies the required steel alternative`);
  }
});

test('combined construction retains cross-building prerequisites and checks the whole budget and team', () => {
  const base = upgradeFixture('arsenal_3');
  base.facilities.arsenal = 1;
  const expectedCost = byFacility.arsenal_2.cost + byFacility.arsenal_3.cost;
  assert.equal(getFacilityInfo(base, 'arsenal_3').cost, expectedCost);
  const missingMachine = structuredClone(base); missingMachine.facilities.machine_shop = 1;
  const machineInfo = getFacilityInfo(missingMachine, 'arsenal_3');
  assert.equal(machineInfo.canBuild, false);
  assert.ok(machineInfo.missingFacilities.includes('machine_shop_2'));
  const missingCartridge = structuredClone(base); missingCartridge.projects.paper_cartridges.completed = false;
  assert.equal(getFacilityInfo(missingCartridge, 'arsenal_3').canBuild, false, 'intermediate ammunition knowledge still applies');
  const poor = structuredClone(base); poor.money = expectedCost - 1;
  assert.ok(poor.money > byFacility.arsenal_3.cost, 'target level alone would be affordable');
  assert.equal(getFacilityInfo(poor, 'arsenal_3').canBuild, false);
  const busy = structuredClone(base); busy.teams.forEach(team => { team.usedTurn = busy.turn; });
  assert.equal(getFacilityInfo(busy, 'arsenal_3').canBuild, false);
  for (const state of [missingMachine, missingCartridge, poor, busy]) {
    const result = performAction(state, { type: 'build', id: 'arsenal_3' });
    assert.ok(result.error); assert.equal(result.state, state, 'a rejected aggregate project leaves all state unchanged');
  }
  const exact = structuredClone(base); exact.money = expectedCost;
  assert.equal(act(exact, { type: 'build', id: 'arsenal_3' }).money, 0, 'the exact combined cost is sufficient');
});

test('higher building levels preserve every lower group and upgrading alone adds no industrial output', () => {
  let state = upgradeFixture('machine_shop_2');
  for (const project of ordinary.filter(project => project.researchGroup === 'machine_shop')) {
    state.projects[project.id].completed = false; state.projects[project.id].progress = 0;
  }
  const roots = ordinary.filter(project => project.researchGroup === 'machine_shop' && !project.prerequisites.length);
  // Upgrading has separate project prerequisites; use an already-built higher level
  // to verify that lower-group availability does not disappear with its old card.
  state.facilities.machine_shop = 2;
  for (const project of roots) assert.equal(getProjectInfo(state, project.id).locked, false, project.id);
  assert.ok(roots.length > 0);
  state = upgradeFixture('machine_shop_2');
  const before = getCombatRating(state).industrialCapacity;
  state = act(state, { type: 'build', id: 'machine_shop_2' });
  assert.equal(getCombatRating(state).industrialCapacity, before);
});

test('alternative building requirements accept each sufficient route without demanding every alternative', () => {
  const alternatives = FACILITIES.filter(facility => facility.prerequisiteAny.length);
  assert.ok(alternatives.length > 0);
  for (const facility of alternatives) for (const group of facility.prerequisiteAny) {
    const base = upgradeFixture(facility.id);
    for (const id of group) { base.projects[id].completed = false; base.projects[id].progress = 0; }
    assert.equal(getFacilityInfo(base, facility.id).unlocked, false, `${facility.id}: no alternative`);
    for (const id of group) {
      const state = structuredClone(base); complete(state, [id]);
      assert.equal(getFacilityInfo(state, facility.id).unlocked, true, `${facility.id}: ${id} is sufficient`);
    }
  }
});

test('either steel route can reach advanced machine tools and steel armor without depending on the other steel route', () => {
  for (const forbidden of ['crucible_steel', 'bessemer_steel']) {
    const state = createGame();
    for (let sweep = 0; sweep < ordinary.length + FACILITIES.length; sweep++) {
      let changed = false;
      for (const facility of FACILITIES) if (!hasFacility(state, facility.id) && getFacilityInfo(state, facility.id).unlocked) {
        state.facilities[facility.buildingId] = facility.level; changed = true;
      }
      for (const project of ordinary) if (project.id !== forbidden && !state.projects[project.id].completed && !getProjectInfo(state, project.id).locked) {
        complete(state, [project.id]); changed = true;
      }
      if (!changed) break;
    }
    assert.equal(state.projects[forbidden].completed, false);
    const alternative = forbidden === 'crucible_steel' ? 'bessemer_steel' : 'crucible_steel';
    assert.equal(state.projects[alternative].completed, true);
    assert.equal(hasFacility(state, 'machine_shop_3'), true);
    assert.equal(hasFacility(state, 'steel_armory'), true);
    assert.equal(state.projects.precision_tools.completed, true);
    assert.equal(state.projects.steel_arms.completed, true);
  }
});

test('boring and planing retain independent industrial contributions instead of replacing each other', () => {
  assert.notEqual(byProject.boring_machine.family, byProject.planer.family);
  const state = createGame();
  complete(state, ['boring_machine']);
  const boring = getCombatRating(state).industrialCapacity;
  complete(state, ['planer']);
  const combined = getCombatRating(state);
  assert.equal(combined.industrialCapacity - boring, byProject.planer.capacity);
  assert.ok(combined.industries.some(item => item.projectId === 'boring_machine'));
  assert.ok(combined.industries.some(item => item.projectId === 'planer'));
});

test('saved facilities hold numeric building levels rather than one flag for each upgrade card', () => {
  const state = createGame();
  assert.deepEqual(Object.keys(state.facilities).toSorted(), [...new Set(FACILITIES.map(item => item.buildingId))].toSorted());
  allBuildings(state);
  assert.equal(state.facilities.machine_shop, 3);
  assert.equal(state.facilities.arsenal, 5);
  assert.equal(Object.hasOwn(state.facilities, 'machine_shop_2'), false);
  assert.equal(isValidState(state), true);
  assert.deepEqual(parseSave(JSON.stringify(state)).facilities, state.facilities);
  for (const level of [-1, .5, 4, true, '2']) {
    const broken = structuredClone(state); broken.facilities.machine_shop = level;
    assert.equal(isValidState(broken), false, String(level));
  }
});
