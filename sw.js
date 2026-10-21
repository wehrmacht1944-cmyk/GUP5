/* 離線快取 Service Worker：第一次連網開啟時把所有檔案存到平板/手機，之後斷網也能使用 */
const CACHE = 'senshado-gacha-v1';   // 更新檔案後請把版本號 +1，裝置才會重新下載
const ASSETS = [
    './',
    'index.html',
    'manifest.webmanifest',
    'assets/media/1223.jpg',
    'assets/media/bgm_stage.mp3',
    'assets/media/cannon_fire.wav',
    'assets/media/tank_flag_speed_only.mp4',
    'assets/icons/icon-180.png',
    'assets/icons/icon-192.png',
    'assets/icons/icon-512.png',
    'assets/fonts/NotoSansTC-400.woff',
    'assets/fonts/NotoSansTC-700.woff',
    'assets/fonts/NotoSansTC-900.woff',
    'assets/fonts/NotoSerifTC-900.woff',
    'assets/css/app.css',
    'assets/css/fonts.css',
    'assets/js/local-db.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// iPhone / iPad 播放影音時會用 Range 分段請求，需從快取切出對應片段回傳 (206)
async function rangeResponse(request, cached) {
  const range = request.headers.get('range');
  const m = /bytes=(\d*)-(\d*)/.exec(range || '');
  const buf = await cached.arrayBuffer();
  const size = buf.byteLength;
  let start = m && m[1] ? parseInt(m[1], 10) : 0;
  let end = m && m[2] ? parseInt(m[2], 10) : size - 1;
  if (!m || !m[1]) { if (m && m[2]) { start = Math.max(0, size - parseInt(m[2], 10)); end = size - 1; } }
  end = Math.min(end, size - 1);
  if (start > end || start >= size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': cached.headers.get('Content-Type') || 'application/octet-stream',
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes'
    }
  });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) return req.headers.has('range') ? rangeResponse(req, cached) : cached;
    try {
      return await fetch(req);
    } catch (err) {
      if (req.mode === 'navigate') return caches.match('index.html');
      throw err;
    }
  })());
});
