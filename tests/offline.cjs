const {chromium,devices}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({...devices['iPhone 13'],defaultBrowserType:undefined});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8765/');
 await page.waitForFunction(()=>document.querySelector('#offline-panel').dataset.ready==='true');
 await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 const manifest=await page.evaluate(async()=>await (await fetch('/manifest.webmanifest')).json());
 assert.equal(manifest.display,'standalone');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await context.setOffline(true);await page.close();let p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://127.0.0.1:8765/');await p.getByText('Offline · lessons ready',{exact:true}).waitFor();
 await p.getByRole('button',{name:'Scenarios',exact:true}).click();await p.getByRole('button',{name:'Mixed practice',exact:true}).click();
 for(const name of ['Bonjour !','Où est la gare ?','Right','Je voudrais un billet pour Angers.']){
  await p.getByRole('button',{name,exact:true}).click();await p.getByRole('button',{name:/Next question|See my progress/}).click();
 }
 await p.locator('dialog').getByRole('button',{name:'Scenarios',exact:true}).click();
 await p.reload();await p.getByRole('button',{name:'Progress',exact:true}).click();assert.equal(await p.locator('.stat b').first().textContent(),'40');
 await p.getByRole('button',{name:'Dialogues',exact:true}).click();await p.getByRole('button',{name:'Open →'}).nth(1).click();
 await p.getByText('Un café et un croissant, s’il vous plaît.',{exact:true}).waitFor();
 await p.getByRole('button',{name:'Close lesson'}).click();
 await p.getByRole('button',{name:'Phrases',exact:true}).click();await p.getByRole('textbox').fill('train');assert.ok(await p.locator('#phrases .phrase').count());
 await context.setOffline(false);
 await p.evaluate(async()=>{for(const key of await caches.keys())await caches.delete(key)});
 await p.reload();await p.waitForFunction(()=>document.querySelector('#offline-panel').dataset.ready==='true');
 await context.setOffline(true);await p.reload();await p.getByText('Offline · lessons ready',{exact:true}).waitFor();
 await p.evaluate(()=>localStorage.setItem('bonjour-angers-v1','{"answers":null,"days":null,"day":99,"complete":3,"xp":"bad"}'));
 await p.reload();await p.getByRole('button',{name:'Progress',exact:true}).click();assert.equal(await p.locator('.stat b').first().textContent(),'0');
 assert.deepEqual(errors,[]);
 await p.screenshot({path:'/workspace/sites/bonjour-angers/qa/pwa-mobile.png',fullPage:true});
 console.log('PASS: manifest, mobile, offline new-window launch, offline full lesson, offline persistence/search/dialogue, cache recovery, malformed storage, no runtime errors');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
