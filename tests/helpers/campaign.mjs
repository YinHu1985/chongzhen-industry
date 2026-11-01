import { createGame, performAction, getProjectInfo, getFacilityInfo, getTrainingInfo } from '../../src/game.js';

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
export function playCampaign(doctrine='cold', {seed=12345,maxTurns=24,onAction,deferProject=null,deferUntil=0}={}) {
  let state=createGame({seed,maxTurns}), beforeDeferredTest=null;
  const history=[], priorities=PLANS[doctrine];
  if (!priorities) throw new Error(`Unknown campaign ${doctrine}`);
  const take=action=>{
    state=act(state,action);
    history.push({turn:state.turn,action});
    onAction?.(state,action);
    if(state.pending?.kind==='rescue') take({type:'rescue',accept:state.money>=state.pending.cost});
  };
  take({type:'selectDoctrine',id:doctrine});
  const trainOne=()=>{
    const branch=doctrine==='cuirassier'?'cavalry':'infantry';
    const option=[branch,'drill','coordination'].map(id=>({id,...getTrainingInfo(state,id)})).filter(i=>i.canTrain).sort((a,b)=>a.current-b.current)[0];
    if(!option)return false;
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
            if(building.canBuild) {take({type:'build',id:building.id});changed=true;}
            else if(state.money<building.cost) {saving=true;break;}
          }
          continue;
        }
        let info=getProjectInfo(state,id);
        if(info.canInvest) {take({type:'invest',id});changed=true;}
        info=getProjectInfo(state,id);
        if(info.canTest&&info.progress>=95&&!(id===deferProject&&state.turn<deferUntil)) {
          if(id===deferProject)beforeDeferredTest=structuredClone(state);
          take({type:'test',id});changed=true;
        }
      }
      if(!changed)break;
    }
    if(!saving)while(state.status==='playing'&&trainOne()) { /* use idle teams */ }
    if(state.status==='playing') {
      take({type:'endTurn'});
      if(state.pending?.kind==='event')take({type:'event',choice:state.pending.choices.find(c=>c.id==='supply'&&!c.disabled)?.id||'ignore'});
    }
  }
  return {state,history,priorities,beforeDeferredTest};
}
