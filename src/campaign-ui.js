import { SPECIALTIES, getRecruitmentInfo, getCombatRating } from './game.js';
import { formatSilver as silver } from './format.js';
import { icon } from './icons.js';
import { teamPortrait } from './artwork.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const number = value => Math.round(Number(value) || 0).toLocaleString('zh-CN');
const meter = value => `<div class="progress-track"><span style="width:${Math.max(0, Math.min(100, value))}%"></span></div>`;

function teamCard(team, candidate, info) {
  const strongest = Object.entries(team.specialties).sort((a,b) => b[1]-a[1]).slice(0,2).map(([id]) => id);
  return `<article class="team-card ${candidate?'candidate':''} ${team.available===false&&!candidate?'occupied':''}">
    <header>${teamPortrait(team,'large')}<div><small>${candidate?'待聘人才':team.available?'本季待命':'本季已派遣'}</small><h3>${esc(team.name)}</h3></div></header>
    <div class="specialty-grid">${SPECIALTIES.map(s=>`<div class="specialty ${strongest.includes(s.id)?'strong':''}"><span>${esc(s.name)}</span><b>${team.specialties[s.id]}</b>${meter(team.specialties[s.id])}</div>`).join('')}</div>
    <footer>${candidate?`<div><small>一次性聘银</small><strong>${silver(team.hireCost)} 两</strong></div><button class="small-button primary" data-action="hire-team" data-id="${team.id}" ${team.canHire?'':'disabled'}>延请入署</button>`:`<span>${team.available?'可参与科技、营建或操演':'下季恢复待命'}</span><button class="text-button dismiss-team" data-action="dismiss-team" data-id="${team.id}" ${team.canDismiss?'':'disabled'}>解雇 · 威望 −${info.dismissPrestigeCost}</button>`}</footer>
    ${candidate&&!team.canHire?`<p class="team-reason">${esc(team.reason)}</p>`:!candidate&&!team.canDismiss?`<p class="team-reason">${esc(team.dismissReason)}</p>`:''}
  </article>`;
}

export function teamsPage(state, tab = 'roster') {
  const info = getRecruitmentInfo(state);
  const recruiting = tab === 'recruit';
  return `<div class="personnel-tabs" role="group" aria-label="团队与招募"><button data-action="team-tab" data-id="roster" class="${recruiting?'':'selected'}" aria-pressed="${!recruiting}">在署团队 <b>${info.teamCount} / ${info.maxTeams}</b></button><button data-action="team-tab" data-id="recruit" class="${recruiting?'selected':''}" aria-pressed="${recruiting}">招募人才 <b>${info.candidates.length} 位候选</b></button></div>
    ${recruiting?`<div class="recruitment-banner"><div><h3>招贤榜</h3><p>征召更换整份名单；雇佣时另付聘银，入署即可派遣。</p></div><button class="small-button primary" data-action="refresh-candidates" ${info.canRefresh?'':'disabled'}>${icon('restart')} 招募新名单 · ${silver(info.refreshCost)} 两</button></div>${!info.canRefresh?`<p class="team-reason">${esc(info.refreshReason)}</p>`:''}<div class="team-grid candidate-grid">${info.candidates.map(team=>teamCard(team,true,info)).join('')||'<p class="recruit-empty">当前名单已无候选，可拨银再开招贤榜。</p>'}</div>`:`<p class="personnel-guide">洋务助起步，数理攻难关，管理成规模。每队每季一项差事；解雇损失 ${info.dismissPrestigeCost} 点威望。</p><div class="team-grid">${info.teams.map(team=>teamCard(team,false,info)).join('')}</div>`}`;
}

export function combatPanel(state) {
  const rating = getCombatRating(state);
  return `<section class="combat-panel"><div class="section-heading"><h3>京师决战推演 · ${esc(rating.doctrine.name)}</h3><span>两线均足以御敌，即可守住北京</span></div>
    <div class="combat-factors"><div><small>工业 · 可供养兵力</small><strong>${number(rating.quantity*100)}<em>人</em></strong><p>现有供给能够维持的军队规模</p></div><div><small>军械 · 主力装备</small><strong class="combat-equipment">${esc(rating.equipmentName)}</strong><p>炮兵：${esc(rating.artilleryName)}</p></div><div><small>军制 · 训练度</small><strong>${number(rating.training)}<em>/ 100</em></strong><p>主力操练、军纪与协同的综合表现</p></div></div>
    <div class="front-grid">${rating.fronts.map(front=>`<article class="front-card ${front.done?'ready':''}"><div>${icon(front.done?'shield':'flag')}<h4>${esc(front.name)}</h4><strong>${Number(front.score).toFixed(1)}<small> / ${front.target}</small></strong></div>${meter(front.score/front.target*100)}<p>${front.done?'足以御敌':'仍需补强工业、军械或训练'}</p></article>`).join('')}</div>
    <details class="industry-ledger"><summary>查看供军工艺</summary><div>${(rating.industries||[]).map(item=>`<p><span>${esc(item.name||item.label||item.family)}</span><strong>${esc(item.projectName||item.source||'尚未完成')}</strong></p>`).join('')||'<p>尚无已完成的供军工艺。</p>'}</div></details>
  </section>`;
}
