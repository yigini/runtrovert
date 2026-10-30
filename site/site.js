// Loops load near the screen and play only on it. Lines rotate in the app's own voice (src/lines.ts,
// src/i18n/voice/en.ts). People who asked for less motion get still posters and one line each;
// anyone else can stop both with the Pause motion button.
(function () {
  var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var wide = window.matchMedia('(min-aspect-ratio: 1/1)');
  var videos = Array.prototype.slice.call(document.querySelectorAll('video[data-loop]'));
  var chapters = document.querySelectorAll('.ch');

  // Posters are plain <img>s (lazy, sized per screen). A loop is fetched only when its
  // chapter comes near: 1080p widescreen on landscape screens, the 9:16 app loop on phones.
  function load(v) {
    var src = wide.matches ? v.dataset.wide : v.dataset.tall;
    if (v.dataset.src === src) return;
    v.dataset.src = src;
    v.src = src;
    v.addEventListener('playing', function () { v.classList.add('on'); }, { once: true });
  }
  function play(v) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }

  // The Pause button stops loops and rotating lines for this visitor and is remembered here.
  var paused = false;
  try { paused = localStorage.getItem('motion') === 'off'; } catch (e) {}
  var visible = [];
  var root = document.documentElement;
  if (!still && !paused) root.classList.add('rv');

  // Each chapter's text settles in once, the first time the chapter comes on screen.
  if ('IntersectionObserver' in window) {
    var arrive = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('seen'); arrive.unobserve(e.target); } });
    }, { threshold: 0.2 });
    Array.prototype.forEach.call(chapters, function (c, i) { if (i === 0) c.classList.add('seen'); else arrive.observe(c); });
  } else Array.prototype.forEach.call(chapters, function (c) { c.classList.add('seen'); });

  if (!still && 'IntersectionObserver' in window) {
    var near = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { load(e.target); near.unobserve(e.target); } });
    }, { rootMargin: '50% 0px' });
    var seen = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var i = visible.indexOf(e.target);
        if (e.isIntersecting) { if (i < 0) visible.push(e.target); load(e.target); if (!paused) play(e.target); }
        else { if (i >= 0) visible.splice(i, 1); e.target.pause(); }
      });
    }, { threshold: 0.1 });
    // The hero's poster paints first; its loop starts once the page has loaded.
    window.addEventListener('load', function () {
      videos.forEach(function (v) { near.observe(v); seen.observe(v); });
    });
    // Turning the phone swaps tall and wide loops. Only loops on screen reload now; the rest
    // drop their file and load again when their chapter comes near, so nothing plays unseen.
    wide.addEventListener('change', function () {
      videos.forEach(function (v) {
        if (!v.dataset.src) return;
        v.classList.remove('on');
        if (visible.indexOf(v) >= 0) { load(v); if (!paused) play(v); return; }
        v.pause();
        delete v.dataset.src;
        v.removeAttribute('src');
        v.load();
        near.observe(v);
      });
    });
  }
  if ('IntersectionObserver' in window) {
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

  // Small things for whoever looks closely. None of them is stored or sent anywhere.
  var ticker = document.getElementById('ticker'), h = new Date().getHours();
  var hour = h >= 22 || h < 5 ? 'Late one. Tomorrow’s run can wait for tomorrow.'
    : h < 7 ? 'Up early. The streets are still yours.' : null;
  if (hour && ticker) ticker.textContent = hour;

  var fewer = document.getElementById('fewer'), nudge = document.getElementById('nudge');
  if (fewer) fewer.addEventListener('click', function () {
    nudge.textContent = 'Fewer it is. See you in a few days.';
    nudge.style.opacity = 1;
    fewer.textContent = 'Noted';
    fewer.disabled = true;
  });

  var title = document.title;
  document.addEventListener('visibilitychange', function () {
    document.title = document.hidden ? 'Out for a run · Runtrovert' : title;
  });

  var whisper = document.getElementById('whisper'), idle, said = 0;
  var whispers = ['Nobody’s rushing you.', 'Still here? Same. Take your time.'];
  function rest() {
    clearTimeout(idle);
    if (said < whispers.length) idle = setTimeout(function () {
      whisper.textContent = whispers[said++];
      whisper.classList.add('on');
      setTimeout(function () { whisper.classList.remove('on'); }, 6000);
    }, 40000);
  }
  if (whisper) {
    ['scroll', 'pointerdown', 'keydown', 'mousemove'].forEach(function (t) { window.addEventListener(t, rest, { passive: true }); });
    rest();
  }

  if (window.console) console.log('%cNo trackers in here. Just this note, and nobody will know you read it.', 'font: italic 14px Georgia, serif; color: #c9e7d6');

  if (still) return;
  var toggle = document.getElementById('motion');
  function setPaused(p) {
    paused = p;
    try { localStorage.setItem('motion', p ? 'off' : 'on'); } catch (e) {}
    toggle.setAttribute('aria-pressed', String(p));
    toggle.querySelector('.lbl').textContent = p ? 'Play motion' : 'Pause motion';
    visible.forEach(function (v) { if (p) v.pause(); else play(v); });
    root.classList.toggle('rv', !p);
  }
  if (toggle) {
    toggle.hidden = false;
    toggle.addEventListener('click', function () { setPaused(!paused); });
    if (paused) setPaused(true);
  }

  function rotate(el, lines, ms) {
    if (!el) return {};
    var i = 0, stop = false;
    setInterval(function () {
      if (paused || stop) return;
      el.style.opacity = 0;
      setTimeout(function () { if (!stop) { i = (i + 1) % lines.length; el.textContent = lines[i]; } el.style.opacity = 1; }, 600);
    }, ms);
    return { stop: function () { stop = true; } };
  }
  var shares = [
    'New 5 km best. Nobody saw. That was the plan.',
    'Run number one. Nobody watched, which helped.',
    'Longest run yet. Didn’t need anyone to clap.',
    'Slowest run this month. Best mood after.',
    'Ran between storms. The sky held off. Mostly.'
  ];
  if (hour !== null) shares.unshift(hour);
  rotate(document.getElementById('ticker'), shares, 4200);
  var nudges = rotate(document.getElementById('nudge'), [
    'The pavement has no opinions about your pace.',
    'Out there, nobody needs anything from you.',
    'A run is a meeting with one attendee. Attendance is great.',
    'The quiet streets are quietest right now. Take the hint.',
    'The only group run that works: you, and your shadow at a distance.'
  ], 3800);
  if (fewer) fewer.addEventListener('click', function () { if (nudges.stop) nudges.stop(); });
})();
