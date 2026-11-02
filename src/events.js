import { PROJECTS } from './technology.js';

// Each timing rolls once, then chooses one eligible event by weight. New hooks
// can use the same dispatcher without changing the individual effect handlers.
export const EVENT_TRIGGERS = { before_turn: { chance: .20 } };
export const EVENTS = [
  {
    id: 'hidden_village', timing: 'before_turn', weight: 1,
    title: '锦衣卫发现隐世村庄',
    description: '锦衣卫访得一处隐世村庄。村民愿将世代相传的技艺呈交朝廷，助百工研习；乡民归心，朝廷威望亦有所增长。',
    effects: [{ type: 'research_progress', amount: 40 }, { type: 'reputation', amount: 1 }],
  },
  {
    id: 'corrupt_official', timing: 'before_turn', weight: 1,
    title: '锦衣卫查抄贪官',
    description: '锦衣卫查得官员侵吞公帑，赃银已清点入库，可用于工场与新军。',
    effects: [{ type: 'money', amount: 2000 }],
  },
  {
    id: 'auspicious_omen', timing: 'before_turn', weight: 1,
    title: '地方进呈祥瑞',
    description: '地方官进呈祥瑞，群臣入贺，朝野一时振奋，朝廷威望有所增长。',
    effects: [{ type: 'reputation', amount: 2 }],
  },
];

export function createEventState(seed) {
  return { rng: ((Math.imul(seed, 0x9e3779b9) ^ 0x85ebca6b) >>> 0) || 1, lastChecked: {}, history: [] };
}

function random(state) {
  let x = state.events.rng >>> 0;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  state.events.rng = x >>> 0;
  return state.events.rng / 4294967296;
}

function unfinishedProjects(state, context) {
  return PROJECTS.filter(project => !project.automatic && !state.projects[project.id].completed
    && context.researchProgress(project.id) < 100);
}

const EFFECT_HANDLERS = {
  research_progress: {
    eligible: (state, context) => unfinishedProjects(state, context).length > 0,
    apply(state, effect, context) {
      const projects = unfinishedProjects(state, context);
      const project = projects[Math.floor(random(state) * projects.length)];
      const before = context.researchProgress(project.id), after = Math.min(100, before + effect.amount);
      // Preparation is a stored reward, even while the technology is locked.
      // Reaching 100 never accepts the project or grants its completed effects.
      state.projects[project.id].progress = after;
      return { type: effect.type, amount: after - before, projectId: project.id, name: project.name, before, after };
    },
  },
  money: {
    eligible: () => true,
    apply(state, effect, context) {
      const before = state.money;
      context.grantMoney(effect.amount, context.event.title);
      return { type: effect.type, amount: effect.amount, before, after: state.money };
    },
  },
  reputation: {
    eligible: () => true,
    apply(state, effect) {
      const before = state.reputation;
      state.reputation += effect.amount;
      return { type: effect.type, amount: effect.amount, before, after: state.reputation };
    },
  },
};

/** Mutates the transaction's cloned state; the caller handles logging and UI. */
export function triggerRandomEvent(state, timing, {
  turn = state.turn,
  researchProgress = id => state.projects[id].progress,
  grantMoney,
  catalog = EVENTS,
  triggers = EVENT_TRIGGERS,
} = {}) {
  const trigger = triggers[timing];
  if (!trigger || state.status !== 'playing' || state.pending || (state.events.lastChecked[timing] || 0) >= turn) return null;
  const context = { researchProgress, grantMoney };
  const candidates = catalog.filter(event => event.timing === timing && event.weight > 0
    && event.effects.every(effect => EFFECT_HANDLERS[effect.type].eligible(state, context)));
  state.events.lastChecked[timing] = turn;
  if (!candidates.length || random(state) >= trigger.chance) return null;
  let choice = random(state) * candidates.reduce((sum, event) => sum + event.weight, 0);
  const event = candidates.find(candidate => (choice -= candidate.weight) < 0) || candidates.at(-1);
  const occurrence = {
    id: state.events.history.length + 1, eventId: event.id, timing, turn,
    title: event.title, description: event.description,
    effects: event.effects.map(effect => EFFECT_HANDLERS[effect.type].apply(state, effect, { ...context, event })),
  };
  state.events.history.push(occurrence);
  state.pending = { kind: 'event', occurrenceId: occurrence.id };
  return occurrence;
}

export function pendingEvent(state) {
  return state.pending?.kind === 'event'
    ? state.events.history.find(event => event.id === state.pending.occurrenceId) || null
    : null;
}
