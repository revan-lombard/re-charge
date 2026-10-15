/* Homepage image motion: each [data-anim] image gets .is-in when it scrolls into view.
   The CSS (home.css) does the rest; with reduced motion the images simply show. */
(function () {
  'use strict';
  var els = document.querySelectorAll('[data-anim]');
  if (!els.length) return;
  document.documentElement.classList.add('hp-anim');
  if (!('IntersectionObserver' in window)) { els.forEach(function (e) { e.classList.add('is-in'); }); return; }
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } });
  }, { threshold: 0.25 });
  els.forEach(function (e) { io.observe(e); });
})();

/* "Watch it work": swipe between before, after and the result */
(function () {
  'use strict';
  document.querySelectorAll('[data-swipe]').forEach(function (box) {
    var track = box.querySelector('.hp-swipe__track'), items = box.querySelectorAll('.hp-swipe__item'), tabs = box.querySelectorAll('[data-swipe-to]');
    var at = function () { return Math.round(track.scrollLeft / track.clientWidth); };
    var go = function (i) { i = Math.max(0, Math.min(items.length - 1, i)); track.scrollTo({ left: i * track.clientWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); };
    var mark = function () { var i = at(); tabs.forEach(function (d, k) { d.classList.toggle('is-on', k === i); d.setAttribute('aria-pressed', k === i ? 'true' : 'false'); }); box.querySelector('[data-swipe-prev]').disabled = i === 0; box.querySelector('[data-swipe-next]').disabled = i === items.length - 1; };
    box.querySelector('[data-swipe-prev]').addEventListener('click', function () { go(at() - 1); });
    box.querySelector('[data-swipe-next]').addEventListener('click', function () { go(at() + 1); });
    tabs.forEach(function (d) { d.addEventListener('click', function () { go(+d.getAttribute('data-swipe-to')); }); });
    track.addEventListener('scroll', function () { window.requestAnimationFrame(mark); }, { passive: true });
    track.addEventListener('keydown', function (e) { if (e.key === 'ArrowRight') { e.preventDefault(); go(at() + 1); } if (e.key === 'ArrowLeft') { e.preventDefault(); go(at() - 1); } });
    track.tabIndex = 0; mark();
  });
})();

/* Scroll depth: which homepage screens people actually reach.
   Each screen counts once per visit, the first time most of it is on screen,
   as home-screen-01-top … home-screen-08-ask, plus home-screen-09-footer.
   The Watch-it-work tabs count home-swipe-after and home-swipe-result.
   Sent through window.trackEvent, so Google Analytics only gets them with
   consent; GoatCounter is cookieless. */
(function () {
  'use strict';
  if (!('IntersectionObserver' in window)) return;
  var slides = [].slice.call(document.querySelectorAll('.hp-slide'));
  if (!slides.length) return;
  var seen = {};
  var send = function (name) { if (seen[name]) return; seen[name] = 1; var go = function (n) { if (window.trackEvent) { try { window.trackEvent(name, { page_path: location.pathname }); } catch (e) { /* never break the page */ } } else if (n < 20) setTimeout(function () { go(n + 1); }, 250); }; go(0); };
  var label = function (el, i) { var n = String(i + 1); if (n.length < 2) n = '0' + n; return 'home-screen-' + n + '-' + (el.id || (i ? 'screen' : 'top')); };
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      var r = en.intersectionRect.height / Math.min(en.boundingClientRect.height, window.innerHeight);
      // Reaching a screen counts every screen above it too, so a fast flick past one still shows as reached.
      if (r >= 0.55) { var k = slides.indexOf(en.target); for (var j = 0; j <= k; j++) { send(slides[j].dataset.depth); io.unobserve(slides[j]); } }
    });
  }, { threshold: [0.3, 0.55, 0.8] });
  slides.forEach(function (el, i) { el.dataset.depth = label(el, i); io.observe(el); });
  var foot = document.querySelector('.footer');
  if (foot) { var fo = new IntersectionObserver(function (en) { if (en[0].isIntersecting) { slides.forEach(function (sl) { send(sl.dataset.depth); }); send('home-screen-09-footer'); fo.disconnect(); } }, { threshold: 0.2 }); fo.observe(foot); }
  document.querySelectorAll('[data-swipe-to]').forEach(function (b) {
    b.addEventListener('click', function () { var k = +b.getAttribute('data-swipe-to'); if (k === 1) send('home-swipe-after'); if (k === 2) send('home-swipe-result'); });
  });
  var track = document.querySelector('.hp-swipe__track');
  if (track) track.addEventListener('scroll', function () { var k = Math.round(track.scrollLeft / track.clientWidth); if (k === 1) send('home-swipe-after'); if (k === 2) send('home-swipe-result'); }, { passive: true });
})();
