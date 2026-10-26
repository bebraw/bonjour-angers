const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'../dist'),key='bonjour-angers-vocabulary-v1',base='http://127.0.0.1:8798';
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=http.createServer(async(req,res)=>{try{const name=new URL(req.url,base).pathname,file=path.join(root,name==='/'?'index.html':name.slice(1)),body=await fs.readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'text/plain','Cache-Control':'no-store'});res.end(body);}catch{res.writeHead(404).end();}});
async function saved(p){return p.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);}
async function seed(browser){
 const context=await browser.newContext({viewport:{width:390,height:740}}),p=await context.newPage(),errors=[];
 p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
 await p.addInitScript(key=>{
  if(localStorage.getItem(key))return;
  const now=Date.now(),past=now-10000,future=now+86400000;
  const stat=(strength,due)=>({right:1,wrong:0,streak:1,strength,last:now-60000,due});
  localStorage.setItem(key,JSON.stringify({
   progress:{coffee:{'en-fr':stat(20,past),'fr-en':stat(40,past)},hello:{context:stat(40,past)},station:{listen:stat(60,past)},please:{'en-fr':stat(80,future)}},
   introduced:{coffee:now,hello:now,'hello|context':now,station:now,'station|listen':now,please:now},custom:[],
   settings:{mode:'context',category:'conference',direction:'fr-en',length:0,pool:'tricky'},session:null
  }));
 },key);
 await p.goto(base+'/');await p.locator('#vocab-review-due').waitFor();return{context,p,errors};
}
function checkDue(d){
 const queue=d.session.queue;assert.equal(d.session.continuous,false);assert.ok(queue.length<=20);
 assert.equal(new Set(queue.map(x=>x.id)).size,queue.length,'Review picks one track per word');
 assert.deepEqual(new Set(queue.map(x=>x.id)),new Set(['coffee','hello','station']),'Due review excludes future and unseen words');
 for(const item of queue){assert.ok(d.progress[item.id][item.direction].last);assert.ok(d.progress[item.id][item.direction].due<=Date.now());}
 assert.equal(queue.find(x=>x.id==='hello').direction,'context');assert.equal(queue.find(x=>x.id==='station').direction,'listen');
}
(async()=>{
 await new Promise(r=>server.listen(8798,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const {context,p,errors}=await seed(browser);
  assert.equal(await p.locator('#vocab-review-due').textContent(),'Review 3 due words');
  assert.ok(await p.locator('#vocab-review').evaluate(el=>!!(el.compareDocumentPosition(document.querySelector('#vocab-settings'))&Node.DOCUMENT_POSITION_FOLLOWING)),'Review is visible before setup');
  assert.match(await p.locator('#vocab-review').textContent(),/All topics and modes/);
  await p.locator('#vocab-review-due').click();let d=await saved(p);checkDue(d);
  assert.equal(d.settings.mode,'context');assert.equal(d.settings.category,'conference','Review does not overwrite normal practice preferences');
  const first=d.session.queue[0];assert.equal(first.id,'coffee');
  await p.getByRole('textbox',{name:'Answer',exact:true}).fill('le café');await p.getByRole('button',{name:'Check',exact:true}).click();
  await p.getByRole('button',{name:'Back',exact:true}).click();
  assert.equal(await p.locator('#vocab-review-due').textContent(),'Review 3 due words','Other due direction keeps a word reviewable');
  await p.locator('#vocab-review-known').click();d=await saved(p);
  assert.equal(d.session.continuous,false);assert.deepEqual(new Set(d.session.queue.map(x=>x.id)),new Set(['coffee','hello','station','please']),'Learned review includes future learned words and excludes unseen words');
  await p.getByRole('button',{name:'Back',exact:true}).click();
  await p.getByRole('button',{name:'Progress',exact:true}).click();await p.locator('#review-vocabulary').click();checkDue(await saved(p));
  await p.getByRole('button',{name:'Back',exact:true}).click();
  await p.evaluate(()=>{const incoming=VocabularyTrainer.snapshot();for(const tracks of Object.values(incoming.progress))for(const stat of Object.values(tracks))stat.due=Date.now()+86400000;dispatchEvent(new CustomEvent('angers:sync-applied',{detail:{vocab:incoming}}));});
  assert.equal(await p.locator('#vocab-review-due').count(),0,'Sync refresh removes the due action when no words are due');assert.equal(await p.locator('#vocab-review-known').isVisible(),true);
  await p.locator('#vocab-review-known').click();d=await saved(p);assert.equal(d.session.queue.length,4);
  await p.getByRole('button',{name:'Back',exact:true}).click();
  await p.evaluate(()=>{const incoming=VocabularyTrainer.snapshot();incoming.progress.please['en-fr'].due=Date.now()-1;dispatchEvent(new CustomEvent('angers:sync-applied',{detail:{vocab:incoming}}));});
  assert.equal(await p.locator('#vocab-review-due').textContent(),'Review 1 due word','Sync refresh adds due review without leaving Words');
  await p.locator('#vocab-review-due').click();d=await saved(p);assert.deepEqual(d.session.queue.map(x=>x.id),['please']);
  await p.getByRole('textbox',{name:'Answer',exact:true}).fill('s’il vous plaît');await p.getByRole('button',{name:'Check',exact:true}).click();await p.getByRole('button',{name:'Back',exact:true}).click();
  assert.equal(await p.locator('#vocab-review-due').count(),0,'Back reflects a just-reviewed due word');
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);await context.close();
  console.log('PASS: visible due/learned review across filters and tracks, finite due-only queues, no unseen words, Progress shortcut, grading/Back and sync refresh');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
