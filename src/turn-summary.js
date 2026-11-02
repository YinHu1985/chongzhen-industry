import { FRONTS } from './warfare.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const number = value => Math.round(Number(value) || 0).toLocaleString('zh-CN');
const signed = value => `${value > 0 ? '+' : value < 0 ? '−' : ''}${number(Math.abs(value))}`;
const frontNames = Object.fromEntries(FRONTS.map(front => [front.id, front.name]));
function count(before, after, animate) {
  return `<span data-count-from="${before}" data-count-to="${after}">${number(animate ? before : after)}</span>`;
}
function metric(label, before, after, unit, animate) {
  const difference = after - before;
  return `<div class="settlement-metric"><small>${label}</small><strong>${count(before,after,animate)}<em>${unit}</em></strong><span class="settlement-delta ${difference < 0 ? 'negative' : 'positive'}">${signed(difference)} ${unit}</span></div>`;
}

function eventRewards(occurrence, animate) {
  return `<div class="event-rewards">${occurrence.effects.map(effect => {
    if (effect.type === 'research_progress') {
      return `<div class="event-reward event-research" data-event-project="${esc(effect.projectId)}"><div class="event-reward-heading"><strong>${esc(effect.name)}</strong><b>准备度 +${number(effect.amount)}%</b></div><div class="event-research-values"><span>准备度 ${number(effect.before)}% → ${count(effect.before,effect.after,animate)}%</span></div><div class="settlement-research-progress" role="progressbar" aria-label="${esc(effect.name)}准备度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${effect.after}"><span data-progress-from="${effect.before}" data-progress-to="${effect.after}" style="width:${animate ? effect.before : effect.after}%"></span></div><small>仅增加准备度，未解锁项目仍须满足前置条件，之后通过验收才会生效。</small></div>`;
    }
    const money = effect.type === 'money', label = money ? '内库银两' : '朝廷威望', unit = money ? '两' : '点';
    return `<div class="event-reward"><div class="event-reward-heading"><strong>${label}</strong><b>+${number(effect.amount)} ${unit}</b></div><div class="event-reward-values"><span>${number(effect.before)}</span><i aria-hidden="true">→</i><strong>${count(effect.before,effect.after,animate)} <small>${unit}</small></strong></div></div>`;
  }).join('')}</div>`;
}

export function renderRandomEvent(occurrence, { animate = true } = {}) {
  if (!occurrence) return '';
  return `<div class="random-event-report" data-random-event-id="${occurrence.id}"><p class="modal-eyebrow">第 ${occurrence.turn} 季 · 民间奏报</p><h2 id="modal-title">${esc(occurrence.title)}</h2><p>${esc(occurrence.description)}</p>${eventRewards(occurrence,animate)}<p class="event-reward-note">以上奖励已记入卷宗。</p><div class="modal-actions"><button class="small-button primary" data-action="acknowledge-event">阅毕</button></div></div>`;
}

export function renderTurnTransition({ turn, date }) {
  return `<div class="turn-ceremony" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabindex="-1"><div class="turn-ceremony-rule"></div><span class="turn-seal" aria-hidden="true">奏</span><p>第 ${turn} 季 · ${esc(date)}</p><h2 id="modal-title">百工报绩，三军报功。</h2><span class="turn-ceremony-caption">核计收支 · 会齐军报 · 翻开新季</span><div class="turn-ceremony-progress" aria-hidden="true"><i></i></div></div>`;
}

