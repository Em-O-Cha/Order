// Service worker ที่ไม่ทำ cache อะไรเลย มีไว้แค่ให้เบราว์เซอร์เห็นว่าเว็บนี้ "ติดตั้งเป็นแอปได้" (PWA)
// เจตนาไม่ cache เพราะข้อมูลลูกค้า/ดีล/สถานะต้องเป็นข้อมูลสดจาก Apps Script เสมอ ไม่ใช่ของเก่าที่ค้างไว้
self.addEventListener('install', function (e) {
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  self.clients.claim();
});

self.addEventListener('fetch', function (e) {
  e.respondWith(fetch(e.request));
});
