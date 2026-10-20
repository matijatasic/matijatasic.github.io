/* Tests für assets/js/ipcalc.js
   Aufruf: node tests/ipcalc.test.js   (kein npm, keine Abhängigkeiten)
*/
'use strict';
var assert = require('assert');
var ip = require('../assets/js/ipcalc.js');
var P = ip.parseIp, F = ip.formatIp;
var failed = 0, passed = 0;

function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}

console.log('ipcalc');

test('Adressen lesen und schreiben', function () {
  assert.strictEqual(P('0.0.0.0'), 0);
  assert.strictEqual(P('255.255.255.255'), 4294967295);
  assert.strictEqual(F(P('192.168.10.1')), '192.168.10.1');
  assert.strictEqual(P(' 10.0.0.1 '), 167772161);
});

test('Ungültige Adressen werden abgelehnt', function () {
  ['256.1.1.1', '1.2.3', '1.2.3.4.5', '01.2.3.4', 'a.b.c.d', '', '1..2.3', '-1.2.3.4'].forEach(function (s) {
    assert.strictEqual(P(s), null, s);
  });
});

test('Masken in Präfix umrechnen', function () {
  assert.strictEqual(ip.prefixFromMask('255.255.255.0'), 24);
  assert.strictEqual(ip.prefixFromMask('255.255.252.0'), 22);
  assert.strictEqual(ip.prefixFromMask('0.0.0.0'), 0);
  assert.strictEqual(ip.prefixFromMask('255.255.255.255'), 32);
  assert.strictEqual(ip.prefixFromMask('255.0.255.0'), null);
});

test('Schreibweisen für Netze', function () {
  assert.deepStrictEqual(ip.parseCidr('10.0.0.5/24'), { ip: P('10.0.0.5'), prefix: 24 });
  assert.deepStrictEqual(ip.parseCidr('10.0.0.5 / 24'), { ip: P('10.0.0.5'), prefix: 24 });
  assert.deepStrictEqual(ip.parseCidr('10.0.0.5 255.255.255.0'), { ip: P('10.0.0.5'), prefix: 24 });
  assert.deepStrictEqual(ip.parseCidr('10.0.0.5/255.255.0.0'), { ip: P('10.0.0.5'), prefix: 16 });
  assert.deepStrictEqual(ip.parseCidr('10.0.0.5'), { ip: P('10.0.0.5'), prefix: 32 });
  assert.strictEqual(ip.parseCidr('10.0.0.5/33').error, 'prefix');
  assert.strictEqual(ip.parseCidr('10.0.0.5/255.0.255.0').error, 'mask');
  assert.strictEqual(ip.parseCidr('').error, 'empty');
});

test('Subnetz /24', function () {
  var s = ip.subnet(P('192.168.10.77'), 24);
  assert.strictEqual(F(s.network), '192.168.10.0');
  assert.strictEqual(F(s.broadcast), '192.168.10.255');
  assert.strictEqual(F(s.first), '192.168.10.1');
  assert.strictEqual(F(s.last), '192.168.10.254');
  assert.strictEqual(s.hosts, 254);
  assert.strictEqual(F(s.mask), '255.255.255.0');
  assert.strictEqual(F(s.wildcard), '0.0.0.255');
  assert.strictEqual(s.isHostAddress, true);
  assert.strictEqual(s.kind, 'private');
});

test('Subnetz /26 mitten im Netz', function () {
  var s = ip.subnet(P('10.1.2.130'), 26);
  assert.strictEqual(F(s.network), '10.1.2.128');
  assert.strictEqual(F(s.broadcast), '10.1.2.191');
  assert.strictEqual(s.hosts, 62);
});

test('Sonderfälle /0, /31, /32', function () {
  var a = ip.subnet(P('8.8.8.8'), 0);
  assert.strictEqual(F(a.network), '0.0.0.0');
  assert.strictEqual(F(a.broadcast), '255.255.255.255');
  assert.strictEqual(a.hosts, 4294967294);
  var b = ip.subnet(P('10.0.0.1'), 31);
  assert.strictEqual(b.hosts, 2);
  assert.strictEqual(F(b.first), '10.0.0.0');
  assert.strictEqual(F(b.last), '10.0.0.1');
  assert.strictEqual(b.isHostAddress, false);
  var c = ip.subnet(P('10.0.0.1'), 32);
  assert.strictEqual(c.hosts, 1);
  assert.strictEqual(F(c.first), '10.0.0.1');
});

test('Adressbereiche einordnen', function () {
  assert.strictEqual(ip.classify(P('172.31.255.1')), 'private');
  assert.strictEqual(ip.classify(P('172.32.0.1')), 'public');
  assert.strictEqual(ip.classify(P('100.64.0.1')), 'cgnat');
  assert.strictEqual(ip.classify(P('169.254.1.1')), 'linklocal');
  assert.strictEqual(ip.classify(P('224.0.0.251')), 'multicast');
  assert.strictEqual(ip.classify(P('127.0.0.1')), 'loopback');
  assert.strictEqual(ip.classify(P('1.1.1.1')), 'public');
});

