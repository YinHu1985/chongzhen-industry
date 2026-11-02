import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, performAction, getSummary, getDate, getProjectInfo, getFacilityInfo, getTrainingInfo, getCombatRating, getGoals, getRecruitmentInfo, getTeamActivity, getTrialStakes, PROJECTS, FACILITIES, SPECIALTIES, DOCTRINES, FAMILIES } from '../src/game.js';
import { act, finishSeason, playCampaign } from './helpers/campaign.mjs';

const byId=Object.fromEntries(PROJECTS.map(p=>[p.id,p]));
function complete(state,...ids){for(const id of ids)Object.assign(state.projects[id],{completed:true,progress:100});return state;}
function workshopGame(options){const state=createGame(options);state.facilities.workshop=1;return state;}
function rollSeed(min,max){
  for(let i=1;i<10000;i++){
    let x=Math.imul(i,0x9e3779b9)>>>0;const input=x;x^=x<<13;x^=x>>>17;x^=x<<5;
    const roll=(x>>>0)/4294967296*100;if(roll>=min&&roll<max)return input;
  }
  throw new Error('No matching RNG seed');
}
function militaryFixture(){const s=createGame();s.money=1_000_000;s.facilities.drill_ground=1;complete(s,'drill_manual','officer_school','logistics');return s;}
function coldForce(){const s=militaryFixture();complete(s,'bloomery','cold_arms','mass_production','standard_tools','school','standards','water_power','quality_control');Object.assign(s.army,{infantry:100,drill:100,coordination:100});return s;}

test('catalog projects retain valid families, specialties and identities under the building groups',()=>{
  assert.equal(PROJECTS.filter(p=>!p.automatic).length,51);
  assert.equal(new Set(PROJECTS.map(p=>p.id)).size,PROJECTS.length);
  for(const p of PROJECTS){
    assert.ok(FAMILIES.some(f=>f.id===p.family),p.id);
    assert.ok(p.prerequisites.every(id=>byId[id]));
    assert.ok(Object.entries(p.specialtyRequirements).every(([id,w])=>SPECIALTIES.some(s=>s.id===id)&&w>0));
  }
});

test('weak iron unlocks onward research and stronger iron remains available to add later',()=>{
  let state=workshopGame();complete(state,'survey','standards');
  assert.equal(getProjectInfo(state,'bloomery').locked,false);
  assert.equal(getProjectInfo(state,'lathe').locked,true);
  complete(state,'bloomery');
  assert.equal(getFacilityInfo(state,'workshop_2').canBuild,true);
  assert.equal(getProjectInfo(state,'lathe').locked,true);
  state=act(state,{type:'build',id:'workshop_2'});
  assert.equal(getProjectInfo(state,'lathe').locked,false);
  complete(state,'water_power');state.facilities.furnace=1;
  assert.equal(getProjectInfo(state,'iron').canInvest,true);
  const old=getCombatRating(state);complete(state,'iron');const upgraded=getCombatRating(state);
  assert.equal(upgraded.industrialCapacity-old.industrialCapacity,byId.iron.capacity-byId.bloomery.capacity);
  assert.equal(upgraded.industries.filter(i=>i.family==='iron').length,1);
  assert.equal(upgraded.industries.find(i=>i.family==='iron').projectId,'iron');
  complete(state,'coke_furnace','hot_blast');
  assert.equal(getCombatRating(state).industries.find(i=>i.family==='iron').value,byId.hot_blast.capacity);
});

test('research groups require their building level, while the building itself adds no numerical bonus',()=>{
  let state=workshopGame();state.facilities.workshop=2;complete(state,'bloomery','lathe');
  assert.equal(getProjectInfo(state,'boring_machine').locked,true);
  state.money=50000;const before=getCombatRating(state).industrialCapacity,income=getSummary(state).income;
  const info=getFacilityInfo(state,'machine_shop');assert.ok(info.canBuild);
  state=act(state,{type:'build',id:'machine_shop'});
  assert.equal(state.teams.find(t=>t.id===info.selectedTeamId).usedTurn,state.turn);
  assert.equal(state.facilities.machine_shop,1);
  assert.equal(getProjectInfo(state,'boring_machine').locked,false);
  assert.equal(getCombatRating(state).industrialCapacity,before);
  assert.equal(getSummary(state).income,income);
  assert.ok(performAction(state,{type:'build',id:'machine_shop'}).error);
});

