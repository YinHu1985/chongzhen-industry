import { FRONTS, FRONT_DEFEAT_PRIORITY, frontStartTurn, isEnemyStrength } from './warfare.js';
import { PROJECTS, FACILITIES, createGame, getProjectInfo, hasFacility } from './game.js';
import { EVENTS, EVENT_TRIGGERS } from './events.js';

const CAMPAIGN_TEMPLATES = new Map([24, 40, 64].map(maxTurns => [maxTurns, createGame({ maxTurns })]));
const INITIAL_STATE = CAMPAIGN_TEMPLATES.get(24);
const STATE_KEYS = [...new Set([...Object.keys(INITIAL_STATE), 'enemyStrength', 'warfare', 'treasury', 'lastSettlement'])];
const BRANCHES = Object.keys(INITIAL_STATE.army);
const STAT_KEYS = Object.keys(INITIAL_STATE.stats);
const PROJECT_IDS = PROJECTS.map(project => project.id);
const FACILITY_IDS = FACILITIES.map(facility => facility.id);
const BUILDING_LEVELS = Object.fromEntries(FACILITIES.map(facility => [facility.buildingId, Math.max(...FACILITIES.filter(f => f.buildingId === facility.buildingId).map(f => f.level))]));
const BUILDING_IDS = Object.keys(BUILDING_LEVELS);
const SPECIALTIES = ['math', 'metallurgy', 'mechanics', 'foreign', 'military', 'management'];
const DOCTRINE_IDS = ['cold', 'cuirassier', 'minie', 'breech'];
const STATUSES = ['playing', 'won', 'stalemate', 'lost'];
const LOG_TYPES = ['info', 'success', 'warning', 'danger'];
const MAX_SAVE_LENGTH = 2 * 1024 * 1024;
const MAX_MONEY = 100_000_000_000;

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
      && integer(project.attempts, 0, 1_000_000_000)
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
        || !integer(activity.turn, 1, state.turn)
        || (activity.kind !== 'research' && activity.turn !== team.usedTurn)) return false;
      if (activity.kind === 'research') {
        if (!PROJECT_IDS.includes(activity.targetId) || activity.targetId === 'joint_trials'
          || researchAssignments.has(activity.targetId)) return false;
        researchAssignments.add(activity.targetId);
      } else if (activity.kind === 'build') {
        if (!FACILITY_IDS.includes(activity.targetId) || !hasFacility(state, activity.targetId)) return false;
      } else if (activity.kind === 'train') {
        if (!BRANCHES.includes(activity.targetId) || !(state.trainedTurn[activity.targetId] >= activity.turn)) return false;
      } else return false;
    }
    ids.add(team.id);
    return true;
  });
}

const OCCURRENCE_KEYS = ['id', 'eventId', 'timing', 'turn', 'title', 'description', 'effects'];
const sameOccurrence = (left, right) => OCCURRENCE_KEYS.filter(key => key !== 'effects').every(key => left[key] === right[key])
  && Array.isArray(left.effects) && left.effects.length === right.effects.length
  && left.effects.every((effect, index) => exactKeys(effect, Object.keys(right.effects[index]))
    && Object.keys(effect).every(key => effect[key] === right.effects[index][key]));

function validOccurrence(state, occurrence) {
  if (!exactKeys(occurrence, OCCURRENCE_KEYS) || !integer(occurrence.id, 1)
    || !integer(occurrence.turn, 1, state.turn)) return false;
  const definition = EVENTS.find(event => event.id === occurrence.eventId);
  if (!definition || occurrence.timing !== definition.timing || occurrence.title !== definition.title
    || occurrence.description !== definition.description || !Array.isArray(occurrence.effects)
    || occurrence.effects.length !== definition.effects.length) return false;
  return occurrence.effects.every((effect, index) => {
    const expected = definition.effects[index];
    if (!record(effect) || effect.type !== expected.type) return false;
    if (effect.type === 'research_progress') {
      const project = PROJECTS.find(project => project.id === effect.projectId && !project.automatic);
      return exactKeys(effect, ['type', 'amount', 'projectId', 'name', 'before', 'after'])
        && Boolean(project) && effect.name === project.name
        && integer(effect.before, 0, 99) && integer(effect.after, 1, 100)
        && effect.after === Math.min(100, effect.before + expected.amount)
        && effect.amount === effect.after - effect.before;
    }
    if (!['money', 'reputation'].includes(effect.type)
      || !exactKeys(effect, ['type', 'amount', 'before', 'after']) || effect.amount !== expected.amount) return false;
    const lower = effect.type === 'money' ? 0 : -1_000_000_000;
    const upper = effect.type === 'money' ? MAX_MONEY : 1_000_000_000;
    return integer(effect.before, lower, upper) && integer(effect.after, lower, upper)
      && effect.after === effect.before + effect.amount;
  });
}

