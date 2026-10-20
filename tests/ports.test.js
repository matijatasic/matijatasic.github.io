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
function pair(x) { return Array.isArray(x) && x.length === 2 && x[0] && x[1]; }
function find(n) { return d.PORTS.filter(function (p) { return p.port === n; })[0]; }

console.log('ports');

test('Jeder Eintrag ist vollständig', function () {
  d.PORTS.forEach(function (p, i) {
    assert.ok(Number.isInteger(p.port) && p.port >= 1 && p.port <= 65535, 'Port in Zeile ' + i);
    assert.ok(typeof p.tcp === 'boolean' && typeof p.udp === 'boolean', 'tcp/udp bei Port ' + p.port);
    assert.ok(p.tcp || p.udp, 'mindestens ein Protokoll bei Port ' + p.port);
    assert.ok(typeof p.name === 'string' || pair(p.name), 'Dienst bei Port ' + p.port);
    assert.ok(d.CATEGORIES[p.cat], 'Bereich bei Port ' + p.port);
    assert.ok(pair(p.desc), 'Beschreibung DE/EN bei Port ' + p.port);
    assert.ok(pair(p.note), 'Firewall-Hinweis DE/EN bei Port ' + p.port);
  });
});

test('Jeder Port nur einmal, aufsteigend sortiert', function () {
  for (var i = 1; i < d.PORTS.length; i++) assert.ok(d.PORTS[i].port > d.PORTS[i - 1].port, 'bei Port ' + d.PORTS[i].port);
});

test('Verwandte Ports stehen im Lexikon und verweisen nicht auf sich selbst', function () {
  d.PORTS.forEach(function (p) {
    p.related.forEach(function (n) {
      assert.ok(find(n), 'Port ' + p.port + ' verweist auf fehlenden Port ' + n);
      assert.notStrictEqual(n, p.port, 'Port ' + p.port + ' verweist auf sich selbst');
    });
  });
});

test('Jeder Bereich hat mindestens einen Port', function () {
  Object.keys(d.CATEGORIES).forEach(function (k) {
    assert.ok(d.PORTS.some(function (p) { return p.cat === k; }), 'Bereich ' + k);
  });
});

test('Stichproben', function () {
  assert.ok(find(22).tcp && !find(22).udp, '22 nur TCP');
  assert.ok(find(53).tcp && find(53).udp, '53 TCP und UDP');
  assert.ok(find(443).tcp && find(443).udp, '443 TCP und UDP (QUIC)');
  assert.ok(!find(51820).tcp && find(51820).udp, '51820 nur UDP');
  assert.ok(!find(67).tcp && find(67).udp, '67 nur UDP');
  assert.strictEqual(find(8006).name[0].indexOf('Proxmox VE'), 0);
});

test('IANA-Bereiche', function () {
  assert.strictEqual(d.portRange(443), 'system');
  assert.strictEqual(d.portRange(1023), 'system');
  assert.strictEqual(d.portRange(1024), 'registered');
  assert.strictEqual(d.portRange(49151), 'registered');
  assert.strictEqual(d.portRange(49152), 'dynamic');
});

console.log('\n' + passed + ' bestanden, ' + failed + ' fehlgeschlagen');
process.exit(failed ? 1 : 0);
