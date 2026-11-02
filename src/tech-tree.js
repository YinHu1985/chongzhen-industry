import * as game from './game.js';
import { formatSilver as silver } from './format.js';
import { technologyArt, teamPortrait, milestoneIcons } from './artwork.js';
import { icon as defaultIcon } from './icons.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number = value => Math.round(Number(value) || 0);
const percent = value => Math.max(0, Math.min(100, number(value)));
const fallbackCategories = [
  {id:'industry',name:'工业',description:'矿冶、动力与制造能力',color:'#9c7841'},
  {id:'arms',name:'军械',description:'兵器、枪炮与配套弹药',color:'#9e5742'},
  {id:'army',name:'军制',description:'练兵、军官与供军体系',color:'#617847'},
];
const categoryList = () => game.TECH_CATEGORIES || fallbackCategories;
const projects = () => game.PROJECTS.filter(p => !p.automatic);
const categoryOf = project => project.category || (project.branch === 'army' ? 'army' : ['smallarms','artillery'].includes(project.branch) ? 'arms' : 'industry');
const milestones = state => game.getMilestones ? game.getMilestones(state) : [];
const categoryId = id => categoryList().some(c => c.id === id) ? id : 'industry';
const isComplete = (state,id) => Boolean(state.projects?.[id]?.completed);
const makeIcon = (icon,name) => typeof icon === 'function' ? icon(name) : '';

/** The card always remains present; status affects its treatment, not its visibility. */
export function researchStatus(info, state) {
  if(info.completed) return {id:'completed',label:'已完成',tone:'complete'};
  if(info.locked) return {id:'locked',label:'条件未达',tone:'locked'};
  if(info.isAssigned && info.progress < 100) return {id:'queued',label:'持续研究',tone:'invested'};
  if(info.canTest) return {id:'ready',label:'可验收',tone:'ready'};
  if(!info.canInvest) {
    const label = Array.isArray(info.availableTeams) && !info.availableTeams.some(t => t.available) ? '待团队' : '暂不可安排';
    return {id:'waiting',label,tone:'waiting'};
  }
  return {id:'available',label:'可研究',tone:'available'};
}

/** No family or milestone completion hides another research option. */
export function researchCards(state, category = 'industry') {
  return projects().filter(p => categoryOf(p) === categoryId(category)).map(project => {
    const info = game.getProjectInfo(state,project.id);
    return {project,info,status:researchStatus(info,state)};
  });
}

function milestoneStrip(state, selection, icon = defaultIcon) {
  const list = milestones(state), completed = list.filter(m => m.completed).length;
  return `<section class="research-milestones" aria-label="救亡里程碑"><div class="milestone-heading"><span><b>救亡里程碑</b><small>积累共同能力，逐步点亮国运</small></span><strong>${completed}<em> / ${list.length}</em></strong></div><div class="milestone-grid" style="--milestone-count:${list.length || 1}">${list.map(m => {
    const required = (m.requirements || []).map(r => `${r.label || r.family} ${r.current ?? 0}/${r.minLevel}`).join('；');
    const facilities = (m.missingFacilities || []).map(id => game.FACILITIES.find(f => f.id === id)?.name || id);
    const caption = m.completed ? '已达成' : facilities.length ? `待营建 · ${facilities[0]}` : `${percent(m.progress)}% 条件齐备`;
    return `<button class="milestone-item ${m.completed?'is-complete':''} ${selection===m.id?'is-selected':''}" data-action="select-milestone" data-id="${esc(m.id)}" data-milestone="${esc(m.id)}" aria-pressed="${selection===m.id}" title="${esc([m.description,required,facilities.length?`需建成：${facilities.join('、')}`:''].filter(Boolean).join(' · '))}"><div class="milestone-mark" data-symbol="${milestoneIcons[m.id]}">${makeIcon(icon,milestoneIcons[m.id])}${m.completed?'<span class="milestone-tick">✓</span>':''}</div><strong>${esc(m.name)}</strong><small>${esc(caption)}</small><div class="milestone-progress"><i style="width:${m.completed?100:percent(m.progress)}%"></i></div></button>`;
  }).join('')}</div></section>`;
}

