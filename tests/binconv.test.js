/* Tests für assets/js/binconv.js
   Aufruf: node tests/binconv.test.js   (kein npm, keine Abhängigkeiten)
*/
'use strict';
var assert = require('assert');
var B = require('../assets/js/binconv.js');
var failed = 0, passed = 0;

function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}

console.log('binconv');

test('Dezimal lesen', function () {
  assert.strictEqual(B.parseDec('170'), 170);
  assert.strictEqual(B.parseDec(' 0 '), 0);
  assert.strictEqual(B.parseDec('4.294.967.295'), 4294967295);
  assert.strictEqual(B.parseDec('4294967296'), null);
  assert.strictEqual(B.parseDec('-1'), null);
  assert.strictEqual(B.parseDec('12a'), null);
  assert.strictEqual(B.parseDec(''), null);
});

test('Binär lesen, auch mit Leerzeichen, Punkten und 0b', function () {
  assert.strictEqual(B.parseBin('10101010'), 170);
  assert.strictEqual(B.parseBin('1010 1010'), 170);
  assert.strictEqual(B.parseBin('0b1111'), 15);
  assert.strictEqual(B.parseBin('11000000.10101000.00000001.00000001'), 3232235777);
  assert.strictEqual(B.parseBin('102'), null);
  assert.strictEqual(B.parseBin(''), null);
  assert.strictEqual(B.parseBin(new Array(34).join('1')), null);
});

test('Binär ausgeben, auf ganze Bytes aufgefüllt', function () {
  assert.strictEqual(B.toBin(0), '00000000');
  assert.strictEqual(B.toBin(5), '00000101');
  assert.strictEqual(B.toBin(255), '11111111');
  assert.strictEqual(B.toBin(256), '00000001 00000000');
  assert.strictEqual(B.toBin(4294967295), '11111111 11111111 11111111 11111111');
  assert.strictEqual(B.toBin(5, 16), '00000000 00000101');
});

test('Bitbreite', function () {
  assert.strictEqual(B.width(0), 8);
  assert.strictEqual(B.width(255), 8);
  assert.strictEqual(B.width(256), 16);
  assert.strictEqual(B.width(65536), 24);
  assert.strictEqual(B.width(16777216), 32);
  assert.strictEqual(B.width(4294967295), 32);
});

test('Rechenweg und Hin-und-zurück', function () {
  assert.deepStrictEqual(B.parts(170), [128, 32, 8, 2]);
  assert.deepStrictEqual(B.parts(0), []);
  [0, 1, 7, 128, 192, 255, 1000, 65535, 3232235777, 4294967295].forEach(function (n) {
    assert.strictEqual(B.parseBin(B.toBin(n)), n);
    assert.strictEqual(B.parts(n).reduce(function (a, b) { return a + b; }, 0), n);
  });
});

test('Bit umschalten', function () {
  assert.strictEqual(B.toggle(0, 7), 128);
  assert.strictEqual(B.toggle(170, 1), 168);
  assert.strictEqual(B.toggle(4294967295, 31), 2147483647);
});

console.log('\n' + passed + ' bestanden, ' + failed + ' fehlgeschlagen');
if (failed) process.exit(1);
