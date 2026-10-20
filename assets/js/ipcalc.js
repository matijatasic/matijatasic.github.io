/* matija-tasic.de · IPv4-Rechenlogik für die Werkzeuge
   - nur Rechnen, keine Oberfläche; läuft im Browser und in Node (tests/ipcalc.test.js)
   - Adressen werden intern als vorzeichenlose 32-Bit-Zahl geführt
*/
(function (global) {
  'use strict';

  var MAX = 4294967296; // 2^32

  /* "192.168.10.1" → Zahl, sonst null. Führende Nullen ("010") werden abgelehnt,
     weil manche Programme sie als Oktalzahl lesen. */
  function parseIp(str) {
    var parts = String(str).trim().split('.');
    if (parts.length !== 4) return null;
    var n = 0;
    for (var i = 0; i < 4; i++) {
      var p = parts[i];
      if (!/^(0|[1-9]\d{0,2})$/.test(p)) return null;
      var v = Number(p);
      if (v > 255) return null;
      n = n * 256 + v;
    }
    return n;
  }

  function formatIp(n) {
    return [Math.floor(n / 16777216) % 256, Math.floor(n / 65536) % 256, Math.floor(n / 256) % 256, n % 256].join('.');
  }

  function maskFromPrefix(prefix) {
    return prefix === 0 ? 0 : MAX - Math.pow(2, 32 - prefix);
  }

  /* Maske "255.255.255.0" → 24, sonst null (nicht zusammenhängende Masken sind ungültig) */
  function prefixFromMask(str) {
    var m = parseIp(str);
    if (m === null) return null;
    for (var p = 0; p <= 32; p++) if (maskFromPrefix(p) === m) return p;
    return null;
  }

  /* Akzeptiert "10.0.0.5/24", "10.0.0.5/255.255.255.0", "10.0.0.5 255.255.255.0" und "10.0.0.5" (= /32).
     Ergebnis: { ip, prefix } oder { error } mit Fehlerschlüssel. */
  function parseCidr(str) {
    var s = String(str).trim();
    if (!s) return { error: 'empty' };
    var m = s.split(/\s*\/\s*|\s+/);
    if (m.length > 2) return { error: 'format' };
    var ip = parseIp(m[0]);
    if (ip === null) return { error: 'ip' };
    var prefix = 32;
    if (m.length === 2) {
      if (/^\d{1,2}$/.test(m[1])) {
        prefix = Number(m[1]);
        if (prefix > 32) return { error: 'prefix' };
      } else {
        prefix = prefixFromMask(m[1]);
        if (prefix === null) return { error: 'mask' };
      }
    }
    return { ip: ip, prefix: prefix };
  }

  function networkOf(ip, prefix) {
    var size = Math.pow(2, 32 - prefix);
    return ip - (ip % size);
  }

  /* Adressbereich einordnen (RFC 1918, 6598, 3927, 5737 …) */
  var RANGES = [
    ['0.0.0.0', 8, 'this'],
    ['10.0.0.0', 8, 'private'],
    ['100.64.0.0', 10, 'cgnat'],
    ['127.0.0.0', 8, 'loopback'],
    ['169.254.0.0', 16, 'linklocal'],
    ['172.16.0.0', 12, 'private'],
    ['192.0.2.0', 24, 'doc'],
    ['192.168.0.0', 16, 'private'],
    ['198.18.0.0', 15, 'benchmark'],
    ['198.51.100.0', 24, 'doc'],
    ['203.0.113.0', 24, 'doc'],
    ['224.0.0.0', 4, 'multicast'],
    ['240.0.0.0', 4, 'reserved']
  ].map(function (r) { return { net: parseIp(r[0]), prefix: r[1], kind: r[2] }; });

  function classify(ip) {
    if (ip === MAX - 1) return 'broadcast';
    for (var i = 0; i < RANGES.length; i++) {
      var r = RANGES[i];
      if (networkOf(ip, r.prefix) === r.net) return r.kind;
    }
    return 'public';
  }

  /* Alle Kennzahlen eines Netzes. /31 hat nach RFC 3021 zwei nutzbare Adressen, /32 eine. */
  function subnet(ip, prefix) {
    var size = Math.pow(2, 32 - prefix);
    var net = networkOf(ip, prefix);
    var bcast = net + size - 1;
    var first, last, hosts;
    if (prefix >= 31) { first = net; last = bcast; hosts = size; }
    else { first = net + 1; last = bcast - 1; hosts = size - 2; }
    var mask = maskFromPrefix(prefix);
    return {
      ip: ip,
      prefix: prefix,
      network: net,
      broadcast: bcast,
      first: first,
      last: last,
      hosts: hosts,
      size: size,
      mask: mask,
      wildcard: MAX - 1 - mask,
      isHostAddress: ip !== net && prefix < 31,
      kind: classify(net)
    };
  }

  function contains(net, prefix, ip) {
    return networkOf(ip, prefix) === networkOf(net, prefix);
  }

  function overlaps(a, b) {
    var p = Math.min(a.prefix, b.prefix);
    return networkOf(a.ip, p) === networkOf(b.ip, p);
  }

  function toBinary(n) {
    var s = '';
    for (var i = 31; i >= 0; i--) {
      s += Math.floor(n / Math.pow(2, i)) % 2;
      if (i % 8 === 0 && i) s += '.';
    }
    return s;
  }

  /* Kleinstes Präfix für eine Anzahl Geräte. Netz- und Broadcastadresse und das Gateway
     werden dazugerechnet, damit wirklich "devices" Adressen frei bleiben. */
  function prefixForDevices(devices) {
    var need = devices + 3;
    for (var p = 30; p >= 0; p--) if (Math.pow(2, 32 - p) >= need) return p;
    return null;
  }

  /* VLSM: Netze nach Größe absteigend und lückenlos an ihrer Grenze ausgerichtet vergeben.
     vlans: [{ id, name, devices }]. Ergebnis: { plan: [...in Eingabereihenfolge], used, free } oder { error, index }. */
  function planVlsm(baseIp, basePrefix, vlans) {
    var base = networkOf(baseIp, basePrefix);
    var end = base + Math.pow(2, 32 - basePrefix);
    var order = vlans.map(function (v, i) { return { v: v, i: i, prefix: prefixForDevices(v.devices) }; });
    for (var k = 0; k < order.length; k++) {
      if (order[k].prefix === null || order[k].prefix < basePrefix) return { error: 'toolarge', index: order[k].i };
    }
    order.sort(function (a, b) { return a.prefix - b.prefix || a.i - b.i; });
    var cursor = base;
    var out = [];
    for (var j = 0; j < order.length; j++) {
      var size = Math.pow(2, 32 - order[j].prefix);
      if (cursor % size) cursor += size - (cursor % size);
      if (cursor + size > end) return { error: 'nospace', index: order[j].i };
      out[order[j].i] = subnet(cursor, order[j].prefix);
      cursor += size;
    }
    return { plan: out, used: cursor - base, total: end - base };
  }

  /* Je VLAN ein /24, drittes Oktett = VLAN-ID (z. B. 10.20.30.0/24 für VLAN 30).
     Geht nur, wenn das Basisnetz /16 oder größer ist und alle IDs ≤ 255 sind. */
  function planById(baseIp, basePrefix, vlans) {
    if (basePrefix > 16) return { error: 'base16' };
    var base = networkOf(baseIp, 16);
    var out = [];
    for (var i = 0; i < vlans.length; i++) {
      var id = vlans[i].id;
      if (id > 255) return { error: 'id255', index: i };
      if (vlans[i].devices > 253) return { error: 'toolarge', index: i };
      out.push(subnet(base + id * 256, 24));
    }
    return { plan: out, used: vlans.length * 256, total: Math.pow(2, 32 - basePrefix) };
  }

  /* Gateway = erste nutzbare Adresse; danach ein Block für feste Adressen; Rest per DHCP. */
  function addressLayout(sn, reservePercent) {
    var gw = sn.first;
    var usable = sn.last - sn.first; // ohne Gateway
    var reserve = Math.floor(usable * (reservePercent || 0) / 100);
    var dhcpStart = gw + 1 + reserve;
    return {
      gateway: gw,
      staticFrom: reserve ? gw + 1 : null,
      staticTo: reserve ? gw + reserve : null,
      dhcpFrom: dhcpStart <= sn.last ? dhcpStart : null,
      dhcpTo: dhcpStart <= sn.last ? sn.last : null
    };
  }

  var api = {
    parseIp: parseIp,
    formatIp: formatIp,
    parseCidr: parseCidr,
    prefixFromMask: prefixFromMask,
    maskFromPrefix: maskFromPrefix,
    networkOf: networkOf,
    subnet: subnet,
    classify: classify,
    contains: contains,
    overlaps: overlaps,
    toBinary: toBinary,
    prefixForDevices: prefixForDevices,
    planVlsm: planVlsm,
    planById: planById,
    addressLayout: addressLayout
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.IPCalc = api;
})(this);
