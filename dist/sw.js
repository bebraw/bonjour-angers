/* Change VERSION whenever a saved lesson asset changes. */
const VERSION = 'v5-study-first';
const CACHE = 'bonjour-angers-offline-' + VERSION;
// Save the canonical page once; /index.html may redirect on private hosting.
const CORE = ['/', '/style.css', '/app.js', '/pwa.js', '/vocabulary-data.js', '/vocabulary.js', '/vocabulary.css', '/manifest.webmanifest',
  '/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png', '/icons/apple-touch-icon.png'];
const files = CORE.map(path => ({path, state:'pending', bytes:0, attempt:0, error:''}));
let job = null, started = 0, finished = 0, running = false;
const listeners = new Set();

// Activate independently of the pack. A failed asset must remain inspectable/retryable.
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
function snapshot() {
  return {protocol:3, version:VERSION, ready:files.every(f=>f.state==='saved'), running,
    completed:files.filter(f=>f.state==='saved').length, total:CORE.length,
    bytes:files.reduce((n,f)=>n+f.bytes,0), elapsedMs:started ? (finished||Date.now())-started : 0,
    files:files.map(f=>({...f}))};
}
function notify() {const data={type:'OFFLINE_PROGRESS',...snapshot()};for(const port of listeners) {try {port.postMessage(data);} catch {listeners.delete(port);}}}
async function inspect() {
  const cache=await caches.open(CACHE);
  for(const file of files) {
    const response=await cache.match(file.path);
    if(response) {file.state='saved';file.bytes=Number(response.headers.get('X-Offline-Bytes'))||file.bytes;file.error='';}
    else if(file.state==='saved') {file.state='pending';file.bytes=0;}
  }
  return snapshot();
}
function fail(message, retryable=false) {const e=new Error(message);e.retryable=retryable;return e;}
async function download(file) {
  for(let attempt=1;attempt<=2;attempt++) {
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),15000);
    file.stage='request';file.state='downloading';file.attempt=attempt;file.error='';file.startedAt=Date.now();notify();
    try {
      const response=await fetch(new Request(file.path,{cache:'reload',credentials:'same-origin',signal:controller.signal}));
      file.http=response.status;file.mime=(response.headers.get('content-type')||'unknown').split(';')[0];file.redirected=response.redirected;
      if(!response.ok) throw fail('HTTP '+response.status+(response.status===401||response.status===403?' — sign in again in Safari':'') ,response.status>=500||response.status===429);
      if(new URL(response.url).origin!==self.location.origin) throw fail('Redirected outside the app — sign in again in Safari');
      file.stage='reading';
      const bytes=await response.arrayBuffer();
      if(file.path==='/') {
        const html=new TextDecoder().decode(bytes);
        if(!file.mime.includes('text/html')||!html.includes('id="offline-panel"')||!html.includes('id="app"')) throw fail('Received a sign-in or unexpected page instead of the lesson');
      } else if((file.path.endsWith('.js')&&!/javascript/.test(file.mime)) ||
        (file.path.endsWith('.css')&&file.mime!=='text/css') ||
        (file.path.endsWith('.png')&&!file.mime.startsWith('image/')) ||
        (file.path.endsWith('.webmanifest')&&!/json|manifest/.test(file.mime))) {
        throw fail('Unexpected content type: '+file.mime);
      }
      const headers=new Headers(response.headers);
      headers.set('X-Offline-Bytes',String(bytes.byteLength));
      headers.delete('content-encoding');headers.delete('content-length');
      // Reconstruct to avoid retaining redirect flags on cached navigation responses.
      const cache=await caches.open(CACHE);
      file.stage='saving';
      await cache.put(file.path,new Response(bytes,{status:200,headers}));
      file.bytes=bytes.byteLength;file.stage='complete';file.state='saved';file.error='';file.durationMs=Date.now()-file.startedAt;
      notify();return;
    } catch(error) {
      const timedOut=error.name==='AbortError';
      file.error=timedOut?'Request timed out after 15 seconds':error.name==='QuotaExceededError'?'Not enough website storage':error instanceof TypeError?(file.stage==='saving'?'Could not save file: '+error.message:'Network request failed: '+error.message):error.message;
      file.state='error';file.durationMs=Date.now()-file.startedAt;notify();
      if(attempt===2||(!timedOut&&!(error instanceof TypeError)&&!error.retryable))return;
    } finally {clearTimeout(timeout);}
  }
}
async function preparePack() {
  await inspect();running=true;started=Date.now();finished=0;notify();
  const heartbeat=setInterval(notify,2000);
  try {
    const missing=files.filter(f=>f.state!=='saved');let next=0;
    // Limit concurrent requests on mobile. Keep every successful file for Retry.
    async function lane(){while(next<missing.length)await download(missing[next++]);}
    await Promise.all([lane(),lane()]);
    await inspect();
    if(snapshot().ready) {
      for(const name of await caches.keys())if(name.startsWith('bonjour-angers-offline-')&&name!==CACHE)await caches.delete(name);
    }
  } finally {clearInterval(heartbeat);running=false;finished=Date.now();notify();}
  return snapshot();
}
function ensurePack(){if(!job)job=preparePack().finally(()=>{job=null;});return job;}
self.addEventListener('message',event=>{
  const port=event.ports[0];if(!port)return;
  const type=event.data?.type;
  if(!['CHECK_OFFLINE','GET_OFFLINE_STATUS','REPAIR_OFFLINE'].includes(type))return;
  event.waitUntil((async()=>{
    if(type==='REPAIR_OFFLINE'&&event.data.progress)listeners.add(port);
    try {
      const result=type==='REPAIR_OFFLINE'?await ensurePack():await inspect();
      port.postMessage({type:'OFFLINE_RESULT',...result});
    }catch(error){port.postMessage({type:'OFFLINE_RESULT',...snapshot(),ready:false,error:error.name==='QuotaExceededError'?'Not enough website storage':error.message});}
    finally{listeners.delete(port);}
  })());
});
async function saved(path) {
  const current=await (await caches.open(CACHE)).match(path);
  if(current)return current;
  // Keep a previous working pack usable if an update is interrupted.
  for(const name of (await caches.keys()).reverse()) {
    if(name.startsWith('bonjour-angers-offline-')&&name!==CACHE) {
      const old=await (await caches.open(name)).match(path);
      if(old)return old;
    }
  }
}
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
  if(event.request.mode==='navigate'&&(url.pathname==='/'||url.pathname==='/index.html')) {
    event.respondWith((async()=>{
      const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),8000);
      try {
        // Online reloads must be able to pick up the new diagnostic UI.
        const response=await fetch(event.request,{signal:controller.signal});
        if(response.ok||response.status===401||response.status===403)return response;
        return (await saved('/'))||(await saved('/index.html'))||response;
      }catch(error){const cached=(await saved('/'))||(await saved('/index.html'));if(cached)return cached;throw error;}
      finally{clearTimeout(timer);}
    })());
  }else if(CORE.includes(url.pathname)) {
    event.respondWith((async()=>{
      const current=await (await caches.open(CACHE)).match(url.pathname);
      if(current)return current;
      try{return await fetch(event.request);}catch(error){const cached=await saved(url.pathname);if(cached)return cached;throw error;}
    })());
  }
});
