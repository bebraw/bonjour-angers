const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'../dist');const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=http.createServer(async(req,res)=>{try{const name=new URL(req.url,'http://localhost').pathname;const file=path.join(root,name==='/'?'index.html':name.slice(1));res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'text/plain','Cache-Control':'no-store'});res.end(await fs.readFile(file));}catch{res.writeHead(404);res.end();}});
async function studyIntroductions(page){
 for(let i=0;i<30;i++){
  if(await page.locator('#intro-continue').count()){await page.locator('#intro-continue').click();continue;}
  return;
 }
 throw Error('Introduction loop did not reach practice');
}
async function options(page){if(!await page.locator('.vocab-options').evaluate(d=>d.open))await page.locator('.vocab-options>summary').click();}
(async()=>{await new Promise(r=>server.listen(8793,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  async function prepareKnown(exceptions){const c=await browser.newContext({viewport:{width:390,height:844}});const p=await c.newPage();await p.goto('http://127.0.0.1:8793/');await p.getByText('Ready for offline practice',{exact:true}).waitFor();await p.evaluate(exceptions=>{const now=Date.now(),progress={};for(const w of VOCABULARY_WORDS)progress[w.id]={'en-fr':{right:5,wrong:0,streak:5,strength:100,due:now+30*86400000,last:now-86400000}};for(const [id,strength]of Object.entries(exceptions))progress[id]={'en-fr':{right:strength/20,wrong:0,streak:strength/20,strength,due:now-1000,last:strength?now-86400000:0}};localStorage.setItem('bonjour-angers-vocabulary-v1',JSON.stringify({progress,custom:[],settings:{category:'all',direction:'en-fr',length:0,pool:'smart'},session:null}));},exceptions);await p.reload();await p.getByRole('button',{name:'Words',exact:true}).click();await p.getByRole('button',{name:'Start',exact:true}).click();await studyIntroductions(p);return[c,p];}
  const[c,p]=await prepareKnown({hello:0,thanks:60});
  for(let i=0;i<2;i++){await studyIntroductions(p);const prompt=await p.locator('#vocab-prompt').textContent();assert.ok(['hello','thank you'].includes(prompt));await p.getByRole('textbox',{name:'Answer',exact:true}).fill(prompt==='hello'?'bonjour':'merci');await p.getByRole('button',{name:'Check',exact:true}).click();await p.getByRole('button',{name:'Next',exact:true}).click();}
  await p.getByText('Caught up.',{exact:true}).waitFor();
  const progress=await p.evaluate(()=>JSON.parse(localStorage.getItem('bonjour-angers-vocabulary-v1')).progress);
  assert.equal(progress.hello['en-fr'].strength,20);assert.equal(progress.thanks['en-fr'].strength,80);assert.ok(progress.thanks['en-fr'].due-Date.now()>13*86400000);
  await p.getByRole('button',{name:'Back',exact:true}).click();await p.getByRole('button',{name:'Start',exact:true}).click();await p.getByText(/No words in this selection/).waitFor();await c.close();
  const[c2,p2]=await prepareKnown({hello:0});
  for(let i=0;i<3;i++){await p2.getByRole('button',{name:'Reveal',exact:true}).click();await p2.getByRole('button',{name:'Next',exact:true}).click();}
  await p2.getByText('Caught up.',{exact:true}).waitFor();const cooled=await p2.evaluate(()=>JSON.parse(localStorage.getItem('bonjour-angers-vocabulary-v1')).progress.hello['en-fr']);assert.equal(cooled.wrong,3);assert.ok(cooled.due>Date.now()+9*60000);await c2.close();
  const c3=await browser.newContext({viewport:{width:390,height:844}});let p3=await c3.newPage();await p3.goto('http://127.0.0.1:8793/');await p3.getByText('Ready for offline practice',{exact:true}).waitFor();await p3.getByRole('button',{name:'Words',exact:true}).click();await options(p3);assert.equal(await p3.getByLabel('Session length',{exact:true}).inputValue(),'0');await p3.getByRole('button',{name:'Start',exact:true}).click();await studyIntroductions(p3);
  const missed=await p3.locator('#vocab-prompt').textContent();let missedId;
  for(let i=0;i<31;i++){
    await studyIntroductions(p3);const expected=await p3.evaluate(()=>{const d=JSON.parse(localStorage.getItem('bonjour-angers-vocabulary-v1'));const turn=d.session.queue[d.session.index];const w=VOCABULARY_WORDS.find(w=>w.id===turn.id);return{fr:w.fr,id:w.id};});
    if(i===0){missedId=expected.id;await p3.getByRole('textbox',{name:'Answer',exact:true}).fill('not correct');}
    else await p3.getByRole('textbox',{name:'Answer',exact:true}).fill(expected.fr);
    await p3.getByRole('button',{name:'Check',exact:true}).click();await p3.getByRole('button',{name:'Next',exact:true}).click();
  }
  await studyIntroductions(p3);const before=await p3.evaluate(()=>JSON.parse(localStorage.getItem('bonjour-angers-vocabulary-v1')).session);assert.equal(before.answered,31);assert.ok(before.queue.length<40);assert.ok(!before.queue.some(i=>i.id===missedId));assert.ok(before.missedTurns.some(i=>i.id===missedId));
  await c3.setOffline(true);await p3.close();p3=await c3.newPage();await p3.goto('http://127.0.0.1:8793/');await p3.getByRole('button',{name:'Words',exact:true}).click();await p3.getByRole('textbox',{name:'Answer',exact:true}).waitFor();const after=await p3.evaluate(()=>JSON.parse(localStorage.getItem('bonjour-angers-vocabulary-v1')).session);assert.equal(after.answered,31);assert.equal(after.index,before.index);assert.equal(await p3.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await p3.screenshot({path:path.join(root,'../qa/vocabulary-continuous-mobile.png'),fullPage:true});await c3.close();
  console.log('PASS: continuous default, known words skipped, strength increases and intervals, three-miss cooldown, rolling queue pruning, missed directions retained, continuous offline resume after31 turns, mobile layout');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;server.close()});
