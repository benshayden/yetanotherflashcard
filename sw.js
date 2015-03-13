// cache decks, plugins
// cache db
// allow index.js to avoid localstorage, always xhr to /db
// index.js xhr /db
// sw.js intercepts, tries to fetch journal to sync with {method:'POST', credentials: 'include'}
// if sw.js can't connect to server, then it merges journal with synced and returns that.


// https://github.com/GoogleChrome/samples/tree/gh-pages/service-worker
// https://fetch.spec.whatwg.org/
// chrome://serviceworker-internals

importScripts('serviceworker-cache-polyfill.js');

self.addEventListener('install', function(event) {
  console.log('install', event);
  event.waitUntil(
    caches.open('myapp-static-v1').then(function(cache) {
      return cache.addAll([]);
    })
  );
});

self.addEventListener('activate', function(event) {
  console.log('activate', event);
});

self.addEventListener('fetch', function(event) {
  console.log('fetch', event);
  //event.respondWith(new Response('Hello world!'));
});

// fetch(url, {credentials: 'include'})
