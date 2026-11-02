import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, performAction, getProjectInfo, getTeamActivity, PROJECTS, FACILITIES, BUILDING_CATEGORIES } from '../src/game.js';
import { researchBoard, researchCards, researchStatus, milestonePopup, researchSelection, selectResearchTeam, selectResearchTechnology, layoutResearchGroup } from '../src/tech-tree.js';
import { technologyArt } from '../src/artwork.js';

const CATEGORIES = BUILDING_CATEGORIES.map(category => category.id);
const categoryOf = project => FACILITIES.find(group => group.id === project.researchGroup).category;
const ui = category => ({ techCategory: category, techQuery: '', techSelection: null, selectedResearchTeamId: null });
const icons = { icon: () => '' };
const cardTags = html => [...html.matchAll(/<button\b[^>]*class="[^"]*\bresearch-card\b[^>]*>/g)].map(match => match[0]);
const ids = html => cardTags(html).map(tag => tag.match(/data-id="([^"]+)"/)[1]);

test('five building categories partition every ordinary project and exclude automatic victory', () => {
  const state = createGame();
  const all = CATEGORIES.flatMap(category => {
    const cards = researchCards(state, category);
    assert.ok(cards.length > 0, `${category} should contain research`);
    assert.ok(cards.every(card => categoryOf(card.project) === category));
    assert.ok(cards.every(card => card.project.id === card.info.id));
    return cards.map(card => card.project.id);
  });
  assert.equal(new Set(all).size, all.length, 'a project must belong to one category');
  const expected = PROJECTS.filter(project => !project.automatic && project.id !== 'joint_trials').map(project => project.id);
  assert.deepEqual(all.toSorted(), expected.toSorted());
  assert.deepEqual(researchCards(state, 'unknown').map(card => card.project.id), researchCards(state, 'workshop').map(card => card.project.id));
});

test('completed, locked, queued and test-ready work have distinct status priority', () => {
  const state = createGame();
  const status = info => researchStatus({ completed: false, locked: false, investedTurn: 0, canTest: false, canInvest: true, ...info }, state).id;
  assert.equal(status({ completed: true, locked: true, investedTurn: state.turn, canTest: true }), 'completed');
  assert.equal(status({ locked: true, investedTurn: state.turn, canTest: true }), 'locked');
  assert.equal(status({ isAssigned: true, progress: 50, canTest: true }), 'queued');
  assert.equal(status({ isAssigned: true, progress: 100, canTest: true }), 'ready');
  assert.equal(status({ canTest: true }), 'ready');
  assert.equal(status({ canInvest: false }), 'waiting');
  assert.equal(status({}), 'available');
});

test('doctrine changes combat priorities without hiding research cards or alternative equipment', () => {
  let baseline;
  for (const doctrine of ['cold', 'cuirassier', 'minie', 'breech']) {
    const state = createGame(); state.doctrine = doctrine;
    const rendered = CATEGORIES.flatMap(category => ids(researchBoard(state, ui(category), icons)));
    if (baseline) assert.deepEqual(rendered, baseline); else baseline = rendered;
  }
  for (const id of ['minie_rifle', 'breech_rifle', 'napoleon_gun', 'armstrong_gun', 'cuirassier']) {
    assert.ok(baseline.includes(id), `optional equipment ${id} must remain available in the research catalogue`);
  }
});

test('building groups replace milestones and keep every locked technology inspectable', () => {
  const state = createGame();
  for (const category of CATEGORIES) {
    const html = researchBoard(state, ui(category), icons);
    const rendered = [...html.matchAll(/data-research-group="([^"]+)"/g)].map(match => match[1]);
    assert.deepEqual(rendered.toSorted(), FACILITIES.filter(group => group.category === category).map(group => group.id).toSorted());
    assert.ok(!ids(html).includes('joint_trials'));
    assert.ok(!cardTags(html).some(tag => /\bdisabled\b/.test(tag)), 'locked technologies remain inspectable');
    assert.doesNotMatch(html, /research-milestones|milestone-popup|select-milestone/);
  }
  assert.equal(milestonePopup(state, 'foundations', icons), '');
});