test('research skill demands change from foreign adoption to precision mathematics and production management',()=>{
  assert.ok(byId.water_power.specialtyRequirements.foreign>0);
  assert.ok(byId.lathe.specialtyRequirements.foreign>0);
  assert.ok(byId.precision_tools.specialtyRequirements.math>byId.precision_tools.specialtyRequirements.mechanics);
  assert.ok(byId.mass_production.specialtyRequirements.management>byId.mass_production.specialtyRequirements.mechanics);
  const state=workshopGame();const best=getProjectInfo(state,'standards',state.teams[0].id),poor=getProjectInfo(state,'standards',state.teams[1].id);
  assert.ok(best.researchChance>poor.researchChance);
  assert.equal(best.selectedTeamId,state.teams[0].id);
  assert.ok(best.availableTeams.every(t=>Number.isInteger(t.match)&&Number.isInteger(t.chance)));
});

test('standing research orders spend nothing until season end, when success and setbacks both produce progress',()=>{
  for(const successful of [true,false]){
    const initial=workshopGame();const teamId=initial.teams[0].id;
    const info=getProjectInfo(initial,'standards',teamId);
    initial.rng=rollSeed(successful?0:info.researchChance,successful?info.researchChance:100);
    const original=JSON.stringify(initial);
    const queued=act(initial,{type:'invest',id:'standards',teamId});
    assert.equal(JSON.stringify(initial),original);
    assert.equal(queued.money,initial.money);assert.equal(queued.rng,initial.rng);
    assert.equal(queued.teams[0].usedTurn,initial.teams[0].usedTurn);
    assert.equal(queued.projects.standards.progress,0);
    assert.equal(getTeamActivity(queued,teamId).queued,true);
    const next=finishSeason(queued);
    assert.equal(next.money,initial.money-info.investCost+getSummary(initial).income);
    assert.equal(next.projects.standards.progress,successful?info.progressGain:info.failureProgressGain);
    assert.equal(next.stats[successful?'researchSuccesses':'researchSetbacks'],1);
  }
});

test('invalid orders preserve state while a research reservation persists until cancellation',()=>{
  let state=workshopGame();const before=JSON.stringify(state),teamCount=state.teams.length;
  for(const action of [{type:'invest',id:'minie_rifle'},{type:'invest',id:'survey',teamId:'missing'},{type:'selectDoctrine',id:'unknown'}]){
    const result=performAction(state,action);assert.ok(result.error);assert.equal(result.state,state);assert.equal(JSON.stringify(state),before);
  }
  const teamId=state.teams[0].id;
  state=act(state,{type:'invest',id:'standards',teamId});assert.equal(getSummary(state).freeTeams,teamCount-1);
  state.rng=rollSeed(95,100);state=finishSeason(state);
  assert.equal(getSummary(state).freeTeams,teamCount-1);
  assert.ok(state.projects.standards.progress>0);
  state=act(state,{type:'cancelResearch',teamId});assert.equal(getSummary(state).freeTeams,teamCount);
});

test('candidate refresh and hiring are distinct payments; dismissal loses prestige and preserves one team',()=>{
  let state=createGame(),info=getRecruitmentInfo(state);const candidate=state.candidates[0],money=state.money,teamCount=state.teams.length;
  state=act(state,{type:'hireTeam',teamId:candidate.id});
  assert.equal(state.money,money-candidate.hireCost);assert.equal(state.teams.length,teamCount+1);assert.equal(state.candidates.length,2);
  const previousIds=state.candidates.map(t=>t.id),beforeRefresh=state.money;
  state=act(state,{type:'refreshCandidates'});assert.equal(state.money,beforeRefresh-info.refreshCost);
  assert.equal(state.candidates.length,3);assert.ok(state.candidates.every(t=>!previousIds.includes(t.id)));
  const reputation=state.reputation;state=act(state,{type:'dismissTeam',teamId:candidate.id});
  assert.equal(state.reputation,reputation-info.dismissPrestigeCost);assert.equal(state.teams.length,teamCount);
  state.reputation=30;
  while(state.teams.length>1)state=act(state,{type:'dismissTeam',teamId:state.teams.at(-1).id});
  assert.ok(performAction(state,{type:'dismissTeam',teamId:state.teams[0].id}).error);
  assert.equal(getRecruitmentInfo(state).teams[0].canDismiss,false);
  assert.equal(new Set([...state.teams,...state.candidates].map(t=>t.id)).size,state.teams.length+state.candidates.length);
});

