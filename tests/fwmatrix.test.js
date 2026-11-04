/* Tests für assets/js/fwmatrix.js
   Aufruf: node tests/fwmatrix.test.js   (kein npm, keine Abhängigkeiten)
*/
'use strict';
var assert = require('assert');
var F = require('../assets/js/fwmatrix.js');
var failed = 0, passed = 0;

function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}
function codes(list) { return list.map(function (x) { return x.code; }); }

console.log('fwmatrix');

test('Ports lesen: Liste, Bereich, Protokoll', function () {
  var r = F.parsePorts('443, 22 8000-8100;123/udp 53/ANY');
  assert.deepStrictEqual(r.list, [
    { proto: 'tcp', from: 443, to: 443 }, { proto: 'tcp', from: 22, to: 22 }, { proto: 'tcp', from: 8000, to: 8100 },
    { proto: 'udp', from: 123, to: 123 }, { proto: 'any', from: 53, to: 53 }
  ]);
  assert.strictEqual(F.formatPorts(r.list), 'TCP/UDP 53 · TCP 443, 22, 8000-8100 · UDP 123');
  assert.strictEqual(F.parsePorts('443, 443').list.length, 1);
});

test('Ungültige Ports werden erkannt', function () {
  assert.strictEqual(F.parsePorts('').error, 'empty');
  assert.strictEqual(F.parsePorts('  ').error, 'empty');
  assert.deepStrictEqual(F.parsePorts('443, http'), { error: 'format', token: 'http' });
  assert.strictEqual(F.parsePorts('0').error, 'range');
  assert.strictEqual(F.parsePorts('65536').error, 'range');
  assert.strictEqual(F.parsePorts('100-50').error, 'range');
  assert.strictEqual(F.parsePorts('53/icmp').error, 'format');
});

test('Klick schaltet blockiert → Ports → erlaubt → blockiert', function () {
  assert.strictEqual(F.nextMode('block'), 'ports');
  assert.strictEqual(F.nextMode('ports'), 'allow');
  assert.strictEqual(F.nextMode('allow'), 'block');
  assert.strictEqual(F.nextMode('quatsch'), 'block');
});

test('Beispiel: Regeln in richtiger Reihenfolge', function () {
  var r = F.rules(F.example('de'));
  assert.strictEqual(r[0].kind, 'dns');
  var iInt = r.findIndex(function (x) { return x.kind === 'internal'; });
  var firstWan = r.findIndex(function (x) { return x.kind === 'wan'; });
  assert.ok(iInt > 0 && firstWan > iInt, 'interne Sperre vor Internet');
  r.slice(1, iInt).forEach(function (x) { assert.strictEqual(x.kind, 'zone'); assert.strictEqual(x.action, 'pass'); });
  var last = r[r.length - 1];
  assert.strictEqual(last.kind, 'default'); assert.strictEqual(last.action, 'block');
  // Mgmt → LAN, Server, IoT voll erlaubt: eine zusammengefasste Regel
  var mg = r.filter(function (x) { return x.src[0] === 'z5' && x.kind === 'zone'; });
  assert.strictEqual(mg.length, 1);
  assert.deepStrictEqual(mg[0].dst, ['z1', 'z2', 'z3']);
  assert.strictEqual(mg[0].ports, null);
  // LAN, Server, Gäste → Internet voll: eine Regel
  var wf = r.find(function (x) { return x.kind === 'wan' && !x.ports; });
  assert.deepStrictEqual(wf.src, ['z1', 'z2', 'z4']);
});

test('Gleiche Ports werden je Quelle zusammengefasst', function () {
  var s = { zones: [{ id: 'z1', name: 'A' }, { id: 'z2', name: 'B' }, { id: 'z3', name: 'C' }], cells: {}, dnsNtp: false };
  s.cells['z1>z2'] = { mode: 'ports', ports: '443' };
  s.cells['z1>z3'] = { mode: 'ports', ports: '443' };
  var r = F.rules(s);
  assert.strictEqual(r.length, 3); // A → B, C · 443 | interne Sperre | Standard
  assert.deepStrictEqual(r[0].dst, ['z2', 'z3']);
});

