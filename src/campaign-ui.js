import { SPECIALTIES, getRecruitmentInfo, getCombatRating } from './game.js';
import { formatSilver as silver } from './format.js';
import { icon } from './icons.js';
import { teamPortrait } from './artwork.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const number = value => Math.round(Number(value) || 0).toLocaleString('zh-CN');
const meter = value => `<div class="progress-track"><span style="width:${Math.max(0, Math.min(100, value))}%"></span></div>`;

function teamCard(team, candidate, info) {
  const queued = !candidate && team.activity?.kind === 'research' && team.canAssign !== false && team.available === false;
  const strongest = Object.entries(team.specialties).sort((a,b) => b[1]-a[1]).slice(0,2).map(([id]) => id);
  return `<article class="team-card ${candidate?'candidate':''} ${team.available===false&&!candidate?'occupied':''}">
    <header>${teamPortrait(team,'large')}<div><small>${candidate?'待聘人才':queued?'已安排研制':team.available?'本季待命':'本季已派遣'}</small><h3>${esc(team.name)}</h3></div></header>
    <div class="specialty-grid">${SPECIALTIES.map(s=>`<div class="specialty ${strongest.includes(s.id)?'strong':''}"><span>${esc(s.name)}</span><b>${team.specialties[s.id]}</b>${meter(team.specialties[s.id])}</div>`).join('')}</div>
    <footer>${candidate?`<div><small>一次性聘银</small><strong>${silver(team.hireCost)} 两</strong></div><button class="small-button primary" data-action="hire-team" data-id="${team.id}" ${team.canHire?'':'disabled'}>延请入署</button>`:`<span>${queued?'研究指令持续执行，可在密录取消或改派':team.available?'可参与科技、营建或操演':'本季差事已毕，下季可另行安排'}</span><button class="text-button dismiss-team" data-action="dismiss-team" data-id="${team.id}" ${team.canDismiss?'':'disabled'}>解雇 · 威望 −${info.dismissPrestigeCost}</button>`}</footer>
    ${candidate&&!team.canHire?`<p class="team-reason">${esc(team.reason)}</p>`:!candidate&&!team.canDismiss?`<p class="team-reason">${esc(team.dismissReason)}</p>`:''}
  </article>`;
}

export function teamsPage(state, tab = 'roster') {
  const info = getRecruitmentInfo(state);
  const recruiting = tab === 'recruit';
  return `<div class="personnel-tabs" role="group" aria-label="团队与招募"><button data-action="team-tab" data-id="roster" class="${recruiting?'':'selected'}" aria-pressed="${!recruiting}">在署团队 <b>${info.teamCount} / ${info.maxTeams}</b></button><button data-action="team-tab" data-id="recruit" class="${recruiting?'selected':''}" aria-pressed="${recruiting}">招募人才 <b>${info.candidates.length} 位候选</b></button></div>
    ${recruiting?`<div class="recruitment-banner"><div><h3>招贤榜</h3><p>征召更换整份名单；雇佣时另付聘银，入署即可派遣。</p></div><button class="small-button primary" data-action="refresh-candidates" ${info.canRefresh?'':'disabled'}>${icon('restart')} 招募新名单 · ${silver(info.refreshCost)} 两</button></div>${!info.canRefresh?`<p class="team-reason">${esc(info.refreshReason)}</p>`:''}<div class="team-grid candidate-grid">${info.candidates.map(team=>teamCard(team,true,info)).join('')||'<p class="recruit-empty">当前名单已无候选，可拨银再开招贤榜。</p>'}</div>`:`<p class="personnel-guide">洋务助起步，数理攻难关，管理成规模。研究指令持续执行，其余差事每队每季一项；解雇损失 ${info.dismissPrestigeCost} 点威望。</p><div class="team-grid">${info.teams.map(team=>teamCard(team,false,info)).join('')}</div>`}`;
}

