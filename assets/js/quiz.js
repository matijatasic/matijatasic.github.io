/* Netzwerk-Quiz im Bereich „03 Interaktiv“ (Kali-Terminal mit Zeitbonus)
   Drei Modi (Binär, Subnetze, Ports), 5 Runden, je 3 Antworten, 30 Sekunden pro Frage.
   Der obere Teil (Fragen erzeugen) ist ohne Browser testbar: node tests/quiz.test.js */
(function (global) {
  'use strict';

  var ROUNDS = 5, SECONDS = 30, BASE = 100, PER_SEC = 10;

  // Well-known Ports bis 1023, wie im Port-Lexikon: [Port, Name DE, Name EN, gleichwertige Namen]
  var PORTS = [
    [20, 'FTP-Daten', 'FTP data', ['ftp', 'ftpdata']], [21, 'FTP-Steuerung', 'FTP control', ['ftp']],
    [22, 'SSH', 'SSH', ['sftp', 'scp']], [23, 'Telnet', 'Telnet', []], [25, 'SMTP', 'SMTP', []],
    [53, 'DNS', 'DNS', []], [67, 'DHCP-Server', 'DHCP server', ['dhcp', 'bootps']],
    [68, 'DHCP-Client', 'DHCP client', ['dhcp', 'bootpc']], [69, 'TFTP', 'TFTP', []],
    [80, 'HTTP', 'HTTP', []], [88, 'Kerberos', 'Kerberos', []], [110, 'POP3', 'POP3', []],
    [123, 'NTP', 'NTP', []], [135, 'RPC', 'RPC', ['msrpc', 'dcom', 'epmap']],
    [137, 'NetBIOS-Namen', 'NetBIOS names', ['netbios', 'netbiosns']],
    [138, 'NetBIOS-Datagramm', 'NetBIOS datagram', ['netbios', 'netbiosdgm']],
    [139, 'NetBIOS-Sitzung', 'NetBIOS session', ['netbios', 'netbiosssn', 'smb']],
    [143, 'IMAP', 'IMAP', []], [161, 'SNMP', 'SNMP', []],
    [162, 'SNMP-Traps', 'SNMP traps', ['snmp', 'snmptrap']], [389, 'LDAP', 'LDAP', []],
    [443, 'HTTPS', 'HTTPS', []], [445, 'SMB', 'SMB', ['cifs']], [465, 'SMTPS', 'SMTPS', []],
    [500, 'IPsec IKE', 'IPsec IKE', ['ike', 'ipsec', 'isakmp']], [514, 'Syslog', 'Syslog', []],
    [547, 'DHCPv6-Server', 'DHCPv6 server', ['dhcpv6']], [587, 'SMTP-Submission', 'SMTP submission', ['submission']],
    [631, 'IPP (Drucken)', 'IPP (printing)', ['ipp', 'cups']], [636, 'LDAPS', 'LDAPS', []],
    [853, 'DNS over TLS', 'DNS over TLS', ['dot']], [993, 'IMAPS', 'IMAPS', []], [995, 'POP3S', 'POP3S', []]
  ];

  var maskOf = function (p) {
    var m = p === 0 ? 0 : (0xffffffff << (32 - p)) >>> 0;
    return [m >>> 24, (m >>> 16) & 255, (m >>> 8) & 255, m & 255].join('.');
  };
  var hostsOf = function (p) { return Math.pow(2, 32 - p) - 2; };
  var bin8 = function (n) { return ('00000000' + n.toString(2)).slice(-8); };
  var norm = function (v) { return v.toLowerCase().replace(/[\s\-_.\/()]/g, ''); };
  var same = function (t) { return { de: t, en: t }; };
  var num = function (n) { return { de: n.toLocaleString('de-DE'), en: n.toLocaleString('en-US') }; };
  var pickIn = function (arr, rnd) { return arr[Math.floor(rnd() * arr.length)]; };
  var shuffle = function (arr, rnd) {
    for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)), t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
    return arr;
  };

  // Aus der richtigen Antwort und den Kandidaten 3 verschiedene Antworten in zufälliger Reihenfolge bauen
  var build = function (key, q, v, right, cands, rnd) {
    var seen = {}, wrong = [];
    seen[right.de] = 1;
    shuffle(cands.slice(), rnd).forEach(function (c) {
      if (wrong.length < 2 && !seen[c.de]) { seen[c.de] = 1; wrong.push(c); }
    });
    if (wrong.length < 2) throw new Error('Zu wenige Falschantworten für ' + key);
    var opts = shuffle([right].concat(wrong), rnd);
    return { key: key, q: q, v: v, opts: opts, a: opts.indexOf(right) };
  };

  // Binär: 8-Bit-Zahl → Dezimalzahl. Falschantworten unterscheiden sich in genau einem Bit.
  var makeBin = function (rnd) {
    var n = 1 + Math.floor(rnd() * 254), cands = [];
    for (var k = 0; k < 8; k++) { var x = n ^ (1 << k); if (x >= 1 && x <= 255) cands.push(num(x)); }
    return build('b' + n, { de: 'Welche Dezimalzahl ist {v}?', en: 'Which decimal number is {v}?' }, same(bin8(n)), num(n), cands, rnd);
  };

  // Subnetze: Präfix → Hosts, Präfix → Maske, Hosts → Präfix. Falschantworten sind Nachbar-Präfixe
  // oder der typische Fehler „Netz- und Broadcast-Adresse nicht abgezogen“.
  var makeSubnet = function (rnd) {
    var t = Math.floor(rnd() * 3), p, d, cands = [];
    if (t === 0) {
      p = pickIn([22, 23, 24, 25, 26, 27, 28, 29, 30], rnd);
      cands.push(num(Math.pow(2, 32 - p)), num(hostsOf(p - 1)));
      if (p < 30) cands.push(num(hostsOf(p + 1)));
      return build('h' + p, { de: 'Wie viele nutzbare Hosts hat {v}?', en: 'How many usable hosts does {v} have?' }, same('/' + p), num(hostsOf(p)), cands, rnd);
    }
    if (t === 1) {
      p = pickIn([24, 25, 26, 27, 28, 29, 30], rnd);
      for (d = -2; d <= 2; d++) if (d && p + d >= 22 && p + d <= 30) cands.push(same(maskOf(p + d)));
      return build('m' + p, { de: 'Welche Subnetzmaske gehört zu {v}?', en: 'Which subnet mask belongs to {v}?' }, same('/' + p), same(maskOf(p)), cands, rnd);
    }
    p = pickIn([22, 23, 24, 25, 26, 27, 28, 29, 30], rnd);
    for (d = -2; d <= 2; d++) if (d && p + d >= 21 && p + d <= 30) cands.push(same('/' + (p + d)));
    return build('p' + p, { de: 'Welches Präfix hat genau {v} nutzbare Hosts?', en: 'Which prefix has exactly {v} usable hosts?' }, num(hostsOf(p)), same('/' + p), cands, rnd);
  };

  // Ports: Dienst → Port oder Port → Dienst. Dienste, die auch als richtig gelten könnten
  // (z. B. SMB auf 139), kommen nicht als Falschantwort vor.
  var clash = function (a, b) { return b[3].indexOf(norm(a[1])) !== -1 || a[3].indexOf(norm(b[1])) !== -1; };
  var makePort = function (rnd) {
    var e = pickIn(PORTS, rnd);
    var others = PORTS.filter(function (o) { return o[0] !== e[0] && !clash(e, o); });
    if (rnd() < 0.5) {
      return build('pn' + e[0], { de: 'Welcher Port gehört zu {v}?', en: 'Which port belongs to {v}?' }, { de: e[1], en: e[2] },
        same(String(e[0])), others.map(function (o) { return same(String(o[0])); }), rnd);
    }
    return build('np' + e[0], { de: 'Welcher Dienst läuft auf Port {v}?', en: 'Which service runs on port {v}?' }, same(String(e[0])),
      { de: e[1], en: e[2] }, others.map(function (o) { return { de: o[1], en: o[2] }; }), rnd);
  };

  var MAKERS = { binaer: makeBin, subnetz: makeSubnet, ports: makePort };
  var make = function (mode, rnd) { return MAKERS[mode](rnd || Math.random); };
  // Punkte: richtig = 100 + 10 je volle übrige Sekunde, falsch oder Zeit abgelaufen = 0
  var points = function (right, left) { return right ? BASE + PER_SEC * Math.max(0, Math.floor(left)) : 0; };

  // Stufen nach Punkten (höchstens 5 × 400 = 2.000)
  var TIERS = [
    { min: 1500, de: 'Senior-Admin', en: 'Senior admin', range: { de: 'ab 1.500', en: 'from 1,500' }, cls: 's' },
    { min: 900, de: 'Mid-Level-Admin', en: 'Mid-level admin', range: { de: '900 – 1.499', en: '900 – 1,499' }, cls: 'm' },
    { min: 0, de: 'Junior-Admin', en: 'Junior admin', range: { de: '0 – 899', en: '0 – 899' }, cls: 'j' }
  ];
  var tierOf = function (pts) { for (var i = 0; i < TIERS.length; i++) if (pts >= TIERS[i].min) return TIERS[i]; return TIERS[TIERS.length - 1]; };
  // Bestenliste: höchstens 3 Punktestände, absteigend. Gibt die neue Liste und den Platz (1–3, sonst 0) zurück.
  var addScore = function (list, pts) {
    var top = (list || []).filter(function (x) { return typeof x === 'number' && isFinite(x); }).slice(0, 3);
    if (!(pts > 0)) return { top: top, place: 0 };
    var i = 0;
    while (i < top.length && top[i] >= pts) i++;
    if (i >= 3) return { top: top, place: 0 };
    top.splice(i, 0, pts);
    return { top: top.slice(0, 3), place: i + 1 };
  };

  var api = { ROUNDS: ROUNDS, SECONDS: SECONDS, PORTS: PORTS, MODES: Object.keys(MAKERS), TIERS: TIERS, make: make, points: points, tierOf: tierOf, addScore: addScore, maskOf: maskOf, hostsOf: hostsOf };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  global.NetQuiz = api;

  /* ======================= Oberfläche ======================= */
  var kt = document.querySelector('[data-quiz]');
  if (!kt) return;
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var bi = function (de, en) { return '<span data-l="de">' + de + '</span><span data-l="en">' + en + '</span>'; };
  var tx = function (o) { return o.de === o.en ? o.de : bi(o.de, o.en); };
  var NAMES = { binaer: 'binär', subnetz: 'subnetz', ports: 'ports' };
  var FILES = { binaer: 'binaer.sh', subnetz: 'subnetz.sh', ports: 'ports.sh' };
  var HELP = { binaer: '#binaer', subnetz: '#subnetz', ports: '#ports' };
  var ORDER = ['binaer', 'subnetz', 'ports'];
  var $ = function (s) { return kt.querySelector(s); };
  var view = $('[data-quiz-view]'), cmd = $('[data-quiz-cmd]'), help = $('[data-quiz-help]');
  var modeBtns = kt.querySelectorAll('[data-quiz-mode]');

  var mode = 'binaer';
  try { var s = sessionStorage.getItem('quiz'); if (MAKERS[s]) mode = s; } catch (e) {}
  // Bestenliste pro Modus, nur im Browser des Besuchers
  var getTop = function (m) {
    try { var t = JSON.parse(localStorage.getItem('quiz-top-' + m) || '[]'); return Array.isArray(t) ? addScore(t, 0).top : []; } catch (e) { return []; }
  };
  var setTop = function (m, t) { try { localStorage.setItem('quiz-top-' + m, JSON.stringify(t)); } catch (e) {} };
  var fmt = function (n) { return bi(n.toLocaleString('de-DE'), n.toLocaleString('en-US')); };
  var pod = document.querySelector('[data-quiz-pod]'), tierBox = document.querySelector('[data-quiz-tiers]'), podName = document.querySelector('[data-quiz-podname]');
  var last = {};
  // Podium (Platz 1 in der Mitte) und Stufen links neben dem Terminal
  var board = function () {
    var top = getTop(mode), mark = last[mode] != null ? last[mode] : top[0];
    if (podName) podName.textContent = mode;
    if (pod) {
      var col = function (place, cls) {
        var v = top[place - 1];
        return '<div class="' + cls + (v == null ? ' empty' : '') + (last[mode + 'p'] === place ? ' new' : '') + '"><b>' + place + '</b><span>' + (v == null ? '–' : fmt(v)) + '</span></div>';
      };
      pod.innerHTML = col(2, 'p2') + col(1, 'p1') + col(3, 'p3');
    }
    if (tierBox) {
      var you = mark != null ? tierOf(mark) : null, h = '';
      TIERS.forEach(function (t) {
        h += '<div class="lt ' + t.cls + (you === t ? ' you' : '') + '"><b>' + tx(t) + '</b><span>' + bi(t.range.de + ' Punkte', t.range.en + ' points') + '</span>' +
          (you === t ? '<em>◀ ' + bi('Sie', 'You') + '</em>' : '') + '</div>';
      });
      tierBox.innerHTML = h;
    }
  };

  // Spielstand
  var g = null, timer = 0, next = 0;
  var stop = function () { clearInterval(timer); clearTimeout(next); timer = 0; next = 0; };

  var dotsHtml = function () {
    var h = '<span class="kt-dots" aria-hidden="true">';
    for (var i = 0; i < ROUNDS; i++) {
      var r = g.res[i];
      h += '<i class="' + (r ? (r.ok ? 'ok' : 'bad') : (i === g.i ? 'cur' : '')) + '"></i>';
    }
    return h + '</span>';
  };

  var intro = function () {
    stop(); g = null;
    var b = getTop(mode)[0] || 0;
    view.innerHTML =
      '<div class="kt-out c">' + bi('[*] Bereit: 5 Fragen, je 30 Sekunden.', '[*] Ready: 5 questions, 30 seconds each.') + '</div>' +
      '<div class="kt-out d">' + bi('# Schneller antworten bringt mehr Punkte.', '# Faster answers earn more points.') + '</div>' +
      (b ? '<div class="kt-out y">' + bi('Ihr Rekord: ' + b.toLocaleString('de-DE') + ' Punkte', 'Your record: ' + b.toLocaleString('en-US') + ' points') + '</div>' : '') +
      '<div class="kt-act"><button type="button" class="pri" data-quiz-start>▶ ' + bi('Start', 'Start') + '</button></div>';
    view.querySelector('[data-quiz-start]').addEventListener('click', start);
  };

  var start = function () {
    stop();
    g = { i: 0, pts: 0, res: [], used: {}, times: [] };
    ask();
  };

  var ask = function () {
    var q, tries = 0;
    do { q = make(mode); } while (g.used[q.key] && ++tries < 30);
    g.used[q.key] = 1; g.q = q; g.left = SECONDS; g.t0 = Date.now(); g.done = false;
    var keys = ['A', 'B', 'C'], o = '';
    q.opts.forEach(function (op, i) {
      o += '<button type="button" class="kt-opt" data-opt="' + i + '"><span class="k">' + keys[i] + '</span><span class="v">' + tx(op) + '</span><span class="m"></span></button>';
    });
    var v = '<b class="y">' + tx(q.v) + '</b>';
    view.innerHTML =
      '<div class="kt-timer" data-quiz-timer><span class="kt-sec">⏱ <b data-quiz-sec>30</b> s</span><div><i data-quiz-bar></i></div><span class="y" data-quiz-bonus>+' + PER_SEC * SECONDS + ' Bonus</span></div>' +
      '<div class="kt-out c">' + bi('Runde', 'Round') + ' ' + (g.i + 1) + '/' + ROUNDS + ' ' + dotsHtml() + ' · ' + bi('Punkte', 'Points') + ' ' + g.pts + '</div>' +
      '<div class="kt-q">' + bi(q.q.de.replace('{v}', v), q.q.en.replace('{v}', v)) + '</div>' +
      '<div class="kt-opts">' + o + '</div>';
    view.querySelectorAll('[data-opt]').forEach(function (b) {
      b.addEventListener('click', function () { answer(+b.getAttribute('data-opt')); });
    });
    tick();
    timer = setInterval(tick, 100);
  };

  var tick = function () {
    if (!g || g.done) return;
    var left = Math.max(0, SECONDS - (Date.now() - g.t0) / 1000);
    g.left = left;
    var sec = view.querySelector('[data-quiz-sec]'), bar = view.querySelector('[data-quiz-bar]'), bonus = view.querySelector('[data-quiz-bonus]');
    if (sec) sec.textContent = Math.ceil(left);
    if (bar) bar.style.width = (left / SECONDS * 100) + '%';
    if (bonus) bonus.textContent = '+' + PER_SEC * Math.floor(left) + ' Bonus';
    var tm = view.querySelector('[data-quiz-timer]');
    if (tm) tm.classList.toggle('is-low', left <= 10);
    if (left <= 0) answer(-1);
  };

  // Tab im Hintergrund: Uhr anhalten und beim Zurückkommen weiterlaufen lassen
  var hiddenAt = 0;
  document.addEventListener('visibilitychange', function () {
    if (!g || g.done) return;
    if (document.hidden) hiddenAt = Date.now();
    else if (hiddenAt) { g.t0 += Date.now() - hiddenAt; hiddenAt = 0; }
  });

  var answer = function (i) {
    if (!g || g.done) return;
    g.done = true; clearInterval(timer); timer = 0;
    var ok = i === g.q.a, used = Math.min(SECONDS, (Date.now() - g.t0) / 1000), p = points(ok, g.left);
    g.pts += p; g.res.push({ ok: ok }); g.times.push(used);
    view.querySelectorAll('[data-opt]').forEach(function (b, j) {
      b.disabled = true;
      var m = b.querySelector('.m');
      if (j === g.q.a) { b.classList.add('ok'); m.innerHTML = '✓ ' + bi('richtig', 'correct'); }
      else if (j === i) { b.classList.add('bad'); m.innerHTML = '✗ ' + bi('falsch', 'wrong'); }
    });
    var fb = document.createElement('div');
    fb.className = 'kt-out ' + (ok ? 'g' : 'r');
    fb.setAttribute('role', 'status');
    fb.innerHTML = ok ? '[+] ' + bi('Richtig', 'Correct') + ': +' + p + ' ' + bi('Punkte', 'points')
      : (i < 0 ? '[-] ' + bi('Zeit abgelaufen', 'Time is up') : '[-] ' + bi('Falsch', 'Wrong')) + ' · ' + bi('Lösung', 'Answer') + ': ' + tx(g.q.opts[g.q.a]);
    view.appendChild(fb);
    var nx = document.createElement('div');
    nx.className = 'kt-act';
    nx.innerHTML = '<button type="button" class="pri" data-quiz-next>' + (g.i + 1 < ROUNDS ? bi('Weiter', 'Next') + ' →' : bi('Ergebnis', 'Result') + ' →') + '</button>';
    view.appendChild(nx);
    var go = function () { clearTimeout(next); next = 0; g.i++; if (g.i < ROUNDS) ask(); else result(); };
    nx.querySelector('button').addEventListener('click', go);
    nx.querySelector('button').focus({ preventScroll: true });
    // Automatisch weiter, damit das Spiel im Fluss bleibt (bei falscher Antwort etwas länger zum Lesen)
    next = setTimeout(go, ok ? 1400 : 2600);
  };

  var result = function () {
    stop();
    var right = g.res.filter(function (r) { return r.ok; }).length, pct = Math.round(right / ROUNDS * 100);
    var avg = g.times.reduce(function (a, b) { return a + b; }, 0) / g.times.length;
    var top = getTop(mode), add = addScore(top, g.pts), rec = add.place === 1;
    setTop(mode, add.top);
    last[mode] = g.pts; last[mode + 'p'] = add.place;
    var tier = tierOf(g.pts);
    board();
    var chips = g.res.map(function (r, i) { return '<span class="' + (r.ok ? 'ok' : 'bad') + '">' + (i + 1) + ' ' + (r.ok ? '✓' : '✗') + '</span>'; }).join('');
    var col = pct >= 80 ? 'g' : (pct >= 40 ? 'y' : 'r');
    var nextMode = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];
    view.innerHTML =
      '<div class="kt-res" role="status">' +
      '<div class="kt-out g">[+] ' + bi('Runde beendet', 'Round complete') + '</div>' +
      '<div class="resrow"><div class="kt-pct ' + col + '">' + pct + ' %</div><div class="resinfo">' +
      '<div class="kt-out">' + bi(right + ' von ' + ROUNDS + ' richtig', right + ' of ' + ROUNDS + ' correct') + ' · ' + bi('Punkte', 'Points') + ' <b class="y">' + fmt(g.pts) + '</b></div>' +
      '<div class="kt-out g">' + (add.place ? '★ ' + bi('Platz ' + add.place, 'Rank ' + add.place) + ' · ' : '') + tx(tier) + (rec ? ' · ' + bi('Neuer Rekord!', 'New record!') : '') + '</div>' +
      '</div></div><div class="kt-bar2 ' + col + '"><i style="width:' + pct + '%"></i></div>' +
      '<div class="kt-out y">' + bi('Ø ' + avg.toFixed(1).replace('.', ',') + ' s pro Antwort', 'avg ' + avg.toFixed(1) + ' s per answer') + '</div>' +
      '<div class="kt-out d">' + (add.place ? bi('# Neuer Eintrag auf Platz ' + add.place + ' in Ihrer Bestenliste.', '# New entry at rank ' + add.place + ' on your leaderboard.')
        : (add.top.length < 3 ? bi('# Ohne Punkte kein Eintrag. Gleich nochmal?', '# No points, no entry. Try again?')
        : bi('# Für die Bestenliste fehlen ' + (add.top[2] - g.pts + 1) + ' Punkte.', '# ' + (add.top[2] - g.pts + 1) + ' more points needed for the leaderboard.'))) + '</div>' +
      '<div class="kt-review">' + chips + '</div>' +
      '<div class="kt-act"><button type="button" class="pri" data-quiz-again>↻ ' + bi('Nochmal', 'Again') + '</button>' +
      '<button type="button" data-quiz-nextmode>' + bi('Nächster Modus', 'Next mode') + ': ' + NAMES[nextMode] + ' →</button></div></div>';
    view.querySelector('[data-quiz-again]').addEventListener('click', start);
    view.querySelector('[data-quiz-nextmode]').addEventListener('click', function () { setMode(nextMode); start(); });
  };

  var setMode = function (m) {
    mode = m;
    try { sessionStorage.setItem('quiz', m); } catch (e) {}
    modeBtns.forEach(function (b) {
      var on = b.getAttribute('data-quiz-mode') === m;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    if (cmd) cmd.textContent = './' + FILES[m] + ' --timer ' + SECONDS;
    if (help) help.setAttribute('href', help.getAttribute('href').replace(/#.*$/, '') + HELP[m]);
    board();
  };
  modeBtns.forEach(function (b) {
    b.addEventListener('click', function () { setMode(b.getAttribute('data-quiz-mode')); intro(); });
  });

  // Tastatur: A/B/C oder 1/2/3 wählt eine Antwort, solange der Fokus im Terminal liegt
  kt.addEventListener('keydown', function (e) {
    if (!g || g.done || e.ctrlKey || e.metaKey || e.altKey) return;
    var i = 'abc'.indexOf(e.key.toLowerCase());
    if (i < 0) i = '123'.indexOf(e.key);
    if (i >= 0) { e.preventDefault(); answer(i); }
  });

  setMode(mode);
  intro();

  // Glitch: kurze Bildstörung, einmal 30 s nach dem Laden (nicht bei „Bewegung reduzieren“)
  kt.addEventListener('animationend', function (e) {
    if (e.target === kt && e.animationName === 'glitch') kt.classList.remove('is-glitch');
  });
  if (!reduceMotion) setTimeout(function () { if (!document.hidden) kt.classList.add('is-glitch'); }, 30000);

  // Easter Egg: Klick auf den Fenstertitel
  var sudo = $('[data-sudo]');
  if (sudo) {
    var idle = sudo.innerHTML, busy = false;
    sudo.addEventListener('click', function () {
      if (busy) return;
      busy = true;
      sudo.innerHTML = 'gast@matija-tasic: $ sudo su';
      setTimeout(function () { sudo.classList.add('is-denied'); sudo.innerHTML = bi('Netter Versuch: verweigert.', 'Nice try: denied.'); }, 600);
      setTimeout(function () { sudo.classList.remove('is-denied'); sudo.innerHTML = idle; busy = false; }, 3600);
    });
  }
})(this);
