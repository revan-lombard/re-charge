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
