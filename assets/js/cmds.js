/* matija-tasic.de · Befehls-Baukasten (Logik)
   - jede Vorlage: Felder + build(werte) → fertiger Befehl, Erklärung, Warnungen
   - Werte werden für die Shell sicher maskiert (Bash: einfache Anführungszeichen)
   - läuft im Browser und in Node (tests/cmds.test.js)
*/
(function (global) {
  'use strict';

  /* ---------- Maskieren ---------- */
  /* Bash: harmlose Zeichen bleiben stehen, alles andere in '…' (auch * und Leerzeichen) */
  function sq(s) {
    s = String(s);
    if (s === '') return "''";
    if (/^[A-Za-z0-9_\/.:@%+=,~-]+$/.test(s) && !/^~[^\/]/.test(s)) return s;
    return "'" + s.replace(/'/g, "'\\''") + "'";
  }
  /* Windows (robocopy): Anführungszeichen nur bei Bedarf. Ein Backslash am Ende
     würde das schließende " maskieren, deshalb weg, außer bei Laufwerken wie C:\ */
  function dq(s) {
    s = String(s).trim();
    if (!/^[A-Za-z]:\\$/.test(s)) s = s.replace(/\\+$/, '');
    return /[\s&()^,;=]/.test(s) ? '"' + s + '"' : s;
  }

  function T(de, en) { return [de, en]; }
  function isPort(v) { return /^\d{1,5}$/.test(v) && +v >= 1 && +v <= 65535; }
  function list(v) { return String(v || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean); }

  var PORT_ERR = T('Der Port muss zwischen 1 und 65535 liegen.', 'The port must be between 1 and 65535.');

  /* ---------- Vorlagen ---------- */
  var CATS = {
    copy: T('Sichern und Kopieren', 'Backup and copy'),
    search: T('Suchen', 'Search'),
    remote: T('Fernzugriff', 'Remote access'),
    net: T('Netzwerk und Diagnose', 'Network and diagnostics')
  };

  var TEMPLATES = [
    {
      id: 'rsync', cat: 'copy', shell: 'sh', name: T('rsync: Ordner sichern oder abgleichen', 'rsync: back up or sync a folder'),
      fields: [
        { id: 'src', type: 'text', req: true, def: '/srv/daten/', label: T('Quelle', 'Source') },
        { id: 'dst', type: 'text', req: true, def: '/mnt/backup/daten/', label: T('Ziel (auch user@host:/pfad)', 'Target (also user@host:/path)') },
        { id: 'excl', type: 'text', def: '.cache, *.tmp', label: T('Ausschließen (mit Komma)', 'Exclude (comma separated)') },
        { id: 'port', type: 'num', def: '', label: T('SSH-Port (nur bei Ziel auf anderem Rechner)', 'SSH port (remote target only)') },
        { id: 'dry', type: 'check', def: true, label: T('Probelauf (ändert nichts)', 'Dry run (changes nothing)') },
        { id: 'del', type: 'check', def: false, label: T('Spiegeln: im Ziel löschen, was in der Quelle fehlt', 'Mirror: delete in target what is missing in source') },
        { id: 'z', type: 'check', def: false, label: T('Komprimiert übertragen (langsame Leitung)', 'Compress in transit (slow link)') },
        { id: 'prog', type: 'check', def: true, label: T('Fortschritt anzeigen', 'Show progress') }
      ],
      build: function (v) {
        if (v.port && !isPort(v.port)) return { err: PORT_ERR };
        var c = ['rsync', v.z ? '-ahz' : '-ah'], n = [], w = [];
        n.push(T('-a (Archiv): Rechte, Zeitstempel und Links bleiben erhalten. -h: Größen gut lesbar.', '-a (archive): permissions, timestamps and links are kept. -h: human-readable sizes.'));
        if (v.prog) c.push('--info=progress2');
        if (v.del) { c.push('--delete'); w.push(T('--delete löscht im Ziel alles, was es in der Quelle nicht gibt. Erst mit Probelauf prüfen.', '--delete removes everything in the target that is not in the source. Check with a dry run first.')); }
        if (v.dry) { c.push('--dry-run'); n.push(T('--dry-run: zeigt nur, was passieren würde. Für den echten Lauf den Haken entfernen.', '--dry-run: only shows what would happen. Untick it for the real run.')); }
        list(v.excl).forEach(function (p) { c.push('--exclude=' + sq(p)); });
        if (v.port) { c.push('-e', sq('ssh -p ' + v.port)); n.push(T('-e: Verbindung über SSH auf Port ' + v.port + '.', '-e: connect via SSH on port ' + v.port + '.')); }
        c.push(sq(v.src), sq(v.dst));
        n.push(/\/$/.test(v.src)
          ? T('Quelle endet mit „/“: Der INHALT des Ordners landet im Ziel.', 'Source ends with “/”: the folder’s CONTENTS end up in the target.')
          : T('Quelle ohne „/“ am Ende: Der Ordner SELBST wird im Ziel angelegt.', 'Source without a trailing “/”: the folder ITSELF is created in the target.'));
        return { cmd: c.join(' '), notes: n, warn: w };
      }
    },
    {
      id: 'robocopy', cat: 'copy', shell: 'cmd', name: T('robocopy: Ordner unter Windows sichern', 'robocopy: back up a folder on Windows'),
      fields: [
        { id: 'src', type: 'text', req: true, def: 'D:\\Daten', label: T('Quelle', 'Source') },
        { id: 'dst', type: 'text', req: true, def: '\\\\nas\\backup\\Daten', label: T('Ziel', 'Target') },
        { id: 'mode', type: 'select', def: 'copy', label: T('Art', 'Mode'), opts: [['copy', T('Kopieren mit Unterordnern (/E)', 'Copy incl. subfolders (/E)')], ['mir', T('Spiegeln (/MIR, löscht im Ziel)', 'Mirror (/MIR, deletes in target)')]] },
        { id: 'log', type: 'text', def: 'C:\\Logs\\robocopy.log', label: T('Logdatei (leer = keine)', 'Log file (empty = none)') },
        { id: 'dry', type: 'check', def: true, label: T('Probelauf (/L, ändert nichts)', 'Dry run (/L, changes nothing)') },
        { id: 'z', type: 'check', def: false, label: T('Abbruchsicher (/Z, für Netz und große Dateien)', 'Restartable (/Z, for network and large files)') },
        { id: 'mt', type: 'check', def: false, label: T('Mehrere Threads (/MT:8)', 'Multiple threads (/MT:8)') }
      ],
      build: function (v) {
        var c = ['robocopy', dq(v.src), dq(v.dst)], n = [], w = [];
        if (v.mode === 'mir') { c.push('/MIR'); w.push(T('/MIR löscht im Ziel alles, was in der Quelle fehlt. Erst mit /L prüfen.', '/MIR deletes everything in the target that is missing in the source. Check with /L first.')); }
        else { c.push('/E'); n.push(T('/E: kopiert alle Unterordner, auch leere.', '/E: copies all subfolders, including empty ones.')); }
        if (v.z) c.push('/Z');
        if (v.mt) c.push('/MT:8');
        c.push('/R:2', '/W:5');
        n.push(T('/R:2 /W:5: bei Fehlern 2 Versuche mit 5 Sekunden Pause statt 1 Million Versuchen.', '/R:2 /W:5: on errors 2 retries with a 5 second pause instead of one million.'));
        if (v.log) { c.push('/LOG+:' + dq(v.log), '/TEE'); n.push(T('/LOG+ hängt an die Logdatei an, /TEE zeigt die Ausgabe trotzdem an.', '/LOG+ appends to the log file, /TEE still shows the output.')); }
        if (v.dry) { c.push('/L'); n.push(T('/L: listet nur auf, was kopiert würde.', '/L: only lists what would be copied.')); }
        n.push(T('Exit-Code 0 bis 7 bedeutet Erfolg, ab 8 gab es Fehler.', 'Exit code 0 to 7 means success, 8 or higher means errors.'));
        return { cmd: c.join(' '), notes: n, warn: w };
      }
    },
    {
      id: 'scp', cat: 'copy', shell: 'sh', name: T('scp: Datei auf einen Server kopieren', 'scp: copy a file to a server'),
      fields: [
        { id: 'dir', type: 'select', def: 'up', label: T('Richtung', 'Direction'), opts: [['up', T('Hochladen (lokal → Server)', 'Upload (local → server)')], ['down', T('Herunterladen (Server → lokal)', 'Download (server → local)')]] },
        { id: 'local', type: 'text', req: true, def: './config.xml', label: T('Lokaler Pfad', 'Local path') },
        { id: 'host', type: 'text', req: true, def: 'admin@192.168.10.1', label: T('Benutzer@Server', 'User@server') },
        { id: 'remote', type: 'text', req: true, def: '/tmp/', label: T('Pfad auf dem Server', 'Path on the server') },
        { id: 'port', type: 'num', def: '', label: T('SSH-Port (leer = 22)', 'SSH port (empty = 22)') },
        { id: 'r', type: 'check', def: false, label: T('Ganzen Ordner kopieren (-r)', 'Copy whole folder (-r)') }
      ],
      build: function (v) {
        if (v.port && !isPort(v.port)) return { err: PORT_ERR };
        var c = ['scp'], n = [];
        if (v.port) c.push('-P', v.port);
        if (v.r) c.push('-r');
        var rem = sq(v.host + ':' + v.remote);
        if (v.dir === 'up') c.push(sq(v.local), rem); else c.push(rem, sq(v.local));
        if (v.port) n.push(T('-P (großes P): SSH-Port bei scp.', '-P (capital P): SSH port for scp.'));
        n.push(T('Für große oder viele Dateien ist rsync besser, weil es Abbrüche fortsetzen kann.', 'For large or many files rsync is better because it can resume.'));
        return { cmd: c.join(' '), notes: n, warn: [] };
      }
    },
    {
      id: 'tar', cat: 'copy', shell: 'sh', name: T('tar: Archiv packen oder entpacken', 'tar: create or extract an archive'),
      fields: [
        { id: 'mode', type: 'select', def: 'c', label: T('Aktion', 'Action'), opts: [['c', T('Archiv erstellen', 'Create archive')], ['x', T('Archiv entpacken', 'Extract archive')], ['t', T('Inhalt anzeigen', 'List contents')]] },
        { id: 'comp', type: 'select', def: 'gz', label: T('Komprimierung', 'Compression'), opts: [['gz', T('gzip (.tar.gz)', 'gzip (.tar.gz)')], ['zst', T('zstd (.tar.zst, schnell)', 'zstd (.tar.zst, fast)')], ['xz', T('xz (.tar.xz, klein)', 'xz (.tar.xz, small)')], ['none', T('keine (.tar)', 'none (.tar)')]] },
        { id: 'arch', type: 'text', req: true, def: 'backup-nginx.tar.gz', label: T('Archivdatei', 'Archive file') },
        { id: 'src', type: 'text', req: true, def: '/etc/nginx', label: T('Was packen', 'What to pack'), show: function (v) { return v.mode === 'c'; } },
        { id: 'to', type: 'text', def: './wiederherstellung', label: T('Entpacken nach (leer = hier)', 'Extract to (empty = here)'), show: function (v) { return v.mode === 'x'; } },
        { id: 'v', type: 'check', def: false, label: T('Dateien beim Packen auflisten (-v)', 'List files while working (-v)') }
      ],
      build: function (v) {
        var flag = { gz: 'z', xz: 'J', zst: '', none: '' }[v.comp];
        var c = ['tar'], n = [];
        if (v.comp === 'zst') c.push('--zstd');
        c.push('-' + v.mode + flag + (v.v ? 'v' : '') + 'f', sq(v.arch));
        if (v.mode === 'c') {
          c.push(sq(v.src));
          n.push(T('Beim Packen mit absolutem Pfad entfernt tar das führende „/“. Beim Entpacken landet alles relativ zum Zielordner.', 'When packing an absolute path, tar strips the leading “/”. On extract, everything lands relative to the target folder.'));
        } else if (v.mode === 'x' && v.to) {
          c.push('-C', sq(v.to));
          n.push(T('-C: entpackt in diesen Ordner. Er muss schon existieren.', '-C: extracts into this folder. It must already exist.'));
        }
        if (v.mode === 't') n.push(T('-t: zeigt nur den Inhalt, nichts wird entpackt.', '-t: only lists the contents, nothing is extracted.'));
        return { cmd: (v.mode === 'x' && v.to ? 'mkdir -p ' + sq(v.to) + ' && ' : '') + c.join(' '), notes: n, warn: [] };
      }
    },
    {
      id: 'find', cat: 'search', shell: 'sh', name: T('find: Dateien suchen und aufräumen', 'find: search and clean up files'),
      fields: [
        { id: 'path', type: 'text', req: true, def: '/var/log', label: T('Wo suchen', 'Where to search') },
        { id: 'name', type: 'text', def: '*.log', label: T('Name (Platzhalter * erlaubt)', 'Name (wildcard * allowed)') },
        { id: 'type', type: 'select', def: 'f', label: T('Art', 'Type'), opts: [['f', T('Dateien', 'Files')], ['d', T('Ordner', 'Folders')], ['', T('beides', 'both')]] },
        { id: 'days', type: 'num', def: '30', label: T('Älter als Tage (leer = egal)', 'Older than days (empty = any)') },
        { id: 'size', type: 'text', def: '', label: T('Größer als (z. B. 100M, 2G)', 'Larger than (e.g. 100M, 2G)') },
        { id: 'act', type: 'select', def: 'print', label: T('Was tun', 'Action'), opts: [['print', T('Nur auflisten', 'List only')], ['ls', T('Auflisten mit Größe und Datum', 'List with size and date')], ['delete', T('Löschen', 'Delete')]] }
      ],
      build: function (v) {
        if (v.days && !/^\d+$/.test(v.days)) return { err: T('Bei „Tage“ bitte nur eine Zahl eingeben.', 'Please enter a number for “days”.') };
        if (v.size && !/^\d+[kMG]?$/.test(v.size)) return { err: T('Größe bitte wie 500k, 100M oder 2G angeben.', 'Please give the size like 500k, 100M or 2G.') };
        var c = ['find', sq(v.path)], n = [], w = [];
        if (v.type) c.push('-type', v.type);
        if (v.name) c.push('-name', "'" + v.name.replace(/'/g, "'\\''") + "'");
        if (v.days) { c.push('-mtime', '+' + v.days); n.push(T('-mtime +' + v.days + ': zuletzt geändert vor mehr als ' + v.days + ' Tagen.', '-mtime +' + v.days + ': last modified more than ' + v.days + ' days ago.')); }
        if (v.size) c.push('-size', '+' + v.size);
        c.push('-' + v.act);
        if (v.name) n.push(T('Der Name steht in Anführungszeichen, damit die Shell * nicht vorher selbst auflöst.', 'The name is quoted so the shell does not expand * itself.'));
        if (v.act === 'delete') w.push(T('-delete löscht ohne Rückfrage. Erst mit „Nur auflisten“ prüfen, was getroffen wird.', '-delete removes without asking. Check first with “List only” what is matched.'));
        return { cmd: c.join(' '), notes: n, warn: w };
      }
    },
    {
      id: 'tunnel', cat: 'remote', shell: 'sh', name: T('SSH-Tunnel: Dienst sicher erreichen', 'SSH tunnel: reach a service securely'),
      fields: [
        { id: 'kind', type: 'select', def: 'L', label: T('Art', 'Type'), opts: [['L', T('Lokal (-L): entfernten Dienst hier öffnen', 'Local (-L): open a remote service here')], ['R', T('Rückwärts (-R): lokalen Dienst am Server anbieten', 'Reverse (-R): offer a local service on the server')], ['D', T('SOCKS-Proxy (-D): ganzen Browser durchleiten', 'SOCKS proxy (-D): route the whole browser')]] },
        { id: 'host', type: 'text', req: true, def: 'admin@jumphost.example', label: T('Benutzer@SSH-Server', 'User@SSH server') },
        { id: 'port', type: 'num', def: '', label: T('SSH-Port (leer = 22)', 'SSH port (empty = 22)') },
        { id: 'lport', type: 'num', req: true, def: '8443', label: T('Port auf dieser Seite', 'Port on this side') },
        { id: 'thost', type: 'text', def: '192.168.10.5', label: T('Ziel-Rechner', 'Target host'), show: function (v) { return v.kind !== 'D'; } },
        { id: 'tport', type: 'num', def: '443', label: T('Ziel-Port', 'Target port'), show: function (v) { return v.kind !== 'D'; } }
      ],
      build: function (v) {
        if (!isPort(v.lport) || (v.port && !isPort(v.port)) || (v.kind !== 'D' && !isPort(v.tport))) return { err: PORT_ERR };
        if (v.kind !== 'D' && !v.thost) return { err: T('Bitte den Ziel-Rechner angeben.', 'Please enter the target host.') };
        var c = ['ssh', '-N'], n = [T('-N: nur Tunnel, keine Shell. Beenden mit Strg+C.', '-N: tunnel only, no shell. Stop with Ctrl+C.')];
        if (v.port) c.push('-p', v.port);
        if (v.kind === 'D') {
          c.push('-D', v.lport);
          n.push(T('Im Browser als SOCKS5-Proxy localhost:' + v.lport + ' eintragen.', 'Set localhost:' + v.lport + ' as SOCKS5 proxy in the browser.'));
        } else {
          c.push('-' + v.kind, v.lport + ':' + sq(v.thost) + ':' + v.tport);
          n.push(v.kind === 'L'
            ? T('Danach erreichen Sie ' + v.thost + ':' + v.tport + ' hier unter localhost:' + v.lport + '.', 'Then ' + v.thost + ':' + v.tport + ' is reachable here as localhost:' + v.lport + '.')
            : T('Danach erreicht der Server unter localhost:' + v.lport + ' den Dienst ' + v.thost + ':' + v.tport + ' auf Ihrer Seite.', 'Then the server reaches ' + v.thost + ':' + v.tport + ' on your side as localhost:' + v.lport + '.'));
        }
        c.push(sq(v.host));
        if (+v.lport < 1024) n.push(T('Ports unter 1024 brauchen Root-Rechte, besser einen hohen Port nehmen.', 'Ports below 1024 need root, better use a high port.'));
        return { cmd: c.join(' '), notes: n, warn: [] };
      }
    },
    {
      id: 'keygen', cat: 'remote', shell: 'sh', name: T('ssh-keygen: SSH-Schlüssel erzeugen', 'ssh-keygen: create an SSH key'),
      fields: [
        { id: 'type', type: 'select', def: 'ed25519', label: T('Schlüsseltyp', 'Key type'), opts: [['ed25519', T('Ed25519 (empfohlen)', 'Ed25519 (recommended)')], ['rsa', T('RSA 4096 (für alte Systeme)', 'RSA 4096 (for old systems)')]] },
        { id: 'file', type: 'text', req: true, def: '~/.ssh/id_ed25519_homelab', label: T('Datei', 'File') },
        { id: 'comment', type: 'text', def: 'matija@laptop', label: T('Kommentar', 'Comment') },
        { id: 'host', type: 'text', def: 'admin@192.168.10.20', label: T('Danach auf Server kopieren (leer = nicht)', 'Then copy to server (empty = skip)') }
      ],
      build: function (v) {
        var c = ['ssh-keygen', '-t', v.type];
        if (v.type === 'rsa') c.push('-b', '4096');
        c.push('-f', sq(v.file));
        if (v.comment) c.push('-C', sq(v.comment));
        var cmd = c.join(' ');
        var n = [T('Beim Erzeugen nach einer Passphrase gefragt: Bitte eine setzen, sonst kann jeder mit der Datei sich anmelden.', 'You will be asked for a passphrase: please set one, otherwise anyone with the file can log in.')];
        if (v.host) {
          cmd += '\nssh-copy-id -i ' + sq(v.file + '.pub') + ' ' + sq(v.host);
          n.push(T('ssh-copy-id trägt nur den öffentlichen Schlüssel (.pub) beim Server ein. Der private bleibt bei Ihnen.', 'ssh-copy-id only adds the public key (.pub) on the server. The private key stays with you.'));
        }
        return { cmd: cmd, notes: n, warn: [] };
      }
    },
    {
      id: 'curl', cat: 'net', shell: 'sh', name: T('curl: Webserver testen', 'curl: test a web server'),
      fields: [
        { id: 'url', type: 'text', req: true, def: 'https://matija-tasic.de/', label: T('Adresse', 'URL') },
        { id: 'head', type: 'check', def: true, label: T('Nur Kopfzeilen (-I)', 'Headers only (-I)') },
        { id: 'follow', type: 'check', def: false, label: T('Weiterleitungen folgen (-L)', 'Follow redirects (-L)') },
        { id: 'ip', type: 'text', def: '', label: T('Gegen diese IP testen (vor DNS-Umstellung)', 'Test against this IP (before a DNS change)') },
        { id: 'verbose', type: 'check', def: false, label: T('Ausführlich mit TLS-Details (-v)', 'Verbose with TLS details (-v)') },
        { id: 'k', type: 'check', def: false, label: T('Zertifikat nicht prüfen (-k)', 'Do not check certificate (-k)') }
      ],
      build: function (v) {
        var u;
        try { u = new URL(v.url); } catch (e) { return { err: T('Bitte eine vollständige Adresse mit https:// eingeben.', 'Please enter a full URL with https://.') }; }
        var c = ['curl'], n = [], w = [];
        if (v.head) c.push('-I');
        if (v.follow) c.push('-L');
        if (v.verbose) c.push('-v');
        if (v.k) { c.push('-k'); w.push(T('-k schaltet die Zertifikatsprüfung ab. Nur zum Testen verwenden.', '-k turns off certificate checks. Use for testing only.')); }
        if (v.ip) {
          var port = u.port || (u.protocol === 'http:' ? '80' : '443');
          c.push('--resolve', sq(u.hostname + ':' + port + ':' + (v.ip.indexOf(':') >= 0 && v.ip[0] !== '[' ? '[' + v.ip + ']' : v.ip)));
          n.push(T('--resolve: fragt ' + u.hostname + ' direkt unter ' + v.ip + ' an, ohne DNS. So testen Sie einen neuen Server, bevor der DNS-Eintrag umgestellt ist.', '--resolve: asks ' + u.hostname + ' directly at ' + v.ip + ', bypassing DNS. Lets you test a new server before switching DNS.'));
        }
        c.push(sq(v.url));
        if (v.head) n.push(T('-I: zeigt Statuscode (200, 301, 404 …) und Kopfzeilen wie Server und Weiterleitungsziel.', '-I: shows the status code (200, 301, 404 …) and headers such as server and redirect target.'));
        return { cmd: c.join(' '), notes: n, warn: w };
      }
    },
    {
      id: 'openssl', cat: 'net', shell: 'sh', name: T('openssl: Zertifikat eines Servers prüfen', 'openssl: check a server certificate'),
      fields: [
        { id: 'host', type: 'text', req: true, def: 'matija-tasic.de', label: T('Servername', 'Server name') },
        { id: 'port', type: 'num', def: '443', label: T('Port', 'Port') }
      ],
      build: function (v) {
        var port = v.port || '443';
        if (!isPort(port)) return { err: PORT_ERR };
        var h = sq(v.host);
        return {
          cmd: 'echo | openssl s_client -connect ' + h + ':' + port + ' -servername ' + h + ' 2>/dev/null | openssl x509 -noout -subject -issuer -dates -ext subjectAltName',
          notes: [
            T('Zeigt Inhaber, Aussteller, Gültigkeit (notBefore/notAfter) und alle Domains im Zertifikat.', 'Shows subject, issuer, validity (notBefore/notAfter) and all domains in the certificate.'),
            T('-servername sendet den Namen mit (SNI). Ohne ihn liefern viele Server ein falsches Zertifikat.', '-servername sends the name along (SNI). Without it many servers return the wrong certificate.')
          ],
          warn: []
        };
      }
    },
    {
      id: 'nmap', cat: 'net', shell: 'sh', name: T('nmap: Netz oder Host scannen', 'nmap: scan a network or host'),
      fields: [
        { id: 'target', type: 'text', req: true, def: '192.168.10.0/24', label: T('Ziel (IP, Netz oder Name)', 'Target (IP, network or name)') },
        { id: 'scan', type: 'select', def: 'sn', label: T('Art', 'Type'), opts: [['sn', T('Welche Geräte sind online? (-sn)', 'Which devices are online? (-sn)')], ['top', T('Häufigste 100 Ports', 'Top 100 ports')], ['ports', T('Bestimmte Ports', 'Specific ports')], ['all', T('Alle 65535 Ports (langsam)', 'All 65535 ports (slow)')]] },
        { id: 'ports', type: 'text', def: '22,80,443', label: T('Ports (mit Komma)', 'Ports (comma separated)'), show: function (v) { return v.scan === 'ports'; } },
        { id: 'sv', type: 'check', def: false, label: T('Dienst und Version erkennen (-sV)', 'Detect service and version (-sV)') },
        { id: 'out', type: 'text', def: '', label: T('Ergebnis in Datei (leer = nein)', 'Save result to file (empty = no)') }
      ],
      build: function (v) {
        if (v.scan === 'ports' && !/^\d+(-\d+)?(,\d+(-\d+)?)*$/.test(v.ports.replace(/\s/g, ''))) return { err: T('Ports bitte wie 22,80,443 oder 1-1024 angeben.', 'Please give ports like 22,80,443 or 1-1024.') };
        var c = ['nmap'], n = [];
        if (v.scan === 'sn') { c.push('-sn'); n.push(T('-sn: nur Erreichbarkeit, kein Portscan.', '-sn: reachability only, no port scan.')); }
        if (v.scan === 'top') c.push('--top-ports', '100');
        if (v.scan === 'ports') c.push('-p', v.ports.replace(/\s/g, ''));
        if (v.scan === 'all') c.push('-p-');
        if (v.sv && v.scan !== 'sn') c.push('-sV');
        if (v.out) c.push('-oN', sq(v.out));
        c.push(sq(v.target));
        return {
          cmd: c.join(' '), notes: n,
          warn: [T('Nur eigene Netze oder mit Erlaubnis scannen. Fremde Systeme zu scannen kann strafbar sein.', 'Only scan your own networks or with permission. Scanning other systems can be illegal.')]
        };
      }
    },
    {
      id: 'tcpdump', cat: 'net', shell: 'sh', name: T('tcpdump: Netzwerkverkehr mitschneiden', 'tcpdump: capture network traffic'),
      fields: [
        { id: 'iface', type: 'text', req: true, def: 'eth0', label: T('Schnittstelle', 'Interface') },
        { id: 'host', type: 'text', def: '192.168.10.5', label: T('Nur dieser Host (leer = alle)', 'Only this host (empty = all)') },
        { id: 'port', type: 'num', def: '', label: T('Nur dieser Port', 'Only this port') },
        { id: 'proto', type: 'select', def: '', label: T('Protokoll', 'Protocol'), opts: [['', T('alle', 'all')], ['tcp', T('TCP', 'TCP')], ['udp', T('UDP', 'UDP')], ['icmp', T('ICMP (Ping)', 'ICMP (ping)')]] },
        { id: 'count', type: 'num', def: '100', label: T('Nach so vielen Paketen stoppen', 'Stop after this many packets') },
        { id: 'file', type: 'text', def: '', label: T('In Datei für Wireshark (.pcap)', 'Save to file for Wireshark (.pcap)') }
      ],
      build: function (v) {
        if (v.port && !isPort(v.port)) return { err: PORT_ERR };
        if (v.count && !/^\d+$/.test(v.count)) return { err: T('Anzahl bitte als Zahl.', 'Please enter the count as a number.') };
        var c = ['sudo', 'tcpdump', '-i', sq(v.iface), '-nn'], f = [], n = [T('-nn: zeigt IPs und Portnummern statt Namen, das ist schneller und eindeutiger.', '-nn: shows IPs and port numbers instead of names, faster and unambiguous.')];
        if (v.count) c.push('-c', v.count);
        if (v.file) { c.push('-w', sq(v.file)); n.push(T('-w: schreibt in eine Datei, die Sie in Wireshark öffnen können.', '-w: writes to a file you can open in Wireshark.')); }
        if (v.proto) f.push(v.proto);
        if (v.host) f.push('host ' + v.host);
        if (v.port) f.push('port ' + v.port);
        if (f.length) c.push(sq(f.join(' and ')));
        return { cmd: c.join(' '), notes: n, warn: [] };
      }
    }
  ];

  function byId(id) { return TEMPLATES.filter(function (t) { return t.id === id; })[0] || null; }

  /* Standardwerte einer Vorlage */
  function defaults(t) {
    var v = {};
    t.fields.forEach(function (f) { v[f.id] = f.def; });
    return v;
  }

  /* Prüft Pflichtfelder und baut den Befehl. Liefert {cmd, notes, warn} oder {err} */
  function run(t, v) {
    for (var i = 0; i < t.fields.length; i++) {
      var f = t.fields[i];
      if (f.show && !f.show(v)) continue;
      if (f.type !== 'check' && typeof v[f.id] === 'string') v[f.id] = v[f.id].trim();
      if (f.req && !v[f.id]) return { err: T('Bitte „' + f.label[0] + '“ ausfüllen.', 'Please fill in “' + f.label[1] + '”.') };
    }
    return t.build(v);
  }

  /* Inhalt für „Als Datei speichern“ */
  function asFile(t, cmd) {
    if (t.shell === 'cmd') return { name: t.id + '.cmd', text: '@echo off\r\nREM ' + t.name[0] + '\r\n' + cmd.replace(/\n/g, '\r\n') + '\r\n' };
    return { name: t.id + '.sh', text: '#!/usr/bin/env bash\n# ' + t.name[0] + '\n' + cmd + '\n' };
  }

  var api = { CATS: CATS, TEMPLATES: TEMPLATES, byId: byId, defaults: defaults, run: run, asFile: asFile, sq: sq, dq: dq };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.CmdKit = api;
})(this);
