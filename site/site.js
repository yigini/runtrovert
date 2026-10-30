// Loops play only while on screen. Lines rotate in the app's own voice (src/lines.ts,
// src/i18n/voice/en.ts). People who asked for less motion get still posters and one line each.
(function () {
  var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var videos = document.querySelectorAll('video[data-loop]');
  var chapters = document.querySelectorAll('.ch');

  if (still) videos.forEach(function (v) { v.removeAttribute('autoplay'); v.pause(); });

  if ('IntersectionObserver' in window) {
    if (!still) {
      var seen = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { var p = e.target.play(); if (p && p.catch) p.catch(function () {}); }
          else e.target.pause();
        });
      }, { threshold: 0.1 });
      videos.forEach(function (v) { seen.observe(v); });
    }

    var n = document.getElementById('rail-n'), name = document.getElementById('rail-name'), bar = document.getElementById('rail-bar');
    var at = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var i = Array.prototype.indexOf.call(chapters, e.target);
        n.textContent = String(i + 1).padStart(2, '0');
        name.textContent = e.target.getAttribute('data-name');
        bar.style.width = ((i + 1) / chapters.length * 100) + '%';
      });
    }, { threshold: 0.55 });
    chapters.forEach(function (c) { at.observe(c); });
  }

  if (still) return;
  function rotate(el, lines, ms) {
    if (!el) return;
    var i = 0;
    setInterval(function () {
      el.style.opacity = 0;
      setTimeout(function () { i = (i + 1) % lines.length; el.textContent = lines[i]; el.style.opacity = 1; }, 600);
    }, ms);
  }
  rotate(document.getElementById('ticker'), [
    'New 5 km best. Nobody saw. That was the plan.',
    'Run number one. Nobody watched, which helped.',
    'Longest run yet. Didn’t need anyone to clap.',
    'Slowest run this month. Best mood after.',
    'Ran between storms. The sky held off. Mostly.'
  ], 4200);
  rotate(document.getElementById('nudge'), [
    'The pavement has no opinions about your pace.',
    'Out there, nobody needs anything from you.',
    'A run is a meeting with one attendee. Attendance is great.',
    'The quiet streets are quietest right now. Take the hint.',
    'The only group run that works: you, and your shadow at a distance.'
  ], 3800);
})();