function milestoneInspector(state, selection, icon) {
  const m = milestones(state).find(item => item.id === selection);
  if(!m) return '';
  return `<section class="milestone-inspector" aria-label="${esc(m.name)}达成条件"><header><div><span>里程碑 · ${m.completed?'已达成':'达成方法'}</span><h4>${makeIcon(icon,milestoneIcons[m.id])}${esc(m.name)}</h4></div><button data-action="close-milestone" aria-label="收起里程碑详情">${makeIcon(icon,'close')}</button></header><p>${esc(m.description)}</p><div class="milestone-requirements">${(m.requirements || []).map(r => {
    const candidates = projects().filter(p => p.family === r.family && Number(p.level) >= Number(r.minLevel));
    return `<div class="milestone-requirement ${r.done?'is-complete':''}"><div class="milestone-requirement-label"><strong>${r.done?'✓':'◇'} ${esc(r.label || r.family)}</strong><span>已有 ${r.current ?? 0} / 所需 ${r.minLevel}</span></div><small>完成下列任一工艺即可满足此项：</small><div class="milestone-candidates">${candidates.map(p => `<button data-action="select-tech" data-id="${p.id}" class="${isComplete(state,p.id)?'is-complete':''}">${esc(p.name)}${isComplete(state,p.id)?' ✓':''}</button>`).join('') || '<span>需继续提升相关工业能力。</span>'}</div></div>`;
  }).join('')}${(m.facilityRequirements || []).length?`<div class="milestone-requirement"><div class="milestone-requirement-label"><strong>工场条件</strong><span>以下工场均须建成</span></div><div class="milestone-candidates">${m.facilityRequirements.map(id => `<button class="${state.facilities?.[id]?'is-complete':''}" data-action="facility-detail" data-id="${id}">${makeIcon(icon,'building')}${esc(game.FACILITIES.find(f=>f.id===id)?.name || id)}${state.facilities?.[id]?' ✓':''}</button>`).join('')}</div></div>`:''}</div><p class="milestone-inspector-note">同类工艺取最高贡献。已达成后，其他工艺依然可以继续研究。</p></section>`;
}

export function milestonePopup(state, selection, {icon} = {}) {
  if(!milestones(state).some(m=>m.id===selection)) return '';
  return `<section class="milestone-popup" role="dialog" aria-label="里程碑详情">${milestoneInspector(state,selection,icon)}</section>`;
}

function specialtyName(id) { return (game.SPECIALTIES || []).find(s => s.id === id)?.name || id; }
function specialtyTags(project) {
  return `<div class="research-specialties">${Object.entries(project.specialtyRequirements || {}).map(([id,weight])=>`<span>${esc(specialtyName(id))}<i>×${weight}</i></span>`).join('')}</div>`;
}

export function teamRail(state, ui, icon) {
  return `<aside class="research-team-rail" aria-label="技术团队"><header><span>技术团队 <small>${state.teams.length}</small></span><button data-action="open-panel" data-panel="teams">招贤 ${makeIcon(icon,'chevron')}</button></header><div class="research-team-list">${state.teams.map(team=>{
    const task=game.getTeamActivity(state,team.id);
    const skills=Object.entries(team.specialties).sort((a,b)=>b[1]-a[1]).slice(0,2).map(([id,value])=>`${specialtyName(id)} ${value}`).join(' · ');
    const work=task.active?task.name:task.currentTurn&&task.kind!=='idle'?task.name:'尚未安排研究';
    return `<button class="research-team-card ${ui.selectedResearchTeamId===team.id?'is-selected':''} ${!task.available?'is-busy':''}" data-action="inspect-team" data-id="${team.id}" aria-pressed="${ui.selectedResearchTeamId===team.id}"><div class="team-card-identity">${teamPortrait(team)}<div class="team-card-label"><div class="team-card-heading"><strong title="${esc(team.name)}">${esc(team.name)}</strong><small>${esc(task.statusLabel)}</small></div><p class="team-card-work">${esc(work)}</p></div></div><div class="team-card-progress"><span style="width:${task.active?percent(task.progress):0}%"></span></div><div class="team-card-meta"><small>${esc(skills)}</small><b>${task.active?`${percent(task.progress)}%`:'—'}</b></div></button>`;
  }).join('')}</div><p class="team-rail-note">每队每季一项差事<br>设定目标后，每季自动攻关</p></aside>`;
}