function validEvents(state) {
  const events = state.events;
  if (!exactKeys(events, ['rng', 'lastChecked', 'history']) || !integer(events.rng, 1, 0xffffffff)
    || !record(events.lastChecked) || !integer(events.lastChecked.before_turn, 1, state.turn)
    || !Object.entries(events.lastChecked).every(([timing, turn]) => Object.hasOwn(EVENT_TRIGGERS, timing) && integer(turn, 1, state.turn))
    || !Array.isArray(events.history) || events.history.length > state.maxTurns * Object.keys(EVENT_TRIGGERS).length) return false;
  const checked = new Map();
  let lastTurn = 0;
  return events.history.every((occurrence, index) => {
    if (!validOccurrence(state, occurrence) || occurrence.id !== index + 1 || occurrence.turn < lastTurn
      || occurrence.turn <= (checked.get(occurrence.timing) || 0)
      || occurrence.turn > (events.lastChecked[occurrence.timing] || 0)) return false;
    checked.set(occurrence.timing, occurrence.turn); lastTurn = occurrence.turn;
    return true;
  });
}

function validPending(state) {
  const pending = state.pending;
  if (pending === null) return true;
  if (!record(pending) || state.status !== 'playing') return false;
  if (pending.kind === 'event') {
    const occurrence = state.events.history.at(-1);
    return exactKeys(pending, ['kind', 'occurrenceId']) && Boolean(occurrence)
      && pending.occurrenceId === occurrence.id && occurrence.turn === state.turn;
  }
  if (!text(pending.title, 200) || !text(pending.description)) return false;
  if (pending.kind === 'rescue') {
    if (!PROJECT_IDS.includes(pending.projectId) || pending.projectId === 'joint_trials') return false;
    const project = state.projects[pending.projectId];
    return !project.completed && project.testedTurn === state.turn && project.attempts > 0
      && pending.cost === getProjectInfo(state, pending.projectId).rescueCost
      && integer(pending.successChance, 60, 95)
      && (pending.inviteCourt === undefined || typeof pending.inviteCourt === 'boolean');
  }

  return false;
}

