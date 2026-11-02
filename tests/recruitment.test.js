import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, performAction } from '../src/game.js';
import { parseSave } from '../src/storage.js';

const historicalPeople = {
  徐光启: ['foreign', 'management'],
  汤若望: ['math', 'foreign'],
  孙元化: ['mechanics', 'military'],
  宋应星: ['mechanics', 'metallurgy'],
  李之藻: ['mechanics', 'management'],
  方以智: ['math', 'metallurgy'],
};
const strongest = team => Object.keys(team.specialties).filter(key => team.specialties[key] >= 78).sort();
function act(state, action) {
  const result = performAction(state, action);
  assert.equal(result.error, undefined, result.message);
  return result.state;
}

test('the opening roster contains only the mathematics and military teams', () => {
  const { teams } = createGame();
  assert.deepEqual(teams.map(team => team.name), ['钦天监', '神机营']);
  assert.deepEqual(teams.map(strongest), [['math'], ['military']]);
  assert.ok(teams.every(team => team.activity === null && team.usedTurn === 0));
});

test('candidate rolls mix random teams and all six named people with their specified specialties', () => {
  const seenPeople = new Map(), ordinarySkills = new Set();
  let specialCount = 0, count = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const state = createGame({ seed: Math.imul(seed, 0x9e3779b9) >>> 0 });
    assert.equal(state.candidates.length, 3);
    const names = [...state.teams, ...state.candidates].map(team => team.name);
    assert.equal(new Set(names).size, names.length);
    for (const team of state.candidates) {
      count++;
      assert.doesNotMatch(team.name, /[\d-]/);
      const expected = historicalPeople[team.name];
      if (expected) {
        specialCount++;
        assert.deepEqual(strongest(team), [...expected].sort(), team.name);
        if (seenPeople.has(team.name)) assert.deepEqual(team.specialties, seenPeople.get(team.name));
        seenPeople.set(team.name, team.specialties);
      } else {
        assert.match(team.name, /研习社$/);
        assert.equal(strongest(team).length, 1);
        ordinarySkills.add(JSON.stringify(team.specialties));
      }
    }
  }
  assert.deepEqual([...seenPeople.keys()].sort(), Object.keys(historicalPeople).sort());
  assert.ok(specialCount / count > .2 && specialCount / count < .4, 'special candidates occur at roughly 30% per slot');
  assert.ok(ordinarySkills.size > 100, 'ordinary teams retain varied capabilities');
});

test('hired people cannot be cloned by refreshing, and the pool falls back to ordinary recruits when exhausted', () => {
  let state = createGame({ seed: 92741 });
  state.money = 1_000_000;
  const hired = new Set();
  for (let refresh = 0; refresh < 100 && hired.size < 6; refresh++) {
    const names = [...state.teams, ...state.candidates].map(team => team.name);
    assert.equal(new Set(names).size, names.length);
    for (const candidate of [...state.candidates]) {
      assert.ok(!hired.has(candidate.name));
      if (historicalPeople[candidate.name]) {
        state = act(state, { type: 'hireTeam', teamId: candidate.id });
        hired.add(candidate.name);
      }
    }
    state = act(state, { type: 'refreshCandidates' });
  }
  assert.equal(hired.size, 6);
  assert.equal(state.teams.length, 8);
  for (let refresh = 0; refresh < 10; refresh++) {
    assert.ok(state.candidates.every(team => !historicalPeople[team.name]));
    assert.equal(new Set(state.candidates.map(team => team.name)).size, 3);
    state = act(state, { type: 'refreshCandidates' });
  }
});

test('recruitment is reproducible across saved games and keeps generated names free of number suffixes', () => {
  let state = createGame({ seed: 932018 });
  state.money = 500_000;
  for (let refresh = 0; refresh < 30; refresh++) {
    const restored = parseSave(JSON.stringify(state));
    assert.ok(restored);
    const before = JSON.stringify(state);
    const next = act(state, { type: 'refreshCandidates' });
    assert.equal(JSON.stringify(state), before);
    assert.deepEqual(next, act(restored, { type: 'refreshCandidates' }));
    assert.ok(next.candidates.every(team => !/[\d-]/.test(team.name)));
    state = next;
  }
});