test('recruitment caps employed teams at eight and preserves state when unaffordable',()=>{
  let state=createGame();state.money=100000;
  while(state.teams.length<8){
    if(!state.candidates.length)state=act(state,{type:'refreshCandidates'});
    state=act(state,{type:'hireTeam',teamId:state.candidates[0].id});
  }
  state=act(state,{type:'refreshCandidates'});assert.equal(state.teams.length,8);
  assert.ok(getRecruitmentInfo(state).candidates.every(c=>!c.canHire));
  assert.ok(performAction(state,{type:'hireTeam',teamId:state.candidates[0].id}).error);
  state.money=0;assert.equal(getRecruitmentInfo(state).canRefresh,false);
  assert.equal(performAction(state,{type:'refreshCandidates'}).state,state);
});

test('independent technology nodes define research pace and no per-project method toggle remains',()=>{
  const state=workshopGame();
  const smallFurnace=getProjectInfo(state,'bloomery'),cokeFurnace=getProjectInfo(state,'coke_furnace');
  assert.equal(smallFurnace.progressGain,100);assert.equal(cokeFurnace.progressGain,50);
  assert.ok(smallFurnace.capacity<cokeFurnace.capacity,'quick start trades production for speed');
  assert.ok(PROJECTS.every(project=>!Object.hasOwn(project,'supportsMakeshift')));
  assert.ok(Object.values(state.projects).every(project=>!Object.hasOwn(project,'method')));
  assert.ok(!Object.hasOwn(smallFurnace,'method')&&!Object.hasOwn(smallFurnace,'canChooseMethod'));
  const result=performAction(state,{type:'method',id:'bloomery',method:'makeshift'});
  assert.ok(result.error);assert.equal(result.state,state);
});

test('legacy method metadata cannot change progress gains or inherited knowledge',()=>{
  const state=workshopGame();complete(state,'civil_works');
  const original=getProjectInfo(state,'lathe');assert.ok(original.transferBonus>0);
  state.projects.civil_works.method='makeshift';state.projects.lathe.method='makeshift';
  const legacy=getProjectInfo(state,'lathe');
  assert.equal(legacy.progressGain,original.progressGain);
  assert.equal(legacy.transferBonus,original.transferBonus);
  assert.equal(legacy.researchChance,original.researchChance);
});

test('income is exactly the base allowance plus prestige, and trials add prestige without immediate income',()=>{
  let state=workshopGame();state.rng=rollSeed(0,1);state.projects.survey.progress=100;
  const money=state.money,rep=state.reputation;state=act(state,{type:'test',id:'survey'});
  assert.equal(state.money,money-byId.survey.testCost);assert.equal(state.reputation,rep+byId.survey.prestige);
  for(const p of PROJECTS)complete(state,p.id);for(const f of FACILITIES)state.facilities[f.buildingId]=Math.max(state.facilities[f.buildingId],f.level);
  state.reputation=137;assert.equal(getSummary(state).income,33400);assert.equal(getSummary(state).upkeep,0);
});

test('training uses a matching available team, needs a drill ground and manual and keeps progress through equipment changes',()=>{
  let state=createGame();assert.equal(getTrainingInfo(state,'infantry').canTrain,false);
  complete(state,'drill_manual');state.facilities.drill_ground=1;
  assert.equal(getTrainingInfo(state,'infantry').cap,60);
  complete(state,'officer_school','logistics');const info=getTrainingInfo(state,'infantry');assert.equal(info.cap,100);
  state=act(state,{type:'train',branch:'infantry'});assert.equal(state.army.infantry,25);
  assert.equal(state.teams.find(t=>t.id===info.selectedTeamId).usedTurn,state.turn);
  assert.ok(performAction(state,{type:'train',branch:'infantry'}).error);
  state=act(state,{type:'selectDoctrine',id:'minie'});complete(state,'minie_rifle','minie_ammo','powder_supply');
  assert.equal(state.army.infantry,25);
  complete(state,'repair_corps');assert.equal(getTrainingInfo(state,'infantry').gain,30);
  state.army.infantry=95;assert.equal(getTrainingInfo(state,'infantry').gain,5);
});