/** Selection only previews a pairing; assigning work requires an explicit standing order. */
export function selectResearchTeam(state, ui, teamId) {
  const team=state.teams.find(t=>t.id===teamId);
  if(!team) return {...ui};
  const task=game.getTeamActivity(state,team.id);
  const project=task.active?projects().find(p=>p.id===task.projectId):null;
  return {...ui,selectedResearchTeamId:team.id,techSelection:project?.id||null,
    techCategory:project?categoryOf(project):ui.techCategory,techQuery:project?'':ui.techQuery};
}

export function selectResearchTechnology(state, ui, projectId) {
  const project=projects().find(p=>p.id===projectId);
  if(!project) return {...ui};
  const owner=state.teams.find(team=>{
    const task=game.getTeamActivity(state,team.id);
    return task.active&&task.projectId===project.id;
  });
  const selected=state.teams.find(team=>team.id===ui.selectedResearchTeamId);
  return {...ui,techSelection:project.id,selectedResearchTeamId:owner?.id||selected?.id||null,
    techCategory:categoryOf(project),techQuery:''};
}

export function researchSelection(state, ui) {
  const projectId=projects().some(p=>p.id===ui.techSelection)?ui.techSelection:null;
  const team=state.teams.find(t=>t.id===ui.selectedResearchTeamId)||null;
  return {projectId,teamId:team?.id||null,team,task:team?game.getTeamActivity(state,team.id):null};
}

function detailDock(state,ui,icon) {
  const selected=researchSelection(state,ui);
  return `<section class="research-detail-dock" aria-label="团队与研究详情">${techDetails(state,selected.projectId,{icon,teamId:selected.teamId})}</section>`;
}

export function researchBoard(state, ui = {}, {icon} = {}) {
  const category=categoryId(ui.techCategory),categories=categoryList();
  const allCards=researchCards(state,category),query=String(ui.techQuery||'').trim().toLowerCase();
  const cards=allCards.filter(({project})=>!query||[project.name,project.contribution,...(project.tags||[])].join(' ').toLowerCase().includes(query));
  const selected=researchSelection(state,ui);
  return `<section class="research-board" aria-label="天工密录">${milestoneStrip(state,ui.milestoneSelection,icon||defaultIcon)}<div class="research-workspace">${teamRail(state,ui,icon)}<section class="research-main"><div class="research-navigation"><nav class="research-tabs" aria-label="科技分类">${categories.map(c=>{
    const list=researchCards(state,c.id),done=list.filter(p=>p.info.completed).length;
    return `<button class="research-tab ${c.id===category?'is-active':''}" data-action="select-category" data-category="${c.id}" aria-pressed="${c.id===category}"><b>${esc(c.name)}</b><small>${done}/${list.length}</small></button>`;
  }).join('')}</nav><form id="tech-search" class="research-search"><label for="tech-query" class="sr-only">查找科技</label><input id="tech-query" name="query" value="${esc(ui.techQuery||'')}" placeholder="查找科技…" autocomplete="off"><button type="submit">查找</button></form></div><div class="research-card-scroll"><div class="research-card-grid">${cards.map(({project,info,status})=>`<button class="research-card is-${status.tone} ${selected.projectId===project.id?'is-selected':''}" data-action="select-tech" data-id="${project.id}" data-status="${status.id}" aria-label="${esc(project.name)}，${status.label}" aria-pressed="${selected.projectId===project.id}" title="${esc(info.locked?info.missing.join('；'):project.contribution)}"><img class="research-card-art" src="${technologyArt(project.id)}" alt="" width="640" height="427" loading="lazy" decoding="async"><h4>${esc(project.name)}</h4><div class="research-card-bottom"><span class="research-card-status">${status.id==='completed'?'✓ ':''}${status.label}</span><b>${info.completed?'成':`${percent(info.progress)}%`}</b></div><div class="research-card-progress"><i style="width:${percent(info.progress)}%"></i></div></button>`).join('')||'<div class="research-empty">此分类中未找到相关科技。</div>'}</div></div></section>${detailDock(state,ui,icon)}</div></section>`;
}

