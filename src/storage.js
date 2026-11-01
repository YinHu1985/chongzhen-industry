import { PROJECTS, FACILITIES, createGame, getProjectInfo, getCombatRating } from './game.js';

const CAMPAIGN_TEMPLATES = new Map([24, 40, 64].map(maxTurns => [maxTurns, createGame({ maxTurns })]));
const INITIAL_STATE = CAMPAIGN_TEMPLATES.get(24);
const STATE_KEYS = Object.keys(INITIAL_STATE);
const BRANCHES = Object.keys(INITIAL_STATE.army);
const STAT_KEYS = Object.keys(INITIAL_STATE.stats);
const PROJECT_IDS = PROJECTS.map(project => project.id);
const FACILITY_IDS = FACILITIES.map(facility => facility.id);
const SPECIALTIES = ['math', 'metallurgy', 'mechanics', 'foreign', 'military', 'management'];
const DOCTRINE_IDS = ['cold', 'cuirassier', 'minie', 'breech'];
const STATUSES = ['playing', 'won', 'lost'];
const LOG_TYPES = ['info', 'success', 'warning', 'danger'];
const CHOICES = ['supply', 'dispatch', 'ignore'];
const MAX_SAVE_LENGTH = 2 * 1024 * 1024;
const MAX_MONEY = 100_000_000_000;
const MAX_EVENT_COST = 1_000_000;

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const integer = (value, min = 0, max = 1_000_000_000) => Number.isSafeInteger(value) && value >= min && value <= max;
const text = (value, max = 4000) => typeof value === 'string' && value.length > 0 && value.length <= max;
const exactKeys = (value, keys) => record(value) && Object.keys(value).length === keys.length
  && keys.every(key => Object.hasOwn(value, key));

function validProjects(state) {
  if (!exactKeys(state.projects, PROJECT_IDS)) return false;
  return PROJECTS.every(({ id, automatic }) => {
    const project = state.projects[id];
    return exactKeys(project, ['progress', 'completed', 'investedTurn', 'testedTurn', 'attempts'])
      && integer(project.progress, 0, 100)
      && typeof project.completed === 'boolean'
      && (!project.completed || project.progress === 100)
      && integer(project.investedTurn, 0, state.turn)
      && integer(project.testedTurn, 0, state.turn)
      && integer(project.attempts, 0, state.turn)
      && (automatic || id === 'joint_trials'
        ? project.attempts === 0 && project.investedTurn === 0 && project.testedTurn === 0
        : !project.completed || project.attempts > 0);
  });
}

function validTeams(state) {
  if (!Array.isArray(state.teams) || state.teams.length < 1 || state.teams.length > 8
    || !Array.isArray(state.candidates) || state.candidates.length > 3
    || !integer(state.nextTeamId, 1, 1_000_000) || !integer(state.recruitmentRound)) return false;
  const ids = new Set(), researchAssignments = new Set();
  return [...state.teams, ...state.candidates].every(team => {
    const keys = ['id', 'name', 'specialties', 'usedTurn', 'hireCost'];
    if (Object.hasOwn(team || {}, 'activity')) keys.push('activity');
    if (!exactKeys(team, keys)
      || typeof team.id !== 'string' || !/^team_[1-9]\d*$/.test(team.id)
      || ids.has(team.id) || !integer(Number(team.id.slice(5)), 1, state.nextTeamId - 1)
      || !text(team.name, 100) || !integer(team.usedTurn, 0, state.turn)
      || !integer(team.hireCost, 0, MAX_MONEY) || team.hireCost % 100 !== 0
      || !exactKeys(team.specialties, SPECIALTIES)
      || !SPECIALTIES.every(key => integer(team.specialties[key], 0, 100))) return false;
    const activity = team.activity;
    // An absent activity is simply a team with no tracked assignment.
    if (activity !== undefined && activity !== null) {
      if (state.candidates.includes(team) || !exactKeys(activity, ['kind', 'targetId', 'turn'])
        || !integer(activity.turn, 1, state.turn) || activity.turn !== team.usedTurn) return false;
      if (activity.kind === 'research') {
        if (!PROJECT_IDS.includes(activity.targetId) || activity.targetId === 'joint_trials'
          || state.projects[activity.targetId]?.investedTurn !== activity.turn
          || researchAssignments.has(activity.targetId)) return false;
        researchAssignments.add(activity.targetId);
      } else if (activity.kind === 'build') {
        if (!FACILITY_IDS.includes(activity.targetId) || state.facilities[activity.targetId] !== 1) return false;
      } else if (activity.kind === 'train') {
        if (!BRANCHES.includes(activity.targetId) || !(state.trainedTurn[activity.targetId] >= activity.turn)) return false;
      } else return false;
    }
    ids.add(team.id);
    return true;
  });
}

function validEvents(state) {
  const expectedEvents = CAMPAIGN_TEMPLATES.get(state.maxTurns).plannedEvents;
  if (!Array.isArray(state.plannedEvents) || state.plannedEvents.length !== expectedEvents.length
    || !Array.isArray(state.resolvedEvents) || state.resolvedEvents.length > expectedEvents.length
    || new Set(state.resolvedEvents).size !== state.resolvedEvents.length) return false;
  const ids = [];
  for (let index = 0; index < expectedEvents.length; index += 1) {
    const event = state.plannedEvents[index];
    const { id, turn, stage } = expectedEvents[index];
    if (!record(event) || event.id !== id || event.stage !== stage || event.turn !== turn
      || !text(event.title, 200) || !text(event.description)) return false;
    const canResolveOnEnding = turn === state.turn && (state.status === 'won'
      || (state.status === 'lost' && state.defeatReason === 'prestige'));
    if (!canResolveOnEnding && state.resolvedEvents.includes(id) !== (turn < state.turn)) return false;
    ids.push(id);
  }
  return state.resolvedEvents.every(id => ids.includes(id));
}

