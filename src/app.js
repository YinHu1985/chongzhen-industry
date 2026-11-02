import { PROJECTS, FACILITIES, createGame, performAction, getProjectInfo, getTrialStakes, getSummary, getDate, getTrainingInfo, hasFacility, getCombatRating, getRecruitmentInfo, getCampaignOutcome, getFinanceInfo } from './game.js';
import { loadLocalSave, storeLocalSave, readSaveFile } from './save-slot.js';
import { renderTitleScreen } from './title-screen.js';
import { createBackgroundMusic } from './music.js';
import { createClickSound } from './click-sound.js';
import { FRONTS, frontStartTurn, DEFAULT_ENEMY_STRENGTH, MIN_ENEMY_STRENGTH, MAX_ENEMY_STRENGTH, normalizeEnemyStrength } from './warfare.js';
import { researchBoard, milestonePopup, doctrineSelector, selectResearchTeam, selectResearchTechnology } from './tech-tree.js';
import { teamsPage, combatPanel, enemyStrengthSelector } from './campaign-ui.js';
import { settlementScene } from './settlement.js';
import { facilityPage as renderFacilityPage, facilityDialog, defaultFacilityTarget } from './facility-ui.js';
import { icon } from './icons.js';
import { teamPortrait, technologyArt } from './artwork.js';
import { formatSilver as silver } from './format.js';
import { financePage } from './finance-ui.js';
import { renderTurnTransition, renderTurnSummary, renderRandomEvent, animateTurnSummary } from './turn-summary.js';
import { pendingEvent } from './events.js';

