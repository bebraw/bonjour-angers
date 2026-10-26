const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'../dist');
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json'};
let fault='http',requests=[];
const server=http.createServer(async(req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;requests.push(pathname);
 if(pathname==='/icons/icon-192.png'&&fault==='http'){res.writeHead(503,{'Content-Type':'text/plain'});res.end('Temporarily unavailable');return;}
 if(pathname==='/icons/icon-192.png'&&fault==='mime'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<html>Unexpected document</html>');return;}
 if(pathname==='/'&&fault==='signin'&&req.headers['sec-fetch-dest']!=='document'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<html><form>Sign in</form></html>');return;}
 const file=path.join(root,pathname==='/'?'index.html':pathname.slice(1));
 try{const data=await fs.readFile(file);if(pathname==='/icons/icon-512.png')await new Promise(r=>setTimeout(r,400));res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);}catch{res.writeHead(404);res.end('Not found');}
});
(async()=>{
 await new Promise(r=>server.listen(8790,'127.0.0.1',r));const base='http://127.0.0.1:8790';let browser;
 try{
  browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:390,height:844}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/');await page.waitForFunction(()=>document.querySelector('#offline-progress').value>0&&document.querySelector('#offline-progress').value<document.querySelector('#offline-progress').max);
  await page.getByRole('button',{name:'Retry missing files',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>navigator.serviceWorker.controller.state),'activated');
  assert.equal(await page.locator('#offline-progress').getAttribute('value'),String(Number(await page.locator('#offline-progress').getAttribute('max'))-1));
  assert.match(await page.locator('#offline-debug-report').textContent(),/\/icons\/icon-192\.png.*HTTP 503/);
  assert.match(await page.locator('#offline-files').textContent(),/HTTP 503/);
  const before=requests.length;fault='none';await page.getByRole('button',{name:'Retry missing files',exact:true}).click();
  await page.getByText('Ready for offline practice',{exact:true}).waitFor();
  assert.deepEqual(requests.slice(before).filter(p=>p!=='/sw.js'),['/icons/icon-192.png']);
  assert.equal(await page.locator('#offline-progress').getAttribute('value'),await page.locator('#offline-progress').getAttribute('max'));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await context.setOffline(true);await page.close();const offline=await context.newPage();await offline.goto(base+'/');await offline.getByText('Offline · lessons ready',{exact:true}).waitFor();
  await offline.getByRole('button',{name:'Start my first lesson'}).click();await offline.getByRole('button',{name:'Bonjour !',exact:true}).click();assert.deepEqual(errors,[]);await context.close();
  console.log('PASS: partial progress, HTTP503 diagnostics, retained files, missing-file-only retry, mobile layout, offline new-window lesson');
  for(const mode of ['mime','signin']){
   fault=mode;const c=await browser.newContext();const p=await c.newPage();await p.goto(base+'/');await p.getByRole('button',{name:'Retry missing files',exact:true}).waitFor();
   assert.match(await p.locator('#offline-debug-report').textContent(),mode==='mime'?/Unexpected content type: text\/html/:/Received a sign-in or unexpected page/);
   assert.equal(await p.locator('#offline-progress').getAttribute('value'),String(Number(await p.locator('#offline-progress').getAttribute('max'))-1));
   const cachePaths=await p.evaluate(async()=>{const keys=await caches.keys();const cache=await caches.open(keys.find(k=>k.startsWith('bonjour-angers-offline-')));return(await cache.keys()).map(r=>new URL(r.url).pathname)});
   assert.ok(!cachePaths.includes(mode==='mime'?'/icons/icon-192.png':'/'));await c.close();console.log('PASS: '+mode+' failure is explicit and invalid response is not cached');
  }
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;server.close()});
