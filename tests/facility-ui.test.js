import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, getFacilityInfo, FACILITIES } from '../src/game.js';
import { BUILDING_FAMILIES, defaultFacilityTarget, facilityPage, facilityDialog } from '../src/facility-ui.js';
import { facilityArt } from '../src/settlement.js';

const buttons = (html, action) => [...html.matchAll(new RegExp(`<button\\b[^>]*data-action="${action}"[^>]*>[\\s\\S]*?<\\/button>`, 'g'))].map(match => match[0]);
const buttonId = html => html.match(/data-id="([^"]+)"/)[1];
const disabled = html => /<button\b[^>]*\bdisabled(?:[\s=>])/.test(html);
const section = (html, className) => {
  const result = html.match(new RegExp(`<section\\b[^>]*class="${className}"[^>]*>[\\s\\S]*?<\\/section>`))?.[0];
  assert.ok(result, `${className} must be present`);
  return result;
};
const complete = (state, ids) => {
  for (const id of ids) Object.assign(state.projects[id], { completed: true, progress: 100 });
};

test('the building gallery has one illustrated, inspectable entrance per family instead of per level', () => {
  const state = createGame(), html = facilityPage(state), entrances = buttons(html, 'facility-open');
  const expected = ['workshop', 'furnace', 'machine_shop', 'arsenal', 'metal_ammo_workshop', 'steel_armory', 'bronze_artillery', 'rifled_artillery', 'drill_ground'];
  assert.equal(FACILITIES.length, 19);
  assert.equal(BUILDING_FAMILIES.length, 9);
  assert.deepEqual(BUILDING_FAMILIES.map(family => family.id).toSorted(), expected.toSorted());
  assert.deepEqual(entrances.map(buttonId).toSorted(), expected.toSorted());
  assert.deepEqual(BUILDING_FAMILIES.flatMap(family => family.levels.map(level => level.id)).toSorted(), FACILITIES.map(facility => facility.id).toSorted());
  for (const entrance of entrances) {
    const family = BUILDING_FAMILIES.find(item => item.id === buttonId(entrance));
    const artwork = facilityArt(family.id);
    assert.ok(artwork, `${family.id} has a crop of the original town panorama`);
    assert.ok(entrance.includes(artwork), `${family.id} entrance uses its town district crop`);
    for (const target of family.levels) assert.ok(facilityDialog(state, target.id).includes(artwork), `${target.id} details keep the same panorama crop as its entrance`);
    assert.ok(entrance.includes(family.name));
    assert.match(entrance, /aria-label="[^"]*查看详情/);
    assert.equal(disabled(entrance), false, 'locked building details can still be opened');
    assert.match(entrance, family.id === 'workshop' ? /is-available/ : /is-unavailable/);
  }
  assert.match(html, /灰色：暂不可兴建或升级/);
  assert.equal(buttons(html, 'build').length, 0, 'the gallery opens details before a target is constructed');
});

test('every family dialog offers every target level, including locked and already built levels', () => {
  const state = createGame();
  state.facilities.arsenal = 3;
  for (const family of BUILDING_FAMILIES) for (const target of family.levels) {
    const html = facilityDialog(state, target.id), choices = buttons(html, 'facility-level');
    assert.deepEqual(choices.map(buttonId), family.levels.map(level => level.id));
    assert.ok(choices.every(choice => !disabled(choice)), 'unavailable targets remain selectable for inspection');
    assert.deepEqual(choices.filter(choice => /aria-pressed="true"/.test(choice)).map(buttonId), [target.id]);
    const builds = buttons(html, 'build');
    assert.equal(builds.length, 1);
    assert.equal(buttonId(builds[0]), target.id, 'the confirmation action uses the selected target record');
    assert.equal(disabled(builds[0]), !getFacilityInfo(state, target.id).canBuild);
  }
  assert.equal(facilityDialog(state, 'unknown-building'), '');
});

test('the default target follows available work, then the next missing level, then the completed maximum', () => {
  const state = createGame();
  assert.equal(defaultFacilityTarget(state, 'workshop'), 'workshop');
  assert.equal(defaultFacilityTarget(state, 'furnace'), 'furnace');
  state.facilities.workshop = 1;
  assert.equal(defaultFacilityTarget(state, 'workshop'), 'workshop_2', 'an unavailable next level can still be inspected');
  complete(state, ['bloomery']);
  assert.equal(getFacilityInfo(state, 'workshop_2').canBuild, true);
  assert.equal(defaultFacilityTarget(state, 'workshop'), 'workshop_2');
  state.facilities.workshop = 2;
  assert.equal(defaultFacilityTarget(state, 'workshop'), 'workshop_2');
  assert.equal(defaultFacilityTarget(state, 'unknown-building'), null);
});

