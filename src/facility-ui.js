import { FACILITIES, PROJECTS, getFacilityInfo, hasFacility } from './game.js';
import { icon } from './icons.js';
import { teamPortrait } from './artwork.js';
import { facilityArt } from './settlement.js';
import { formatSilver as silver } from './format.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const numerals=['—','Ⅰ','Ⅱ','Ⅲ','Ⅳ','Ⅴ'];
const facilityById=Object.fromEntries(FACILITIES.map(f=>[f.id,f]));
const projectById=Object.fromEntries(PROJECTS.map(p=>[p.id,p]));
export const BUILDING_FAMILIES=[...new Set(FACILITIES.map(f=>f.buildingId))].map(id=>{
 const levels=FACILITIES.filter(f=>f.buildingId===id).sort((a,b)=>a.level-b.level);
 return {id,name:levels[0].name.replace(/[ⅠⅡⅢⅣⅤ]+$/,''),symbol:levels[0].symbol,levels};
});
const familyById=Object.fromEntries(BUILDING_FAMILIES.map(f=>[f.id,f]));

function buildingArt(id){return facilityArt(id);}
function buildLabel(info){return info.built?'已建成':info.skippedLevels.length?'合并营建':info.currentLevel?'升级':'兴建';}
function levelStatus(info){return info.built?'已建成':info.canBuild?info.currentLevel?'可升级':'可兴建':info.missing.length?'待工艺':info.reason;}
export function defaultFacilityTarget(state,buildingId){
 const family=familyById[buildingId];if(!family)return null;
 return family.levels.find(f=>getFacilityInfo(state,f.id).canBuild)?.id||family.levels.find(f=>!hasFacility(state,f.id))?.id||family.levels.at(-1).id;
}

export function facilityPage(state){
 return `<div class="building-gallery" aria-label="工场营建"><div class="building-gallery-guide"><span>择一工场，查看各级营建</span><span><i aria-hidden="true"></i> 灰色：暂不可兴建或升级</span></div><div class="building-icon-grid">${BUILDING_FAMILIES.map(family=>{
  const level=state.facilities[family.id]||0,available=family.levels.some(f=>getFacilityInfo(state,f.id).canBuild),finished=level===family.levels.at(-1).level;
  const label=`${family.name}，${level?`当前${numerals[level]}级`:'尚未兴建'}，${finished?'已达最高等级':available?'可兴建或升级':'暂不可兴建或升级'}，查看详情`;
  return `<button class="building-icon-button ${available?'is-available':finished?'is-complete':'is-unavailable'}" data-action="facility-open" data-id="${family.id}" aria-label="${esc(label)}" title="${esc(label)}">${buildingArt(family.id)}<span class="building-action-symbol" aria-hidden="true">${icon(finished?'check':available?'arrow':'lock')}</span><span class="building-caption" aria-hidden="true"><span class="building-name">${icon(family.symbol)}${esc(family.name)}</span><span class="building-level-marks">${family.levels.map(f=>`<i class="${f.level<=level?'is-built':''}">${numerals[f.level]}</i>`).join('')}</span></span></button>`;
 }).join('')}</div></div>`;
}

function facilityChip(state,id){const f=facilityById[id];return `<button class="${hasFacility(state,id)?'is-met':''}" data-action="facility-detail" data-id="${esc(id)}">${icon(f?.symbol||'building')}${esc(f?.name||id)}${hasFacility(state,id)?' ✓':''}</button>`;}
function technologyChip(state,id){return `<button class="${state.projects[id]?.completed?'is-met':''}" data-action="select-tech" data-id="${esc(id)}">${esc(projectById[id]?.name||id)}${state.projects[id]?.completed?' ✓':''}</button>`;}

