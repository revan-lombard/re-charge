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

/* "Watch it work": drag the line across the inbox to see it sorted.
   --pos (0 to 100%) is how much of the "after" shows, from the left. A mouse moves it straight away;
   a finger moves it once the drag is clearly sideways (so scrolling the page past it still works),
   and a tap jumps it there. Keys: arrows, Page Up/Down, Home and End. Fires "cmp:move" for the counts below. */
(function () {
  'use strict';
  var still = matchMedia('(prefers-reduced-motion: reduce)');
  document.querySelectorAll('[data-cmp]').forEach(function (box) {
    var frame = box.querySelector('.hp-cmp__frame'), knob = box.querySelector('.hp-cmp__knob');
    if (!frame || !knob) return;
    var pos = 0, used = false, drag = null, easeT = 0;
    var set = function (p, byUser) {
      pos = Math.max(0, Math.min(100, p));
      box.style.setProperty('--pos', pos + '%');
      var n = Math.round(pos);
      knob.setAttribute('aria-valuenow', String(n));
      knob.setAttribute('aria-valuetext', n <= 2 ? 'Before: nothing sorted' : n >= 98 ? 'After: every email sorted' : n + '% sorted');
      if (byUser) { used = true; box.classList.add('is-used'); box.dispatchEvent(new CustomEvent('cmp:move', { detail: pos })); }
    };
    var ease = function (on) { clearTimeout(easeT); box.classList.toggle('is-ease', on && !still.matches); if (on) easeT = setTimeout(function () { box.classList.remove('is-ease'); }, 500); };
    var at = function (x) { var r = frame.getBoundingClientRect(); return r.width ? (x - r.left) / r.width * 100 : pos; };
    frame.addEventListener('pointerdown', function (e) {
      if (e.button > 0) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, on: e.pointerType === 'mouse', touch: e.pointerType !== 'mouse' };
      if (drag.on) { e.preventDefault(); ease(false); box.classList.add('is-dragging'); try { frame.setPointerCapture(e.pointerId); } catch (err) { /* fine */ } set(at(e.clientX), true); }
    });
    frame.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.on) {
        var dx = Math.abs(e.clientX - drag.x), dy = Math.abs(e.clientY - drag.y);
        if (dx > 6 && dx > dy) { drag.on = true; ease(false); box.classList.add('is-dragging'); try { frame.setPointerCapture(e.pointerId); } catch (err) { /* fine */ } }
        else return;
      }
      set(at(e.clientX), true);
    });
    var end = function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      // a finger that tapped without dragging: glide the line to where it tapped
      if (e.type === 'pointerup' && drag.touch && !drag.on && Math.abs(e.clientX - drag.x) < 8 && Math.abs(e.clientY - drag.y) < 8) { ease(true); set(at(e.clientX), true); }
      drag = null; box.classList.remove('is-dragging');
    };
    frame.addEventListener('pointerup', end);
    frame.addEventListener('pointercancel', end);
    knob.addEventListener('keydown', function (e) {
      var k = e.key, n = k === 'ArrowRight' || k === 'ArrowUp' ? pos + 10 : k === 'ArrowLeft' || k === 'ArrowDown' ? pos - 10 : k === 'PageUp' ? pos + 25 : k === 'PageDown' ? pos - 25 : k === 'Home' ? 0 : k === 'End' ? 100 : null;
      if (n === null) return;
      e.preventDefault(); ease(true); set(n, true);
    });
    set(0, false);
    // The first time it's mostly on screen, nudge the line once so it's clear it moves (not with reduced motion)
    if (!('IntersectionObserver' in window) || still.matches) return;
    var io = new IntersectionObserver(function (es) {
      if (!es[0].isIntersecting) return;
      io.disconnect();
      setTimeout(function () {
        if (used) return;
        box.classList.add('is-ease'); set(16, false);
        setTimeout(function () { if (!used) set(0, false); setTimeout(function () { if (!drag) box.classList.remove('is-ease'); }, 500); }, 800);
      }, 600);
    }, { threshold: 0.6 });
    io.observe(frame);
  });
})();

/* Scroll depth: which homepage screens people actually reach.
   Each screen counts once per visit, the first time most of it is on screen,
   as home-screen-01-top … home-screen-08-ask, plus home-screen-09-footer.
   The Watch-it-work slider counts home-cmp-used (first move) and home-cmp-after (moved most of the way).
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
  document.querySelectorAll('[data-cmp]').forEach(function (box) {
    box.addEventListener('cmp:move', function (e) { send('home-cmp-used'); if (e.detail >= 85) send('home-cmp-after'); });
  });
})();
