/* Tests für assets/js/cmds.js
   Aufruf: node tests/cmds.test.js   (kein npm, keine Abhängigkeiten)
   Das Maskieren wird, wenn vorhanden, mit einer echten Bash geprüft.
*/
'use strict';
var assert = require('assert');
var cp = require('child_process');
var K = require('../assets/js/cmds.js');
var failed = 0, passed = 0;

function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}
function build(id, changes) {
  var t = K.byId(id), v = K.defaults(t);
  Object.keys(changes || {}).forEach(function (k) { v[k] = changes[k]; });
  return K.run(t, v);
}
var hasBash = false;
try { cp.execFileSync('bash', ['-c', 'true']); hasBash = true; } catch (e) {}

console.log('cmds');

test('Jede Vorlage baut mit Standardwerten einen Befehl', function () {
  K.TEMPLATES.forEach(function (t) {
    var r = K.run(t, K.defaults(t));
    assert.ok(!r.err && r.cmd, t.id);
    assert.ok(K.CATS[t.cat], 'Bereich ' + t.id);
    t.fields.forEach(function (f) { assert.ok(f.label[0] && f.label[1], t.id + '.' + f.id); });
  });
});

test('Bash-Maskierung übersteht Leerzeichen, Anführungszeichen, $ und *', function () {
  var nasty = ['ein ordner/', "it's", 'a"b', '$HOME', '*.tmp', '; rm -rf /', '`id`', 'ä ö', '', '-x', '~user'];
  nasty.forEach(function (s) {
    var q = K.sq(s);
    if (hasBash) assert.strictEqual(cp.execFileSync('bash', ['-c', 'printf %s ' + q]).toString(), s, s);
    else assert.ok(q.length >= s.length);
  });
  assert.strictEqual(K.sq('/srv/daten/'), '/srv/daten/');
  assert.strictEqual(K.sq('~/.ssh/id'), '~/.ssh/id');
});

test('rsync: Probelauf, Spiegeln mit Warnung, SSH-Port', function () {
  var r = build('rsync', { del: true, port: '2222', src: '/a b/', dst: 'u@h:/x/' });
  assert.ok(/--delete/.test(r.cmd) && r.warn.length === 1);
  assert.ok(r.cmd.indexOf("-e 'ssh -p 2222'") > 0);
  assert.ok(/ '\/a b\/' u@h:\/x\/$/.test(r.cmd), r.cmd);
  assert.ok(build('rsync', { port: '99999' }).err);
  assert.ok(build('rsync', { src: '' }).err);
});

test('robocopy: Pfade mit Leerzeichen und Backslash am Ende', function () {
  var r = build('robocopy', { src: 'D:\\Meine Daten\\', dst: 'E:\\', mode: 'mir', dry: false, log: '' });
  assert.strictEqual(r.cmd, 'robocopy "D:\\Meine Daten" E:\\ /MIR /R:2 /W:5');
  assert.strictEqual(r.warn.length, 1);
});

test('find: Name bleibt in Anführungszeichen, Löschen warnt', function () {
  var r = build('find', { act: 'delete', size: '100M' });
  assert.ok(r.cmd.indexOf("-name '*.log'") > 0 && /-size \+100M -delete$/.test(r.cmd), r.cmd);
  assert.strictEqual(r.warn.length, 1);
  assert.ok(build('find', { days: 'abc' }).err);
  assert.ok(build('find', { size: '10 MB' }).err);
});

test('tar: Entpacken legt Zielordner an, zstd', function () {
  assert.strictEqual(build('tar', { mode: 'x', comp: 'zst', arch: 'a.tar.zst', to: 'neu' }).cmd, 'mkdir -p neu && tar --zstd -xf a.tar.zst -C neu');
  assert.strictEqual(build('tar', { mode: 't' }).cmd, 'tar -tzf backup-nginx.tar.gz');
});

test('SSH-Tunnel und curl --resolve', function () {
  assert.strictEqual(build('tunnel', { kind: 'D', lport: '1080' }).cmd, 'ssh -N -D 1080 admin@jumphost.example');
  assert.strictEqual(build('tunnel', { kind: 'R', port: '2222' }).cmd, 'ssh -N -p 2222 -R 8443:192.168.10.5:443 admin@jumphost.example');
  assert.strictEqual(build('curl', { ip: '185.199.108.153' }).cmd, 'curl -I --resolve matija-tasic.de:443:185.199.108.153 https://matija-tasic.de/');
  assert.ok(build('curl', { ip: '2606:50c0:8000::153' }).cmd.indexOf('[2606:50c0:8000::153]') > 0);
  assert.ok(build('curl', { url: 'kein url' }).err);
});

test('Ausgeblendete Pflichtfelder blockieren nicht', function () {
  assert.ok(!build('tar', { mode: 'x', src: '' }).err);
});

test('Datei zum Speichern: .sh mit Shebang, .cmd mit CRLF', function () {
  var f = K.asFile(K.byId('rsync'), 'rsync -ah a b');
  assert.strictEqual(f.name, 'rsync.sh'); assert.ok(/^#!\/usr\/bin\/env bash\n/.test(f.text));
  var w = K.asFile(K.byId('robocopy'), 'robocopy a b');
  assert.strictEqual(w.name, 'robocopy.cmd'); assert.ok(/\r\nrobocopy a b\r\n$/.test(w.text));
});

if (hasBash) test('Erzeugte Bash-Befehle sind gültige Syntax (bash -n)', function () {
  K.TEMPLATES.filter(function (t) { return t.shell === 'sh'; }).forEach(function (t) {
    cp.execFileSync('bash', ['-n', '-c', K.run(t, K.defaults(t)).cmd]);
  });
});

console.log('\n' + passed + ' bestanden, ' + failed + ' fehlgeschlagen');
process.exit(failed ? 1 : 0);
