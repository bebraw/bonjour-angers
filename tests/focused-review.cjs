const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const M=require('../dist/sync-model.js');
const root=path.resolve(__dirname,'../dist'),key='bonjour-angers-vocabulary-v1',opsKey='test-focus-operations',base='http://127.0.0.1:8801';
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=http.createServer(async(req,res)=>{try{const name=new URL(req.url,base).pathname,file=path.join(root,name==='/'?'index.html':name.slice(1)),body=await fs.readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'text/plain','Cache-Control':'no-store'});res.end(body);}catch{res.writeHead(404).end();}});
const rec=(strength=20,due=Date.now()-1000)=>({right:1,wrong:0,streak:1,strength,last:Date.now()-60000,due});
const turnKey=item=>item.id+'|'+item.direction;
async function saved(p){return p.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);}
async function current(p){return p.evaluate(key=>{const d=JSON.parse(localStorage.getItem(key)),item=d.session.queue[d.session.index];return{item,word:[...VOCABULARY_WORDS,...d.custom].find(w=>w.id===item.id)};},key);}
async function capture(p){await p.evaluate(opsKey=>{if(window.__capturingFocus)return;window.__capturingFocus=true;const original=LearningSync.record;LearningSync.record=(kind,payload)=>{if(kind==='vocab.attempt'){const ops=JSON.parse(localStorage.getItem(opsKey)||'[]');ops.push({id:'focus-test-'+ops.length,epoch:'initial',kind,at:Date.now(),payload:structuredClone(payload)});localStorage.setItem(opsKey,JSON.stringify(ops));}return original(kind,payload);};},opsKey);}
async function seed(browser,{progress,custom=[],session=null,width=390,settings={}}={}){
 const context=await browser.newContext({viewport:{width,height:740}}),p=await context.newPage(),errors=[];
 p.on('pageerror',error=>errors.push(error.message));p.on('dialog',dialog=>dialog.accept());
 await context.addInitScript(({key,progress,custom,session,settings})=>{
  Math.random=()=>.5;window.__spokenFrench=[];
  Object.defineProperty(speechSynthesis,'speak',{configurable:true,value:u=>{__spokenFrench.push(u.text);queueMicrotask(()=>u.onstart?.());}});
  if(localStorage.getItem(key))return;
  const introduced={};for(const [id,tracks]of Object.entries(progress)){introduced[id]=Date.now();for(const track of Object.keys(tracks))if(['context','listen','article','sound'].includes(track))introduced[id+'|'+track]=Date.now();}
  localStorage.setItem(key,JSON.stringify({progress,introduced,custom,settings:{mode:'context',category:'conference',direction:'fr-en',length:0,pool:'tricky',gloss:'both',visuals:true,...settings},session}));
  localStorage.setItem('bonjour-angers-v1',JSON.stringify({xp:0,answers:{},days:[],complete:[],day:1}));
 },{key,progress,custom,session,settings});
 await p.goto(base+'/');await p.waitForFunction(()=>window.VocabularyTrainer&&window.LearningSync);await capture(p);
 return{context,p,errors};
}
async function clickChoice(p,value){const buttons=p.locator('#vocab-choices .vocab-choice');const index=await buttons.evaluateAll((nodes,value)=>nodes.findIndex(node=>node.dataset.value===value||node.value===value),value);assert.ok(index>=0,'answer choice exists: '+value);await buttons.nth(index).click();}
async function answer(p,{wrong=false,hint=false,reveal=false}={}){
 const c=await current(p),{item,word}=c;
 if(['listen','sound'].includes(item.direction)){await p.getByRole('button',{name:'Play',exact:true}).click();await p.getByText(item.direction==='sound'?'Choose the word you heard.':'Type the French you heard.',{exact:true}).waitFor();}
 if(hint)await p.getByRole('button',{name:'Tip',exact:true}).click();
 if(reveal)await p.getByRole('button',{name:'Reveal',exact:true}).click();
 else if(item.direction==='article')await clickChoice(p,wrong?(word.article.gender==='m'?'f':'m'):word.article.gender);
 else if(item.direction==='sound'){const target=word.sound.choices[item.soundIndex];await clickChoice(p,wrong?word.sound.choices.find(s=>s!==target):target);}
 else{const target=item.direction==='context'?word.context.answer:item.direction==='fr-en'?word.en:word.fr;await p.getByRole('textbox',{name:'Answer',exact:true}).fill(wrong?'definitely incorrect':target);await p.getByRole('button',{name:'Check',exact:true}).click();}
 await p.locator('#vocab-next').waitFor();
 const next=await p.locator('#vocab-next').boundingBox();assert.ok(next.y+next.height<=740,'Next stays within a phone screen during focused practice');
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'focused controls do not overflow');
 return c;
}
async function next(p){await p.locator('#vocab-next').click();}
async function projectionMatches(p,before){
 const actual=await saved(p),ops=await p.evaluate(opsKey=>JSON.parse(localStorage.getItem(opsKey)||'[]'),opsKey),projected=M.project(before,ops);
 assert.ok(ops.length>0);for(const op of ops)assert.equal(op.payload.focus,true,'focused attempts have explicit sync semantics');
 for(const [id,tracks]of Object.entries(actual.progress))for(const [track,progress]of Object.entries(tracks)){
  const remote=projected.vocab.progress[id]?.[track];assert.ok(remote,'projected progress exists: '+id+'/'+track);
  for(const field of ['right','wrong','streak','strength'])assert.equal(remote[field],progress[field],'client/cloud agree for '+id+'/'+track+'/'+field);
  assert.ok(Math.abs(remote.due-progress.due)<1000,'client/cloud review times agree');
 }
 assert.equal(projected.app.xp,await p.evaluate(()=>state.xp),'practice credit matches cloud projection');
 return ops;
}
async function baseSnapshot(p){return M.sanitizeSnapshot(await p.evaluate(()=>({app:structuredClone(state),vocab:VocabularyTrainer.snapshot()})));}
async function runCorrectSet(p,{limit=60,onTurn}={}){
 const seen=[];
 for(let i=0;i<limit;i++){
  if(await p.locator('#vocab-result-summary').count())return seen;
  const turn=await current(p);await onTurn?.(turn,i);seen.push(turn.item);await answer(p);await next(p);
 }
 throw Error('Focused review did not finish within its bounded effort budget');
}
(async()=>{
 await new Promise(resolve=>server.listen(8801,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const ids=['hello','station','coffee','bread','sugar'];const progress=Object.fromEntries(ids.map(id=>[id,{'en-fr':rec()}]));progress.please={'en-fr':rec(80,Date.now()+14*86400000)};
  const first=await seed(browser,{progress});let p=first.p;
  await p.getByText('Ready for offline practice',{exact:true}).waitFor();await p.waitForFunction(()=>!!navigator.serviceWorker.controller);
  assert.ok(await p.locator('#vocab-focus-start').isVisible());assert.match(await p.locator('#vocab-focus-start').textContent(),/Focus on 5 weak words/);
  assert.equal(await p.locator('#vocab-focus-start').evaluate(button=>!!(button.compareDocumentPosition(document.querySelector('#vocab-settings'))&Node.DOCUMENT_POSITION_FOLLOWING)),true,'focused review is discoverable before the setup form');
  const before=await baseSnapshot(p);await p.locator('#vocab-focus-start').click();let d=await saved(p);
  assert.deepEqual(new Set(d.session.focus.cohort.map(t=>t.id)),new Set(ids),'focus starts from practiced weak words, not unseen or future strong words');assert.equal(d.settings.category,'conference','focused review does not overwrite practice filters');assert.equal(d.session.continuous,false);assert.equal(d.session.queue.length,1);
  const initialMembers=d.session.focus.cohort.map(turnKey).sort(),firstTurn=await current(p);await answer(p);d=await saved(p);
  const firstEntry=d.session.focus.cohort.find(t=>turnKey(t)===turnKey(firstTurn.item));assert.equal(firstEntry.successes,1,'one correct answer is not enough to leave the focus set');assert.equal(firstEntry.status,'active');
  assert.equal(await p.locator('#vocab-round-progress').evaluate(bar=>bar.value<bar.max),true,'one answer cannot make the focused progress meter look complete');
  const answerPhase=structuredClone(d);await p.reload();await capture(p);d=await saved(p);assert.equal(d.session.answered,answerPhase.session.answered);assert.deepEqual(d.progress,answerPhase.progress,'reloading feedback never grades twice');assert.deepEqual(d.session.focus,answerPhase.session.focus);
  await p.getByRole('button',{name:'Back',exact:true}).click();await p.getByRole('button',{name:'Resume',exact:true}).click();assert.equal(await p.locator('#vocab-next').count(),1);assert.deepEqual((await saved(p)).session.focus,answerPhase.session.focus,'Back and Resume preserve narrowing progress');await next(p);
  await first.context.setOffline(true);await p.close();p=await first.context.newPage();p.on('pageerror',e=>first.errors.push(e.message));p.on('dialog',dialog=>dialog.accept());await p.goto(base+'/');await capture(p);
  assert.deepEqual((await saved(p)).session.focus.cohort.map(turnKey).sort(),initialMembers);assert.equal(await p.evaluate(async()=>{const r=await fetch('/focus-engine.js');return r.ok&&(await r.text()).length>100;}),true,'focus scheduling code is part of the offline pack');
  const played=[firstTurn.item],remaining=[];
  const later=await runCorrectSet(p,{onTurn:async turn=>{const current=await saved(p);assert.deepEqual(current.session.focus.cohort.map(turnKey).sort(),initialMembers,'no fresh words enter an active focus cohort');remaining.push(current.session.focus.cohort.filter(t=>t.status==='active').length);}});played.push(...later);d=await saved(p);
  assert.ok(remaining.some(n=>n<5),'the active set visibly narrows');assert.equal(d.session.focus.cohort.filter(t=>t.status==='complete').length,5);for(const entry of d.session.focus.cohort)assert.equal(entry.successes,3);
  for(let i=0;i<played.length;i++){assert.ok(initialMembers.includes(turnKey(played[i])),'only the selected cohort is practiced');const previous=played.slice(0,i).findLastIndex(t=>turnKey(t)===turnKey(played[i]));if(previous>=0)assert.ok(i-previous>=3,'two other prompts separate recalls in a five-word cohort');}
  const ops=await projectionMatches(p,before);assert.equal(ops.filter(op=>op.payload.rehearsal!==true&&op.payload.ok).length,5,'each word receives positive credit once per set');assert.equal(await p.evaluate(()=>state.xp),25,'repetitions do not farm XP');
  for(const id of ids){assert.equal(d.progress[id]['en-fr'].strength,40,'three quick successes do not count as three durable strength increases');assert.ok(d.progress[id]['en-fr'].due-d.progress[id]['en-fr'].last<=86400000,'a focus session retains a near-term spaced check');}
  assert.doesNotMatch(await p.locator('#vocab-result-summary').textContent(),/mastered/i);assert.deepEqual(first.errors,[]);await p.screenshot({path:path.join(root,'../qa/focused-review-result.png'),fullPage:true});await first.context.close();
  console.log('PASS: discoverable fixed five-word focus, three separated recalls, narrowing, saved answer/Back/offline resume, retained later review and matching non-inflated cloud credit');

  const difficult=await seed(browser,{progress:{coffee:{'en-fr':rec()},station:{'en-fr':rec()},bread:{'en-fr':rec()}}});p=difficult.p;await p.locator('#vocab-focus-start').click();const difficultBefore=await baseSnapshot(p),target=(await current(p)).item.id;let targetVisits=0,sawBuffer=false,sawReset=false;
  for(let i=0;i<50&&!await p.locator('#vocab-result-summary').count();i++){
   const c=await current(p);if(c.item.focusBuffer)sawBuffer=true;
   const visit=c.item.id===target&&!c.item.focusBuffer?++targetVisits:0;
   await answer(p,{wrong:visit===2,hint:visit===3});d=await saved(p);
   if(visit===2||visit===3){assert.equal(d.session.focus.cohort.find(t=>t.id===target).successes,0,'a wrong or assisted response does not count as clean recall');sawReset=true;}
   await next(p);
  }
  d=await saved(p);assert.ok(await p.locator('#vocab-result-summary').count(),'difficult focus eventually finishes');assert.ok(sawReset);assert.ok(sawBuffer,'already recalled cohort words provide spacing when the set narrows');assert.equal(d.session.focus.cohort.find(t=>t.id===target).successes,3);const difficultOps=await projectionMatches(p,difficultBefore);assert.ok(difficultOps.some(op=>op.payload.ok&&op.payload.rehearsal));assert.deepEqual(difficult.errors,[]);await difficult.context.close();
  console.log('PASS: mistakes and tips reset clean recall, narrowed sets retain spacing prompts, retry success remains attainable and rehearsal credit matches sync');

  const parked=await seed(browser,{progress:{coffee:{'en-fr':rec()},station:{'en-fr':rec()},bread:{'en-fr':rec()}}});p=parked.p;await p.locator('#vocab-focus-start').click();const parkedId=(await current(p)).item.id;
  for(let i=0;i<50&&!await p.locator('#vocab-result-summary').count();i++){const c=await current(p);await answer(p,{reveal:c.item.id===parkedId});await next(p);}
  d=await saved(p);assert.ok(await p.locator('#vocab-result-summary').count(),'repeated failures cannot trap a learner in an endless set');const rest=d.session.focus.cohort.find(t=>t.id===parkedId);assert.equal(rest.status,'rest');assert.equal(rest.attempts,8);assert.equal(rest.successes,0);assert.ok(d.progress[parkedId]['en-fr'].due>=d.progress[parkedId]['en-fr'].last+600000);assert.doesNotMatch(await p.locator('#vocab-result-summary').textContent(),/all.*mastered/i);assert.deepEqual(parked.errors,[]);await parked.context.close();
  console.log('PASS: reveal does not complete a word and bounded effort parks persistent errors for a later review');

  const single=await seed(browser,{progress:{coffee:{'en-fr':rec()}}});p=single.p;await p.clock.install();await p.locator('#vocab-focus-start').click();await answer(p);await next(p);await p.locator('#vocab-focus-resume').waitFor();assert.equal(await p.locator('#vocab-focus-resume').isDisabled(),true,'a single-word set cannot become an immediate echo loop');const paused=await saved(p);assert.ok(paused.session.focus.waitUntil>Date.now());await p.reload();await capture(p);assert.equal((await saved(p)).session.focus.waitUntil,paused.session.focus.waitUntil,'a pause survives reopening');
  for(let i=0;i<2;i++){await p.clock.fastForward(31000);await p.locator('#vocab-focus-resume').waitFor({state:'visible'});assert.equal(await p.locator('#vocab-focus-resume').isEnabled(),true);await p.locator('#vocab-focus-resume').click();await answer(p);await next(p);}
  d=await saved(p);assert.equal(d.session.focus.cohort[0].status,'complete');assert.equal(d.session.focus.cohort[0].successes,3);assert.equal(await p.evaluate(()=>state.xp),5);assert.deepEqual(single.errors,[]);await single.context.close();
  console.log('PASS: single-word reviews preserve a real pause across reload and still finish after spaced clean recalls');

  const skills=await seed(browser,{progress:{coffee:{article:rec()},street:{sound:rec()},hello:{context:rec()},please:{'en-fr':rec(80,Date.now()+86400000)}}});p=skills.p;await p.locator('#vocab-focus-start').click();d=await saved(p);assert.deepEqual(d.session.focus.cohort.map(t=>t.direction).sort(),['article','context','sound']);const skillsBefore=await baseSnapshot(p);await runCorrectSet(p);d=await saved(p);for(const entry of d.session.focus.cohort){assert.equal(entry.status,'complete');assert.equal(entry.successes,3);assert.equal(d.progress[entry.id]['en-fr'],undefined,'focused skill practice does not imply translation strength');}await projectionMatches(p,skillsBefore);assert.deepEqual(skills.errors,[]);await skills.context.close();
  const audio=await seed(browser,{progress:{street:{sound:rec()}}});p=audio.p;await p.locator('#vocab-focus-start').click();const audioBefore=await saved(p);await p.evaluate(()=>Object.defineProperty(speechSynthesis,'speak',{configurable:true,value:u=>queueMicrotask(()=>u.onerror?.({error:'synthesis-unavailable'}))}));await p.getByRole('button',{name:'Play',exact:true}).click();await p.getByText('Audio unavailable. Skip without changing strength.',{exact:true}).waitFor();await p.getByRole('button',{name:'Skip audio',exact:true}).click();d=await saved(p);assert.equal(d.session.focus.cohort[0].status,'skipped');assert.deepEqual(d.progress,audioBefore.progress);assert.equal(d.session.answered,0);assert.equal(await p.evaluate(()=>state.xp),0);assert.deepEqual(audio.errors,[]);await audio.context.close();
  console.log('PASS: focused review supports independent article/context/sound skills and audio failures are skipped without fake recall credit');

  const custom=[{id:'own-focus-one',fr:'le protocole',en:'protocol',usage:''},{id:'own-focus-two',fr:'le réseau',en:'network',usage:''}];
  const deleted=await seed(browser,{custom,progress:{'own-focus-one':{'en-fr':rec()},'own-focus-two':{'en-fr':rec()},coffee:{'en-fr':rec()}}});p=deleted.p;await p.locator('#vocab-focus-start').click();const activeId=(await current(p)).item.id;const removed=custom.find(w=>w.id!==activeId).id;
  await p.evaluate(id=>{const incoming=VocabularyTrainer.snapshot();incoming.custom=incoming.custom.filter(w=>w.id!==id);delete incoming.progress[id];delete incoming.introduced[id];dispatchEvent(new CustomEvent('angers:sync-applied',{detail:{vocab:incoming}}));},removed);d=await saved(p);assert.equal(d.session,null,'deleting any cohort member invalidates the saved focus, not only the visible word');assert.ok(d.progress.coffee,'other learning data stays intact');assert.deepEqual(deleted.errors,[]);await deleted.context.close();
  const malformed=await seed(browser,{progress:{coffee:{'en-fr':rec()},bread:{'en-fr':rec()}}});p=malformed.p;await p.locator('#vocab-focus-start').click();const safe=(await saved(p)).progress;await p.evaluate(key=>{const d=JSON.parse(localStorage.getItem(key));d.session.focus.cohort[0].successes=999;localStorage.setItem(key,JSON.stringify(d));},key);await p.reload();await p.locator('#vocab-settings').waitFor();assert.equal(await p.locator('#vocab-prompt').count(),0,'malformed focus state cannot create a broken or falsely completed round');await p.locator('#vocab-focus-start').click();d=await saved(p);assert.ok(d.session.focus.cohort.every(t=>t.successes===0),'a fresh focus can recover from malformed saved state');assert.deepEqual(d.progress,safe);assert.deepEqual(malformed.errors,[]);await malformed.context.close();
  console.log('PASS: deleted personal cohort words and malformed focus state safely clear only the affected session');

  const originalTurns=['coffee','station','bread'].map(id=>({id,direction:'en-fr',retry:false}));
  const finishedSession={queue:originalTurns,index:3,original:3,firstCorrect:1,xp:5,continuous:false,answered:3,correctCount:1,skipped:[],missedTurns:originalTurns.filter(t=>t.id!=='station').map(t=>({id:t.id,direction:t.direction})),reviews:{},config:{mode:'recall',category:'all',direction:'en-fr',length:5,pool:'all'},answer:null,missed:['coffee','bread'],recalled:['station']};
  const narrowed=await seed(browser,{session:finishedSession,progress:{coffee:{'en-fr':rec()},station:{'en-fr':rec(40)},bread:{'en-fr':rec()}}});p=narrowed.p;await p.getByRole('button',{name:'Review mistakes',exact:true}).click();d=await saved(p);assert.deepEqual(d.session.focus.cohort.map(t=>t.id).sort(),['bread','coffee'],'the familiar mistake-review entry now narrows into focused retrieval');assert.ok(d.session.focus.cohort.every(t=>t.successes===0));assert.deepEqual(narrowed.errors,[]);await narrowed.context.close();
  console.log('PASS: Review mistakes starts a focused subset of the words missed in the previous round');
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
