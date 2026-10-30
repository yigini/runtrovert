// Loops load near the screen and play only on it. Lines rotate in the app's own voice (src/lines.ts,
// src/i18n/voice/en.ts). Motion stops when the device asks for less of it (read live, so turning
// the setting on mid-visit counts), when the browser asks to save data, or when the visitor presses Pause motion.
(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var wide = window.matchMedia('(min-aspect-ratio: 1/1)');
  var videos = Array.prototype.slice.call(document.querySelectorAll('video[data-loop]'));
  var chapters = document.querySelectorAll('.ch');
  var root = document.documentElement;
  var toggle = document.getElementById('motion');

  // The Pause button's choice is remembered in this browser only.
  var paused = false;
  try { paused = localStorage.getItem('motion') === 'off'; } catch (e) {}
  // Data saver on: posters only, no loops at all.
  var lean = !!(navigator.connection && navigator.connection.saveData);
  function calm() { return paused || reduce.matches || lean; }
  var visible = [];

  // Posters are plain <img>s (lazy, sized per screen). A loop is fetched only when its chapter
  // comes near and motion is on: 1080p widescreen on landscape screens, the 9:16 app loop on phones.
  function load(v) {
    if (calm()) return;
    var src = wide.matches ? v.dataset.wide : v.dataset.tall;
    if (v.dataset.src === src) return;
    v.dataset.src = src;
    // preload="none" in the HTML keeps the first paint light; once a chapter is near, fetch for real.
    v.preload = 'auto';
    v.src = src;
    v.load();
    v.addEventListener('playing', function () { v.classList.add('on'); }, { once: true });
  }
  function play(v) { if (calm()) return; load(v); var p = v.play(); if (p && p.catch) p.catch(function () {}); }

  // Pause motion, reduced motion and their way back: one place that applies whichever holds.
  function apply() {
    root.classList.toggle('rv', !calm());
    visible.forEach(function (v) { if (calm()) v.pause(); else play(v); });
    if (!toggle) return;
    toggle.hidden = reduce.matches || lean;
    toggle.classList.toggle('is-paused', paused);
    toggle.querySelector('.lbl').textContent = paused ? 'Play motion' : 'Pause motion';
  }
  if (toggle) toggle.addEventListener('click', function () {
    paused = !paused;
    try { localStorage.setItem('motion', paused ? 'off' : 'on'); } catch (e) {}
    apply();
  });
  if (reduce.addEventListener) reduce.addEventListener('change', apply);
  apply();

  // Each chapter's text settles in once, the first time any of it comes on screen. Any part
  // counts, not a share of it, so a chapter taller than the screen (zoomed in) still arrives.
  if ('IntersectionObserver' in window) {
    var arrive = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('seen'); arrive.unobserve(e.target); } });
    }, { threshold: 0, rootMargin: '0px 0px -12% 0px' });
    Array.prototype.forEach.call(chapters, function (c, i) { if (i === 0) c.classList.add('seen'); else arrive.observe(c); });
  } else Array.prototype.forEach.call(chapters, function (c) { c.classList.add('seen'); });

  if ('IntersectionObserver' in window) {
    var near = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting && !calm()) { load(e.target); near.unobserve(e.target); } });
    }, { rootMargin: '50% 0px' });
    var seen = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var i = visible.indexOf(e.target);
        if (e.isIntersecting) { if (i < 0) visible.push(e.target); play(e.target); }
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
        if (visible.indexOf(v) >= 0) { play(v); return; }
        v.pause();
        delete v.dataset.src;
        v.removeAttribute('src');
        v.load();
        near.observe(v);
      });
    });

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

  // Lines change only while motion is on, and a change already fading out is dropped if motion
  // stops in the meantime.
  function rotate(el, lines, ms) {
    if (!el) return {};
    var i = 0, stop = false;
    setInterval(function () {
      if (stop || calm()) return;
      el.style.opacity = 0;
      setTimeout(function () {
        if (!stop && !calm()) { i = (i + 1) % lines.length; el.textContent = lines[i]; }
        el.style.opacity = 1;
      }, 600);
    }, ms);
    return { stop: function () { stop = true; } };
  }

  // Small things for whoever looks closely. None of them is stored or sent anywhere.
  var ticker = document.getElementById('ticker'), h = new Date().getHours();
  var hour = h >= 22 || h < 5 ? 'Late one. Tomorrow’s run can wait for tomorrow.'
    : h < 7 ? 'Up early. The streets are still yours.' : null;
  if (hour && ticker) ticker.textContent = hour;
  var shares = [
    'New 5 km best. Nobody saw. That was the plan.',
    'Run number one. Nobody watched, which helped.',
    'Longest run yet. Didn’t need anyone to clap.',
    'Slowest run this month. Best mood after.',
    'Ran between storms. The sky held off. Mostly.'
  ];
  if (hour) shares.unshift(hour);
  rotate(ticker, shares, 4200);

  var nudge = document.getElementById('nudge');
  var nudges = rotate(nudge, [
    'The pavement has no opinions about your pace.',
    'Out there, nobody needs anything from you.',
    'A run is a meeting with one attendee. Attendance is great.',
    'The quiet streets are quietest right now. Take the hint.',
    'The only group run that works: you, and your shadow at a distance.'
  ], 3800);

  var fewer = document.getElementById('fewer'), said = document.getElementById('fewer-said');
  if (fewer) fewer.addEventListener('click', function () {
    if (fewer.getAttribute('aria-disabled') === 'true') return;
    if (nudges.stop) nudges.stop();
    nudge.textContent = 'Fewer it is. See you in a few days.';
    nudge.style.opacity = 1;
    fewer.textContent = 'Noted';
    fewer.setAttribute('aria-disabled', 'true');
    if (said) said.textContent = 'Fewer it is. See you in a few days.';
  });

  var title = document.title;
  document.addEventListener('visibilitychange', function () {
    document.title = document.hidden ? 'Out for a run · Runtrovert' : title;
  });

  var whisper = document.getElementById('whisper'), idle, told = 0;
  var whispers = ['Nobody’s rushing you.', 'Still here? Same. Take your time.'];
  function rest() {
    clearTimeout(idle);
    if (told < whispers.length) idle = setTimeout(function () {
      if (calm()) return;
      whisper.textContent = whispers[told++];
      whisper.classList.add('on');
      setTimeout(function () { whisper.classList.remove('on'); }, 6000);
    }, 40000);
  }
  if (whisper) {
    ['scroll', 'pointerdown', 'keydown', 'mousemove'].forEach(function (t) { window.addEventListener(t, rest, { passive: true }); });
    rest();
  }

  // Chapter 3's phone: the three run screens and the finish screen, with sample numbers. The live
  // screens tick only while the phone is on screen and motion is on.
  var phone = document.getElementById('demo');
  if (phone) (function () {
    var tabs = Array.prototype.slice.call(document.querySelectorAll('.modes [role=tab]'));
    var screens = phone.querySelectorAll('.scr'), finish = document.getElementById('finish');
    var mode = 'silent', onScreen = false;
    function show(name) {
      Array.prototype.forEach.call(screens, function (sc) { sc.hidden = sc.getAttribute('data-show') !== name; });
      finish.hidden = name === 'finish';
    }
    function pick(tab, focus) {
      tabs.forEach(function (t) { var on = t === tab; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; });
      phone.setAttribute('aria-labelledby', tab.id);
      mode = tab.getAttribute('data-mode');
      show(mode);
      if (focus) tab.focus();
    }
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { pick(t); });
      t.addEventListener('keydown', function (e) {
        var k = e.key, j = k === 'ArrowDown' || k === 'ArrowRight' ? i + 1 : k === 'ArrowUp' || k === 'ArrowLeft' ? i - 1 : null;
        if (j === null) return;
        e.preventDefault();
        pick(tabs[(j + tabs.length) % tabs.length], true);
      });
    });

    var fin = phone.querySelector('.fin'), finH = fin.querySelector('.fin-h');
    finH.tabIndex = -1;
    finish.addEventListener('click', function () { show('finish'); fin.scrollTop = 0; finH.focus(); });
    document.getElementById('again').addEventListener('click', function () {
      show(mode);
      tabs.forEach(function (t) { if (t.getAttribute('aria-selected') === 'true') t.focus(); });
    });

    var peek = document.getElementById('peek'), peeked = false;
    peek.addEventListener('click', function () {
      peeked = !peeked;
      peek.textContent = peeked ? fmt(secs) + ' so far · tap to hide' : 'Tap to show the time';
    });

    var more = document.getElementById('more'), deep = document.getElementById('deep');
    more.addEventListener('click', function () {
      var open = deep.hidden;
      deep.hidden = !open;
      more.setAttribute('aria-expanded', String(open));
      more.textContent = open ? 'Show less' : 'Show me everything';
    });

    // Splits per km, in seconds. The last bar is the 0.21 km at the end.
    var splits = [351, 336, 328, 320, 314, 310], box = document.getElementById('splits'), say = document.getElementById('split-say');
    function pace(t) { return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); }
    splits.forEach(function (t, i) {
      var b = document.createElement('button'), last = i === splits.length - 1;
      var label = (last ? 'Last 0.21 km' : 'Km ' + (i + 1)) + ' · ' + pace(t) + ' /km';
      b.type = 'button';
      if (last) b.className = 'part';
      b.setAttribute('aria-label', label);
      b.setAttribute('aria-pressed', 'false');
      b.innerHTML = '<i style="--h:' + Math.round(40 + (360 - t) * 1.2) + '%"></i>';
      b.addEventListener('click', function () {
        Array.prototype.forEach.call(box.children, function (c) { c.setAttribute('aria-pressed', String(c === b)); });
        say.textContent = label;
      });
      box.appendChild(b);
    });

    // The live screens count on from a run already 18:47 in.
    var secs = 1127, km = document.getElementById('d-km'), time = document.getElementById('d-time');
    var left = document.getElementById('d-left'), bar = document.getElementById('d-bar'), mini = phone.querySelector('.mini .route');
    function fmt(t) { return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); }
    if ('IntersectionObserver' in window) new IntersectionObserver(function (e) { onScreen = e[0].isIntersecting; }).observe(phone);
    setInterval(function () {
      if (!onScreen || calm()) return;
      secs++;
      var d = secs / 329;
      km.textContent = d.toFixed(2);
      time.textContent = fmt(secs);
      mini.style.setProperty('--drawn', String(Math.max(0, 1 - d / 5.21)));
      var l = Math.max(0, 161 - (secs - 1127) % 240);
      left.textContent = fmt(l);
      bar.style.setProperty('--done', (100 - l / 240 * 100).toFixed(1) + '%');
      if (peeked) peek.textContent = fmt(secs) + ' so far · tap to hide';
    }, 1000);
  })();

  if (window.console) console.log('%cNo trackers in here. Just this note, and nobody will know you read it.', 'font: italic 14px Georgia, serif; color: #c9e7d6');
})();