test('a furnace I to III dialog shows the merged budget, conditions and research from both missing levels', () => {
  const state = createGame();
  state.money = 150_000;
  Object.assign(state.facilities, { workshop: 2, furnace: 1, machine_shop: 2 });
  complete(state, ['bloomery', 'coking']);
  const before = structuredClone(state), html = facilityDialog(state, 'furnace_3');
  assert.match(html, /当前已建至 Ⅰ 级/);
  assert.match(html, /合并营建 Ⅱ、Ⅲ 级，一次施工/);
  const cost = section(html, 'facility-cost-section');
  for (const value of ['4.2万 两', '6.4万 两', '10.6万 两', '营建后余 4.4万 两']) assert.ok(cost.includes(value));
  assert.doesNotMatch(cost, /炼铁炉场Ⅰ</, 'the existing first level is not charged again');
  const conditions = section(html, 'facility-condition-section');
  assert.match(conditions, /配套建筑 · 全部需要/);
  assert.match(conditions, /工艺 · 全部需要/);
  assert.match(conditions, /工艺 · 以下任选一项/);
  assert.deepEqual(buttons(conditions, 'facility-detail').map(buttonId), ['machine_shop_2']);
  const requiredTechnologyIds = buttons(conditions, 'select-tech').map(buttonId);
  for (const id of ['coking', 'bloomery', 'iron', 'coke_furnace', 'hot_blast']) assert.ok(requiredTechnologyIds.includes(id));
  assert.ok(!requiredTechnologyIds.includes('crucible_steel'), 'the optional steel branch is not presented as a requirement');
  const researchIds = buttons(section(html, 'facility-research-section'), 'select-tech').map(buttonId);
  const expectedResearch = FACILITIES.filter(facility => ['furnace_2', 'furnace_3'].includes(facility.id)).flatMap(facility => facility.unlocks);
  assert.deepEqual(researchIds.toSorted(), expectedResearch.toSorted());
  assert.equal(new Set(researchIds).size, researchIds.length);
  assert.equal(disabled(buttons(html, 'build')[0]), false);
  assert.match(buttons(html, 'build')[0], /合并营建 · 10\.6万 两/);
  assert.deepEqual(state, before, 'opening the dialog never changes funds, work assignments or completed buildings');
});

test('a combined machine project keeps intermediate AND requirements distinct from steel alternatives', () => {
  const state = createGame();
  state.facilities.machine_shop = 1;
  const conditions = section(facilityDialog(state, 'machine_shop_3'), 'facility-condition-section');
  const groups = [...conditions.matchAll(/<div class="facility-condition-group">[\s\S]*?<\/div><\/div>/g)].map(match => match[0]);
  const allRequired = groups.find(group => group.includes('工艺 · 全部需要'));
  const alternative = groups.find(group => group.includes('工艺 · 以下任选一项'));
  assert.ok(allRequired && alternative);
  assert.deepEqual(buttons(allRequired, 'select-tech').map(buttonId).toSorted(), ['boring_machine', 'planer', 'quality_control', 'school'].toSorted());
  assert.deepEqual(buttons(alternative, 'select-tech').map(buttonId).toSorted(), ['crucible_steel', 'bessemer_steel'].toSorted());
});

test('completed and unaffordable buildings retain inspectable levels with accurate status and budget', () => {
  const state = createGame();
  state.facilities.furnace = 3;
  const entrance = buttons(facilityPage(state), 'facility-open').find(item => buttonId(item) === 'furnace');
  assert.match(entrance, /is-complete/);
  assert.match(entrance, /当前Ⅲ级，已达最高等级/);
  assert.equal(disabled(entrance), false);
  const built = facilityDialog(state, 'furnace_2');
  assert.match(built, /当前已建至 Ⅲ 级/);
  assert.match(built, /本级已建成，已开放的研究始终保留/);
  assert.doesNotMatch(section(built, 'facility-cost-section'), /facility-cost-total|本次合计/);
  assert.equal(disabled(buttons(built, 'build')[0]), true);
  assert.deepEqual(buttons(section(built, 'facility-research-section'), 'select-tech').map(buttonId), FACILITIES.find(facility => facility.id === 'furnace_2').unlocks);

  state.money = 1_000;
  const unaffordable = facilityDialog(state, 'workshop');
  assert.match(unaffordable, /内库 1,000 两，尚缺 1\.5万 两/);
  assert.match(unaffordable, /资金不足/);
  assert.equal(disabled(buttons(unaffordable, 'build')[0]), true);
  assert.ok(buttons(unaffordable, 'facility-level').every(choice => !disabled(choice)));
});
