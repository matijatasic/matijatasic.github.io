/* Tests für assets/js/pwgen.js
   Aufruf: node tests/pwgen.test.js   (kein npm, keine Abhängigkeiten)
*/
'use strict';
var assert = require('assert');
var P = require('../assets/js/pwgen.js');
var failed = 0, passed = 0;

function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}
var ALL = { length: 20, lower: true, upper: true, digits: true, symbols: true };
function has(pw, set) { return pw.split('').some(function (c) { return set.indexOf(c) >= 0; }); }

console.log('pwgen');

test('Länge stimmt und wird auf 8 bis 64 begrenzt', function () {
  [8, 20, 33, 64].forEach(function (n) { assert.strictEqual(P.generate(Object.assign({}, ALL, { length: n })).length, n); });
  assert.strictEqual(P.generate(Object.assign({}, ALL, { length: 3 })).length, 8);
  assert.strictEqual(P.generate(Object.assign({}, ALL, { length: 500 })).length, 64);
});

test('Jede gewählte Zeichenart kommt vor, abgewählte nie', function () {
  for (var i = 0; i < 300; i++) {
    var pw = P.generate({ length: 8, lower: true, upper: true, digits: true, symbols: true });
    assert.ok(has(pw, P.SETS.lower) && has(pw, P.SETS.upper) && has(pw, P.SETS.digits) && has(pw, P.SETS.symbols), pw);
    var pw2 = P.generate({ length: 16, lower: true, digits: true });
    assert.ok(!has(pw2, P.SETS.upper) && !has(pw2, P.SETS.symbols), pw2);
  }
});

test('Ohne ähnliche Zeichen: kein O 0 o I l 1 |', function () {
  for (var i = 0; i < 300; i++) assert.ok(!has(P.generate(Object.assign({ noSimilar: true }, ALL, { length: 64 })), P.SIMILAR));
});

test('Keine Leerzeichen, Anführungszeichen oder Backslash', function () {
  for (var i = 0; i < 300; i++) assert.ok(!/[\s"'`\\]/.test(P.generate(Object.assign({}, ALL, { length: 64 }))));
});

test('Nichts gewählt → null', function () {
  assert.strictEqual(P.generate({ length: 20 }), null);
});

test('Zeichen sind ungefähr gleich verteilt', function () {
  var count = {}, n = 0;
  for (var i = 0; i < 2000; i++) P.generate({ length: 64, digits: true }).split('').forEach(function (c) { count[c] = (count[c] || 0) + 1; n++; });
  Object.keys(count).forEach(function (c) { assert.ok(Math.abs(count[c] / n - 0.1) < 0.01, c + ': ' + count[c]); });
});

test('Stärke in Bit und Einstufung', function () {
  assert.strictEqual(P.entropy({ length: 20, lower: true, upper: true, digits: true, symbols: true }), Math.round(20 * Math.log2(90)));
  assert.strictEqual(P.entropy({ length: 10, digits: true }), 33);
  assert.strictEqual(P.rating(33), 0);
  assert.strictEqual(P.rating(70), 1);
  assert.strictEqual(P.rating(100), 2);
  assert.strictEqual(P.rating(130), 3);
});

console.log('\n' + passed + ' bestanden, ' + failed + ' fehlgeschlagen');
process.exit(failed ? 1 : 0);
