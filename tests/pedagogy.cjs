const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'../dist');
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=http.createServer(async(req,res)=>{try{const name=new URL(req.url,'http://localhost').pathname;const file=path.join(root,name==='/'?'index.html':name.slice(1));const bytes=await fs.readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'text/plain','Cache-Control':'no-store'});res.end(bytes);}catch{res.writeHead(404).end();}});
const base='http://127.0.0.1:8794';
const key='bonjour-angers-vocabulary-v1';
async function saved(p){return p.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);}
async function currentWord(p){return p.evaluate(key=>{const s=JSON.parse(localStorage.getItem(key)).session;const turn=s.queue[s.index];return{...VOCABULARY_WORDS.find(w=>w.id===turn.id),direction:turn.direction};},key);}
async function studyIntroductions(p){for(let i=0;i<30;i++){if(!await p.locator('#intro-continue').count())return;await p.locator('#intro-continue').click();}throw Error('Introductions did not reach a quiz');}
(async()=>{
 await new Promise(r=>server.listen(8794,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const c=await browser.newContext({viewport:{width:390,height:740}}),p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(()=>{Math.random=()=>.5;});await p.goto(base+'/');await p.getByText('Ready for offline practice',{exact:true}).waitFor();
  assert.equal(await p.locator('.vocab-options').evaluate(d=>d.open),false);assert.equal(await p.locator('.vocab-collection').evaluate(d=>d.open),false);assert.equal(await p.locator('#offline-tools').evaluate(d=>d.open),false);
  await p.getByRole('button',{name:'Start',exact:true}).click();
  const first=await currentWord(p);assert.equal(await p.locator('#intro-word').textContent(),first.fr);assert.equal(await p.locator('#intro-meaning').textContent(),first.en);assert.match(await p.locator('#intro-usage').textContent(),new RegExp(first.usage.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));assert.equal(await p.locator('#vocab-answer').count(),0);
  await p.reload();assert.equal(await p.locator('#intro-word').textContent(),first.fr);
  assert.equal((await saved(p)).session.answered,0);assert.deepEqual((await saved(p)).progress,{});assert.equal(await p.evaluate(()=>state.xp),0);
  await p.locator('#intro-continue').click();const second=await currentWord(p);assert.notEqual(second.id,first.id);assert.ok((await saved(p)).introduced[first.id]);
  await p.locator('#intro-continue').click();const third=await currentWord(p);assert.notEqual(third.id,first.id);assert.notEqual(third.id,second.id);
  await p.locator('#intro-continue').click();assert.equal((await currentWord(p)).id,first.id);assert.equal(await p.locator('#vocab-prompt').textContent(),first.en);assert.equal((await saved(p)).session.answered,0);assert.equal(await p.evaluate(()=>state.xp),0);
  await p.getByRole('textbox',{name:'Answer',exact:true}).fill(first.fr);await p.getByRole('button',{name:'Check',exact:true}).click();let d=await saved(p);assert.equal(d.progress[first.id]['en-fr'].strength,20);assert.equal(d.session.answered,1);assert.equal(await p.locator('#vocab-answer-form').isVisible(),false);const nextBox=await p.locator('#vocab-next').boundingBox();assert.ok(nextBox.y+nextBox.height<=740,'Next fits on a phone');assert.equal(await p.locator('.site-header').isVisible(),false);await p.screenshot({path:path.join(root,'../qa/compact-phone-correct.png'),fullPage:true});
  await p.getByRole('button',{name:'Next',exact:true}).click();const tipped=await currentWord(p);await p.getByRole('button',{name:'Tip',exact:true}).click();assert.match(await p.locator('#vocab-tip-text').textContent(),/Tip: .*letters?/);assert.equal((await saved(p)).session.answered,1);assert.equal(await p.evaluate(()=>state.xp),5);
  await p.reload();assert.ok((await saved(p)).session.queue[(await saved(p)).session.index].hinted);assert.equal(await p.locator('#vocab-tip-text').textContent(),'','Reload keeps the tip closed');assert.equal(await p.getByRole('button',{name:'Tip',exact:true}).isEnabled(),true);await p.getByRole('textbox',{name:'Answer',exact:true}).fill(tipped.fr);await p.getByRole('button',{name:'Check',exact:true}).click();d=await saved(p);assert.equal(d.progress[tipped.id]['en-fr'].strength,5);assert.equal(await p.evaluate(()=>state.xp),5);await c.close();
  console.log('PASS: minimal collapsed UI, explained introduction, non-scoring exposure, exposure persistence, two intervening introductions before recall');

  const context=await browser.newContext({viewport:{width:390,height:740}});let q=await context.newPage();q.on('pageerror',e=>errors.push(e.message));await q.goto(base+'/');await q.getByText('Ready for offline practice',{exact:true}).waitFor();
  await q.getByLabel('Mode',{exact:true}).selectOption('context');assert.equal(await q.locator('.vocab-word').count(),80);await q.getByRole('button',{name:'Start',exact:true}).click();
  const taught=await currentWord(q);assert.match(await q.locator('#intro-usage').textContent(),new RegExp(taught.context.answer.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));await studyIntroductions(q);
  const word=await currentWord(q);assert.equal(word.direction,'context');assert.equal(await q.locator('#vocab-prompt').textContent(),word.context.sentence);assert.equal(await q.locator('#vocab-prompt-translation').textContent(),word.context.translation);
  await q.getByRole('textbox',{name:'Answer',exact:true}).fill(word.context.answer);await q.getByRole('button',{name:'Check',exact:true}).click();d=await saved(q);assert.equal(d.progress[word.id].context.strength,20);assert.equal(d.progress[word.id]['en-fr'],undefined);assert.equal(d.progress[word.id]['fr-en'],undefined);
  await q.getByRole('button',{name:'Next',exact:true}).click();const before=await saved(q);await context.setOffline(true);await q.close();q=await context.newPage();q.on('pageerror',e=>errors.push(e.message));await q.goto(base+'/');await q.waitForFunction(()=>document.querySelector('#intro-word')||document.querySelector('#vocab-answer'));const after=await saved(q);assert.equal(after.settings.mode,'context');assert.equal(after.session.config.mode,'context');assert.equal(after.session.index,before.session.index);assert.deepEqual(after.progress,before.progress);assert.equal(await q.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await q.screenshot({path:path.join(root,'../qa/pedagogy-mobile.png'),fullPage:true});await context.close();
  console.log('PASS: 80 sentence cards, taught grammatical usage, visible disambiguating translation, separate context strength, offline mode/session resume');

  const listenContext=await browser.newContext({viewport:{width:390,height:740}});const l=await listenContext.newPage();l.on('pageerror',e=>errors.push(e.message));
  await l.addInitScript(()=>{Object.defineProperty(window.speechSynthesis,'speak',{configurable:true,value:u=>{queueMicrotask(()=>u.onstart?.());}});});
  await l.goto(base+'/');await l.getByLabel('Mode',{exact:true}).selectOption('listen');await l.getByRole('button',{name:'Start',exact:true}).click();await studyIntroductions(l);const heard=await currentWord(l);
  assert.equal(heard.direction,'listen');assert.equal(await l.locator('#vocab-prompt').textContent(),'Listen.');assert.equal(await l.getByText(heard.fr,{exact:true}).count(),0);assert.equal(await l.getByText(heard.en,{exact:true}).count(),0);assert.equal(await l.getByRole('button',{name:'Check',exact:true}).isDisabled(),true);assert.equal(await l.locator('#vocab-listening button[aria-label]').count(),0);
  await l.getByRole('button',{name:'Play',exact:true}).click();await l.getByText('Type the French you heard.',{exact:true}).waitFor();await l.getByRole('textbox',{name:'Answer',exact:true}).fill(heard.fr);await l.getByRole('button',{name:'Check',exact:true}).click();d=await saved(l);assert.equal(d.progress[heard.id].listen.strength,20);assert.equal(d.progress[heard.id]['en-fr'],undefined);
  await l.getByRole('button',{name:'Next',exact:true}).click();await studyIntroductions(l);const unavailable=await currentWord(l);const beforeSkip=await saved(l);
  await l.evaluate(()=>{Object.defineProperty(window.speechSynthesis,'speak',{configurable:true,value:u=>{queueMicrotask(()=>u.onerror?.({error:'synthesis-unavailable'}));}});});
  await l.getByRole('button',{name:'Play',exact:true}).click();await l.getByText('Audio unavailable. Skip without changing strength.',{exact:true}).waitFor();assert.equal(await l.getByRole('button',{name:'Check',exact:true}).isDisabled(),true);await l.getByRole('button',{name:'Skip audio',exact:true}).click();const afterSkip=await saved(l);assert.deepEqual(afterSkip.progress[unavailable.id],beforeSkip.progress[unavailable.id]);assert.equal(afterSkip.session.answered,beforeSkip.session.answered);assert.ok(afterSkip.session.skipped.includes(unavailable.id));assert.deepEqual(errors,[]);await listenContext.close();
  console.log('PASS: listening answer hidden before playback, generic playback labels, separate listening strength, unavailable-audio skip without penalty');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