function validCommonState(state) {
  if (!CAMPAIGN_TEMPLATES.has(state.maxTurns) || !integer(state.turn, 1, state.maxTurns)
    || !STATUSES.includes(state.status)
    || !DOCTRINE_IDS.includes(state.doctrine)
    || !integer(state.seed, 1, 0xffffffff) || !integer(state.rng, 1, 0xffffffff)
    || !integer(state.money, 0, MAX_MONEY) || !integer(state.reputation, -1_000_000_000)
    || !validTeams(state) || !integer(state.nextLogId, 1, 1_000_000)
    || !validProjects(state) || !exactKeys(state.facilities, BUILDING_IDS)
    || !BUILDING_IDS.every(id => integer(state.facilities[id], 0, BUILDING_LEVELS[id]))
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
  return true;
}

const BATTLE_KEYS = ['turn', 'enemyCommitted', 'playerCommitted', 'enemyLosses', 'playerLosses',
  'enemyReinforcements', 'replacementCapacity', 'sustainable', 'enemyDeclining',
  'reinforcements', 'enemyAfter', 'playerAfter'];
const BATTLE_COUNTS = BATTLE_KEYS.filter(key => !['turn', 'sustainable', 'enemyDeclining'].includes(key));

function validWarfare(state) {
  const warfare = state.warfare;
  if (!isEnemyStrength(state.enemyStrength)
    || !exactKeys(warfare, ['reserve', 'lastSettledTurn', 'fronts'])
    || !integer(warfare.reserve) || !integer(warfare.lastSettledTurn, 0, state.turn)
    || !exactKeys(warfare.fronts, FRONTS.map(front => front.id))) return false;
  let totalTarget = 0;
  for (const definition of FRONTS) {
    const front = warfare.fronts[definition.id];
    const startTurn = frontStartTurn(state.maxTurns, definition);
    const active = state.turn >= startTurn;
    if (!exactKeys(front, ['troops', 'assigned', 'target', 'battleCap', 'lastBattle'])
      || !integer(front.troops, active ? definition.minTroops : 0, active ? definition.maxTroops : 0)
      || !integer(front.target, 0, 1_000_000) || !integer(front.assigned, 0, front.target)
      || !integer(front.battleCap, 1, definition.maxTroops)
      || (!active && (front.target !== 0 || front.assigned !== 0 || front.lastBattle !== null))) return false;
    totalTarget += front.target;
    const battle = front.lastBattle;
    if (battle !== null && (!exactKeys(battle, BATTLE_KEYS)
      || !integer(battle.turn, startTurn, warfare.lastSettledTurn) || battle.turn !== warfare.lastSettledTurn
      || !BATTLE_COUNTS.every(key => integer(battle[key]))
      || typeof battle.sustainable !== 'boolean' || typeof battle.enemyDeclining !== 'boolean'
      || battle.enemyLosses > battle.enemyCommitted || battle.playerLosses > battle.playerCommitted
      || battle.enemyCommitted > definition.maxTroops || battle.playerCommitted > 1_000_000
      || battle.enemyAfter !== front.troops || battle.playerAfter > 1_000_000
      || battle.playerAfter !== battle.playerCommitted - battle.playerLosses + battle.reinforcements
      || battle.enemyAfter - battle.enemyReinforcements < definition.minTroops
      || battle.enemyAfter + battle.enemyLosses - battle.enemyReinforcements < battle.enemyCommitted
      || battle.enemyAfter + battle.enemyLosses - battle.enemyReinforcements > definition.maxTroops
      || battle.sustainable !== (battle.playerCommitted > 0 && battle.playerLosses <= battle.replacementCapacity)
      || battle.enemyDeclining !== (battle.enemyLosses > battle.enemyReinforcements))) return false;
  }
  return totalTarget <= 1_000_000;
}

function validEnding(state) {
  const hasReason = Object.hasOwn(state, 'defeatReason');
  if (state.status === 'lost' && state.defeatReason === 'prestige') return state.reputation < 0 && state.warfare.lastSettledTurn === state.turn - 1;
  if (state.reputation < 0 || (hasReason && state.status !== 'lost')) return false;
  const fronts = FRONTS.filter(front => state.turn >= frontStartTurn(state.maxTurns, front));
  const breached = FRONT_DEFEAT_PRIORITY.find(id => {
    const definition = fronts.find(front => front.id === id);
    return definition && state.warfare.fronts[id].troops > definition.defeatThreshold;
  });
  if (state.status === 'playing') return !hasReason && !breached && state.warfare.lastSettledTurn === state.turn - 1;
  if (state.warfare.lastSettledTurn !== state.turn
    || !fronts.every(front => state.warfare.fronts[front.id].lastBattle?.turn === state.turn)) return false;
  if (breached) return state.status === 'lost' && state.defeatReason === breached;
  if (state.turn !== state.maxTurns) return false;
  const subdued = FRONTS.every(front => state.warfare.fronts[front.id].troops <= front.victoryThreshold);
  if (subdued) return state.status === 'won' && !hasReason;
  const collapsed = FRONT_DEFEAT_PRIORITY.find(id => {
    const front = state.warfare.fronts[id], definition = FRONTS.find(item => item.id === id);
    if (front.troops <= definition.victoryThreshold) return false;
    const battle = front.lastBattle;
    return !battle || !battle.sustainable || !battle.enemyDeclining;
  });
  return collapsed ? state.status === 'lost' && state.defeatReason === collapsed
    : state.status === 'stalemate' && !hasReason;
}

/** Only the current event-history campaign schema is accepted. */
export function parseSave(raw) {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_SAVE_LENGTH) {
    throw new Error('存档为空、过大或格式不正确。');
  }
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error('存档不是有效的 JSON 文件。'); }
  const state = record(parsed) && Object.hasOwn(parsed, 'state') ? parsed.state : parsed;
  if (!isValidState(state)) throw new Error('存档版本不兼容或数据不完整，请使用随机事件版本的新存档。');
  return state;
}

const LEDGER_KEYS = ['id', 'turn', 'kind', 'category', 'label', 'amount', 'balance', 'projectId', 'teamId'];
const EXPENSE_CATEGORIES = ['research', 'trial', 'rescue', 'construction', 'training', 'recruitment'];
const INCOME_CATEGORIES = ['grant', 'prestige', 'event'];
const financeId = value => integer(value, 1) || text(value, 100);
const historicTeam = (state, id) => typeof id === 'string' && /^team_[1-9]\d*$/.test(id)
  && integer(Number(id.slice(5)), 1, state.nextTeamId - 1);
const sameEntry = (left, right) => LEDGER_KEYS.every(key => left[key] === right[key]);