export function enemyStrengthSelector(value = 1) {
  const numeric = Number(value);
  const strength = Math.min(10, Math.max(.1, Number.isFinite(numeric) ? numeric : 1)).toFixed(2);
  return `<section class="enemy-strength-setting" aria-labelledby="enemy-strength-label">
    <div class="enemy-strength-heading"><span id="enemy-strength-label">敌军战斗力系数</span><output for="enemy-strength-range enemy-strength-number" data-enemy-strength-output aria-live="polite">×${strength}</output></div>
    <div class="enemy-strength-controls"><div class="enemy-strength-slider"><input id="enemy-strength-range" type="range" min="0.10" max="10.00" step="0.01" value="${strength}" data-enemy-strength aria-label="敌军战斗力系数" aria-describedby="enemy-strength-hint"><div class="enemy-strength-scale" aria-hidden="true"><span>0.10</span><span>10.00</span></div></div><label class="enemy-strength-exact" for="enemy-strength-number"><span>精确数值</span><input id="enemy-strength-number" name="enemyStrength" type="number" min="0.10" max="10.00" step="0.01" value="${strength}" inputmode="decimal" data-enemy-strength-number aria-label="敌军战斗力系数精确数值" aria-describedby="enemy-strength-hint" required></label></div>
    <small id="enemy-strength-hint">1.00 为基准，10.00 为十倍。每次可调整 0.01，仅影响敌军单兵战斗力；开局后固定。</small>
  </section>`;
}

function battleFigures(battle, previous = false) {
  return `<dl class="battle-figures"><div><dt>歼敌</dt><dd>${number(battle.enemyLosses)}</dd></div><div><dt>敌军补充</dt><dd>+${number(battle.enemyReinforcements)}</dd></div><div><dt>我军损失</dt><dd class="loss">−${number(battle.playerLosses)}</dd></div><div><dt>${previous ? '实际补员' : '持续补员额度'}</dt><dd>+${number(previous ? battle.reinforcements : battle.replacementCapacity)}</dd></div></dl>`;
}

function frontCard(front, state) {
  const forecast = front.forecast;
  const suppressed = front.troops <= front.victoryThreshold;
  const remainsSuppressed = suppressed && front.troops - forecast.enemyLosses + forecast.enemyReinforcements <= front.victoryThreshold;
  const stable = remainsSuppressed || front.assigned > 0 && forecast.sustainable && forecast.enemyDeclining;
  const warning = front.troops >= front.defeatThreshold * .8;
  const editable = state.status === 'playing' && !state.pending;
  const enemyTrend = forecast.enemyLosses > forecast.enemyReinforcements ? '敌军正在缩减' : forecast.enemyLosses === forecast.enemyReinforcements ? '敌军兵力持平' : '敌军仍在增长';
  const outlook = suppressed ? remainsSuppressed ? '敌势已压在平定线内 · 维持当前防务' : '当前已平定 · 本季可能回升越过平定线' : front.assigned === 0 ? '尚未出兵 · 敌军继续扩张' : !forecast.sustainable ? `损失超过持续补充 · ${enemyTrend}` : `${forecast.enemyDeclining ? '可持续剿灭' : forecast.enemyLosses === forecast.enemyReinforcements ? '歼敌与补充相抵' : '歼敌少于补充'} · ${enemyTrend}`;
  return `<article class="warfront-card ${suppressed ? 'suppressed' : ''} ${warning ? 'at-risk' : ''}" data-front="${front.id}">
    <header><div class="warfront-heading">${icon('flag')}<h4>${esc(front.name)}</h4></div><span class="front-condition ${stable ? 'stable' : 'strained'}">${suppressed ? '敌势受控' : warning ? '濒临失守' : '持续战事'}</span></header>
    <p class="front-character">${esc(front.description)}</p>
    <div class="enemy-strength-row"><div><small>敌军总兵力</small><strong>${number(front.troops)}<em>人</em></strong></div><p>失守线 <b>${number(front.defeatThreshold)}</b><br>平定线 ≤ <b>${number(front.victoryThreshold)}</b></p></div>
    <div class="enemy-pressure" role="meter" aria-label="${esc(front.name)}失守风险" aria-valuemin="0" aria-valuemax="${front.defeatThreshold}" aria-valuenow="${Math.min(front.troops,front.defeatThreshold)}"><span style="width:${Math.max(0,Math.min(100,front.troops/front.defeatThreshold*100))}%"></span><i style="left:${Math.min(100,front.victoryThreshold/front.defeatThreshold*100)}%"></i></div>
    <div class="front-garrison"><span>驻军 <b>${number(front.assigned)}</b> 人</span><span>目标 <b>${number(front.target)}</b> 人</span></div>
    <form class="front-orders" data-front-orders="${front.id}"><label>驻军 / 自动补员目标<input name="target" type="number" min="0" max="1000000" step="1" value="${front.target}" inputmode="numeric" aria-label="${esc(front.name)}驻军目标" ${editable ? '' : 'disabled'} required></label><label>敌军每季参战上限<input name="battleCap" type="number" min="1" max="${front.maxTroops}" step="1" value="${front.battleCap}" inputmode="numeric" aria-label="${esc(front.name)}敌军参战上限" ${editable ? '' : 'disabled'} required></label><div class="front-order-actions"><button type="button" class="text-button" data-action="withdraw-front" data-id="${front.id}" ${editable && front.target > 0 ? '' : 'disabled'}>撤回驻军</button><button type="submit" class="small-button primary" ${editable ? '' : 'disabled'}>下达军令</button></div></form>
    <div class="front-forecast"><div class="front-report-heading"><h5>本季推演</h5><span>敌参战 ${number(forecast.enemyCommitted)} · 我参战 ${number(forecast.playerCommitted)}</span></div>${battleFigures(forecast)}<p class="front-outlook ${stable ? 'stable' : 'strained'}">${esc(outlook)}</p><p class="front-power">单兵效能：我军 ${Number(front.playerPower).toFixed(2)} / 敌军 ${Number(front.enemyPower).toFixed(2)} · 装备、操练与兵种配套均计入</p></div>
    ${front.lastBattle ? `<details class="front-last-battle"><summary>第 ${front.lastBattle.turn} 季战报 · 敌余 ${number(front.lastBattle.enemyAfter)} / 我余 ${number(front.lastBattle.playerAfter)}</summary>${battleFigures(front.lastBattle,true)}</details>` : '<p class="front-no-report">尚无交战记录，结束本季后自动结算。</p>'}
    <details class="front-limits"><summary>敌军规模边界</summary><p>保底 ${number(front.minTroops)} 人，封顶 ${number(front.maxTroops)} 人。参战上限只限制本季交锋兵力，总兵力仍会因补充与战损增减。</p></details>
  </article>`;
}