const app=document.querySelector('#app'), modalRoot=document.querySelector('#modal-root'), toastElement=document.querySelector('#toast');
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=value=>Math.round(Number(value)||0).toLocaleString('zh-CN');
const ui={screen:'title',hasGame:false,pendingImport:null,panel:null,techSelection:null,techCategory:'workshop',milestoneSelection:null,techQuery:'',selectedResearchTeamId:null,facilitySelection:null,modal:null,notice:'',storageError:'',toastTimer:null,teamTab:'roster',resultDismissed:false,turnTransition:null,settlementAnimated:false,eventAnimatedId:null,buildingReveal:null,windowPosition:{x:0,y:0}};
const panels={tech:['天工密录','依工场分卷，循等级兴百工'],facilities:['工场营建','先有工艺，后立厂房'],army:['新军操演','以军制育骨干，以操练成精兵'],teams:['招贤馆','延请能工，各展所长'],goals:['救亡方略','调兵守战线，扩产补损耗'],archive:['内廷起居注','功过得失，逐季记载'],finance:['户部账册','照实记账，量入为出'],help:['御前备忘','朕的时间不多了']};
const branches=['infantry','artillery','cavalry','drill','coordination'];
const branchIcons={infantry:'swords',artillery:'cannon',cavalry:'horse',drill:'book',coordination:'flag'};
const branchNames={infantry:'步兵营',artillery:'炮兵营',cavalry:'骑兵营',drill:'军纪与操练',coordination:'诸营协同'};
function newGame(maxTurns=24,enemyStrength=DEFAULT_ENEMY_STRENGTH){return createGame({maxTurns,enemyStrength,seed:crypto.getRandomValues(new Uint32Array(1))[0]||1});}
function loadGame(){
  try { const loaded=loadLocalSave(localStorage);if(loaded){ui.hasGame=true;return loaded;} }
  catch { ui.notice='本地卷宗无法读取。可导入此前导出的存档，或另开新局。'; }
  return newGame();
}
let state=loadGame();
let music=null,clickSound=null;
music=createBackgroundMusic({onChange:syncMusicControls});
clickSound=createClickSound({onChange:syncClickSoundControls});
const saveFileInput=document.querySelector('#save-file-input');
let importRequest=0, turnTransitionTimer=null, buildingRevealTimer=null, stopSettlementAnimation=null, facilityReturnFocus=null;
const reducedMotion=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function save(){
 ui.hasGame=true;
 try { storeLocalSave(localStorage,state);ui.storageError=''; }
 catch { ui.storageError='本地存档不可用，请从右上角导出本局。'; }
}
function syncMusicControls(){
 if(!music)return;
 const label=music.enabled?(music.playing?'音乐播放中':'音乐已开启'):'音乐已关闭';
 for(const button of document.querySelectorAll('[data-action="toggle-music"]')){
  button.setAttribute('aria-pressed',String(music.enabled));button.setAttribute('aria-label',label);button.title=label;
  const text=button.querySelector('[data-music-label]');if(text)text.textContent=label;
  const symbol=button.querySelector('.icon');if(symbol)symbol.outerHTML=icon(music.enabled?'music':'music_off');
 }
 for(const input of document.querySelectorAll('[data-music-volume]'))if(input!==document.activeElement)input.value=String(Math.round(music.volume*100));
 for(const label of document.querySelectorAll('[data-music-volume-label]'))label.textContent=`${Math.round(music.volume*100)}%`;
}
function syncClickSoundControls(){
 if(!clickSound)return;
 const label=clickSound.enabled?'点击音效已开启':'点击音效已关闭';
 for(const button of document.querySelectorAll('[data-action="toggle-click-sound"]')){
  button.setAttribute('aria-pressed',String(clickSound.enabled));button.setAttribute('aria-label',label);button.title=label;
  const text=button.querySelector('[data-click-sound-label]');if(text)text.textContent=clickSound.enabled?'音效开':'音效关';
 }
 for(const input of document.querySelectorAll('[data-click-sound-volume]'))if(input!==document.activeElement)input.value=String(Math.round(clickSound.volume*100));
}
function syncEnemyStrengthControl(input,commit=false){
 const settings=input?.closest('.enemy-strength-setting');if(!settings)return;
 const numeric=Number(input.value),range=settings.querySelector('[data-enemy-strength]'),number=settings.querySelector('[data-enemy-strength-number]'),output=settings.querySelector('[data-enemy-strength-output]');
 if(input.value.trim()===''||!Number.isFinite(numeric)||numeric<MIN_ENEMY_STRENGTH||numeric>MAX_ENEMY_STRENGTH){output.value='请输入 0.10–10.00';return;}
 const value=normalizeEnemyStrength(numeric).toFixed(2);
 range.value=value;range.setAttribute('aria-valuetext',`${value} 倍`);output.value=`×${value}`;
 if(input===range||commit)number.value=value;
}
function enterGame(nextState=state){
 clearTimeout(turnTransitionTimer);clearTimeout(buildingRevealTimer);stopSettlementAnimation?.();
 state=nextState;ui.hasGame=true;importRequest++;
 ui.turnTransition=null;ui.settlementAnimated=false;ui.eventAnimatedId=null;ui.buildingReveal=null;
 Object.assign(ui,{screen:'game',panel:null,modal:null,pendingImport:null,resultDismissed:false,notice:'',techSelection:null,techCategory:'workshop',milestoneSelection:null,techQuery:'',selectedResearchTeamId:null,facilitySelection:null,windowPosition:{x:0,y:0}});
 renderedPanel=null;lastSceneKey='';markupCache.delete(app);render();
}
function returnToTitle(){
 importRequest++;Object.assign(ui,{screen:'title',panel:null,modal:null,pendingImport:null,milestoneSelection:null});
 markupCache.delete(app);render();
}
function toast(message,error=false){clearTimeout(ui.toastTimer);toastElement.textContent=message;toastElement.className=`toast visible${error?' error':''}`;ui.toastTimer=setTimeout(()=>toastElement.className='toast',4500);}
function act(type,args={},report=false){
  if(ui.turnTransition||ui.modal?.type==='settlement')return;
  const building=type==='build'?FACILITIES.find(f=>f.id===args.id):null;
  const firstConstruction=building&&!state.facilities[building.buildingId];
  const result=performAction(state,{type,...args});if(result.error){toast(result.message||result.error,true);return;}
  state=result.state;ui.modal=null;
  if(type==='build'){
    ui.panel=null;ui.facilitySelection=null;ui.milestoneSelection=null;ui.buildingReveal=firstConstruction?building.buildingId:null;facilityReturnFocus=null;
    clearTimeout(buildingRevealTimer);
    buildingRevealTimer=setTimeout(()=>{
      ui.buildingReveal=null;
      const scene=app.querySelector('.world-stage');
      if(scene&&ui.screen==='game')syncMarkup(scene,settlementScene(state,FACILITIES));
    },reducedMotion()?0:1600);
  }
  if(state.status!=='playing')ui.resultDismissed=false;
  if(report&&!state.pending&&state.status==='playing')ui.modal={type:'report',text:result.message};
  save();render();if(!report&&type!=='acknowledgeEvent'&&!state.pending&&state.status==='playing')toast(result.message);
}
function endSeason(){
  if(ui.turnTransition||ui.modal?.type==='settlement'||state.status!=='playing')return;
  const turn=state.turn,date=getDate(state),result=performAction(state,{type:'endTurn'});
  if(result.error){toast(result.message||result.error,true);ui.modal=null;render();return;}
  state=result.state;ui.modal=null;ui.resultDismissed=false;ui.settlementAnimated=false;
  ui.turnTransition={turn,date};
  clearTimeout(turnTransitionTimer);save();render();
  turnTransitionTimer=setTimeout(()=>{
    ui.turnTransition=null;ui.modal={type:'settlement',report:state.lastSettlement};render();
  },reducedMotion()?0:850);
}
function bar(value){return `<div class="progress-track"><span style="width:${Math.max(0,Math.min(100,value))}%"></span></div>`;}
function badge(label,value,symbol,extra=''){return `<div class="hud-resource" ${extra}><span class="hud-symbol">${icon(symbol)}</span><div><small>${label}</small><strong>${value}</strong></div></div>`;}
function hud(){const s=getSummary(state);return `<header class="game-hud"><button class="game-brand" data-action="home" aria-label="回到工场全景"><img class="brand-logo" src="./assets/ming-gear.svg" alt="" width="50" height="50"><span><b>崇祯工业</b><small>内廷督造 · ${getDate(state)}</small></span></button><div class="hud-economy"><button class="finance-hud-button" data-action="nav" data-id="finance" aria-label="查看财政收支">${badge('内库银两',`${silver(state.money)}<em>两</em>`,'coins')}</button>${badge('本季净收入',`${s.netIncome>=0?'+':'−'}${silver(Math.abs(s.netIncome))}<em>两</em>`,'trend',`title="收入 ${silver(s.income)} − 研究支出 ${silver(s.expenses)} 两"`)}${badge('朝廷威望',`${num(state.reputation)}<em>点</em>`,'spark')}${badge('本季团队',`${s.freeTeams}<em>/ ${state.teams.length}</em>`,'users')}</div><div class="hud-utilities"><button data-action="return-title" aria-label="返回标题界面" title="返回标题">${icon('menu')}</button><button data-action="toggle-music" aria-pressed="${music.enabled}" aria-label="背景音乐" title="背景音乐">${icon(music.enabled?'music':'music_off')}</button><button data-action="export" aria-label="导出存档" title="导出存档">${icon('download')}</button><button data-action="new-game" aria-label="开始新局" title="新局">${icon('restart')}</button><button data-action="nav" data-id="help" aria-label="玩法指南" title="指南">${icon('help')}</button></div></header>`;}
function worldPlaques(){
 const rating=getCombatRating(state), built=FACILITIES.filter(f=>hasFacility(state,f.id)).length,completed=PROJECTS.filter(p=>state.projects[p.id].completed).length;
 const caption=`<div class="world-title"><h1>京畿 · 内廷工业苑</h1><p>${built} / ${FACILITIES.length} 项营建 · ${completed} 项工艺已成</p></div>`;
 const fronts=rating.fronts.map(front=>`<span class="plaque-route">${icon('shield')}<b>${esc(front.name)}</b><i>敌 ${num(front.troops)} · 我 ${num(front.assigned)}</i></span>`).join('');
 const unassigned=rating.fronts.filter(front=>!front.assigned);
 return `${caption}<button class="strategy-plaque" data-action="nav" data-id="goals" aria-label="查看救亡方略"><span class="plaque-kicker">御定方略 ${icon('chevron')}</span>${fronts||`<span class="plaque-route">${icon('shield')}<b>边境暂宁</b><i>备兵 ${num(rating.reserve)}</i></span>`}</button><div class="world-callout">${built===0?`<div><strong>先立工坊，再开百工。</strong>${rating.fronts.length?'<p>敌情已现，也可前往救亡方略调兵。</p>':''}</div><button class="brass-button" data-action="nav" data-id="facilities">开工营建 ${icon('arrow')}</button>`:`<div><strong>${rating.fronts.length?(unassigned.length?'战线告急，尚待派兵':'驻军已部署，逐季剿灭'):'趁此安宁，备兵兴工'}</strong><p>${rating.fronts.length?`每季新补 ${num(rating.reinforcements)} 人 · 预备兵 ${num(rating.reserve)} 人`:'军械、操练与工业补充共同支撑持久战。'}</p></div><button class="brass-button" data-action="nav" data-id="goals">${rating.fronts.length?'调度战线':'查看备战'} ${icon('arrow')}</button>`}</div>`;
}
function dock(){
 const summary=getSummary(state),playing=state.status==='playing',shortfall=playing?summary.shortfall:0;
 return `<footer class="game-dock"><div class="season-block"><small>距最后期限</small><strong>${playing?state.maxTurns-state.turn+1:0}<em>季</em></strong><span>第 ${state.turn} / ${state.maxTurns} 季</span></div><nav class="dock-actions" aria-label="工场操作">${[['tech','book','天工密录'],['facilities','building','营建工场'],['teams','users','招贤馆'],['army','swords','新军操演'],['goals','shield','救亡方略'],['finance','coins','财政收支'],['archive','archive','军机档案']].map(([id,symbol,label])=>`<button class="dock-item ${ui.panel===id?'active':''}" data-action="nav" data-id="${id}" aria-pressed="${ui.panel===id}">${icon(symbol)}<span>${label}</span></button>`).join('')}</nav><div class="end-season-control ${shortfall?'is-short':''}"><button class="end-season" data-action="${playing?'end-turn':'ending'}" ${state.pending||ui.turnTransition||playing&&!summary.canEndTurn?'disabled':''}><span>${playing?'结束本季':'回看结局'}</span>${icon(playing?'arrow':'flag')}<small>${playing?shortfall?`资金不足 ${silver(shortfall)} 两`:`本季净收入 ${summary.netIncome>=0?'+':'−'}${silver(Math.abs(summary.netIncome))} 两`:'工业救亡卷宗'}</small></button>${shortfall?'<button class="end-season-finance" data-action="nav" data-id="finance">查看财政与补足资金 →</button>':''}</div></footer>`;
}
function techPage(){return researchBoard(state,ui,{icon});}
function facilityPage(){return renderFacilityPage(state);}
function armyPage(){return `<p class="army-front-link">操演提高战场效能，部队在救亡方略中分配。<button class="small-button" data-action="nav" data-id="goals">调兵与查看战报 ${icon('arrow')}</button></p><div class="window-rule"><strong>先练成骨干，军械完成即列装。</strong><span>军制科技提高操演效率和训练上限。不同方略重视不同兵种；训练越好，现有数量与装备越能发挥作用。</span></div><div class="training-grid">${branches.map(branch=>{const t=getTrainingInfo(state,branch);return `<article class="training-card"><div class="training-symbol">${icon(branchIcons[branch])}</div><h3>${branchNames[branch]}</h3><p>${esc(t.description)}</p><div class="training-meter">${t.current}<small> / ${t.cap} 当前上限</small></div>${bar(t.current)}<div class="training-team">${teamPortrait(state.teams.find(team=>team.id===t.selectedTeamId),'inline')}<span>${esc(t.selectedTeamName||'待派操演团队')}</span></div><div class="training-reason">${esc(t.reason||`本次提升 ${t.gain} 点`)}</div><button class="small-button primary" data-action="train" data-id="${branch}" ${t.canTrain?'':'disabled'}>组织操演 · ${silver(t.cost)} 两</button></article>`;}).join('')}</div>`;}
function goalsPage(){return `${doctrineSelector(state)}${combatPanel(state)}<div class="window-rule"><strong>坚持至末季，以真实战况定国运。</strong><span>所有战线敌军均不高于平定线则胜利；否则，未平定的战线均能持续补足损失且歼敌超过敌军补充，判为僵持。任一战线敌军超过失守线立即败局。末季仍有无法持续压制的战线，也将失败。</span></div>`;}
function archivePage(){return `<div class="campaign-timeline">${getCombatRating(state).fronts.map(front=>`<div class="passed"><small>第 ${frontStartTurn(state.maxTurns,FRONTS.find(definition=>definition.id===front.id))} 季</small><strong>${esc(front.name)}战线</strong><span>持续交战</span></div>`).join('')}<div><small>第 ${state.maxTurns} 季</small><strong>最后结算</strong><span>以当季战况定胜负</span></div></div><div class="archive">${state.log.map(e=>`<div class="log-row"><span class="log-dot ${['danger','warning'].includes(e.type)?'bad':''}"></span><span class="log-date">第 ${e.turn} 季</span><div class="log-info"><strong>${esc(e.title)}</strong><p>${esc(e.text)}</p></div></div>`).join('')}</div>`;}
function helpPage(){return `<div class="help-opening"><span class="imperial-seal">诏</span><div><h3>朕知后世之法，只欠岁月。</h3><p>以工场等级理顺百工，以人才推进研究，在最后期限前守住北京。</p></div></div><div class="manual-grid">${[
 ['一','循工场研制','科技按建筑大类分卷，各等级独立成组，线条展示组内工艺依赖。建筑格子汇总跨组条件，点击可查看并营建或升级。'],
 ['二','先通后精','工场升级后，原有等级的科技仍可研究。镗床与刨床各有产能，连同成品检验共同支撑精密加工。炼铁、炼钢等替代工艺仍取同类最高贡献。'],
 ['三','用对人才','先选技术团队，再选科技安排研制。指令持续到准备完成、验收成功或取消；结束本季时统一扣款并推进研究。团队专长影响推进胜算，受阻也会积累进度。'],
 ['四','择机验收','有准备进度即可尝试验收，同季可多次尝试，准备越足越稳。邀请群臣观礼会把威望赏罚翻倍；出险时可拨银补救，成功成果立即生效。'],
 ['五','招贤与营建','刷新招贤榜、雇佣团队分别支出。解雇损失威望；营建和升级均需工程团队与一次性费用。无需研究完一组的全部工艺，只须满足目标建筑列出的条件。'],
 ['六','因势成军','在救亡方略中选定打法，给已出现的战线分配驻军。驻军会逐季自动剿灭并补员；装备与训练降低损耗，工业产能提供持续补充。'],
 ['七','四路战事','倭寇自开局出现，兵力较少，可先用于练兵；四分之一时白莲教出现，二分之一时闯王军出现，四分之三时清军出现。白莲教人数与补充较多，闯王军兵弱而补充快，清军兵强且补充充足；缺少骑炮配套会扩大敌军优势。'],
 ['八','以战况论国运','敌军超过失守线立即失败；末季四线兵力均压在平定线以内则胜利。否则，只有未平定的战线均能补足我军损失且歼敌超过敌方补充，才是僵持；其余为失败。闯王军、清军、白莲教、倭寇依次决定败局结局。'],
 ].map(([n,title,text])=>`<section><b>${n}</b><h4>${title}</h4><p>${text}</p></section>`).join('')}</div><div class="economy-rule">每季拨款 = 保底 ${silver(getSummary(state).baseIncome)} 两 + 朝廷威望 × 200 两<br><small>季末净收入还须扣除已安排研究的开销；资金不足时须调整安排或在财政页劝输助饷。威望低于 0 即触发红丸结局。每次操作自动存档。</small></div>`;}
