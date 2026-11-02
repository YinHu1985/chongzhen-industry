import { createGame, performAction, getProjectInfo, getFacilityInfo, getTrainingInfo, getFinanceInfo, getRecruitmentInfo } from '../../src/game.js';

export function act(state, action) {
  const result = performAction(state, action);
  if (result.error) throw new Error(`${JSON.stringify(action)}: ${result.error}`);
  return result.state;
}
export function settleRescue(state) {
  return state.pending?.kind === 'rescue' ? act(state, {type:'rescue',accept:state.money >= state.pending.cost}) : state;
}
export function finishSeason(state) {
  state = act(state, {type:'endTurn'});
  if (state.pending?.kind === 'event') state = act(state, {type:'acknowledgeEvent'});
  return state;
}
const BASE = ['@workshop','survey','standards','school','water_power','bloomery','drill_manual','@workshop_2','cold_arms','lathe','civil_works','@drill_ground','officer_school','logistics','@machine_shop','boring_machine','planer','quality_control','arsenal_workshops','@machine_shop_2','standard_tools','mass_production'];
const FIREARMS = ['powder_supply','@arsenal','paper_cartridges','@arsenal_2','muskets','@arsenal_3','percussion_caps','percussion_musket','rifling','@arsenal_4','minie_ammo','minie_rifle'];
const STEEL = ['@furnace','iron','@furnace_2','wrought_iron','crucible_steel','rolling_mill'];
const PLANS = {
  cold:[...BASE],
  minie:[...BASE,...FIREARMS],
  cuirassier:[...BASE,...STEEL,'@steel_armory','cuirassier'],
  breech:[...BASE,...FIREARMS,...STEEL,'@machine_shop_3','precision_tools','@arsenal_5','breech_actions','breech_rifle','@metal_ammo_workshop','cartridge_cases','metal_cartridges'],
};

// Finance every building, research attempt, trial and training session through
// public actions. No completed technologies, funds, teams or progress are injected.
export function playCampaign(doctrine='cold', {seed=12345,maxTurns=24,enemyStrength=1,onAction,deployFronts=null,deferProject=null,deferUntil=0,recruitTo=3}={}) {
  let state=createGame({seed,maxTurns,enemyStrength}), beforeDeferredTest=null;
  const history=[], priorities=PLANS[doctrine];
  if (!priorities) throw new Error(`Unknown campaign ${doctrine}`);
  const take=action=>{
    state=act(state,action);
    history.push({turn:state.turn,action});
    onAction?.(state,action);
    if(state.pending?.kind==='rescue') take({type:'rescue',accept:state.money>=state.pending.cost+getFinanceInfo(state).expenses});
    if(state.pending?.kind==='event') take({type:'acknowledgeEvent'});
  };
  if(state.pending?.kind==='event')take({type:'acknowledgeEvent'});
  take({type:'selectDoctrine',id:doctrine});
  let refreshedTurn = 0;
  const recruitOne=()=>{
    if(state.teams.length>=recruitTo)return false;
    const specialties=['mechanics','metallurgy','foreign','management'];
    const best=Object.fromEntries(specialties.map(id=>[id,Math.max(...state.teams.map(team=>team.specialties[id]))]));
    const improvement=team=>specialties.reduce((sum,id)=>sum+Math.max(0,team.specialties[id]-best[id]),0);
    const candidates=()=>[...getRecruitmentInfo(state).candidates].sort((a,b)=>improvement(b)-improvement(a)||a.hireCost-b.hireCost);
    let candidate=candidates()[0];
    // Keep construction and already reserved research financed while filling the
    // starting roster's gaps through real candidate refresh and hiring actions.
    const reserve=state.facilities.workshop?10_000:23_000;
    const available=state.money-getFinanceInfo(state).expenses;
    const refreshCost=getRecruitmentInfo(state).refreshCost;
    if((!candidate||improvement(candidate)<25)&&refreshedTurn!==state.turn&&available>=reserve+refreshCost+9_000){
      take({type:'refreshCandidates'});refreshedTurn=state.turn;candidate=candidates()[0];
    }
    if(!candidate||!candidate.canHire||state.money-candidate.hireCost<getFinanceInfo(state).expenses+reserve)return false;
    take({type:'hireTeam',teamId:candidate.id});return true;
  };
  const trainOne=()=>{
    const branch=doctrine==='cuirassier'?'cavalry':'infantry';
    const option=[branch,'drill','coordination'].map(id=>({id,...getTrainingInfo(state,id)})).filter(i=>i.canTrain).sort((a,b)=>a.current-b.current)[0];
    if(!option||state.money-option.cost<getFinanceInfo(state).expenses)return false;
    take({type:'train',branch:option.id});return true;
  };
  while(state.status==='playing') {
    while(recruitOne()) { /* expand the two-team opening using earned silver */ }
    let saving=false;
    for(let sweep=0;sweep<3&&!saving&&state.status==='playing';sweep++) {
      let changed=false;
      for(const id of priorities) {
        if(state.status!=='playing')break;
        if(id.startsWith('@')) {
          const building=getFacilityInfo(state,id.slice(1));
          if(!building.built&&building.unlocked) {
            if(building.canBuild&&state.money-building.cost>=getFinanceInfo(state).expenses) {take({type:'build',id:building.id});changed=true;}
            else if(state.money<building.cost+getFinanceInfo(state).expenses) {saving=true;break;}
          }
          continue;
        }
        let info=getProjectInfo(state,id);
        const team=info.availableTeams.find(team=>team.available&&team.canAssign);
        if(!info.isAssigned&&team&&getProjectInfo(state,id,team.id).canInvest&&state.money>=getFinanceInfo(state).expenses+info.investCost) {take({type:'invest',id,teamId:team.id});changed=true;}
        info=getProjectInfo(state,id);
        if(info.canTest&&info.progress>=95&&state.money-info.testCost>=getFinanceInfo(state).expenses&&!(id===deferProject&&state.turn<deferUntil)) {
          if(id===deferProject)beforeDeferredTest=structuredClone(state);
          take({type:'test',id});changed=true;
        }
      }
      if(!changed)break;
    }
    if(!saving)while(state.status==='playing'&&trainOne()) { /* use idle teams */ }
    while(state.status==='playing'&&getFinanceInfo(state).shortfall) {
      const order=getFinanceInfo(state).expenseItems.at(-1);
      take({type:'cancelResearch',teamId:order.teamId});
    }
    if(state.status==='playing'&&deployFronts) {
      for(const action of deployFronts(state)) take(action);
    }
    if(state.status==='playing') {
      take({type:'endTurn'});
    }
  }
  return {state,history,priorities,beforeDeferredTest};
}