test('Adresse im Netz und Überschneidung', function () {
  assert.strictEqual(ip.contains(P('192.168.10.0'), 24, P('192.168.10.200')), true);
  assert.strictEqual(ip.contains(P('192.168.10.0'), 24, P('192.168.11.1')), false);
  assert.strictEqual(ip.overlaps({ ip: P('10.0.0.0'), prefix: 16 }, { ip: P('10.0.20.0'), prefix: 24 }), true);
  assert.strictEqual(ip.overlaps({ ip: P('10.0.0.0'), prefix: 24 }, { ip: P('10.0.1.0'), prefix: 24 }), false);
});

test('Binärdarstellung', function () {
  assert.strictEqual(ip.toBinary(P('255.255.255.0')), '11111111.11111111.11111111.00000000');
  assert.strictEqual(ip.toBinary(P('10.0.0.1')), '00001010.00000000.00000000.00000001');
});

test('Präfix für Geräteanzahl (inkl. Gateway)', function () {
  assert.strictEqual(ip.prefixForDevices(1), 30);   // 4 Adressen: Netz, Gateway, Gerät, Broadcast
  assert.strictEqual(ip.prefixForDevices(2), 29);
  assert.strictEqual(ip.prefixForDevices(5), 29);   // 8 Adressen
  assert.strictEqual(ip.prefixForDevices(6), 28);
  assert.strictEqual(ip.prefixForDevices(253), 24);
  assert.strictEqual(ip.prefixForDevices(254), 23);
});

test('VLSM-Plan ohne Überschneidung, Reihenfolge wie eingegeben', function () {
  var vl = [
    { id: 10, name: 'Privat', devices: 50 },
    { id: 20, name: 'IoT', devices: 100 },
    { id: 30, name: 'Gäste', devices: 20 },
    { id: 40, name: 'Lab', devices: 10 }
  ];
  var r = ip.planVlsm(P('192.168.0.0'), 23, vl);
  assert.ok(!r.error, r.error);
  assert.strictEqual(F(r.plan[1].network) + '/' + r.plan[1].prefix, '192.168.0.0/25');
  assert.strictEqual(F(r.plan[0].network) + '/' + r.plan[0].prefix, '192.168.0.128/26');
  assert.strictEqual(F(r.plan[2].network) + '/' + r.plan[2].prefix, '192.168.0.192/27');
  assert.strictEqual(F(r.plan[3].network) + '/' + r.plan[3].prefix, '192.168.0.224/28');
  for (var i = 0; i < r.plan.length; i++)
    for (var j = i + 1; j < r.plan.length; j++)
      assert.ok(!ip.overlaps({ ip: r.plan[i].network, prefix: r.plan[i].prefix }, { ip: r.plan[j].network, prefix: r.plan[j].prefix }));
});

test('VLSM meldet zu kleines Basisnetz', function () {
  var r = ip.planVlsm(P('192.168.0.0'), 26, [{ id: 10, name: 'A', devices: 40 }, { id: 20, name: 'B', devices: 10 }]);
  assert.strictEqual(r.error, 'nospace');
  var r2 = ip.planVlsm(P('192.168.0.0'), 26, [{ id: 10, name: 'A', devices: 100 }]);
  assert.strictEqual(r2.error, 'toolarge');
  assert.strictEqual(r2.index, 0);
});

test('Plan nach VLAN-ID', function () {
  var r = ip.planById(P('10.20.0.0'), 16, [{ id: 10, devices: 5 }, { id: 99, devices: 5 }]);
  assert.strictEqual(F(r.plan[0].network) + '/' + r.plan[0].prefix, '10.20.10.0/24');
  assert.strictEqual(F(r.plan[1].network), '10.20.99.0');
  assert.strictEqual(ip.planById(P('10.20.0.0'), 24, [{ id: 10, devices: 5 }]).error, 'base16');
  assert.strictEqual(ip.planById(P('10.20.0.0'), 16, [{ id: 300, devices: 5 }]).error, 'id255');
});

test('Adressaufteilung Gateway / feste IPs / DHCP', function () {
  var s = ip.subnet(P('192.168.10.0'), 24);
  var a = ip.addressLayout(s, 20);
  assert.strictEqual(F(a.gateway), '192.168.10.1');
  assert.strictEqual(F(a.staticFrom), '192.168.10.2');
  assert.strictEqual(F(a.staticTo), '192.168.10.51');      // 253 * 20 % = 50 Adressen
  assert.strictEqual(F(a.dhcpFrom), '192.168.10.52');
  assert.strictEqual(F(a.dhcpTo), '192.168.10.254');
  var b = ip.addressLayout(s, 0);
  assert.strictEqual(b.staticFrom, null);
  assert.strictEqual(F(b.dhcpFrom), '192.168.10.2');
});

console.log('\n' + passed + ' bestanden, ' + failed + ' fehlgeschlagen');
process.exit(failed ? 1 : 0);
