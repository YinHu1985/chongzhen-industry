/** Persistent fronts. All personnel counts are people, never abstract combat scores. */
export const FRONTS = [
  {id:'wokou',name:'倭寇',description:'单兵凶悍，补充较弱；人数虽少，仍会重创装备与操练不足的部队。',startFraction:.25,initialTroops:3500,minTroops:800,maxTroops:60000,defeatThreshold:22000,victoryThreshold:2000,battleCap:6000,baseReinforcements:250,growthRate:.04,power:1.8,missingArtillery:0,missingCavalry:0},
  {id:'li',name:'流寇 · 李自成',description:'单兵较弱，兵源旺盛；缺少炮兵压阵与骑兵追剿时，更难压住人数。',startFraction:.5,initialTroops:24000,minTroops:3000,maxTroops:600000,defeatThreshold:180000,victoryThreshold:8000,battleCap:20000,baseReinforcements:1800,growthRate:.065,power:.48,missingArtillery:.15,missingCavalry:.25},
  {id:'qing',name:'清军',description:'兵强且补充充足；炮兵与骑兵配套不足，会放大敌军优势。',startFraction:.75,initialTroops:18000,minTroops:2500,maxTroops:500000,defeatThreshold:110000,victoryThreshold:6500,battleCap:18000,baseReinforcements:1400,growthRate:.045,power:1.55,missingArtillery:.35,missingCavalry:.35},
];
const byId=Object.fromEntries(FRONTS.map(front=>[front.id,front]));
const priority=['li','qing','wokou'];
export const frontStartTurn=(maxTurns,front)=>Math.max(1,Math.ceil(maxTurns*front.startFraction));
export const strengthMultiplier=level=>Math.round((.4+(level-1)*.15)*100)/100;
export function createWarfare(maxTurns,turn=1){
  return {reserve:8000,lastSettledTurn:turn-1,fronts:Object.fromEntries(FRONTS.map(front=>[front.id,{troops:turn>=frontStartTurn(maxTurns,front)?front.initialTroops:0,assigned:0,target:0,battleCap:front.battleCap,lastBattle:null}]))};
}
export function activateFronts(state){
  const appeared=[];
  for(const front of FRONTS){
    const record=state.warfare.fronts[front.id];
    if(state.turn>=frontStartTurn(state.maxTurns,front)&&record.troops===0){record.troops=front.initialTroops;appeared.push(front);}
  }
  return appeared;
}
// Largest remainders make shared budgets deterministic and conserve every soldier.
function apportion(total,weights){
  const sum=weights.reduce((a,b)=>a+b,0);
  if(!sum)return weights.map(()=>0);
  const shares=weights.map(weight=>total*weight/sum),result=shares.map(Math.floor);
  let remaining=total-result.reduce((a,b)=>a+b,0);
  const order=shares.map((share,index)=>({index,remainder:share-result[index]})).sort((a,b)=>b.remainder-a.remainder||a.index-b.index);
  for(const {index} of order){if(remaining--<=0)break;result[index]++;}
  return result;
}
function liveFronts(state){return FRONTS.filter(front=>state.turn>=frontStartTurn(state.maxTurns,front)&&state.warfare.fronts[front.id].troops>0);}
function forecast(state,front,combat,replacementCapacity){
  const record=state.warfare.fronts[front.id];
  const supportPenalty=1+(!combat.hasArtillery?front.missingArtillery:0)+(!combat.hasCavalry?front.missingCavalry:0);
  const enemyPower=front.power*strengthMultiplier(state.enemyStrength)*supportPenalty;
  const modifier=combat.doctrine.frontModifiers[front.id]??({cold:.95,cuirassier:.85,minie:1.1,breech:1.15}[combat.doctrine.id]||1);
  const playerPower=Math.max(.08,combat.equipment*(.2+.8*combat.trainingFactor))*modifier;
  const playerCommitted=record.assigned,enemyCommitted=Math.min(record.troops,record.battleCap);
  const enemyLosses=playerCommitted?Math.min(enemyCommitted,record.troops-front.minTroops,Math.floor(playerCommitted*.34*playerPower/enemyPower)):0;
  const playerLosses=playerCommitted?Math.min(playerCommitted,Math.ceil(enemyCommitted*.24*enemyPower/playerPower)):0;
  const survivors=record.troops-enemyLosses;
  const enemyReinforcements=Math.min(front.maxTroops-survivors,front.baseReinforcements+Math.round(survivors*front.growthRate));
  return {enemyPower,playerPower,forecast:{enemyCommitted,playerCommitted,enemyLosses,playerLosses,enemyReinforcements,replacementCapacity,sustainable:playerCommitted>0&&playerLosses<=replacementCapacity,enemyDeclining:enemyLosses>enemyReinforcements}};
}
export function getWarfareRating(state,combat){
  const reinforcements=Math.round(combat.quantity*10),active=liveFronts(state);
  const predictions=active.map(front=>forecast(state,front,combat,0));
  const losses=predictions.map(prediction=>prediction.forecast.playerLosses);
  const lossBudget=Math.min(reinforcements,losses.reduce((sum,loss)=>sum+loss,0));
  const budgets=apportion(lossBudget,losses);
  const surplus=apportion(reinforcements-lossBudget,active.map(front=>state.warfare.fronts[front.id].target));
  const fronts=active.map((front,index)=>{
    const record=state.warfare.fronts[front.id],prediction=predictions[index];
    prediction.forecast.replacementCapacity=budgets[index]+surplus[index];
    prediction.forecast.sustainable=record.assigned>0&&prediction.forecast.playerLosses<=prediction.forecast.replacementCapacity;
    return {...front,...record,...prediction,enemyReinforcements:prediction.forecast.enemyReinforcements,done:record.troops<=front.victoryThreshold};
  });
  return {reserve:state.warfare.reserve,totalTroops:state.warfare.reserve+fronts.reduce((sum,front)=>sum+front.assigned,0),reinforcements,enemyStrength:state.enemyStrength,enemyMultiplier:strengthMultiplier(state.enemyStrength),fronts,ready:fronts.length===FRONTS.length&&fronts.every(front=>front.done)};
}
export function configureFront(state,{id,target,battleCap}){
  const front=byId[id],record=state.warfare.fronts[id];
  if(!front||!record||!liveFronts(state).some(front=>front.id===id))return '这条战线尚未出现。';
  if(!Number.isSafeInteger(target)||target<0||target>1000000)return '驻军目标须为 0 至 1,000,000 的整数。';
  if(!Number.isSafeInteger(battleCap)||battleCap<1||battleCap>front.maxTroops)return `敌军参战上限须为 1 至 ${front.maxTroops} 的整数。`;
  if(Object.entries(state.warfare.fronts).reduce((sum,[key,value])=>sum+(key===id?target:value.target),0)>1000000)return '三线驻军目标合计不能超过 1,000,000 人。';
  const change=Math.min(target-record.assigned,state.warfare.reserve);
  record.assigned+=change;state.warfare.reserve-=change;record.target=target;record.battleCap=battleCap;
  return '';
}
export function settleWarfare(state,combat){
  if(state.warfare.lastSettledTurn>=state.turn)return [];
  const rating=getWarfareRating(state,combat);
  for(const front of rating.fronts){
    const record=state.warfare.fronts[front.id],battle=front.forecast;
    record.troops=record.troops-battle.enemyLosses+battle.enemyReinforcements;
    record.assigned-=battle.playerLosses;
  }
  const available=state.warfare.reserve+rating.reinforcements;
  const losses=rating.fronts.map(front=>front.forecast.playerLosses);
  const lossReplacements=apportion(Math.min(available,losses.reduce((a,b)=>a+b,0)),losses);
  const remaining=available-lossReplacements.reduce((a,b)=>a+b,0);
  const deficits=rating.fronts.map((front,index)=>{const record=state.warfare.fronts[front.id];return Math.max(0,record.target-record.assigned-lossReplacements[index]);});
  const gapReplacements=apportion(Math.min(remaining,deficits.reduce((a,b)=>a+b,0)),deficits);
  const replacements=lossReplacements.map((amount,index)=>amount+gapReplacements[index]);
  state.warfare.reserve=available-replacements.reduce((a,b)=>a+b,0);
  for(const [index,front] of rating.fronts.entries()){
    const record=state.warfare.fronts[front.id];record.assigned+=replacements[index];
    record.lastBattle={turn:state.turn,...front.forecast,reinforcements:replacements[index],enemyAfter:record.troops,playerAfter:record.assigned};
  }
  state.warfare.lastSettledTurn=state.turn;
  return rating.fronts.map(front=>({...front,...state.warfare.fronts[front.id]}));
}
const ENDINGS={
  li:{title:'煤山暮色，大明梦断。',description:'流寇战线失守，李自成部攻入京城。工业未能撑起持续作战，崇祯最终自缢煤山。'},
  qing:{title:'清军入关，山河易主。',description:'清军战线失守，关隘尽破。无法挽回的兵力与补给劣势，让清军长驱入关。'},
  wokou:{title:'凤阳遭焚，群臣献丸。',description:'倭寇战线失守，敌军焚毁凤阳。诸臣奉上红丸，宫门合拢，工业救亡之策就此断绝。'},
  prestige:{title:'群臣进献红丸。',description:'朝廷威望跌至负数。丹匣奉至御前，群臣俯首；红丸入喉，未竟的工场与新军自此再无诏令。'},
};
export function evaluateCampaign(state){
  const active=liveFronts(state),record=state.warfare.fronts;
  const overrun=priority.find(id=>record[id].troops>byId[id].defeatThreshold);
  if(overrun)return {status:'lost',reason:overrun};
  if(active.length===FRONTS.length&&active.every(front=>record[front.id].troops<=front.victoryThreshold))return {status:'won',reason:null};
  // Pacified remnants at their floor need not shrink forever to keep a front secure.
  const holding=id=>{const battle=record[id].lastBattle;return record[id].troops<=byId[id].victoryThreshold||(battle?.turn===state.turn&&battle.sustainable&&battle.enemyDeclining);};
  if(active.length===FRONTS.length&&priority.every(holding))return {status:'stalemate',reason:null};
  return {status:'lost',reason:priority.find(id=>!holding(id))||'li'};
}
export function campaignOutcome(state){
  const outcome=state.status==='playing'?evaluateCampaign(state):{status:state.status,reason:state.defeatReason||null};
  if(state.legacyEnding)return {...outcome,title:outcome.status==='won'?'旧卷 · 新军守京。':ENDINGS[outcome.reason||'li'].title,description:outcome.reason==='prestige'?ENDINGS.prestige.description:'本卷按旧版守京规则完结，原有结局已保留。另启新局可体验三线持续作战。'};
  if(outcome.status==='won')return {...outcome,title:'炉火不熄，山河再续。',description:'倭寇、流寇与清军的兵力均已压至平定线以内。新军靠持续的工业补充与作战消除了大患，大明活了下来。'};
  if(outcome.status==='stalemate')return {...outcome,title:'国祚暂续，隐患未消。',description:'已平定的战线维持受控；其余战线的战损均能由当季工业补员覆盖，敌军损失也都超过补充。大明活了下来，但敌患尚未尽除，往后的局势仍未明朗。'};
  return {...outcome,...ENDINGS[outcome.reason||'li']};
}
