const CACHE='domestic-intelligence-v07-22';
const VERSION='07-22';
const versioned=path=>`${path}?v=${VERSION}`;
const SHELL=['./','./index.html',...['./theme.css','./theme-v07.css','./theme-bridge.css','./v2.css','./mobile-v03.css','./mobile-v06.css','./ui-kit.css','./atlas-v07.css','./mobile-v08.css','./editor-core.js','./property-model.js','./storage.js','./exporters.js','./ui-icons.js','./ui-kit.js','./state-guard-v04.js','./mobile-v03.js','./app-v2.js','./mobile-v05.js','./atlas-v07.js','./manifest.webmanifest'].map(versioned),'./brand-mark.svg','./icon-192.png','./icon-512.png','./icon-maskable-512.png','./vendor/pdf.min.mjs','./vendor/pdf.worker.min.mjs','./vendor/PDFJS-LICENSE'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;

  if(event.request.mode==='navigate'){
    event.respondWith(fetch(event.request).then(response=>{
      if(response.ok)caches.open(CACHE).then(cache=>cache.put('./index.html',response.clone()));
      return response;
    }).catch(()=>caches.match('./index.html')));
    return;
  }

  event.respondWith(fetch(event.request).then(response=>{
    if(response.ok&&response.type==='basic')event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,response.clone())));
    return response;
  }).catch(()=>caches.match(event.request).then(cached=>cached||new Response('',{status:503,statusText:'Offline'}))));
});