function floatingWindow(){if(!ui.panel)return '';const [title,subtitle]=panels[ui.panel];const content={tech:techPage,facilities:facilityPage,teams:()=>teamsPage(state,ui.teamTab),army:armyPage,goals:goalsPage,archive:archivePage,finance:()=>financePage(state,getFinanceInfo(state)),help:helpPage};return `<section class="game-window ${ui.panel==='tech'?'atlas-window':''}" role="dialog" aria-labelledby="window-title" style="--window-x:${ui.windowPosition.x}px;--window-y:${ui.windowPosition.y}px"><header class="window-titlebar" ${ui.panel==='tech'?'':'data-drag="window"'}><span class="title-decoration">◆</span><div><h2 id="window-title">${title}</h2><small>${subtitle}</small></div><span class="window-season">第 ${state.turn} / ${state.maxTurns} 季</span><button data-action="window-close" aria-label="关闭浮窗">${icon('close')}</button></header><div class="window-content">${content[ui.panel]()}</div><footer class="window-footer"><span>${state.status==='playing'?`可用团队 ${getSummary(state).freeTeams} / ${state.teams.length} · 内库 ${silver(state.money)} 两`:'本局卷宗已封存'}</span>${ui.panel==='tech'?'':'<button data-action="window-close">收起卷宗，回看工场</button>'}</footer></section>`;}
const markupCache=new WeakMap();
let renderedPanel=null,lastSceneKey='';
function syncMarkup(element,html){
 if(!element||markupCache.get(element)===html)return;
 element.innerHTML=html;markupCache.set(element,html);
}
function patchPart(current,next){
 if(!current||!next||current.outerHTML===next.outerHTML)return;
 current.className=next.className;
 syncMarkup(current,next.innerHTML);
}
// Keep graph cards and their loaded images in place when only selection/status changes.
function patchResearchNode(current,next){
 if(current.isEqualNode(next))return;
 if(current.nodeType!==next.nodeType||current.nodeName!==next.nodeName){current.replaceWith(next.cloneNode(true));return;}
 if(current.nodeType!==Node.ELEMENT_NODE){current.nodeValue=next.nodeValue;return;}
 for(const attribute of [...current.attributes])if(!next.hasAttribute(attribute.name))current.removeAttribute(attribute.name);
 for(const attribute of [...next.attributes])if(current.getAttribute(attribute.name)!==attribute.value)current.setAttribute(attribute.name,attribute.value);
 if(current.childNodes.length!==next.childNodes.length){current.replaceChildren(...[...next.childNodes].map(child=>child.cloneNode(true)));return;}
 [...current.childNodes].forEach((child,index)=>patchResearchNode(child,next.childNodes[index]));
}
function updateResearchWindow(current,next){
 const board=current.querySelector('.research-board'),nextBoard=next.querySelector('.research-board');
 if(!board||!nextBoard){syncMarkup(current,next.innerHTML);return;}
 for(const selector of ['.research-team-rail','.research-navigation','.research-detail-dock'])patchPart(board.querySelector(selector),nextBoard.querySelector(selector));
 const oldGrid=board.querySelector('.research-card-grid'),newGrid=nextBoard.querySelector('.research-card-grid');
 if(!oldGrid||!newGrid){syncMarkup(current,next.innerHTML);return;}
 const oldCards=[...oldGrid.children],newCards=[...newGrid.children];
 if(oldCards.length===newCards.length&&oldCards.every((card,i)=>card.dataset.id&&card.dataset.id===newCards[i].dataset.id)){
  for(let i=0;i<oldCards.length;i++){
   patchResearchNode(oldCards[i],newCards[i]);
  }
 }else syncMarkup(oldGrid,newGrid.innerHTML);
}
function render(){
 if(ui.screen==='title'){
  syncMarkup(app,renderTitleScreen({savedState:ui.hasGame?state:null,notice:ui.storageError||ui.notice,music,clickSound,icon}));
  renderedPanel=null;lastSceneKey='';renderModal();syncMusicControls();syncClickSoundControls();return;
 }
 const scrollSelectors=['.window-content','.research-card-scroll','.research-team-list','.detail-overview','.detail-background'];
 const scrolls=scrollSelectors.map(selector=>[selector,app.querySelector(selector)?.scrollTop||0]);
 const focused=document.activeElement;
 const focusKey=app.contains(focused)&&focused.dataset.action?Object.fromEntries(['action','id','category','teamId'].filter(k=>focused.dataset[k]).map(k=>[k,focused.dataset[k]])):null;
 if(!app.querySelector('.game-shell'))app.innerHTML='<div class="game-shell"><div class="world-stage"></div><div class="world-vignette"></div><div data-shell-slot="hud" style="display:contents"></div><div data-shell-slot="plaques" style="display:contents"></div><div data-shell-slot="notice" style="display:contents"></div><div data-shell-slot="dock" style="display:contents"></div><div data-shell-slot="window" style="display:contents"></div><div data-shell-slot="popup" style="display:contents"></div></div>';
 const sceneKey=JSON.stringify(state.facilities);
 if(sceneKey!==lastSceneKey){syncMarkup(app.querySelector('.world-stage'),settlementScene(state,FACILITIES,{revealFacilityId:ui.buildingReveal}));lastSceneKey=sceneKey;}
 const slot=name=>app.querySelector(`[data-shell-slot="${name}"]`);
 syncMarkup(slot('hud'),hud());syncMarkup(slot('plaques'),worldPlaques());syncMarkup(slot('dock'),dock());
 syncMarkup(slot('notice'),ui.notice||ui.storageError?`<div class="world-notice"><span>${esc(ui.storageError||ui.notice)}</span><button data-action="dismiss-notice" aria-label="收起提示">×</button></div>`:'');
 const windowLayer=slot('window'),windowMarkup=floatingWindow();
 if(renderedPanel!==ui.panel||!windowLayer.firstElementChild){syncMarkup(windowLayer,windowMarkup);renderedPanel=ui.panel;}
 else if(ui.panel){
  const template=document.createElement('template');template.innerHTML=windowMarkup;
  const existing=windowLayer.firstElementChild,next=template.content.firstElementChild;
  existing.style.setProperty('--window-x',`${ui.windowPosition.x}px`);existing.style.setProperty('--window-y',`${ui.windowPosition.y}px`);
  patchPart(existing.querySelector('.window-titlebar'),next.querySelector('.window-titlebar'));
  patchPart(existing.querySelector('.window-footer'),next.querySelector('.window-footer'));
  const currentContent=existing.querySelector('.window-content'),nextContent=next.querySelector('.window-content');
  if(ui.panel==='tech')updateResearchWindow(currentContent,nextContent);else syncMarkup(currentContent,nextContent.innerHTML);
 }
 syncMarkup(slot('popup'),ui.panel==='tech'?milestonePopup(state,ui.milestoneSelection,{icon}):'');
 for(const [selector,top] of scrolls){const element=app.querySelector(selector);if(element)element.scrollTop=top;}
 if(focusKey){const selector=Object.entries(focusKey).map(([key,value])=>`[data-${key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())}="${CSS.escape(value)}"]`).join('');app.querySelector(selector)?.focus({preventScroll:true});}
 renderModal();syncMusicControls();
}
function modalShell(content,closable=true,className=''){return `<div class="modal-backdrop"><section class="modal ${className}" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabindex="-1">${closable?`<button class="modal-close" data-action="modal-close" aria-label="关闭对话框">${icon('close')}</button>`:''}${content}</section></div>`;}
function trialAudience(project,inviteCourt){
 const stakes=getTrialStakes(state,project.id,inviteCourt),remaining=state.reputation-stakes.prestigeLoss;
 return `<div class="trial-audience" role="group" aria-label="是否邀请群臣观礼">${[[false,'内廷验收','不邀群臣，按常例赏罚。'],[true,'群臣观礼','邀集群臣，威望赏罚加倍。']].map(([invite,title,description])=>{const outcome=getTrialStakes(state,project.id,invite);return `<button class="trial-audience-choice ${inviteCourt===invite?'is-selected':''}" data-action="test-audience" data-id="${invite?'court':'private'}" aria-pressed="${inviteCourt===invite}"><span class="trial-choice-title"><i aria-hidden="true">${inviteCourt===invite?'◉':'○'}</i><strong>${title}</strong></span><small>${description}</small><span class="trial-choice-stakes"><span>成功 <b>+${outcome.prestigeGain}</b></span><span>失败 <b>−${outcome.prestigeLoss}</b></span><em>威望</em></span></button>`;}).join('')}</div><div class="trial-reputation"><span>当前威望 <b>${state.reputation}</b></span><span>成功后 <b>${state.reputation+stakes.prestigeGain}</b></span><span class="${remaining<0?'is-danger':''}">失败后 <b>${remaining}</b></span></div><p class="trial-risk ${remaining<0?'is-fatal':''}">${remaining<0?'本次若失败，威望将跌至负数，群臣进献红丸，本局结束。':'威望低于 0，群臣进献红丸，本局结束。出险可先拨银抢险。'}</p>`;
}
function renderModal(){let html='';
 const occurrence=ui.screen==='game'?pendingEvent(state):null;
 // Keep an active season report mounted so unrelated renders cannot cancel its counters.
 if(ui.modal?.type==='settlement'&&ui.settlementAnimated&&modalRoot.querySelector('.season-report-modal'))return;
 if(occurrence&&ui.eventAnimatedId===occurrence.id&&modalRoot.querySelector('.random-event-modal'))return;
 stopSettlementAnimation?.();stopSettlementAnimation=null;
 if(ui.turnTransition){html=renderTurnTransition(ui.turnTransition);}
 else if(ui.modal?.type==='settlement'&&ui.modal.report){html=modalShell(renderTurnSummary(ui.modal.report,{animate:!ui.settlementAnimated}),false,'season-report-modal');}
 else if(ui.screen==='game'&&state.pending?.kind==='rescue'){const p=state.pending,stakes=getTrialStakes(state,p.projectId,p.inviteCourt===true),fatal=state.reputation-stakes.prestigeLoss<0;html=modalShell(`<p class="modal-eyebrow">${p.inviteCourt?'群臣在场':'内廷试验'} · 待御批</p><h2 id="modal-title">${esc(p.title)}</h2><p>${esc(p.description)}</p><div class="modal-detail"><div class="modal-detail-row"><span>追加经费</span><strong>${silver(p.cost)} 两</strong></div><div class="modal-detail-row"><span>抢险成功率</span><strong>${p.successChance}%</strong></div><div class="modal-detail-row"><span>最终威望变化</span><strong>成功 +${stakes.prestigeGain} / 失败 −${stakes.prestigeLoss}</strong></div></div><p class="trial-risk ${fatal?'is-fatal':''}">${fatal?'此次失利将使威望跌至负数，触发红丸结局。':'威望尚未结算，按最终结果赏罚。'}本次仅有一次抢险机会。</p><div class="modal-actions"><button class="small-button" data-action="rescue-decline">接受失败</button><button class="small-button primary" data-action="rescue-accept" ${state.money<p.cost?'disabled':''}>拨银抢险</button></div>`,false);}
 else if(occurrence){html=modalShell(renderRandomEvent(occurrence),false,'random-event-modal');}
 else if(ui.screen==='game'&&state.status!=='playing'&&!ui.resultDismissed){const won=state.status==='won',stalemate=state.status==='stalemate',redPill=['prestige','bailian','wokou'].includes(state.defeatReason),ending=getCampaignOutcome(state);html=modalShell(`<p class="modal-eyebrow">${getDate(state)} · ${won?'四线平定':stalemate?'国祚暂续':redPill?'丹诏无声':'山河失守'}</p>${won?`<img class="victory-art" src="${technologyArt('joint_trials')}" alt="新军守卫京师" width="640" height="427">`:redPill?'<div class="red-pill-seal" aria-hidden="true">丹</div>':''}<h2 id="modal-title">${esc(ending.title)}</h2><p>${esc(ending.description)}</p>${state.defeatReason==='prestige'?'<p class="ending-reason">朝廷威望低于 0，本局已结束。</p>':''}<div class="ending-fronts">${getCombatRating(state).fronts.map(front=>`<div><span>${esc(front.name)}</span><b>敌余 ${num(front.troops)}</b><small>平定线 ${num(front.victoryThreshold)} · ${front.troops<=front.victoryThreshold?'已压制':front.lastBattle?.sustainable&&front.lastBattle?.enemyDeclining?'可持续压制':'局势未稳'}</small></div>`).join('')}</div><div class="result-stats"><div><span>历经季度</span><strong>${state.turn}</strong></div><div><span>朝廷威望</span><strong>${state.reputation}</strong></div><div><span>建成工场</span><strong>${Object.values(state.facilities).filter(Boolean).length}</strong></div></div><div class="modal-actions"><button class="small-button" data-action="ending-close">回看工场</button><button class="small-button primary" data-action="new-game">另启新局</button></div>`,true,redPill?'prestige-ending':stalemate?'stalemate-ending':'');}
 else if(ui.modal?.type==='new-game'){html=modalShell(`<p class="modal-eyebrow">再借大明几年</p><h2 id="modal-title">另启一卷国运。</h2><p>${ui.hasGame?'新局会替换当前进度，可先导出卷宗留存。':'选择敌军强度与期限，从今日开始逆天改命。'}</p>${enemyStrengthSelector()}${[[24,'最后六年','崇祯十一年夏'],[40,'再借十年','崇祯七年夏'],[64,'从头整顿','崇祯元年夏']].map(([t,n,d])=>`<button class="modal-choice" data-action="start-game" data-id="${t}"><span><strong>${n} · ${t}季</strong><small>${d}起，至崇祯十七年春</small></span>${icon('arrow')}</button>`).join('')}${ui.hasGame?'<button class="text-button" data-action="export">先导出当前卷宗</button>':''}`,true,'new-game-modal');}
 else if(ui.modal?.type==='import-save'&&ui.pendingImport){const imported=ui.pendingImport.state;html=modalShell(`<p class="modal-eyebrow">读取卷宗</p><h2 id="modal-title">接续这一卷国运。</h2><p>${esc(ui.pendingImport.name)}</p><div class="modal-detail"><div class="modal-detail-row"><span>时日</span><strong>${esc(getDate(imported))}</strong></div><div class="modal-detail-row"><span>历经季度</span><strong>第 ${imported.turn} / ${imported.maxTurns} 季</strong></div><div class="modal-detail-row"><span>内库银两</span><strong>${silver(imported.money)} 两</strong></div></div><p>${ui.hasGame?'读取后将替换当前本地进度。':'卷宗已核验，可继续其中的征程。'}</p><div class="modal-actions">${ui.hasGame?'<button class="text-button" data-action="export">先导出当前卷宗</button>':''}<button class="small-button" data-action="modal-close">暂不读取</button><button class="small-button primary" data-action="confirm-import">读取此卷宗</button></div>`);}
 else if(ui.modal?.type==='facility'){html=modalShell(facilityDialog(state,ui.modal.id),true,'facility-modal');}
 else if(ui.modal?.type==='dismiss-team'){const team=state.teams.find(t=>t.id===ui.modal.id),cost=getRecruitmentInfo(state).dismissPrestigeCost;html=modalShell(`<p class="modal-eyebrow">人事更替</p><div class="team-dismiss-heading">${teamPortrait(team,'large')}<h2 id="modal-title">遣散${esc(team?.name)}？</h2></div><p>损失 ${cost} 点朝廷威望，每季拨款减少 ${silver(cost*200)} 两。已付聘银不退还。</p>${state.reputation<cost?'<p class="trial-risk is-fatal">解雇后威望将低于 0，群臣进献红丸，本局结束。</p>':''}<div class="modal-actions"><button class="small-button" data-action="modal-close">暂且留任</button><button class="small-button danger" data-action="dismiss-team-confirm" data-id="${esc(team?.id)}">确定解雇</button></div>`);}
 else if(ui.modal?.type==='test'){const p=getProjectInfo(state,ui.modal.id),inviteCourt=ui.modal.inviteCourt===true;html=modalShell(`<p class="modal-eyebrow">工部呈报 · 择机验收</p><h2 id="modal-title">${esc(p.name)}</h2><div class="trial-summary"><div class="big-probability">${p.successChance}<span>%</span><small>验收成功率</small></div><div><div class="modal-detail-row"><span>准备度</span><strong>${p.progress}%</strong></div><div class="modal-detail-row"><span>验收支出</span><strong>${silver(p.testCost)} 两</strong></div><div class="modal-detail-row"><span>抢险预留</span><strong>${silver(p.rescueCost)} 两</strong></div></div></div>${trialAudience(p,inviteCourt)}<div class="modal-actions"><button class="small-button" data-action="modal-close">继续准备</button><button class="small-button primary" data-action="test-now" data-id="${p.id}" ${p.canTest?'':'disabled'}>${inviteCourt?'邀群臣，开始验收':'开始验收'} · ${silver(p.testCost)} 两</button></div>`,true,'trial-modal');}
 else if(ui.modal?.type==='report'){html=modalShell(`<p class="modal-eyebrow">第 ${state.turn} 季 · 御前回报</p><h2 id="modal-title">本次行动已记入卷宗。</h2><p class="result-copy">${esc(ui.modal.text)}</p><div class="modal-actions"><button class="small-button primary" data-action="modal-close">朕知道了</button></div>`);}
 else if(ui.modal?.type==='final-confirm'){html=modalShell(`<p class="modal-eyebrow">最后一季</p><h2 id="modal-title">京师风急，尚可一搏。</h2><p>本季仍可完成科技、操演与调整驻军。结束本季将先结算交战、战损与补充，再按四条战线的敌军数量及持续剿灭能力判定胜利、僵持或失败。</p><div class="modal-detail"><p>${getCombatRating(state).fronts.map(front=>`${esc(front.name)}：敌 ${num(front.troops)} 人，平定线 ${num(front.victoryThreshold)} 人`).join('；')}</p></div><div class="modal-actions"><button class="small-button" data-action="modal-close">继续本季准备</button><button class="small-button danger" data-action="final-now">结束最后一季</button></div>`);}
 const next=document.createElement('template');next.innerHTML=html;
 const currentDialog=modalRoot.querySelector('.modal-backdrop > .modal'),nextDialog=next.content.querySelector('.modal-backdrop > .modal');
 // Consecutive dialogs share their shell: replaying the backdrop's entry animation flashes the whole screen.
 if(currentDialog&&nextDialog){
  if(currentDialog.classList.contains('facility-modal')&&nextDialog.classList.contains('facility-modal')){
   patchResearchNode(currentDialog,nextDialog);
  }else{
   currentDialog.className=nextDialog.className;
   if(currentDialog.innerHTML!==nextDialog.innerHTML)currentDialog.innerHTML=nextDialog.innerHTML;
   currentDialog.scrollTop=0;
  }
  markupCache.delete(modalRoot);
 }
 else syncMarkup(modalRoot,html);
 app.inert=Boolean(html);
 const dialog=modalRoot.querySelector('.modal,.turn-ceremony');
 if(dialog&&!dialog.contains(document.activeElement))dialog.focus({preventScroll:true});
 if(ui.modal?.type==='settlement'&&ui.modal.report&&!ui.settlementAnimated){ui.settlementAnimated=true;stopSettlementAnimation=animateTurnSummary(modalRoot,{reducedMotion:reducedMotion()});}
 else if(occurrence&&modalRoot.querySelector('.random-event-modal')){ui.eventAnimatedId=occurrence.id;stopSettlementAnimation=animateTurnSummary(modalRoot,{reducedMotion:reducedMotion(),duration:850});}
}
function updateTrialAudience(){
 const project=getProjectInfo(state,ui.modal.id),inviteCourt=ui.modal.inviteCourt===true;
 const next=document.createElement('template');next.innerHTML=trialAudience(project,inviteCourt);
 for(const choice of modalRoot.querySelectorAll('[data-action="test-audience"]')){
  const selected=(choice.dataset.id==='court')===inviteCourt;
  choice.classList.toggle('is-selected',selected);choice.setAttribute('aria-pressed',String(selected));
  choice.querySelector('i').textContent=selected?'◉':'○';
 }
 for(const selector of ['.trial-reputation','.trial-risk'])patchPart(modalRoot.querySelector(selector),next.content.querySelector(selector));
 modalRoot.querySelector('[data-action="test-now"]').textContent=`${inviteCourt?'邀群臣，开始验收':'开始验收'} · ${silver(project.testCost)} 两`;
}
function openFacility(id){
 if(!FACILITIES.some(f=>f.id===id))return;
 if(ui.modal?.type!=='facility')facilityReturnFocus=document.activeElement;
 ui.facilitySelection=id;ui.modal={type:'facility',id};renderModal();
 modalRoot.querySelector('.facility-detail-scroll')?.scrollTo({top:0});
}
function closeModal(){
 const restore=ui.modal?.type==='facility'?facilityReturnFocus:null;
 ui.modal=null;ui.pendingImport=null;ui.resultDismissed=true;facilityReturnFocus=null;renderModal();
 if(restore?.isConnected)restore.focus({preventScroll:true});
}
function openPanel(panel){
 if(!panels[panel])return;
 ui.panel=panel;ui.modal=null;ui.windowPosition={x:0,y:0};ui.milestoneSelection=null;render();
 const content=app.querySelector('.window-content');if(content)content.scrollTop=0;
}
function selectTechnology(id){
 if(!PROJECTS.some(p=>p.id===id&&!p.automatic))return;
 Object.assign(ui,selectResearchTechnology(state,ui,id),{panel:'tech',modal:null,milestoneSelection:null});
 render();resetDetailScroll();
}
function inspectTeam(id){
 if(!state.teams.some(t=>t.id===id))return;
 Object.assign(ui,selectResearchTeam(state,ui,id),{milestoneSelection:null});
 render();resetDetailScroll();
}
function resetDetailScroll(){for(const selector of ['.detail-overview','.detail-background']){const element=app.querySelector(selector);if(element)element.scrollTop=0;}}
function closeMilestone(){const closed=ui.milestoneSelection;ui.milestoneSelection=null;render();app.querySelector(`.milestone-item[data-id="${CSS.escape(closed||'')}"]`)?.focus({preventScroll:true});}
function exportSave(){const url=URL.createObjectURL(new Blob([JSON.stringify({state,savedAt:new Date().toISOString()},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`崇祯工业-v${state.version}-第${state.turn}季.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('卷宗已导出。');}

// Listen before UI actions replace their buttons, including form submissions and keyboard clicks.
document.addEventListener('click',event=>{
 const button=event.target.closest('button,[role="button"],summary');
 if(!button||button.matches(':disabled,[aria-disabled="true"]')||button.closest('[inert]')||ui.turnTransition)return;
 if(ui.modal?.type==='settlement'&&!button.closest('.season-report-modal'))return;
 if(button.dataset.action!=='toggle-click-sound')void clickSound.play();
},{capture:true});
document.addEventListener('click',event=>{const button=event.target.closest('[data-action]');if(!button||button.disabled||ui.turnTransition)return;const command=button.dataset.action,id=button.dataset.id;
 if(ui.modal?.type==='settlement'&&command!=='settlement-continue')return;
 if(command==='continue-game'){if(ui.hasGame)enterGame();}
 else if(command==='return-title'){returnToTitle();}
 else if(command==='load-save'){importRequest++;saveFileInput.value='';saveFileInput.click();}
 else if(command==='confirm-import'){if(ui.pendingImport){const imported=ui.pendingImport.state;enterGame(imported);save();render();toast('卷宗已载入。');}}
 else if(command==='toggle-music'){music.toggle();}
 else if(command==='toggle-click-sound'){clickSound.toggle();void clickSound.play();}
 else if(command==='nav'||command==='open-panel'){openPanel(button.dataset.panel||id);}
 else if(command==='home'||command==='window-close'){ui.panel=null;render();}
 else if(command==='dismiss-notice'){ui.notice='';ui.storageError='';render();}
 else if(command==='tech-select'||command==='select-tech'){selectTechnology(id);}
 else if(command==='select-milestone'){ui.milestoneSelection=id;render();app.querySelector('[data-action="close-milestone"]')?.focus({preventScroll:true});}
 else if(command==='inspect-team'){inspectTeam(id);}
 else if(command==='close-milestone'){closeMilestone();}
 else if(command==='select-category'){ui.techCategory=button.dataset.category;ui.techQuery='';ui.milestoneSelection=null;render();app.querySelector('.research-card-scroll')?.scrollTo({top:0});}
 else if(command==='select-doctrine'){act('selectDoctrine',{id});}
 else if(command==='withdraw-front'){const front=getCombatRating(state).fronts.find(front=>front.id===id);if(front)act('configureFront',{id,target:0,battleCap:front.battleCap});}
 else if(command==='team-tab'){ui.teamTab=id;render();app.querySelector('.window-content')?.scrollTo({top:0});}
 else if(command==='refresh-candidates'){act('refreshCandidates');}
 else if(command==='hire-team'){act('hireTeam',{teamId:id});}
 else if(command==='dismiss-team'){ui.modal={type:'dismiss-team',id};renderModal();}
 else if(command==='dismiss-team-confirm'){act('dismissTeam',{teamId:id});}
 else if(command==='facility-open'){openFacility(defaultFacilityTarget(state,id));}
 else if(command==='facility-detail'||command==='facility-level'){openFacility(id);}
 else if(command==='tech-clear-search'){ui.techQuery='';render();}
 else if(command==='cancel-research'){act('cancelResearch',{teamId:button.dataset.teamId});}
 else if(command==='levy'){act('levy');}
 else if(command==='invest'){const teamId=ui.selectedResearchTeamId;if(!teamId||!state.teams.some(t=>t.id===teamId)){toast('请先选择主持团队。',true);return;}act('invest',{id,teamId});}
 else if(command==='build'){act('build',{id});}
 else if(command==='train'){act('train',{branch:id});}
 else if(command==='test-confirm'||command==='test'){ui.modal={type:'test',id,inviteCourt:false};renderModal();}
 else if(command==='test-audience'&&ui.modal?.type==='test'){ui.modal.inviteCourt=id==='court';updateTrialAudience();}
 else if(command==='test-now'){act('test',{id,inviteCourt:ui.modal?.inviteCourt===true},true);}
 else if(command==='rescue-accept'||command==='rescue-decline'){act('rescue',{accept:command==='rescue-accept'},true);}
 else if(command==='acknowledge-event'){ui.eventAnimatedId=null;act('acknowledgeEvent');}
 else if(command==='end-turn'){if(state.turn===state.maxTurns){ui.modal={type:'final-confirm'};renderModal();}else endSeason();}
 else if(command==='final-now'){endSeason();}
 else if(command==='settlement-continue'){stopSettlementAnimation?.();stopSettlementAnimation=null;ui.modal=null;render();}
 else if(command==='modal-close'||command==='ending-close'){if(ui.screen==='game'&&state.pending)return;closeModal();}
 else if(command==='new-game'){importRequest++;ui.pendingImport=null;ui.resultDismissed=true;ui.modal={type:'new-game'};render();}
 else if(command==='start-game'){
  if(![24,40,64].includes(Number(id)))return;
  const input=modalRoot.querySelector('[data-enemy-strength-number]');if(!input)return;
  syncEnemyStrengthControl(input,true);if(!input.reportValidity())return;
  enterGame(newGame(Number(id),Number(input.value)));save();render();toast('新局已启。招贤理工，循阶救亡。');
 }
 else if(command==='export'){exportSave();}
 else if(command==='ending'){ui.resultDismissed=false;ui.modal=null;render();}
});
saveFileInput.addEventListener('change',async()=>{
 const file=saveFileInput.files?.[0];if(!file)return;const request=++importRequest;
 try {
  const imported=await readSaveFile(file);if(request!==importRequest)return;
  ui.pendingImport={state:imported,name:file.name.slice(0,200)};ui.modal={type:'import-save'};renderModal();
 }catch(error){if(request===importRequest)toast(error.message||'卷宗读取失败，请重试。',true);}
 finally{saveFileInput.value='';}
});
document.addEventListener('pointerdown',event=>{if(!event.target.closest('[data-action="toggle-music"]'))music.unlock();},{capture:true});
document.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)&&!event.target.closest('[data-action="toggle-music"]'))music.unlock();},{capture:true});
document.addEventListener('input',event=>{
 if(event.target.matches('[data-music-volume]'))music.setVolume(Number(event.target.value)/100);
 else if(event.target.matches('[data-click-sound-volume]'))clickSound.setVolume(Number(event.target.value)/100);
 else if(event.target.matches('[data-enemy-strength],[data-enemy-strength-number]'))syncEnemyStrengthControl(event.target);
});
document.addEventListener('change',event=>{
 if(event.target.matches('[data-enemy-strength],[data-enemy-strength-number]'))syncEnemyStrengthControl(event.target,true);
 else if(event.target.matches('[data-click-sound-volume]'))void clickSound.play();
});
document.addEventListener('focusout',event=>{if(event.target.matches('[data-enemy-strength-number]'))syncEnemyStrengthControl(event.target,true);});
document.addEventListener('submit',event=>{if(ui.turnTransition||ui.modal?.type==='settlement'){event.preventDefault();return;}if(event.target.matches('[data-front-orders]')){event.preventDefault();const form=event.target;if(!form.reportValidity())return;const values=new FormData(form);act('configureFront',{id:form.dataset.frontOrders,target:Number(values.get('target')),battleCap:Number(values.get('battleCap'))});return;}if(event.target.id!=='tech-search')return;event.preventDefault();ui.techQuery=String(new FormData(event.target).get('query')||'').trim();render();});
document.addEventListener('keydown',event=>{
 if(event.key==='Escape'&&(ui.turnTransition||ui.modal?.type==='settlement')){event.preventDefault();return;}
 if(event.key==='Escape'&&(ui.screen==='title'||!state.pending)){if(modalRoot.firstChild){closeModal();}else if(ui.milestoneSelection&&ui.panel==='tech'){closeMilestone();}else if(ui.panel){ui.panel=null;render();}}
 if(event.key==='Tab'&&modalRoot.firstChild){const items=[...modalRoot.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled)')];if(!items.length)return;const first=items[0],last=items.at(-1);if(event.shiftKey&&(document.activeElement===first||document.activeElement.classList.contains('modal'))){last.focus();event.preventDefault();}else if(!event.shiftKey&&document.activeElement===last){first.focus();event.preventDefault();}}
});
let drag=null;
document.addEventListener('pointerdown',event=>{
 if(event.button!==0)return;
 const handle=event.target.closest('[data-drag="window"]');
 if(handle&&!event.target.closest('button')&&innerWidth>=760){
  const el=handle.closest('.game-window'),position=ui.windowPosition;
  const rect=el.getBoundingClientRect(),left=rect.left-position.x,top=rect.top-position.y;
  drag={el,startX:event.clientX,startY:event.clientY,...position,minX:8-left,maxX:innerWidth-8-left-rect.width,minY:8-top,maxY:innerHeight-8-top-rect.height};
  handle.setPointerCapture?.(event.pointerId);event.preventDefault();
 }
});
document.addEventListener('pointermove',event=>{
 if(!drag)return;
 ui.windowPosition={x:Math.max(drag.minX,Math.min(drag.maxX,drag.x+event.clientX-drag.startX)),y:Math.max(drag.minY,Math.min(drag.maxY,drag.y+event.clientY-drag.startY))};
 drag.el.style.setProperty('--window-x',`${ui.windowPosition.x}px`);drag.el.style.setProperty('--window-y',`${ui.windowPosition.y}px`);
});
function stopDragging(){drag=null;}
document.addEventListener('pointerup',stopDragging);document.addEventListener('pointercancel',stopDragging);
window.addEventListener('resize',()=>{
 stopDragging();ui.windowPosition={x:0,y:0};const el=app.querySelector('.game-window');if(el){el.style.setProperty('--window-x','0px');el.style.setProperty('--window-y','0px');}
});
render();
