// Only provide an offline fallback for student navigation. Never cache records,
// authentication, QR redemptions, API responses, or live standings.
const CACHE='pulse-student-offline-v1';
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.add('/student-offline.html')).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('pulse-student-offline-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||event.request.mode!=='navigate'||url.origin!==self.location.origin||!(url.pathname==='/student'||url.pathname==='/student/'||url.pathname.startsWith('/league/')))return;
  event.respondWith(fetch(event.request).catch(()=>caches.match('/student-offline.html').then(response=>response||new Response('Reconnect to view your course leagues.',{status:503,headers:{'Content-Type':'text/plain'}}))));
});