export function facilityDialog(state,id){
 const info=getFacilityInfo(state,id);if(!info)return '';
 const family=familyById[info.buildingId],shortfall=Math.max(0,info.cost-state.money),projects=info.built?[info]:info.constructionLevels;
 const research=[...new Set(projects.flatMap(f=>facilityById[f.id].unlocks))];
 const conditionGroups=[
  info.facilityRequirements.length?`<div class="facility-condition-group"><small>配套建筑 · 全部需要</small><div class="facility-chips">${info.facilityRequirements.map(id=>facilityChip(state,id)).join('')}</div></div>`:'',
  info.prerequisites.length?`<div class="facility-condition-group"><small>工艺 · 全部需要</small><div class="facility-chips">${info.prerequisites.map(id=>technologyChip(state,id)).join('')}</div></div>`:'',
  ...info.prerequisiteAny.map(group=>`<div class="facility-condition-group"><small>工艺 · 以下任选一项</small><div class="facility-chips">${group.map(id=>technologyChip(state,id)).join('')}</div></div>`),
 ].filter(Boolean).join('');
 return `<header class="facility-dialog-heading"><div class="facility-dialog-art">${buildingArt(family.id)}<span>${icon(family.symbol)}</span></div><div><p class="modal-eyebrow">工部营建 · 工场详情</p><h2 id="modal-title">${esc(family.name)}</h2><p class="facility-current-level">${info.currentLevel?`当前已建至 ${numerals[info.currentLevel]} 级`:'尚未兴建'}<span> / 共 ${family.levels.length} 级</span></p></div></header><div class="facility-level-selector" role="group" aria-label="选择目标等级">${family.levels.map(f=>{const option=getFacilityInfo(state,f.id);return `<button data-action="facility-level" data-id="${f.id}" class="${f.id===id?'is-selected ':''}${option.built?'is-built':option.canBuild?'is-available':'is-unavailable'}" aria-pressed="${f.id===id}" aria-label="${esc(f.name)}，${esc(levelStatus(option))}"><b>${numerals[f.level]} 级</b><span>${esc(levelStatus(option))}</span></button>`;}).join('')}</div><div class="facility-detail-scroll"><section class="facility-target-overview"><h3>${esc(info.name)}</h3><p>${esc(info.description)}</p>${info.built?'<p class="facility-construction-note">本级已建成，已开放的研究始终保留。</p>':`<p class="facility-construction-note">${info.skippedLevels.length?`合并营建 ${info.constructionLevels.map(f=>numerals[f.level]).join('、')} 级，一次施工。`:'本次营建只占用一支空闲团队。'}${info.skippedLevels.length?'费用包含所有缺少的等级，原有研究保留。':''}</p>`}</section><section class="facility-condition-section"><h3>营建条件${info.skippedLevels.length?' · 合并工程':''}</h3>${conditionGroups||'<p class="facility-no-conditions">无需额外工艺与建筑。</p>'}</section><section class="facility-research-section"><h3>${info.built?'本级研究':'建成后开放的研究'}</h3><div class="facility-chips">${research.map(id=>technologyChip(state,id)).join('')}</div></section><section class="facility-cost-section"><h3>${info.built?'本级已落成':'工程预算'}</h3>${info.built?'<p>可切换其他等级查看后续营建。</p>':`<div class="facility-cost-lines">${info.constructionLevels.map(f=>`<div><span>${esc(f.name)}</span><strong>${silver(f.cost)} 两</strong></div>`).join('')}</div><div class="facility-cost-total"><span>本次合计</span><strong>${silver(info.cost)} 两</strong></div><p>${shortfall?`内库 ${silver(state.money)} 两，尚缺 ${silver(shortfall)} 两。`:`内库 ${silver(state.money)} 两，营建后余 ${silver(state.money-info.cost)} 两。`}</p>`}</section></div><footer class="facility-dialog-footer"><div class="facility-action-context">${info.built?'<span>此等级已建成</span>':`<span class="facility-team">${teamPortrait(state.teams.find(t=>t.id===info.selectedTeamId),'inline')}${esc(info.selectedTeamName||'本季暂无空闲团队')}</span><small>${info.canBuild?'工艺与拨款齐备，可开工。':info.missing.length?`尚有 ${info.missing.length} 项条件待满足` :esc(info.reason)}</small>`}</div><button class="small-button primary" data-action="build" data-id="${info.id}" ${info.canBuild?'':'disabled'}>${buildLabel(info)}${info.built?'':` · ${silver(info.cost)} 两`}</button></footer>`;
}