function teamResearchControls(state,team,project,icon) {
  const task=team?game.getTeamActivity(state,team.id):null;
  const sameProject=Boolean(task?.active&&task.projectId===project?.id);
  const canInvest=Boolean(team&&project?.selectedTeamId===team.id&&project.canInvest&&!sameProject);
  const canCancel=Boolean(team&&task?.active&&state.status==='playing'&&!state.pending);
  const work=!team?'选择团队安排研究；已有准备即可独立验收。':task?.active?`研究目标：${task.name} · ${percent(task.progress)}%`:task?.currentTurn&&task.kind!=='idle'?`${task.name} · ${task.statusLabel}`:'尚未设定研究目标。';
  const note=!project?'选中科技可设定目标；有准备度即可随时验收。':project.completed?'成果已生效，可继续安排其他研究。':project.progress>=100?'准备已满，自动研究暂停收费；可验收或更换目标。':project.locked?'补齐前置条件后即可安排研究。':!team?'验收无需团队；安排研究请先选择团队。':team.usedTurn===state.turn?'本组本季已营建或操演，下季可安排研究。':sameProject?'季末统一扣款并推进，持续至100%、验收完成或取消。':task?.active?`设为目标后改研本项，${task.name}保留准备度。`:'设定目标不会立即扣款；季末按预计开销统一结算。';
  const forecast=project&&!project.completed&&team&&project.progress<100?`每季 ${silver(project.investCost)}两 · 推进 ${project.researchChance}%（+${project.progressGain}% / +${project.failureProgressGain}%）`:project?.completed?'已完成验收，成果即刻生效。':project?.progress>=100?'准备已满，本项不再产生科研开销。':project?'选定团队后显示每季开销与推进胜算。':'科研开销在结束本季时支付。';
  const investLabel=project?.completed?'已完成':sameProject?(task?.queued?'持续研究中':'准备已满'):task?.active?'更换目标':'设为目标';
  return `<section class="detail-team" ${team?`data-team-id="${team.id}"`:''} aria-label="技术团队与研究进度"><header class="team-control-heading">${teamPortrait(team,'inline')}<span class="detail-catalogue">技术团队</span><h3 title="${esc(team?.name||'尚未选择团队')}">${esc(team?.name||'尚未选择团队')}</h3><span class="status-badge ${task?.available?'is-ready':'is-invested'}">${esc(task?.statusLabel||'待选择')}</span></header><div class="team-detail-specialties">${(game.SPECIALTIES||[]).map(skill=>`<div class="${project?.specialtyRequirements?.[skill.id]?'is-relevant':''}"><span>${esc(skill.name)}</span><b>${team?number(team.specialties[skill.id]):'—'}</b></div>`).join('')}</div><p class="team-detail-work" title="${esc(work)}">${esc(work)}</p><div class="team-research-progress"><div class="detail-metrics"><span>准备度 <b>${project?`${percent(project.progress)}%`:'—'}</b></span><span>验收胜算 <b>${project?`${project.successChance}%`:'—'}</b></span></div><div class="progress-track"><span style="width:${project?percent(project.progress):0}%"></span></div><p class="detail-forecast" title="${esc(forecast)}">${esc(forecast)}</p><div class="detail-buttons"><button class="small-button primary" data-action="invest" data-id="${esc(project?.id||'')}" data-team-id="${esc(team?.id||'')}" ${canInvest?'':'disabled'}>${investLabel}</button>${task?.active?`<button class="small-button cancel-research" data-action="cancel-research" data-team-id="${esc(team?.id||'')}" ${canCancel?'':'disabled'}>取消研究</button>`:''}<button class="small-button" data-action="test" data-id="${esc(project?.id||'')}" ${project?.canTest?'':'disabled'}>${project?.completed?'验收通过':project?`验收 · ${silver(project.testCost)}两`:'验收'}</button></div><p class="research-operation-note" title="${esc(note)}">${esc(note)}</p></div></section>`;
}

function effectSummary(project) {
  if(project.capacity) return `${project.familyName} · 供军产能 +${project.capacity}`;
  if(project.equipment) return `${project.familyName} · 装备效能 ${project.equipment.toFixed(2)}${['firearms','artillery'].includes(project.family)?' · 需配套弹药':''}`;
  return project.contribution.replace(/；用于里程碑、配套或训练条件，同类取最高。$/, '');
}