test('completed guns need matching ammunition and automatically replace weaker guns under either firearm doctrine',()=>{
  const state=createGame();complete(state,'powder_supply','muskets','paper_cartridges');
  for(const doctrine of ['minie','breech']){
    state.doctrine=doctrine;const old=getCombatRating(state).baseEquipment;
    complete(state,'minie_rifle');assert.equal(getCombatRating(state).baseEquipment,old);
    complete(state,'minie_ammo');assert.equal(getCombatRating(state).equipmentId,'minie_rifle');
    complete(state,'breech_rifle');assert.equal(getCombatRating(state).equipmentId,'minie_rifle');
    complete(state,'metal_cartridges');assert.equal(getCombatRating(state).equipmentId,'breech_rifle');
    assert.equal(getCombatRating(state).baseEquipment,byId.breech_rifle.equipment);
    for(const id of ['minie_rifle','minie_ammo','breech_rifle','metal_cartridges'])state.projects[id].completed=false;
  }
});

test('steel cold weapons replace earlier gear and cannon benefits require ammunition and trained artillery',()=>{
  const state=coldForce();const old=getCombatRating(state).baseEquipment;complete(state,'steel_arms');
  assert.equal(getCombatRating(state).baseEquipment,byId.steel_arms.equipment);assert.ok(byId.steel_arms.equipment>old);
  complete(state,'powder_supply','napoleon_gun');state.army.artillery=100;
  assert.equal(getCombatRating(state).equipment,getCombatRating(state).baseEquipment);
  complete(state,'artillery_supply');assert.ok(getCombatRating(state).equipment>getCombatRating(state).baseEquipment);
  const cannonEquipment=getCombatRating(state).equipment;complete(state,'armstrong_gun');assert.equal(getCombatRating(state).equipment,cannonEquipment);
  complete(state,'rifled_shells');assert.ok(getCombatRating(state).equipment>cannonEquipment);
  state.army.artillery=0;assert.equal(getCombatRating(state).equipment,getCombatRating(state).baseEquipment);
});

test('industrial output increases recurring replacements while equipment and training remain independent',()=>{
  const state=coldForce(),rating=getCombatRating(state);
  assert.equal(rating.reinforcements,rating.quantity*10);
  assert.ok(rating.reinforcements>getCombatRating(createGame()).reinforcements);
  assert.equal(state.projects.minie_rifle.completed,false);
  assert.deepEqual(rating.fronts.map(front=>front.id),['wokou'],'only the opening coastal front is visible before later enemies arrive');
  Object.assign(state.army,{infantry:0,drill:0,coordination:0});
  assert.equal(getCombatRating(state).training,0);
  assert.equal(getCombatRating(state).reinforcements,rating.reinforcements);
});

test('trials allow one paid rescue and round-tripped saves reproduce its outcome',()=>{
  let state=workshopGame();state.projects.survey.progress=60;state.rng=rollSeed(70,85);
  state=act(state,{type:'test',id:'survey'});assert.equal(state.pending?.kind,'rescue');
  assert.ok(performAction(state,{type:'endTurn'}).error);assert.ok(performAction(state,{type:'invest',id:'school'}).error);
  const saved=structuredClone(state),result=act(state,{type:'rescue',accept:true});
  assert.deepEqual(result,act(saved,{type:'rescue',accept:true}));assert.equal(result.stats.rescues,1);
  assert.ok(performAction(result,{type:'rescue',accept:true}).error);
});

test('persistent fronts follow their timeline while random court events settle and can be acknowledged',()=>{
  let state=createGame();
  assert.ok(!Object.hasOwn(state,'plannedEvents')&&!Object.hasOwn(state,'resolvedEvents'));
  assert.equal(state.events.lastChecked.before_turn,1);
  while(state.turn<6)state=finishSeason(state);
  assert.deepEqual(getCombatRating(state).fronts.map(front=>front.id),['wokou','bailian']);
  const money=state.money,reputation=state.reputation,income=getSummary(state).income;
  state=finishSeason(state);
  assert.equal(state.pending,null);assert.equal(state.turn,7);
  const effects=state.lastSettlement.events.flatMap(event=>event.effects);
  const eventMoney=effects.filter(effect=>effect.type==='money').reduce((sum,effect)=>sum+effect.amount,0);
  const eventPrestige=effects.filter(effect=>effect.type==='reputation').reduce((sum,effect)=>sum+effect.amount,0);
  assert.equal(state.reputation,reputation+eventPrestige);
  assert.equal(state.money,money+income+eventMoney);
  assert.equal(state.events.lastChecked.before_turn,7);
  assert.equal(state.maxTurns,24);
});

