const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const M=require('../dist/sync-model.js');
const root=path.resolve(__dirname,'../dist');
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server=http.createServer(async(req,res)=>{try{const name=new URL(req.url,'http://localhost').pathname;const file=path.join(root,name==='/'?'index.html':name.slice(1));const bytes=await fs.readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'text/plain','Cache-Control':'no-store'});res.end(bytes);}catch{res.writeHead(404).end();}});
const base='http://127.0.0.1:8797';
const expectedTopics=['travel','food','conference','hotel','tram','bakery','restaurant','registration','networking'];
const newIds=['hotel-booking','hotel-breakfast','hotel-wifi','hotel-checkout','tram-stop','tram-line','tram-time','tram-validate','bakery-bread','bakery-quantity','bakery-price','bakery-card','restaurant-menu','restaurant-vegetarian','restaurant-allergy','restaurant-finished','registration-badge','registration-programme','registration-room','registration-start','networking-field','networking-question','networking-contact','networking-thanks'];
async function assertLayout(page,width){
  const layout=await page.evaluate(()=>{
    const rect=node=>{const r=node.getBoundingClientRect();return{x:r.x,right:r.right,y:r.y,bottom:r.bottom,width:r.width,height:r.height};};
    return{overflow:document.documentElement.scrollWidth>innerWidth,viewport:innerWidth,main:rect(document.querySelector('main')),app:rect(document.querySelector('#app')),header:rect(document.querySelector('.site-header')),grid:rect(document.querySelector('.scenario-cards')),cards:[...document.querySelectorAll('.scenario-cards .card')].map(rect),actions:[...document.querySelectorAll('.scenario-actions button')].map(rect)};
  });
  assert.equal(layout.overflow,false,`scenario cards fit ${width}px`);
  assert.ok(Math.abs(layout.main.x-(width-layout.main.right))<1,'main has equal outer margins');
  assert.ok(Math.abs(layout.grid.x-(width-layout.grid.right))<1,'cards have equal horizontal margins');
  if(width<=720){assert.equal(layout.grid.x,16,'cards use consistent 16px mobile gutter');assert.equal(layout.cards.length,9);for(const r of layout.cards){assert.equal(r.x,16);assert.equal(r.right,width-16);}}
  else {assert.ok(layout.grid.width>=850,'desktop cards use the available content width');assert.ok(layout.cards[0].width>250);assert.ok(layout.cards[1].y===layout.cards[0].y,'desktop uses a multi-column grid');}
  for(const r of layout.actions){assert.ok(r.height>=44,'card actions have touch target height');assert.ok(r.x>=layout.grid.x&&r.right<=layout.grid.right+1,'card action stays within card grid');}
}
async function assertLessonLayout(page,width){
  const box=await page.evaluate(()=>{
    const r=document.querySelector('#lesson').getBoundingClientRect();
    return{x:r.x,right:r.right,width:r.width,overflow:document.querySelector('#lesson').scrollWidth>document.querySelector('#lesson').clientWidth,choices:[...document.querySelectorAll('#lesson .option')].map(node=>{const b=node.getBoundingClientRect();return{x:b.x,right:b.right,height:b.height};})};
  });
  assert.ok(Math.abs(box.x-(width-box.right))<1,'lesson has equal outer margins');
  assert.equal(box.overflow,false,`lesson does not overflow at ${width}px`);
  assert.ok(box.x>=12,'lesson keeps screen-edge gutter');
  for(const r of box.choices){assert.ok(r.height>=44,'lesson choices are tappable');assert.ok(r.x>box.x&&r.right<box.right,'lesson choices remain inside border');}
}
(async()=>{
 await new Promise(resolve=>server.listen(8797,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:390,height:740}}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base+'/');await page.getByRole('button',{name:'Scenarios',exact:true}).click();
  const content=await page.evaluate(()=>({topics,questions}));
  assert.deepEqual(content.topics.map(t=>t.id),expectedTopics);
  assert.equal(content.questions.length,36);assert.equal(new Set(content.questions.map(q=>q.id)).size,36);
  assert.deepEqual([...M.QUESTION_IDS].sort(),content.questions.map(q=>q.id).sort(),'sync allowlist matches all scenario questions');
  assert.deepEqual([...M.TOPICS],expectedTopics);
  assert.equal(await page.evaluate(()=>acceptsAnswer(questions.find(q=>q.id==='hotel-breakfast'),'À quelle heure est le petit déjeuner ?')),true,'breakfast accepts the standard unhyphenated spelling');
  for(const id of newIds)assert.ok(content.questions.some(q=>q.id===id));
  for(const t of content.topics){
   const qs=content.questions.filter(q=>q.topic===t.id);assert.equal(qs.length,4);
   assert.ok(t.dialog.length>=4);assert.ok(t.phrases.length>=2);
   for(const line of t.dialog)assert.ok(line.length===4&&line.every(s=>typeof s==='string'&&s.trim()),'dialogues include role/French/translation/pronunciation');
   for(const q of qs){assert.ok(q.q&&q.why);assert.equal(q.a.length,3);assert.equal(new Set(q.a).size,3);assert.ok(Number.isInteger(q.correct)&&q.correct>=0&&q.correct<3);}
  }
  await assertLayout(page,390);
  await page.evaluate(()=>{window.scenarioOperations=[];const record=window.LearningSync.record;window.LearningSync.record=(kind,payload)=>{scenarioOperations.push({kind,payload});return record(kind,payload);};});
  for(const topic of expectedTopics){
   await page.locator(`[data-quiz="${topic}"]`).click();await assertLessonLayout(page,390);
   for(let i=0;i<4;i++){
    const index=await page.evaluate(()=>session[qi].correct);await page.locator('#lesson .option').nth(index).click();
    assert.match(await page.locator('#feedback').textContent(),/Très bien/);
    await page.getByRole('button',{name:i===3?'See my progress →':'Next question →',exact:true}).click();
   }
   assert.equal(await page.locator('#lesson h2').textContent(),'Done.');
   await page.locator('#done').click();
  }
  const result=await page.evaluate(()=>({app:structuredClone(state),operations:scenarioOperations}));
  assert.deepEqual(result.app.complete,expectedTopics);assert.equal(result.app.xp,360);assert.equal(Object.keys(result.app.answers).length,36);
  const projected=M.project(M.emptyState(),result.operations.map((operation,i)=>({id:'scenario-test-'+i,epoch:'initial',at:Date.parse('2026-10-26T12:00:00Z')+i,...operation})));
  assert.equal(projected.app.xp,360);assert.deepEqual(projected.app.complete,expectedTopics);assert.equal(Object.keys(projected.app.answers).length,36);
  assert.deepEqual(M.sanitizeSnapshot(projected),projected,'all9 completions survive backup validation');
  const downloadPromise=page.waitForEvent('download');await page.evaluate(()=>LearningSync.exportBackup());const download=await downloadPromise;
  const backup=JSON.parse(await fs.readFile(await download.path(),'utf8'));
  const backupState=M.project(backup.canonical,backup.pending);assert.deepEqual(backupState.app.complete,expectedTopics);assert.equal(Object.keys(backupState.app.answers).length,36);assert.equal(backupState.app.xp,360);
  await page.reload();await page.getByRole('button',{name:'Scenarios',exact:true}).click();assert.deepEqual(await page.evaluate(()=>state.complete),expectedTopics);
  // New questions follow the existing two-success path into typed retrieval.
  await page.evaluate(()=>{const q=questions.find(q=>q.id==='hotel-wifi');state.answers[q.id]={right:2,miss:0,attempts:2,streak:2};session=[q];qi=0;showQ();openLesson();});
  await page.getByRole('textbox',{name:'Your French answer',exact:true}).fill('Quel est le mot de passe du Wi-Fi ?');await page.getByRole('button',{name:'Check answer',exact:true}).click();assert.match(await page.locator('#feedback').textContent(),/Très bien/);
  await page.getByRole('button',{name:'Close lesson',exact:true}).click();
  // Every expanded topic is accessible through dialogues and the phrasebook.
  await page.getByRole('button',{name:'Dialogues',exact:true}).click();assert.equal(await page.locator('#app > .phrase').count(),9);
  await page.locator('#app > .phrase').last().getByRole('button',{name:'Open →',exact:true}).click();assert.equal(await page.locator('#lesson .bubble').count(),4);await assertLessonLayout(page,390);await page.getByRole('button',{name:'Close lesson',exact:true}).click();
  await page.getByRole('button',{name:'Phrases',exact:true}).click();assert.equal(await page.locator('[data-filter]').count(),11);await page.locator('[data-filter="networking"]').click();assert.ok(await page.locator('#phrases .phrase').count()>=4);
  await page.getByRole('button',{name:'Scenarios',exact:true}).click();await page.screenshot({path:path.join(root,'../qa/scenarios-phone.png'),fullPage:true});
  await page.setViewportSize({width:320,height:740});await assertLayout(page,320);await page.locator('[data-quiz="registration"]').click();await assertLessonLayout(page,320);await page.screenshot({path:path.join(root,'../qa/scenario-lesson-small.png'),fullPage:true});await page.getByRole('button',{name:'Close lesson',exact:true}).click();
  await page.setViewportSize({width:1280,height:900});await assertLayout(page,1280);await page.screenshot({path:path.join(root,'../qa/scenarios-desktop.png'),fullPage:true});
  assert.deepEqual(errors,[]);await context.close();
  console.log('PASS:9 scenarios/36 questions, valid sync IDs and full completion backup, typed recall, expanded dialogue/phrasebook, symmetric phone/desktop gutters and tappable choices');
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
