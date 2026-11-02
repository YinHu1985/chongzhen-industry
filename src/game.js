/** Deterministic, immutable, JSON-serializable industrial campaign. */
import {PROJECTS,TECH_ERAS,TECH_BRANCHES,ROUTES,FACILITIES,TECH_CATEGORIES,MILESTONES,SPECIALTIES,DOCTRINES,FAMILIES} from './technology.js';
export {PROJECTS,TECH_ERAS,TECH_BRANCHES,ROUTES,FACILITIES,TECH_CATEGORIES,MILESTONES,SPECIALTIES,DOCTRINES,FAMILIES};
import {FRONTS,createWarfare,activateFronts,getWarfareRating,configureFront,settleWarfare,evaluateCampaign,campaignOutcome,normalizeEnemyStrength,DEFAULT_ENEMY_STRENGTH} from './warfare.js';
export {FRONTS} from './warfare.js';
export const getCampaignOutcome=campaignOutcome;
const PM=Object.fromEntries(PROJECTS.map(p=>[p.id,p])), FM=Object.fromEntries(FACILITIES.map(f=>[f.id,f]));
const BRANCH_NAMES={infantry:'步兵',cavalry:'骑兵',artillery:'炮兵',drill:'军纪与操练',coordination:'诸兵种协同'};
const clamp=(n,min=0,max=100)=>Math.max(min,Math.min(max,n));
const clone=s=>JSON.parse(JSON.stringify(s));
const complete=(s,id)=>Boolean(s.projects[id]?.completed);
const active=s=>s.status==='playing'&&!s.pending;
const freeTeams=s=>s.teams.filter(t=>teamAvailable(s,t));
function addLog(s,title,text,type='info'){s.log.unshift({id:s.nextLogId++,turn:s.turn,title,text,type});}
function random(s){let x=s.rng>>>0;x^=x<<13;x^=x>>>17;x^=x<<5;s.rng=x>>>0;return s.rng/4294967296;}
function ledger(s,kind,amount,category,label,projectId=null,teamId=null){
 if(amount<=0)return;
 s.treasury.entries.push({id:s.treasury.nextId++,turn:s.turn,kind,category,label,amount,balance:s.money,projectId,teamId});
}
function spend(s,n,category,label,projectId=null,teamId=null){s.money-=n;s.stats.spent+=n;ledger(s,'expense',n,category,label,projectId,teamId);}
function earn(s,n,category,label){s.money+=n;s.stats.earned+=n;ledger(s,'income',n,category,label);}
function preparation(s,p){
 const inheritance={...Object.fromEntries(p.prerequisites.map(id=>[id,8])),...(p.transfers||{})};
 const sources=p.automatic?[]:Object.keys(inheritance).filter(id=>complete(s,id));
 const transferBonus=Math.min(50,Math.round(sources.reduce((sum,id)=>sum+inheritance[id]*1.25,0)));
 return {sources,transferBonus,progress:s.projects[p.id].completed?100:Math.max(s.projects[p.id].progress,transferBonus)};
}
function researchOrder(s,team){
 const p=team.activity?.kind==='research'?PM[team.activity.targetId]:null;
 return p&&!p.automatic&&!complete(s,p.id)&&preparation(s,p).progress<100?p:null;
}
function teamAvailable(s,team){return team.usedTurn!==s.turn&&!researchOrder(s,team);}
export function getResearchOrders(s){
 if(s.status!=='playing')return [];
 return s.teams.filter(team=>team.usedTurn!==s.turn).map(team=>{
  const p=researchOrder(s,team);return p?{id:`research:${team.id}`,category:'research',label:`${p.name} · ${team.name}`,amount:p.cost,projectId:p.id,teamId:team.id}:null;
 }).filter(Boolean);
}
export function getFinanceInfo(s){
 const incomeItems=[{id:'base',label:'内库常例拨款',amount:6000},{id:'reputation',label:`朝廷威望拨款（${s.reputation} × 200）`,amount:Math.max(0,s.reputation*200)}];
 const expenseItems=getResearchOrders(s),income=incomeItems.reduce((sum,item)=>sum+item.amount,0),expenses=expenseItems.reduce((sum,item)=>sum+item.amount,0);
 const shortfall=Math.max(0,expenses-s.money),prestigeCost=5,moneyGain=10000;
 const reason=!active(s)?'请先处理当前决策，或本局已结束':s.reputation<prestigeCost?'至少需要5点朝廷威望':'';
 return {money:s.money,income,expenses,netIncome:income-expenses,projectedBalance:s.money+income-expenses,shortfall,canEndTurn:active(s)&&shortfall===0,incomeItems,expenseItems,history:[...s.treasury.entries].reverse(),levy:{name:'劝输助饷',prestigeCost,moneyGain,canUse:!reason,reason}};
}

