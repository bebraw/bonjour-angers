const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'../dist');
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server=http.createServer(async(req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname;try{const file=path.join(root,pathname==='/'?'index.html':pathname.slice(1));const body=await fs.readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'text/plain','Cache-Control':'no-store'});res.end(body);}catch{res.writeHead(404);res.end();}});
async function studyIntroductions(page){
 for(let i=0;i<30;i++){
  if(await page.locator('#intro-continue').count()){await page.locator('#intro-continue').click();continue;}
  return;
 }
 throw Error('Introduction loop did not reach practice');
}
async function options(page){if(!await page.locator('.vocab-options').evaluate(d=>d.open))await page.locator('.vocab-options>summary').click();}
(async()=>{
 await new Promise(r=>server.listen(8792,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const ctx=await browser.newContext({viewport:{width:390,height:844}});let p=await ctx.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto('http://127.0.0.1:8792/');await p.getByText('Ready for offline practice',{exact:true}).waitFor();
  await p.getByRole('button',{name:'Words',exact:true}).click();
  assert.equal(await p.locator('.vocab-word').count(),240);
  const matching=await p.evaluate(()=>{
   const cafe=VOCABULARY_WORDS.find(w=>w.fr.includes('café'));
   const station=VOCABULARY_WORDS.find(w=>w.fr==='la gare');
   const thanks=VOCABULARY_WORDS.find(w=>w.id==='thanks');
   return [VocabularyTrainer.matches(cafe,'en-fr','cafe'),VocabularyTrainer.matches(station,'en-fr','le gare'),VocabularyTrainer.matches(thanks,'fr-en','thank you !')];
  });assert.deepEqual(matching,[true,false,true]);
  await p.getByText('Add words',{exact:true}).click();
  const pairs=[['le protocole','protocol'],['l’hypothèse','hypothesis'],['le réseau','network']];
  for(const [fr,en]of pairs){await p.getByLabel('French',{exact:true}).fill(fr);await p.getByLabel('English',{exact:true}).fill(en);await p.getByRole('button',{name:'Add',exact:true}).click();}
  await p.getByLabel('Topic',{exact:true}).selectOption('custom');await options(p);await p.getByLabel('Session length',{exact:true}).selectOption('5');
  assert.equal(await p.locator('.vocab-word').count(),3);
  await p.getByRole('button',{name:'Start',exact:true}).click();await studyIntroductions(p);
  await p.getByRole('textbox',{name:'Answer',exact:true}).fill('wrong');await p.getByRole('button',{name:'Check',exact:true}).click();
  assert.equal((await p.evaluate(()=>JSON.parse(localStorage.getItem('bonjour-angers-vocabulary-v1')))).session.queue.length,4);
  const before=await p.evaluate(()=>JSON.parse(localStorage.getItem('bonjour-angers-vocabulary-v1')));
  await p.reload();
  assert.equal(await p.locator('#vocab-check').isDisabled(),true);
  assert.deepEqual(await p.evaluate(()=>JSON.parse(localStorage.getItem('bonjour-angers-vocabulary-v1')).progress),before.progress);
  await p.getByRole('button',{name:'Next',exact:true}).click();
  for(let i=0;i<3;i++){
   const prompt=await p.locator('#vocab-prompt').textContent();const expected=pairs.find(x=>x[1]===prompt)[0];
   await p.getByRole('textbox',{name:'Answer',exact:true}).fill(expected.normalize('NFD').replace(/[\u0300-\u036f]/g,''));await p.getByRole('button',{name:'Check',exact:true}).click();
   assert.match(await p.locator('#vocab-feedback').textContent(),/Correct\./);
   await p.getByRole('button',{name:/^(Next|Finish)$/}).click();
  }
  assert.match(await p.locator('#vocab-result-score').textContent(),/3 correct \/ 4 answered/);
  await p.getByRole('button',{name:'Back',exact:true}).click();
  await options(p);await p.getByLabel('Direction',{exact:true}).selectOption('fr-en');await p.getByLabel('Practice',{exact:true}).selectOption('all');await p.getByRole('button',{name:'Start',exact:true}).click();await studyIntroductions(p);
  await p.getByRole('button',{name:'Reveal',exact:true}).click();
  await p.getByRole('button',{name:'Next',exact:true}).click();
  await p.getByRole('button',{name:'Back',exact:true}).click();
  await p.getByRole('button',{name:'Progress',exact:true}).click();assert.equal(await p.locator('.stat b').first().textContent(),'10');
  await p.getByRole('button',{name:'Words',exact:true}).click();await p.getByRole('button',{name:'Resume',exact:true}).click();
  assert.equal(await p.getByRole('textbox',{name:'Answer',exact:true}).getAttribute('lang'),'en');
  // Navigate and resume in a fresh offline window, including all newly added assets.
  await ctx.setOffline(true);await p.close();p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:8792/');
  await p.getByRole('textbox',{name:'Answer',exact:true}).waitFor();assert.equal(await p.getByRole('textbox',{name:'Answer',exact:true}).getAttribute('lang'),'en');
  await p.getByRole('button',{name:'Back',exact:true}).click();
  await p.getByText('Add words',{exact:true}).click();await p.getByLabel('French',{exact:true}).fill('<img src=x onerror=window.vocabXss=true>');await p.getByLabel('English',{exact:true}).fill('literal text');await p.getByRole('button',{name:'Add',exact:true}).click();
  assert.equal(await p.locator('#vocab-word-list img').count(),0);assert.equal(await p.evaluate(()=>!!window.vocabXss),false);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await p.screenshot({path:path.join(root,'../qa/vocabulary-mobile.png'),fullPage:true});
  assert.deepEqual(errors,[]);await ctx.close();
  // Mixed direction should select a due orientation instead of dropping the word.
  const c=await browser.newContext();const q=await c.newPage();await q.goto('http://127.0.0.1:8792/');
  await q.evaluate(()=>{localStorage.setItem('bonjour-angers-vocabulary-v1',JSON.stringify({progress:{hello:{'en-fr':{right:2,wrong:0,streak:2,due:Date.now()-1,last:Date.now()-100000},'fr-en':{right:1,wrong:0,streak:1,due:Date.now()+86400000,last:Date.now()-100000}}},custom:[],settings:{category:'essentials',direction:'mixed',length:5,pool:'smart'},session:null}));Math.random=()=>.99;});
  await q.reload();await q.getByRole('button',{name:'Words',exact:true}).click();await q.getByRole('button',{name:'Start',exact:true}).click();
  const queue=await q.evaluate(()=>JSON.parse(localStorage.getItem('bonjour-angers-vocabulary-v1')).session.queue);
  assert.ok(queue.some(i=>i.id==='hello'&&i.direction==='en-fr'));
  await c.close();
  const staleContext=await browser.newContext();const stale=await staleContext.newPage();
  await stale.addInitScript(()=>{const active={state:'activated',postMessage(_message,ports){ports[0].postMessage({protocol:3,version:'v3-download-debug',ready:true,completed:9,total:9,files:[]});}};Object.defineProperty(navigator,'serviceWorker',{value:{controller:null,register:async()=>({active,update:async()=>{}}),addEventListener(){}}});});
  await stale.goto('http://127.0.0.1:8792/');await stale.getByText('Offline setup needs attention',{exact:true}).waitFor();
  assert.equal(await stale.locator('#offline-panel').getAttribute('data-ready'),'false');assert.match(await stale.locator('#offline-debug-report').textContent(),/older offline worker/);await staleContext.close();
  console.log('PASS: 240 words, synonyms/accents/articles, personal pairs, bounded repeats, saved answer/resume, reverse direction, shared XP, offline new-window vocabulary, XSS-safe custom text, mobile layout, mixed-direction due review');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;server.close()});
