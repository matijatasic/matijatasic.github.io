/* Tests für assets/js/quiz.js
   Aufruf: node tests/quiz.test.js   (kein npm, keine Abhängigkeiten)
*/
'use strict';
var assert = require('assert');
var Q = require('../assets/js/quiz.js');
var lex = require('../assets/js/ports.js');
var failed = 0, passed = 0;

function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}
var deNum = function (s) { return parseInt(s.replace(/\./g, ''), 10); };
var N = 3000;

console.log('quiz');

test('Grundwerte: 5 Runden, 30 Sekunden, drei Modi', function () {
  assert.strictEqual(Q.ROUNDS, 5);
  assert.strictEqual(Q.SECONDS, 30);
  assert.deepStrictEqual(Q.MODES.sort(), ['binaer', 'ports', 'subnetz']);
});

test('Jede Frage hat genau 3 verschiedene Antworten und einen gültigen Index', function () {
  Q.MODES.forEach(function (m) {
    for (var i = 0; i < N; i++) {
      var q = Q.make(m);
      assert.strictEqual(q.opts.length, 3, m);
      var de = q.opts.map(function (o) { return o.de; }), en = q.opts.map(function (o) { return o.en; });
      assert.strictEqual(new Set(de).size, 3, m + ' doppelt (de): ' + de);
      assert.strictEqual(new Set(en).size, 3, m + ' doppelt (en): ' + en);
      assert.ok(q.a >= 0 && q.a < 3, m + ' Index');
      assert.ok(q.q.de.indexOf('{v}') !== -1 && q.q.en.indexOf('{v}') !== -1, m + ' Platzhalter');
    }
  });
});

test('Binär: genau eine Antwort ist der Dezimalwert', function () {
  for (var i = 0; i < N; i++) {
    var q = Q.make('binaer'), n = parseInt(q.v.de, 2);
    assert.ok(/^[01]{8}$/.test(q.v.de));
    var hits = q.opts.filter(function (o) { return deNum(o.de) === n; }).length;
    assert.strictEqual(hits, 1);
    assert.strictEqual(deNum(q.opts[q.a].de), n);
  }
});

test('Subnetze: richtige Antwort nachgerechnet, keine zweite richtige', function () {
  for (var i = 0; i < N; i++) {
    var q = Q.make('subnetz'), ok = function () { return false; };
    if (q.key[0] === 'h') { var p = +q.v.de.slice(1); ok = function (o) { return deNum(o.de) === Math.pow(2, 32 - p) - 2; }; }
    else if (q.key[0] === 'm') { var pm = +q.v.de.slice(1); ok = function (o) { return o.de === Q.maskOf(pm); }; }
    else { var h = deNum(q.v.de); ok = function (o) { return Q.hostsOf(+o.de.slice(1)) === h; }; }
    assert.strictEqual(q.opts.filter(ok).length, 1, q.key + ' ' + JSON.stringify(q.opts));
    assert.ok(ok(q.opts[q.a]), q.key);
  }
});

test('Ports: richtige Antwort passt, keine Falschantwort ist ebenfalls richtig', function () {
  var byPort = {}; Q.PORTS.forEach(function (e) { byPort[e[0]] = e; });
  for (var i = 0; i < N; i++) {
    var q = Q.make('ports');
    if (q.key.indexOf('pn') === 0) {
      var e = Q.PORTS.filter(function (x) { return x[1] === q.v.de; })[0];
      assert.ok(e, q.v.de);
      assert.strictEqual(+q.opts[q.a].de, e[0]);
    } else {
      var c = byPort[+q.v.de];
      assert.strictEqual(q.opts[q.a].de, c[1]);
      q.opts.forEach(function (o, j) {
        if (j === q.a) return;
        var name = o.de.toLowerCase().replace(/[\s\-_.\/()]/g, '');
        assert.ok(c[3].indexOf(name) === -1, 'Port ' + c[0] + ': ' + o.de + ' wäre auch richtig');
      });
    }
  }
});

test('Port 445 (SMB) bekommt nie „NetBIOS-Sitzung“ als Falschantwort', function () {
  for (var i = 0; i < N; i++) {
    var q = Q.make('ports');
    if (q.key === 'np445') assert.ok(q.opts.every(function (o) { return o.de !== 'NetBIOS-Sitzung'; }));
    if (q.key === 'np139') assert.ok(q.opts.every(function (o) { return o.de !== 'SMB'; }));
  }
});

test('Alle Quiz-Ports stehen auch im Port-Lexikon', function () {
  var have = lex.PORTS.map(function (p) { return p.port; });
  Q.PORTS.forEach(function (e) { assert.ok(have.indexOf(e[0]) !== -1, 'Port ' + e[0]); assert.ok(e[0] <= 1023); });
});

test('Punkte: 100 + 10 je volle übrige Sekunde, falsch = 0', function () {
  assert.strictEqual(Q.points(true, 30), 400);
  assert.strictEqual(Q.points(true, 12.7), 220);
  assert.strictEqual(Q.points(true, 0), 100);
  assert.strictEqual(Q.points(false, 25), 0);
});

console.log('\n' + passed + ' bestanden, ' + failed + ' fehlgeschlagen');
if (failed) process.exit(1);
