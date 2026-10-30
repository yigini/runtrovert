// Loops play only while on screen, and not at all for people who asked for less motion.
(function () {
  var videos = document.querySelectorAll('video[data-loop]');
  var still = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (still.matches || !('IntersectionObserver' in window)) return;
  var seen = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { var p = e.target.play(); if (p && p.catch) p.catch(function () {}); }
      else e.target.pause();
    });
  }, { threshold: 0.15 });
  videos.forEach(function (v) { seen.observe(v); });
})();
