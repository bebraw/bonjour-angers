const assert=require('node:assert/strict'),M=require('../dist/sync-model.js');
const {createDatabase,loadWorker}=require('./sync-support.cjs');
const at=Date.now(),day=new Date().toLocaleDateString('en-CA');
const op=(id,payload={wordId:'hello',track:'en-fr',ok:true,retry:false,day},kind='vocab.attempt',epoch='initial')=>({id,kind,epoch,at,payload});
(async()=>{const db=createDatabase(),worker=await loadWorker(),origin='https://trainer.test';
async function call(user,operations,extra={}){const method=operations?'POST':'GET',headers={'oai-authenticated-user-id':user||'',...(operations?{'Content-Type':'application/json','X-Angers-Sync':'1','Origin':origin}:{})};Object.assign(headers,extra.headers||{});return worker.fetch(new Request(origin+'/api/sync',{method,headers,...(operations?{body:JSON.stringify({accountId:extra.accountId||user,operations})}:{})}),{DB:db},{});}
try{
 assert.equal((await call(null)).status,401);assert.equal((await call('alice',[op('x')],{headers:{Origin:'https://evil.test'}})).status,403);assert.equal((await call('alice',[op('x')],{accountId:'bob'})).status,409);
 const replies=await Promise.all([call('alice',[op('phone-1')]),call('alice',[op('ipad-1')])]);for(const r of replies)assert.equal(r.status,200);
 let state=await(await call('alice')).json();assert.equal(state.state.vocab.progress.hello['en-fr'].right,2);assert.equal(state.state.app.xp,10);
 await call('alice',[op('phone-1')]);state=await(await call('alice')).json();assert.equal(state.state.vocab.progress.hello['en-fr'].right,2);
 await call('alice',[op('phone-wrong',{wordId:'hello',track:'en-fr',ok:false,retry:false,day})]);state=await(await call('alice')).json();assert.equal(state.state.vocab.progress.hello['en-fr'].strength,10);
 const bob=await(await call('bob')).json();assert.deepEqual(bob.state.vocab.progress,{});assert.equal(bob.state.app.xp,0);
 for(const track of ['article','sound']){
  const introduced=op('finnish-intro-'+track,{wordId:'street',track},'vocab.introduced');
  const practiced=op('finnish-attempt-'+track,{wordId:'street',track,ok:true,retry:false,day});
  assert.equal((await call('finnish',[introduced,practiced])).status,200);
 }
 const finnish=(await(await call('finnish')).json()).state;
 assert.equal(finnish.vocab.progress.street.article.strength,20);assert.equal(finnish.vocab.progress.street.sound.strength,20);
 assert.equal(finnish.vocab.progress.street['en-fr'],undefined);assert.ok(finnish.vocab.introduced['street|article']);assert.ok(finnish.vocab.introduced['street|sound']);
 const reset=op('reset-alice',{},'reset');await call('alice',[reset,op('after-reset',undefined,'vocab.attempt','reset-alice')]);await call('alice',[op('stale-phone-answer')]);state=await(await call('alice')).json();assert.equal(state.state.app.xp,5);assert.equal(state.state.epoch,'reset-alice');
 // An idempotent retry that races between initial document read and ID lookup must not return stale state.
 const racing=op('racing',undefined,'vocab.attempt','reset-alice');db.beforeLookup=async()=>{assert.equal((await call('alice',[racing])).status,200);};const raceReply=await(await call('alice',[racing])).json();assert.equal(raceReply.state.vocab.progress.hello['en-fr'].right,2);
 const bad=await call('bob',[{...op('invalid'),kind:'something-else'}]);assert.equal(bad.status,400);assert.equal((await(await call('bob')).json()).state.app.xp,0);
 const cards=Array.from({length:100},(_,i)=>op('card-'+i,{word:{id:'own-test-'+i,fr:'mot '+i,en:'word '+i}},'custom.put'));
 assert.equal((await call('bob',cards.slice(0,50))).status,200);assert.equal((await call('bob',cards.slice(50))).status,200);
 const overflow=await call('bob',[op('overflow',{word:{id:'own-extra',fr:'extra',en:'extra'}},'custom.put')]);assert.equal(overflow.status,409);
 // A rejected domain change must not poison the operation ledger or later progress sync.
 assert.equal((await call('bob',[op('valid-after-rejection')])).status,200);assert.equal((await(await call('bob')).json()).state.app.xp,5);assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM sync_events WHERE event_id='overflow'").get().n,0);
 const health=await worker.fetch(new Request(origin+'/api/health'),{DB:db},{});assert.equal(health.status,200);
 const root=await worker.fetch(new Request(origin+'/'),{DB:db},{});assert.match(await root.text(),/id="sync-tools"/);
 const sw=await worker.fetch(new Request(origin+'/sw.js'),{DB:db},{});assert.equal(sw.headers.get('service-worker-allowed'),'/');
 const response=await call('alice');assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('access-control-allow-origin'),null);
 console.log('PASS: real SQLite/D1 adapter, authentication, owner isolation, account guard, CSRF, concurrent CAS, duplicate/lost-ACK retries, reset epochs, stale-read race, atomic domain rejection, embedded assets, API no-store');
}finally{db.sqlite.close();}})().catch(e=>{console.error(e);process.exitCode=1});
