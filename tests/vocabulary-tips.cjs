const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'../dist'),key='bonjour-angers-vocabulary-v1';
const base='http://127.0.0.1:8797';
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server=http.createServer(async(req,res)=>{try{const name=new URL(req.url,base).pathname;const file=path.join(root,name==='/'?'index.html':name.slice(1));const bytes=await fs.readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'text/plain','Cache-Control':'no-store'});res.end(bytes);}catch{res.writeHead(404).end();}});
async function saved(p){return p.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);}
async function current(p){return p.evaluate(key=>{const d=JSON.parse(localStorage.getItem(key));const item=d.session.queue[d.session.index];return{item,word:[...VOCABULARY_WORDS,...d.custom].find(w=>w.id===item.id)};},key);}
async function closedTip(p){
 assert.equal(await p.locator('#vocab-tip-text').textContent(),'','A fresh prompt does not reveal a tip');
 assert.equal(await p.locator('.vocab-learning-notes').count(),0,'Usage and spelling cannot leak the answer before grading');
}
async function fitsPhone(p){
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Practice has no horizontal overflow');
 const box=await p.locator('#vocab-next').boundingBox();
 assert.ok(box.y+box.height<=740,'Next remains visible before the extra learning information');
}
async function feedback(p,word,direction){
 const notes=p.locator('.vocab-learning-notes');await notes.waitFor();
 const text=await notes.textContent();
 if(word.pronunciation)assert.ok(text.includes(word.pronunciation),'Pronunciation guide is available after any answer');
 const sentence=direction==='context'?word.context.sentence.replace('____',word.context.answer):word.example;
 const translation=direction==='context'?word.context.translation:word.exampleEn;
 if(sentence)assert.ok(text.includes(sentence),'French usage example is available after any answer');
 if(translation)assert.ok(text.includes(translation),'English example translation is available after any answer');
 if(word.usage)assert.equal(await notes.locator('.vocab-usage').textContent(),word.usage);
 assert.equal(await notes.locator('.vocab-spelling').count(),1,'Spelling guide is available');
 const after=await p.locator('#vocab-next').evaluate(next=>!!(next.compareDocumentPosition(document.querySelector('.vocab-learning-notes'))&Node.DOCUMENT_POSITION_FOLLOWING));
 assert.equal(after,true,'Next appears before learning details');
 await fitsPhone(p);
}
async function seeded(browser,{ids=['coffee','station','please'],direction='en-fr',mode='recall',custom=[],introduced=true,width=390}={}){
 const context=await browser.newContext({viewport:{width,height:740}}),p=await context.newPage();
 const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(({key,ids,direction,mode,custom,introduced})=>{
  if(localStorage.getItem(key))return;
  const settings={mode,category:'all',direction:direction==='fr-en'?'fr-en':'en-fr',length:5,pool:'all'};
  const exposure={};if(introduced)for(const id of ids){exposure[id]=Date.now();if(['context','listen'].includes(direction))exposure[id+'|'+direction]=Date.now();}
  localStorage.setItem(key,JSON.stringify({progress:{},introduced:exposure,custom,settings,session:{queue:ids.map(id=>({id,direction,retry:false})),index:0,original:ids.length,firstCorrect:0,xp:0,continuous:false,answered:0,correctCount:0,skipped:[],missedTurns:[],reviews:{},config:settings,answer:null,missed:[],recalled:[]}}));
 },{key,ids,direction,mode,custom,introduced});
 await p.goto(base+'/');await p.locator('#vocab-answer,#intro-word').first().waitFor();
 return{context,p,errors};
}
(async()=>{
 await new Promise(r=>server.listen(8797,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const {context,p,errors}=await seeded(browser);let turn=await current(p);
  await closedTip(p);await p.getByRole('button',{name:'Tip',exact:true}).click();
  assert.match(await p.locator('#vocab-tip-text').textContent(),/Tip: .*letters?/);
  assert.equal((await saved(p)).session.answered,0,'Tip alone does not grade');
  await p.getByRole('button',{name:'Back',exact:true}).click();await p.getByRole('button',{name:'Resume',exact:true}).click();
  await closedTip(p);assert.equal(await p.getByRole('button',{name:'Tip',exact:true}).isEnabled(),true);
  await p.getByRole('button',{name:'Tip',exact:true}).click();await p.reload();
  await closedTip(p);assert.ok((await saved(p)).session.queue[0].hinted,'Reload retains assisted scoring without displaying the cue');
  await p.getByRole('textbox',{name:'Answer',exact:true}).fill('le cafe');await p.getByRole('button',{name:'Check',exact:true}).click();
  assert.equal((await saved(p)).progress.coffee['en-fr'].strength,5);assert.equal(await p.evaluate(()=>state.xp),0,'Hinted answer earns no XP after reopening');
  await feedback(p,turn.word,'en-fr');
  await p.locator('.vocab-spelling>summary').click();
  assert.ok((await p.locator('.vocab-spelling').textContent()).includes('é'),'Accented spelling remains available even when an unaccented answer is accepted');
  await p.screenshot({path:path.join(root,'../qa/word-learning-feedback.png'),fullPage:true});
  await p.getByRole('button',{name:'Next',exact:true}).click();await closedTip(p);turn=await current(p);assert.equal(turn.word.id,'station');
  await p.getByRole('button',{name:'Tip',exact:true}).click();await p.getByRole('textbox',{name:'Answer',exact:true}).fill('le gare');await p.getByRole('button',{name:'Check',exact:true}).click();
  assert.equal((await saved(p)).session.answer.ok,false,'Wrong article remains a meaningful mistake');await feedback(p,turn.word,'en-fr');
  const retry=(await saved(p)).session.queue.find(x=>x.id==='station'&&x.retry);assert.ok(retry);assert.equal(!!retry.hinted,false,'A retry cannot inherit automatic tip visibility');
  await p.getByRole('button',{name:'Next',exact:true}).click();await closedTip(p);turn=await current(p);
  await p.getByRole('button',{name:'Reveal',exact:true}).click();await feedback(p,turn.word,'en-fr');assert.equal((await saved(p)).session.answer.revealed,true);
  await p.getByRole('button',{name:'Next',exact:true}).click();turn=await current(p);assert.equal(turn.word.id,'station');assert.equal(turn.item.retry,true);await closedTip(p);assert.equal(await p.getByRole('button',{name:'Tip',exact:true}).isEnabled(),true);
  assert.deepEqual(errors,[]);await context.close();
  console.log('PASS: tips reopen only on request; assisted credit survives reload; correct, wrong and reveal have spelling/pronunciation/usage; retried words start without a tip; compact Next and no overflow');

  for(const direction of ['fr-en','context']){
   const {context,p,errors}=await seeded(browser,{ids:['coffee'],direction,mode:direction==='context'?'context':'recall'});const {word}=await current(p);
   await closedTip(p);await p.getByRole('textbox',{name:'Answer',exact:true}).fill(direction==='context'?word.context.answer:word.en);await p.getByRole('button',{name:'Check',exact:true}).click();
   await feedback(p,word,direction);assert.equal((await saved(p)).progress.coffee[direction].strength,20);assert.deepEqual(errors,[]);await context.close();
  }
  console.log('PASS: reverse translation and sentence recall retain French learning details and separate strength');

  const listening=await seeded(browser,{ids:['coffee'],direction:'listen',mode:'listen'});const l=listening.p,word=(await current(l)).word;
  await l.evaluate(()=>{Object.defineProperty(window.speechSynthesis,'speak',{configurable:true,value:u=>queueMicrotask(()=>u.onstart?.())});});
  await closedTip(l);assert.equal(await l.getByText(word.fr,{exact:true}).count(),0);assert.equal(await l.getByText(word.en,{exact:true}).count(),0);assert.equal(await l.getByRole('button',{name:'Tip',exact:true}).isDisabled(),true);
  await l.getByRole('button',{name:'Play',exact:true}).click();await l.getByText('Type the French you heard.',{exact:true}).waitFor();
  await l.getByRole('button',{name:'Tip',exact:true}).click();await l.reload();await closedTip(l);assert.equal(await l.getByText(word.fr,{exact:true}).count(),0);
  await l.evaluate(()=>{Object.defineProperty(window.speechSynthesis,'speak',{configurable:true,value:u=>queueMicrotask(()=>u.onstart?.())});});
  await l.getByRole('button',{name:'Play',exact:true}).click();await l.getByText('Type the French you heard.',{exact:true}).waitFor();await l.getByRole('textbox',{name:'Answer',exact:true}).fill(word.fr);await l.getByRole('button',{name:'Check',exact:true}).click();await feedback(l,word,'listen');assert.equal((await saved(l)).progress.coffee.listen.strength,5);assert.deepEqual(listening.errors,[]);await listening.context.close();
  console.log('PASS: listening hides answers and learning details before grading, including after reopening a tipped turn');

  const intro=await seeded(browser,{ids:['please'],introduced:false});assert.equal(await intro.p.locator('.vocab-spelling').count(),1);await intro.p.getByRole('button',{name:'Continue',exact:true}).click();await closedTip(intro.p);assert.equal(await intro.p.getByText('s’il vous plaît',{exact:true}).count(),0);assert.deepEqual(intro.errors,[]);await intro.context.close();
  const own={id:'own-context-test',fr:'le dossier de candidature pour la conférence internationale des jeunes chercheurs',en:'the application file for the international conference of early career researchers',usage:'Use dossier de candidature for the documents that support an application.'};
  const personal=await seeded(browser,{ids:[own.id],custom:[own],width:320});await personal.p.getByRole('textbox',{name:'Answer',exact:true}).fill(own.fr);await personal.p.getByRole('button',{name:'Check',exact:true}).click();await feedback(personal.p,own,'en-fr');assert.doesNotMatch(await personal.p.locator('.vocab-learning-notes').textContent(),/undefined|null/);assert.deepEqual(personal.errors,[]);await personal.context.close();
  console.log('PASS: introduction spelling, no pre-recall answer leak, personal-word fallback, narrow-phone wrapping');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
