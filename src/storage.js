import { FRONTS, createWarfare, isEnemyStrength } from './warfare.js';
import { PROJECTS, FACILITIES, createGame, getProjectInfo } from './game.js';

const CAMPAIGN_TEMPLATES = new Map([24, 40, 64].map(maxTurns => [maxTurns, createGame({ maxTurns })]));
const INITIAL_STATE = CAMPAIGN_TEMPLATES.get(24);
const STATE_KEYS = [...new Set([...Object.keys(INITIAL_STATE), 'enemyStrength', 'warfare', 'treasury', 'lastSettlement'])];
const V5_KEYS = STATE_KEYS.filter(key => !['treasury', 'lastSettlement'].includes(key));
const LEGACY_KEYS = V5_KEYS.filter(key => !['enemyStrength', 'warfare'].includes(key));
const BRANCHES = Object.keys(INITIAL_STATE.army);
const STAT_KEYS = Object.keys(INITIAL_STATE.stats);
const PROJECT_IDS = PROJECTS.map(project => project.id);
const FACILITY_IDS = FACILITIES.map(facility => facility.id);
const SPECIALTIES = ['math', 'metallurgy', 'mechanics', 'foreign', 'military', 'management'];
const DOCTRINE_IDS = ['cold', 'cuirassier', 'minie', 'breech'];
const STATUSES = ['playing', 'won', 'stalemate', 'lost'];
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
      && integer(project.attempts, 0, state.version < 6 ? state.turn : 1_000_000_000)
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
        || ((state.version < 6 || activity.kind !== 'research') && activity.turn !== team.usedTurn)) return false;
      if (activity.kind === 'research') {
        if (!PROJECT_IDS.includes(activity.targetId) || activity.targetId === 'joint_trials'
          || (state.version < 6 && state.projects[activity.targetId]?.investedTurn !== activity.turn)
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

function legacyEvents(maxTurns) {
  return [1, 2, 3].map(stage => ({ id: `crisis_${stage}`, stage,
    turn: Math.max(1, Math.min(maxTurns - 1, Math.round(maxTurns * stage / 4))) }));
}

function validEvents(state, legacy = false) {
  const expectedEvents = legacy ? legacyEvents(state.maxTurns) : [];
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

function validPending(state, legacy = false) {
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
  if (legacy && pending.kind === 'event') {
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

function validCommonState(state, legacy = false) {
  if (!CAMPAIGN_TEMPLATES.has(state.maxTurns) || !integer(state.turn, 1, state.maxTurns)
    || !(legacy ? ['playing', 'won', 'lost'] : STATUSES).includes(state.status)
    || !DOCTRINE_IDS.includes(state.doctrine)
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
    || !validEvents(state, legacy) || !validPending(state, legacy)
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

// Preserve the former score rule solely to validate historical v4 endings.
function legacyCombatReady(state) {
  const best = (family, predicate = () => true) => PROJECTS.filter(project => project.family === family
    && state.projects[project.id].completed && predicate(project))
    .sort((a, b) => b.level - a.level || b.capacity - a.capacity)[0];
  const level = family => best(family)?.level || 0;
  const supplied = project => {
    if (project.family === 'firearms') return level('powder') >= 1
      && (project.level === 1 || level('ammunition') >= (project.level >= 5 ? 3 : project.level >= 4 ? 2 : 1));
    if (project.family === 'cavalry' && project.id === 'cavalry_gun') return level('ammunition') >= 1;
    if (project.family === 'artillery') return level('powder') >= 1
      && (project.level === 1 || level('artillery_ammo') >= (project.level >= 3 ? 2 : 1));
    return true;
  };
  const doctrines = {
    cold: { quantity: 3.2, family: 'cold_equipment', branch: 'infantry', modifiers: [1.12, 1] },
    cuirassier: { quantity: 1.45, family: 'cavalry', branch: 'cavalry', modifiers: [1.1, 1.18] },
    minie: { quantity: 1.05, family: 'firearms', branch: 'infantry', modifiers: [1.15, 1.25] },
    breech: { quantity: .9, family: 'firearms', branch: 'infantry', modifiers: [1.35, 1.5] },
  };
  const doctrine = doctrines[state.doctrine];
  const families = [...new Set(PROJECTS.filter(project => project.capacity > 0).map(project => project.family))];
  const quantity = Math.round((10 + families.reduce((sum, family) => sum + (best(family)?.capacity || 0), 0)) * doctrine.quantity);
  const equipment = Math.round((best(doctrine.family, supplied)?.equipment || 0)
    * (1 + (best('artillery', supplied)?.equipment || 0) * .08 * state.army.artillery / 100) * 100) / 100;
  const training = Math.round(state.army[doctrine.branch] * .5 + state.army.drill * .3 + state.army.coordination * .2) / 100;
  return doctrine.modifiers.every(modifier => Math.round(quantity * equipment * training * modifier / 4) >= 100);
}

function isValidLegacyState(state) {
  try {
    const prestigeDefeat = state?.status === 'lost' && state?.defeatReason === 'prestige';
    const keys = Object.hasOwn(state || {}, 'defeatReason') ? [...LEGACY_KEYS, 'defeatReason'] : LEGACY_KEYS;
    if (!exactKeys(state, keys) || state.version !== 4 || !validCommonState(state, true)
      || (Object.hasOwn(state, 'defeatReason') && !prestigeDefeat)
      || (prestigeDefeat ? state.reputation >= 0 : state.reputation < 0)
      || (state.status === 'lost' && !prestigeDefeat && state.turn !== state.maxTurns)) return false;
    const ready = legacyCombatReady(state);
    return !((state.status === 'won' && !ready) || (state.status === 'lost' && !prestigeDefeat && ready)
      || (state.status === 'playing' && ready && state.pending === null));
  } catch { return false; }
}

const BATTLE_KEYS = ['turn', 'enemyCommitted', 'playerCommitted', 'enemyLosses', 'playerLosses',
  'enemyReinforcements', 'replacementCapacity', 'sustainable', 'enemyDeclining',
  'reinforcements', 'enemyAfter', 'playerAfter'];
const BATTLE_COUNTS = BATTLE_KEYS.filter(key => !['turn', 'sustainable', 'enemyDeclining'].includes(key));

function validWarfare(state) {
  const warfare = state.warfare;
  if (!(state.version < 7 ? integer(state.enemyStrength, 1, 10) : isEnemyStrength(state.enemyStrength))
    || !exactKeys(warfare, ['reserve', 'lastSettledTurn', 'fronts'])
    || !integer(warfare.reserve) || !integer(warfare.lastSettledTurn, 0, state.turn)
    || !exactKeys(warfare.fronts, FRONTS.map(front => front.id))) return false;
  let totalTarget = 0;
  for (const definition of FRONTS) {
    const front = warfare.fronts[definition.id];
    const startTurn = Math.ceil(state.maxTurns * definition.startFraction);
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
  if (Object.hasOwn(state, 'legacyEnding')) {
    return ['won', 'lost'].includes(state.legacyEnding) && state.status === state.legacyEnding
      && (state.defeatReason === 'prestige' ? state.status === 'lost' && state.reputation < 0
        : !hasReason && state.reputation >= 0);
  }
  if (state.status === 'lost' && state.defeatReason === 'prestige') return state.reputation < 0 && state.warfare.lastSettledTurn === state.turn - 1;
  if (state.reputation < 0 || (hasReason && state.status !== 'lost')) return false;
  const fronts = FRONTS.filter(front => state.turn >= Math.ceil(state.maxTurns * front.startFraction));
  const breached = ['li', 'qing', 'wokou'].find(id => {
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
  const collapsed = ['li', 'qing', 'wokou'].find(id => {
    const front = state.warfare.fronts[id], definition = FRONTS.find(item => item.id === id);
    if (front.troops <= definition.victoryThreshold) return false;
    const battle = front.lastBattle;
    return !battle || !battle.sustainable || !battle.enemyDeclining;
  });
  return collapsed ? state.status === 'lost' && state.defeatReason === collapsed
    : state.status === 'stalemate' && !hasReason;
}

function isValidV5State(state) {
  try {
    const keys = [...V5_KEYS];
    for (const optional of ['defeatReason', 'legacyEnding']) if (Object.hasOwn(state || {}, optional)) keys.push(optional);
    return exactKeys(state, keys) && state.version === 5 && validCommonState(state)
      && validWarfare(state) && validEnding(state);
  } catch { return false; }
}

function migrateV4State(state) {
  const migrated = { ...state, version: 5, enemyStrength: 3,
    warfare: createWarfare(state.maxTurns, state.turn), plannedEvents: [], resolvedEvents: [] };
  if (migrated.pending?.kind === 'event') migrated.pending = null;
  if (state.status !== 'playing') migrated.legacyEnding = state.status;
  migrated.log.unshift({ id: migrated.nextLogId++, turn: migrated.turn, title: '旧卷宗续接', type: 'info',
    text: state.status === 'playing'
      ? '已接入逐季战线：保留工艺、部队训练、团队与内库；当前已出现的敌军按初始兵力入场，可重新部署。旧军报决策已归档，不扣威望。'
      : '此卷宗已在旧制下完结，原结局与建设成果照录保留。新局采用逐季战线与工业补员。' });
  return migrated;
}

// Finance validation and the v6 migration are below the legacy compatibility layer.

/** Accept current campaigns and migrate validated v4/v5/v6 exports in memory. */
export function parseSave(raw) {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_SAVE_LENGTH) {
    throw new Error('存档为空、过大或格式不正确。');
  }
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error('存档不是有效的 JSON 文件。'); }
  let state = record(parsed) && Object.hasOwn(parsed, 'state') ? parsed.state : parsed;
  // The removed prototype research methods never changed saved progress or outcomes.
  if (state?.version === 4 && record(state.projects)) for (const project of Object.values(state.projects)) {
    if (record(project) && ['standard', 'makeshift'].includes(project.method)) delete project.method;
  }
  if (state?.version === 4) {
    if (!isValidLegacyState(state)) throw new Error('存档版本不兼容或数据不完整，无法载入。');
    state = migrateV4State(state);
  }
  if (state?.version === 5) {
    if (!isValidV5State(state)) throw new Error('存档版本不兼容或数据不完整，无法载入。');
    state = migrateV5State(state);
  }
  if (state?.version === 6) {
    if (!isValidV6State(state)) throw new Error('存档版本不兼容或数据不完整，无法载入。');
    state = { ...state, version: 7, enemyStrength: Math.round((.4 + (state.enemyStrength - 1) * .15) * 100) / 100 };
  }
  if (!isValidState(state)) throw new Error('存档版本不兼容或数据不完整，无法载入。');
  return state;
}

const LEDGER_KEYS = ['id', 'turn', 'kind', 'category', 'label', 'amount', 'balance', 'projectId', 'teamId'];
const EXPENSE_CATEGORIES = ['research', 'trial', 'rescue', 'construction', 'training', 'recruitment'];
const INCOME_CATEGORIES = ['grant', 'prestige'];
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
  return (!previous || previous.balance === state.money) && income <= state.stats.earned && expenses <= state.stats.spent;
}

const SETTLEMENT_KEYS = ['turn', 'date', 'moneyBefore', 'moneyAfter', 'reputationBefore', 'reputationAfter',
  'income', 'expenses', 'netIncome', 'incomeItems', 'expenseItems', 'research', 'battles', 'reinforcements',
  'reserveBefore', 'reserveAfter', 'totalTroopsBefore', 'totalTroopsAfter', 'entries', 'newFronts', 'status'];

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
    || !Array.isArray(report.research) || !Array.isArray(report.battles) || !Array.isArray(report.newFronts)
    || report.entries.length > 10_000 || report.research.length > 8 || report.battles.length > FRONTS.length
    || new Set(report.newFronts).size !== report.newFronts.length
    || !report.newFronts.every(id => FRONTS.some(front => front.id === id
      && Math.ceil(state.maxTurns * front.startFraction) === report.turn + 1))) return false;
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
  const activeFronts = FRONTS.filter(front => report.turn >= Math.ceil(state.maxTurns * front.startFraction));
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
    for (const optional of ['defeatReason', 'legacyEnding']) if (Object.hasOwn(state || {}, optional)) keys.push(optional);
    return exactKeys(state, keys) && state.version === version && validCommonState(state)
      && validWarfare(state) && validEnding(state) && validTreasury(state) && validSettlement(state);
  } catch { return false; }
}

function isValidV6State(state) { return validFinancialState(state, 6); }

/** Validate the direct, two-decimal difficulty schema used by current campaigns. */
export function isValidState(state) { return validFinancialState(state, 7); }

function migrateV5State(state) {
  const migrated = { ...state, version: 6, treasury: { entries: [], nextId: 1 }, lastSettlement: null };
  for (const team of [...migrated.teams, ...migrated.candidates]) {
    if (team.activity?.kind === 'research') team.activity = null;
  }
  migrated.log.unshift({ id: migrated.nextLogId++, turn: migrated.turn, title: '科研账制更新', type: 'info',
    text: '研究成果、已有准备、内库与本季已用团队均已保留。旧研究指派已清除；重新安排后才会逐季扣费推进。收支账簿从续接时开始记录，先前流水不作补造。' });
  return migrated;
}
