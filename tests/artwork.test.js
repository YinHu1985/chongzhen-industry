import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PROJECTS, SPECIALTIES, FACILITIES, BUILDING_CATEGORIES, createGame } from '../src/game.js';
import { technologyArt, dominantSpecialty, teamPortrait } from '../src/artwork.js';
import { teamRail, techDetails, researchBoard } from '../src/tech-tree.js';
import { teamsPage } from '../src/campaign-ui.js';
import { icon } from '../src/icons.js';

const assetFile = relativePath => new URL(`../${relativePath}`, import.meta.url);
const strengths = (strongest, value = 95) => Object.fromEntries(SPECIALTIES.map(specialty => [specialty.id, specialty.id === strongest ? value : 30]));
const portraitImages = html => [...html.matchAll(/<img\b[^>]*src="(\.\/assets\/portraits\/[^"]+)"[^>]*>/g)].map(match => match[1]);

test('team portraits follow the highest specialty and resolve tied abilities consistently', () => {
  assert.equal(dominantSpecialty(null), null);
  assert.equal(teamPortrait(null), '');
  for (const specialty of SPECIALTIES) {
    const team = { specialties: strengths(specialty.id) };
    assert.equal(dominantSpecialty(team).id, specialty.id);
    assert.deepEqual(portraitImages(teamPortrait(team)), [`./assets/portraits/${specialty.id}.jpg`]);
  }
  const equal = Object.fromEntries(SPECIALTIES.toReversed().map(specialty => [specialty.id, 80]));
  assert.equal(dominantSpecialty({ specialties: equal }).id, SPECIALTIES[0].id, 'ties follow the display order rather than object insertion order');
  equal[SPECIALTIES.at(-1).id] = 81;
  assert.equal(dominantSpecialty({ specialties: equal }).id, SPECIALTIES.at(-1).id, 'an increased ability updates the portrait');
});

test('the same specialty portraits appear in the research rail, selected details, roster and candidate list', () => {
  const state = createGame();
  const base = state.teams[0];
  state.teams = SPECIALTIES.map((specialty, index) => ({ ...base, id: `team_${index + 1}`, name: `${specialty.name}团队`, specialties: strengths(specialty.id) }));
  state.candidates = SPECIALTIES.map((specialty, index) => ({ ...base, id: `team_${index + 7}`, name: `${specialty.name}候选`, specialties: strengths(specialty.id) }));
  const expected = SPECIALTIES.map(specialty => `./assets/portraits/${specialty.id}.jpg`);
  assert.deepEqual(portraitImages(teamRail(state, {}, icon)), expected);
  assert.deepEqual(portraitImages(teamsPage(state, 'roster')), expected);
  assert.deepEqual(portraitImages(teamsPage(state, 'recruit')), expected);
  for (const team of state.teams) {
    const portrait = `./assets/portraits/${dominantSpecialty(team).id}.jpg`;
    assert.deepEqual(portraitImages(techDetails(state, null, { icon, teamId: team.id })), [portrait], 'idle team details retain their portrait');
    assert.deepEqual(portraitImages(techDetails(state, 'survey', { icon, teamId: team.id })), [portrait], 'technology selection does not replace the chosen team portrait');
  }
});

test('every technology has its own delivered illustration and all six portrait assets are valid JPEG files', () => {
  assert.equal(PROJECTS.length, 52);
  const technologyPaths = PROJECTS.map(project => technologyArt(project.id));
  assert.equal(new Set(technologyPaths).size, PROJECTS.length);
  assert.equal(technologyArt('unknown-project'), null);
  assert.equal(technologyArt('../private-file'), null);
  const portraitPaths = SPECIALTIES.map(specialty => `./assets/portraits/${specialty.id}.jpg`);
  const paths = [...technologyPaths, ...portraitPaths];
  const missing = paths.filter(path => !existsSync(assetFile(path)));
  assert.deepEqual(missing, [], 'all referenced production artwork must ship with the static site');
  const hashes = paths.map(path => {
    const bytes = readFileSync(assetFile(path));
    assert.ok(bytes.length > 1024, `${path} should contain an actual illustration`);
    assert.equal(bytes.readUInt16BE(0), 0xffd8, `${path} must be a JPEG`);
    return createHash('sha256').update(bytes).digest('hex');
  });
  assert.equal(new Set(hashes).size, paths.length, 'distinct technologies and specialties should not share a placeholder image');
});

test('every technology card across all five building tabs and its selected details show the matching independent illustration', () => {
  const state = createGame();
  const illustratedCards = new Map();
  for (const {id: category} of BUILDING_CATEGORIES) {
    const html = researchBoard(state, { techCategory: category }, { icon });
    for (const project of PROJECTS.filter(item => !item.automatic && FACILITIES.find(group => group.id === item.researchGroup)?.category === category)) {
      const card = html.match(new RegExp(`<button\\b[^>]*data-action="select-tech"[^>]*data-id="${project.id}"[^>]*>[\\s\\S]*?<\\/button>`))?.[0];
      assert.ok(card, `${project.id} remains visible`);
      const cardImages = [...card.matchAll(/<img\b[^>]*src="([^"]+)"[^>]*>/g)].map(match => match[1]);
      assert.deepEqual(cardImages, [technologyArt(project.id)], `${category}: ${project.id} must show its own illustration inside its card`);
      assert.ok(!illustratedCards.has(project.id), `${project.id} should appear in only one building tab`);
      illustratedCards.set(project.id, cardImages[0]);
      assert.match(card, /research-card-status/, 'status has a text label as well as visual treatment');
      const details = techDetails(state, project.id, { icon });
      const background = details.match(/<section class="detail-background"[^>]*>[\s\S]*?<\/section>/)?.[0];
      assert.ok(background?.includes(`src="${technologyArt(project.id)}"`));
      assert.ok(background.includes(project.description), 'background remains text rather than being baked into an image');
    }
  }
  const expectedProjects = PROJECTS.filter(project => !project.automatic).map(project => project.id).toSorted();
  assert.equal(BUILDING_CATEGORIES.length, 5);
  assert.deepEqual([...illustratedCards.keys()].toSorted(), expectedProjects, 'every ordinary technology has a visible illustrated card');
  assert.equal(new Set(illustratedCards.values()).size, expectedProjects.length, 'cards must not substitute a shared generic image');
});

test('research navigation uses the five building categories instead of the removed milestone strip', () => {
  const html = researchBoard(createGame(), {}, { icon });
  for (const category of BUILDING_CATEGORIES) {
    assert.ok(html.includes(`data-category="${category.id}"`));
    assert.ok(html.includes(category.name));
  }
  assert.doesNotMatch(html, /data-milestone=|research-milestones|select-milestone/);
});
