import * as game from './game.js';
import { formatSilver as silver } from './format.js';
import { technologyArt, teamPortrait } from './artwork.js';
import { icon as defaultIcon } from './icons.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number = value => Math.round(Number(value) || 0);
const percent = value => Math.max(0, Math.min(100, number(value)));
const fallbackCategories = [
  {id:'workshop',name:'基础工坊'}, {id:'furnace',name:'炼铁炉场'},
  {id:'machine_shop',name:'机械工场'}, {id:'arsenal',name:'火器工场'},
  {id:'drill_ground',name:'演武场'},
];
const categoryList = () => game.BUILDING_CATEGORIES || fallbackCategories;
const projects = () => game.PROJECTS.filter(p => !p.automatic);
const groupIdOf = project => project.researchGroup || project.facilityRequirements?.[0];
const categoryOf = project => {
  const facility=game.FACILITIES.find(f=>f.id===groupIdOf(project));
  return facility?.category || facility?.buildingId || 'workshop';
};
const categoryId = id => categoryList().some(c => c.id === id) ? id : categoryList()[0].id;
const isComplete = (state,id) => Boolean(state.projects?.[id]?.completed);
const hasFacility = (state,id) => game.hasFacility ? game.hasFacility(state,id) : Boolean(state.facilities?.[id]);
const anyGroups = record => (record.prerequisiteAny || []).length && typeof record.prerequisiteAny[0] === 'string' ? [record.prerequisiteAny] : record.prerequisiteAny || [];
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

/** A building tab includes every technology in its groups, including locked ones. */
export function researchCards(state, category = 'workshop') {
  return projects().filter(p => categoryOf(p) === categoryId(category)).map(project => {
    const info = game.getProjectInfo(state,project.id);
    return {project,info,status:researchStatus(info,state)};
  });
}

// Retain the old import while building entrances replace milestone overlays.
export function milestonePopup() { return ''; }

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

const CARD_WIDTH=144, CARD_HEIGHT=96, BUILDING_HEIGHT=CARD_HEIGHT, GRAPH_INSET=12, COLUMN_GAP=24, ROW_GAP=44;
const requiredTechnologies = record => [...(record.prerequisites || []), ...anyGroups(record).flat()];
// The previous level links related groups; combined construction does not require
// that level to have been built before the player selects a higher target.
const relatedFacilities = record => [...new Set([record.previousId, ...(record.facilityRequirements || [])].filter(Boolean))];
const technologyName = id => game.PROJECTS.find(p=>p.id===id)?.name || id;
const facilityName = id => game.FACILITIES.find(f=>f.id===id)?.name || id;
const buildingSymbol = facility => facility?.symbol || categoryList().find(c=>c.id===(facility?.category||facility?.buildingId))?.symbol || 'building';

function buildingConditions(facility) {
  const conditions=[];
  if(facility.prerequisites?.length)conditions.push({kind:'technology',ids:facility.prerequisites,label:'科技均需',text:facility.prerequisites.map(technologyName).join('、')});
  anyGroups(facility).forEach(ids=>conditions.push({kind:'any',ids,label:'任选其一',text:ids.map(technologyName).join(' / ')}));
  const buildings=facility.facilityRequirements || [];
  if(buildings.length)conditions.push({kind:'facility',ids:buildings,label:'建筑均需',text:buildings.map(facilityName).join('、')});
  return conditions;
}