test('Fehlerhafte Port-Felder erzeugen keine Regel, aber eine Meldung', function () {
  var s = { zones: [{ id: 'z1', name: 'A' }, { id: 'z2', name: 'B' }], cells: { 'z1>z2': { mode: 'ports', ports: 'abc' } }, dnsNtp: false };
  assert.strictEqual(F.rules(s).filter(function (x) { return x.kind === 'zone'; }).length, 0);
  assert.ok(codes(F.check(s)).indexOf('ports-invalid') >= 0);
  s.cells['z1>z2'].ports = '';
  assert.ok(codes(F.check(s)).indexOf('ports-empty') >= 0);
});

test('Warnungen: Gäste intern, voller Zugriff aufs Management, IoT voll', function () {
  var c = F.check(F.example('de'));
  assert.strictEqual(c.filter(function (x) { return x.level !== 'info'; }).length, 0, 'Beispiel ist sauber');
  var s = F.example('de');
  s.cells['z4>z5'] = { mode: 'allow', ports: '' };
  s.cells['z1>z5'] = { mode: 'allow', ports: '' };
  s.cells['z3>z1'] = { mode: 'allow', ports: '' };
  s.cells['z1>z3'] = { mode: 'ports', ports: '23' };
  var k = codes(F.check(s));
  ['guest-internal', 'to-mgmt', 'iot-full', 'cleartext'].forEach(function (x) { assert.ok(k.indexOf(x) >= 0, x); });
});

test('Zonen prüfen: Name, VLAN, Netz, Überschneidung', function () {
  var s = { cells: {}, zones: [
    { id: 'z1', name: 'LAN', vlan: '10', net: '10.0.0.0/16' },
    { id: 'z2', name: 'lan', vlan: '10', net: '10.0.5.0/24' },
    { id: 'z3', name: '', vlan: '5000', net: '10.1.0.0' },
    { id: 'z4', name: 'X', vlan: '', net: '192.168.1.5/24' }
  ] };
  var k = codes(F.check(s));
  ['name-dup', 'vlan-dup', 'net-overlap', 'name-empty', 'vlan-range', 'net-invalid', 'net-host'].forEach(function (x) { assert.ok(k.indexOf(x) >= 0, x); });
  assert.strictEqual(codes(F.check({ zones: [], cells: {} }))[0], 'no-zones');
});

test('Zone löschen entfernt Zeile und Spalte', function () {
  var s = F.example('de');
  F.removeZone(s, 'z2');
  assert.strictEqual(s.zones.length, 4);
  Object.keys(s.cells).forEach(function (k) { assert.ok(k.indexOf('z2') < 0, k); });
  assert.strictEqual(F.newId(s), 'z6');
});

test('Gespeicherter Zustand wird bereinigt', function () {
  assert.strictEqual(F.sanitize(null), null);
  assert.strictEqual(F.sanitize('x'), null);
  var s = F.sanitize({
    zones: [{ id: 'z1', name: 'A', type: 'hack' }, { id: 'z1', name: 'doppelt' }, { id: 'bad', name: 'B' }, { id: 'z2', name: 'C'.repeat(50) }],
    cells: { 'z1>z2': { mode: 'allow' }, 'z1>z9': { mode: 'allow' }, 'z1>z1': { mode: 'allow' }, 'z2>wan': { mode: 'evil' }, 'z2>wan ': { mode: 'allow' } }
  });
  assert.strictEqual(s.zones.length, 2);
  assert.strictEqual(s.zones[0].type, 'std');
  assert.strictEqual(s.zones[1].name.length, 24);
  assert.deepStrictEqual(Object.keys(s.cells), ['z1>z2']);
  assert.strictEqual(s.dnsNtp, true);
  var many = { zones: [] };
  for (var i = 1; i <= 12; i++) many.zones.push({ id: 'z' + i, name: 'Z' + i });
  assert.strictEqual(F.sanitize(many).zones.length, F.MAX_ZONES);
});

test('Ohne Zonen keine Regeln', function () {
  assert.deepStrictEqual(F.rules({ zones: [], cells: {} }), []);
});

console.log('\n' + passed + ' bestanden, ' + failed + ' fehlgeschlagen');
process.exit(failed ? 1 : 0);