const teamNames=['钦天监算学组','京畿炉匠班','内廷机巧组','通事洋务馆','新军参谋班'];
function makeTeam(s,index,initial=false){
 const strengths=Object.fromEntries(SPECIALTIES.map((sp,i)=>[sp.id,initial?30+((i+index)%3)*10:25+Math.floor(random(s)*46)]));
 const specialty=initial?['math','metallurgy','mechanics','foreign','military'][index]:SPECIALTIES[Math.floor(random(s)*SPECIALTIES.length)].id;
 strengths[specialty]=initial?92:78+Math.floor(random(s)*21);
 if(initial&&index===4)strengths.management=88;
 if(initial&&index===3)strengths.mechanics=70;
 const id=`team_${s.nextTeamId++}`;
 const name=initial?teamNames[index]:`${['江南','登莱','京师','西洋','两浙','山陕'][Math.floor(random(s)*6)]}${SPECIALTIES.find(sp=>sp.id===specialty).name}研习社 ${s.recruitmentRound+1}-${index+1}`;
 return {id,name,specialties:strengths,usedTurn:0,activity:null,hireCost:Math.round((4000+Object.values(strengths).reduce((a,b)=>a+b,0)*12)/100)*100};
}
export function createGame({maxTurns=24,seed=12345,enemyStrength=DEFAULT_ENEMY_STRENGTH}={}){
 maxTurns=Math.max(4,Math.floor(Number(maxTurns)||24));const safeSeed=(Number(seed)>>>0)||12345;
 enemyStrength=normalizeEnemyStrength(enemyStrength);
 const s={version:7,treasury:{entries:[],nextId:1},lastSettlement:null,enemyStrength,warfare:createWarfare(maxTurns),maxTurns,turn:1,seed:safeSeed,rng:safeSeed,money:35000,reputation:10,doctrine:'cold',teams:[],candidates:[],nextTeamId:1,recruitmentRound:0,
 projects:Object.fromEntries(PROJECTS.map(p=>[p.id,{progress:0,completed:false,investedTurn:0,testedTurn:0,attempts:0}])),facilities:Object.fromEntries(FACILITIES.map(f=>[f.id,0])),army:{infantry:0,cavalry:0,artillery:0,drill:0,coordination:0},trainedTurn:{},plannedEvents:[],resolvedEvents:[],pending:null,log:[],nextLogId:1,status:'playing',stats:{investments:0,researchSuccesses:0,researchSetbacks:0,tests:0,successes:0,failures:0,rescues:0,rescued:0,battles:0,battleWins:0,supplies:0,spent:0,earned:0}};
 s.teams=Array.from({length:5},(_,i)=>makeTeam(s,i,true));s.candidates=Array.from({length:3},(_,i)=>makeTeam(s,i));
 addLog(s,'工部开局',`距最后期限还有${maxTurns}季。让团队推进工业、整备新军；敌情出现后调兵持续剿灭，以补员支撑战损。`);return s;
}
export function getDate(s){const a=64-s.maxTurns+s.turn,y=1+Math.floor(a/4),digits=['零','一','二','三','四','五','六','七','八','九'];const label=y===1?'元':y>0&&y<10?digits[y]:y>=10&&y<20?`十${y%10?digits[y%10]:''}`:String(y);return `崇祯${label}年·${['春','夏','秋','冬'][((a%4)+4)%4]}季`;}
export function getSummary(s){const f=getFinanceInfo(s);return {date:getDate(s),income:f.income,upkeep:f.expenses,expenses:f.expenses,netIncome:f.netIncome,projectedBalance:f.projectedBalance,shortfall:f.shortfall,canEndTurn:f.canEndTurn,baseIncome:6000,reputationIncome:Math.max(0,s.reputation*200),freeTeams:freeTeams(s).length,totalTeams:s.teams.length,reputation:s.reputation,nextEvent:null};}
// A family contributes its strongest completed member once; weaker knowledge stays researched.
function familyBest(s,family,predicate=()=>true){return PROJECTS.filter(p=>p.family===family&&complete(s,p.id)&&predicate(p)).sort((a,b)=>b.level-a.level||b.capacity-a.capacity)[0]||null;}
function familyLevel(s,family){return familyBest(s,family)?.level||0;}
// Milestones are derived gates, never saved or purchased as a second research stage.
export function getMilestones(s){return MILESTONES.map(m=>{
 const requirements=m.requirements.map(r=>({...r,current:familyLevel(s,r.family),done:familyLevel(s,r.family)>=r.minLevel,label:`${FAMILIES.find(f=>f.id===r.family)?.name||r.family}达到${r.minLevel}级`}));
 const missingFacilities=m.facilityRequirements.filter(id=>!s.facilities[id]);const total=requirements.length+m.facilityRequirements.length,done=requirements.filter(r=>r.done).length+m.facilityRequirements.length-missingFacilities.length;
 return {...m,requirements,missingFacilities,completed:done===total,progress:Math.round(done/total*100),unlocks:PROJECTS.filter(p=>p.milestoneRequirements.includes(m.id)).map(p=>p.id)};
 });}
