(() => {
  const BUILD='v8-finnish-memory';
  const panel=document.querySelector('#offline-panel');
  const label=document.querySelector('#offline-status');
  const retry=document.querySelector('#offline-retry');
  const refresh=document.querySelector('#offline-refresh');
  const bar=document.querySelector('#offline-progress');
  const progressText=document.querySelector('#offline-progress-text');
  const detail=document.querySelector('#offline-debug');
  const report=document.querySelector('#offline-debug-report');
  const fileList=document.querySelector('#offline-files');
  const copy=document.querySelector('#offline-copy');
  let checking=false,ready=false,last=null,registration=null,lastError='',phase='Starting',storage='Not checked';
  let hadController=!!navigator.serviceWorker?.controller;
  const events=[];
  function safe(value) {
    return String(value||'').replace(/https?:\/\/[^\s)]+/g,url=>{try{const u=new URL(url);return u.origin+u.pathname;}catch{return '[URL]';}}).slice(0,500);
  }
  function note(message){events.push(new Date().toISOString().slice(11,19)+' '+safe(message));if(events.length>18)events.shift();}
  function reportText() {
    const standalone=!!navigator.standalone||matchMedia('(display-mode: standalone)').matches;
    return ['Bonjour Angers offline diagnostics',
      'UI: '+BUILD+' | worker: '+(last?.version||'not connected'),
      'Phase: '+phase,
      'Connection: '+(navigator.onLine?'online (browser estimate)':'offline'),
      'Secure context: '+window.isSecureContext+' | service workers: '+('serviceWorker' in navigator),
      'Mode: '+(standalone?'Home Screen app':'browser'),
      'Worker state: active='+(registration?.active?.state||'none')+', installing='+(registration?.installing?.state||'none')+', waiting='+(registration?.waiting?.state||'none'),
      'Saved: '+(last?.completed||0)+'/'+(last?.total||'?')+' files | '+Math.round((last?.bytes||0)/1024)+' KB',
      'Elapsed: '+Math.round((last?.elapsedMs||0)/1000)+'s | storage: '+storage,
      'Last error: '+(lastError||'none'),
      '',...(last?.files||[]).map(f=>f.path+' — '+f.state+(f.stage?' ('+f.stage+')':'')+(f.http?' | HTTP '+f.http:'')+(f.mime?' | '+f.mime:'')+(f.redirected?' | same-origin redirect':'')+(f.attempt?' | attempt '+f.attempt:'')+(f.durationMs?' | '+Math.round(f.durationMs/1000)+'s':'')+(f.error?' | '+safe(f.error):'')),
      '',...events].join('\n');
  }
  function debug(){report.textContent=reportText();}
  function render(data) {
    if(data){last=data;ready=!!data.ready;}
    panel.dataset.ready=ready;
    const running=last?.running||checking;
    const completed=last?.completed||0,total=last?.total||0;
    if(total){bar.max=total;bar.value=completed;}else{bar.removeAttribute('value');}
    bar.setAttribute('aria-valuetext',total?completed+' of '+total+' files saved':'Connecting to offline storage');
    const failures=(last?.files||[]).filter(f=>f.state==='error');
    const active=(last?.files||[]).filter(f=>f.state==='downloading');
    if(ready){label.textContent=navigator.onLine?'Ready for offline practice':'Offline · lessons ready';}
    else if(failures.length&&!running){label.textContent='Offline setup paused — '+failures.length+' '+(failures.length===1?'file needs':'files need')+' attention';}
    else if(running){label.textContent=total?'Downloading offline lessons…':'Connecting to offline storage…';}
    else{label.textContent=navigator.onLine?'Offline setup needs attention':'Offline copy incomplete — reconnect to continue';}
    progressText.textContent=total?`${completed} of ${total} files saved · ${Math.round((last?.bytes||0)/1024)} KB${last?.elapsedMs?' · '+Math.round(last.elapsedMs/1000)+'s':''}`:phase;
    if(active.length)progressText.textContent+=' · '+active.map(f=>f.path==='/'?'lesson page':f.path).join(', ');
    fileList.replaceChildren();
    for(const f of failures){const li=document.createElement('li');li.textContent=f.path+': '+safe(f.error);fileList.append(li);}
    retry.hidden=running||ready;
    retry.textContent=completed?'Retry missing files':'Retry download';
    if(failures.length&&!running){detail.open=true;document.querySelector('#offline-tools').open=true;document.querySelector('#app-tools').open=true;}
    debug();
  }
  function workerRequest(worker,type,progress=false) {
    return new Promise((resolve,reject)=>{
      const channel=new MessageChannel();let timeout;
      function stop(){clearTimeout(timeout);channel.port1.close();}
      function watchdog(){clearTimeout(timeout);timeout=setTimeout(()=>{stop();reject(new Error('Offline worker stopped responding. Keep this app open and tap Retry.'));},progress?30000:10000);}
      channel.port1.onmessage=event=>{
        watchdog();const data=event.data;
        if(data.type==='OFFLINE_PROGRESS'){render(data);return;}
        stop();resolve(data);
      };
      watchdog();
      try{worker.postMessage({type,progress},[channel.port2]);}catch(error){stop();reject(error);}
    });
  }
  function deadline(promise,ms,message) {
    let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(message)),ms);})]).finally(()=>clearTimeout(timer));
  }
  async function activeWorker(reg) {
    if(reg.installing||reg.waiting){
      const worker=reg.installing||reg.waiting;
      if(worker.state==='activated')return worker;
      phase='Activating offline worker';debug();
      await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{worker.removeEventListener('statechange',change);reject(new Error('Offline worker activation timed out. Reload and retry.'));},20000);
        function change(){note('Worker '+worker.state);debug();if(worker.state==='activated'||worker.state==='redundant'){clearTimeout(timer);worker.removeEventListener('statechange',change);worker.state==='activated'?resolve():reject(new Error('Offline worker installation failed. Reload while signed in.'));}}
        worker.addEventListener('statechange',change);change();
      });
      return worker;
    }
    if(reg.active)return reg.active;
    return (await deadline(navigator.serviceWorker.ready,20000,'No active offline worker. Reload while signed in.')).active;
  }
  async function prepare() {
    if(checking)return;
    checking=true;lastError='';phase='Registering offline worker';note('Setup started');render();
    try {
      if(!('serviceWorker' in navigator)||!window.isSecureContext)throw new Error('Offline setup needs Safari over HTTPS.');
      registration=await deadline(navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}),20000,'Worker registration timed out — reload while online.');
      if(navigator.onLine&&registration.active&&!registration.installing){
        phase='Checking offline worker update';render();
        try{await deadline(registration.update(),15000,'Worker update check timed out');}catch(error){note('Update check: '+error.message);}
      }
      const worker=await activeWorker(registration);
      phase='Checking saved files';note('Worker activated');render();
      let data=await workerRequest(worker,'GET_OFFLINE_STATUS');
      if(data.protocol!==3||data.version!==BUILD){data.ready=false;render(data);throw new Error('An older offline worker is active. Reload once to finish the update.');}
      render(data);
      if(!data.ready&&navigator.onLine){
        phase='Downloading missing files';note('Download requested');render();
        data=await workerRequest(worker,'REPAIR_OFFLINE',true);render(data);
      }
      if(data.error)throw new Error(data.error);
      phase=data.ready?'Complete':'Paused';
      if(!data.ready){
        lastError=(data.files||[]).filter(f=>f.state==='error').map(f=>f.path+': '+f.error).join('; ')||'Some files are not saved yet. Reconnect and retry.';
        note(lastError);
      }else{note('All '+data.total+' files verified in offline storage');}
      if(navigator.storage?.estimate) {
        const estimate=await navigator.storage.estimate();
        storage=Math.round((estimate.usage||0)/1024)+' KB used / '+Math.round((estimate.quota||0)/1024/1024)+' MB quota';
      }
    }catch(error){lastError=safe(error.message||error.name);phase='Setup error';note(lastError);detail.open=true;document.querySelector('#offline-tools').open=true;document.querySelector('#app-tools').open=true;}
    finally{checking=false;if(last)last.running=false;render();}
  }
  retry.onclick=prepare;
  refresh.onclick=()=>location.reload();
  document.querySelector('#offline-recheck').onclick=prepare;
  copy.onclick=async()=>{
    const text=reportText();
    try{await navigator.clipboard.writeText(text);copy.textContent='Debug info copied';}
    catch{const selection=getSelection();const range=document.createRange();range.selectNodeContents(report);selection.removeAllRanges();selection.addRange(range);copy.textContent='Select and copy the debug text below';}
  };
  addEventListener('online',()=>{note('Connection online');render();prepare();});
  addEventListener('offline',()=>{note('Connection offline');render();});
  addEventListener('pageshow',()=>{if(!checking)prepare();});
  if('serviceWorker' in navigator)navigator.serviceWorker.addEventListener('controllerchange',()=>{
    note('New offline worker took control');
    if(hadController)refresh.hidden=false;
    hadController=true;
    if(!checking)prepare();
  });
  let installPrompt;const install=document.querySelector('#install-app');
  addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;install.hidden=false;});
  install.onclick=async()=>{if(installPrompt){await installPrompt.prompt();installPrompt=null;install.hidden=true;}};
  addEventListener('appinstalled',()=>{install.hidden=true;});
  if(navigator.standalone||matchMedia('(display-mode: standalone)').matches)document.querySelector('#installed-note').hidden=false;
  prepare();
})();