export function renderTurnSummary(report, { animate = true } = {}) {
  if (!report) return '';
  const events = report.events || [];
  return `<div class="turn-summary" data-settlement-turn="${report.turn}"><p class="modal-eyebrow">第 ${report.turn} 季 · ${esc(report.date)} · 季末结算</p><h2 id="modal-title">一季百工，皆有回响。</h2><p class="settlement-subtitle">本季研究、军情与收支已记入卷宗。</p>
    <div class="settlement-metrics">${metric('内库银两',report.moneyBefore,report.moneyAfter,'两',animate)}${metric('朝廷威望',report.reputationBefore,report.reputationAfter,'点',animate)}${metric('我军总兵力',report.totalTroopsBefore,report.totalTroopsAfter,'人',animate)}</div>
    <section class="settlement-research"><header><h3>工部 · 研究进展</h3><span>${report.research.length} 项推进</span></header>${report.research.length ? `<div class="settlement-research-grid">${report.research.map(research => `<article class="settlement-research-card"><header><h4>${esc(research.name)}</h4><span class="${research.passed ? 'positive' : 'negative'}">${research.passed ? '攻关顺利' : '受阻积累'}</span></header><p>${esc(research.teamName)} · 支出 ${number(research.cost)} 两</p><div class="settlement-progress-label"><span>准备度 ${number(research.before)}% → ${number(research.after)}%</span><b>+${number(research.gain)}%</b></div><div class="settlement-research-progress" role="progressbar" aria-label="${esc(research.name)}准备度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${research.after}"><span data-progress-from="${research.before}" data-progress-to="${research.after}" style="width:${animate ? research.before : research.after}%"></span></div><small>${research.after >= 100 ? '准备已足，等待验收' : '指令保留，下季继续研制'} · 本次推进胜算 ${research.chance}%</small></article>`).join('')}</div>` : '<p class="settlement-empty">本季没有研究安排，工部团队待命。</p>'}</section>
    <section class="settlement-battles"><header><h3>兵部 · 战损与补充</h3><span>工业新增兵员 +${number(report.reinforcements)}</span></header>${report.battles.length ? `<div class="settlement-battle-grid">${report.battles.map(battle => `<article class="settlement-battle-card"><h4>${esc(battle.name)}</h4><div class="settlement-force-row"><span>我军</span><strong>${count(battle.playerBefore,battle.playerAfter,animate)}<em>人</em></strong><small>损失 −${number(battle.playerLosses)} · 补员 +${number(battle.reinforcements)}</small></div><div class="settlement-force-row enemy"><span>敌军</span><strong>${count(battle.enemyBefore,battle.enemyAfter,animate)}<em>人</em></strong><small>歼灭 ${number(battle.enemyLosses)} · 敌补 +${number(battle.enemyReinforcements)}</small></div></article>`).join('')}</div>` : '<p class="settlement-empty">本季尚无战线交锋，兵员继续储备。</p>'}<p class="settlement-reserve">预备兵 ${number(report.reserveBefore)} → <b>${count(report.reserveBefore,report.reserveAfter,animate)}</b> 人</p>${report.newFronts.length ? `<p class="settlement-new-front">新军情：${report.newFronts.map(id => esc(frontNames[id] || id)).join('、')}战线出现。阅毕后请前往救亡方略安排驻军。</p>` : ''}</section>
    <section class="settlement-treasury"><header><h3>户部 · 本季收支</h3><span>净变动 ${signed(report.netIncome)} 两</span></header><div class="settlement-cash-columns"><div><span>收入</span><b class="positive">+${number(report.income)} 两</b><ul>${report.incomeItems.map(item => `<li><span>${esc(item.label)}</span><strong>+${number(item.amount)}</strong></li>`).join('')}</ul></div><div><span>支出</span><b class="negative">−${number(report.expenses)} 两</b><ul>${report.expenseItems.map(item => `<li><span>${esc(item.label)}</span><strong>−${number(item.amount)}</strong></li>`).join('') || '<li>本季没有研究支出</li>'}</ul></div></div></section>
    ${events.length ? `<section class="settlement-events"><header><h3>交接 · 民间奏报</h3><span>奖励已计入本季结算</span></header>${events.map(event => `<article class="settlement-event-card" data-settlement-event-id="${event.id}"><h4>第 ${event.turn} 季 · ${esc(event.title)}</h4>${eventRewards(event,animate)}</article>`).join('')}</section>` : ''}
    <div class="modal-actions"><button class="small-button primary" data-action="settlement-continue">${report.status === 'playing' ? events.length ? '阅毕，查看新季奏报' : '阅毕，继续新季' : '阅毕，查看本局结局'}</button></div></div>`;
}

/** Presentation only: all game changes were committed before this animation starts. */
export function animateTurnSummary(root, { reducedMotion = false, duration = 1200, requestFrame = requestAnimationFrame, cancelFrame = cancelAnimationFrame } = {}) {
  const counters = [...root.querySelectorAll('[data-count-to]')].map(element => ({ element, from: Number(element.dataset.countFrom), to: Number(element.dataset.countTo) }));
  const bars = [...root.querySelectorAll('[data-progress-to]')];
  let frame = null, start = null, cancelled = false;
  function update(progress) {
    for (const { element, from, to } of counters) element.textContent = number(from + (to-from)*progress);
    for (const bar of bars) {
      const from = Number(bar.dataset.progressFrom), to = Number(bar.dataset.progressTo);
      bar.style.width = `${from+(to-from)*progress}%`;
    }
  }
  function tick(time) {
    if (cancelled) return;
    start ??= time;
    const elapsed = Math.min(1,(time-start)/duration), progress = 1-Math.pow(1-elapsed,3);
    update(progress);
    if (elapsed < 1) frame = requestFrame(tick);
  }
  if (reducedMotion || duration <= 0) update(1); else frame = requestFrame(tick);
  return () => { cancelled = true; if (frame !== null) cancelFrame(frame); };
}