test('a fully equipped and trained army never wins before the final seasonal battle',()=>{
  let state=coldForce();const info=getProjectInfo(state,'joint_trials');
  assert.equal(info.canTest,false);assert.equal(info.canInvest,false);
  state=act(state,{type:'selectDoctrine',id:'cold'});
  assert.equal(state.status,'playing');assert.equal(state.turn,1);
  assert.equal(state.projects.joint_trials.completed,false);
  assert.equal(state.projects.joint_trials.attempts,0);
});

test('calendar covers 24, 40 and 64 seasons with a fixed final date',()=>{
  for(const [maxTurns,date] of [[24,'崇祯十一年·夏季'],[40,'崇祯七年·夏季'],[64,'崇祯元年·夏季']]){
    const state=createGame({maxTurns});assert.equal(getDate(state),date);
    state.turn=maxTurns;assert.equal(getDate(state),'崇祯十七年·春季');
  }
});

for(const doctrine of DOCTRINES.map(d=>d.id))test(`financed ${doctrine} research without deploying an army cannot win`,()=>{
  const {state}=playCampaign(doctrine);
  assert.equal(state.status,'lost');assert.ok(state.turn<=24);
  assert.equal(state.projects.joint_trials.completed,false);
  assert.equal(state.projects.joint_trials.attempts,0);
  assert.ok(Object.values(state.warfare.fronts).every(front=>front.assigned===0));
  assert.ok(performAction(state,{type:'endTurn'}).error);
});


test('standing research continues across seasons then stops charging at full preparation',()=>{
  let state=workshopGame();const teamId=state.teams[0].id;
  state=act(state,{type:'invest',id:'standards',teamId});
  const initial=state.money,cost=getProjectInfo(state,'standards').investCost;
  state.rng=rollSeed(0,1);state=finishSeason(state);
  assert.equal(state.projects.standards.progress,100);
  assert.equal(state.money,initial-cost+getSummary(state).income);
  assert.equal(getTeamActivity(state,teamId).queued,false);
  assert.match(getTeamActivity(state,teamId).statusLabel,/待验收/);
  const money=state.money,investments=state.stats.investments;
  state=finishSeason(state);
  assert.equal(state.stats.investments,investments);
  assert.equal(state.money,money+getSummary(state).income);
});

test('reassigning research changes its sole owner without spending or losing preparation',()=>{
  let state=workshopGame();const first=state.teams[0].id,second=state.teams[1].id;
  state=act(state,{type:'invest',id:'survey',teamId:first});
  const money=state.money,rng=state.rng;
  state=act(state,{type:'invest',id:'survey',teamId:second});
  assert.equal(state.projects.survey.progress,0);
  assert.equal(state.teams.find(t=>t.id===first).activity,null);
  assert.equal(getTeamActivity(state,second).projectId,'survey');
  assert.equal(state.money,money);assert.equal(state.rng,rng);
  assert.equal(state.teams.filter(t=>t.activity?.kind==='research'&&t.activity.targetId==='survey').length,1);
  state=act(state,{type:'invest',id:'standards',teamId:second});
  assert.equal(getTeamActivity(state,second).projectId,'standards');
  assert.equal(getProjectInfo(state,'survey').isAssigned,false);
});

test('completed research ends its recurring expense and the team can be reassigned immediately',()=>{
  let state=workshopGame();const teamId=state.teams[0].id;
  state=act(state,{type:'invest',id:'survey',teamId});
  state.rng=rollSeed(0,1);state=finishSeason(state);
  assert.match(getTeamActivity(state,teamId).statusLabel,/待验收/);
  state.rng=rollSeed(0,1);state=act(state,{type:'test',id:'survey'});
  assert.equal(state.projects.survey.completed,true);
  assert.equal(getTeamActivity(state,teamId).active,false);
  state=act(state,{type:'invest',id:'standards',teamId});
  assert.equal(getTeamActivity(state,teamId).projectId,'standards');
});