export function techDetails(state,id,{icon,teamId} = {}) {
  const team=state.teams.find(t=>t.id===teamId)||null;
  const p=id?game.getProjectInfo(state,id,team?.id):null;
  const teamHtml=teamResearchControls(state,team,p,icon);
  if(!p) return `<aside class="tech-detail-horizontal" data-empty-research="true">${teamHtml}<section class="detail-overview detail-empty" aria-label="科技作用与前置"><header><span class="detail-catalogue">科技作用与前置</span></header><h3>选择一项科技</h3><p>${team?'团队已选定，点击上方科技查看作用与前置条件。':'点击上方科技，查看作用与前置条件。'}</p></section><section class="detail-background detail-empty" aria-label="工艺背景"><header><span class="detail-catalogue">工艺背景</span></header><h3>尚未选择科技</h3><p>选中科技后，查看其技术原理与历史沿革。</p></section></aside>`;
  const status=researchStatus(p,state),allMilestones=milestones(state);
  const chip=pid=>{const dep=game.PROJECTS.find(d=>d.id===pid);return dep?`<button class="dependency-chip ${isComplete(state,pid)?'complete':''}" data-action="select-tech" data-id="${pid}">${makeIcon(icon,isComplete(state,pid)?'check':'lock')}${esc(dep.name)}</button>`:'';};
  const prereqs=(p.milestoneRequirements||[]).map(mid=>{const m=allMilestones.find(m=>m.id===mid);return `<button class="dependency-chip ${m?.completed?'complete':''}" data-action="select-milestone" data-id="${mid}">${makeIcon(icon,milestoneIcons[mid])}${esc(m?.name||mid)}${m?.completed?' ✓':''}</button>`;}).join('')+(p.prerequisites||[]).map(chip).join('')+(p.facilityRequirements||[]).map(fid=>`<button class="dependency-chip ${state.facilities[fid]?'complete':''}" data-action="facility-detail" data-id="${fid}">${makeIcon(icon,'building')}${esc(game.FACILITIES.find(f=>f.id===fid)?.name||fid)}</button>`).join('');
  return `<aside class="tech-detail-horizontal" data-project-id="${id}">${teamHtml}<section class="detail-overview" aria-label="科技作用与前置"><header><span class="detail-catalogue">科技作用与前置</span><span class="status-badge is-${status.tone}" title="${esc(p.missing.join('；'))}">${status.label}</span></header><h3>${esc(p.name)}</h3><p class="detail-contribution">${esc(effectSummary(p))}</p>${specialtyTags(p)}<div class="detail-prerequisites"><h4>前置条件</h4><div class="dependency-list">${prereqs||'<span>可直接开展研究</span>'}</div></div>${p.transferBonus?`<p class="transfer-line" title="${esc(p.transferSources.join('、'))}">继承准备 ${p.transferBonus}% · 已有工艺经验</p>`:''}</section><section class="detail-background" aria-label="工艺背景"><img class="detail-background-art" src="${technologyArt(id)}" alt="" width="640" height="427" decoding="async"><header><span class="detail-catalogue">工艺背景</span>${p.source?.url?`<a href="${esc(p.source.url)}" target="_blank" rel="noopener noreferrer" title="${esc(p.source.label)}">史料参照 ↗</a>`:''}</header><p><b>概述</b>${esc(p.description)}</p><p><b>原理</b>${esc(p.technical||'')}</p><p><b>沿革</b>${esc(p.historical||'')}</p></section></aside>`;
}

export function doctrineSelector(state) {
  const list = game.DOCTRINES || [];
  const selected = state.doctrine || state.selectedDoctrine;
  return `<section class="doctrine-selector"><div class="doctrine-heading"><span>御定作战方略</span><p>装备、训练与军制共同决定战力，选择最适合现有成果的打法。</p></div><div class="doctrine-options">${list.map(d=>`<button class="doctrine-option ${selected===d.id?'is-selected':''}" data-action="select-doctrine" data-id="${d.id}" aria-pressed="${selected===d.id}" ${state.status!=='playing'?'disabled':''}><span class="doctrine-radio">${selected===d.id?'◆':'◇'}</span><span><strong>${esc(d.name)}</strong><small>${esc(d.description)}</small></span></button>`).join('')}</div></section>`;
}