function validPending(state) {
  const pending = state.pending;
  if (pending === null) return true;
  if (!record(pending) || state.status !== 'playing' || !text(pending.title, 200) || !text(pending.description)) return false;
  if (pending.kind === 'rescue') {
    if (!PROJECT_IDS.includes(pending.projectId) || pending.projectId === 'joint_trials') return false;
    const project = state.projects[pending.projectId];
    return !project.completed && project.testedTurn === state.turn && project.attempts > 0
      && pending.cost === getProjectInfo(state, pending.projectId).rescueCost
      && integer(pending.successChance, 60, 95)
      && (pending.inviteCourt === undefined || typeof pending.inviteCourt === 'boolean');
  }
  if (pending.kind === 'event') {
    const event = state.plannedEvents.find(item => item.id === pending.id);
    if (!event || event.turn !== state.turn || pending.turn !== event.turn
      || state.resolvedEvents.includes(event.id) || !Array.isArray(pending.choices)
      || pending.choices.length !== CHOICES.length) return false;
    const ids = pending.choices.map(choice => record(choice) ? choice.id : null);
    if (new Set(ids).size !== CHOICES.length || !CHOICES.every(id => ids.includes(id))) return false;
    return pending.choices.every(choice => text(choice.label, 200) && text(choice.description)
      && integer(choice.cost, 0, MAX_EVENT_COST) && typeof choice.disabled === 'boolean'
      && (choice.successChance === undefined || integer(choice.successChance, 0, 100))
      && (choice.id !== 'ignore' || (choice.cost === 0 && choice.disabled === false)));
  }
  return false;
}

/** Validate only the current campaign schema; earlier prototypes are not migrated. */
export function isValidState(state) {
  try {
    const prestigeDefeat = state?.status === 'lost' && state?.defeatReason === 'prestige';
    const keys = Object.hasOwn(state || {}, 'defeatReason') ? [...STATE_KEYS, 'defeatReason'] : STATE_KEYS;
    if (!exactKeys(state, keys) || state.version !== 4 || !CAMPAIGN_TEMPLATES.has(state.maxTurns)
      || !integer(state.turn, 1, state.maxTurns) || !STATUSES.includes(state.status)
      || !DOCTRINE_IDS.includes(state.doctrine)
      || (Object.hasOwn(state, 'defeatReason') && !prestigeDefeat)
      || (prestigeDefeat ? state.reputation >= 0 : state.reputation < 0)
      || (state.status === 'lost' && !prestigeDefeat && state.turn !== state.maxTurns)
      || !integer(state.seed, 1, 0xffffffff) || !integer(state.rng, 1, 0xffffffff)
      || !integer(state.money, 0, MAX_MONEY) || !integer(state.reputation, -1_000_000_000)
      || !validTeams(state) || !integer(state.nextLogId, 1, 1_000_000)
      || !validProjects(state) || !exactKeys(state.facilities, FACILITY_IDS)
      || !FACILITIES.every(facility => integer(state.facilities[facility.id], 0, 1))
      || state.projects.joint_trials.completed !== (state.status === 'won')
      || !exactKeys(state.army, BRANCHES) || !BRANCHES.every(branch => integer(state.army[branch], 0, 100))
      || !record(state.trainedTurn)
      || !Object.entries(state.trainedTurn).every(([branch, turn]) => BRANCHES.includes(branch) && integer(turn, 0, state.turn))
      || !exactKeys(state.stats, STAT_KEYS)
      || !STAT_KEYS.every(key => integer(state.stats[key], 0, ['spent', 'earned'].includes(key) ? MAX_MONEY : 1_000_000_000))
      || !validEvents(state) || !validPending(state)
      || !Array.isArray(state.log) || state.log.length > 10_000) return false;
    const ids = new Set();
    for (const entry of state.log) {
      if (!record(entry) || !integer(entry.id, 1, state.nextLogId - 1) || ids.has(entry.id)
        || !integer(entry.turn, 1, state.turn) || !text(entry.title, 200)
        || !text(entry.text) || !LOG_TYPES.includes(entry.type)) return false;
      ids.add(entry.id);
    }
    const combatReady = getCombatRating(state).ready;
    if ((state.status === 'won' && !combatReady) || (state.status === 'lost' && !prestigeDefeat && combatReady)
      || (state.status === 'playing' && combatReady && state.pending === null)) return false;
    return true;
  } catch {
    return false;
  }
}

/** Accept exported { state, savedAt } JSON or plain-state JSON for v4 only. */
export function parseSave(raw) {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_SAVE_LENGTH) {
    throw new Error('存档为空、过大或格式不正确。');
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('存档不是有效的 JSON 文件。');
  }
  const state = record(parsed) && Object.hasOwn(parsed, 'state') ? parsed.state : parsed;
  // Old v4 research-method choices no longer affect technology or survive export.
  if (record(state?.projects)) for (const project of Object.values(state.projects)) {
    if (record(project) && ['standard', 'makeshift'].includes(project.method)) delete project.method;
  }
  if (!isValidState(state)) throw new Error('存档版本不兼容或数据不完整，无法载入。');
  return state;
}