test('training respects research reservations until the player explicitly cancels them',()=>{
  let state=workshopGame();complete(state,'drill_manual');state.facilities.drill_ground=1;
  const trainer=getTrainingInfo(state,'infantry').selectedTeamId;
  state=act(state,{type:'invest',id:'school',teamId:trainer});
  for(const team of state.teams)if(team.id!==trainer)team.usedTurn=state.turn;
  assert.equal(getTrainingInfo(state,'infantry').canTrain,false);
  const denied=performAction(state,{type:'train',branch:'infantry'});
  assert.ok(denied.error);assert.equal(denied.state,state);
  state=act(state,{type:'cancelResearch',teamId:trainer});
  assert.equal(getTrainingInfo(state,'infantry').canTrain,true);
  state=act(state,{type:'train',branch:'infantry'});
  assert.equal(getTeamActivity(state,trainer).kind,'train');
  assert.equal(state.projects.school.progress,0);
  assert.ok(performAction(state,{type:'invest',id:'school',teamId:trainer}).error);
});

test('untracked or dismissed teams have no research queue and retain project preparation',()=>{
  let state=workshopGame();const id=state.teams[0].id;delete state.teams[0].activity;
  assert.equal(getTeamActivity(state,id).kind,'idle');
  state=act(state,{type:'invest',id:'survey',teamId:id});
  state.rng=rollSeed(95,100);state=finishSeason(state);
  const progress=state.projects.survey.progress;assert.ok(progress>0);
  state=act(state,{type:'dismissTeam',teamId:id});
  assert.equal(state.projects.survey.progress,progress);assert.equal(getTeamActivity(state,id).projectId,null);
});

test('court observation doubles trial prestige stakes without changing odds, expense or technical outcome',()=>{
  for(const successful of [true,false]){
    const state=workshopGame();state.projects.survey.progress=60;state.rng=rollSeed(successful?0:95,successful?1:100);
    const original=JSON.stringify(state),normalStakes=getTrialStakes(state,'survey'),courtStakes=getTrialStakes(state,'survey',true);
    assert.equal(courtStakes.prestigeGain,normalStakes.prestigeGain*2);
    assert.equal(courtStakes.prestigeLoss,normalStakes.prestigeLoss*2);
    const normal=act(state,{type:'test',id:'survey'}),observed=act(state,{type:'test',id:'survey',inviteCourt:true});
    assert.equal(JSON.stringify(state),original);
    assert.equal(normal.pending,null);assert.equal(observed.pending,null);
    assert.equal(normal.reputation,state.reputation+(successful?normalStakes.prestigeGain:-normalStakes.prestigeLoss));
    assert.equal(observed.reputation,state.reputation+(successful?courtStakes.prestigeGain:-courtStakes.prestigeLoss));
    assert.deepEqual(normal.projects,observed.projects);assert.deepEqual(normal.stats,observed.stats);
    assert.equal(normal.money,observed.money);assert.equal(normal.rng,observed.rng);
    assert.equal(normal.projects.survey.completed,successful);
    assert.match(observed.log[0].text,/群臣观礼/);
  }
});

test('rescue success, rescue failure and declining rescue retain the original court stakes exactly once',()=>{
  for(const outcome of ['success','failure','decline']){
    const state=workshopGame();state.projects.survey.progress=60;state.rng=rollSeed(70,85);
    const results=[];
    for(const inviteCourt of [false,true]){
      const stakes=getTrialStakes(state,'survey',inviteCourt);
      const pending=act(state,{type:'test',id:'survey',inviteCourt});
      assert.equal(pending.pending.kind,'rescue');assert.equal(pending.pending.inviteCourt,inviteCourt);
      assert.equal(pending.reputation,state.reputation,'recoverable mishaps are not a final failure');
      assert.equal(pending.stats.failures,0);
      pending.rng=rollSeed(outcome==='success'?0:99,outcome==='success'?1:100);
      const result=act(pending,{type:'rescue',accept:outcome!=='decline'});
      assert.equal(result.pending,null);
      assert.equal(result.reputation,state.reputation+(outcome==='success'?stakes.prestigeGain:-stakes.prestigeLoss));
      assert.equal(result.stats.successes,outcome==='success'?1:0);
      assert.equal(result.stats.failures,outcome==='success'?0:1);
      assert.equal(result.stats.rescued,outcome==='success'?1:0);
      assert.equal(result.stats.rescues,outcome==='decline'?0:1);
      assert.ok(performAction(result,{type:'rescue',accept:true}).error);
      results.push(result);
    }
    assert.deepEqual(results[0].projects,results[1].projects);
    assert.equal(results[0].money,results[1].money);
    assert.equal(results[0].rng,results[1].rng);
  }
});

