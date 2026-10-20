/* matija-tasic.de · Werkzeuge (werkzeuge.html)
   - Subnetzrechner, VLAN-Planer, Port-Nachschlagewerk (Daten in ports.js),
     Passwortgenerator (pwgen.js), Hash-Rechner (hash.js)
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
     03 Port-Nachschlagewerk
     ====================================================================== */
  var PD = window.PortData;
  var RANGE = {
    system: ['System-Port (0–1023), von der IANA fest vergeben', 'system port (0–1023), assigned by IANA'],
    registered: ['registrierter Port (1024–49151)', 'registered port (1024–49151)'],
    dynamic: ['dynamischer Port (49152–65535), wird vom Betriebssystem für ausgehende Verbindungen genutzt', 'dynamic port (49152–65535), used by the operating system for outgoing connections']
  };
  var ptSel = $('pt-sel'), ptNum = $('pt-num');
  var current = 443;
  function byPort(n) { for (var i = 0; i < PD.PORTS.length; i++) if (PD.PORTS[i].port === n) return PD.PORTS[i]; return null; }
  function pName(p) { return Array.isArray(p.name) ? t(p.name) : p.name; }
  function cap(x) { return x.charAt(0).toUpperCase() + x.slice(1); }
  function protoText(p) { return p.tcp && p.udp ? L('TCP und UDP', 'TCP and UDP') : p.tcp ? L('nur TCP', 'TCP only') : L('nur UDP', 'UDP only'); }

  /* Auswahlliste nach Bereichen gruppiert, innerhalb aufsteigend nach Port */
  function fillPorts() {
    ptSel.innerHTML = Object.keys(PD.CATEGORIES).map(function (k) {
      var list = PD.PORTS.filter(function (p) { return p.cat === k; });
      if (!list.length) return '';
      return '<optgroup label="' + esc(t(PD.CATEGORIES[k])) + '">' + list.map(function (p) {
        return '<option value="' + p.port + '">' + p.port + ' · ' + esc(pName(p)) + '</option>';
      }).join('') + '</optgroup>';
    }).join('');
    if (byPort(current)) ptSel.value = String(current);
  }

  function renderPorts() {
    var msg = $('pt-msg'), card = $('pt-card');
    var p = byPort(current);
    msg.textContent = ''; msg.className = 'tool-msg';
    if (!p) {
      card.innerHTML = '';
      if (current === null) return;
      if (current > 65535) { msg.textContent = L('Ports gibt es nur von 0 bis 65535.', 'Ports only exist from 0 to 65535.'); msg.className = 'tool-msg err'; return; }
      msg.textContent = L('Port ' + current + ' steht nicht im Lexikon. Er ist ein ', 'Port ' + current + ' is not in the lexicon. It is a ') + t(RANGE[PD.portRange(current)]) + '.';
      return;
    }
    var badge = function (on, label) {
      return '<span class="pt-proto' + (on ? ' is-on' : '') + '">' + label + '<span class="pt-yn">' + (on ? L('ja', 'yes') : L('nein', 'no')) + '</span></span>';
    };
    var rel = p.related.filter(byPort).map(function (n) {
      return '<button type="button" class="pt-chip" data-port="' + n + '"><code>' + n + '</code> ' + esc(pName(byPort(n))) + '</button>';
    }).join('');
    card.innerHTML =
      '<header class="pt-top"><span class="pt-num">' + p.port + '</span><div><h3 class="pt-name">' + esc(pName(p)) + '</h3>' +
      '<span class="pt-cat">' + esc(t(PD.CATEGORIES[p.cat])) + ' · ' + esc(cap(t(RANGE[PD.portRange(p.port)]).split(',')[0])) + '</span></div></header>' +
      '<div class="pt-protos" aria-label="' + esc(protoText(p)) + '">' + badge(p.tcp, 'TCP') + badge(p.udp, 'UDP') +
      '<span class="pt-both">' + esc(protoText(p)) + '</span></div>' +
      '<h4>' + L('Wofür', 'What it is for') + '</h4><p>' + esc(t(p.desc)) + '</p>' +
      '<h4>' + L('Hinweis für die Firewall', 'Firewall note') + '</h4><p>' + esc(t(p.note)) + '</p>' +
      (rel ? '<h4>' + L('Verwandte Ports', 'Related ports') + '</h4><div class="pt-rel">' + rel + '</div>' : '');
  }

  function showPort(n) {
    current = n;
    if (byPort(n)) ptSel.value = String(n);
    renderPorts();
  }

  if (PD) {
    ptSel.addEventListener('change', function () { ptNum.value = ''; showPort(Number(ptSel.value)); });
    ptNum.addEventListener('input', function () {
      var v = ptNum.value.replace(/\D/g, '');
      if (v !== ptNum.value) ptNum.value = v;
      if (!v) { showPort(Number(ptSel.value)); return; }
      showPort(Number(v));
    });
    $('pt-card').addEventListener('click', function (e) {
      var b = e.target.closest('.pt-chip');
      if (!b) return;
      ptNum.value = '';
      showPort(Number(b.getAttribute('data-port')));
    });
  }

  /* ======================================================================
     04 Passwortgenerator (Logik in pwgen.js)
     ====================================================================== */
  var PW = window.PwGen;
  var pwLen = $('pw-len'), pwVal = $('pw-val');
  var PW_RATE = [['schwach', 'weak'], ['mittel', 'fair'], ['stark', 'strong'], ['sehr stark', 'very strong']];

  function pwOpts() {
    return {
      length: Number(pwLen.value),
      lower: $('pw-lower').checked, upper: $('pw-upper').checked,
      digits: $('pw-digits').checked, symbols: $('pw-symbols').checked,
      noSimilar: $('pw-similar').checked
    };
  }
  function pwRate() {
    var o = pwOpts(), bits = PW.entropy(o), r = PW.rating(bits);
    $('pw-len-val').textContent = o.length;
    $('pw-bar').style.width = Math.min(100, Math.round(bits / 1.4)) + '%';
    $('pw-bar').className = 'r' + r;
    $('pw-rate').textContent = bits ? L('Stärke: ', 'Strength: ') + t(PW_RATE[r]) + ' · ' + bits + ' Bit' : '';
  }
  function pwNew() {
    var msg = $('pw-msg'), pw = null;
    msg.textContent = ''; msg.className = 'tool-msg';
    try { pw = PW.generate(pwOpts()); }
    catch (e) { msg.textContent = L('Ihr Browser bietet keinen sicheren Zufallsgenerator.', 'Your browser offers no secure random number generator.'); msg.className = 'tool-msg err'; }
    if (pw === null && !msg.textContent) { msg.textContent = L('Bitte mindestens eine Zeichenart wählen.', 'Please select at least one character type.'); msg.className = 'tool-msg err'; }
    pwVal.textContent = pw || '';
    pwRate();
  }
  if (PW) {
    pwLen.addEventListener('input', pwNew);
    ['pw-lower', 'pw-upper', 'pw-digits', 'pw-symbols', 'pw-similar'].forEach(function (id) { $(id).addEventListener('change', pwNew); });
    $('pw-new').addEventListener('click', pwNew);
    $('pw-copy').addEventListener('click', function () { if (pwVal.textContent) copy(pwVal.textContent, $('pw-flash')); });
    pwNew();
  }

  /* ======================================================================
     05 Hash-Rechner (Logik in hash.js)
     Die Datei wird in Stücken gelesen, damit auch mehrere GB große ISOs gehen.
     ====================================================================== */
  var HC = window.HashCalc;
  var hsAlg = $('hs-alg'), hsExp = $('hs-exp'), hsFile = $('hs-file'), hsDrop = $('hs-drop');
  var hsCurrent = null;  /* { file, alg, hex } nach fertiger Berechnung */
  var hsJob = 0;         /* zählt hoch; ältere Läufe brechen dann ab */
  var CHUNK = 2 * 1024 * 1024;

  function size(n) {
    var u = ['Byte', 'KB', 'MB', 'GB', 'TB'], i = 0;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return (i ? n.toLocaleString(lang() === 'en' ? 'en-GB' : 'de-DE', { maximumFractionDigits: 1 }) : n) + ' ' + u[i];
  }
  function readSlice(blob) {
    if (blob.arrayBuffer) return blob.arrayBuffer();
    return new Promise(function (ok, fail) {
      var r = new FileReader();
      r.onload = function () { ok(r.result); };
      r.onerror = function () { fail(r.error); };
      r.readAsArrayBuffer(blob);
    });
  }

  /* Gültig eingefügte Prüfsumme oder null */
  function hsExpected() {
    var e = HC.parseExpected(hsExp.value);
    return e && e.hex && e.alg ? e : null;
  }

  function hsVerdict() {
    var box = $('hs-verdict'), e = hsExpected();
    box.className = 'hs-verdict'; box.textContent = '';
    if (!hsCurrent || !e) return;
    if (e.alg !== hsCurrent.alg) return;
    var ok = e.hex === hsCurrent.hex;
    box.className = 'hs-verdict ' + (ok ? 'ok' : 'err');
    box.textContent = ok
      ? L('Stimmt überein. Die Datei ist unverändert.', 'Match. The file is unchanged.')
      : L('Stimmt NICHT überein. Datei nicht verwenden, erneut herunterladen.', 'Does NOT match. Do not use the file, download it again.');
  }

  function hsShow() {
    var out = $('hs-out');
    if (!hsCurrent) { out.innerHTML = ''; $('hs-actions').hidden = true; return; }
    var f = hsCurrent.file;
    out.innerHTML =
      '<div><dt>' + L('Datei', 'File') + '</dt><dd>' + esc(f.name) + '</dd></div>' +
      '<div><dt>' + L('Größe', 'Size') + '</dt><dd>' + esc(size(f.size)) + '</dd></div>' +
      '<div><dt>' + L('Verfahren', 'Algorithm') + '</dt><dd>' + HC.ALGS[hsCurrent.alg].name + '</dd></div>' +
      '<div class="kv-wide"><dt>' + L('Prüfsumme', 'Checksum') + '</dt><dd><code>' + hsCurrent.hex + '</code></dd></div>';
    $('hs-actions').hidden = false;
    hsVerdict();
  }

  function hsRun(file) {
    var job = ++hsJob, alg = hsAlg.value, h = HC.create(alg), pos = 0;
    var prog = $('hs-prog'), bar = $('hs-bar'), pct = $('hs-pct'), t0 = Date.now();
    hsCurrent = null; hsShow(); $('hs-verdict').className = 'hs-verdict'; $('hs-verdict').textContent = '';
    prog.hidden = false; bar.style.width = '0%';
    function step() {
      if (job !== hsJob) return;
      if (pos >= file.size) {
        prog.hidden = true;
        hsCurrent = { file: file, alg: alg, hex: h.digest() };
        hsShow();
        return;
      }
      readSlice(file.slice(pos, pos + CHUNK)).then(function (buf) {
        if (job !== hsJob) return;
        h.update(new Uint8Array(buf));
        pos += buf.byteLength;
        var p = file.size ? pos / file.size : 1, sec = (Date.now() - t0) / 1000;
        bar.style.width = Math.round(p * 100) + '%';
        pct.textContent = Math.floor(p * 100) + ' % · ' + size(pos) + ' / ' + size(file.size) +
          (sec > 1 ? ' · ' + size(pos / sec) + '/s' : '');
        setTimeout(step, 0);
      }, function () {
        prog.hidden = true;
        $('hs-verdict').className = 'hs-verdict err';
        $('hs-verdict').textContent = L('Die Datei konnte nicht gelesen werden.', 'The file could not be read.');
      });
    }
    step();
  }

  function hsText() {
    var v = $('hs-text').value, alg = hsAlg.value;
    $('hs-text-out').innerHTML = '<div class="kv-wide"><dt>' + HC.ALGS[alg].name + '</dt><dd><code>' + HC.hashText(alg, v) + '</code></dd></div>';
  }

  if (HC) {
    hsFile.addEventListener('change', function () { if (hsFile.files[0]) hsRun(hsFile.files[0]); });
    ['dragenter', 'dragover'].forEach(function (ev) {
      hsDrop.addEventListener(ev, function (e) { e.preventDefault(); hsDrop.classList.add('is-over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      hsDrop.addEventListener(ev, function () { hsDrop.classList.remove('is-over'); });
    });
    hsDrop.addEventListener('drop', function (e) {
      e.preventDefault();
      var f = e.dataTransfer && e.dataTransfer.files[0];
      if (f) hsRun(f);
    });
    $('hs-stop').addEventListener('click', function () { hsJob++; $('hs-prog').hidden = true; hsFile.value = ''; });
    hsAlg.addEventListener('change', function () {
      hsText();
      if (hsCurrent) hsRun(hsCurrent.file);
      else hsVerdict();
    });
    /* Eingefügte Prüfsumme bestimmt das Verfahren (64 Zeichen → SHA-256 usw.) */
    hsExp.addEventListener('input', function () {
      var raw = HC.parseExpected(hsExp.value), e = hsExpected(), msg = $('hs-exp-msg');
      msg.textContent = ''; msg.className = 'tool-msg';
      if (raw && !e) {
        msg.textContent = L('Keine Prüfsumme erkannt. Erwartet werden 32, 40, 64 oder 128 Hex-Zeichen.', 'No checksum recognised. Expected 32, 40, 64 or 128 hex characters.');
        msg.className = 'tool-msg err';
      }
      if (e && e.alg !== hsAlg.value) {
        hsAlg.value = e.alg;
        msg.textContent = L('Verfahren anhand der Länge erkannt: ', 'Algorithm detected from the length: ') + HC.ALGS[e.alg].name;
        hsText();
        if (hsCurrent) { hsRun(hsCurrent.file); return; }
      }
      hsVerdict();
    });
    $('hs-text').addEventListener('input', hsText);
    $('hs-copy').addEventListener('click', function () { if (hsCurrent) copy(hsCurrent.hex, $('hs-flash')); });
  }

  /* ---------- Start und Sprachwechsel ---------- */
  function renderAll() {
    translateOptions();
    renderSubnet();
    renderOverlap();
    renderVlan();
    if (PD) { fillPorts(); renderPorts(); }
    if (PW) pwRate();
    if (HC) { hsText(); hsShow(); }
  }
  new MutationObserver(renderAll).observe(root, { attributes: true, attributeFilter: ['lang'] });
  renderAll();
})();