/** Fixed coordinates depend only on dependencies, never the viewport or progress. */
export function layoutResearchGroup(group, groupProjects, facilities=game.FACILITIES) {
  const localIds=new Set(groupProjects.map(p=>p.id)), ranks=new Map(), visiting=new Set();
  const byId=new Map(groupProjects.map(p=>[p.id,p]));
  function rank(id) {
    if(ranks.has(id))return ranks.get(id);
    if(visiting.has(id))throw new Error(`科技依赖存在循环：${id}`);
    visiting.add(id);
    const prerequisites=requiredTechnologies(byId.get(id)).filter(dep=>localIds.has(dep));
    const value=prerequisites.length?Math.max(...prerequisites.map(rank))+1:0;
    visiting.delete(id);ranks.set(id,value);return value;
  }
  const nodes=groupProjects.map(project=>({id:project.id,kind:'technology',rank:rank(project.id),width:CARD_WIDTH,height:CARD_HEIGHT,record:project}));
  const outputs=facilities.filter(f=>f.id!==group.id && (requiredTechnologies(f).some(id=>localIds.has(id)) || relatedFacilities(f).includes(group.id)));
  for(const facility of outputs){
    const localParents=requiredTechnologies(facility).filter(id=>localIds.has(id));
    nodes.push({id:facility.id,kind:'building',rank:localParents.length?Math.max(...localParents.map(rank))+1:0,width:CARD_WIDTH,height:BUILDING_HEIGHT,record:facility,localParents});
  }
  const layers=[...new Set(nodes.map(n=>n.rank))].sort((a,b)=>a-b);
  const columns=layers.some(layer=>nodes.filter(n=>n.rank===layer).length>1)?2:1;
  const width=columns*CARD_WIDTH+(columns-1)*COLUMN_GAP+GRAPH_INSET*2;
  let top=20;
  for(const layer of layers){
    const layerNodes=nodes.filter(n=>n.rank===layer);
    for(let index=0;index<layerNodes.length;index+=columns){
      const row=layerNodes.slice(index,index+columns);
      row.forEach((node,column)=>{node.x=row.length===1?(width-CARD_WIDTH)/2:GRAPH_INSET+column*(CARD_WIDTH+COLUMN_GAP);node.y=top;});
      top+=Math.max(...row.map(node=>node.height))+ROW_GAP;
    }
  }
  const edges=[];
  for(const node of nodes){
    for(const id of node.record.prerequisites||[])if(localIds.has(id))edges.push({from:id,to:node.id,kind:'required',optionGroup:null});
    anyGroups(node.record).forEach((options,optionGroup)=>{for(const id of options)if(localIds.has(id))edges.push({from:id,to:node.id,kind:'any',optionGroup});});
  }
  return {width,height:Math.max(60,top-ROW_GAP+18),nodes,edges};
}

function connectionPath(source,target,index,width) {
  const sx=source.x+source.width/2,sy=source.y+source.height,tx=target.x+target.width/2,ty=target.y;
  if(ty-sy<=ROW_GAP+1){const middle=sy+(ty-sy)/2;return `M ${sx} ${sy} V ${middle} H ${tx} V ${ty-3}`;}
  const side=sx<width/2?4+(index%3)*3:width-4-(index%3)*3;
  return `M ${sx} ${sy} V ${sy+14} H ${side} V ${ty-15} H ${tx} V ${ty-3}`;
}

function technologyNode(state,node,info,selectedId,query) {
  const project=node.record,status=researchStatus(info,state);
  const match=!query||[project.name,project.contribution,...(project.tags||[])].join(' ').toLowerCase().includes(query);
  const required=(project.prerequisites||[]).length,alternatives=anyGroups(project).length;
  const conditionLabel=[required?`${required} 项前置均需`:'',alternatives?`${alternatives} 组任选条件`:''].filter(Boolean).join(' · ')||'本组入口建成可研';
  return `<button class="research-card research-tree-card is-${status.tone} ${selectedId===project.id?'is-selected':''} ${query?(match?'is-search-match':'is-search-context'):''}" style="left:${node.x}px;top:${node.y}px;width:${node.width}px;height:${node.height}px" data-action="select-tech" data-id="${esc(project.id)}" data-status="${status.id}" data-rank="${node.rank}" aria-label="${esc(project.name)}，${status.label}，${esc(conditionLabel)}" aria-pressed="${selectedId===project.id}" title="${esc(info.locked?(info.missing||[]).join('；'):project.contribution)}"><img class="research-card-art" src="${technologyArt(project.id)}" alt="" width="640" height="427" loading="lazy" decoding="async">${required||alternatives?`<span class="research-node-requires">${esc(conditionLabel)}</span>`:''}<h4>${esc(project.name)}</h4><span class="research-card-bottom"><span class="research-card-status">${status.id==='completed'?'✓ ':''}${status.label}</span><b>${info.completed?'成':`${percent(info.progress)}%`}</b></span><span class="research-card-progress"><i style="width:${percent(info.progress)}%"></i></span></button>`;
}