function validLedgerEntry(state, entry) {
  return exactKeys(entry, LEDGER_KEYS) && integer(entry.id, 1)
    && integer(entry.turn, 1, state.turn) && ['income', 'expense'].includes(entry.kind)
    && (entry.kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).includes(entry.category)
    && text(entry.label, 300) && integer(entry.amount, 1, MAX_MONEY) && integer(entry.balance, 0, MAX_MONEY)
    && (entry.projectId === null || PROJECT_IDS.includes(entry.projectId))
    && (entry.teamId === null || historicTeam(state, entry.teamId));
}

function validTreasury(state) {
  const treasury = state.treasury;
  if (!exactKeys(treasury, ['entries', 'nextId']) || !Array.isArray(treasury.entries)
    || treasury.entries.length > 10_000 || !integer(treasury.nextId, 1, 10_001)
    || treasury.nextId !== treasury.entries.length + 1) return false;
  let previous = null, income = 0, expenses = 0;
  for (const entry of treasury.entries) {
    if (!validLedgerEntry(state, entry) || entry.id !== (previous?.id || 0) + 1
      || (previous && (entry.turn < previous.turn
        || entry.balance !== previous.balance + (entry.kind === 'income' ? entry.amount : -entry.amount)))) return false;
    if (entry.kind === 'income') income += entry.amount; else expenses += entry.amount;
    previous = entry;
  }
  const rewards = state.events.history.flatMap(occurrence => occurrence.effects
    .filter(effect => effect.type === 'money').map(effect => ({ occurrence, effect })));
  const entries = treasury.entries.filter(entry => entry.category === 'event');
  if (entries.length !== rewards.length || !entries.every((entry, index) => {
    const { occurrence, effect } = rewards[index];
    return entry.kind === 'income' && entry.turn === Math.max(1, occurrence.turn - 1)
      && entry.label === occurrence.title && entry.amount === effect.amount
      && entry.balance === effect.after && entry.balance - entry.amount === effect.before
      && entry.projectId === null && entry.teamId === null;
  })) return false;
  return (!previous || previous.balance === state.money) && income <= state.stats.earned && expenses <= state.stats.spent;
}

const SETTLEMENT_KEYS = ['turn', 'date', 'moneyBefore', 'moneyAfter', 'reputationBefore', 'reputationAfter',
  'income', 'expenses', 'netIncome', 'incomeItems', 'expenseItems', 'research', 'battles', 'reinforcements',
  'reserveBefore', 'reserveAfter', 'totalTroopsBefore', 'totalTroopsAfter', 'entries', 'newFronts', 'events', 'status'];

