/* Tests für assets/js/hash.js
   Aufruf: node tests/hash.test.js   (kein npm, keine Abhängigkeiten)
   Vergleicht mit dem eingebauten crypto-Modul von Node.
*/
'use strict';
var assert = require('assert');
var crypto = require('crypto');
var H = require('../assets/js/hash.js');
var failed = 0, passed = 0;

function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}
var NODE = { md5: 'md5', sha1: 'sha1', sha256: 'sha256', sha512: 'sha512' };
function ref(id, buf) { return crypto.createHash(NODE[id]).update(buf).digest('hex'); }

console.log('hash');

test('Bekannte Testwerte (leer und "abc")', function () {
  assert.strictEqual(H.hashText('md5', ''), 'd41d8cd98f00b204e9800998ecf8427e');
  assert.strictEqual(H.hashText('sha1', 'abc'), 'a9993e364706816aba3e25717850c26c9cd0d89d');
  assert.strictEqual(H.hashText('sha256', 'abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.strictEqual(H.hashText('sha512', 'abc'), 'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f');
});

test('Alle Längen rund um die Blockgrenzen stimmen mit Node überein', function () {
  var data = crypto.randomBytes(300);
  Object.keys(H.ALGS).forEach(function (id) {
    for (var n = 0; n <= 300; n++) {
      var b = new Uint8Array(data.subarray(0, n));
      assert.strictEqual(H.create(id).update(b).digest(), ref(id, b), id + ' bei ' + n + ' Byte');
    }
  });
});

test('Stückweise wie beim Datei-Lesen = in einem Stück', function () {
  var data = new Uint8Array(crypto.randomBytes(1 << 20));
  Object.keys(H.ALGS).forEach(function (id) {
    var h = H.create(id), p = 0, sizes = [1, 63, 64, 65, 127, 1000, 4096, 100003];
    for (var i = 0; p < data.length; i++) { var n = sizes[i % sizes.length]; h.update(data.subarray(p, p + n)); p += n; }
    assert.strictEqual(h.digest(), ref(id, data), id);
  });
});

test('Umlaute werden als UTF-8 gehasht', function () {
  assert.strictEqual(H.hashText('sha256', 'Prüfsumme ä€'), ref('sha256', Buffer.from('Prüfsumme ä€', 'utf8')));
});

test('Erwarteten Wert erkennen: rein, SHA256SUMS-Zeile, BSD-Form', function () {
  var x = 'BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD';
  assert.deepStrictEqual(H.parseExpected('  ' + x + ' \n'), { hex: x.toLowerCase(), alg: 'sha256' });
  assert.deepStrictEqual(H.parseExpected(x.toLowerCase() + '  proxmox-ve_9.0-1.iso'), { hex: x.toLowerCase(), alg: 'sha256' });
  assert.deepStrictEqual(H.parseExpected('SHA256 (OPNsense-25.7-dvd-amd64.iso) = ' + x.toLowerCase()), { hex: x.toLowerCase(), alg: 'sha256' });
  assert.strictEqual(H.parseExpected('d41d8cd98f00b204e9800998ecf8427e').alg, 'md5');
  assert.strictEqual(H.parseExpected('a9993e364706816aba3e25717850c26c9cd0d89d').alg, 'sha1');
  assert.strictEqual(H.parseExpected(''), null);
  assert.strictEqual(H.parseExpected('kein hash').hex, null);
});

test('digest() nur einmal', function () {
  var h = H.create('sha256'); h.digest();
  assert.throws(function () { h.digest(); });
  assert.throws(function () { h.update(new Uint8Array(1)); });
});

console.log('\n' + passed + ' bestanden, ' + failed + ' fehlgeschlagen');
process.exit(failed ? 1 : 0);