function missingConditions(s,project){
 const missingIds=(project.prerequisites||[]).filter(id=>!complete(s,id));const milestones=getMilestones(s);const missingMilestones=(project.milestoneRequirements||[]).filter(id=>!milestones.find(m=>m.id===id)?.completed);
 const missingFacilities=(project.facilityRequirements||[]).filter(id=>!s.facilities[id]);const missing=[...missingIds.map(id=>PM[id]?.name||id),...missingMilestones.map(id=>`里程碑：${MILESTONES.find(m=>m.id===id).name}`),...missingFacilities.map(id=>`需建成${FM[id].name}`)];return {missingIds,missingMilestones,missingFacilities,missing};
}
function matchTeam(team,weights){const entries=Object.entries(weights||{management:1}),total=entries.reduce((sum,[,w])=>sum+w,0);return Math.round(entries.reduce((sum,[id,w])=>sum+(team.specialties[id]||0)*w,0)/total);}
function teamOptions(s,weights){return s.teams.map(t=>{const match=matchTeam(t,weights);return {...t,match,chance:Math.round(clamp(35+match*.63+familyLevel(s,'education')*3,25,97)),available:teamAvailable(s,t),canAssign:t.usedTurn!==s.turn};}).sort((a,b)=>Number(b.available)-Number(a.available)||b.match-a.match);}
function bestTeam(s,weights){return teamOptions(s,weights).find(t=>t.available)||null;}
export function getProjectInfo(s,id,teamId){
 const p=PM[id];if(!p)return null;const r=s.projects[id];const automatic=p.automatic===true;const conditions=missingConditions(s,p);
 const {sources,transferBonus,progress}=preparation(s,p),progressGain=Math.ceil(100/(p.work||2));
 const assigned=s.teams.find(t=>t.activity?.kind==='research'&&t.activity.targetId===id&&!r.completed);
 const options=teamOptions(s,p.specialtyRequirements);const selected=teamId?options.find(t=>t.id===teamId):options.find(t=>t.id===assigned?.id)||options.find(t=>t.available)||options[0];
 if(automatic){const combat=getCombatRating(s);conditions.missing=r.completed?[]:[...(s.turn<s.maxTurns?['坚持至最后一季结算']:[]),...(combat.fronts.length<FRONTS.length?['尚有战线未出现']:[]),...combat.fronts.filter(f=>!f.done).map(f=>`${f.name}兵力压至${f.victoryThreshold}人以内`)];}
 const locked=conditions.missing.length>0;const researchChance=selected?.chance||0;
 return {...p,...conditions,locked,automatic,progress,completed:r.completed,maxProgress:100,
 availableTeams:options,selectedTeamId:selected?.id||null,selectedTeamName:selected?.name||'',researchChance,researchMatch:selected?.match||0,
 assignedTeamId:assigned?.id||null,assignedTeamName:assigned?.name||'',isAssigned:Boolean(assigned),
 canInvest:active(s)&&!automatic&&!locked&&!r.completed&&progress<100&&Boolean(selected?.canAssign)&&assigned?.id!==selected?.id,
 canTest:active(s)&&!automatic&&!locked&&!r.completed&&progress>0&&s.money>=p.testCost,
 investCost:p.cost,testCost:p.testCost,rescueCost:Math.round((p.cost*.85+p.testCost)/100)*100,successChance:Math.round(clamp(20+progress*.78,5,98)),transferBonus,transferSources:sources.map(id=>PM[id].name),progressGain,failureProgressGain:Math.max(1,Math.ceil(progressGain/3)),investedTurn:r.investedTurn,testedTurn:r.testedTurn,attempts:r.attempts};
}
export function getFacilityInfo(s,id){const f=FM[id];if(!f)return null;const c=missingConditions(s,{...f,facilityRequirements:[]});const built=Boolean(s.facilities[id]),team=bestTeam(s,{management:3,mechanics:1});let reason='';if(!active(s))reason=s.pending?'请先处理当前决策':'本局已结束';else if(built)reason='已经建成';else if(c.missing.length)reason=`先完成：${c.missing.join('、')}`;else if(!team)reason='本季没有空闲团队';else if(s.money<f.cost)reason='资金不足';return {...f,...c,built,unlocked:c.missing.length===0,canBuild:!reason,reason,selectedTeamId:team?.id||null,selectedTeamName:team?.name||''};}
export function getTrainingInfo(s,branch){
 if(!BRANCH_NAMES[branch])return null;const military=getMilestones(s).find(m=>m.id==='organization').completed;
 const cap=complete(s,'officer_school')?100:60;const team=bestTeam(s,{military:3,management:1});const cost=branch==='coordination'?2400:branch==='drill'?1800:2200;const gain=Math.min(Math.max(0,cap-s.army[branch]),complete(s,'repair_corps')?30:25);
 let reason='';if(!active(s))reason=s.pending?'请先处理当前决策':'本局已结束';else if(!military)reason='先达成新军立制（操典与演武场）';else if(branch==='coordination'&&!complete(s,'logistics'))reason='先完成新军军需与运输';else if(s.army[branch]>=cap)reason=cap<100?'军官学堂可把训练上限提高至100':'训练已满';else if(s.trainedTurn[branch]===s.turn)reason='本季已经训练过';else if(!team)reason='本季没有空闲团队';else if(s.money<cost)reason='资金不足';
 return {label:BRANCH_NAMES[branch],description:'每次训练通常提高25，修械队完成后提高30；军官学堂把上限提高至100，换装保留已有训练。',current:s.army[branch],cap,cost,gain,canTrain:!reason,reason,selectedTeamId:team?.id||null,selectedTeamName:team?.name||''};
}
// A new gun does not replace the current service weapon until compatible ammunition exists.
function supplied(s,p){if(p.family==='firearms'){const ammo=familyLevel(s,'ammunition');return familyLevel(s,'powder')>=1&&(p.level===1||ammo>=(p.level>=5?3:p.level>=4?2:1));}if(p.family==='cavalry'&&p.id==='cavalry_gun')return familyLevel(s,'ammunition')>=1;if(p.family==='artillery')return familyLevel(s,'powder')>=1&&(p.level===1||familyLevel(s,'artillery_ammo')>=(p.level>=3?2:1));return true;}
// Industrial quantity now produces ten replacement soldiers per supply unit each season.
export function getCombatRating(s){
 const doctrine=DOCTRINES.find(d=>d.id===s.doctrine)||DOCTRINES[0];const groups=[...new Set(PROJECTS.filter(p=>p.capacity>0).map(p=>p.family))];
 const industries=groups.map(family=>familyBest(s,family)).filter(Boolean).map(p=>({id:p.family,family:p.family,name:p.familyName,projectId:p.id,projectName:p.name,level:p.level,value:p.capacity,capacity:p.capacity}));
 const industrialCapacity=10+industries.reduce((sum,p)=>sum+p.value,0),quantity=Math.round(industrialCapacity*doctrine.quantityFactor);
 const weapon=familyBest(s,doctrine.equipmentFamily,p=>supplied(s,p)),artillery=familyBest(s,'artillery',p=>supplied(s,p));
 const baseEquipment=weapon?.equipment||0,equipment=Math.round(baseEquipment*(1+(artillery?.equipment||0)*.08*s.army.artillery/100)*100)/100;
 const training=Math.round(s.army[doctrine.branch]*.5+s.army.drill*.3+s.army.coordination*.2),trainingFactor=training/100;
 const cavalry=familyBest(s,'cavalry',p=>supplied(s,p));
 const combat={doctrine,quantity,industrialCapacity,quantityFactor:doctrine.quantityFactor,equipment,baseEquipment,equipmentName:weapon?.name||'尚无成套装备',equipmentId:weapon?.id||null,artilleryName:artillery?.name||'无炮兵配套',training,trainingFactor,industries,hasArtillery:Boolean(artillery&&s.army.artillery>=25),hasCavalry:Boolean(cavalry&&s.army.cavalry>=25),formula:'每季补员 = 供军产能 × 方略兵力系数 × 10；装备与训练决定交换比'};
 return {...combat,...getWarfareRating(s,combat)};
}
export function getGoals(s){return getCombatRating(s).fronts.map(f=>({id:f.id,label:`${f.name}：敌军压至${f.victoryThreshold}人以内`,current:f.troops,target:f.victoryThreshold,done:f.done}));}
export function getSelectedRoutes(s){return [getRouteInfo(s)];}
export function getRouteInfo(s,id=s.doctrine){const d=DOCTRINES.find(d=>d.id===id);if(!d)return null;return {...d,selected:s.doctrine===id,requirements:[],missing:[],missingIds:[],ready:getCombatRating({...s,doctrine:id}).ready,training:s.army[d.branch]};}
export function getRecruitmentInfo(s){const refreshCost=2500,maxTeams=8,dismissPrestigeCost=5;const refreshReason=!active(s)?'请先处理当前决策，或本局已结束':s.money<refreshCost?'资金不足':'';return {refreshCost,maxTeams,dismissPrestigeCost,teamCount:s.teams.length,canRefresh:!refreshReason,refreshReason,candidates:s.candidates.map(t=>({...t,canHire:active(s)&&s.teams.length<maxTeams&&s.money>=t.hireCost,reason:!active(s)?'当前不能雇佣':s.teams.length>=maxTeams?'已达团队上限':s.money<t.hireCost?'资金不足':''})),teams:s.teams.map(t=>({...t,available:teamAvailable(s,t),canAssign:t.usedTurn!==s.turn,canDismiss:active(s)&&s.teams.length>1,dismissReason:s.teams.length<=1?'至少保留一支团队':!active(s)?'当前不能解雇':''}))};}
// Research orders persist, while their cost and progress occur only at settlement.
export function getTeamActivity(s,teamId) {
 const team=s.teams.find(t=>t.id===teamId),available=Boolean(team&&teamAvailable(s,team));
 const idle={kind:'idle',targetId:null,projectId:null,name:'暂无研究项目',progress:0,active:false,queued:false,cost:0,available,currentTurn:false,statusLabel:available?'待命':'本季已用'};
 const activity=team?.activity;if(!activity)return idle;
 if(activity.kind==='research'){
  const project=PM[activity.targetId],record=s.projects[activity.targetId];if(!project||!record)return idle;
  if(record.completed)return record.testedTurn===s.turn?{...idle,kind:'research',targetId:project.id,name:project.name,progress:100,currentTurn:true,statusLabel:'本季已结项'}:idle;
  const progress=preparation(s,project).progress,queued=Boolean(researchOrder(s,team)&&team.usedTurn!==s.turn&&s.status==='playing');
  return {...idle,kind:'research',targetId:project.id,projectId:project.id,name:project.name,progress,active:true,queued,cost:queued?project.cost:0,currentTurn:activity.turn===s.turn,statusLabel:s.pending?.kind==='rescue'&&s.pending.projectId===project.id?'等待抢险决策':progress>=100?'待验收 · 不再收费':queued?'待季末结算':'本季已用'};
 }
 if(activity.turn!==s.turn)return idle;
 if(activity.kind==='build'&&FM[activity.targetId])return {...idle,kind:'build',targetId:activity.targetId,name:FM[activity.targetId].name,progress:100,currentTurn:true,statusLabel:'本季营建完成'};
 if(activity.kind==='train'&&BRANCH_NAMES[activity.targetId])return {...idle,kind:'train',targetId:activity.targetId,name:BRANCH_NAMES[activity.targetId],progress:s.army[activity.targetId],currentTurn:true,statusLabel:'本季操演完成'};
 return idle;
}
function occupy(s,id,kind,targetId) {
 const team=s.teams.find(t=>t.id===id);
 if(!team)return;
 if(kind==='research')for(const other of s.teams) {
  if(other.id!==id&&other.activity?.kind==='research'&&other.activity.targetId===targetId)other.activity=null;
 }
 team.usedTurn=s.turn;
 team.activity={kind,targetId,turn:s.turn};
}
export function getTrialStakes(s,id,inviteCourt=false){const p=PM[id];if(!p)return null;const multiplier=inviteCourt?2:1;return {prestigeGain:(p.prestige||0)*multiplier,prestigeLoss:Math.max(2,Math.ceil((p.prestige||0)/2))*multiplier};}
function success(s,id,rescued=false,inviteCourt=false){const p=PM[id],stakes=getTrialStakes(s,id,inviteCourt);s.projects[id].completed=true;s.projects[id].progress=100;s.reputation+=stakes.prestigeGain;s.stats.successes++;if(rescued)s.stats.rescued++;const message=`${p.name}验收成功，成果立即生效。${inviteCourt?'群臣观礼，':''}威望增加${stakes.prestigeGain}。${p.contribution}`;addLog(s,rescued?'抢险成功':'验收成功',message,'success');return message;}
function failure(s,id,severe=false,inviteCourt=false){const stakes=getTrialStakes(s,id,inviteCourt);s.projects[id].progress=Math.max(0,s.projects[id].progress-(severe?15:7));s.reputation-=stakes.prestigeLoss;s.stats.failures++;const message=`${PM[id].name}未通过验收，保留经验，准备进度减少${severe?15:7}。${inviteCourt?'群臣观礼之下，':''}朝廷威望减少${stakes.prestigeLoss}${s.reputation>=0?'；准备尚存时可继续验收。':'。'}`;addLog(s,'验收受挫',message,'warning');return message;}
function resolveDefeat(s){if(s.status!=='playing'||s.reputation>=0)return '';s.status='lost';s.defeatReason='prestige';s.pending=null;const message='朝廷威望跌至负数，群臣已不再相信工业救亡之策。殿上众臣进献红丸，恭请圣上服药静养。宫门缓缓合拢，御案上的工场图纸再无人翻开。';addLog(s,'群臣进献红丸',message,'danger');return message;}
function finishTurn(s){
 const finance=getFinanceInfo(s),combatBefore=getCombatRating(s),entryStart=s.treasury.entries.length;
 const report={turn:s.turn,date:getDate(s),moneyBefore:s.money,moneyAfter:s.money,reputationBefore:s.reputation,reputationAfter:s.reputation,income:finance.income,expenses:finance.expenses,netIncome:finance.netIncome,incomeItems:finance.incomeItems,expenseItems:finance.expenseItems,research:[],battles:[],reinforcements:combatBefore.reinforcements,reserveBefore:combatBefore.reserve,reserveAfter:combatBefore.reserve,totalTroopsBefore:combatBefore.totalTroops,totalTroopsAfter:combatBefore.totalTroops,entries:[],newFronts:[],status:s.status};
 // The entire budget was checked before cloning or consuming any RNG.
 for(const order of finance.expenseItems){
  const p=getProjectInfo(s,order.projectId,order.teamId),team=s.teams.find(t=>t.id===order.teamId),record=s.projects[p.id];
  spend(s,order.amount,'research',order.label,p.id,team.id);
  const passed=random(s)*100<p.researchChance,before=p.progress,after=clamp(before+(passed?p.progressGain:p.failureProgressGain));
  record.progress=after;record.investedTurn=s.turn;team.usedTurn=s.turn;
  s.stats.investments++;s.stats[passed?'researchSuccesses':'researchSetbacks']++;
  report.research.push({projectId:p.id,name:p.name,teamId:team.id,teamName:team.name,before,after,gain:after-before,chance:p.researchChance,passed,cost:order.amount});
  addLog(s,passed?'研究推进':'攻关受阻',`${team.name}推进${p.name}：准备 ${before}% → ${after}%，本季支出${order.amount}两。`,passed?'info':'warning');
 }
 for(const item of finance.incomeItems)earn(s,item.amount,'grant',item.label);
 const reports=settleWarfare(s,getCombatRating(s));
 for(const front of reports){
  const battle=front.lastBattle,before=combatBefore.fronts.find(item=>item.id===front.id);
  report.battles.push({id:front.id,name:front.name,...battle,enemyBefore:before.troops,playerBefore:before.assigned});
  if(battle.playerCommitted){s.stats.battles++;if(battle.enemyDeclining)s.stats.battleWins++;}
  addLog(s,`${front.name} · 季度战报`,`我军出战${battle.playerCommitted}，损失${battle.playerLosses}，实补${battle.reinforcements}（持续补员预算${battle.replacementCapacity}）；敌军出战${battle.enemyCommitted}，歼灭${battle.enemyLosses}，补入${battle.enemyReinforcements}，余${battle.enemyAfter}。`,battle.sustainable&&battle.enemyDeclining?'success':'warning');
 }
 const outcome=evaluateCampaign(s),overrun=FRONTS.some(front=>s.warfare.fronts[front.id].troops>front.defeatThreshold);
 let message='';
 if(overrun||s.turn===s.maxTurns){
  s.status=outcome.status;if(outcome.reason)s.defeatReason=outcome.reason;
  if(s.status==='won'){s.projects.joint_trials.completed=true;s.projects.joint_trials.progress=100;}
  const ending=campaignOutcome(s);message=(overrun?'敌军兵力超过战线崩溃阈值。':'最后一季科研、财政与战事已结算。')+ending.description;
  addLog(s,ending.title,message,s.status==='won'?'success':s.status==='stalemate'?'warning':'danger');
 }else{
  s.turn++;const appeared=activateFronts(s);report.newFronts=appeared.map(front=>front.id);
  message=`进入第${s.turn}季，收入${finance.income}两、科研支出${finance.expenses}两。${appeared.map(front=>`${front.name}出现，请前往救亡方略安排驻军。`).join('')}`;
  addLog(s,'季度结算',message);
  for(const front of appeared)addLog(s,`${front.name}战线告急`,`${front.description}本季结束开始自动交战；不派兵也会增长。`,'warning');
 }
 const combatAfter=getCombatRating(s);
 Object.assign(report,{moneyAfter:s.money,reputationAfter:s.reputation,reserveAfter:combatAfter.reserve,totalTroopsAfter:combatAfter.totalTroops,status:s.status,entries:s.treasury.entries.slice(entryStart)});
 s.lastSettlement=report;return message;
}
export function performAction(original,action){
 const fail=message=>({state:original,message,error:message});if(!original||original.version!==7)return fail('存档版本不兼容。');if(!action||typeof action.type!=='string')return fail('未知操作。');if(original.status!=='playing')return fail('本局已经结束。');if(original.pending&&!((original.pending.kind==='rescue'&&action.type==='rescue')||(original.pending.kind==='event'&&action.type==='event')))return fail('请先处理当前决策。');if(action.type==='endTurn'){const budget=getFinanceInfo(original);if(budget.shortfall)return fail(`内库不足以支付本季指令：需${budget.expenses}两，现有${original.money}两，尚缺${budget.shortfall}两。请取消研究目标或在财政界面劝输助饷。`);}
 const s=clone(original);let message='';
 if(action.type==='configureFront'){const error=configureFront(s,action);if(error)return fail(error);const front=getCombatRating(s).fronts.find(front=>front.id===action.id);message=`${front.name}驻军目标${front.target}人，现有${front.assigned}人；敌军每季参战上限${front.battleCap}人。驻军每季自动剿灭，空缺按兵源补齐。`;addLog(s,'战线部署',message);}
 else if(action.type==='selectDoctrine'||action.type==='selectRoute'){const id=action.id||action.routeId;if(!DOCTRINES.some(d=>d.id===id))return fail('未知作战方略。');s.doctrine=id;message=`采用${DOCTRINES.find(d=>d.id===id).name}；已成成果保留，装备自动选用同类最高成套制式。`;addLog(s,'作战方略',message);}
 else if(action.type==='invest'||action.type==='assignResearch'){
  const p=getProjectInfo(s,action.id,action.teamId);if(!p?.canInvest)return fail(p?.missing.length?`前置未满足：${p.missing.join('、')}`:'当前不能安排此目标，请检查团队本季差事或已有研究目标。');
  for(const team of s.teams)if(team.activity?.kind==='research'&&team.activity.targetId===p.id)team.activity=null;
  const team=s.teams.find(t=>t.id===p.selectedTeamId);team.activity={kind:'research',targetId:p.id,turn:s.turn};
  message=`${team.name}已指定研究目标：${p.name}。每季结算支出${p.investCost}两并推进准备，满100%后暂停收费，可随时取消或换题。`;addLog(s,'科研目标',message);
 }
 else if(action.type==='cancelResearch'){
  const team=s.teams.find(t=>t.id===action.teamId);if(team?.activity?.kind!=='research')return fail('该团队没有可取消的科研目标。');
  const name=PM[team.activity.targetId].name;team.activity=null;message=`${team.name}已取消${name}，既有准备保留，后续不再扣费。`;addLog(s,'取消科研目标',message);
 }
 else if(action.type==='levy'){
  const levy=getFinanceInfo(s).levy;if(!levy.canUse)return fail(levy.reason);
  s.reputation-=levy.prestigeCost;earn(s,levy.moneyGain,'prestige',levy.name);
  message=`劝输助饷：获银${levy.moneyGain}两，朝廷威望减少${levy.prestigeCost}，后续每季威望拨款相应减少${levy.prestigeCost*200}两。`;addLog(s,'劝输助饷',message,'warning');
 }
 else if(action.type==='test'){if(Object.hasOwn(action,'inviteCourt')&&typeof action.inviteCourt!=='boolean')return fail('请选择是否邀请群臣观礼。');const inviteCourt=action.inviteCourt===true,p=getProjectInfo(s,action.id);if(!p?.canTest)return fail('当前不能验收此项目。');spend(s,p.testCost,'trial',`${p.name}验收`,p.id);const r=s.projects[p.id];r.progress=p.progress;r.testedTurn=s.turn;r.attempts++;s.stats.tests++;const roll=random(s)*100;if(roll<p.successChance)message=success(s,p.id,false,inviteCourt);else if(roll<p.successChance+(100-p.successChance)*.8){const chance=Math.round(clamp(60+p.progress*.35,60,95));s.pending={kind:'rescue',projectId:p.id,inviteCourt,title:`${p.name}：现场险情`,description:'发现可以补救的故障，可追加经费组织一次抢险。',cost:p.rescueCost,successChance:chance};message=`现场可追加${p.rescueCost}两抢险，胜算${chance}%。`;addLog(s,'待御批抢险',message,'warning');}else message=failure(s,p.id,true,inviteCourt);}
 else if(action.type==='rescue'){if(s.pending?.kind!=='rescue'||typeof action.accept!=='boolean')return fail('当前没有可处理的抢险。');const p=s.pending;if(action.accept&&s.money<p.cost)return fail('抢险经费不足。');s.pending=null;if(action.accept){spend(s,p.cost,'rescue',`${PM[p.projectId].name}抢险`,p.projectId);s.stats.rescues++;message=random(s)*100<p.successChance?success(s,p.projectId,true,p.inviteCourt):failure(s,p.projectId,false,p.inviteCourt);}else message=failure(s,p.projectId,false,p.inviteCourt);}
 else if(action.type==='build'){const f=getFacilityInfo(s,action.id);if(!f?.canBuild)return fail(f?.reason||'未知设施。');spend(s,f.cost,'construction',f.name,null,f.selectedTeamId);occupy(s,f.selectedTeamId,'build',f.id);s.facilities[f.id]=1;message=`${f.selectedTeamName}督造${f.name}落成，相关里程碑立即更新。`;addLog(s,'营建落成',message,'success');}
 else if(action.type==='train'){const t=getTrainingInfo(s,action.branch);if(!t?.canTrain)return fail(t?.reason||'未知科目。');spend(s,t.cost,'training',`${t.label}操演`,null,t.selectedTeamId);occupy(s,t.selectedTeamId,'train',action.branch);s.army[action.branch]+=t.gain;s.trainedTurn[action.branch]=s.turn;message=`${t.selectedTeamName}组织${t.label}操演，训练提高${t.gain}至${s.army[action.branch]}。`;addLog(s,'操演完成',message);}
 else if(action.type==='refreshCandidates'){const info=getRecruitmentInfo(s);if(!info.canRefresh)return fail(info.refreshReason);spend(s,info.refreshCost,'recruitment','访贤榜更新');s.recruitmentRound++;s.candidates=Array.from({length:3},(_,i)=>makeTeam(s,i));message='访求人才，新的三支候选团队已呈报。雇佣费用另计。';addLog(s,'访贤榜更新',message);}
 else if(action.type==='hireTeam'){const t=getRecruitmentInfo(s).candidates.find(t=>t.id===action.teamId);if(!t?.canHire)return fail(t?.reason||'该候选已不在榜中。');spend(s,t.hireCost,'recruitment',`延请${t.name}`,null,t.id);s.teams.push(s.candidates.find(c=>c.id===t.id));s.candidates=s.candidates.filter(c=>c.id!==t.id);message=`雇佣${t.name}，支付${t.hireCost}两。`;addLog(s,'团队入局',message,'success');}
 else if(action.type==='dismissTeam'){const t=getRecruitmentInfo(s).teams.find(t=>t.id===action.teamId);if(!t?.canDismiss)return fail(t?.dismissReason||'未知团队。');s.teams=s.teams.filter(t=>t.id!==action.teamId);s.reputation-=5;message=`解雇${t.name}，朝廷威望减少5。`;addLog(s,'遣散团队',message,'warning');}
 else if(action.type==='endTurn')message=finishTurn(s);
 else return fail('未知操作。');const ending=resolveDefeat(s);if(ending)message+='\n'+ending;return {state:s,message};
}
