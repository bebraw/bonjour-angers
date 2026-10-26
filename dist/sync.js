/* Durable offline outbox. Identity and storage are owned by the private Site. */
(() => {
  'use strict';
  const M=window.AngersSyncModel;
  const KEY='bonjour-angers-sync-v1',APP_KEY='bonjour-angers-v1',VOCAB_KEY='bonjour-angers-vocabulary-v1';
  const elements={tools:document.querySelector('#sync-tools'),status:document.querySelector('#sync-status'),account:document.querySelector('#sync-account'),message:document.querySelector('#sync-message'),now:document.querySelector('#sync-now'),export:document.querySelector('#sync-export'),import:document.querySelector('#sync-import'),switch:document.querySelector('#sync-switch')};
  if(!M){if(elements.status)elements.status.textContent='Sync unavailable. Your local progress is unchanged.';return;}
  let meta,flight=null,debounce=null,lastRemote=null,paused=false,externalProfile=null,storageOK=true,storageMessage='';
  const clone=value=>JSON.parse(JSON.stringify(value));
  const uid=()=>crypto.randomUUID();
  const profileKey=id=>KEY+':profile:'+encodeURIComponent(id);
  const outboxPrefix=scope=>KEY+':outbox:'+scope+':';
  function readJSON(key,fallback){try{const value=localStorage.getItem(key);return value===null?fallback:JSON.parse(value);}catch{return fallback;}}
  function pendingEntries(scope){
    const result=[];const prefix=outboxPrefix(scope);
    for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(!key?.startsWith(prefix))continue;try{const raw=JSON.parse(localStorage.getItem(key)),op=M.validateOperation(raw.operation||raw);result.push({op,order:Number.isSafeInteger(raw.order)&&raw.order>=0?raw.order:op.at});}catch{}}
    return result.sort((a,b)=>a.order-b.order||a.op.id.localeCompare(b.op.id));
  }
  function pendingFor(scope){return pendingEntries(scope).map(entry=>entry.op);}
  function nextOrder(scope){return Math.max(Date.now(),meta.order||0,...pendingEntries(scope).map(entry=>entry.order))+1;}
  function writeOperation(op,scope=meta.scope,order){
    const key=outboxPrefix(scope)+op.id;if(localStorage.getItem(key)!==null)return false;
    const sequence=order===undefined?nextOrder(scope):order;
    localStorage.setItem(key,JSON.stringify({operation:op,order:sequence}));if(scope===meta.scope)meta.order=Math.max(meta.order||0,sequence);return true;
  }
  function validMeta(raw){
    if(!raw||raw.version!==1||typeof raw.scope!=='string'||!/^[A-Za-z0-9-]{1,100}$/.test(raw.scope))return null;
    if(raw.account!==null&&(typeof raw.account!=='string'||!raw.account||raw.account.length>256))return null;
    try{return {version:1,queueVersion:1,scope:raw.scope,order:Number.isSafeInteger(raw.order)&&raw.order>=0?raw.order:0,account:raw.account,accountEmail:typeof raw.accountEmail==='string'?raw.accountEmail.slice(0,320):'',canonical:M.sanitizeSnapshot(raw.canonical),pending:[],revision:Number.isSafeInteger(raw.revision)&&raw.revision>=0?raw.revision:0,lastSync:Number.isSafeInteger(raw.lastSync)?raw.lastSync:0};}catch{return null;}
  }
  function writeMeta(){
    meta.pending=pendingFor(meta.scope);
    localStorage.setItem(KEY,JSON.stringify(meta));
    storageOK=true;storageMessage='';
  }
  function refreshMeta(){
    const fresh=validMeta(readJSON(KEY,null));
    if(fresh&&fresh.scope!==meta.scope){externalProfile=fresh;paused=true;lastRemote=null;meta.pending=pendingFor(meta.scope);return false;}
    else if(fresh&&fresh.account===meta.account&&fresh.revision>=meta.revision){meta.canonical=fresh.canonical;meta.revision=fresh.revision;meta.lastSync=Math.max(meta.lastSync,fresh.lastSync);meta.order=Math.max(meta.order||0,fresh.order||0);meta.accountEmail=fresh.accountEmail||meta.accountEmail;}
    meta.pending=pendingFor(meta.scope);return true;
  }
  function rawLocal(){return typeof window.getLocalLearningSnapshot==='function'?window.getLocalLearningSnapshot():{app:readJSON(APP_KEY,{}),vocab:readJSON(VOCAB_KEY,{})};}
  function newMeta(remote=null){return {version:1,queueVersion:1,scope:uid(),order:0,account:remote?.account.id||null,accountEmail:remote?.account.email||'',canonical:remote?.state||M.emptyState(),pending:[],revision:remote?.revision||0,lastSync:0};}
  function initialize(){
    const raw=readJSON(KEY,null),restored=validMeta(raw);
    if(restored){meta=restored;if(raw.queueVersion!==1&&Array.isArray(raw.pending))for(const candidate of raw.pending){try{writeOperation(M.validateOperation(candidate),meta.scope);}catch{}}meta.pending=pendingFor(meta.scope);return;}
    meta=newMeta();
    const snapshot=M.sanitizeSnapshot(rawLocal());
    const baseline=M.validateOperation({id:'baseline:'+uid(),epoch:'initial',kind:'baseline',at:Date.now(),payload:{snapshot}});
    // Save the profile before its operation, so a full quota cannot orphan its scope.
    localStorage.setItem(KEY,JSON.stringify(meta));writeOperation(baseline);writeMeta();
  }
  function projected(){return M.project(meta.canonical,meta.pending);}
  function applyProjection(options={}){
    const state=projected();
    writeProjection(state,options);
  }
  function writeProjection(state,options={}){
    const localApp=readJSON(APP_KEY,{}),localVocab=readJSON(VOCAB_KEY,{});
    const app={...state.app,day:Number.isInteger(localApp.day)&&localApp.day>=1&&localApp.day<=7?localApp.day:state.app.day};
    const vocab={...localVocab,...(options.clearSession?{session:null}:{}),progress:state.vocab.progress,introduced:state.vocab.introduced,custom:state.vocab.custom};
    localStorage.setItem(APP_KEY,JSON.stringify(app));localStorage.setItem(VOCAB_KEY,JSON.stringify(vocab));
    window.dispatchEvent(new CustomEvent('angers:sync-applied',{detail:{...state,app,vocab,accountChanged:!!options.accountChanged}}));
  }
  function restoreExternalProfile(){
    if(!externalProfile)return;
    const state=M.project(externalProfile.canonical,pendingFor(externalProfile.scope));
    writeProjection(state,{clearSession:true,accountChanged:true});
    window.dispatchEvent(new CustomEvent('angers:sync-profile-changed',{detail:{reloadRequired:true}}));
  }
  function status(text,message=''){
    if(elements.status)elements.status.textContent=text;
    if(elements.message)elements.message.textContent=message||storageMessage;
    if(elements.account)elements.account.textContent=meta?.account?(meta.accountEmail||'Signed in')+(meta.lastSync?' · '+new Date(meta.lastSync).toLocaleString():''):'';
    if(elements.now)elements.now.disabled=!!flight||!!externalProfile;
    if(elements.switch){elements.switch.hidden=!paused;elements.switch.textContent=externalProfile?'Reload app':'Use signed-in account';}
  }
  function queueStatus(){
    const n=meta?.pending?.length||0;
    if(!storageOK){status('Sync queue could not be saved.',storageMessage||'Export a backup before closing the app.');return;}
    if(externalProfile){status('Account profile changed in another tab.','Reload this app. Any action just taken was saved to the previous profile.');return;}
    if(paused){status('Sync paused: a different account is signed in.','Use the signed-in account to switch profiles. Current data will stay in this browser’s previous profile.');return;}
    if(!navigator.onLine){status(n?'Offline · '+n+' changes queued':'Offline · progress kept on this device');return;}
    if(n)status(n+' changes queued');
    else status(meta.lastSync?'Synced':'Ready to sync');
  }
  function savedError(){storageOK=false;storageMessage='The browser could not save the sync queue. Local practice data is still available; export a backup before closing.';queueStatus();window.dispatchEvent(new CustomEvent('angers:sync-error',{detail:storageMessage}));}
  function schedule(delay=1000){clearTimeout(debounce);debounce=setTimeout(()=>{if(navigator.onLine&&!paused)sync();},delay);}
  function record(kind,payload){
    try{
      const sameProfile=refreshMeta();
      const op=M.validateOperation({id:uid(),epoch:projected().epoch,kind,at:Date.now(),payload});
      // The trainer has already applied this action. Persist only its operation here.
      writeOperation(op);
      if(!sameProfile){meta.pending=pendingFor(meta.scope);if(meta.account)localStorage.setItem(profileKey(meta.account),JSON.stringify(meta));restoreExternalProfile();queueStatus();return true;}
      writeMeta();queueStatus();schedule();return true;
    }catch{savedError();return false;}
  }
  async function request(method,body){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
    try{
      const response=await fetch('/api/sync',{method,credentials:'same-origin',cache:'no-store',redirect:'follow',signal:controller.signal,headers:{'Accept':'application/json',...(body?{'Content-Type':'application/json','X-Angers-Sync':'1'}:{})},...(body?{body:JSON.stringify(body)}:{})});
      if(response.status===401||response.status===403||response.redirected||!response.headers.get('content-type')?.includes('application/json')){const e=new Error('Sign in to sync.');e.code='AUTH_REQUIRED';throw e;}
      const data=await response.json();
      if(response.status===409&&data.code==='ACCOUNT_MISMATCH'){const e=new Error('Account changed.');e.code='ACCOUNT_MISMATCH';throw e;}
      if(response.status===409&&data.code==='DATA_CONFLICT'){const e=new Error(typeof data.error==='string'?data.error.slice(0,240):'Some saved changes need attention. Export a backup before changing the word list.');e.code='DATA_CONFLICT';throw e;}
      if(!response.ok)throw new Error('Sync temporarily unavailable.');
      if(!data.account||typeof data.account.id!=='string'||!data.account.id||data.account.id.length>256||!Number.isSafeInteger(data.revision)||data.revision<0)throw new Error('Unexpected sync response.');
      data.state=M.sanitizeSnapshot(data.state);
      if(data.account.email!==undefined&&typeof data.account.email!=='string')delete data.account.email;
      return data;
    }finally{clearTimeout(timer);}
  }
  function acceptRemote(remote,scope,deferPending=false){
    if(!refreshMeta()){queueStatus();return false;}
    if(meta.scope!==scope)return false;
    if(meta.account&&remote.account.id!==meta.account){lastRemote=remote;paused=true;queueStatus();if(elements.tools)elements.tools.open=true;return false;}
    if(!meta.account){meta.account=remote.account.id;meta.accountEmail=remote.account.email||'';}
    meta.accountEmail=remote.account.email||meta.accountEmail;
    // A prior POST may have committed without its receipt reaching this device.
    // Until the outbox is acknowledged, keep its original canonical base for both UI and backups.
    if(deferPending&&meta.pending.length){writeMeta();return true;}
    if(remote.revision>=meta.revision){meta.canonical=remote.state;meta.revision=remote.revision;}
    writeMeta();applyProjection();return true;
  }
  function signInMessage(){
    status('Sign in to sync.','');
    if(elements.message){const link=document.createElement('a');link.href='/signin-with-chatgpt?return_to=%2F';link.target='_top';link.textContent='Sign in with ChatGPT';elements.message.replaceChildren(link);}
  }
  async function performSync(){
    if(!refreshMeta()){queueStatus();return;}
    if(paused){queueStatus();return;}
    if(!navigator.onLine){queueStatus();return;}
    const scope=meta.scope;
    status('Syncing…');
    try{
      const remote=await request('GET');
      if(!acceptRemote(remote,scope,true))return;
      let batches=0;
      while(batches++<10){
        if(!refreshMeta()||meta.scope!==scope||paused)return;
        const batch=meta.pending.slice(0,50);if(!batch.length)break;
        const sent=new Set(batch.map(op=>op.id));
        const result=await request('POST',{accountId:meta.account,operations:batch});
        if(!refreshMeta()||meta.scope!==scope)return;
        // Identity is checked before acknowledging or applying any response.
        if(result.account.id!==meta.account){lastRemote=result;paused=true;queueStatus();return;}
        if(!Array.isArray(result.acknowledged))throw new Error('Unexpected sync acknowledgement.');
        if(!result.acknowledged.some(id=>sent.has(id)))throw new Error('No sync operations were acknowledged.');
        for(const id of result.acknowledged)if(typeof id==='string'&&sent.has(id))localStorage.removeItem(outboxPrefix(scope)+id);
        if(!acceptRemote(result,scope))return;
      }
      if(!refreshMeta()||meta.scope!==scope)return;
      meta.lastSync=Date.now();writeMeta();queueStatus();
      if(meta.pending.length)schedule();
    }catch(error){
      if(['QuotaExceededError','SecurityError'].includes(error.name)){savedError();}
      else if(error.code==='AUTH_REQUIRED')signInMessage();
      else if(error.code==='DATA_CONFLICT'){status('Sync needs attention · changes remain queued.',error.message);if(elements.tools)elements.tools.open=true;}
      else if(error.code==='ACCOUNT_MISMATCH'){status('Account changed. Checking sign-in…');schedule(250);}
      else status('Sync unavailable · changes remain queued.',error.name==='AbortError'?'The connection timed out. Try Sync now when connected.':'Try Sync now when connected.');
    }
  }
  function sync(){
    if(flight)return flight;
    flight=performSync().catch(()=>savedError()).finally(()=>{flight=null;if(elements.now)elements.now.disabled=!!externalProfile;});
    if(elements.now)elements.now.disabled=true;
    return flight;
  }
  async function switchAccount(){
    if(externalProfile){location.reload();return;}
    if(!lastRemote)return;
    let remote;try{remote=await request('GET');}catch{status('Could not verify the signed-in account.','Keep this profile open and try again when connected.');return;}
    if(remote.account.id===meta.account){paused=false;lastRemote=null;acceptRemote(remote,meta.scope);queueStatus();sync();return;}
    if(!confirm('Use the signed-in account? Current data will remain saved in this browser’s previous profile.'))return;
    try{
      writeMeta();if(meta.account)localStorage.setItem(profileKey(meta.account),JSON.stringify(meta));
      const stored=validMeta(readJSON(profileKey(remote.account.id),null));
      meta=stored||newMeta(remote);meta.account=remote.account.id;meta.accountEmail=remote.account.email||'';
      meta.pending=pendingFor(meta.scope);paused=false;externalProfile=null;lastRemote=null;
      if(remote.revision>=meta.revision){meta.canonical=remote.state;meta.revision=remote.revision;}
      writeMeta();applyProjection({clearSession:true,accountChanged:true});queueStatus();sync();
    }catch{savedError();}
  }
  async function exportBackup(){
    try{
      refreshMeta();
      let canonical=meta.canonical,pending=meta.pending;
      // If quota prevented recording an action, preserve the visible snapshot as a manual backup.
      if(!storageOK){canonical=M.sanitizeSnapshot(rawLocal());pending=[];}
      const backup={format:'bonjour-angers-backup',version:1,exportedAt:new Date().toISOString(),canonical,pending};
      const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});
      const filename='angers-progress-'+new Date().toISOString().slice(0,10)+'.json';
      const file=new File([blob],filename,{type:'application/json'});
      if(navigator.canShare?.({files:[file]})){
        try{await navigator.share({files:[file],title:'Angers progress backup'});status('Backup shared.');return;}catch(error){if(error.name==='AbortError')return;}
      }
      const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);status('Backup exported.');
    }catch{status('Could not export backup.','Keep the app open and try again.');}
  }
  async function importBackup(file){
    if(!file)return;
    let rollback=null,oldMeta=null;
    try{
      if(file.size>2*1024*1024)throw new Error('Choose an Angers backup smaller than 2 MB.');
      const backup=JSON.parse(await file.text());
      if(backup.format!=='bonjour-angers-backup'||backup.version!==1||!Array.isArray(backup.pending)||backup.pending.length>10000)throw new Error('This is not a supported Angers backup.');
      let canonical=M.sanitizeSnapshot(backup.canonical);const incoming=backup.pending.map(M.validateOperation);
      const shown=M.project(canonical,incoming),wordCount=Object.keys(shown.vocab.progress).length,customCount=shown.vocab.custom.length;
      if(!confirm('Merge this backup: '+wordCount+' word records and '+customCount+' personal word pairs? Existing progress will be kept.'))return;
      if(!refreshMeta()||paused)throw new Error('Choose the signed-in account before importing.');
      const epoch=projected().epoch;
      // Deliberate imports across reset generations restore a snapshot, not stale operations.
      const differentEpoch=shown.epoch!==epoch;
      if(differentEpoch)canonical=shown;
      const bytes=new TextEncoder().encode(JSON.stringify({epoch,canonical}));const digest=await crypto.subtle.digest('SHA-256',bytes);const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
      const op=M.validateOperation({id:'import:'+hash,epoch,kind:'import',at:Date.now(),payload:{snapshot:canonical}});
      rollback=new Map([[KEY,localStorage.getItem(KEY)],[APP_KEY,localStorage.getItem(APP_KEY)],[VOCAB_KEY,localStorage.getItem(VOCAB_KEY)]]);oldMeta=clone(meta);
      let order=nextOrder(meta.scope);
      function stage(candidate){const key=outboxPrefix(meta.scope)+candidate.id;if(!rollback.has(key))rollback.set(key,localStorage.getItem(key));writeOperation(candidate,meta.scope,order++);}
      stage(op);
      if(!differentEpoch)for(const candidate of incoming)stage(candidate);
      writeMeta();applyProjection();rollback=null;status('Backup merged.',meta.pending.length+' changes queued for sync.');schedule();
    }catch(error){
      let restored=true;
      if(rollback){try{for(const [key,value]of rollback)if(value===null)localStorage.removeItem(key);for(const [key,value]of rollback)if(value!==null)localStorage.setItem(key,value);meta=oldMeta;}catch{restored=false;}}
      status('Backup not imported.',error.message==='This is not a supported Angers backup.'||error.message.includes('2 MB')||error.message.includes('signed-in account')?error.message:restored?'The import could not be completed. Your existing data is unchanged.':'Storage is unavailable. Keep the app open and export a backup.');}
    finally{if(elements.import)elements.import.value='';}
  }
  try{initialize();}catch{meta=meta||newMeta();storageOK=false;storageMessage='Sync storage is unavailable. Export a backup before closing the app.';}
  window.LearningSync={record,sync,exportBackup,importBackup,status:()=>({account:meta.account,revision:meta.revision,pending:meta.pending.length,lastSync:meta.lastSync,paused,storageOK,reloadRequired:!!externalProfile})};
  if(elements.now)elements.now.onclick=()=>{if(externalProfile){queueStatus();return;}paused=false;lastRemote=null;sync();};
  if(elements.export)elements.export.onclick=exportBackup;
  if(elements.import)elements.import.onchange=event=>importBackup(event.target.files?.[0]);
  if(elements.switch)elements.switch.onclick=switchAccount;
  addEventListener('online',()=>{queueStatus();sync();});
  addEventListener('offline',queueStatus);
  addEventListener('focus',()=>sync());
  addEventListener('pageshow',()=>sync());
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')sync();});
  addEventListener('storage',event=>{if(event.key===KEY||event.key?.startsWith(outboxPrefix(meta.scope))){try{if(refreshMeta()){applyProjection();schedule();}else restoreExternalProfile();queueStatus();}catch{savedError();}}});
  setInterval(()=>{if(document.visibilityState!=='hidden'&&navigator.onLine)sync();},60000);
  queueStatus();if(navigator.onLine)sync();
})();