function validSettlement(state) {
  const report = state.lastSettlement;
  if (report === null) return true;
  if (!exactKeys(report, SETTLEMENT_KEYS) || !integer(report.turn, 1, state.turn)
    || report.turn !== state.warfare.lastSettledTurn || !text(report.date, 100)
    || !STATUSES.includes(report.status)
    || !['moneyBefore', 'moneyAfter', 'income', 'expenses'].every(key => integer(report[key], 0, MAX_MONEY))
    || !integer(report.netIncome, -MAX_MONEY, MAX_MONEY)
    || !['reputationBefore', 'reputationAfter'].every(key => integer(report[key], -1_000_000_000))
    || !['reinforcements', 'reserveBefore', 'reserveAfter', 'totalTroopsBefore', 'totalTroopsAfter'].every(key => integer(report[key]))
    || report.netIncome !== report.income - report.expenses
    || report.moneyAfter !== report.moneyBefore + report.netIncome
    || !Array.isArray(report.entries) || !Array.isArray(report.incomeItems) || !Array.isArray(report.expenseItems)
    || !Array.isArray(report.research) || !Array.isArray(report.battles) || !Array.isArray(report.newFronts) || !Array.isArray(report.events)
    || report.entries.length > 10_000 || report.research.length > 8 || report.battles.length > FRONTS.length
    || new Set(report.newFronts).size !== report.newFronts.length
    || !report.newFronts.every(id => FRONTS.some(front => front.id === id
      && frontStartTurn(state.maxTurns, front) === report.turn + 1))) return false;
  const events = state.events.history.filter(event => event.timing === 'before_turn' && event.turn === report.turn + 1);
  if (report.events.length !== events.length || !report.events.every((event, index) => sameOccurrence(event, events[index]))) return false;
  const eventIncome = events.filter(event => event.effects.some(effect => effect.type === 'money'))
    .map(event => ({ id: `event:${event.id}`, label: event.title, amount: event.effects.reduce((sum, effect) => sum + (effect.type === 'money' ? effect.amount : 0), 0) }));
  const eventItems = report.incomeItems.filter(item => typeof item?.id === 'string' && item.id.startsWith('event:'));
  if (eventItems.length !== eventIncome.length || !eventItems.every((item, index) =>
    ['id', 'label', 'amount'].every(key => item[key] === eventIncome[index][key]))) return false;
  let balance = report.moneyBefore, income = 0, expenses = 0, previousId = null;
  for (const entry of report.entries) {
    const original = state.treasury.entries[entry.id - 1];
    if (!validLedgerEntry(state, entry) || entry.turn !== report.turn || !original || !sameEntry(entry, original)
      || (previousId !== null && entry.id !== previousId + 1)) return false;
    balance += entry.kind === 'income' ? entry.amount : -entry.amount;
    if (balance !== entry.balance) return false;
    if (entry.kind === 'income') income += entry.amount; else expenses += entry.amount;
    previousId = entry.id;
  }
  if (balance !== report.moneyAfter || income !== report.income || expenses !== report.expenses) return false;
  if (!report.incomeItems.every(item => exactKeys(item, ['id', 'label', 'amount'])
    && financeId(item.id) && text(item.label, 300) && integer(item.amount, 0, MAX_MONEY))
    || report.incomeItems.reduce((sum, item) => sum + item.amount, 0) !== report.income
    || !report.expenseItems.every(item => exactKeys(item, ['id', 'category', 'label', 'amount', 'projectId', 'teamId'])
      && financeId(item.id) && EXPENSE_CATEGORIES.includes(item.category) && text(item.label, 300)
      && integer(item.amount, 0, MAX_MONEY) && (item.projectId === null || PROJECT_IDS.includes(item.projectId))
      && (item.teamId === null || historicTeam(state, item.teamId)))
    || report.expenseItems.reduce((sum, item) => sum + item.amount, 0) !== report.expenses) return false;
  const projects = new Set(), teams = new Set();
  for (const item of report.research) {
    if (!exactKeys(item, ['projectId', 'name', 'teamId', 'teamName', 'before', 'after', 'gain', 'chance', 'passed', 'cost'])
      || !PROJECT_IDS.includes(item.projectId) || item.projectId === 'joint_trials'
      || !historicTeam(state, item.teamId) || projects.has(item.projectId) || teams.has(item.teamId)
      || !text(item.name, 300) || !text(item.teamName, 100)
      || !['before', 'after', 'gain', 'chance'].every(key => integer(item[key], 0, 100))
      || item.after - item.before !== item.gain || typeof item.passed !== 'boolean'
      || !integer(item.cost, 0, MAX_MONEY)) return false;
    projects.add(item.projectId); teams.add(item.teamId);
  }
  const activeFronts = FRONTS.filter(front => report.turn >= frontStartTurn(state.maxTurns, front));
  if (report.battles.length !== activeFronts.length) return false;
  const frontIds = new Set();
  let playerBefore = 0, playerAfter = 0, playerLosses = 0;
  for (const battle of report.battles) {
    const definition = activeFronts.find(front => front.id === battle.id);
    const current = definition && state.warfare.fronts[battle.id].lastBattle;
    if (!definition || frontIds.has(battle.id) || !exactKeys(battle, ['id', 'name', ...BATTLE_KEYS, 'enemyBefore', 'playerBefore'])
      || !text(battle.name, 300) || !current || !BATTLE_KEYS.every(key => battle[key] === current[key])
      || !integer(battle.enemyBefore, definition.minTroops, definition.maxTroops)
      || !integer(battle.playerBefore, 0, 1_000_000)
      || battle.enemyBefore !== battle.enemyAfter + battle.enemyLosses - battle.enemyReinforcements
      || battle.playerBefore !== battle.playerCommitted) return false;
    frontIds.add(battle.id);
    playerBefore += battle.playerBefore; playerAfter += battle.playerAfter; playerLosses += battle.playerLosses;
  }
  return report.totalTroopsBefore === report.reserveBefore + playerBefore
    && report.totalTroopsAfter === report.reserveAfter + playerAfter
    && report.totalTroopsAfter === report.totalTroopsBefore + report.reinforcements - playerLosses;
}

function validFinancialState(state, version) {
  try {
    const keys = [...STATE_KEYS];
    for (const optional of ['defeatReason']) if (Object.hasOwn(state || {}, optional)) keys.push(optional);
    return exactKeys(state, keys) && state.version === version && validCommonState(state)
      && validWarfare(state) && validEnding(state) && validTreasury(state) && validSettlement(state);
  } catch { return false; }
}

/** Validate event history, four fronts, building levels and difficulty. */
export function isValidState(state) { return validFinancialState(state, 10); }
