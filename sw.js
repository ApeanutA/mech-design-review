/* Service Worker：把图片、KaTeX 字体、数据文件缓存到本地。
 *
 * 为什么要有它：GitHub Pages 的 TTFB 要 2~3 秒，例题原图每题一张、
 * 打开一道多页题就是连续吃几次 TTFB。缓存之后第二次起是本地读，
 * 不再受网络影响；图片本体一个字节都没改。
 *
 * 更新规则：改了 img/ 或 data/ 里的东西，把 VERSION 加一，
 * 旧缓存会在 activate 时自动删掉，不会留下过期图片。
 */
var VERSION = "b4a926f4b2";
var CACHE = "mechdesign-" + VERSION;

/* 预缓存：进站就把这些拿下来，之后浏览全靠本地 */
var PRECACHE = [
  "./",
  "index.html",
  "assets/app.css",
  "assets/app.js",
  "assets/katex/katex.min.css",
  "assets/katex/katex.min.js",
  "data/questions.js",
  "data/examples.js",
  "data/notes.js",
  "data/exnote.js"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      /* 单个失败不拖垮整体安装 */
      return Promise.all(PRECACHE.map(function (u) {
        return c.add(new Request(u, { cache: "reload" })).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;

  var url = new URL(req.url);
  if (url.origin !== location.origin) return;

  var p = url.pathname;
  var isImg = /\/img\//.test(p);
  var isFont = /\/katex\/fonts\//.test(p);
  var isData = /\/data\//.test(p);

  /* 图片与字体：缓存优先，一次下载永久复用（版本号变了才失效） */
  if (isImg || isFont) {
    e.respondWith(
      caches.match(req, { ignoreSearch: true }).then(function (hit) {
        if (hit) return hit;
        return fetch(req).then(function (res) {
          if (res && res.ok) {
            var copy = res.clone();
            caches.open(CACHE).then(function (c) { c.put(req, copy); });
          }
          return res;
        });
      })
    );
    return;
  }

  /* 数据文件：缓存优先。
     安全性由 VERSION 保证——tools/pack_data.py 每次打包都会按数据内容算出新指纹
     写进下面的 VERSION，只要数据变了版本号就变、旧缓存整体作废，
     所以这里缓存优先不会让用户看到过期题目。 */
  if (isData) {
    e.respondWith(
      caches.match(req).then(function (hit) {
        if (hit) return hit;
        return fetch(req).then(function (res) {
          if (res && res.ok) {
            var copy = res.clone();
            caches.open(CACHE).then(function (c) { c.put(req, copy); });
          }
          return res;
        });
      })
    );
    return;
  }

  /* 其余（html/css/js）：网络优先，断网时回退到缓存 */
  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) { return hit || Response.error(); });
    })
  );
});