export function combatPanel(state) {
  const rating = getCombatRating(state);
  return `<section class="combat-panel"><div class="section-heading"><h3>持续剿灭 · ${esc(rating.doctrine.name)}</h3><span>敌军战斗力 ×${rating.enemyMultiplier.toFixed(2)}</span></div>
    <div class="combat-factors war-supply"><div><small>我军总兵力</small><strong>${number(rating.totalTroops)}<em>人</em></strong><p>预备兵 ${number(rating.reserve)} 人，可调往任一已出现战线</p></div><div><small>工业 · 每季新增补充</small><strong>+${number(rating.reinforcements)}<em>人</em></strong><p>各线共用；持续战损超过补充，军队将逐渐萎缩</p></div><div><small>主力装备 · 训练 ${number(rating.training)} / 100</small><strong class="combat-equipment">${esc(rating.equipmentName)}</strong><p>炮兵：${esc(rating.artilleryName)}</p></div></div>
    <p class="front-support-note">${rating.hasArtillery ? '炮兵配套齐备' : '炮兵配套未齐'} · ${rating.hasCavalry ? '骑兵配套齐备' : '骑兵配套未齐'}。成套装备与对应兵种操练共同决定配套是否生效。</p>
    ${rating.fronts.length ? `<p class="front-orders-guide">下达军令后，驻军每季自动剿灭并补向目标人数。提高目标会调入预备兵，降低目标会撤回多余兵力；兵源不足时等待后续补充。补员优先弥补本季战损，剩余再填驻军缺口；预备兵可暂时补足。</p><div class="warfront-grid">${rating.fronts.map(front => frontCard(front,state)).join('')}</div>` : `<div class="war-peace"><span>${icon('shield')}</span><h4>暂无可部署战线。</h4><p>战线军情会显示在此处。持续研究工艺、补充兵员与组织操演，按已出现的敌情安排驻军。</p></div>`}
    <details class="industry-ledger"><summary>查看供军工艺 · 产能 ${number(rating.industrialCapacity)}</summary><div>${(rating.industries||[]).map(item=>`<p><span>${esc(item.name||item.label||item.family)}</span><strong>${esc(item.projectName||item.source||'尚未完成')}</strong></p>`).join('')||'<p>尚无已完成的供军工艺。</p>'}</div></details>
  </section>`;
}
