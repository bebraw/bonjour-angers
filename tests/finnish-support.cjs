const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const M=require('../dist/sync-model.js');
const root=path.resolve(__dirname,'../dist'),key='bonjour-angers-vocabulary-v1',base='http://127.0.0.1:8800';
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=http.createServer(async(req,res)=>{try{const name=new URL(req.url,base).pathname;const file=path.join(root,name==='/'?'index.html':name.slice(1));const bytes=await fs.readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'text/plain','Cache-Control':'no-store'});res.end(bytes);}catch{res.writeHead(404).end();}});
const rec=(strength=20,due=Date.now()-1000)=>({right:1,wrong:0,streak:1,strength,last:Date.now()-60000,due});
async function saved(p){return p.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);}
async function word(p,id){return p.evaluate(id=>VOCABULARY_WORDS.find(w=>w.id===id),id);}
async function seeded(browser,{ids=['coffee'],track='en-fr',mode='recall',gloss='both',visuals=true,introduced=true,modeIntroduced=true,progress={},custom=[],home=false,width=390,category='all',soundIndices=[]}={}){
 const context=await browser.newContext({viewport:{width,height:740}}),p=await context.newPage(),errors=[];
 p.on('pageerror',e=>errors.push(e.message));
 await context.addInitScript(({key,ids,track,mode,gloss,visuals,introduced,modeIntroduced,progress,custom,home,category,soundIndices})=>{
  window.__spokenFrench=[];
  Object.defineProperty(speechSynthesis,'speak',{configurable:true,value:u=>{__spokenFrench.push(u.text);queueMicrotask(()=>u.onstart?.());}});
  if(localStorage.getItem(key))return;
  const settings={mode,category,direction:track==='fr-en'?'fr-en':'en-fr',length:5,pool:'all',gloss,visuals};
  const exposure={};if(introduced)for(const id of ids){exposure[id]=Date.now();if(modeIntroduced&&['context','listen','article','sound'].includes(track))exposure[id+'|'+track]=Date.now();}
  const session=home?null:{queue:ids.map((id,index)=>({id,direction:track,retry:false,...(track==='sound'&&[0,1].includes(soundIndices[index])?{soundIndex:soundIndices[index]}:{})})),index:0,original:ids.length,firstCorrect:0,xp:0,continuous:false,answered:0,correctCount:0,skipped:[],missedTurns:[],reviews:{},config:settings,answer:null,missed:[],recalled:[]};
  localStorage.setItem(key,JSON.stringify({progress,introduced:exposure,custom,settings,session}));
  localStorage.setItem('bonjour-angers-v1',JSON.stringify({xp:0,answers:{},days:[],complete:[],day:1}));
 },{key,ids,track,mode,gloss,visuals,introduced,modeIntroduced,progress,custom,home,category,soundIndices});
 await p.goto(base+'/');await p.waitForFunction(()=>window.VocabularyTrainer&&window.LearningSync);
 return{context,p,errors};
}
async function options(p){if(!await p.locator('.vocab-options').evaluate(d=>d.open))await p.locator('.vocab-options>summary').click();}
async function phoneFeedback(p){
 await p.locator('#vocab-next').waitFor();
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'new learning controls fit the phone width');
 const b=await p.locator('#vocab-next').boundingBox();assert.ok(b.y+b.height<=740,'Next remains visible above the word guide');
 assert.equal(await p.locator('#vocab-next').evaluate(next=>!!(next.compareDocumentPosition(document.querySelector('.vocab-learning-notes'))&Node.DOCUMENT_POSITION_FOLLOWING)),true,'learning aids follow the main action');
}
async function choose(p,value){const choices=p.locator('#vocab-choices .vocab-choice');const index=await choices.evaluateAll((buttons,value)=>buttons.findIndex(b=>b.dataset.value===value||b.value===value),value);assert.ok(index>=0,'answer choice is available: '+value);await choices.nth(index).click();}
(async()=>{
 await new Promise(r=>server.listen(8800,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const home=await seeded(browser,{home:true});const h=home.p;
  const all=await h.evaluate(()=>VOCABULARY_WORDS);
  assert.equal(all.length,240);assert.equal(new Set(all.map(w=>w.id)).size,240);
  for(const w of all){assert.ok(typeof w.fi==='string'&&w.fi.trim(),'Finnish meaning: '+w.id);assert.ok(Array.isArray(w.fiAccepted),'Finnish alternatives: '+w.id);assert.ok(w.anchor&&['cognate','pattern','scene'].includes(w.anchor.type)&&w.anchor.text.trim(),'specific memory anchor: '+w.id);assert.ok(typeof w.soundFi==='string'&&w.soundFi.trim(),'Finnish pronunciation cue: '+w.id);if(/^(?:le |la |les |l[’'])/i.test(w.fr))assert.ok(w.article,'noun article metadata: '+w.id);if(w.fr.startsWith('le ')){assert.equal(w.article.gender,'m','listed masculine noun: '+w.id);assert.equal(w.article.definite,'le');}if(w.fr.startsWith('la ')){assert.equal(w.article.gender,'f','listed feminine noun: '+w.id);assert.equal(w.article.definite,'la');}}
  assert.equal(all.find(w=>w.id==='water').article.gender,'f');assert.equal(all.find(w=>w.id==='hotel').article.gender,'m');assert.equal(all.find(w=>w.id==='address').article.gender,'f');assert.equal(all.find(w=>w.id==='scientific-paper').article.gender,'m');
  assert.match(all.find(w=>w.id==='water').fi,/vesi/);assert.match(all.find(w=>w.id==='hotel').fi,/hotelli/);
  const pictures=all.filter(w=>w.visual);assert.ok(pictures.length>=30,'concrete words have illustrated memory anchors');
  const sprite=await h.evaluate(async()=>await(await fetch('/images/word-anchors.svg')).text());
  const symbols=await h.evaluate(svg=>[...new DOMParser().parseFromString(svg,'image/svg+xml').querySelectorAll('symbol')].map(s=>s.id),sprite);
  for(const w of pictures){assert.ok(symbols.includes(w.visual.key),'picture reference exists: '+w.id);assert.ok(w.visual.label);}
  const sounds=all.filter(w=>w.sound);assert.ok(sounds.length>=8,'sound mode has a varied contrast deck');
  for(const w of sounds){assert.equal(w.sound.choices.length,2);assert.equal(new Set(w.sound.choices).size,2);assert.ok(w.sound.choices.includes(w.sound.target));assert.ok(w.sound.note);}
  assert.equal(await h.locator('#vocab-gloss').inputValue(),'both');assert.equal(await h.locator('#vocab-visuals').inputValue(),'on');
  await h.locator('#vocab-patterns>summary').click();assert.match(await h.locator('#vocab-patterns').textContent(),/Finnish|asemalla/i);assert.match(await h.locator('#vocab-patterns').textContent(),/article|gender/i);
  await h.getByLabel('Mode',{exact:true}).selectOption('article');const articleList=await h.locator('.vocab-word>summary>span:first-child').allTextContents();for(const id of ['doctor','afternoon','colleague','professor'])if(all.find(w=>w.id===id).article.quiz===false)assert.equal(articleList.includes(all.find(w=>w.id===id).fr),false,'variable-gender words are not forced into a false binary quiz');
  assert.equal(await h.evaluate(()=>VocabularyTrainer.matches(VOCABULARY_WORDS.find(w=>w.id==='coffee'),'fr-en',VOCABULARY_WORDS.find(w=>w.id==='coffee').fi)),true);
  assert.deepEqual(home.errors,[]);await home.context.close();
  console.log('PASS: all240 Finnish meanings, memory and sound anchors, lexical article metadata, real picture references, contrast deck and pattern guide');

  const prior=rec(80,Date.now()+14*86400000);
  const a=await seeded(browser,{track:'article',mode:'article',modeIntroduced:false,progress:{coffee:{'en-fr':prior}}});let p=a.p,w=await word(p,'coffee');
  assert.equal(await p.locator('#intro-word').textContent(),w.fr,'a new skill introduces an already-known word');
  assert.ok((await p.locator('.vocab-anchor').textContent()).includes(w.anchor.text));assert.equal(await p.locator('figure.vocab-picture').count(),1);assert.ok((await p.locator('.vocab-sound-fi').textContent()).includes(w.soundFi));
  assert.equal((await saved(p)).progress.coffee.article,undefined,'introduction has no score');
  await p.locator('#intro-continue').click();assert.equal(await p.locator('figure.vocab-picture').count(),0,'article recall does not display the answer picture');
  assert.equal(await p.locator('#vocab-choices .vocab-choice').count(),2);assert.ok((await saved(p)).introduced['coffee|article']);
  await p.getByRole('button',{name:'Tip',exact:true}).click();assert.equal((await saved(p)).session.answered,0,'article tip alone does not grade');
  await choose(p,'m');let d=await saved(p);assert.equal(d.progress.coffee.article.strength,5);assert.deepEqual(d.progress.coffee['en-fr'],prior,'article practice preserves meaning strength');assert.equal(await p.evaluate(()=>state.xp),0,'assisted article answer earns no XP');
  assert.equal(await p.locator('figure.vocab-picture').count(),1);assert.ok((await p.locator('.vocab-article-note').textContent()).includes(w.article.note));await phoneFeedback(p);
  await p.screenshot({path:path.join(root,'../qa/finnish-article-feedback.png'),fullPage:true});assert.deepEqual(a.errors,[]);await a.context.close();
  const wrong=await seeded(browser,{ids:['station'],track:'article',mode:'article',progress:{station:{'en-fr':rec(40)}}});p=wrong.p;await choose(p,'m');d=await saved(p);assert.equal(d.session.answer.ok,false);assert.equal(d.progress.station.article.wrong,1);assert.equal(d.progress.station['en-fr'].strength,40);assert.equal(!!d.session.queue.find(i=>i.retry).hinted,false);await phoneFeedback(p);assert.deepEqual(wrong.errors,[]);await wrong.context.close();
  const hotel=await seeded(browser,{ids:['hotel'],track:'article',mode:'article'});await choose(hotel.p,'m');assert.equal((await saved(hotel.p)).progress.hotel.article.strength,20);assert.ok((await hotel.p.locator('.vocab-learning-notes').textContent()).includes('hôtel'));assert.deepEqual(hotel.errors,[]);await hotel.context.close();
  console.log('PASS: article study-first, explicit lexical gender, independent meaning strength, assisted and wrong article answers, elided nouns and compact feedback');

  const s=await seeded(browser,{ids:['street','train'],track:'sound',mode:'sound',soundIndices:[1,0]});p=s.p;w=await word(p,'street');const heardFoil=w.sound.choices[1];
  assert.equal(await p.locator('figure.vocab-picture,.vocab-anchor,.vocab-learning-notes').count(),0,'sound recall hides meaning and memory cues');assert.equal(await p.locator('#vocab-choices .vocab-choice').count(),0,'audio precedes sound choices');
  assert.equal(await p.locator('#vocab-listening button[aria-label]').count(),0,'playback labels do not reveal the answer');
  await p.getByRole('button',{name:'Play',exact:true}).click();await p.waitForFunction(()=>document.querySelectorAll('#vocab-choices .vocab-choice').length===2);
  assert.equal(await p.evaluate(()=>__spokenFrench.at(-1)),heardFoil,'contrast mode can play the foil instead of the familiar dictionary word');
  await p.getByRole('button',{name:'Slow',exact:true}).click();assert.equal(await p.evaluate(()=>__spokenFrench.at(-1)),heardFoil,'Slow keeps the same sound choice');
  await p.reload();assert.equal((await saved(p)).session.queue[0].soundIndex,1,'reopening retains the actual listening target');assert.equal(await p.locator('#vocab-choices .vocab-choice').count(),0);
  await p.getByRole('button',{name:'Play',exact:true}).click();await p.waitForFunction(()=>document.querySelectorAll('#vocab-choices .vocab-choice').length===2);assert.equal(await p.evaluate(()=>__spokenFrench.at(-1)),heardFoil);
  await choose(p,heardFoil);d=await saved(p);assert.equal(d.progress.street.sound.strength,20);assert.equal(d.progress.street['en-fr'],undefined);assert.equal(await p.locator('.vocab-correct-answer').textContent(),heardFoil);assert.ok((await p.locator('.vocab-learning-notes').textContent()).includes(w.sound.foilFi),'feedback explains the word actually heard');assert.equal(await p.locator('figure.vocab-picture').count(),0,'foil feedback does not show a misleading picture of the canonical word');await phoneFeedback(p);
  await p.locator('#vocab-next').click();const beforeSkip=await saved(p);
  await p.evaluate(()=>{Object.defineProperty(speechSynthesis,'speak',{configurable:true,value:u=>queueMicrotask(()=>u.onerror?.({error:'synthesis-unavailable'}))});});
  await p.getByRole('button',{name:'Play',exact:true}).click();await p.getByText('Audio unavailable. Skip without changing strength.',{exact:true}).waitFor();
  assert.equal(await p.locator('#vocab-choices .vocab-choice').count(),0);await p.getByRole('button',{name:'Skip audio',exact:true}).click();d=await saved(p);assert.equal(d.session.answered,beforeSkip.session.answered);assert.deepEqual(d.progress.train,beforeSkip.progress.train);assert.deepEqual(s.errors,[]);await s.context.close();
  const canonical=await seeded(browser,{ids:['street'],track:'sound',mode:'sound',soundIndices:[0]});p=canonical.p;w=await word(p,'street');await p.getByRole('button',{name:'Play',exact:true}).click();await p.waitForFunction(()=>document.querySelectorAll('#vocab-choices .vocab-choice').length===2);assert.equal(await p.evaluate(()=>__spokenFrench.at(-1)),w.sound.choices[0]);await choose(p,w.sound.choices[0]);assert.equal((await saved(p)).progress.street.sound.strength,20);assert.deepEqual(canonical.errors,[]);await canonical.context.close();
  console.log('PASS: audio-first contrast choices, exact sound target playback, independent listening strength and failed-audio skip without penalty');

  const native=await seeded(browser,{gloss:'fi',visuals:false});p=native.p;w=await word(p,'coffee');assert.equal(await p.locator('#vocab-prompt').textContent(),w.fi);
  await p.getByRole('textbox',{name:'Answer',exact:true}).fill(w.fr);await p.getByRole('button',{name:'Check',exact:true}).click();assert.equal((await saved(p)).progress.coffee['en-fr'].strength,20);assert.equal(await p.locator('figure.vocab-picture').count(),0);assert.ok((await p.locator('.vocab-sound-fi').textContent()).includes(w.soundFi));
  await p.getByRole('button',{name:'Back',exact:true}).click();await options(p);await p.locator('#vocab-gloss').selectOption('en');await p.locator('#vocab-visuals').selectOption('on');
  await p.evaluate(()=>VocabularyTrainer.acceptSync(VocabularyTrainer.snapshot()));d=await saved(p);assert.equal(d.settings.gloss,'en');assert.equal(d.settings.visuals,true,'cloud learning updates preserve picture preference');
  await p.reload();assert.equal((await saved(p)).settings.gloss,'en');assert.equal((await saved(p)).settings.visuals,true);assert.deepEqual(native.errors,[]);await native.context.close();
  const reverse=await seeded(browser,{track:'fr-en',gloss:'fi'});p=reverse.p;w=await word(p,'coffee');assert.equal(await p.locator('#vocab-answer').getAttribute('lang'),'fi');await p.getByRole('textbox',{name:'Answer',exact:true}).fill(w.fi);await p.getByRole('button',{name:'Check',exact:true}).click();assert.equal((await saved(p)).session.answer.ok,true);assert.deepEqual(reverse.errors,[]);await reverse.context.close();
  const both=await seeded(browser);p=both.p;w=await word(p,'coffee');assert.equal(await p.locator('#vocab-prompt').textContent(),w.en);assert.equal(await p.locator('#vocab-prompt-fi').textContent(),w.fi);assert.equal(await p.locator('figure.vocab-picture,.vocab-anchor').count(),0);await p.getByRole('button',{name:'Tip',exact:true}).click();assert.equal(await p.locator('figure.vocab-picture').count(),1,'a picture cue is available when deliberately requested');assert.deepEqual(both.errors,[]);await both.context.close();
  console.log('PASS: native Finnish and bilingual meaning prompts, Finnish reverse answers, picture toggle, explicit picture tips and local preference retention');

  const due=await seeded(browser,{home:true,mode:'context',category:'conference',progress:{coffee:{article:rec()},street:{sound:rec()},hello:{'en-fr':rec(80,Date.now()+14*86400000)}}});p=due.p;
  assert.equal(await p.locator('#vocab-review-due').textContent(),'Review 2 due words');await p.locator('#vocab-review-due').click();d=await saved(p);assert.deepEqual(d.session.queue.map(i=>i.direction).sort(),['article','sound']);assert.equal(d.settings.mode,'context');assert.equal(d.settings.category,'conference');assert.deepEqual(due.errors,[]);await due.context.close();
  const personal={id:'own-finnish-test',fr:'le protocole',en:'protocol',usage:'A procedure followed in a research project.'};
  const own=await seeded(browser,{ids:[personal.id],custom:[personal],gloss:'fi'});p=own.p;assert.equal(await p.locator('#vocab-prompt').textContent(),personal.en,'personal words fall back to their existing meaning');await p.getByRole('textbox',{name:'Answer',exact:true}).fill(personal.fr);await p.getByRole('button',{name:'Check',exact:true}).click();assert.doesNotMatch(await p.locator('.vocab-learning-notes').textContent(),/undefined|null/);assert.equal(await p.locator('figure.vocab-picture').count(),0);assert.deepEqual(own.errors,[]);await own.context.close();
  console.log('PASS: due review reaches article and sound tracks across filters, and unenriched personal words remain usable');

  const offline=await seeded(browser,{introduced:false});p=offline.p;
  const continueBox=await p.locator('#intro-continue').boundingBox();assert.ok(continueBox.y+continueBox.height<=740,'the illustrated coffee introduction keeps Continue within the phone screen');assert.equal(await p.locator('#intro-more').evaluate(details=>details.open),false,'secondary introduction explanations start collapsed');
  await p.waitForFunction(()=>document.querySelector('#offline-panel').dataset.ready==='true'&&!!navigator.serviceWorker.controller);
  const before=await saved(p);await offline.context.setOffline(true);await p.close();p=await offline.context.newPage();p.on('pageerror',e=>offline.errors.push(e.message));await p.goto(base+'/');await p.locator('#intro-word').waitFor();
  assert.equal(await p.locator('figure.vocab-picture').count(),1);assert.equal(await p.evaluate(async()=>{const r=await fetch('/images/word-anchors.svg');return r.ok&&(await r.text()).includes('<symbol');}),true,'illustrations are available from the offline pack');
  assert.equal(await p.evaluate(()=>VOCABULARY_WORDS.find(w=>w.id==='coffee').fi),all.find(w=>w.id==='coffee').fi);assert.deepEqual((await saved(p)).progress,before.progress);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await p.screenshot({path:path.join(root,'../qa/finnish-offline-introduction.png'),fullPage:true});assert.deepEqual(offline.errors,[]);await offline.context.close();
  const now=Date.now(),day=new Date(now).toLocaleDateString('en-CA');const projected=M.project(M.emptyState(),[
   {id:'finnish-article',kind:'vocab.attempt',epoch:'initial',at:now,payload:{wordId:'coffee',track:'article',ok:true,retry:false,cooldown:false,day}},
   {id:'finnish-sound',kind:'vocab.attempt',epoch:'initial',at:now,payload:{wordId:'street',track:'sound',ok:true,retry:false,cooldown:false,day}},
   {id:'finnish-intro',kind:'vocab.introduced',epoch:'initial',at:now,payload:{wordId:'street',track:'sound'}}
  ]);assert.equal(projected.vocab.progress.coffee.article.strength,20);assert.equal(projected.vocab.progress.street.sound.strength,20);assert.ok(projected.vocab.introduced['street|sound']);assert.deepEqual(M.sanitizeSnapshot(projected),projected);
  console.log('PASS: illustrated Finnish introductions survive fresh offline launch and new track events round-trip through sync/backup validation');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
