(() => {
  const panel = document.querySelector('#offline-panel');
  const label = document.querySelector('#offline-status');
  const retry = document.querySelector('#offline-retry');
  const refresh = document.querySelector('#offline-refresh');
  let ready = false, checking = false, hadController = !!navigator.serviceWorker?.controller;
  function status() {
    label.textContent = ready
      ? (navigator.onLine ? 'Ready for offline practice' : 'Offline · lessons ready')
      : (navigator.onLine ? 'Preparing offline lessons…' : 'Offline copy not ready — connect to Wi-Fi');
    panel.dataset.ready = ready;
  }
  function check(worker, repair = false) {
    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const timeout = setTimeout(() => {channel.port1.close(); reject(new Error('Offline check timed out'));}, repair ? 60000 : 10000);
      channel.port1.onmessage = event => {clearTimeout(timeout); channel.port1.close(); resolve(event.data.ready === true);};
      worker.postMessage({type: repair ? 'REPAIR_OFFLINE' : 'CHECK_OFFLINE'}, [channel.port2]);
    });
  }
  async function prepare() {
    if (checking) return;
    checking = true;
    retry.hidden = true;
    status();
    try {
      if (!('serviceWorker' in navigator) || !window.isSecureContext) throw new Error('Offline mode needs a secure, supported browser');
      const registration = await navigator.serviceWorker.register('/sw.js', {updateViaCache: 'none'});
      if (navigator.onLine) registration.update().catch(() => {});
      const registrationReady = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Offline preparation did not finish')), 25000))
      ]);
      ready = await check(registrationReady.active);
      if (!ready && navigator.onLine) ready = await check(registrationReady.active, true);
      if (!ready) throw new Error('Incomplete offline download');
      status();
    } catch {
      label.textContent = ready ? 'Offline copy saved · update unavailable' : 'Offline setup incomplete — reconnect and retry';
      retry.hidden = false;
    } finally {checking = false;}
  }
  retry.onclick = prepare;
  refresh.onclick = () => location.reload();
  addEventListener('online', () => {status(); prepare();});
  addEventListener('offline', status);
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('controllerchange', async () => {
    try {ready = await check(navigator.serviceWorker.controller); status();} catch {ready = false; status();}
    if (hadController) refresh.hidden = false;
    hadController = true;
  });
  let installPrompt;
  const install = document.querySelector('#install-app');
  addEventListener('beforeinstallprompt', event => {event.preventDefault(); installPrompt = event; install.hidden = false;});
  install.onclick = async () => {if (installPrompt) {await installPrompt.prompt(); installPrompt = null; install.hidden = true;}};
  addEventListener('appinstalled', () => {install.hidden = true;});
  if (navigator.standalone || matchMedia('(display-mode: standalone)').matches) {
    document.querySelector('#installed-note').hidden = false;
  }
  prepare();
})();
