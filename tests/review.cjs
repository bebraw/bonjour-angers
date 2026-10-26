const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const context=await browser.newContext();const p=await context.newPage();await p.goto('http://127.0.0.1:8765/');
 await p.evaluate(()=>{
  state.answers.name={right:2,miss:0,attempts:2,streak:2};save();
  if(!acceptsAnswer(questions.find(q=>q.id==='name'),"Je m'appelle Juho."))throw Error('Custom name rejected');
  if(!acceptsAnswer(questions.find(q=>q.id==='coffee'),'Je voudrais un café, s’il vous plaît.'))throw Error('Polite variant rejected');
  if(!acceptsAnswer(questions.find(q=>q.id==='hotel-breakfast'),'À quelle heure est le petit déjeuner ?'))throw Error('Unhyphenated breakfast rejected');
  if(!acceptsAnswer(questions.find(q=>q.id==='hotel-breakfast'),'À quelle heure est le petit-déjeuner, s’il vous plaît ?'))throw Error('Polite breakfast rejected');
  start('conference');
 });
 for(let i=0;i<3;i++){
   await p.locator('.option').first().click();await p.getByRole('button',{name:'Next question'}).click();
 }
 assert.match(await p.locator('dialog h2').textContent(),/Introduce/);
 assert.equal(await p.evaluate(()=>document.activeElement.id),'lesson-title');
 await p.getByRole('textbox',{name:'Your French answer'}).fill('Je m’appelle Juho.');
 await p.getByRole('button',{name:'Check answer'}).click();await p.getByText('Très bien ! ✓',{exact:true}).waitFor();
 await p.getByRole('button',{name:'See my progress'}).click();
 await p.evaluate(()=>{state.answers.name={right:4,miss:0,attempts:4,streak:2};session=[questions.find(q=>q.id==='name')];qi=0;showQ();});
 await p.getByRole('textbox',{name:'Your French answer'}).fill('Bonjour');await p.getByRole('button',{name:'Check answer'}).click();
 assert.equal(await p.evaluate(()=>state.answers.name.streak),0);
 await p.evaluate(()=>showQ());assert.equal(await p.locator('.option').count(),3);
 console.log('PASS: accepted variants, custom name, heading focus, typing progression, difficulty recovery');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