test('finishing one family member preserves completed work and every higher or alternate research card', () => {
  const state = createGame();
  const candidate = PROJECTS.find(project => project.family && !project.automatic
    && PROJECTS.some(other => other.family === project.family && other.level > project.level));
  assert.ok(candidate, 'the catalogue must include graded families');
  const before = researchCards(state, categoryOf(candidate)).map(card => card.project.id);
  state.projects[candidate.id] = { ...state.projects[candidate.id], completed: true, progress: 100, attempts: 1, testedTurn: state.turn };
  const after = researchCards(state, categoryOf(candidate));
  assert.deepEqual(after.map(card => card.project.id), before);
  assert.equal(after.find(card => card.project.id === candidate.id).status.id, 'completed');
  const higher = PROJECTS.filter(project => project.family === candidate.family && project.level > candidate.level);
  for (const project of higher) assert.ok(researchCards(state, categoryOf(project)).some(card => card.project.id === project.id), `higher grade ${project.id} remains visible in its building category`);
});

test('locked, queued and completed technologies retain their card illustrations when browsing or searching', () => {
  const state = createGame();
  const workshopProjects = PROJECTS.filter(project => project.researchGroup === 'workshop');
  const [completed, queued] = workshopProjects;
  state.projects[completed.id] = { ...state.projects[completed.id], completed: true, progress: 100, attempts: 1, testedTurn: state.turn };
  state.facilities.workshop = 1;
  state.teams[0].activity = { kind: 'research', targetId: queued.id, turn: state.turn };
  assert.equal(researchStatus(getProjectInfo(state, completed.id), state).id, 'completed');
  assert.equal(researchStatus(getProjectInfo(state, queued.id), state).id, 'queued');
  assert.ok(CATEGORIES.some(category => researchCards(state, category).some(card => card.status.id === 'locked')));
  for (const category of CATEGORIES) {
    const categoryProjects = researchCards(state, category).map(card => card.project);
    const searchTarget = categoryProjects[0];
    for (const techQuery of ['', searchTarget.name]) {
      const html = researchBoard(state, { ...ui(category), techQuery, techSelection: queued.id }, icons);
      const cards = [...html.matchAll(/<button\b[^>]*data-action="select-tech"[^>]*data-id="([^"]+)"[^>]*>[\s\S]*?<\/button>/g)];
      const renderedIds = cards.map(card => card[1]);
      if (!techQuery) assert.deepEqual(renderedIds.toSorted(), categoryProjects.map(project => project.id).toSorted());
      else for (const project of categoryProjects.filter(project => project.researchGroup === searchTarget.researchGroup)) {
        assert.ok(renderedIds.includes(project.id), 'search preserves the matching building group context');
      }
      for (const [card, id] of cards) {
        assert.ok(card.includes(`src="${technologyArt(id)}"`), `${id} keeps its image regardless of status or search matching`);
      }
    }
  }
});


test('unlocked research can be scheduled without current funds but still needs an eligible team', () => {
  const state = performAction(createGame(), { type: 'build', id: 'workshop' }).state;
  const project = researchCards(state, 'workshop').find(card => card.info.canInvest).project;
  const busy = structuredClone(state);
  busy.teams.forEach(team => { team.usedTurn = busy.turn; });
  assert.equal(researchStatus(getProjectInfo(busy, project.id), busy).label, '待团队');
  const poor = structuredClone(state); poor.money = 0;
  assert.equal(researchStatus(getProjectInfo(poor, project.id), poor).id, 'available');
  assert.equal(getProjectInfo(poor, project.id).canInvest, true);
});

test('group DAG layouts contain each local technology once with forward dependency edges and no overlapping nodes', () => {
  for (const group of FACILITIES) {
    const projects = PROJECTS.filter(project => project.researchGroup === group.id);
    const layout = layoutResearchGroup(group, projects);
    assert.deepEqual(layout.nodes.filter(node => node.kind === 'technology').map(node => node.id).toSorted(), projects.map(project => project.id).toSorted());
    const nodes = new Map(layout.nodes.map(node => [node.id, node]));
    for (const edge of layout.edges) {
      assert.ok(nodes.has(edge.from) && nodes.has(edge.to));
      assert.ok(nodes.get(edge.from).rank < nodes.get(edge.to).rank, `${group.id}: ${edge.from} precedes ${edge.to}`);
    }
    for (const node of layout.nodes) {
      assert.ok(node.x >= 0 && node.y >= 0);
      assert.ok(node.x + node.width <= layout.width);
      assert.ok(node.y + node.height <= layout.height);
      for (const other of layout.nodes) if (node !== other) {
        const overlaps = node.x < other.x + other.width && node.x + node.width > other.x && node.y < other.y + other.height && node.y + node.height > other.y;
        assert.equal(overlaps, false, `${group.id}: ${node.id} overlaps ${other.id}`);
      }
    }
  }
});