test('invalid court choices never spend money or consume an attempt or random draw',()=>{
  const state=workshopGame();state.projects.survey.progress=100;const original=JSON.stringify(state);
  for(const inviteCourt of [null,undefined,1,'true',{},[]]){
    const result=performAction(state,{type:'test',id:'survey',inviteCourt});
    assert.ok(result.error);assert.equal(result.state,state);assert.equal(JSON.stringify(state),original);
  }
});

test('negative prestige from a trial immediately ends the campaign and blocks further actions',()=>{
  for(const inviteCourt of [false,true]){
    const state=workshopGame();state.projects.survey.progress=60;state.rng=rollSeed(95,100);
    state.reputation=getTrialStakes(state,'survey',inviteCourt).prestigeLoss-1;
    const result=act(state,{type:'test',id:'survey',inviteCourt});
    assert.equal(result.reputation,-1);assert.equal(result.status,'lost');assert.equal(result.defeatReason,'prestige');
    assert.equal(result.turn,state.turn);assert.equal(result.pending,null);assert.equal(result.stats.earned,state.stats.earned);
    assert.equal(result.money,state.money-byId.survey.testCost);assert.equal(result.projects.survey.completed,false);
    assert.equal(result.log[0].title,'群臣进献红丸');
    for(const action of [{type:'endTurn'},{type:'test',id:'standards'},{type:'rescue',accept:true},{type:'selectDoctrine',id:'cold'}]){
      const terminal=performAction(result,action);assert.ok(terminal.error);assert.equal(terminal.state,result);
    }
  }
});

test('court rescue failure can trigger the red-pill ending while a successful rescue still earns prestige',()=>{
  for(const accept of [false,true]){
    const state=workshopGame();state.projects.survey.progress=60;state.rng=rollSeed(70,85);state.reputation=3;
    const pending=act(state,{type:'test',id:'survey',inviteCourt:true});
    assert.equal(pending.status,'playing');assert.equal(pending.reputation,3);
    pending.rng=rollSeed(99,100);
    const lost=act(pending,{type:'rescue',accept});
    assert.equal(lost.status,'lost');assert.equal(lost.defeatReason,'prestige');assert.equal(lost.reputation,-1);
    assert.equal(lost.pending,null);assert.equal(lost.turn,state.turn);
  }
  const state=workshopGame();state.projects.survey.progress=60;state.rng=rollSeed(70,85);state.reputation=0;
  const pending=act(state,{type:'test',id:'survey',inviteCourt:true});pending.rng=rollSeed(0,1);
  const rescued=act(pending,{type:'rescue',accept:true});
  assert.equal(rescued.status,'playing');assert.equal(rescued.reputation,getTrialStakes(state,'survey',true).prestigeGain);
});

test('zero prestige is safe after a trial, dismissal and seasonal settlement',()=>{
  let trial=workshopGame();trial.projects.survey.progress=60;trial.rng=rollSeed(95,100);
  trial.reputation=getTrialStakes(trial,'survey').prestigeLoss;
  trial=act(trial,{type:'test',id:'survey'});assert.equal(trial.reputation,0);assert.equal(trial.status,'playing');
  let dismissal=createGame();dismissal.reputation=5;
  dismissal=act(dismissal,{type:'dismissTeam',teamId:dismissal.teams[0].id});assert.equal(dismissal.reputation,0);assert.equal(dismissal.status,'playing');
  const money=dismissal.money;dismissal=act(dismissal,{type:'endTurn'});
  assert.equal(dismissal.reputation,0);assert.equal(dismissal.status,'playing');assert.equal(dismissal.money,money+6000);
});

test('dismissal can cause immediate prestige defeat before seasonal income',()=>{
  const army=coldForce();army.reputation=4;
  const dismissed=act(army,{type:'dismissTeam',teamId:army.teams[0].id});
  assert.equal(dismissed.reputation,-1);assert.equal(dismissed.status,'lost');assert.equal(dismissed.defeatReason,'prestige');
  assert.equal(dismissed.projects.joint_trials.completed,false);assert.equal(dismissed.turn,army.turn);
  assert.equal(dismissed.money,army.money);assert.equal(dismissed.stats.earned,army.stats.earned);
  assert.equal(dismissed.log[0].title,'群臣进献红丸');
});
