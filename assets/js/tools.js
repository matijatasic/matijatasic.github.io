/* matija-tasic.de · Werkzeuge (werkzeuge.html)
   - Subnetzrechner, VLAN-Planer, Checkliste für Änderungen
   - Rechenlogik steckt in ipcalc.js; hier nur Oberfläche und Texte
   - nichts wird gespeichert oder übertragen
*/
(function () {
  'use strict';

  var C = window.IPCalc;
  var root = document.documentElement;
  if (!C || !document.querySelector('.tools')) return;

  function lang() { return root.lang === 'en' ? 'en' : 'de'; }
  function L(de, en) { return lang() === 'en' ? en : de; }
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function num(n) { return n.toLocaleString(lang() === 'en' ? 'en-GB' : 'de-DE'); }
  function cidr(s) { return C.formatIp(s.network) + '/' + s.prefix; }
  function range(a, b) { return a === null ? '–' : (a === b ? C.formatIp(a) : C.formatIp(a) + ' – ' + C.formatIp(b)); }
  /* Bereich für die Tabelle: zwei Adressen, Umbruch nur zwischen ihnen */
  function rangeHtml(a, b) { return a === null ? '–' : (a === b ? '<code>' + C.formatIp(a) + '</code>' : '<code>' + C.formatIp(a) + '</code> – <code>' + C.formatIp(b) + '</code>'); }
  /* Text aus Eingaben für Markdown-Tabellen und -Listen entschärfen */
  function md(s) { return String(s).replace(/([\\`*_[\]|<>#])/g, '\\$1').replace(/\s+/g, ' ').trim(); }

  var PARSE_ERR = {
    empty: ['Bitte ein Netz eingeben.', 'Please enter a network.'],
    format: ['Format nicht erkannt. Beispiel: 192.168.10.0/24', 'Format not recognised. Example: 192.168.10.0/24'],
    noprefix: ['Bitte das Präfix eingeben (0 bis 32), zum Beispiel 24.', 'Please enter the prefix (0 to 32), for example 24.'],
    ip: ['Keine gültige IPv4-Adresse. Jede Zahl 0 bis 255, ohne führende Null.', 'Not a valid IPv4 address. Each number 0 to 255, no leading zero.'],
    prefix: ['Das Präfix muss zwischen 0 und 32 liegen.', 'The prefix must be between 0 and 32.'],
    mask: ['Die Maske ist ungültig (Einsen müssen zusammenhängen, z. B. 255.255.255.0).', 'The mask is invalid (ones must be contiguous, e.g. 255.255.255.0).']
  };
  var KIND = {
    'private': ['Privat (RFC 1918)', 'Private (RFC 1918)'],
    cgnat: ['Provider-NAT (RFC 6598)', 'Carrier-grade NAT (RFC 6598)'],
    loopback: ['Loopback', 'Loopback'],
    linklocal: ['Link-Local (RFC 3927)', 'Link-local (RFC 3927)'],
    doc: ['Dokumentation (RFC 5737)', 'Documentation (RFC 5737)'],
    benchmark: ['Benchmark (RFC 2544)', 'Benchmarking (RFC 2544)'],
    multicast: ['Multicast', 'Multicast'],
    reserved: ['Reserviert', 'Reserved'],
    broadcast: ['Broadcast', 'Broadcast'],
    'this': ['„Dieses Netz“ (0.0.0.0/8)', '“This network” (0.0.0.0/8)'],
    'public': ['Öffentlich', 'Public']
  };
  function t(pair) { return L(pair[0], pair[1]); }
  /* Checklisten-Texte: `…` markiert Befehle und Pfade (HTML: <code>, Markdown: unverändert) */
  function codeHtml(s) { return String(s).split('`').map(function (p, i) { return i % 2 ? '<code>' + esc(p) + '</code>' : esc(p); }).join(''); }
  function codeMd(s) { return String(s).split('`').map(function (p, i) { return i % 2 ? '`' + p + '`' : p.replace(/([\\*_[\]|<>#])/g, '\\$1'); }).join(''); }

  /* ---------- Hilfen: Kopieren und Speichern ---------- */
  function flash(el, text) {
    el.textContent = text;
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.textContent = ''; }, 2500);
  }
  function copy(text, el) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
      flash(el, ok ? L('In die Zwischenablage kopiert.', 'Copied to clipboard.') : L('Kopieren nicht möglich. Bitte „Als .md speichern“ nutzen.', 'Copy not possible. Please use “Save as .md”.'));
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { flash(el, L('In die Zwischenablage kopiert.', 'Copied to clipboard.')); }, fallback);
    } else fallback();
  }
  function download(name, text, type) {
    var blob = new Blob([text], { type: type + ';charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  /* Ausgewählte <option> mit data-de/data-en übersetzen */
  function translateOptions() {
    document.querySelectorAll('.tools option[data-de]').forEach(function (o) { o.textContent = o.getAttribute('data-' + lang()); });
  }

  /* ======================================================================
     01 Subnetzrechner
     ====================================================================== */
  var snIn = $('sn-in'), snPfx = $('sn-pfx'), snTest = $('sn-test'), ovIn = $('ov-in');

  /* Handy-Ziffernblöcke haben oft ein Komma statt Punkt: als Punkt lesen */
  function dots(v) { return String(v).replace(/,/g, '.').trim(); }

  /* IP und Präfix stehen in zwei Feldern, damit auf dem Handy kein „/“ nötig ist.
     Wird „10.0.0.0/24“ ins IP-Feld eingefügt, wandert der Teil hinter „/“ ins Präfixfeld. */
  function readPair(ipEl, pfxEl) {
    var ip = dots(ipEl.value);
    var m = ip.match(/^(\S+)\s*(?:\/|\s)\s*(\S+)$/);
    if (m) { ip = m[1]; ipEl.value = m[1]; pfxEl.value = m[2]; }
    var pfx = dots(pfxEl.value).replace(/^\//, '');
    if (!ip) return { error: 'empty' };
    if (C.parseIp(ip) === null) return { error: 'ip' };
    if (!pfx) return { error: 'noprefix' };
    return C.parseCidr(ip + '/' + pfx);
  }

  function bitsRow(label, value, prefix) {
    var b = C.toBinary(value), out = '', bit = 0;
    for (var i = 0; i < b.length; i++) {
      if (b[i] === '.') { out += '<span class="b-dot">.</span>'; continue; }
      out += '<span class="' + (bit < prefix ? 'b-net' : 'b-host') + '">' + b[i] + '</span>';
      bit++;
    }
    return '<div class="bits-row"><span class="bits-lbl">' + label + '</span><code>' + out + '</code></div>';
  }

  function renderSubnet() {
    var r = readPair(snIn, snPfx);
    var msg = $('sn-msg'), out = $('sn-out'), bits = $('sn-bits');
    if (r.error) {
      msg.textContent = t(PARSE_ERR[r.error]); msg.className = 'tool-msg err';
      out.innerHTML = ''; bits.innerHTML = ''; $('sn-test-out').textContent = '';
      return null;
    }
    var s = C.subnet(r.ip, r.prefix);
    if (s.isHostAddress) {
      msg.textContent = L(C.formatIp(r.ip) + ' ist eine Adresse im Netz ' + cidr(s) + '.', C.formatIp(r.ip) + ' is an address in the network ' + cidr(s) + '.');
      msg.className = 'tool-msg';
    } else if (r.prefix === 31) {
      msg.textContent = L('/31: Punkt-zu-Punkt-Verbindung nach RFC 3021, beide Adressen nutzbar.', '/31: point-to-point link per RFC 3021, both addresses usable.');
      msg.className = 'tool-msg';
    } else { msg.textContent = ''; msg.className = 'tool-msg'; }

    var rows = [
      [L('Netz', 'Network'), cidr(s)],
      [L('Maske', 'Mask'), C.formatIp(s.mask) + ' (/' + s.prefix + ')'],
      ['Wildcard', C.formatIp(s.wildcard)],
      [L('Nutzbar', 'Usable'), range(s.first, s.last)],
      ['Broadcast', s.prefix >= 31 ? '–' : C.formatIp(s.broadcast)],
      [L('Nutzbare Adressen', 'Usable addresses'), num(s.hosts)],
      [L('Adressen gesamt', 'Total addresses'), num(s.size)],
      [L('Bereich', 'Range'), t(KIND[s.kind])]
    ];
    out.innerHTML = rows.map(function (r) { return '<div><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd></div>'; }).join('');
    bits.innerHTML = bitsRow(L('Adresse', 'Address'), r.ip, s.prefix) + bitsRow(L('Maske', 'Mask'), s.mask, s.prefix) +
      '<p class="bits-key"><span class="b-net">1</span> ' + L('Netzanteil', 'network part') + ' · <span class="b-host">0</span> ' + L('Hostanteil', 'host part') + '</p>';
    renderTest(s);
    return s;
  }

  function renderTest(s) {
    var el = $('sn-test-out');
    var v = dots(snTest.value);
    if (!v) { el.textContent = ''; el.className = 'tool-msg'; return; }
    var a = C.parseIp(v);
    if (a === null) { el.textContent = t(PARSE_ERR.ip); el.className = 'tool-msg err'; return; }
    var inside = C.contains(s.network, s.prefix, a);
    var extra = '';
    if (inside && a === s.network && s.prefix < 31) extra = L(' Achtung: Das ist die Netzadresse.', ' Note: this is the network address.');
    if (inside && a === s.broadcast && s.prefix < 31) extra = L(' Achtung: Das ist die Broadcastadresse.', ' Note: this is the broadcast address.');
    el.textContent = inside
      ? L('Ja, ' + v + ' liegt in ' + cidr(s) + '.', 'Yes, ' + v + ' is inside ' + cidr(s) + '.') + extra
      : L('Nein, ' + v + ' liegt nicht in ' + cidr(s) + '. Der Verkehr läuft über das Gateway.', 'No, ' + v + ' is not inside ' + cidr(s) + '. Traffic goes through the gateway.');
    el.className = 'tool-msg ' + (inside ? 'ok' : 'warn');
  }

  function renderOverlap() {
    var out = $('ov-out');
    var nets = [], items = [];
    ovIn.value.split('\n').forEach(function (line, i) {
      var v = line.trim();
      if (!v || v[0] === '#') return;
      var r = C.parseCidr(v);
      if (r.error) { items.push('<li class="err">' + L('Zeile ', 'Line ') + (i + 1) + ': ' + esc(v) + ' · ' + esc(t(PARSE_ERR[r.error])) + '</li>'); return; }
      var s = C.subnet(r.ip, r.prefix);
      nets.push({ ip: s.network, prefix: s.prefix, text: cidr(s), line: i + 1 });
    });
    for (var i = 0; i < nets.length; i++) {
      for (var j = i + 1; j < nets.length; j++) {
        var a = nets[i], b = nets[j];
        if (!C.overlaps(a, b)) continue;
        var text;
        if (a.prefix === b.prefix) text = L(a.text + ' ist doppelt eingetragen (Zeilen ' + a.line + ' und ' + b.line + ').', a.text + ' is listed twice (lines ' + a.line + ' and ' + b.line + ').');
        else {
          var big = a.prefix < b.prefix ? a : b, small = big === a ? b : a;
          text = L(small.text + ' liegt in ' + big.text + '.', small.text + ' lies inside ' + big.text + '.');
        }
        items.push('<li class="warn">' + esc(text) + '</li>');
      }
    }
    if (!items.length && nets.length > 1) items.push('<li class="ok">' + L('Keine Überschneidungen.', 'No overlaps.') + '</li>');
    out.innerHTML = items.join('');
  }

  snIn.addEventListener('input', renderSubnet);
  snPfx.addEventListener('input', renderSubnet);
  snTest.addEventListener('input', function () { var r = readPair(snIn, snPfx); if (!r.error) renderTest(C.subnet(r.ip, r.prefix)); });
  ovIn.addEventListener('input', renderOverlap);

  /* ======================================================================
     02 VLAN-Planer
     ====================================================================== */
  var vlRows = $('vl-rows');
  var lastPlan = null;

  function addRow(id, name, devices) {
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td><input type="number" class="vl-id" min="1" max="4094" step="1" value="' + esc(id) + '" aria-label="VLAN-ID"></td>' +
      '<td><input type="text" class="vl-name" maxlength="40" value="' + esc(name) + '" aria-label="Name"></td>' +
      '<td><input type="number" class="vl-dev" min="1" step="1" value="' + esc(devices) + '" aria-label="' + esc(L('Geräte', 'Devices')) + '"></td>' +
      '<td><button type="button" class="vl-del" aria-label="' + esc(L('Zone entfernen', 'Remove zone')) + '">×</button></td>';
    vlRows.appendChild(tr);
  }

  function readRows() {
    return Array.prototype.map.call(vlRows.querySelectorAll('tr'), function (tr) {
      return {
        idRaw: tr.querySelector('.vl-id').value.trim(),
        name: tr.querySelector('.vl-name').value.trim(),
        devRaw: tr.querySelector('.vl-dev').value.trim()
      };
    });
  }

  function renderVlan() {
    var msgs = [], errors = 0;
    function err(text) { msgs.push('<li class="err">' + esc(text) + '</li>'); errors++; }
    function warn(text) { msgs.push('<li class="warn">' + esc(text) + '</li>'); }
    var out = $('vl-out'), sum = $('vl-sum');
    lastPlan = null;

    var base = readPair($('vl-base'), $('vl-pfx'));
    if (base.error) err(L('Basisnetz: ', 'Base network: ') + t(PARSE_ERR[base.error]));

    var rows = readRows(), seen = {};
    var vlans = rows.map(function (r, i) {
      var n = i + 1, label = r.name || ('#' + n);
      var id = /^\d+$/.test(r.idRaw) ? Number(r.idRaw) : NaN;
      var dev = /^\d+$/.test(r.devRaw) ? Number(r.devRaw) : NaN;
      if (!(id >= 1 && id <= 4094)) err(L('Zeile ' + n + ': VLAN-ID muss zwischen 1 und 4094 liegen.', 'Row ' + n + ': VLAN ID must be between 1 and 4094.'));
      else if (seen[id]) err(L('VLAN-ID ' + id + ' ist doppelt vergeben.', 'VLAN ID ' + id + ' is used twice.'));
      else if (id === 1) warn(L('VLAN 1 ist bei den meisten Switches das Standard-VLAN. Für eigene Zonen besser eine andere ID nehmen.', 'VLAN 1 is the default VLAN on most switches. Better use another ID for your own zones.'));
      seen[id] = true;
      if (!r.name) warn(L('Zeile ' + n + ': Name fehlt.', 'Row ' + n + ': name is missing.'));
      if (!(dev >= 1)) err(L('Zeile ' + n + ' (' + label + '): Anzahl Geräte muss mindestens 1 sein.', 'Row ' + n + ' (' + label + '): number of devices must be at least 1.'));
      return { id: id, name: r.name, devices: dev, label: label };
    });
    if (!vlans.length) err(L('Bitte mindestens eine Zone eintragen.', 'Please add at least one zone.'));

    var plan = null;
    if (!errors) {
      var bs = C.subnet(base.ip, base.prefix);
      if (bs.kind !== 'private') warn(L('Das Basisnetz ist kein privater Bereich (RFC 1918). Im Heim- und Firmennetz meist 10.0.0.0/8, 172.16.0.0/12 oder 192.168.0.0/16.', 'The base network is not a private range (RFC 1918). Internal networks usually use 10.0.0.0/8, 172.16.0.0/12 or 192.168.0.0/16.'));
      if (bs.network !== base.ip) warn(L('Basisnetz auf ' + cidr(bs) + ' ausgerichtet.', 'Base network aligned to ' + cidr(bs) + '.'));
      var mode = $('vl-mode').value;
      plan = mode === 'id' ? C.planById(bs.network, bs.prefix, vlans) : C.planVlsm(bs.network, bs.prefix, vlans);
      if (plan.error) {
        var v = vlans[plan.index] || {};
        var E = {
          base16: ['Für „/24 je VLAN“ muss das Basisnetz /16 oder größer sein, z. B. 10.20.0.0/16. Sonst „Sparsam nach Bedarf“ wählen.', 'For “/24 per VLAN” the base network must be /16 or larger, e.g. 10.20.0.0/16. Otherwise choose “As small as needed”.'],
          id255: ['VLAN ' + v.id + ' passt nicht ins dritte Oktett (höchstens 255). Andere ID oder „Sparsam nach Bedarf“ wählen.', 'VLAN ' + v.id + ' does not fit into the third octet (255 at most). Choose another ID or “As small as needed”.'],
          toolarge: [v.label + ' braucht mehr Adressen, als in das Basisnetz bzw. ein /24 passen.', v.label + ' needs more addresses than fit into the base network or a /24.'],
          nospace: ['Das Basisnetz ist zu klein. Spätestens bei ' + v.label + ' ist kein Platz mehr.', 'The base network is too small. At ' + v.label + ' at the latest there is no room left.']
        };
        err(t(E[plan.error]));
        plan = null;
      }
    }

    $('vl-msg').innerHTML = msgs.join('');
    if (!plan) { out.innerHTML = ''; sum.textContent = ''; return; }

    var reserve = Number($('vl-res').value);
    var rowsOut = vlans.map(function (v, i) {
      var s = plan.plan[i], a = C.addressLayout(s, reserve);
      return { id: v.id, name: v.name, net: cidr(s), mask: C.formatIp(s.mask), gw: C.formatIp(a.gateway),
        fixed: range(a.staticFrom, a.staticTo), dhcp: range(a.dhcpFrom, a.dhcpTo), fixedHtml: rangeHtml(a.staticFrom, a.staticTo), dhcpHtml: rangeHtml(a.dhcpFrom, a.dhcpTo), max: s.hosts - 1, devices: v.devices };
    });
    var head = ['VLAN', L('Name', 'Name'), L('Netz', 'Network'), 'Gateway', L('Feste IPs', 'Static IPs'), 'DHCP', L('Geräte max.', 'Max. devices')];
    out.innerHTML = '<thead><tr>' + head.map(function (h) { return '<th scope="col">' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rowsOut.map(function (r) {
        return '<tr><td>' + r.id + '</td><td>' + esc(r.name) + '</td><td><code>' + r.net + '</code></td><td><code>' + r.gw + '</code></td><td class="rng">' + r.fixedHtml + '</td><td class="rng">' + r.dhcpHtml + '</td><td>' + num(r.max) + '</td></tr>';
      }).join('') + '</tbody>';
    sum.textContent = L('Belegt: ', 'Used: ') + num(plan.used) + L(' von ', ' of ') + num(plan.total) + L(' Adressen im Basisnetz', ' addresses in the base network') +
      ' (' + (plan.used / plan.total * 100).toLocaleString(lang() === 'en' ? 'en-GB' : 'de-DE', { maximumFractionDigits: 1 }) + ' %). ' +
      L('Gateway ist jeweils die erste Adresse.', 'The gateway is always the first address.');
    lastPlan = { head: head, rows: rowsOut, base: cidr(C.subnet(base.ip, base.prefix)), reserve: reserve };
  }

  function vlanMarkdown() {
    var p = lastPlan;
    var lines = ['# ' + L('VLAN-Plan', 'VLAN plan'), '',
      '- **' + L('Basisnetz', 'Base network') + ':** ' + p.base,
      '- **' + L('Aufteilung', 'Layout') + ':** ' + md($('vl-mode').selectedOptions[0].textContent),
      '- **' + L('Feste Adressen', 'Static addresses') + ':** ' + (p.reserve ? p.reserve + ' %' : L('keine Reserve', 'no reserve')),
      '- **' + L('Erstellt', 'Created') + ':** ' + new Date().toISOString().slice(0, 10), '',
      '| ' + p.head.join(' | ') + ' |',
      '|' + p.head.map(function () { return ' --- '; }).join('|') + '|'];
    p.rows.forEach(function (r) {
      lines.push('| ' + [r.id, md(r.name), '`' + r.net + '`', '`' + r.gw + '`', '`' + r.fixed + '`', '`' + r.dhcp + '`', r.max].join(' | ') + ' |');
    });
    lines.push('', L('Erstellt mit dem VLAN-Planer auf matija-tasic.de', 'Created with the VLAN planner on matija-tasic.de'));
    return lines.join('\n') + '\n';
  }

  function vlanCsv() {
    var q = function (v) { v = String(v); return /[";,\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var head = ['VLAN', 'Name', L('Netz', 'Network'), L('Maske', 'Mask'), 'Gateway', L('Feste IPs', 'Static IPs'), 'DHCP', L('Geräte geplant', 'Planned devices'), L('Geräte max.', 'Max. devices')];
    var lines = [head.map(q).join(';')];
    lastPlan.rows.forEach(function (r) { lines.push([r.id, r.name, r.net, r.mask, r.gw, r.fixed, r.dhcp, r.devices, r.max].map(q).join(';')); });
    return '﻿' + lines.join('\r\n') + '\r\n'; // BOM + Semikolon, damit Excel Umlaute und Spalten richtig liest
  }

  var defaults = [[10, 'Privat', 'Private', 40], [20, 'IoT', 'IoT', 25], [30, 'Gäste', 'Guests', 30], [40, 'Lab', 'Lab', 10]];
  defaults.forEach(function (d) { addRow(d[0], lang() === 'en' ? d[2] : d[1], d[3]); });

  $('vl-add').addEventListener('click', function () {
    var ids = readRows().map(function (r) { return Number(r.idRaw) || 0; });
    var next = Math.min(4094, (Math.max.apply(null, ids.concat([0])) || 0) + 10);
    addRow(next, '', 10);
    renderVlan();
    vlRows.querySelector('tr:last-child .vl-name').focus();
  });
  vlRows.addEventListener('click', function (e) {
    if (!e.target.closest('.vl-del')) return;
    e.target.closest('tr').remove();
    renderVlan();
  });
  ['vl-base', 'vl-pfx', 'vl-mode', 'vl-res'].forEach(function (id) { $(id).addEventListener('input', renderVlan); });
  vlRows.addEventListener('input', renderVlan);
  function needPlan(fn) {
    return function () { if (lastPlan) fn(); else flash($('vl-flash'), L('Erst die Fehler oben beheben.', 'Please fix the errors above first.')); };
  }
  $('vl-copy').addEventListener('click', needPlan(function () { copy(vlanMarkdown(), $('vl-flash')); }));
  $('vl-md').addEventListener('click', needPlan(function () { download('vlan-plan.md', vlanMarkdown(), 'text/markdown'); }));
  $('vl-csv').addEventListener('click', needPlan(function () { download('vlan-plan.csv', vlanCsv(), 'text/csv'); }));

  /* ======================================================================
     03 Checkliste für Änderungen
     ====================================================================== */
  var SECTIONS = [
    ['prep', 'Vorbereitung', 'Preparation'],
    ['run', 'Durchführung', 'Execution'],
    ['test', 'Test', 'Testing'],
    ['back', 'Rückweg', 'Rollback'],
    ['done', 'Abschluss', 'Wrap-up']
  ];

  var TYPES = {
    fw: {
      label: ['Firewall-Regeln', 'Firewall rules'],
      prep: [
        ['Konfiguration exportieren (OPNsense: System → Konfiguration → Sicherungen)', 'Export the configuration (OPNsense: System → Configuration → Backups)'],
        ['Zugang sichern, der von der Änderung nicht betroffen ist (Konsole oder Management-Netz)', 'Secure an access path the change does not touch (console or management network)'],
        ['Regelreihenfolge prüfen: Die erste passende Regel entscheidet', 'Check the rule order: the first matching rule decides']
      ],
      test: [
        ['Erlaubte Verbindungen testen (z. B. `ping`, `curl`, Port-Test)', 'Test allowed connections (e.g. `ping`, `curl`, port test)'],
        ['Gegenprobe: Was gesperrt sein soll, ist gesperrt', 'Cross-check: what should be blocked is blocked'],
        ['Live-Log der Firewall auf unerwartete Sperren prüfen', 'Check the live firewall log for unexpected blocks']
      ],
      back: [['Gesicherte Konfiguration zurückspielen oder die neue Regel deaktivieren', 'Restore the saved configuration or disable the new rule']]
    },
    vlan: {
      label: ['VLAN / Switch', 'VLAN / switch'],
      prep: [
        ['Port-Plan festhalten: tagged, untagged und PVID je Port', 'Record the port plan: tagged, untagged and PVID per port'],
        ['Konfiguration von Switch und Access Point sichern', 'Back up the switch and access point configuration'],
        ['Über einen Port arbeiten, der nicht geändert wird; Management-VLAN zuletzt ändern', 'Work through a port that is not being changed; change the management VLAN last']
      ],
      test: [
        ['Gerät bekommt per DHCP eine Adresse im richtigen Netz', 'Device gets a DHCP address in the right network'],
        ['Gateway und, falls erlaubt, Internet erreichbar', 'Gateway and, if allowed, the internet are reachable'],
        ['Gegenprobe: kein Zugriff in fremde Zonen', 'Cross-check: no access to other zones']
      ],
      back: [['Gesicherte Konfiguration von Switch und Access Point zurückspielen', 'Restore the saved switch and access point configuration']]
    },
    storage: {
      label: ['Storage / Datenträger', 'Storage / disks'],
      prep: [
        ['Vollständiges Backup erstellen und eine Testwiederherstellung machen', 'Create a full backup and do a test restore'],
        ['Datenträger eindeutig bestimmen (Seriennummer, `/dev/disk/by-id`), nicht nur `/dev/sdX`', 'Identify disks uniquely (serial number, `/dev/disk/by-id`), not just `/dev/sdX`'],
        ['SMART-Werte und Pool-Status vorher notieren', 'Note SMART values and pool status beforehand'],
        ['Daran denken: Ein Snapshot ersetzt kein Backup, er liegt auf demselben Datenträger', 'Keep in mind: a snapshot is not a backup, it lives on the same disk']
      ],
      test: [
        ['Pool- bzw. Dateisystemstatus prüfen (z. B. `zpool status`)', 'Check pool or file system status (e.g. `zpool status`)'],
        ['Dienste und VMs starten, Daten stichprobenartig öffnen', 'Start services and VMs, open sample data']
      ],
      back: [['Aus dem geprüften Backup wiederherstellen', 'Restore from the verified backup']]
    },
    update: {
      label: ['System-Update', 'System update'],
      prep: [
        ['Versionshinweise lesen (bekannte Probleme, inkompatible Änderungen)', 'Read the release notes (known issues, breaking changes)'],
        ['Aktuelle Versionen notieren', 'Record the current versions'],
        ['Snapshot oder Backup des Systems erstellen', 'Create a snapshot or backup of the system']
      ],
      test: [
        ['System startet, alle Dienste laufen', 'System boots, all services are running'],
        ['Logs auf neue Fehler prüfen', 'Check the logs for new errors']
      ],
      back: [['Snapshot zurückrollen oder Backup wiederherstellen', 'Roll back the snapshot or restore the backup']]
    },
    dns: {
      label: ['DNS', 'DNS'],
      prep: [
        ['Aktuelle Einträge sichern (Export oder Screenshot)', 'Save the current records (export or screenshot)'],
        ['TTL rechtzeitig vorher senken, damit Änderung und Rückweg schnell greifen', 'Lower the TTL well in advance so the change and the way back take effect quickly'],
        ['Einträge prüfen, die bleiben müssen (z. B. MX, TXT zur Verifizierung)', 'Check records that must stay (e.g. MX, TXT for verification)']
      ],
      test: [
        ['Abfrage beim zuständigen Nameserver und bei einem öffentlichen Resolver (`dig`, `nslookup`)', 'Query the authoritative name server and a public resolver (`dig`, `nslookup`)'],
        ['Dienst über den Namen aufrufen, HTTPS-Zertifikat prüfen', 'Open the service by name, check the HTTPS certificate']
      ],
      back: [['Alte Werte wieder eintragen; das wirkt erst nach Ablauf der TTL', 'Enter the old values again; this takes effect only after the TTL expires']]
    },
    vm: {
      label: ['VM / Proxmox', 'VM / Proxmox'],
      prep: [
        ['Snapshot anlegen (`qm snapshot <vmid> <name>`)', 'Create a snapshot (`qm snapshot <vmid> <name>`)'],
        ['Zusätzlich ein Backup mit `vzdump`, falls der Snapshot nicht reicht', 'Also create a `vzdump` backup in case the snapshot is not enough'],
        ['Freie Ressourcen auf dem Host prüfen (RAM, Speicher)', 'Check free resources on the host (RAM, storage)']
      ],
      test: [['VM startet, Dienste und Netzwerk laufen', 'VM boots, services and network are working']],
      back: [['Snapshot zurückrollen (`qm rollback <vmid> <name>`)', 'Roll back the snapshot (`qm rollback <vmid> <name>`)']],
      done: [['Snapshot nach erfolgreichem Test löschen, damit er nicht weiter wächst', 'Delete the snapshot after a successful test so it does not keep growing']]
    }
  };

  function buildChecklist() {
    var type = TYPES[$('cl-type').value] || TYPES.fw;
    var risk = $('cl-risk').value;
    var abort = Math.max(5, Number($('cl-abort').value) || 30);
    var mid = risk !== 'low', high = risk === 'high';
    var s = { prep: [], run: [], test: [], back: [], done: [] };
    function add(sec, pair) { s[sec].push(pair); }

    add('prep', ['Ziel und Grund der Änderung festhalten', 'Record the goal and the reason for the change']);
    add('prep', ['Betroffene Systeme, Dienste und Nutzer auflisten', 'List affected systems, services and users']);
    add('prep', ['Ist-Zustand dokumentieren (Screenshot oder Export)', 'Document the current state (screenshot or export)']);
    type.prep.forEach(function (p) { add('prep', p); });
    add('prep', ['Rückweg schriftlich festlegen, bevor etwas geändert wird', 'Write down the way back before changing anything']);
    if (mid) add('prep', ['Wartungsfenster festlegen und Betroffene informieren', 'Set a maintenance window and inform those affected']);
    if (high) {
      add('prep', ['Zweite Person einbinden (Vier-Augen-Prinzip)', 'Involve a second person (four-eyes principle)']);
      add('prep', ['Zeitpuffer einplanen, nicht direkt vor Feierabend', 'Plan a time buffer, not right before the end of the day']);
    }

    add('run', ['Uhrzeit und jeden Schritt mitschreiben', 'Log the time and every step']);
    add('run', ['Eine Änderung nach der anderen, nach jedem Schritt kurz prüfen', 'One change at a time, check briefly after each step']);
    add('run', ['Abbrechen, wenn ein Test fehlschlägt oder nach ' + abort + ' Minuten ohne Erfolg', 'Abort if a test fails or after ' + abort + ' minutes without success']);

    type.test.forEach(function (p) { add('test', p); });
    add('test', ['Ergebnis mit dem dokumentierten Ist-Zustand vergleichen', 'Compare the result with the documented current state']);

    type.back.forEach(function (p) { add('back', p); });
    add('back', ['Nach dem Rückweg erneut testen, ob der alte Zustand wieder läuft', 'Test again after rolling back that the old state works']);

    add('done', ['Dokumentation aktualisieren (Notion, GitHub)', 'Update the documentation (Notion, GitHub)']);
    add('done', ['Entscheidung mit Datum und Grund festhalten', 'Record the decision with date and reason']);
    (type.done || []).forEach(function (p) { add('done', p); });
    if (mid) add('done', ['Betroffene über den Abschluss informieren', 'Tell those affected that the change is complete']);

    return { sections: s, type: type, risk: risk, abort: abort };
  }

  /* Häkchen bleiben beim Umschalten von Art, Risiko oder Sprache erhalten (nur im Speicher der Seite) */
  var ticked = {};
  function itemKey(sec, pair) { return sec + '|' + pair[0]; }
  var RISK = { low: ['gering', 'low'], mid: ['mittel', 'medium'], high: ['hoch', 'high'] };

  function renderChecklist() {
    var c = buildChecklist();
    var html = '';
    SECTIONS.forEach(function (sec, si) {
      html += '<fieldset class="cl-sec"><legend><span class="cl-n">' + (si + 1) + '</span>' + esc(L(sec[1], sec[2])) + '</legend><ul>';
      c.sections[sec[0]].forEach(function (pair, i) {
        var key = itemKey(sec[0], pair), id = 'cl-' + sec[0] + '-' + i;
        html += '<li><label for="' + id + '"><input type="checkbox" id="' + id + '" data-key="' + esc(key) + '"' + (ticked[key] ? ' checked' : '') + '><span>' + codeHtml(t(pair)) + '</span></label></li>';
      });
      html += '</ul></fieldset>';
    });
    $('cl-out').innerHTML = html;
  }

  function checklistMarkdown() {
    var c = buildChecklist();
    var title = $('cl-title').value.trim(), system = $('cl-system').value.trim(), date = $('cl-date').value;
    var lines = ['# ' + L('Änderung', 'Change') + ': ' + (title ? md(title) : L('ohne Titel', 'untitled')), '',
      '- **' + L('Art', 'Type') + ':** ' + t(c.type.label),
      '- **' + L('Risiko', 'Risk') + ':** ' + t(RISK[c.risk])];
    if (system) lines.push('- **System:** ' + md(system));
    if (date) lines.push('- **' + L('Termin', 'Date') + ':** ' + date);
    lines.push('- **' + L('Abbruch nach', 'Abort after') + ':** ' + c.abort + L(' Minuten', ' minutes'));
    SECTIONS.forEach(function (sec, si) {
      lines.push('', '## ' + (si + 1) + '. ' + L(sec[1], sec[2]), '');
      c.sections[sec[0]].forEach(function (pair) {
        lines.push('- [' + (ticked[itemKey(sec[0], pair)] ? 'x' : ' ') + '] ' + codeMd(t(pair)));
      });
    });
    lines.push('', L('Erstellt mit der Checkliste auf matija-tasic.de', 'Created with the checklist on matija-tasic.de'));
    return lines.join('\n') + '\n';
  }

  function fillTypes() {
    var sel = $('cl-type'), cur = sel.value || 'fw';
    sel.innerHTML = Object.keys(TYPES).map(function (k) { return '<option value="' + k + '">' + esc(t(TYPES[k].label)) + '</option>'; }).join('');
    sel.value = cur;
  }

  $('cl-out').addEventListener('change', function (e) {
    var k = e.target.getAttribute && e.target.getAttribute('data-key');
    if (k) ticked[k] = e.target.checked;
  });
  ['cl-type', 'cl-risk', 'cl-abort'].forEach(function (id) { $(id).addEventListener('input', renderChecklist); });
  $('cl-copy').addEventListener('click', function () { copy(checklistMarkdown(), $('cl-flash')); });
  $('cl-md').addEventListener('click', function () {
    var slug = $('cl-title').value.trim().toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
    download((L('aenderung', 'change')) + (slug ? '-' + slug : '') + '.md', checklistMarkdown(), 'text/markdown');
  });

  /* ---------- Start und Sprachwechsel ---------- */
  function renderAll() {
    translateOptions();
    fillTypes();
    renderSubnet();
    renderOverlap();
    renderVlan();
    renderChecklist();
  }
  new MutationObserver(renderAll).observe(root, { attributes: true, attributeFilter: ['lang'] });
  renderAll();
})();
