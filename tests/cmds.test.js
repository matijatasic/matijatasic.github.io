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
    t.fields.forEach(function (f) { (f.opts || []).forEach(function (o) { assert.ok(Array.isArray(o[1]) && o[1][0] && o[1][1], t.id + '.' + f.id + '=' + o[0]); }); });
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

test('Nur Linux: 30 Vorlagen, kein Windows mehr', function () {
  assert.strictEqual(K.TEMPLATES.length, 30);
  assert.strictEqual(K.byId('robocopy'), null);
  K.TEMPLATES.forEach(function (t) { assert.strictEqual(K.asFile(t, 'x').name, t.id + '.sh'); });
});

test('systemctl und journalctl: Dienstname wird geprüft', function () {
  assert.strictEqual(build('systemctl', { act: 'restart' }).cmd, 'sudo systemctl restart nginx && systemctl status nginx --no-pager');
  assert.strictEqual(build('systemctl', { act: 'enable', unit: 'getty@tty1' }).cmd, 'sudo systemctl enable --now getty@tty1');
  assert.ok(build('systemctl', { unit: 'nginx; reboot' }).err);
  assert.ok(!build('systemctl', { act: 'failed', unit: '' }).err);
  assert.strictEqual(build('journalctl', { boot: '-1', prio: 'err', f: true, lines: '' }).cmd, "sudo journalctl -u nginx -b -1 --since '1 hour ago' -p err -f");
});

test('crontab: Zeit, eigener Ausdruck und % wird maskiert', function () {
  var r = build('cron', { when: 'weekly', dow: '1', time: '4:05', cmd: 'tar czf /b/$(date +%F).tgz /etc', log: '' });
  assert.ok(r.cmd.indexOf("'5 4 * * 1 tar czf /b/$(date +\\%F).tgz /etc > /dev/null 2>&1'") > 0, r.cmd);
  assert.ok(build('cron', { time: '25:00' }).err);
  assert.ok(build('cron', { when: 'custom', expr: '* * * *' }).err);
  if (hasBash) {
    var line = cp.execFileSync('bash', ['-c', build('cron', { cmd: 'echo "it\'s" %d' }).cmd.replace(/^\((.*); echo (.*)\) \| crontab -$/, 'echo $2')]).toString();
    assert.strictEqual(line, '30 2 * * * echo "it\'s" \\%d >> /var/log/backup.log 2>&1\n');
  }
});

test('chmod/chown: Modus prüfen, nur Dateien per find, 777 warnt', function () {
  var r = build('perm', { scope: 'files', mode: '640', path: '/srv/my www' });
  assert.strictEqual(r.cmd, "sudo find '/srv/my www' -type f -exec chown www-data:www-data {} +\nsudo find '/srv/my www' -type f -exec chmod 640 {} +");
  assert.ok(/Besitzer rw-, Gruppe r--, Andere ---/.test(r.notes.map(function (n) { return n[0]; }).join(' ')));
  assert.strictEqual(build('perm', { mode: '777' }).warn.length, 1);
  assert.ok(!build('perm', { act: 'chmod', mode: 'u+x,g-w' }).err);
  assert.ok(build('perm', { mode: '7z9' }).err);
  assert.ok(build('perm', { owner: 'root;id' }).err);
});

test('Benutzer: -aG mit Warnung, Namen werden geprüft', function () {
  var r = build('users', { act: 'group', groups: 'docker, sudo' });
  assert.strictEqual(r.cmd, 'sudo usermod -aG docker,sudo max && id max');
  assert.strictEqual(r.warn.length, 1);
  assert.ok(build('users', { user: 'Max Mustermann' }).err);
  assert.ok(build('users', { act: 'lock' }).cmd.indexOf('-L -e 1') > 0);
});