test('repeated building unlock nodes keep unique DOM identities and show every shared condition', () => {
  const state = createGame();
  const html = CATEGORIES.map(category => researchBoard(state, ui(category), icons)).join('');
  const nodes = [...html.matchAll(/<button\b[^>]*class="research-building-node[^>]*>[\s\S]*?<\/button>/g)].map(match => match[0]);
  const ids = nodes.map(node => node.match(/id="([^"]+)"/)[1]);
  assert.equal(new Set(ids).size, ids.length);
  const machineUpgrades = nodes.filter(node => /data-id="machine_shop_2"/.test(node));
  assert.ok(machineUpgrades.length >= 2, 'mechanical II appears after both the school and machine group conditions');
  for (const node of machineUpgrades) {
    for (const id of ['boring_machine', 'planer', 'quality_control', 'school']) assert.ok(node.includes(PROJECTS.find(project => project.id === id).name));
    assert.match(node, /以下条件全部满足/);
    assert.match(node, /data-action="facility-detail"/);
    assert.doesNotMatch(node, /data-action="build"/);
  }
  const furnace = FACILITIES.find(group => group.id === 'furnace');
  const graph = layoutResearchGroup(furnace, PROJECTS.filter(project => project.researchGroup === furnace.id));
  assert.ok(graph.edges.some(edge => edge.to === 'hot_blast' && edge.from === 'coking' && edge.kind === 'required'));
  assert.ok(graph.edges.some(edge => edge.to === 'hot_blast' && edge.from === 'iron' && edge.kind === 'any'));
  assert.ok(graph.edges.some(edge => edge.to === 'hot_blast' && edge.from === 'coke_furnace' && edge.kind === 'any'));
});

test('a direct furnace upgrade shows the combined price and intermediate conditions at every research entrance', () => {
  const state = createGame();
  state.money = 150_000;
  Object.assign(state.facilities, { workshop: 2, furnace: 1, machine_shop: 2 });
  for (const id of ['bloomery', 'coking']) Object.assign(state.projects[id], { completed: true, progress: 100 });
  const html = CATEGORIES.map(category => researchBoard(state, ui(category), icons)).join('');
  const nodes = [...html.matchAll(/<button\b[^>]*class="research-building-node[^>]*data-id="furnace_3"[^>]*>[\s\S]*?<\/button>/g)].map(match => match[0]);
  assert.ok(nodes.length > 0);
  for (const node of nodes) {
    assert.match(node, /本次营建总价 10\.6万 两/);
    assert.match(node, /包含炼铁炉场Ⅱ、炼铁炉场Ⅲ/);
    assert.match(node, /任选其一/);
    assert.ok(node.includes(PROJECTS.find(project => project.id === 'coking').name));
    assert.match(node, /建筑均需：机械工场Ⅱ/);
    assert.doesNotMatch(node, /建筑均需：炼铁炉场Ⅱ/, 'the included intermediate level must not be presented as an existing-building requirement');
    assert.match(node, /data-action="facility-detail"/);
  }
  const group = html.match(/<section\b[^>]*data-research-group="furnace_3"[^>]*>[\s\S]*?<\/section>/)?.[0];
  assert.ok(group, 'the target group retains its own entrance');
  assert.match(group, /合并营建/);
  assert.match(group, /10\.6万/);
});

const act = (state, action) => {
  const result = performAction(state, action);
  assert.equal(result.error, undefined, `${action.type}: ${result.error || result.message}`);
  return result.state;
};
const workshop = () => act(createGame({seed:12345}), {type:'build',id:'workshop'});
const actionButton = (html, action) => [...html.matchAll(/<button\b[^>]*>/g)].map(match => match[0]).find(tag => tag.includes(`data-action="${action}"`));

function twoResearchTeams() {
  let state = act(workshop(), {type:'endTurn'});
  Object.assign(state.projects.school, {completed:true,progress:100});
  state.facilities.drill_ground = 1;
  const first = state.teams[0].id, second = state.teams[1].id;
  state = act(state, {type:'invest',id:'survey',teamId:first});
  state = act(state, {type:'invest',id:'officer_school',teamId:second});
  return {state,first,second};
}

test('team-first selection keeps the chosen team while browsing unassigned technology without assigning work', () => {
  const state = workshop(), originalState = structuredClone(state), initial = ui('workshop');
  const teamId = state.teams.find(team => getTeamActivity(state, team.id).available).id;
  const teamOnly = selectResearchTeam(state, initial, teamId);
  assert.deepEqual(initial, ui('workshop'), 'selection must not mutate its input UI');
  assert.equal(teamOnly.selectedResearchTeamId, teamId);
  assert.equal(teamOnly.techSelection, null);
  const selected = selectResearchTechnology(state, teamOnly, 'standards');
  assert.equal(teamOnly.techSelection, null, 'browsing must return a new selection');
  assert.equal(selected.selectedResearchTeamId, teamId);
  assert.equal(selected.techSelection, 'standards');
  const pair = researchSelection(state, selected);
  assert.equal(pair.teamId, teamId);
  assert.equal(pair.projectId, 'standards');
  assert.deepEqual(state, originalState, 'previewing the pair spends nothing and assigns no task');
  const html = researchBoard(state, selected, icons);
  const invest = actionButton(html, 'invest');
  assert.ok(invest, 'selected project must expose a research action');
  assert.match(invest, new RegExp(`data-team-id="${teamId}"`));
  assert.ok(!/\bdisabled\b/.test(invest));
  assert.match(html, /data-project-id="standards"/);
  assert.match(html, new RegExp(`data-team-id="${teamId}"`));
  for (const name of ['detail-team', 'detail-overview', 'detail-background']) assert.ok(html.includes(name), `${name} stays present`);
  assert.ok(!/<select\b|data-action="method"|method-control|土法速成|正规工艺/.test(html), 'research has no team dropdown or method toggle');
});

test('active team and active technology selections follow each other across categories and seasons', () => {
  let {state,first,second} = twoResearchTeams();
  for (const nextSeason of [false, true]) {
    if (nextSeason) state = act(state, {type:'endTurn'});
    const before = structuredClone(state);
    let selected = selectResearchTeam(state, {...ui('workshop'),techSelection:'standards'}, second);
    assert.equal(selected.techSelection, 'officer_school');
    assert.equal(selected.techCategory, 'drill_ground');
    assert.equal(selected.selectedResearchTeamId, second);
    selected = selectResearchTechnology(state, selected, 'survey');
    assert.equal(selected.techSelection, 'survey');
    assert.equal(selected.techCategory, 'workshop');
    assert.equal(selected.selectedResearchTeamId, first, 'clicking active technology follows its actual owner');
    const html = researchBoard(state, selected, icons);
    assert.match(html, /data-project-id="survey"/);
    assert.match(html, new RegExp(`data-team-id="${first}"`));
    selected = selectResearchTechnology(state, selected, 'officer_school');
    assert.equal(selected.selectedResearchTeamId, second);
    assert.deepEqual(state, before, 'switching active pairs never reassigns a project');
  }
});

test('unassigned or busy selections never silently substitute an available research team', () => {
  const state = workshop();
  const unassigned = selectResearchTechnology(state, ui('workshop'), 'survey');
  assert.equal(unassigned.selectedResearchTeamId, null);
  assert.equal(researchSelection(state, unassigned).teamId, null);
  assert.match(actionButton(researchBoard(state, unassigned, icons), 'invest'), /\bdisabled\b/);
  const builder = state.teams.find(team => getTeamActivity(state, team.id).kind === 'build');
  assert.ok(builder);
  const chosen = selectResearchTechnology(state, selectResearchTeam(state, ui('workshop'), builder.id), 'survey');
  assert.equal(chosen.selectedResearchTeamId, builder.id);
  const invest = actionButton(researchBoard(state, chosen, icons), 'invest');
  assert.match(invest, new RegExp(`data-team-id="${builder.id}"`));
  assert.match(invest, /\bdisabled\b/);
  assert.ok(state.teams.some(team => team.usedTurn !== state.turn), 'another team is available but must not replace the selected one');
});

test('research trials remain available at full preparation when their original team is free to change targets', () => {
  let state = workshop();
  const teamId = state.teams.find(team => getTeamActivity(state, team.id).available).id;
  state = act(state, {type:'invest',id:'standards',teamId});
  // The UI must gate trials by project readiness, not the team's seasonal availability.
  state.projects.standards.progress = 100;
  const selected = selectResearchTechnology(state, ui('workshop'), 'standards');
  assert.equal(selected.selectedResearchTeamId, teamId);
  assert.equal(getTeamActivity(state, teamId).queued, false);
  const html = researchBoard(state, selected, icons);
  assert.match(actionButton(html, 'invest'), /\bdisabled\b/);
  assert.ok(!/\bdisabled\b/.test(actionButton(html, 'test')));
});

test('idle, construction and completed-task teams keep their information beside empty technology columns', () => {
  const fresh = createGame(), built = workshop();
  const builder = built.teams.find(team => getTeamActivity(built, team.id).kind === 'build');
  const {state:researched,first} = twoResearchTeams();
  researched.projects.survey.completed = true;
  researched.projects.survey.progress = 100;
  for (const [state,teamId] of [[fresh,fresh.teams[0].id],[built,builder.id],[researched,first]]) {
    const selected = selectResearchTeam(state, {...ui('workshop'),techSelection:'survey'}, teamId);
    assert.equal(selected.techSelection, null);
    assert.equal(selected.selectedResearchTeamId, teamId);
    const pair = researchSelection(state, selected);
    assert.equal(pair.projectId, null);
    assert.equal(pair.team.id, teamId);
    const html = researchBoard(state, selected, icons);
    assert.match(html, /data-empty-research="true"/);
    assert.match(html, new RegExp(`data-team-id="${teamId}"`));
    assert.ok(html.includes(pair.team.name));
    assert.ok(!html.includes('data-project-id='), 'nonresearch activities must not open a stale technology');
    assert.ok(html.includes('detail-overview') && html.includes('detail-background'), 'both empty technology columns remain in place');
    for (const action of ['invest', 'test']) assert.match(actionButton(html, action), /\bdisabled\b/, 'empty team controls must not dispatch a stale project');
  }
});

const detailSection = (html, name) => {
  const match = html.match(new RegExp(`<section\\b[^>]*class="[^"]*\\b${name}\\b[^"]*"[^>]*>[\\s\\S]*?<\\/section>`));
  assert.ok(match, `${name} must remain a standalone detail column`);
  return match[0];
};
const escapedText = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

test('research controls stay beside the selected team while technology background stays factual and always open', () => {
  const state = workshop();
  const teamOnly = selectResearchTeam(state, ui('workshop'), state.teams[0].id);
  for (const project of PROJECTS.filter(project => !project.automatic)) {
    const selected = selectResearchTechnology(state, teamOnly, project.id);
    const html = researchBoard(state, selected, icons);
    const team = detailSection(html, 'detail-team');
    const overview = detailSection(html, 'detail-overview');
    const background = detailSection(html, 'detail-background');
    for (const action of ['invest', 'test']) {
      assert.ok(actionButton(team, action), `${project.id}: ${action} belongs with its team`);
      assert.equal(actionButton(overview, action), undefined);
      assert.equal(actionButton(background, action), undefined);
    }
    assert.ok(!html.includes('class="detail-operation'), 'progress no longer occupies a separate column');
    const effect = overview.match(/<p class="detail-contribution">([^<]+)<\/p>/)?.[1];
    assert.ok(effect, `${project.id}: gameplay effects remain in technology details`);
    for (const field of ['description', 'technical', 'historical']) {
      assert.ok(background.includes(escapedText(project[field])), `${project.id}: background must show ${field} without expanding a disclosure`);
    }
    assert.ok(!/<details\b|<summary\b|<button\b|data-action=/.test(background), `${project.id}: background is directly readable, without gameplay controls`);
    assert.ok(!background.includes(effect), `${project.id}: gameplay effects must not leak into background`);
    if (project.lore && ![project.description, project.technical, project.historical].includes(project.lore)) {
      assert.ok(!background.includes(escapedText(project.lore)), `${project.id}: old narrator commentary must not return`);
    }
  }
});


test('queued research presents recurring cost, cancellation and a target change without pretending it spent money', () => {
  let state = workshop();
  const teamId = state.teams.find(team => getTeamActivity(state, team.id).available).id;
  const before = state.money;
  state = act(state, { type: 'invest', id: 'survey', teamId });
  assert.equal(state.money, before);
  const selected = selectResearchTechnology(state, ui('workshop'), 'survey');
  const html = researchBoard(state, selected, icons);
  assert.match(html, /持续研究中/);
  assert.match(html, /每季 [^<]*两/);
  assert.match(actionButton(html, 'invest'), /\bdisabled\b/);
  assert.ok(!/\bdisabled\b/.test(actionButton(html, 'cancel-research')));
  const other = selectResearchTechnology(state, selected, 'standards');
  const changed = researchBoard(state, other, icons);
  assert.match(changed, /更换目标/);
  assert.ok(!/\bdisabled\b/.test(actionButton(changed, 'invest')));
});

test('research trials with partial preparation need no selected team and may repeat within a season', () => {
  const state = workshop();
  state.projects.survey.progress = 10;
  state.projects.survey.testedTurn = state.turn;
  state.teams.forEach(team => { team.usedTurn = state.turn; });
  const selected = selectResearchTechnology(state, ui('workshop'), 'survey');
  assert.equal(selected.selectedResearchTeamId, null);
  const html = researchBoard(state, selected, icons);
  assert.match(actionButton(html, 'invest'), /\bdisabled\b/);
  assert.ok(!/\bdisabled\b/.test(actionButton(html, 'test')));
  assert.match(html, /验收无需团队/);
});