function buildingNode(state,node,groupId,icon) {
  const facility=node.record,info=game.getFacilityInfo(state,facility.id),built=hasFacility(state,facility.id);
  const conditions=buildingConditions(info);
  const fullConditions=`以下条件全部满足：${conditions.map(c=>`${c.label}：${c.text}`).join('；')||'无额外科技条件'}${built?'':`。${constructionSummary(info)}`}`;
  return `<button id="research-unlock-${esc(groupId)}-${esc(facility.id)}" class="research-building-node ${built?'is-built':info.canBuild?'is-available':'is-locked'}" data-action="facility-detail" data-id="${esc(facility.id)}" data-symbol="${esc(buildingSymbol(facility))}" data-rank="${node.rank}" style="left:${node.x}px;top:${node.y}px;width:${node.width}px;height:${node.height}px" title="${esc(fullConditions)}" aria-label="${esc(facility.name)}，后续建筑，${built?'已建成':info.canBuild?'可营建':'待条件'}。${esc(fullConditions)}"><span class="research-building-kicker">${makeIcon(icon,buildingSymbol(facility))} 后续建筑 <em>${built?'已建':info.canBuild?'可建':'待条件'}</em></span><strong>${esc(facility.name)}</strong><span class="research-building-open">${built?'建筑详情':`${silver(info.cost)} 两`} · 查看 ${makeIcon(icon,'arrow')}</span></button>`;
}

function constructionLabel(info) { return info.skippedLevels.length?'合并营建':info.currentLevel?'升级':'营建'; }
function constructionSummary(info) {
  return `本次营建总价 ${silver(info.cost)} 两；包含${info.constructionLevels.map(level=>level.name).join('、')}`;
}

function researchGroup(state,facility,cards,selectedId,query,icon) {
  const info=game.getFacilityInfo(state,facility.id),built=hasFacility(state,facility.id),layout=layoutResearchGroup(facility,cards.map(c=>c.project));
  const nodes=new Map(layout.nodes.map(node=>[node.id,node])),cardInfo=new Map(cards.map(c=>[c.project.id,c.info]));
  const markerId=`research-arrow-${facility.id}`,done=cards.filter(c=>c.info.completed).length;
  const paths=layout.edges.map((edge,index)=>`<path class="research-connection is-${edge.kind} ${isComplete(state,edge.from)?'is-complete':''}" data-from="${esc(edge.from)}" data-to="${esc(edge.to)}" d="${connectionPath(nodes.get(edge.from),nodes.get(edge.to),index,layout.width)}" marker-end="url(#${esc(markerId)})"><title>${esc(technologyName(edge.from))} → ${esc(nodes.get(edge.to).record.name)}${edge.kind==='any'?'（本组选项任选其一）':'（必须完成）'}</title></path>`).join('');
  return `<section class="research-group ${built?'is-open':'is-locked'}" style="--research-group-width:${layout.width+2}px" data-id="${esc(facility.id)}" data-research-group="${esc(facility.id)}" aria-labelledby="research-group-${esc(facility.id)}"><header class="research-group-heading"><div class="research-group-kicker"><span>共同建筑入口</span><span>${done}/${cards.length}</span></div><h3 id="research-group-${esc(facility.id)}"><button data-action="facility-detail" data-id="${esc(facility.id)}" data-symbol="${esc(buildingSymbol(facility))}">${makeIcon(icon,buildingSymbol(facility))}${esc(facility.name)}</button></h3><div class="research-group-entry"><span class="${built?'is-built':''}">${built?'✓ 本组入口已建成':`${silver(info.cost)} 两 · ${constructionLabel(info)}`}</span>${built?`<button data-action="facility-detail" data-id="${esc(facility.id)}">建筑详情</button>`:`<button class="small-button" data-action="build" data-id="${esc(facility.id)}" ${info.canBuild?'':'disabled'} title="${esc(`${info.reason?`${info.reason}。`:''}${constructionSummary(info)}`)}">${constructionLabel(info)}</button>`}</div>${!built&&info.missing?.length?`<button class="research-group-missing" data-action="facility-detail" data-id="${esc(facility.id)}" title="${esc(info.missing.join('；'))}">尚有 ${info.missing.length} 项条件待满足 · 查看</button>`:''}</header><div class="research-group-tree" style="width:${layout.width}px;height:${layout.height}px"><svg class="research-connections" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}" aria-hidden="true"><defs><marker id="${esc(markerId)}" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 6 3 L 0 6 z" fill="context-stroke"/></marker></defs>${paths}</svg>${layout.nodes.map(node=>node.kind==='technology'?technologyNode(state,node,cardInfo.get(node.id),selectedId,query):buildingNode(state,node,facility.id,icon)).join('')}${!cards.length?'<p class="research-group-empty">此入口不含独立研究项目。</p>':''}</div></section>`;
}