test('Netzwerk: ss-Filter, ping-MTU, dig PTR, nc ohne nc', function () {
  assert.strictEqual(build('ss', { what: 'est', port: '443', p: false }).cmd, "ss -tun state established '( sport = :443 or dport = :443 )'");
  assert.strictEqual(build('ping', { mtu: true }).cmd, 'ping -c 4 -M do -s 1472 1.1.1.1');
  assert.strictEqual(build('ping', { tool: 'mtr', count: '' }).cmd, 'mtr -rwc 10 1.1.1.1');
  assert.strictEqual(build('dig', { type: 'PTR', name: '185.199.108.153', server: '1.1.1.1' }).cmd, 'dig @1.1.1.1 -x 185.199.108.153 +short');
  assert.ok(build('dig', { server: '1.1.1.1;id' }).err);
  assert.ok(build('nc', { mode: 'bash', host: 'a b' }).err);
  if (hasBash) assert.strictEqual(cp.execFileSync('bash', ['-c', build('nc', { mode: 'bash', host: '127.0.0.1', port: '9' }).cmd]).toString(), 'closed\n');
  assert.strictEqual(build('iperf3', { rev: true, par: '4' }).cmd, 'iperf3 -c 192.168.10.5 -t 10 -P 4 -R');
});

test('ufw: Quelle, Kommentar, Löschen braucht Nummer', function () {
  assert.strictEqual(build('ufw', { from: '', proto: '' }).cmd, "sudo ufw allow 22 comment 'SSH aus dem Admin-Netz'");
  assert.ok(build('ufw', { from: '10.0.0.0/8 to any' }).err);
  assert.ok(build('ufw', { act: 'delete' }).err);
  assert.strictEqual(build('ufw', { act: 'enable', ssh: '2222' }).warn.length, 1);
});

test('fstab: Sicherung vorher, Leerzeichen abgelehnt', function () {
  var r = build('mount', { act: 'nfs', perm: true });
  assert.ok(r.cmd.indexOf('sudo cp /etc/fstab /etc/fstab.bak && echo') > 0, r.cmd);
  assert.ok(r.cmd.indexOf("'192.168.10.10:/volume1/backup /mnt/nas nfs defaults,_netdev,nofail 0 0'") > 0, r.cmd);
  assert.ok(build('mount', { act: 'nfs', mnt: '/mnt/mein nas' }).err);
  assert.ok(build('mount', { act: 'cifs', smb: '192.168.10.10/backup' }).err);
});

test('Proxmox: IDs, Snapshot-Namen, vzdump mit mehreren IDs', function () {
  assert.strictEqual(build('pve', { kind: 'pct', act: 'rollback' }).cmd, 'pct rollback 100 vor_update');
  assert.strictEqual(build('pve', { act: 'snapshot', ram: true }).cmd, 'qm snapshot 100 vor_update --vmstate 1');
  assert.ok(build('pve', { act: 'snapshot', snap: '1-falsch' }).err);
  assert.ok(build('pve', { act: 'start', id: '99' }).err);
  assert.strictEqual(build('vzdump', { ids: '100, 101', keep: '3' }).cmd, 'vzdump 100 101 --storage local --mode snapshot --compress zstd --prune-backups keep-last=3');
  assert.strictEqual(build('zfs', { act: 'snap', r: true }).cmd, 'sudo zfs snapshot -r rpool/data@vor-update');
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

test('Datei zum Speichern: .sh mit Shebang', function () {
  var f = K.asFile(K.byId('rsync'), 'rsync -ah a b');
  assert.strictEqual(f.name, 'rsync.sh'); assert.ok(/^#!\/usr\/bin\/env bash\n# rsync/.test(f.text));
});

if (hasBash) test('Erzeugte Bash-Befehle sind gültige Syntax (bash -n)', function () {
  K.TEMPLATES.forEach(function (t) {
    cp.execFileSync('bash', ['-n', '-c', K.run(t, K.defaults(t)).cmd]);
  });
});

console.log('\n' + passed + ' bestanden, ' + failed + ' fehlgeschlagen');
process.exit(failed ? 1 : 0);
