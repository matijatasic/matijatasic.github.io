/* Tests für assets/js/ports.js
   Aufruf: node tests/ports.test.js   (kein npm, keine Abhängigkeiten)
*/
'use strict';
var assert = require('assert');
var d = require('../assets/js/ports.js');
var failed = 0, passed = 0;

function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}

console.log('ports');

test('Jeder Eintrag ist vollständig', function () {
  d.PORTS.forEach(function (p, i) {
    assert.ok(Number.isInteger(p[0]) && p[0] >= 1 && p[0] <= 65535, 'Port in Zeile ' + i);
    assert.ok(['TCP', 'UDP', 'TCP/UDP'].indexOf(p[1]) >= 0, 'Protokoll bei Port ' + p[0]);
    assert.ok(typeof p[2] === 'string' || (Array.isArray(p[2]) && p[2].length === 2), 'Dienst bei Port ' + p[0]);
    assert.ok(d.CATEGORIES[p[3]], 'Bereich bei Port ' + p[0]);
    assert.ok(p[4] && p[5], 'Hinweis DE/EN bei Port ' + p[0]);
  });
});

test('Kein Port/Protokoll doppelt', function () {
  var seen = {};
  d.PORTS.forEach(function (p) {
    var protos = p[1] === 'TCP/UDP' ? ['TCP', 'UDP'] : [p[1]];
    protos.forEach(function (pr) {
      var k = p[0] + '/' + pr;
      assert.ok(!seen[k], k + ' doppelt');
      seen[k] = true;
    });
  });
});

test('Liste ist nach Port sortiert', function () {
  for (var i = 1; i < d.PORTS.length; i++) assert.ok(d.PORTS[i][0] >= d.PORTS[i - 1][0], 'bei ' + d.PORTS[i][0]);
});

test('Stichproben bekannter Ports', function () {
  function has(port, proto, name) {
    return d.PORTS.some(function (p) { var n = Array.isArray(p[2]) ? p[2][0] : p[2]; return p[0] === port && p[1] === proto && n.indexOf(name) >= 0; });
  }
  assert.ok(has(22, 'TCP', 'SSH'));
  assert.ok(has(53, 'TCP/UDP', 'DNS'));
  assert.ok(has(443, 'TCP', 'HTTPS'));
  assert.ok(has(8006, 'TCP', 'Proxmox VE'));
  assert.ok(has(51820, 'UDP', 'WireGuard'));
});

test('IANA-Bereiche', function () {
  assert.strictEqual(d.portRange(1023), 'system');
  assert.strictEqual(d.portRange(1024), 'registered');
  assert.strictEqual(d.portRange(49151), 'registered');
  assert.strictEqual(d.portRange(49152), 'dynamic');
});

console.log('\n' + passed + ' bestanden, ' + failed + ' fehlgeschlagen');
process.exit(failed ? 1 : 0);
