/* Small-set retrieval scheduling. Durable learning strength is handled separately. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FocusReviewEngine=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const GOAL=3,MAX_ATTEMPTS=8,PAUSE_MS=30000,MAX_TIME=8640000000000000;
  const TRACKS=['en-fr','fr-en','context','listen','article','sound'];
  const STATUSES=['active','complete','rest','skipped'];
  const validId=id=>typeof id==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$/.test(id)&&!['constructor','prototype'].includes(id);
  const integer=(value,min,max)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
  const clock=now=>{if(!integer(now,0,MAX_TIME-PAUSE_MS))throw new TypeError('Invalid focus time');return now;};
  const key=(value,direction)=>typeof value==='object'&&value!==null?value.id+'|'+value.direction:value+'|'+direction;
  const copy=state=>({...state,cohort:state.cohort.map(entry=>({...entry}))});
  const order=(a,b)=>a.lastTurn-b.lastTurn||a.successes-b.successes;
  const latestAt=state=>state.cohort.reduce((latest,entry)=>Math.max(latest,entry.lastAt),0);
  function create(turns){
    if(!Array.isArray(turns)||turns.length<1||turns.length>5)throw new TypeError('A focus set needs one to five words');
    const seen=new Set();
    const cohort=turns.map(turn=>{
      if(!turn||!validId(turn.id)||!TRACKS.includes(turn.direction)||seen.has(turn.id))throw new TypeError('Invalid focus word');
      seen.add(turn.id);
      return {id:turn.id,direction:turn.direction,successes:0,attempts:0,credited:false,status:'active',lastTurn:-1,lastAt:0,noBuffer:false};
    });
    return {version:1,cohort,turn:0,waitUntil:0};
  }
  function restore(raw,allowed=()=>true){
    try{
      if(!raw||typeof raw!=='object'||Array.isArray(raw)||raw.version!==1||!Array.isArray(raw.cohort)||raw.cohort.length<1||raw.cohort.length>5||!integer(raw.turn,0,raw.cohort.length*MAX_ATTEMPTS)||!integer(raw.waitUntil,0,MAX_TIME))return null;
      const seen=new Set(),lastTurns=new Set();let attempts=0;
      const cohort=[];
      for(const item of raw.cohort){
        if(!item||typeof item!=='object'||Array.isArray(item)||!validId(item.id)||!TRACKS.includes(item.direction)||!allowed(item.id,item.direction)||seen.has(item.id))return null;
        if(!integer(item.successes,0,GOAL)||!integer(item.attempts,0,MAX_ATTEMPTS)||item.successes>item.attempts||typeof item.credited!=='boolean'||!STATUSES.includes(item.status)||!integer(item.lastTurn,-1,raw.turn-1)||!integer(item.lastAt,0,MAX_TIME-PAUSE_MS))return null;
        if(item.attempts===0&&(item.lastTurn!==-1||item.lastAt!==0||item.credited||item.successes))return null;
        if(item.attempts>0&&(item.lastTurn<0||lastTurns.has(item.lastTurn)))return null;
        if(item.successes>0&&!item.credited)return null;
        if(item.noBuffer!==undefined&&typeof item.noBuffer!=='boolean')return null;
        if(item.status==='complete'&&item.successes!==GOAL)return null;
        if(item.status==='active'&&(item.successes>=GOAL||item.attempts>=MAX_ATTEMPTS))return null;
        if(item.status==='rest'&&(item.attempts!==MAX_ATTEMPTS||item.successes>=GOAL))return null;
        attempts+=item.attempts;seen.add(item.id);if(item.lastTurn>=0)lastTurns.add(item.lastTurn);
        cohort.push({id:item.id,direction:item.direction,successes:item.successes,attempts:item.attempts,credited:item.credited,status:item.status,lastTurn:item.lastTurn,lastAt:item.lastAt,noBuffer:item.noBuffer===true});
      }
      if(attempts!==raw.turn)return null;
      const clean={version:1,cohort,turn:raw.turn,waitUntil:raw.waitUntil};
      if(clean.waitUntil&&(clean.turn===0||clean.waitUntil!==latestAt(clean)+PAUSE_MS))return null;
      return clean;
    }catch{return null;}
  }
  function summary(state){
    const result={remaining:0,complete:0,rest:0,skipped:0,total:state.cohort.length,recalls:0};
    for(const entry of state.cohort){
      if(entry.status==='active')result.remaining++;
      else result[entry.status]++;
      result.recalls+=Math.min(GOAL,entry.successes);
    }
    return result;
  }
  function next(input,now){
    clock(now);const state=copy(input),active=state.cohort.filter(entry=>entry.status==='active'&&entry.attempts<MAX_ATTEMPTS).sort(order);
    if(!active.length){state.waitUntil=0;return {state,item:null,done:true,waitUntil:0};}
    const gap=Math.min(3,state.cohort.length),lastAt=latestAt(state);
    const ready=entry=>entry.lastTurn===-1||(state.cohort.length===1?now>=entry.lastAt+PAUSE_MS:state.turn-entry.lastTurn>=gap);
    let chosen=active.find(ready);
    const buffers=state.cohort.filter(entry=>entry.status==='complete'&&!entry.noBuffer&&entry.attempts<MAX_ATTEMPTS).sort(order);
    if(!chosen)chosen=buffers.find(ready);
    if(!chosen){
      const until=lastAt+PAUSE_MS;
      if(now<until){state.waitUntil=until;return {state,item:null,done:false,waitUntil:until};}
      // Once the time gap is long enough, a turn-count gap is unnecessary.
      chosen=active[0];
      if(chosen.lastTurn===state.turn-1){
        const other=[...active,...buffers].filter(entry=>key(entry)!==key(chosen)).sort(order)[0];
        if(other)chosen=other;
      }
    }
    state.waitUntil=0;
    return {state,item:{id:chosen.id,direction:chosen.direction,retry:chosen.attempts>0,focusBuffer:chosen.status==='complete'},done:false,waitUntil:0};
  }
  function record(input,item,result,now){
    clock(now);const state=copy(input),entry=state.cohort.find(candidate=>key(candidate)===key(item));
    if(!entry||!['active','complete'].includes(entry.status)||entry.attempts>=MAX_ATTEMPTS)throw new TypeError('Focus word is not available');
    const clean=result?.ok===true&&!result.hinted&&!result.revealed;
    entry.attempts++;entry.lastTurn=state.turn;entry.lastAt=Math.max(now,latestAt(state));
    if(result?.ok===true)entry.credited=true;
    entry.successes=clean?Math.min(GOAL,entry.successes+1):0;
    entry.status=entry.successes>=GOAL?'complete':entry.attempts>=MAX_ATTEMPTS?'rest':'active';
    state.turn++;state.waitUntil=0;return state;
  }
  function skip(input,item,now){
    clock(now);const state=copy(input),entry=state.cohort.find(candidate=>key(candidate)===key(item));
    if(!entry||!['active','complete'].includes(entry.status))throw new TypeError('Focus word is not available');
    if(entry.status==='complete')entry.noBuffer=true;else entry.status='skipped';
    state.waitUntil=0;return state;
  }
  return Object.freeze({create,restore,next,record,skip,summary,key,GOAL,MAX_ATTEMPTS,PAUSE_MS});
});
