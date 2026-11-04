/* matija-tasic.de · Firewall-Zonen-Matrix: Rechenlogik
   - nur Logik, keine Oberfläche; läuft im Browser und in Node (tests/fwmatrix.test.js)
   - Zustand: { zones: [{id, name, type, vlan, net}], cells: {"quelle>ziel": {mode, ports}}, dnsNtp }
   - Ziel "wan" ist das Internet: fest, nicht löschbar, nur als Ziel
   - Netz-Prüfungen nutzen ipcalc.js (IPCalc)
*/
(function (global) {
  'use strict';

  var IP = (typeof module !== 'undefined' && module.exports) ? require('./ipcalc.js') : global.IPCalc;

  var WAN = 'wan';
  var MAX_ZONES = 8;
  var TYPES = ['std', 'mgmt', 'server', 'iot', 'guest'];
  var MODES = ['block', 'ports', 'allow'];
  var CLEAR = { 21: 'FTP', 23: 'Telnet', 69: 'TFTP', 110: 'POP3', 143: 'IMAP' };

  function key(src, dst) { return src + '>' + dst; }

  /* Ports lesen: "443, 22", "8000-8100", "123/udp", "53/any" (TCP und UDP).
     Ohne Angabe gilt TCP. Ergebnis: { list: [{proto, from, to}] } oder { error, token } */
  function parsePorts(str) {
    var s = String(str || '').trim();
    if (!s) return { error: 'empty' };
    var parts = s.split(/[\s,;]+/).filter(Boolean), list = [];
    for (var i = 0; i < parts.length; i++) {
      var m = /^(\d{1,5})(?:-(\d{1,5}))?(?:\/(tcp|udp|any))?$/i.exec(parts[i]);
      if (!m) return { error: 'format', token: parts[i] };
      var a = Number(m[1]), b = m[2] ? Number(m[2]) : a;
      if (a < 1 || b > 65535 || a > b) return { error: 'range', token: parts[i] };
      var proto = (m[3] || 'tcp').toLowerCase();
      var dup = list.some(function (p) { return p.proto === proto && p.from === a && p.to === b; });
      if (!dup) list.push({ proto: proto, from: a, to: b });
    }
    return { list: list };
  }

  /* Ports für die Ausgabe: "TCP/UDP 53 · TCP 443, 22 · UDP 123" */
  function formatPorts(list) {
    var order = ['any', 'tcp', 'udp'], label = { tcp: 'TCP', udp: 'UDP', any: 'TCP/UDP' }, out = [];
    order.forEach(function (pr) {
      var ps = list.filter(function (p) { return p.proto === pr; })
        .map(function (p) { return p.from === p.to ? String(p.from) : p.from + '-' + p.to; });
      if (ps.length) out.push(label[pr] + ' ' + ps.join(', '));
    });
    return out.join(' · ');
  }

  function cell(state, src, dst) {
    var c = state.cells && state.cells[key(src, dst)];
    return c && MODES.indexOf(c.mode) >= 0 ? c : { mode: 'block', ports: '' };
  }

  /* Nächster Zustand beim Klick: blockiert → nur Ports → erlaubt → blockiert */
  function nextMode(mode) { return MODES[(MODES.indexOf(mode) + 1) % MODES.length] || 'block'; }

  function parseNet(str) {
    var s = String(str || '').trim();
    if (!s) return null;
    var c = IP.parseCidr(s);
    if (c.error || s.indexOf('/') < 0) return { error: true };
    return { ip: IP.networkOf(c.ip, c.prefix), prefix: c.prefix, exact: IP.networkOf(c.ip, c.prefix) === c.ip };
  }

  /* Prüfungen. Liefert [{level: 'err'|'warn'|'info', code, ...}] */
  function check(state) {
    var out = [], zones = state.zones || [];
    if (!zones.length) { out.push({ level: 'info', code: 'no-zones' }); return out; }
    var names = {}, vlans = {}, nets = [];
    zones.forEach(function (z, i) {
      var n = String(z.name || '').trim();
      if (!n) out.push({ level: 'err', code: 'name-empty', row: i + 1 });
      else if (names[n.toLowerCase()]) out.push({ level: 'err', code: 'name-dup', name: n });
      else names[n.toLowerCase()] = true;
      var v = String(z.vlan == null ? '' : z.vlan).trim();
      if (v !== '') {
        var vn = Number(v);
        if (!/^\d+$/.test(v) || vn < 1 || vn > 4094) out.push({ level: 'err', code: 'vlan-range', zone: n || '#' + (i + 1) });
        else if (vlans[vn]) out.push({ level: 'err', code: 'vlan-dup', vlan: vn });
        else vlans[vn] = true;
      }
      var p = parseNet(z.net);
      if (p && p.error) out.push({ level: 'err', code: 'net-invalid', zone: n || '#' + (i + 1) });
      else if (p) {
        if (!p.exact) out.push({ level: 'warn', code: 'net-host', zone: n || '#' + (i + 1), net: IP.formatIp(p.ip) + '/' + p.prefix });
        nets.forEach(function (o) {
          if (IP.overlaps(o.p, p)) out.push({ level: 'err', code: 'net-overlap', a: o.name, b: n || '#' + (i + 1) });
        });
        nets.push({ name: n || '#' + (i + 1), p: p });
      }
    });

    var byId = {};
    zones.forEach(function (z) { byId[z.id] = z; });
    zones.forEach(function (s) {
      zones.concat([{ id: WAN, name: 'Internet', type: 'wan' }]).forEach(function (d) {
        if (s.id === d.id) return;
        var c = cell(state, s.id, d.id);
        if (c.mode === 'block') return;
        var sn = s.name || '?', dn = d.name || '?', internal = d.id !== WAN;
        if (c.mode === 'ports') {
          var pp = parsePorts(c.ports);
          if (pp.error === 'empty') out.push({ level: 'err', code: 'ports-empty', src: sn, dst: dn });
          else if (pp.error) out.push({ level: 'err', code: 'ports-invalid', src: sn, dst: dn, token: pp.token });
          else pp.list.forEach(function (p) {
            Object.keys(CLEAR).forEach(function (k) {
              if (Number(k) >= p.from && Number(k) <= p.to) out.push({ level: 'info', code: 'cleartext', src: sn, dst: dn, port: Number(k), svc: CLEAR[k] });
            });
          });
        }
        if (!internal) return;
        if (s.type === 'guest') out.push({ level: 'warn', code: 'guest-internal', src: sn, dst: dn });
        else if (d.type === 'mgmt' && s.type !== 'mgmt' && c.mode === 'allow') out.push({ level: 'warn', code: 'to-mgmt', src: sn, dst: dn });
        else if (s.type === 'iot' && c.mode === 'allow') out.push({ level: 'warn', code: 'iot-full', src: sn, dst: dn });
        else if (c.mode === 'allow' && s.type !== 'mgmt') out.push({ level: 'info', code: 'full-internal', src: sn, dst: dn });
      });
    });
    return out;
  }

  /* Regelliste in sinnvoller Reihenfolge (erste passende Regel greift):
     1. optional DNS/NTP zur Firewall
     2. Freigaben zwischen Zonen (je Quelle, gleiche Ports zusammengefasst)
     3. alle Zonen → interne Netze blockieren
     4. Freigaben ins Internet
     5. Standard: alles andere blockieren */
  function rules(state) {
    var zones = (state.zones || []).filter(function (z) { return String(z.name || '').trim(); });
    var out = [];
    if (!zones.length) return out;
    var all = zones.map(function (z) { return z.id; });

    if (state.dnsNtp) out.push({ action: 'pass', src: all, dst: ['fw'], ports: [{ proto: 'any', from: 53, to: 53 }, { proto: 'udp', from: 123, to: 123 }], kind: 'dns' });

    function group(src, dsts) {
      var full = [], byPorts = {}, order = [];
      dsts.forEach(function (d) {
        var c = cell(state, src.id, d.id);
        if (c.mode === 'allow') full.push(d.id);
        else if (c.mode === 'ports') {
          var pp = parsePorts(c.ports);
          if (pp.error) return;
          var k = formatPorts(pp.list);
          if (!byPorts[k]) { byPorts[k] = { list: pp.list, dst: [] }; order.push(k); }
          byPorts[k].dst.push(d.id);
        }
      });
      return { full: full, ports: order.map(function (k) { return byPorts[k]; }) };
    }

    zones.forEach(function (s) {
      var g = group(s, zones.filter(function (d) { return d.id !== s.id; }));
      g.ports.forEach(function (p) { out.push({ action: 'pass', src: [s.id], dst: p.dst, ports: p.list, kind: 'zone' }); });
      if (g.full.length) out.push({ action: 'pass', src: [s.id], dst: g.full, ports: null, kind: 'zone' });
    });

    out.push({ action: 'block', src: all, dst: ['internal'], ports: null, kind: 'internal' });

    var wanFull = [], wanPorts = {}, wanOrder = [];
    zones.forEach(function (s) {
      var c = cell(state, s.id, WAN);
      if (c.mode === 'allow') wanFull.push(s.id);
      else if (c.mode === 'ports') {
        var pp = parsePorts(c.ports);
        if (pp.error) return;
        var k = formatPorts(pp.list);
        if (!wanPorts[k]) { wanPorts[k] = { list: pp.list, src: [] }; wanOrder.push(k); }
        wanPorts[k].src.push(s.id);
      }
    });
    if (wanFull.length) out.push({ action: 'pass', src: wanFull, dst: [WAN], ports: null, kind: 'wan' });
    wanOrder.forEach(function (k) { out.push({ action: 'pass', src: wanPorts[k].src, dst: [WAN], ports: wanPorts[k].list, kind: 'wan' }); });

    out.push({ action: 'block', src: ['any'], dst: ['any'], ports: null, kind: 'default' });
    return out;
  }

  /* Gespeicherten Zustand prüfen und bereinigen (localStorage kann alles enthalten) */
  function sanitize(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.zones)) return null;
    var zones = [], ids = {};
    raw.zones.slice(0, MAX_ZONES).forEach(function (z) {
      if (!z || typeof z !== 'object') return;
      var id = String(z.id || '');
      if (!/^z\d{1,6}$/.test(id) || ids[id]) return;
      ids[id] = true;
      zones.push({
        id: id,
        name: String(z.name == null ? '' : z.name).slice(0, 24),
        type: TYPES.indexOf(z.type) >= 0 ? z.type : 'std',
        vlan: String(z.vlan == null ? '' : z.vlan).slice(0, 4),
        net: String(z.net == null ? '' : z.net).slice(0, 18)
      });
    });
    var cells = {};
    if (raw.cells && typeof raw.cells === 'object') {
      Object.keys(raw.cells).forEach(function (k) {
        var m = /^(z\d{1,6})>(z\d{1,6}|wan)$/.exec(k), c = raw.cells[k];
        if (!m || !ids[m[1]] || (m[2] !== WAN && !ids[m[2]]) || m[1] === m[2] || !c || MODES.indexOf(c.mode) < 0) return;
        cells[k] = { mode: c.mode, ports: String(c.ports == null ? '' : c.ports).slice(0, 60) };
      });
    }
    return { zones: zones, cells: cells, dnsNtp: raw.dnsNtp !== false };
  }

  /* Neue Zonen-ID, die noch nicht vergeben ist */
  function newId(state) {
    var max = 0;
    (state.zones || []).forEach(function (z) { var n = Number(String(z.id).slice(1)); if (n > max) max = n; });
    return 'z' + (max + 1);
  }

  /* Zone entfernen: Zeile und Spalte (alle Felder mit dieser Zone) verschwinden */
  function removeZone(state, id) {
    state.zones = state.zones.filter(function (z) { return z.id !== id; });
    Object.keys(state.cells).forEach(function (k) {
      var p = k.split('>');
      if (p[0] === id || p[1] === id) delete state.cells[k];
    });
    return state;
  }

  /* Beispiel wie im Heimnetz-Projekt: LAN, Server, IoT, Gäste, Management */
  function example(lang) {
    var en = lang === 'en';
    var s = {
      zones: [
        { id: 'z1', name: 'LAN', type: 'std', vlan: '10', net: '10.0.10.0/24' },
        { id: 'z2', name: 'Server', type: 'server', vlan: '20', net: '10.0.20.0/24' },
        { id: 'z3', name: 'IoT', type: 'iot', vlan: '30', net: '10.0.30.0/24' },
        { id: 'z4', name: en ? 'Guests' : 'Gäste', type: 'guest', vlan: '40', net: '10.0.40.0/24' },
        { id: 'z5', name: 'Mgmt', type: 'mgmt', vlan: '99', net: '10.0.99.0/24' }
      ],
      cells: {},
      dnsNtp: true
    };
    function set(a, b, mode, ports) { s.cells[key(a, b)] = { mode: mode, ports: ports || '' }; }
    set('z1', 'z2', 'ports', '443, 22'); set('z1', 'z3', 'ports', '80, 443'); set('z1', WAN, 'allow');
    set('z2', WAN, 'allow');
    set('z3', 'z2', 'ports', '1883'); set('z3', WAN, 'ports', '443');
    set('z4', WAN, 'allow');
    set('z5', 'z1', 'allow'); set('z5', 'z2', 'allow'); set('z5', 'z3', 'allow'); set('z5', WAN, 'ports', '443');
    return s;
  }

  var api = {
    WAN: WAN, MAX_ZONES: MAX_ZONES, TYPES: TYPES, MODES: MODES,
    key: key, parsePorts: parsePorts, formatPorts: formatPorts, cell: cell, nextMode: nextMode,
    parseNet: parseNet, check: check, rules: rules, sanitize: sanitize, newId: newId, removeZone: removeZone, example: example
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.FwMatrix = api;
})(this);
