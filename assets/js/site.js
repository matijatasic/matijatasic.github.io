/* matija-tasic.de · Verhalten der Seite
   - Sprache (DE/EN) und Darstellung (hell/dunkel) umschalten und merken
   - Leitung: verbindet beim Scrollen die Kapitel wie Ports in einem Netzplan
   - Kontaktformular senden (Ziel in config.js)
*/
(function () {
  'use strict';

  var root = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var SVGNS = 'http://www.w3.org/2000/svg';

  function store(key, value) {
    try { if (value === undefined) return localStorage.getItem(key); localStorage.setItem(key, value); } catch (e) { return null; }
  }

  /* ---------------- Sprache ---------------- */
  function applyLang(lang) {
    root.lang = lang;
    var t = root.getAttribute('data-title-' + lang);
    if (t) document.title = t;
    document.querySelectorAll('[data-set-lang]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-set-lang') === lang));
    });
    document.querySelectorAll('[data-ph-de]').forEach(function (el) {
      el.setAttribute('placeholder', el.getAttribute('data-ph-' + lang) || '');
    });
    document.querySelectorAll('[data-aria-de]').forEach(function (el) {
      el.setAttribute('aria-label', el.getAttribute('data-aria-' + lang) || '');
    });
    updateRunfoot();
    requestLayout();
  }
  document.querySelectorAll('[data-set-lang]').forEach(function (b) {
    b.addEventListener('click', function () {
      var lang = b.getAttribute('data-set-lang');
      store('lang', lang);
      applyLang(lang);
    });
  });

  /* ---------------- Darstellung ----------------
     Start immer dunkel; hell gilt nur für den laufenden Besuch (sessionStorage). */
  function currentTheme() {
    var t = root.getAttribute('data-theme');
    if (t) return t;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.querySelectorAll('[data-toggle-theme]').forEach(function (b) {
    b.addEventListener('click', function () {
      var next = currentTheme() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { sessionStorage.setItem('theme', next); } catch (e) {}
    });
  });

  /* ---------------- Menü (Handy) ---------------- */
  var side = document.querySelector('.side');
  var menuBtn = document.querySelector('.menu-btn');
  if (menuBtn && side) {
    menuBtn.addEventListener('click', function () {
      var open = side.classList.toggle('is-open');
      menuBtn.setAttribute('aria-expanded', String(open));
    });
    side.querySelectorAll('.side-grid a').forEach(function (a) {
      a.addEventListener('click', function () {
        side.classList.remove('is-open');
        menuBtn.setAttribute('aria-expanded', 'false');
      });
    });
  }

  /* ---------------- IT-Tools: aktives Werkzeug (nur auf der Tools-Seite) ---------------- */
  var toolLinks = Array.prototype.slice.call(document.querySelectorAll('.itools a[href^="#"]'));
  if (toolLinks.length) {
    var toolSecs = toolLinks.map(function (a) { return document.querySelector(a.getAttribute('href')); });
    var markTool = function () {
      var cur = -1;
      toolSecs.forEach(function (sec, i) { if (sec && sec.getBoundingClientRect().top < window.innerHeight * 0.4) cur = i; });
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) cur = toolLinks.length - 1;
      toolLinks.forEach(function (a, i) {
        a.classList.toggle('is-current', i === cur);
        if (i === cur) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current');
      });
    };
    window.addEventListener('scroll', markTool, { passive: true });
    window.addEventListener('resize', markTool);
    markTool();
  }

  /* ---------------- Leitung ---------------- */
  var doc = document.querySelector('.doc');
  var svg = document.querySelector('.trace');
  var chapters = Array.prototype.slice.call(document.querySelectorAll('.chapter'));
  var tocLinks = Array.prototype.slice.call(document.querySelectorAll('.toc a[data-toc]'));
  var state = { x: 0, nodes: [], branches: [], y0: 0, y1: 0, line: null, packet: null };

  function el(name, attrs, parent) {
    var n = document.createElementNS(SVGNS, name);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  function layout() {
    if (!doc || !svg || !chapters.length) return;
    var dr = doc.getBoundingClientRect();
    var top = dr.top + window.scrollY;
    var x = parseFloat(getComputedStyle(root).getPropertyValue('--trunk')) || 44;
    var h = doc.scrollHeight;
    svg.setAttribute('viewBox', '0 0 ' + doc.clientWidth + ' ' + h);
    svg.setAttribute('height', h);
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    var nodes = chapters.map(function (c) {
      var head = c.querySelector('[data-node]') || c;
      var r = head.getBoundingClientRect();
      return { y: r.top + window.scrollY - top + r.height / 2, chapter: c, on: false };
    });
    var y0 = nodes[0].y;
    var footer = doc.querySelector('.foot');
    var y1 = footer ? footer.getBoundingClientRect().top + window.scrollY - top + 1 : nodes[nodes.length - 1].y;

    var gBranch = el('g', {}, svg);
    el('path', { d: 'M' + x + ' ' + y0 + 'V' + y1, class: 't-bg' }, svg);
    var line = el('path', { d: 'M' + x + ' ' + y0 + 'V' + y1, class: 't-line' }, svg);
    var len = y1 - y0;
    line.style.strokeDasharray = len + ' ' + len;
    line.style.strokeDashoffset = len;

    // Abzweige zu den Zeilen (Projekte, Kompetenzen)
    var branches = Array.prototype.slice.call(doc.querySelectorAll('[data-tap]')).map(function (t) {
      var r = t.getBoundingClientRect();
      var y = r.top + window.scrollY - top + Math.min(34, r.height / 2);
      var xe = r.left - dr.left;
      var d = 'M' + x + ' ' + y + 'H' + (xe - 1);
      el('path', { d: d, class: 't-branch-bg' }, gBranch);
      var p = el('path', { d: d, class: 't-branch' }, gBranch);
      var bl = Math.max(1, xe - 1 - x);
      p.style.strokeDasharray = bl + ' ' + bl;
      p.style.strokeDashoffset = bl;
      var port = el('rect', { x: xe - 6, y: y - 5, width: 10, height: 10, rx: 2, class: 't-port' }, gBranch);
      return { y: y, path: p, port: port, row: t, on: false };
    });

    nodes.forEach(function (n) {
      n.halo = el('rect', { x: x - 8, y: n.y - 8, width: 16, height: 16, rx: 4, class: 't-halo' }, svg);
      n.rect = el('rect', { x: x - 8, y: n.y - 8, width: 16, height: 16, rx: 4, class: 't-node' }, svg);
    });
    var packet = el('circle', { cx: x, cy: y0, r: 5, class: 't-packet' }, svg);

    state = { x: x, nodes: nodes, branches: branches, y0: y0, y1: y1, len: len, line: line, packet: packet, top: top };
    update();
  }

  function setOn(item, on) {
    if (item.on === on) return;
    item.on = on;
    if (item.rect) {
      item.rect.classList.toggle('is-on', on);
      item.chapter.classList.toggle('is-linked', on);
      if (on && !reduceMotion) {
        item.halo.classList.remove('is-pulse');
        void item.halo.getBBox();
        item.halo.classList.add('is-pulse');
      }
    } else {
      item.path.style.strokeDashoffset = on ? 0 : item.path.style.strokeDasharray.split(' ')[0];
      item.port.classList.toggle('is-on', on);
      item.row.classList.toggle('is-linked', on);
    }
  }

  function update() {
    if (!state.line) return;
    var atEnd = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4;
    var probe = window.scrollY + window.innerHeight * 0.62 - state.top;
    var head = reduceMotion || atEnd ? state.y1 : Math.max(state.y0, Math.min(state.y1, probe));
    var drawn = head - state.y0;
    state.line.style.strokeDashoffset = state.len - drawn;
    state.packet.setAttribute('cy', head);
    state.packet.style.opacity = head >= state.y1 - 1 ? 0 : 1;

    var current = 0;
    state.nodes.forEach(function (n, i) {
      var on = head >= n.y - 1;
      setOn(n, on);
      if (on) current = i;
    });
    state.branches.forEach(function (b) { setOn(b, head >= b.y - 1); });

    tocLinks.forEach(function (a, i) {
      a.classList.toggle('is-on', i <= current);
      a.classList.toggle('is-current', i === current);
    });
    // Fortschritt nach Lage des aktuellen Eintrags, denn in der Liste stehen auch Links auf andere Seiten (Tools)
    var tocList = document.querySelector('.toc ol');
    if (tocList && tocLinks.length > 1) {
      var all = tocList.querySelectorAll('a');
      var y0 = all[0].getBoundingClientRect().top, y1 = all[all.length - 1].getBoundingClientRect().top;
      var yc = tocLinks[current].getBoundingClientRect().top;
      tocList.style.setProperty('--toc-progress', y1 > y0 ? (yc - y0) / (y1 - y0) : 0);
    }

    state.current = current;
    updateRunfoot();
  }

  /* Laufende Fußzeile: Kapitel x / y wie im PDF */
  function updateRunfoot() {
    var rf = document.querySelector('.runfoot');
    if (!rf || !chapters.length) return;
    var i = state.current || 0;
    var c = chapters[i];
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    // Kapitelnummer aus dem Kapitelkopf, damit Zähler und Seitenleiste dieselbe Nummer zeigen
    var nr = function (ch, fallback) { var e = ch.querySelector('.ch-num, .kicker b'); return e ? e.textContent.trim() : pad(fallback); };
    rf.querySelector('.rf-page').textContent = nr(c, i) + ' / ' + nr(chapters[chapters.length - 1], chapters.length - 1);
    var title = c.querySelector('[data-runtitle]');
    var lang = root.lang === 'en' ? 'en' : 'de';
    rf.querySelector('.rf-title').textContent = title ? (title.getAttribute('data-runtitle-' + lang) || title.getAttribute('data-runtitle')) : '';
    var max = document.documentElement.scrollHeight - window.innerHeight;
    rf.style.setProperty('--page-progress', max > 0 ? Math.min(1, window.scrollY / max) : 1);
  }

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { ticking = false; update(); });
  }
  var layoutTimer = null;
  function requestLayout() {
    clearTimeout(layoutTimer);
    layoutTimer = setTimeout(layout, 60);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', requestLayout);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(requestLayout);
  window.addEventListener('load', requestLayout);
  if ('ResizeObserver' in window && doc) new ResizeObserver(requestLayout).observe(doc);

  /* ---------------- Kontaktformular ---------------- */
  var form = document.querySelector('#kontaktformular');
  if (form) {
    var cfg = window.SITE_CONFIG || {};
    var status = form.querySelector('.form-status');
    var msg = {
      de: {
        sending: 'Wird gesendet …',
        ok: 'Danke! Deine Nachricht ist angekommen.',
        err: 'Das hat leider nicht geklappt. Bitte versuch es später noch einmal oder schreib mir per E-Mail.',
        inactive: 'Dein E-Mail-Programm öffnet sich mit deiner Nachricht. Bitte dort noch auf Senden klicken.'
      },
      en: {
        sending: 'Sending …',
        ok: 'Thank you! Your message has arrived.',
        err: 'Sorry, that did not work. Please try again later or send me an email.',
        inactive: 'Your email app opens with your message. Please click send there.'
      }
    };
    var t = function (k) { return msg[root.lang === 'en' ? 'en' : 'de'][k]; };
    var setStatus = function (text, kind) {
      status.textContent = text;
      status.className = 'form-status' + (kind ? ' ' + kind : '');
    };

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;
      var data = new FormData(form);
      if (data.get('botcheck')) return;

      if (!cfg.formEndpoint) {
        setStatus(t('inactive'), '');
        var body = (data.get('message') || '') + '\n\n' + (data.get('name') || '') + '\n' + (data.get('email') || '');
        window.location.href = 'mailto:' + (cfg.email || '') +
          '?subject=' + encodeURIComponent('Kontakt über matija-tasic.de') +
          '&body=' + encodeURIComponent(body);
        return;
      }
      if (cfg.formAccessKey) data.append('access_key', cfg.formAccessKey);
      data.append('subject', 'Kontakt über matija-tasic.de');
      setStatus(t('sending'), '');
      fetch(cfg.formEndpoint, { method: 'POST', body: data, headers: { Accept: 'application/json' } })
        .then(function (r) {
          if (!r.ok) throw new Error(String(r.status));
          form.reset();
          setStatus(t('ok'), 'ok');
        })
        .catch(function () { setStatus(t('err'), 'err'); });
    });
  }

  /* ---------------- Start ---------------- */
  var saved = store('lang');
  applyLang(saved === 'en' ? 'en' : 'de');
  var year = document.querySelectorAll('[data-year]');
  year.forEach(function (y) { y.textContent = new Date().getFullYear(); });
  layout();
  /* ---------------- Seitenleiste: Mini-Terminal ----------------
     Tippt nur beim ersten Seitenaufruf im Besuch. Subnetz-Quiz und ein kleines sudo-Easter-Egg. */
  var term = document.querySelector('.term');
  if (term) {
    try {
      if (sessionStorage.getItem('term')) term.classList.add('term-seen');
      else sessionStorage.setItem('term', '1');
    } catch (e) {}
    // Nach dem Tippen volle Breite, damit Quiz und Easter Egg längere Texte zeigen können
    term.addEventListener('animationend', function (e) {
      if (e.target.classList.contains('et-ln')) e.target.classList.add('is-typed');
    });

    var bi = function (de, en) { return '<span data-l="de">' + de + '</span><span data-l="en">' + en + '</span>'; };
    var maskOf = function (p) {
      var m = p === 0 ? 0 : (0xffffffff << (32 - p)) >>> 0;
      return [m >>> 24, (m >>> 16) & 255, (m >>> 8) & 255, m & 255].join('.');
    };
    var pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };
    // Fragen: Präfix → Hosts, Präfix → Maske, Hosts → Präfix; Antwort wird eingetippt und geprüft
    var digits = function (v) { return v.replace(/[\s.,']/g, ''); };
    var makeQuiz = function () {
      var t = Math.floor(Math.random() * 3), p, h, m;
      if (t === 0) {
        p = pick([22, 23, 24, 25, 26, 27, 28, 29, 30]); h = Math.pow(2, 32 - p) - 2;
        return { key: 'h' + p, n: 23, q: bi('/' + p + ' → wie viele Hosts?', '/' + p + ' → how many hosts?'),
          a: h.toLocaleString('de-DE') + ' Hosts', ok: function (v) { return digits(v) === String(h); } };
      }
      if (t === 1) {
        p = pick([24, 25, 26, 27, 28, 29, 30]); m = maskOf(p);
        return { key: 'm' + p, n: 19, q: bi('/' + p + ' → welche Maske?', '/' + p + ' → which mask?'),
          a: m, ok: function (v) { return v.replace(/\s/g, '').replace(/,/g, '.') === m; } };
      }
      h = pick([2, 6, 14, 30, 62, 126, 254, 510, 1022]); p = 32 - Math.log2(h + 2);
      return { key: 'p' + h, n: 25, q: bi(h + ' Hosts → welches Präfix?', h + ' hosts → which prefix?'),
        a: '/' + p, ok: function (v) { return v.replace(/[\s\/]/g, '') === String(p); } };
    };
    var qEl = term.querySelector('[data-quiz-q]'), form = term.querySelector('[data-quiz-form]');
    var inp = term.querySelector('[data-quiz-in]'), res = term.querySelector('[data-quiz-res]');
    var newBtn = term.querySelector('[data-quiz-new]');
    var lastKey = '', cur = null;
    var ask = function (focus) {
      var q;
      do { q = makeQuiz(); } while (q.key === lastKey);
      lastKey = q.key; cur = q;
      qEl.innerHTML = q.q;
      qEl.style.setProperty('--n', q.n);
      res.hidden = true; res.className = 'et-res';
      form.hidden = false; inp.value = '';
      if (focus) inp.focus();
    };
    if (qEl && form && inp && res && newBtn) {
      ask(false);
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var v = inp.value.trim();
        if (!v) return;
        var right = cur.ok(v);
        res.innerHTML = right ? '✓ ' + bi('richtig', 'correct') : '✗ = ' + cur.a;
        res.className = 'et-res ' + (right ? 'is-ok' : 'is-bad');
        form.hidden = true; res.hidden = false;
        newBtn.focus();
      });
      newBtn.addEventListener('click', function () { ask(true); });
    }

    // Glitch: kurze Bildstörung (nicht bei „Bewegung reduzieren“, nicht im Hintergrund-Tab)
    var glitch = function () {
      if (document.hidden) return;
      term.classList.remove('is-glitch');
      void term.offsetWidth;
      term.classList.add('is-glitch');
    };
    term.addEventListener('animationend', function (e) {
      if (e.target === term && e.animationName === 'glitch') term.classList.remove('is-glitch');
    });
    if (!reduceMotion) {
      // nur einmal pro Seitenaufruf, 30 s nach dem Laden
      setTimeout(glitch, 30000);
    }

    // Easter Egg: Klick auf den Titel „matija@tasic:~“
    var sudo = term.querySelector('[data-sudo]');
    if (sudo) {
      var idle = sudo.innerHTML, busy = false;
      sudo.addEventListener('click', function () {
        if (busy) return;
        busy = true;
        sudo.innerHTML = '$ sudo su';
        setTimeout(function () {
          sudo.classList.add('is-denied');
          sudo.innerHTML = bi('Netter Versuch: verweigert.', 'Nice try: denied.');
        }, 600);
        setTimeout(function () { sudo.classList.remove('is-denied'); sudo.innerHTML = idle; busy = false; }, 3600);
      });
    }
  }
})();