export function researchBoard(state, ui = {}, {icon=defaultIcon} = {}) {
  const category=categoryId(ui.techCategory),categories=categoryList();
  const allCards=researchCards(state,category),query=String(ui.techQuery||'').trim().toLowerCase();
  const groups=game.FACILITIES.filter(f=>(f.category||f.buildingId||f.id)===category).map(facility=>({facility,cards:allCards.filter(c=>groupIdOf(c.project)===facility.id)})).filter(({facility,cards})=>!query||facility.name.toLowerCase().includes(query)||cards.some(({project})=>[project.name,project.contribution,...(project.tags||[])].join(' ').toLowerCase().includes(query)));
  const selected=researchSelection(state,ui);
  return `<section class="research-board research-group-board" aria-label="天工密录"><div class="research-workspace">${teamRail(state,ui,icon)}<section class="research-main"><div class="research-navigation"><nav class="research-tabs" aria-label="建筑科技分类">${categories.map(c=>{
    const list=researchCards(state,c.id),done=list.filter(p=>p.info.completed).length;
    return `<button class="research-tab ${c.id===category?'is-active':''}" data-action="select-category" data-category="${c.id}" data-symbol="${esc(c.symbol||'building')}" aria-pressed="${c.id===category}">${makeIcon(icon,c.symbol||'building')}<b>${esc(c.name)}</b><small>${done}/${list.length}</small></button>`;
  }).join('')}</nav><form id="tech-search" class="research-search"><label for="tech-query" class="sr-only">查找科技或建筑</label><input id="tech-query" name="query" value="${esc(ui.techQuery||'')}" placeholder="查找科技或建筑…" autocomplete="off"><button type="submit">查找</button></form></div><div class="research-graph-guide"><span>组内由上往下研究 · 后续建筑可点开查看</span><span><i></i>必须完成 <i class="is-any"></i>任选其一</span></div><div class="research-card-scroll"><div class="research-card-grid research-group-grid">${groups.map(({facility,cards})=>researchGroup(state,facility,cards,selected.projectId,facility.name.toLowerCase().includes(query)?'':query,icon||defaultIcon)).join('')||'<div class="research-empty">此分类中未找到相关科技或建筑。</div>'}</div></div></section>${detailDock(state,ui,icon)}</div></section>`;
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

export function techDetails(state,id,{icon=defaultIcon,teamId} = {}) {
  const team=state.teams.find(t=>t.id===teamId)||null;
  const p=id?game.getProjectInfo(state,id,team?.id):null;
  const teamHtml=teamResearchControls(state,team,p,icon);
  if(!p) return `<aside class="tech-detail-horizontal" data-empty-research="true">${teamHtml}<section class="detail-overview detail-empty" aria-label="科技作用与前置"><header><span class="detail-catalogue">科技作用与前置</span></header><h3>选择一项科技</h3><p>${team?'团队已选定，点击上方科技查看作用与前置条件。':'点击上方科技，查看作用与前置条件。'}</p></section><section class="detail-background detail-empty" aria-label="工艺背景"><header><span class="detail-catalogue">工艺背景</span></header><h3>尚未选择科技</h3><p>选中科技后，查看其技术原理与历史沿革。</p></section></aside>`;
  const status=researchStatus(p,state);
  const chip=pid=>{const dep=game.PROJECTS.find(d=>d.id===pid);return dep?`<button class="dependency-chip ${isComplete(state,pid)?'complete':''}" data-action="select-tech" data-id="${pid}">${makeIcon(icon,isComplete(state,pid)?'check':'lock')}${esc(dep.name)}</button>`:'';};
  const prereqs=(p.facilityRequirements||[]).map(fid=>{const symbol=buildingSymbol(game.FACILITIES.find(f=>f.id===fid));return `<div class="research-dependency-set"><span>共同建筑入口</span><button class="dependency-chip ${hasFacility(state,fid)?'complete':''}" data-action="facility-detail" data-id="${esc(fid)}" data-symbol="${esc(symbol)}">${makeIcon(icon,symbol)}${esc(facilityName(fid))}</button></div>`;}).join('')+((p.prerequisites||[]).length?`<div class="research-dependency-set"><span>以下科技全部完成</span>${p.prerequisites.map(chip).join('')}</div>`:'')+anyGroups(p).map(ids=>`<div class="research-dependency-set is-any"><span>以下任选其一</span>${ids.map(chip).join('')}</div>`).join('');
  return `<aside class="tech-detail-horizontal" data-project-id="${id}">${teamHtml}<section class="detail-overview" aria-label="科技作用与前置"><header><span class="detail-catalogue">科技作用与前置</span><span class="status-badge is-${status.tone}" title="${esc(p.missing.join('；'))}">${status.label}</span></header><h3>${esc(p.name)}</h3><p class="detail-contribution">${esc(effectSummary(p))}</p>${specialtyTags(p)}<div class="detail-prerequisites"><h4>前置条件</h4><div class="dependency-list">${prereqs||'<span>可直接开展研究</span>'}</div></div>${p.transferBonus?`<p class="transfer-line" title="${esc(p.transferSources.join('、'))}">继承准备 ${p.transferBonus}% · 已有工艺经验</p>`:''}</section><section class="detail-background" aria-label="工艺背景"><img class="detail-background-art" src="${technologyArt(id)}" alt="" width="640" height="427" decoding="async"><header><span class="detail-catalogue">工艺背景</span>${p.source?.url?`<a href="${esc(p.source.url)}" target="_blank" rel="noopener noreferrer" title="${esc(p.source.label)}">史料参照 ↗</a>`:''}</header><p><b>概述</b>${esc(p.description)}</p><p><b>原理</b>${esc(p.technical||'')}</p><p><b>沿革</b>${esc(p.historical||'')}</p></section></aside>`;
}

export function doctrineSelector(state) {
  const list = game.DOCTRINES || [];
  const selected = state.doctrine || state.selectedDoctrine;
  return `<section class="doctrine-selector"><div class="doctrine-heading"><span>御定作战方略</span><p>装备、训练与军制共同决定战力，选择最适合现有成果的打法。</p></div><div class="doctrine-options">${list.map(d=>`<button class="doctrine-option ${selected===d.id?'is-selected':''}" data-action="select-doctrine" data-id="${d.id}" aria-pressed="${selected===d.id}" ${state.status!=='playing'?'disabled':''}><span class="doctrine-radio">${selected===d.id?'◆':'◇'}</span><span><strong>${esc(d.name)}</strong><small>${esc(d.description)}</small></span></button>`).join('')}</div></section>`;
}

