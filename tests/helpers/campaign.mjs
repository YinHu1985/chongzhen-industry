import { createGame, performAction, getProjectInfo, getFacilityInfo, getTrainingInfo, getFinanceInfo } from '../../src/game.js';

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
  if (state.pending?.kind === 'event') {
    const choice = state.pending.choices.find(choice => choice.id === 'supply' && !choice.disabled);
    state = act(state, {type:'event',choice:choice?.id || 'ignore'});
  }
  return state;
}
const BASE = ['@workshop','survey','standards','school','water_power','bloomery','drill_manual','lathe','civil_works','@drill_ground','officer_school','logistics','@machine_shop'];
const PLANS = {
  cold:[...BASE,'cold_arms','arsenal_workshops','boring_machine','quality_control','mass_production','standard_tools'],
  minie:[...BASE,'arsenal_workshops','boring_machine','quality_control','powder_supply','paper_cartridges','rifling','percussion_caps','minie_ammo','mass_production','minie_rifle'],
  cuirassier:[...BASE,'@furnace','wrought_iron','crucible_steel','cuirassier','iron','arsenal_workshops','boring_machine','quality_control','mass_production','standard_tools'],
  breech:[...BASE,'arsenal_workshops','boring_machine','quality_control','powder_supply','paper_cartridges','rifling','percussion_caps','@furnace','wrought_iron','crucible_steel','rolling_mill','precision_tools','cartridge_cases','breech_actions','metal_cartridges','mass_production','breech_rifle'],
};

// Finance every building, research attempt, trial and training session through
// public actions. No completed technologies, funds, teams or progress are injected.
export function playCampaign(doctrine='cold', {seed=12345,maxTurns=24,enemyStrength=1,onAction,deployFronts=null,deferProject=null,deferUntil=0}={}) {
  let state=createGame({seed,maxTurns,enemyStrength}), beforeDeferredTest=null;
  const history=[], priorities=PLANS[doctrine];
  if (!priorities) throw new Error(`Unknown campaign ${doctrine}`);
  const take=action=>{
    state=act(state,action);
    history.push({turn:state.turn,action});
    onAction?.(state,action);
    if(state.pending?.kind==='rescue') take({type:'rescue',accept:state.money>=state.pending.cost+getFinanceInfo(state).expenses});
  };
  take({type:'selectDoctrine',id:doctrine});
  const trainOne=()=>{
    const branch=doctrine==='cuirassier'?'cavalry':'infantry';
    const option=[branch,'drill','coordination'].map(id=>({id,...getTrainingInfo(state,id)})).filter(i=>i.canTrain).sort((a,b)=>a.current-b.current)[0];
    if(!option||state.money-option.cost<getFinanceInfo(state).expenses)return false;
    take({type:'train',branch:option.id});return true;
  };
  while(state.status==='playing') {
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
      if(state.pending?.kind==='event')take({type:'event',choice:state.pending.choices.find(c=>c.id==='supply'&&!c.disabled)?.id||'ignore'});
    }
  }
  return {state,history,priorities,beforeDeferredTest};
}
