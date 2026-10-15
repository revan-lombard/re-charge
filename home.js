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
