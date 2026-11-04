/* Tests für assets/js/cron.js
   Aufruf: node tests/cron.test.js   (kein npm, keine Abhängigkeiten)
*/
'use strict';
var assert = require('assert');
var C = require('../assets/js/cron.js');
var failed = 0, passed = 0;

function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}
function runs(expr, from, n) {
  return C.nextRuns(C.parse(expr), from, n || 5).map(function (d) {
    function p(x) { return x < 10 ? '0' + x : '' + x; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  });
}
function codes(expr) { return C.hints(C.parse(expr)).map(function (h) { return h.code; }); }

console.log('cron');

test('Felder lesen: Liste, Bereich, Schritt, Namen', function () {
  var p = C.parse('*/15 8-17/3 1,15 jan-mar MON-FRI');
  assert.deepStrictEqual(p.fields.min.set, [0, 15, 30, 45]);
  assert.deepStrictEqual(p.fields.hour.set, [8, 11, 14, 17]);
  assert.deepStrictEqual(p.fields.dom.set, [1, 15]);
  assert.deepStrictEqual(p.fields.mon.set, [1, 2, 3]);
  assert.deepStrictEqual(p.fields.dow.set, [1, 2, 3, 4, 5]);
  assert.deepStrictEqual(C.parse('5/20 * * * *').fields.min.set, [5, 25, 45]);
  assert.deepStrictEqual(C.parse('0 0 * * 7').fields.dow.set, [0]);
  assert.deepStrictEqual(C.parse('0 0 * * 5-7').fields.dow.set, [0, 5, 6]);
});

test('Befehl hinter den 5 Feldern bleibt erhalten', function () {
  assert.strictEqual(C.parse('30 3 * * *  /usr/local/bin/backup.sh --full').command, '/usr/local/bin/backup.sh --full');
});

test('Fehler werden erkannt', function () {
  assert.strictEqual(C.parse('').error, 'empty');
  assert.strictEqual(C.parse('* * * *').error, 'count');
  assert.deepStrictEqual(C.parse('60 * * * *'), { error: 'range', field: 'min', token: '60' });
  assert.strictEqual(C.parse('* 24 * * *').error, 'range');
  assert.strictEqual(C.parse('* * 0 * *').error, 'range');
  assert.strictEqual(C.parse('* * * 13 *').error, 'range');
  assert.strictEqual(C.parse('* * * * 8').error, 'range');
  assert.strictEqual(C.parse('5-1 * * * *').error, 'range');
  assert.strictEqual(C.parse('*/0 * * * *').error, 'step');
  assert.strictEqual(C.parse('a * * * *').error, 'format');
  assert.strictEqual(C.parse('@sometimes').error, 'macro');
});

test('Kürzel wie @daily und @reboot', function () {
  assert.deepStrictEqual(C.parse('@daily').fields.hour.set, [0]);
  assert.strictEqual(C.parse('@weekly').macro, '@weekly');
  assert.strictEqual(C.parse('@reboot /opt/start.sh').reboot, true);
  assert.deepStrictEqual(C.nextRuns(C.parse('@reboot'), new Date(), 5), []);
});

test('Nächste Ausführungen', function () {
  var from = new Date(2026, 10, 4, 18, 5); // Mi 04.11.2026 18:05
  assert.deepStrictEqual(runs('30 3 * * *', from, 2), ['2026-11-05 03:30', '2026-11-06 03:30']);
  assert.deepStrictEqual(runs('*/20 * * * *', from, 3), ['2026-11-04 18:20', '2026-11-04 18:40', '2026-11-04 19:00']);
  assert.deepStrictEqual(runs('0 9 * * 1-5', from, 3), ['2026-11-05 09:00', '2026-11-06 09:00', '2026-11-09 09:00']);
  assert.deepStrictEqual(runs('0 0 1 1 *', from, 1), ['2027-01-01 00:00']);
  assert.deepStrictEqual(runs('5 18 * * *', from, 1), ['2026-11-05 18:05'], 'aktuelle Minute zählt nicht mehr');
});

test('Tag UND Wochentag eingeschränkt: eines reicht (ODER)', function () {
  var from = new Date(2026, 10, 4, 18, 5);
  assert.deepStrictEqual(runs('0 12 13 * 5', from, 3), ['2026-11-06 12:00', '2026-11-13 12:00', '2026-11-20 12:00']);
  assert.ok(codes('0 12 13 * 5').indexOf('dom-or-dow') >= 0);
});

test('29. Februar und 31. Tage', function () {
  var from = new Date(2026, 10, 4);
  assert.deepStrictEqual(runs('0 0 29 2 *', from, 1), ['2028-02-29 00:00']);
  assert.deepStrictEqual(runs('0 0 31 * *', from, 2), ['2026-12-31 00:00', '2027-01-31 00:00']);
  assert.ok(codes('0 0 31 * *').indexOf('short-months') >= 0);
  assert.ok(codes('0 0 30 2 *').indexOf('never') >= 0);
  assert.deepStrictEqual(runs('0 0 30 2 *', from, 1), []);
});

test('Klartext Deutsch', function () {
  assert.strictEqual(C.describe(C.parse('30 3 * * *'), 'de'), 'Läuft um 03:30, täglich.');
  assert.strictEqual(C.describe(C.parse('0 9 * * 1-5'), 'de'), 'Läuft um 09:00, montags bis freitags.');
  assert.strictEqual(C.describe(C.parse('*/15 * * * *'), 'de'), 'Läuft alle 15 Minuten, täglich.');
  assert.strictEqual(C.describe(C.parse('0 * * * *'), 'de'), 'Läuft stündlich zur Minute 0, täglich.');
  assert.strictEqual(C.describe(C.parse('0 0 1 * *'), 'de'), 'Läuft um 00:00, am 1. des Monats.');
  assert.strictEqual(C.describe(C.parse('0 8,17 * * 6,0'), 'de'), 'Läuft um 08:00 und 17:00, am Wochenende.');
  assert.strictEqual(C.describe(C.parse('15 2 * 1,7 *'), 'de'), 'Läuft um 02:15, täglich, nur im Januar und Juli.');
  assert.strictEqual(C.describe(C.parse('@reboot'), 'de'), 'Läuft einmal nach jedem Start des Systems (@reboot).');
});

test('Klartext Englisch', function () {
  assert.strictEqual(C.describe(C.parse('0 9 * * 1-5'), 'en'), 'Runs at 09:00, Monday to Friday.');
  assert.strictEqual(C.describe(C.parse('0 0 1 * *'), 'en'), 'Runs at 00:00, on the 1st of the month.');
});

test('Hinweise', function () {
  assert.ok(codes('* * * * *').indexOf('every-minute') >= 0);
  assert.ok(codes('0 0 * * 7').indexOf('sunday7') >= 0);
  assert.deepStrictEqual(codes('30 3 * * *'), []);
});

console.log('\n' + passed + ' bestanden, ' + failed + ' fehlgeschlagen');
process.exit(failed ? 1 : 0);
