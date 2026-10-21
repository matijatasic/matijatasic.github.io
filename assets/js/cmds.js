/* matija-tasic.de · Befehls-Baukasten (Logik)
   - jede Vorlage: Felder + build(werte) → fertiger Befehl, Erklärung, Warnungen
   - nur Linux (Bash); Werte werden sicher maskiert (einfache Anführungszeichen)
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
  function T(de, en) { return [de, en]; }
  function isPort(v) { return /^\d{1,5}$/.test(v) && +v >= 1 && +v <= 65535; }
  function list(v) { return String(v || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean); }

  function isUnit(v) { return /^[A-Za-z0-9@._:-]+$/.test(v || ''); }

  var PORT_ERR = T('Der Port muss zwischen 1 und 65535 liegen.', 'The port must be between 1 and 65535.');
  var NUM_ERR = T('Bitte nur Zahlen eingeben.', 'Please enter numbers only.');
  var UNIT_ERR = T('Dienstname bitte wie nginx, ssh oder getty@tty1 angeben.', 'Please give the service name like nginx, ssh or getty@tty1.');
  var ROOT_NOTE = T('Auf dem Proxmox-Host als root ausführen (Shell in der Oberfläche oder SSH).', 'Run as root on the Proxmox host (shell in the web UI or SSH).');

  /* ---------- Vorlagen ---------- */
  var CATS = {
    services: T('Dienste und Logs', 'Services and logs'),
    system: T('Pakete und Prozesse', 'Packages and processes'),
    users: T('Benutzer und Rechte', 'Users and permissions'),
    storage: T('Dateien und Speicher', 'Files and storage'),
    copy: T('Sichern und Kopieren', 'Backup and copy'),
    remote: T('Fernzugriff (SSH)', 'Remote access (SSH)'),
    net: T('Netzwerk prüfen', 'Network checks'),
    web: T('Web und Zertifikate', 'Web and certificates'),
    sec: T('Firewall und Mitschnitt', 'Firewall and capture'),
    proxmox: T('Proxmox VE', 'Proxmox VE')
  };

  var TEMPLATES = [
    /* ===== Dienste und Logs ===== */
    {
      id: 'systemctl', cat: 'services', name: T('systemctl: Dienst steuern', 'systemctl: control a service'),
      fields: [
        { id: 'act', type: 'select', def: 'status', label: T('Aktion', 'Action'), opts: [['status', T('Zustand anzeigen', 'Show status')], ['restart', T('Neu starten', 'Restart')], ['reload', T('Konfiguration neu laden', 'Reload configuration')], ['start', T('Starten', 'Start')], ['stop', T('Stoppen', 'Stop')], ['enable', T('Beim Systemstart aktivieren und starten', 'Enable at boot and start')], ['disable', T('Beim Systemstart deaktivieren und stoppen', 'Disable at boot and stop')], ['failed', T('Welche Dienste sind ausgefallen?', 'Which services have failed?')]] },
        { id: 'unit', type: 'text', req: true, def: 'nginx', label: T('Dienst', 'Service'), show: function (v) { return v.act !== 'failed'; } }
      ],
      build: function (v) {
        if (v.act === 'failed') return { cmd: 'systemctl --failed', notes: [T('Listet alle Dienste, die mit Fehler beendet wurden. Details dann mit „Zustand anzeigen“ oder journalctl.', 'Lists all services that ended with an error. Details via “Show status” or journalctl.')], warn: [] };
        if (!isUnit(v.unit)) return { err: UNIT_ERR };
        var u = v.unit, n = [], w = [], cmd;
        if (v.act === 'status') {
          cmd = 'systemctl status ' + u + ' --no-pager';
          n.push(T('Zeigt, ob der Dienst läuft (active/failed), seit wann, die Prozess-ID und die letzten Logzeilen.', 'Shows whether the service is running (active/failed), since when, the process ID and the last log lines.'));
        } else if (v.act === 'enable' || v.act === 'disable') {
          cmd = 'sudo systemctl ' + v.act + ' --now ' + u;
          n.push(v.act === 'enable'
            ? T('enable: startet den Dienst bei jedem Systemstart. --now startet ihn zusätzlich sofort.', 'enable: starts the service at every boot. --now also starts it right away.')
            : T('disable: kein automatischer Start mehr. --now stoppt ihn zusätzlich sofort.', 'disable: no more automatic start. --now also stops it right away.'));
        } else {
          cmd = 'sudo systemctl ' + v.act + ' ' + u + ' && systemctl status ' + u + ' --no-pager';
          n.push(T('Danach wird gleich der Zustand angezeigt, so sehen Sie sofort, ob es geklappt hat.', 'The status is shown right after, so you see at once whether it worked.'));
          if (v.act === 'reload') n.push(T('reload liest die Konfiguration neu, ohne Verbindungen zu trennen. Nicht jeder Dienst kann das; dann restart nehmen.', 'reload re-reads the configuration without dropping connections. Not every service supports it; use restart then.'));
          if (v.act === 'restart' || v.act === 'reload') n.push(T('Tipp: Konfiguration vorher prüfen, z. B. nginx -t, apachectl configtest oder sshd -t.', 'Tip: check the configuration first, e.g. nginx -t, apachectl configtest or sshd -t.'));
          if (v.act === 'stop' || v.act === 'restart') w.push(T('Der Dienst ist kurz bzw. bis zum Start nicht erreichbar. Bei sshd über SSH aufpassen.', 'The service is unavailable briefly or until started again. Be careful with sshd over SSH.'));
        }
        return { cmd: cmd, notes: n, warn: w };
      }
    },
    {
      id: 'journalctl', cat: 'services', name: T('journalctl: Logs eines Dienstes lesen', 'journalctl: read a service’s logs'),
      fields: [
        { id: 'unit', type: 'text', def: 'nginx', label: T('Dienst (leer = alle)', 'Service (empty = all)') },
        { id: 'since', type: 'select', def: '1 hour ago', label: T('Zeitraum', 'Time range'), opts: [['', T('gesamt', 'all')], ['10 min ago', T('letzte 10 Minuten', 'last 10 minutes')], ['1 hour ago', T('letzte Stunde', 'last hour')], ['today', T('heute', 'today')], ['yesterday', T('seit gestern', 'since yesterday')]] },
        { id: 'boot', type: 'select', def: '', label: T('Systemstart', 'Boot'), opts: [['', T('egal', 'any')], ['0', T('nur seit dem letzten Start', 'current boot only')], ['-1', T('vorheriger Start (nach Absturz)', 'previous boot (after a crash)')]] },
        { id: 'prio', type: 'select', def: '', label: T('Nur Meldungen ab', 'Only messages from'), opts: [['', T('alle', 'all')], ['warning', T('Warnung', 'warning')], ['err', T('Fehler', 'error')]] },
        { id: 'lines', type: 'num', def: '100', label: T('Letzte Zeilen (leer = alle)', 'Last lines (empty = all)') },
        { id: 'f', type: 'check', def: false, label: T('Live mitlesen (-f)', 'Follow live (-f)') }
      ],
      build: function (v) {
        if (v.unit && !isUnit(v.unit)) return { err: UNIT_ERR };
        if (v.lines && !/^\d+$/.test(v.lines)) return { err: NUM_ERR };
        var c = ['sudo', 'journalctl'], n = [];
        if (v.unit) c.push('-u', v.unit);
        if (v.boot) c.push('-b', v.boot);
        if (v.since) c.push('--since', sq(v.since));
        if (v.prio) { c.push('-p', v.prio); n.push(T('-p ' + v.prio + ': nur Meldungen dieser Stufe und schlimmer.', '-p ' + v.prio + ': only messages of this level and worse.')); }
        if (v.lines) c.push('-n', v.lines);
        if (v.f) { c.push('-f'); n.push(T('-f: neue Zeilen erscheinen sofort. Beenden mit Strg+C.', '-f: new lines appear at once. Stop with Ctrl+C.')); }
        else c.push('--no-pager');
        if (v.boot === '-1') n.push(T('-b -1 geht nur, wenn das Journal dauerhaft gespeichert wird (Ordner /var/log/journal vorhanden).', '-b -1 only works if the journal is stored persistently (folder /var/log/journal exists).'));
        n.push(T('sudo ist nötig, um die Logs aller Dienste zu sehen.', 'sudo is needed to see the logs of all services.'));
        return { cmd: c.join(' '), notes: n, warn: [] };
      }
    },
    {
      id: 'logs', cat: 'services', name: T('grep und tail: Logdatei durchsuchen', 'grep and tail: search a log file'),
      fields: [
        { id: 'mode', type: 'select', def: 'grep', label: T('Art', 'Mode'), opts: [['grep', T('Datei nach Begriff durchsuchen', 'Search file for a term')], ['tail', T('Ende live mitlesen', 'Follow the end live')], ['both', T('Live mitlesen und filtern', 'Follow live and filter')]] },
        { id: 'file', type: 'text', req: true, def: '/var/log/syslog', label: T('Datei oder Ordner', 'File or folder') },
        { id: 'pat', type: 'text', def: 'error', label: T('Suchbegriff', 'Search term'), show: function (v) { return v.mode !== 'tail'; } },
        { id: 'ctx', type: 'num', def: '', label: T('Zeilen davor und danach', 'Lines before and after'), show: function (v) { return v.mode === 'grep'; } },
        { id: 'lines', type: 'num', def: '50', label: T('Letzte Zeilen zum Start', 'Last lines to start with'), show: function (v) { return v.mode !== 'grep'; } },
        { id: 'i', type: 'check', def: true, label: T('Groß-/Kleinschreibung egal (-i)', 'Ignore case (-i)') },
        { id: 'r', type: 'check', def: false, label: T('Ganzen Ordner durchsuchen (-r, nur bei Suche)', 'Search whole folder (-r, search only)') },
        { id: 'sudo', type: 'check', def: true, label: T('Mit sudo (Systemlogs)', 'With sudo (system logs)') }
      ],
      build: function (v) {
        if (v.mode !== 'tail' && !v.pat) return { err: T('Bitte einen Suchbegriff angeben.', 'Please enter a search term.') };
        if ((v.ctx && !/^\d+$/.test(v.ctx)) || (v.lines && !/^\d+$/.test(v.lines))) return { err: NUM_ERR };
        var s = v.sudo ? 'sudo ' : '', n = [], g = ['grep'];
        if (v.i) g.push('-i');
        var cmd;
        if (v.mode === 'grep') {
          g.splice(1, 0, '-n');
          if (v.r) g.push('-r');
          if (v.ctx) { g.push('-C', v.ctx); n.push(T('-C ' + v.ctx + ': zeigt ' + v.ctx + ' Zeilen davor und danach, damit der Zusammenhang sichtbar ist.', '-C ' + v.ctx + ': shows ' + v.ctx + ' lines before and after for context.')); }
          g.push('-e', sq(v.pat), sq(v.file));
          cmd = s + g.join(' ');
          n.push(T('-n: zeigt die Zeilennummer zu jedem Treffer.', '-n: shows the line number of each match.'));
        } else {
          cmd = s + 'tail -n ' + (v.lines || '10') + ' -F ' + sq(v.file);
          if (v.mode === 'both') { g.splice(1, 0, '--line-buffered'); g.push('-e', sq(v.pat)); cmd += ' | ' + g.join(' '); n.push(T('--line-buffered: grep gibt jeden Treffer sofort aus statt zu sammeln.', '--line-buffered: grep prints each match at once instead of buffering.')); }
          n.push(T('-F: liest weiter, auch wenn die Datei rotiert wird. Beenden mit Strg+C.', '-F: keeps reading even when the file is rotated. Stop with Ctrl+C.'));
        }
        n.push(T('Debian/Ubuntu: /var/log/syslog, RHEL: /var/log/messages. Ohne diese Dateien die Vorlage journalctl nehmen.', 'Debian/Ubuntu: /var/log/syslog, RHEL: /var/log/messages. Without these files use the journalctl template.'));
        return { cmd: cmd, notes: n, warn: [] };
      }
    },
    {
      id: 'cron', cat: 'services', name: T('crontab: Aufgabe zeitgesteuert ausführen', 'crontab: schedule a task'),
      fields: [
        { id: 'when', type: 'select', def: 'daily', label: T('Wann', 'When'), opts: [['daily', T('täglich', 'daily')], ['weekly', T('wöchentlich', 'weekly')], ['hourly', T('stündlich', 'hourly')], ['reboot', T('beim Systemstart', 'at boot')], ['custom', T('eigener Ausdruck', 'custom expression')]] },
        { id: 'time', type: 'text', def: '02:30', label: T('Uhrzeit (HH:MM)', 'Time (HH:MM)'), show: function (v) { return v.when === 'daily' || v.when === 'weekly'; } },
        { id: 'dow', type: 'select', def: '0', label: T('Wochentag', 'Weekday'), show: function (v) { return v.when === 'weekly'; }, opts: [['1', T('Montag', 'Monday')], ['2', T('Dienstag', 'Tuesday')], ['3', T('Mittwoch', 'Wednesday')], ['4', T('Donnerstag', 'Thursday')], ['5', T('Freitag', 'Friday')], ['6', T('Samstag', 'Saturday')], ['0', T('Sonntag', 'Sunday')]] },
        { id: 'expr', type: 'text', def: '*/15 * * * *', label: T('Ausdruck (5 Felder)', 'Expression (5 fields)'), show: function (v) { return v.when === 'custom'; } },
        { id: 'cmd', type: 'text', req: true, def: '/usr/local/bin/backup.sh', label: T('Befehl (mit vollem Pfad)', 'Command (full path)') },
        { id: 'log', type: 'text', def: '/var/log/backup.log', label: T('Ausgabe in Logdatei (leer = verwerfen)', 'Output to log file (empty = discard)') },
        { id: 'root', type: 'check', def: false, label: T('Als root ausführen (sudo crontab)', 'Run as root (sudo crontab)') }
      ],
      build: function (v) {
        var sched, m;
        if (v.when === 'daily' || v.when === 'weekly') {
          m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(v.time || '');
          if (!m) return { err: T('Uhrzeit bitte wie 02:30 angeben.', 'Please give the time like 02:30.') };
          sched = (+m[2]) + ' ' + (+m[1]) + ' * * ' + (v.when === 'weekly' ? v.dow : '*');
        } else if (v.when === 'hourly') sched = '0 * * * *';
        else if (v.when === 'reboot') sched = '@reboot';
        else {
          sched = String(v.expr || '').trim().split(/\s+/).join(' ');
          if (!/^[0-9*\/,-]+( [0-9*\/,-]+){4}$/.test(sched)) return { err: T('Bitte genau 5 Felder aus Zahlen, *, /, - und Komma angeben.', 'Please give exactly 5 fields of digits, *, /, - and commas.') };
        }
        /* % beendet in crontab den Befehl, deshalb maskieren */
        var esc = function (x) { return x.replace(/\\?%/g, '\\%'); };
        var line = sched + ' ' + esc(v.cmd) + (v.log ? ' >> ' + esc(sq(v.log)) + ' 2>&1' : ' > /dev/null 2>&1');
        var s = v.root ? 'sudo ' : '';
        var n = [
          T('Eintrag: ' + line, 'Entry: ' + line),
          T('Die 5 Zeitfelder sind: Minute, Stunde, Tag im Monat, Monat, Wochentag (0 = Sonntag).', 'The 5 time fields are: minute, hour, day of month, month, weekday (0 = Sunday).'),
          T('Der Befehl hängt den Eintrag an die bestehende crontab an. Prüfen mit ' + s + 'crontab -l.', 'The command appends the entry to the existing crontab. Check with ' + s + 'crontab -l.'),
          T('Cron hat einen sehr kurzen PATH. Deshalb Programme immer mit vollem Pfad angeben.', 'Cron has a very short PATH. Always give programs with their full path.')
        ];
        if (/%/.test(v.cmd)) n.push(T('Das Zeichen % wurde zu \\% maskiert, sonst schneidet cron den Befehl dort ab.', 'The % character was escaped as \\%, otherwise cron cuts the command there.'));
        return {
          cmd: '(' + s + 'crontab -l 2>/dev/null; echo ' + sq(line) + ') | ' + s + 'crontab -',
          notes: n,
          warn: [T('Zweimal ausgeführt steht der Eintrag doppelt drin. Entfernen mit ' + s + 'crontab -e.', 'Run twice, the entry appears twice. Remove it with ' + s + 'crontab -e.')]
        };
      }
    },

    /* ===== Pakete und Prozesse ===== */
    {
      id: 'apt', cat: 'system', name: T('apt: Pakete aktualisieren und installieren', 'apt: update and install packages'),
      fields: [
        { id: 'act', type: 'select', def: 'upgrade', label: T('Aktion', 'Action'), opts: [['upgrade', T('System aktualisieren', 'Update the system')], ['list', T('Welche Updates gibt es?', 'Which updates are available?')], ['install', T('Paket installieren', 'Install package')], ['remove', T('Paket entfernen', 'Remove package')], ['purge', T('Paket samt Konfiguration entfernen', 'Remove package and its configuration')], ['search', T('Paket suchen', 'Search package')], ['clean', T('Aufräumen', 'Clean up')]] },
        { id: 'pkg', type: 'text', def: 'htop', label: T('Paket(e) oder Suchbegriff', 'Package(s) or search term'), show: function (v) { return /^(install|remove|purge|search)$/.test(v.act); } },
        { id: 'full', type: 'check', def: false, label: T('full-upgrade (auch neue Abhängigkeiten, z. B. Kernel)', 'full-upgrade (also new dependencies, e.g. kernel)') },
        { id: 'y', type: 'check', def: false, label: T('Ohne Rückfrage (-y)', 'Without asking (-y)') }
      ],
      build: function (v) {
        var y = v.y ? ' -y' : '', n = [], w = [], cmd;
        var pk = String(v.pkg || '').split(/[\s,]+/).filter(Boolean);
        if (/^(install|remove|purge)$/.test(v.act)) {
          if (!pk.length) return { err: T('Bitte ein Paket angeben.', 'Please enter a package.') };
          if (pk.some(function (p) { return !/^[a-z0-9][a-z0-9+.:~-]*$/.test(p); })) return { err: T('Paketnamen bestehen aus Kleinbuchstaben, Ziffern und + . - .', 'Package names consist of lowercase letters, digits and + . - .') };
        }
        if (v.act === 'upgrade') {
          cmd = 'sudo apt update && sudo apt ' + (v.full ? 'full-upgrade' : 'upgrade') + y;
          n.push(T('apt update lädt die Paketlisten neu, erst danach weiß apt, was es Neues gibt.', 'apt update refreshes the package lists; only then does apt know what is new.'));
          if (v.full) n.push(T('full-upgrade darf auch Pakete entfernen oder neu hinzunehmen. Für Proxmox ist das der empfohlene Weg.', 'full-upgrade may also remove or add packages. It is the recommended way on Proxmox.'));
          n.push(T('Gibt es die Datei /var/run/reboot-required, ist ein Neustart nötig.', 'If the file /var/run/reboot-required exists, a reboot is needed.'));
          if (v.y) w.push(T('Mit -y wird ohne Rückfrage installiert. Vorher lieber einmal ohne -y lesen, was entfernt würde.', 'With -y it installs without asking. Better read once without -y what would be removed.'));
        } else if (v.act === 'list') {
          cmd = 'sudo apt update && apt list --upgradable';
        } else if (v.act === 'install') {
          cmd = 'sudo apt update && sudo apt install' + y + ' ' + pk.join(' ');
        } else if (v.act === 'remove' || v.act === 'purge') {
          cmd = 'sudo apt ' + v.act + y + ' ' + pk.join(' ');
          if (v.act === 'purge') w.push(T('purge löscht auch die Konfigurationsdateien unter /etc.', 'purge also deletes the configuration files under /etc.'));
          else n.push(T('remove lässt die Konfiguration unter /etc liegen. Bei Neuinstallation ist sie wieder da.', 'remove keeps the configuration under /etc. It is back after reinstalling.'));
        } else if (v.act === 'search') {
          if (!pk.length) return { err: T('Bitte einen Suchbegriff angeben.', 'Please enter a search term.') };
          cmd = 'apt search ' + sq(v.pkg);
          n.push(T('Details zu einem Treffer: apt show paketname.', 'Details on a match: apt show packagename.'));
        } else {
          cmd = 'sudo apt autoremove' + y + ' && sudo apt clean';
          n.push(T('autoremove entfernt nicht mehr benötigte Abhängigkeiten und alte Kernel, clean leert den Download-Zwischenspeicher.', 'autoremove removes dependencies and old kernels no longer needed, clean empties the download cache.'));
        }
        return { cmd: cmd, notes: n, warn: w };
      }
    },
    {
      id: 'proc', cat: 'system', name: T('ps und kill: Prozesse finden und beenden', 'ps and kill: find and stop processes'),
      fields: [
        { id: 'act', type: 'select', def: 'find', label: T('Aktion', 'Action'), opts: [['find', T('Prozess suchen', 'Find process')], ['cpu', T('Größte CPU-Verbraucher', 'Top CPU users')], ['mem', T('Größte RAM-Verbraucher', 'Top memory users')], ['term', T('Beenden (sanft)', 'Stop (graceful)')], ['kill', T('Hart beenden (-9)', 'Force kill (-9)')]] },
        { id: 'name', type: 'text', def: 'nginx', label: T('Name oder PID', 'Name or PID'), show: function (v) { return /^(find|term|kill)$/.test(v.act); } }
      ],
      build: function (v) {
        if (v.act === 'cpu' || v.act === 'mem') {
          return {
            cmd: 'ps -eo pid,user,%cpu,%mem,etime,comm --sort=-%' + v.act + ' | head -n 11',
            notes: [T('Zeigt die 10 Prozesse mit dem höchsten ' + (v.act === 'cpu' ? 'CPU' : 'RAM') + '-Verbrauch, mit Laufzeit (etime).', 'Shows the 10 processes with the highest ' + (v.act === 'cpu' ? 'CPU' : 'memory') + ' use, with run time (etime).')],
            warn: []
          };
        }
        if (!v.name) return { err: T('Bitte einen Namen oder eine PID angeben.', 'Please enter a name or PID.') };
        var pid = /^\d+$/.test(v.name), n = [], w = [], cmd;
        if (v.act === 'find') {
          cmd = 'pgrep -a ' + sq(v.name);
          n.push(T('pgrep -a: zeigt PID und vollständige Befehlszeile aller passenden Prozesse.', 'pgrep -a: shows PID and full command line of all matching processes.'));
        } else {
          var sig = v.act === 'kill' ? '-KILL ' : '';
          cmd = pid ? 'sudo kill ' + sig + v.name : 'sudo pkill ' + sig + '-x ' + sq(v.name);
          if (!pid) n.push(T('pkill -x trifft nur Prozesse mit genau diesem Namen. Vorher mit „Prozess suchen“ prüfen.', 'pkill -x only matches processes with exactly this name. Check first with “Find process”.'));
          n.push(T('Für Dienste besser systemctl stop oder restart nehmen, sonst startet systemd sie evtl. neu.', 'For services use systemctl stop or restart instead, otherwise systemd may restart them.'));
          if (v.act === 'kill') w.push(T('-9 beendet sofort ohne Aufräumen. Offene Dateien können beschädigt werden. Erst sanft beenden und ein paar Sekunden warten.', '-9 stops at once without cleanup. Open files may be damaged. Try a graceful stop first and wait a few seconds.'));
          else n.push(T('Sanft (SIGTERM): Das Programm darf noch speichern und aufräumen.', 'Graceful (SIGTERM): the program may still save and clean up.'));
        }
        return { cmd: cmd, notes: n, warn: w };
      }
    },

    /* ===== Benutzer und Rechte ===== */
    {
      id: 'users', cat: 'users', name: T('useradd und usermod: Benutzer verwalten', 'useradd and usermod: manage users'),
      fields: [
        { id: 'act', type: 'select', def: 'add', label: T('Aktion', 'Action'), opts: [['add', T('Benutzer anlegen', 'Create user')], ['svc', T('Dienstkonto ohne Anmeldung', 'Service account without login')], ['group', T('Zu Gruppen hinzufügen', 'Add to groups')], ['lock', T('Sperren', 'Lock')], ['unlock', T('Entsperren', 'Unlock')], ['del', T('Löschen', 'Delete')]] },
        { id: 'user', type: 'text', req: true, def: 'max', label: T('Benutzername', 'User name') },
        { id: 'groups', type: 'text', def: 'sudo', label: T('Gruppen (mit Komma)', 'Groups (comma separated)'), show: function (v) { return v.act === 'add' || v.act === 'group'; } }
      ],
      build: function (v) {
        var NM = /^[a-z_][a-z0-9_-]{0,31}$/;
        if (!NM.test(v.user)) return { err: T('Benutzername: Kleinbuchstaben, Ziffern, _ und -, am Anfang ein Buchstabe.', 'User name: lowercase letters, digits, _ and -, starting with a letter.') };
        var g = list(v.groups);
        if (g.some(function (x) { return !NM.test(x); })) return { err: T('Gruppennamen wie Benutzernamen schreiben, mehrere mit Komma.', 'Write group names like user names, several with commas.') };
        if (v.act === 'group' && !g.length) return { err: T('Bitte mindestens eine Gruppe angeben.', 'Please enter at least one group.') };
        var u = v.user, n = [], w = [], cmd;
        if (v.act === 'add') {
          cmd = 'sudo useradd -m -s /bin/bash ' + (g.length ? '-G ' + g.join(',') + ' ' : '') + u + ' && sudo passwd ' + u;
          n.push(T('-m legt das Home-Verzeichnis an, -s die Shell, -G die zusätzlichen Gruppen.', '-m creates the home directory, -s the shell, -G the extra groups.'));
          n.push(T('passwd fragt das Passwort verdeckt ab. So steht es nie im Befehl oder in der History.', 'passwd asks for the password hidden. So it never appears in the command or history.'));
          if (g.indexOf('sudo') >= 0) n.push(T('Gruppe sudo: darf Admin-Befehle ausführen (Debian/Ubuntu). Bei RHEL heißt sie wheel.', 'Group sudo: may run admin commands (Debian/Ubuntu). On RHEL it is called wheel.'));
        } else if (v.act === 'svc') {
          cmd = 'sudo useradd -r -s /usr/sbin/nologin ' + u;
          n.push(T('-r: Systemkonto ohne Home, nologin: keine Anmeldung möglich. Passend für Dienste wie Backup-Skripte.', '-r: system account without home, nologin: no login possible. Suitable for services like backup scripts.'));
        } else if (v.act === 'group') {
          cmd = 'sudo usermod -aG ' + g.join(',') + ' ' + u + ' && id ' + u;
          n.push(T('Die neue Gruppe gilt erst nach erneuter Anmeldung. id zeigt die Gruppen an.', 'The new group applies after logging in again. id shows the groups.'));
          w.push(T('Das -a ist wichtig: Ohne -a wird der Benutzer aus allen anderen Gruppen entfernt.', 'The -a matters: without -a the user is removed from all other groups.'));
        } else if (v.act === 'lock') {
          cmd = 'sudo usermod -L -e 1 ' + u;
          n.push(T('-L sperrt das Passwort, -e 1 lässt das Konto ablaufen. Erst beides zusammen sperrt auch die Anmeldung per SSH-Schlüssel.', '-L locks the password, -e 1 expires the account. Only both together also block login via SSH key.'));
        } else if (v.act === 'unlock') {
          cmd = 'sudo usermod -U -e \'\' ' + u;
          n.push(T('-U hebt die Passwortsperre auf, -e \'\' entfernt das Ablaufdatum.', '-U lifts the password lock, -e \'\' removes the expiry date.'));
        } else {
          cmd = 'sudo tar -czf /root/' + u + '-home.tar.gz /home/' + u + ' && sudo userdel -r ' + u;
          n.push(T('Vorher wird das Home-Verzeichnis nach /root/' + u + '-home.tar.gz gesichert.', 'The home directory is first backed up to /root/' + u + '-home.tar.gz.'));
          w.push(T('userdel -r löscht den Benutzer samt Home-Verzeichnis. Oft reicht „Sperren“.', 'userdel -r deletes the user including the home directory. Often “Lock” is enough.'));
        }
        return { cmd: cmd, notes: n, warn: w };
      }
    },
    {
      id: 'perm', cat: 'users', name: T('chmod und chown: Rechte und Besitzer setzen', 'chmod and chown: set permissions and owner'),
      fields: [
        { id: 'act', type: 'select', def: 'both', label: T('Aktion', 'Action'), opts: [['both', T('Besitzer und Rechte', 'Owner and permissions')], ['chmod', T('Nur Rechte (chmod)', 'Permissions only (chmod)')], ['chown', T('Nur Besitzer (chown)', 'Owner only (chown)')]] },
        { id: 'path', type: 'text', req: true, def: '/srv/www', label: T('Pfad', 'Path') },
        { id: 'owner', type: 'text', def: 'www-data:www-data', label: T('Besitzer:Gruppe', 'Owner:group'), show: function (v) { return v.act !== 'chmod'; } },
        { id: 'mode', type: 'text', def: '750', label: T('Rechte (z. B. 750, 640, u+x)', 'Permissions (e.g. 750, 640, u+x)'), show: function (v) { return v.act !== 'chown'; } },
        { id: 'scope', type: 'select', def: 'r', label: T('Umfang', 'Scope'), opts: [['one', T('Nur dieses Element', 'This item only')], ['r', T('Alles darunter (-R)', 'Everything below (-R)')], ['files', T('Alles darunter, nur Dateien', 'Everything below, files only')], ['dirs', T('Alles darunter, nur Ordner', 'Everything below, folders only')]] }
      ],
      build: function (v) {
        var doMod = v.act !== 'chown', doOwn = v.act !== 'chmod', n = [], w = [], lines = [];
        if (doMod && !/^[0-7]{3,4}$/.test(v.mode) && !/^[ugoa]*[-+=][rwxXst]*(,[ugoa]*[-+=][rwxXst]*)*$/.test(v.mode)) return { err: T('Rechte bitte als Zahl (z. B. 750) oder wie u+x angeben.', 'Please give permissions as a number (e.g. 750) or like u+x.') };
        if (doOwn && !/^[A-Za-z_][A-Za-z0-9_.-]*(:[A-Za-z_][A-Za-z0-9_.-]*)?$|^:[A-Za-z_][A-Za-z0-9_.-]*$/.test(v.owner || '')) return { err: T('Besitzer bitte wie benutzer:gruppe angeben.', 'Please give the owner like user:group.') };
        var p = sq(v.path);
        function one(tool, arg) {
          if (v.scope === 'one') return 'sudo ' + tool + ' ' + arg + ' ' + p;
          if (v.scope === 'r') return 'sudo ' + tool + ' -R ' + arg + ' ' + p;
          return 'sudo find ' + p + ' -type ' + (v.scope === 'files' ? 'f' : 'd') + ' -exec ' + tool + ' ' + arg + ' {} +';
        }
        if (doOwn) lines.push(one('chown', v.owner));
        if (doMod) lines.push(one('chmod', v.mode));
        if (v.scope === 'files' || v.scope === 'dirs') n.push(T('find … -exec: wendet den Befehl nur auf ' + (v.scope === 'files' ? 'Dateien' : 'Ordner') + ' an. Üblich sind Ordner 750 und Dateien 640.', 'find … -exec: applies the command to ' + (v.scope === 'files' ? 'files' : 'folders') + ' only. Common: folders 750, files 640.'));
        if (doMod && /^[0-7]{3,4}$/.test(v.mode)) {
          var m = v.mode.slice(-3), who = [T('Besitzer', 'owner'), T('Gruppe', 'group'), T('Andere', 'others')];
          var rwx = function (d) { d = +d; return (d & 4 ? 'r' : '-') + (d & 2 ? 'w' : '-') + (d & 1 ? 'x' : '-'); };
          n.push(T(m + ' bedeutet: ' + who.map(function (x, i) { return x[0] + ' ' + rwx(m[i]); }).join(', ') + ' (r = 4 lesen, w = 2 schreiben, x = 1 ausführen bzw. Ordner betreten).',
            m + ' means: ' + who.map(function (x, i) { return x[1] + ' ' + rwx(m[i]); }).join(', ') + ' (r = 4 read, w = 2 write, x = 1 execute or enter folder).'));
          if (v.mode.length === 4 && v.mode[0] !== '0') n.push(T('Die erste Ziffer setzt Sonderrechte (4 = setuid, 2 = setgid, 1 = sticky).', 'The first digit sets special bits (4 = setuid, 2 = setgid, 1 = sticky).'));
          if (/7$/.test(m) || /[2367]$/.test(m)) w.push(T('„Andere“ dürfen hier schreiben. Das ist fast nie nötig; 777 ist keine Lösung für Rechteprobleme.', '“Others” may write here. That is almost never needed; 777 is no fix for permission problems.'));
          if (v.scope === 'r' && /[1357]/.test(m)) n.push(T('Mit -R werden auch alle Dateien ausführbar. Besser Ordner und Dateien getrennt setzen (Umfang „nur Ordner“ / „nur Dateien“).', 'With -R all files become executable too. Better set folders and files separately (scope “folders only” / “files only”).'));
        }
        return { cmd: lines.join('\n'), notes: n, warn: w };
      }
    },

    /* ===== Dateien und Speicher ===== */
    {
      id: 'space', cat: 'storage', name: T('df und du: Speicherplatz prüfen', 'df and du: check disk space'),
      fields: [
        { id: 'act', type: 'select', def: 'df', label: T('Was', 'What'), opts: [['df', T('Belegung aller Laufwerke', 'Usage of all drives')], ['du', T('Größte Ordner finden', 'Find largest folders')], ['inodes', T('Inodes (viele kleine Dateien)', 'Inodes (many small files)')], ['open', T('Gelöscht, aber noch belegt', 'Deleted but still in use')]] },
        { id: 'path', type: 'text', def: '/var', label: T('Ordner', 'Folder'), show: function (v) { return v.act === 'du'; } },
        { id: 'top', type: 'num', def: '15', label: T('Wie viele anzeigen', 'How many to show'), show: function (v) { return v.act === 'du'; } }
      ],
      build: function (v) {
        if (v.act === 'df') return { cmd: 'df -hT -x tmpfs -x devtmpfs', notes: [T('-h: Größen lesbar, -T: Dateisystemtyp. tmpfs (RAM) wird ausgeblendet.', '-h: readable sizes, -T: filesystem type. tmpfs (RAM) is hidden.')], warn: [] };
        if (v.act === 'inodes') return { cmd: 'df -hi -x tmpfs -x devtmpfs', notes: [T('Steht bei IUse% 100 %, ist die Platte „voll“, obwohl noch Platz frei ist. Ursache sind meist sehr viele kleine Dateien (Cache, Sessions, Mails).', 'If IUse% shows 100 %, the disk is “full” although space is left. Usually caused by very many small files (cache, sessions, mail).')], warn: [] };
        if (v.act === 'open') return { cmd: 'sudo lsof +L1', notes: [T('Zeigt gelöschte Dateien, die ein Prozess noch offen hält. Der Platz wird erst frei, wenn der Prozess bzw. Dienst neu startet.', 'Shows deleted files still held open by a process. The space is only freed when the process or service restarts.')], warn: [] };
        if (!v.path) return { err: T('Bitte einen Ordner angeben.', 'Please enter a folder.') };
        if (v.top && !/^\d+$/.test(v.top)) return { err: NUM_ERR };
        return {
          cmd: 'sudo du -xh --max-depth=1 ' + sq(v.path) + ' 2>/dev/null | sort -rh | head -n ' + (v.top || '15'),
          notes: [
            T('Zeigt die größten Unterordner, sortiert nach Größe. Dann im größten weitersuchen.', 'Shows the largest subfolders sorted by size. Then dig into the largest one.'),
            T('-x bleibt auf diesem Dateisystem, eingebundene Laufwerke (z. B. NAS) werden nicht mitgezählt.', '-x stays on this filesystem, mounted drives (e.g. NAS) are not counted.')
          ],
          warn: []
        };
      }
    },
    {
      id: 'mount', cat: 'storage', name: T('lsblk und mount: Laufwerke und Freigaben einbinden', 'lsblk and mount: drives and network shares'),
      fields: [
        { id: 'act', type: 'select', def: 'list', label: T('Aktion', 'Action'), opts: [['list', T('Laufwerke anzeigen', 'Show drives')], ['nfs', T('NFS-Freigabe einbinden', 'Mount NFS share')], ['cifs', T('SMB-Freigabe einbinden (Windows/NAS)', 'Mount SMB share (Windows/NAS)')]] },
        { id: 'nfs', type: 'text', def: '192.168.10.10:/volume1/backup', label: T('NFS-Freigabe (server:/pfad)', 'NFS share (server:/path)'), show: function (v) { return v.act === 'nfs'; } },
        { id: 'smb', type: 'text', def: '//192.168.10.10/backup', label: T('SMB-Freigabe (//server/name)', 'SMB share (//server/name)'), show: function (v) { return v.act === 'cifs'; } },
        { id: 'cred', type: 'text', def: '/root/.smbcredentials', label: T('Datei mit Zugangsdaten', 'Credentials file'), show: function (v) { return v.act === 'cifs'; } },
        { id: 'mnt', type: 'text', def: '/mnt/nas', label: T('Einhängepunkt', 'Mount point'), show: function (v) { return v.act !== 'list'; } },
        { id: 'perm', type: 'check', def: false, label: T('Dauerhaft in /etc/fstab eintragen', 'Add permanently to /etc/fstab') }
      ],
      build: function (v) {
        if (v.act === 'list') return {
          cmd: 'lsblk -f',
          notes: [T('Zeigt alle Laufwerke und Partitionen mit Dateisystem, Bezeichnung, UUID und Einhängepunkt. Für fstab besser die UUID als /dev/sdX nehmen, die kann sich ändern.', 'Shows all drives and partitions with filesystem, label, UUID and mount point. For fstab use the UUID rather than /dev/sdX, which can change.')],
          warn: []
        };
        var nfs = v.act === 'nfs', src = nfs ? v.nfs : v.smb, n = [], w = [];
        if (!src || !v.mnt) return { err: T('Bitte Freigabe und Einhängepunkt angeben.', 'Please enter share and mount point.') };
        if (nfs ? !/^[^\s:]+:\/\S*$/.test(src) : !/^\/\/[^\s\/]+\/\S+$/.test(src)) return { err: nfs ? T('NFS-Freigabe bitte wie server:/pfad angeben.', 'Please give the NFS share like server:/path.') : T('SMB-Freigabe bitte wie //server/name angeben.', 'Please give the SMB share like //server/name.') };
        if (/\s/.test(v.mnt) || (!nfs && /[\s,]/.test(v.cred))) return { err: T('Pfade bitte ohne Leerzeichen (und Komma) angeben.', 'Please give paths without spaces (and commas).') };
        var type = nfs ? 'nfs' : 'cifs', opts = nfs ? '' : 'credentials=' + v.cred + ',iocharset=utf8';
        var mk = 'sudo mkdir -p ' + sq(v.mnt) + ' && ';
        var cmd;
        if (v.perm) {
          var line = src + ' ' + v.mnt + ' ' + type + ' ' + (opts ? opts + ',' : 'defaults,') + '_netdev,nofail 0 0';
          cmd = mk + 'sudo cp /etc/fstab /etc/fstab.bak && echo ' + sq(line) + ' | sudo tee -a /etc/fstab && sudo systemctl daemon-reload && sudo mount ' + sq(v.mnt);
          n.push(T('Vorher wird /etc/fstab nach /etc/fstab.bak gesichert. Zurück mit: sudo cp /etc/fstab.bak /etc/fstab', '/etc/fstab is first backed up to /etc/fstab.bak. Roll back with: sudo cp /etc/fstab.bak /etc/fstab'));
          n.push(T('_netdev wartet beim Start auf das Netzwerk, nofail lässt das System auch starten, wenn das NAS aus ist.', '_netdev waits for the network at boot, nofail lets the system boot even if the NAS is off.'));
          n.push(T('Das abschließende mount testet den neuen Eintrag sofort. Zusätzlich prüft sudo findmnt --verify die ganze fstab.', 'The final mount tests the new entry right away. sudo findmnt --verify also checks the whole fstab.'));
          w.push(T('Ein Fehler in /etc/fstab kann den Systemstart aufhalten. Vor dem nächsten Neustart prüfen, ob mount ohne Fehler durchlief.', 'An error in /etc/fstab can stall the boot. Before the next reboot check that mount ran without errors.'));
        } else {
          cmd = mk + 'sudo mount -t ' + type + ' ' + sq(src) + ' ' + sq(v.mnt) + (opts ? ' -o ' + opts : '');
          n.push(T('Gilt bis zum nächsten Neustart. Lösen mit sudo umount ' + v.mnt + '.', 'Lasts until the next reboot. Unmount with sudo umount ' + v.mnt + '.'));
        }
        n.push(nfs ? T('Benötigt das Paket nfs-common (Debian/Ubuntu).', 'Needs the package nfs-common (Debian/Ubuntu).') : T('Benötigt das Paket cifs-utils. In die Datei ' + v.cred + ' kommen zwei Zeilen: username=… und password=…; danach sudo chmod 600 ' + v.cred + '. So steht das Passwort nicht im Befehl.', 'Needs the package cifs-utils. The file ' + v.cred + ' holds two lines: username=… and password=…; then sudo chmod 600 ' + v.cred + '. This keeps the password out of the command.'));
        return { cmd: cmd, notes: n, warn: w };
      }
    },
    {
      id: 'zfs', cat: 'storage', name: T('zfs: Snapshots und Pool-Zustand', 'zfs: snapshots and pool health'),
      fields: [
        { id: 'act', type: 'select', def: 'list', label: T('Aktion', 'Action'), opts: [['list', T('Snapshots anzeigen', 'List snapshots')], ['snap', T('Snapshot erstellen', 'Create snapshot')], ['rollback', T('Auf Snapshot zurückrollen', 'Roll back to snapshot')], ['pool', T('Zustand der Pools', 'Pool health')]] },
        { id: 'ds', type: 'text', def: 'rpool/data', label: T('Dataset', 'Dataset'), show: function (v) { return v.act !== 'pool'; } },
        { id: 'name', type: 'text', def: 'vor-update', label: T('Snapshot-Name', 'Snapshot name'), show: function (v) { return v.act === 'snap' || v.act === 'rollback'; } },
        { id: 'r', type: 'check', def: false, label: T('Mit allen Unter-Datasets (-r)', 'Including all child datasets (-r)') }
      ],
      build: function (v) {
        if (v.act === 'pool') return {
          cmd: 'zpool status -x && zpool list',
          notes: [T('zpool status -x meldet „all pools are healthy“ oder zeigt nur die Pools mit Problemen. zpool list zeigt Größe und Belegung.', 'zpool status -x reports “all pools are healthy” or shows only pools with problems. zpool list shows size and usage.'),
            T('Ab etwa 80 % Belegung wird ZFS langsamer.', 'From about 80 % usage ZFS gets slower.')],
          warn: []
        };
        if (!/^[A-Za-z0-9][A-Za-z0-9_.:\/-]*$/.test(v.ds || '')) return { err: T('Bitte ein Dataset wie rpool/data angeben.', 'Please enter a dataset like rpool/data.') };
        if (v.act === 'list') return {
          cmd: 'zfs list -t snapshot ' + (v.r ? '-r' : '-d 1') + ' -o name,used,creation -s creation ' + v.ds,
          notes: [T('USED ist der Platz, den nur dieser Snapshot belegt. Er wächst, je mehr sich seitdem geändert hat.', 'USED is the space held by this snapshot alone. It grows the more has changed since.')],
          warn: []
        };
        if (!/^[A-Za-z0-9_.:-]+$/.test(v.name || '')) return { err: T('Snapshot-Name: Buchstaben, Ziffern, _ . : und -.', 'Snapshot name: letters, digits, _ . : and -.') };
        var full = v.ds + '@' + v.name;
        if (v.act === 'snap') return {
          cmd: 'sudo zfs snapshot ' + (v.r ? '-r ' : '') + full,
          notes: [T('Ein Snapshot entsteht sofort und belegt anfangs keinen Platz.', 'A snapshot is created instantly and takes no space at first.'),
            T('Für VMs und Container unter Proxmox besser die Vorlage qm/pct nehmen, dann ist die Konfiguration mit drin.', 'For VMs and containers on Proxmox use the qm/pct template instead, then the configuration is included.')],
          warn: [T('Ein Snapshot liegt auf demselben Pool und ist kein Backup.', 'A snapshot lives on the same pool and is not a backup.')]
        };
        return {
          cmd: 'sudo zfs rollback ' + full,
          notes: [T('Gibt es neuere Snapshots, bricht zfs ab. Mit -r würden diese neueren Snapshots gelöscht.', 'If newer snapshots exist, zfs stops. With -r those newer snapshots would be deleted.')],
          warn: [T('Alle Änderungen seit dem Snapshot gehen verloren.', 'All changes since the snapshot are lost.')]
        };
      }
    },

    /* ===== Sichern, Fernzugriff, Web ===== */
    {
      id: 'rsync', cat: 'copy', name: T('rsync: Ordner sichern oder abgleichen', 'rsync: back up or sync a folder'),
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
      id: 'scp', cat: 'copy', name: T('scp: Datei auf einen Server kopieren', 'scp: copy a file to a server'),
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
      id: 'tar', cat: 'copy', name: T('tar: Archiv packen oder entpacken', 'tar: create or extract an archive'),
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
      id: 'find', cat: 'storage', name: T('find: Dateien suchen und aufräumen', 'find: search and clean up files'),
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
      id: 'tunnel', cat: 'remote', name: T('SSH-Tunnel: Dienst sicher erreichen', 'SSH tunnel: reach a service securely'),
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
      id: 'keygen', cat: 'remote', name: T('ssh-keygen: SSH-Schlüssel erzeugen', 'ssh-keygen: create an SSH key'),
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
    /* ===== Netzwerk prüfen ===== */
    {
      id: 'ip', cat: 'net', name: T('ip: Adressen, Routen und Schnittstellen', 'ip: addresses, routes and interfaces'),
      fields: [
        { id: 'act', type: 'select', def: 'addr', label: T('Was', 'What'), opts: [['addr', T('IP-Adressen', 'IP addresses')], ['link', T('Schnittstellen und Status', 'Interfaces and state')], ['route', T('Routen und Gateway', 'Routes and gateway')], ['get', T('Welcher Weg zu einem Ziel?', 'Which path to a target?')], ['neigh', T('Nachbarn (ARP-Tabelle)', 'Neighbours (ARP table)')]] },
        { id: 'dev', type: 'text', def: '', label: T('Nur Schnittstelle (leer = alle)', 'Only interface (empty = all)'), show: function (v) { return v.act === 'addr' || v.act === 'link'; } },
        { id: 'dst', type: 'text', def: '1.1.1.1', label: T('Ziel-IP', 'Target IP'), show: function (v) { return v.act === 'get'; } }
      ],
      build: function (v) {
        var n = [], cmd;
        if ((v.act === 'addr' || v.act === 'link') && v.dev && !/^[A-Za-z0-9._@:-]+$/.test(v.dev)) return { err: T('Schnittstellenname wie eth0, ens18 oder vmbr0.', 'Interface name like eth0, ens18 or vmbr0.') };
        if (v.act === 'addr') { cmd = 'ip -br addr' + (v.dev ? ' show dev ' + v.dev : ''); n.push(T('-br: kurze Übersicht, eine Zeile je Schnittstelle mit Status und Adressen.', '-br: brief overview, one line per interface with state and addresses.')); }
        else if (v.act === 'link') { cmd = 'ip -br link' + (v.dev ? ' show dev ' + v.dev : ''); n.push(T('UP: aktiv. DOWN oder NO-CARRIER: abgeschaltet bzw. kein Kabel/Link.', 'UP: active. DOWN or NO-CARRIER: disabled or no cable/link.')); }
        else if (v.act === 'route') { cmd = 'ip route'; n.push(T('Die Zeile „default via …“ ist das Standard-Gateway. IPv6: ip -6 route.', 'The line “default via …” is the default gateway. IPv6: ip -6 route.')); }
        else if (v.act === 'neigh') { cmd = 'ip neigh'; n.push(T('Zeigt, welche MAC-Adresse zu welcher IP gehört. FAILED oder INCOMPLETE: Gerät antwortet nicht.', 'Shows which MAC belongs to which IP. FAILED or INCOMPLETE: the device does not answer.')); }
        else {
          if (!/^[0-9A-Fa-f.:]+$/.test(v.dst || '')) return { err: T('Bitte eine IP-Adresse angeben.', 'Please enter an IP address.') };
          cmd = 'ip route get ' + v.dst;
          n.push(T('Zeigt, über welche Schnittstelle und welches Gateway ein Paket zu diesem Ziel gehen würde. Gut bei mehreren Netzen oder VPN.', 'Shows which interface and gateway a packet to this target would use. Useful with several networks or VPN.'));
        }
        n.push(T('ip ersetzt die alten Befehle ifconfig, route und arp.', 'ip replaces the old commands ifconfig, route and arp.'));
        return { cmd: cmd, notes: n, warn: [] };
      }
    },
    {
      id: 'ss', cat: 'net', name: T('ss: Offene Ports und Verbindungen', 'ss: open ports and connections'),
      fields: [
        { id: 'what', type: 'select', def: 'listen', label: T('Was', 'What'), opts: [['listen', T('Welche Ports lauschen?', 'Which ports are listening?')], ['est', T('Bestehende Verbindungen', 'Established connections')]] },
        { id: 'proto', type: 'select', def: 'tu', label: T('Protokoll', 'Protocol'), opts: [['tu', T('TCP und UDP', 'TCP and UDP')], ['t', T('nur TCP', 'TCP only')], ['u', T('nur UDP', 'UDP only')]] },
        { id: 'port', type: 'num', def: '', label: T('Nur dieser Port', 'Only this port') },
        { id: 'p', type: 'check', def: true, label: T('Programm anzeigen (-p, mit sudo)', 'Show program (-p, with sudo)') }
      ],
      build: function (v) {
        if (v.port && !isPort(v.port)) return { err: PORT_ERR };
        var listen = v.what === 'listen';
        var c = (v.p ? ['sudo', 'ss'] : ['ss']).concat('-' + v.proto + (listen ? 'l' : '') + 'n' + (v.p ? 'p' : '')), n = [];
        if (!listen) c.push('state', 'established');
        if (v.port) c.push(sq(listen ? 'sport = :' + v.port : '( sport = :' + v.port + ' or dport = :' + v.port + ' )'));
        n.push(T('-t TCP, -u UDP, -l lauschend, -n Zahlen statt Namen, -p Programm mit PID.', '-t TCP, -u UDP, -l listening, -n numbers instead of names, -p program with PID.'));
        if (listen) n.push(T('0.0.0.0:22 oder [::]:22 heißt: auf allen Adressen erreichbar. 127.0.0.1 heißt: nur vom Rechner selbst.', '0.0.0.0:22 or [::]:22 means reachable on all addresses. 127.0.0.1 means only from the machine itself.'));
        return { cmd: c.join(' '), notes: n, warn: [] };
      }
    },
    {
      id: 'ping', cat: 'net', name: T('ping, mtr, traceroute: Erreichbarkeit und Weg', 'ping, mtr, traceroute: reachability and path'),
      fields: [
        { id: 'tool', type: 'select', def: 'ping', label: T('Werkzeug', 'Tool'), opts: [['ping', T('ping: erreichbar?', 'ping: reachable?')], ['mtr', T('mtr: Verlust je Station', 'mtr: loss per hop')], ['trace', T('traceroute: Weg anzeigen', 'traceroute: show path')]] },
        { id: 'host', type: 'text', req: true, def: '1.1.1.1', label: T('Ziel (IP oder Name)', 'Target (IP or name)') },
        { id: 'count', type: 'num', def: '4', label: T('Anzahl Pakete', 'Packet count'), show: function (v) { return v.tool !== 'trace'; } },
        { id: 'ipv', type: 'select', def: '', label: T('IP-Version', 'IP version'), opts: [['', T('automatisch', 'automatic')], ['4', T('IPv4', 'IPv4')], ['6', T('IPv6', 'IPv6')]] },
        { id: 'mtu', type: 'check', def: false, label: T('MTU testen (1472 Byte, nicht fragmentieren, nur ping)', 'Test MTU (1472 bytes, do not fragment, ping only)') }
      ],
      build: function (v) {
        if (v.count && !/^\d+$/.test(v.count)) return { err: NUM_ERR };
        var c, n = [], cnt = v.count || (v.tool === 'mtr' ? '10' : '4');
        if (v.tool === 'ping') {
          c = ['ping', '-c', cnt];
          if (v.ipv) c.push('-' + v.ipv);
          if (v.mtu) {
            c.push('-M', 'do', '-s', v.ipv === '6' ? '1452' : '1472');
            n.push(T('1472 Byte Daten + 28 Byte Kopf = 1500 Byte. Kommt „message too long“, ist die MTU auf dem Weg kleiner (PPPoE/DSL: 1492, dann -s 1464 testen).', '1472 bytes of data + 28 bytes header = 1500 bytes. If you get “message too long”, the MTU on the path is smaller (PPPoE/DSL: 1492, then try -s 1464).'));
          }
          n.push(T('-c ' + cnt + ': hört nach ' + cnt + ' Paketen auf. Ohne -c läuft ping bis Strg+C.', '-c ' + cnt + ': stops after ' + cnt + ' packets. Without -c ping runs until Ctrl+C.'));
        } else if (v.tool === 'mtr') {
          c = ['mtr', '-rwc', cnt];
          if (v.ipv) c.push('-' + v.ipv);
          n.push(T('-r Bericht, -w breite Ausgabe, -c Anzahl. Wichtig ist die Spalte Loss%: Verlust erst ab einer Station, der bis zum Ziel bleibt, zeigt das echte Problem.', '-r report, -w wide output, -c count. Watch Loss%: loss that starts at one hop and stays until the target shows the real problem.'));
          n.push(T('Paket mtr bzw. mtr-tiny installieren.', 'Install the package mtr or mtr-tiny.'));
        } else {
          c = ['traceroute', '-n'];
          if (v.ipv) c.push('-' + v.ipv);
          n.push(T('-n: nur IPs, keine Namensauflösung, dadurch schneller. * * * heißt: diese Station antwortet nicht, das ist oft gewollt.', '-n: IPs only, no name lookup, so faster. * * * means this hop does not answer, often on purpose.'));
        }
        c.push(sq(v.host));
        return { cmd: c.join(' '), notes: n, warn: [] };
      }
    },
    {
      id: 'dig', cat: 'net', name: T('dig: DNS-Einträge abfragen', 'dig: query DNS records'),
      fields: [
        { id: 'name', type: 'text', req: true, def: 'matija-tasic.de', label: T('Name (bei PTR: IP)', 'Name (for PTR: IP)') },
        { id: 'type', type: 'select', def: 'A', label: T('Eintrag', 'Record'), opts: [['A', T('A (IPv4)', 'A (IPv4)')], ['AAAA', T('AAAA (IPv6)', 'AAAA (IPv6)')], ['CNAME', T('CNAME (Alias)', 'CNAME (alias)')], ['MX', T('MX (Mailserver)', 'MX (mail server)')], ['TXT', T('TXT (SPF, Bestätigungen)', 'TXT (SPF, verifications)')], ['NS', T('NS (zuständige Nameserver)', 'NS (authoritative name servers)')], ['PTR', T('PTR (IP → Name)', 'PTR (IP → name)')]] },
        { id: 'server', type: 'text', def: '', label: T('DNS-Server fragen (leer = Standard)', 'Ask DNS server (empty = default)') },
        { id: 'short', type: 'check', def: true, label: T('Nur das Ergebnis (+short)', 'Result only (+short)') },
        { id: 'trace', type: 'check', def: false, label: T('Weg ab den Root-Servern (+trace)', 'Path from the root servers (+trace)') }
      ],
      build: function (v) {
        var c = ['dig'], n = [];
        if (v.server) { if (!/^[A-Za-z0-9.:-]+$/.test(v.server)) return { err: T('DNS-Server bitte als IP oder Name.', 'Please give the DNS server as IP or name.') }; c.push('@' + v.server); }
        if (v.type === 'PTR') {
          if (!/^[0-9A-Fa-f.:]+$/.test(v.name)) return { err: T('Für PTR bitte eine IP-Adresse eingeben.', 'For PTR please enter an IP address.') };
          c.push('-x', v.name);
        } else c.push(sq(v.name), v.type);
        if (v.short) c.push('+short');
        if (v.trace) { c.push('+trace'); n.push(T('+trace fragt Schritt für Schritt von den Root-Servern bis zum zuständigen Nameserver. So sehen Sie, was der Anbieter wirklich ausliefert.', '+trace asks step by step from the root servers to the authoritative name server. Shows what the provider really serves.')); }
        n.push(v.server
          ? T('@' + v.server + ': fragt genau diesen Server. Vergleich mit einem anderen (z. B. @1.1.1.1) zeigt, ob eine Änderung schon überall angekommen ist.', '@' + v.server + ': asks exactly this server. Comparing with another (e.g. @1.1.1.1) shows whether a change has spread.')
          : T('Tipp: Mit DNS-Server @1.1.1.1 oder @9.9.9.9 umgehen Sie den Zwischenspeicher Ihres Routers.', 'Tip: with DNS server @1.1.1.1 or @9.9.9.9 you bypass your router’s cache.'));
        n.push(T('dig steckt im Paket dnsutils (Debian/Ubuntu) bzw. bind-utils (RHEL).', 'dig comes with the package dnsutils (Debian/Ubuntu) or bind-utils (RHEL).'));
        return { cmd: c.join(' '), notes: n, warn: [] };
      }
    },
    {
      id: 'nc', cat: 'net', name: T('nc: Ist ein Port erreichbar?', 'nc: is a port reachable?'),
      fields: [
        { id: 'mode', type: 'select', def: 'tcp', label: T('Art', 'Mode'), opts: [['tcp', T('nc, TCP', 'nc, TCP')], ['udp', T('nc, UDP', 'nc, UDP')], ['bash', T('ohne nc (nur Bash, TCP)', 'without nc (Bash only, TCP)')]] },
        { id: 'host', type: 'text', req: true, def: '192.168.10.5', label: T('Ziel (IP oder Name)', 'Target (IP or name)') },
        { id: 'port', type: 'num', req: true, def: '443', label: T('Port', 'Port') }
      ],
      build: function (v) {
        if (!isPort(v.port)) return { err: PORT_ERR };
        var n = [], w = [];
        if (v.mode === 'bash') {
          if (!/^[A-Za-z0-9.-]+$/.test(v.host)) return { err: T('Für die Bash-Variante bitte IPv4-Adresse oder Namen angeben.', 'For the Bash variant please enter an IPv4 address or name.') };
          n.push(T('Nutzt die eingebaute Bash-Funktion /dev/tcp. Hilft auf Systemen ohne nc, z. B. in schlanken Containern.', 'Uses Bash’s built-in /dev/tcp. Helps on systems without nc, e.g. in slim containers.'));
          return { cmd: 'timeout 3 bash -c \'</dev/tcp/' + v.host + '/' + v.port + '\' 2>/dev/null && echo open || echo closed', notes: n, warn: w };
        }
        var c = ['nc', '-zv', '-w', '3'];
        if (v.mode === 'udp') { c.push('-u'); w.push(T('UDP kennt keinen Verbindungsaufbau. „succeeded“ bei UDP heißt nur: keine Ablehnung kam zurück, nicht, dass ein Dienst antwortet.', 'UDP has no handshake. “succeeded” for UDP only means no rejection came back, not that a service answers.')); }
        c.push(sq(v.host), v.port);
        n.push(T('-z: nur prüfen, keine Daten senden. -v: Ergebnis anzeigen. -w 3: nach 3 Sekunden aufgeben.', '-z: check only, send no data. -v: show the result. -w 3: give up after 3 seconds.'));
        n.push(T('„refused“: Rechner erreichbar, aber kein Dienst auf dem Port. Zeitüberschreitung: meist blockiert eine Firewall.', '“refused”: host reachable but no service on that port. Timeout: usually a firewall blocks it.'));
        n.push(T('Unter RHEL heißt nc „ncat“ und kennt kein -z. Dann die Variante „ohne nc“ nehmen.', 'On RHEL nc is “ncat” and has no -z. Use the “without nc” variant then.'));
        return { cmd: c.join(' '), notes: n, warn: w };
      }
    },
    {
      id: 'iperf3', cat: 'net', name: T('iperf3: Bandbreite messen', 'iperf3: measure bandwidth'),
      fields: [
        { id: 'role', type: 'select', def: 'client', label: T('Rolle', 'Role'), opts: [['server', T('Gegenstelle (Server)', 'Remote end (server)')], ['client', T('Messen (Client)', 'Measure (client)')]] },
        { id: 'host', type: 'text', def: '192.168.10.5', label: T('Server-IP', 'Server IP'), show: function (v) { return v.role === 'client'; } },
        { id: 'port', type: 'num', def: '', label: T('Port (leer = 5201)', 'Port (empty = 5201)') },
        { id: 'time', type: 'num', def: '10', label: T('Dauer in Sekunden', 'Duration in seconds'), show: function (v) { return v.role === 'client'; } },
        { id: 'par', type: 'num', def: '', label: T('Parallele Verbindungen (-P)', 'Parallel streams (-P)'), show: function (v) { return v.role === 'client'; } },
        { id: 'rev', type: 'check', def: false, label: T('Gegenrichtung messen (-R, nur Client)', 'Measure reverse direction (-R, client only)') }
      ],
      build: function (v) {
        if (v.port && !isPort(v.port)) return { err: PORT_ERR };
        var n = [];
        if (v.role === 'server') {
          return {
            cmd: 'iperf3 -s' + (v.port ? ' -p ' + v.port : ''),
            notes: [T('Läuft auf der Gegenstelle und wartet auf Messungen. Beenden mit Strg+C.', 'Runs on the remote end and waits for tests. Stop with Ctrl+C.'),
              T('Port ' + (v.port || '5201') + '/TCP muss in der Firewall offen sein.', 'Port ' + (v.port || '5201') + '/TCP must be open in the firewall.')],
            warn: []
          };
        }
        if (!v.host) return { err: T('Bitte die Server-IP angeben.', 'Please enter the server IP.') };
        if ((v.time && !/^\d+$/.test(v.time)) || (v.par && !/^\d+$/.test(v.par))) return { err: NUM_ERR };
        var c = ['iperf3', '-c', sq(v.host)];
        if (v.port) c.push('-p', v.port);
        if (v.time) c.push('-t', v.time);
        if (v.par) { c.push('-P', v.par); n.push(T('-P: mehrere Verbindungen gleichzeitig, nötig um schnelle Leitungen (10G) auszulasten.', '-P: several streams at once, needed to saturate fast links (10G).')); }
        if (v.rev) c.push('-R');
        n.push(v.rev
          ? T('-R: Der Server sendet, gemessen wird also die Richtung zu Ihnen (Download).', '-R: the server sends, so the direction towards you is measured (download).')
          : T('Ohne -R senden Sie zum Server (Upload). Mit -R die Gegenrichtung.', 'Without -R you send to the server (upload). With -R the reverse direction.'));
        n.push(T('Richtwert: Gigabit-LAN schafft etwa 940 Mbit/s. Deutlich weniger deutet auf Kabel, Duplex oder WLAN hin.', 'Rule of thumb: gigabit LAN reaches about 940 Mbit/s. Much less points to cable, duplex or Wi-Fi.'));
        return { cmd: c.join(' '), notes: n, warn: [] };
      }
    },

    {
      id: 'curl', cat: 'web', name: T('curl: Webserver testen', 'curl: test a web server'),
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
      id: 'openssl', cat: 'web', name: T('openssl: Zertifikat eines Servers prüfen', 'openssl: check a server certificate'),
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
      id: 'ufw', cat: 'sec', name: T('ufw: Firewall-Regeln setzen', 'ufw: set firewall rules'),
      fields: [
        { id: 'act', type: 'select', def: 'allow', label: T('Aktion', 'Action'), opts: [['allow', T('Erlauben', 'Allow')], ['deny', T('Sperren', 'Deny')], ['status', T('Regeln anzeigen (nummeriert)', 'Show rules (numbered)')], ['delete', T('Regel löschen', 'Delete rule')], ['enable', T('Firewall einschalten', 'Enable firewall')]] },
        { id: 'port', type: 'num', def: '22', label: T('Port', 'Port'), show: function (v) { return v.act === 'allow' || v.act === 'deny'; } },
        { id: 'proto', type: 'select', def: 'tcp', label: T('Protokoll', 'Protocol'), show: function (v) { return v.act === 'allow' || v.act === 'deny'; }, opts: [['tcp', T('TCP', 'TCP')], ['udp', T('UDP', 'UDP')], ['', T('beide', 'both')]] },
        { id: 'from', type: 'text', def: '192.168.10.0/24', label: T('Nur von Quelle (leer = überall)', 'Only from source (empty = anywhere)'), show: function (v) { return v.act === 'allow' || v.act === 'deny'; } },
        { id: 'comment', type: 'text', def: 'SSH aus dem Admin-Netz', label: T('Kommentar', 'Comment'), show: function (v) { return v.act === 'allow' || v.act === 'deny'; } },
        { id: 'num', type: 'num', def: '', label: T('Regelnummer (aus „Regeln anzeigen“)', 'Rule number (from “Show rules”)'), show: function (v) { return v.act === 'delete'; } },
        { id: 'ssh', type: 'num', def: '22', label: T('Ihr SSH-Port', 'Your SSH port'), show: function (v) { return v.act === 'enable'; } }
      ],
      build: function (v) {
        var n = [], w = [], cmd;
        if (v.act === 'status') {
          cmd = 'sudo ufw status numbered';
          n.push(T('Zeigt alle Regeln mit Nummer. Die Nummer brauchen Sie zum Löschen.', 'Shows all rules with numbers. You need the number to delete one.'));
        } else if (v.act === 'delete') {
          if (!/^\d+$/.test(v.num || '')) return { err: T('Bitte die Regelnummer angeben.', 'Please enter the rule number.') };
          cmd = 'sudo ufw delete ' + v.num;
          n.push(T('ufw fragt vor dem Löschen nach. Danach rücken die Nummern nach, also vor dem nächsten Löschen neu anzeigen.', 'ufw asks before deleting. Afterwards the numbers shift, so list them again before the next delete.'));
        } else if (v.act === 'enable') {
          if (!isPort(v.ssh)) return { err: PORT_ERR };
          cmd = 'sudo ufw default deny incoming && sudo ufw default allow outgoing && sudo ufw allow ' + v.ssh + '/tcp comment ' + sq('SSH') + ' && sudo ufw enable';
          n.push(T('Erst Standard setzen (eingehend sperren, ausgehend erlauben) und SSH erlauben, dann einschalten.', 'First set defaults (deny incoming, allow outgoing) and allow SSH, then enable.'));
          w.push(T('Stimmt der SSH-Port nicht, sperren Sie sich aus. Bei Servern ohne Konsole (VPS) besonders vorsichtig sein.', 'If the SSH port is wrong, you lock yourself out. Be extra careful on servers without a console (VPS).'));
        } else {
          if (!isPort(v.port)) return { err: PORT_ERR };
          if (v.from && !/^[0-9A-Fa-f.:]+(\/\d{1,3})?$/.test(v.from)) return { err: T('Quelle bitte als IP oder Netz wie 192.168.10.0/24.', 'Please give the source as IP or network like 192.168.10.0/24.') };
          var c = ['sudo', 'ufw', v.act];
          if (v.from) { c.push('from', v.from, 'to', 'any', 'port', v.port); if (v.proto) c.push('proto', v.proto); }
          else c.push(v.port + (v.proto ? '/' + v.proto : ''));
          if (v.comment) c.push('comment', sq(v.comment));
          cmd = c.join(' ');
          n.push(T('Die erste passende Regel gewinnt. Neue Regeln landen hinten; mit „insert 1“ statt ' + v.act + ' kommt eine Regel nach vorn.', 'The first matching rule wins. New rules go to the end; with “insert 1” instead of ' + v.act + ' a rule goes to the front.'));
          if (v.comment) n.push(T('Der Kommentar steht später bei ufw status. So weiß man auch in einem Jahr noch, wofür die Regel ist.', 'The comment shows in ufw status. So you still know a year later what the rule is for.'));
        }
        n.push(T('ufw gibt es auf Debian/Ubuntu. Auf dem Proxmox-Host nicht verwenden, Proxmox hat eine eigene Firewall.', 'ufw is for Debian/Ubuntu. Do not use it on the Proxmox host, Proxmox has its own firewall.'));
        return { cmd: cmd, notes: n, warn: w };
      }
    },
    {
      id: 'nmap', cat: 'sec', name: T('nmap: Netz oder Host scannen', 'nmap: scan a network or host'),
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
      id: 'tcpdump', cat: 'sec', name: T('tcpdump: Netzwerkverkehr mitschneiden', 'tcpdump: capture network traffic'),
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
    },
    /* ===== Proxmox VE ===== */
    {
      id: 'pve', cat: 'proxmox', name: T('qm und pct: VMs und Container steuern', 'qm and pct: control VMs and containers'),
      fields: [
        { id: 'kind', type: 'select', def: 'qm', label: T('Typ', 'Type'), opts: [['qm', T('VM (qm)', 'VM (qm)')], ['pct', T('Container (pct)', 'Container (pct)')]] },
        { id: 'act', type: 'select', def: 'list', label: T('Aktion', 'Action'), opts: [['list', T('Alle anzeigen', 'List all')], ['status', T('Status', 'Status')], ['start', T('Starten', 'Start')], ['shutdown', T('Herunterfahren', 'Shut down')], ['stop', T('Hart ausschalten', 'Hard stop')], ['snapshot', T('Snapshot erstellen', 'Create snapshot')], ['listsnapshot', T('Snapshots anzeigen', 'List snapshots')], ['rollback', T('Auf Snapshot zurückrollen', 'Roll back to snapshot')]] },
        { id: 'id', type: 'num', def: '100', label: T('ID', 'ID'), show: function (v) { return v.act !== 'list'; } },
        { id: 'snap', type: 'text', def: 'vor_update', label: T('Snapshot-Name', 'Snapshot name'), show: function (v) { return v.act === 'snapshot' || v.act === 'rollback'; } },
        { id: 'ram', type: 'check', def: false, label: T('Arbeitsspeicher mitsichern (nur VM, --vmstate)', 'Include RAM (VM only, --vmstate)') }
      ],
      build: function (v) {
        var k = v.kind, n = [], w = [];
        if (v.act === 'list') return { cmd: k + ' list', notes: [T('Zeigt alle ' + (k === 'qm' ? 'VMs' : 'Container') + ' dieses Knotens mit ID, Name und Status.', 'Shows all ' + (k === 'qm' ? 'VMs' : 'containers') + ' on this node with ID, name and status.'), ROOT_NOTE], warn: [] };
        if (!/^\d+$/.test(v.id || '') || +v.id < 100) return { err: T('Die ID ist eine Zahl ab 100.', 'The ID is a number from 100.') };
        var c = [k, v.act, v.id];
        if (v.act === 'snapshot' || v.act === 'rollback') {
          if (!/^[A-Za-z][A-Za-z0-9_-]{1,39}$/.test(v.snap || '')) return { err: T('Snapshot-Name: mit Buchstaben beginnen, dann Buchstaben, Ziffern, _ oder -.', 'Snapshot name: start with a letter, then letters, digits, _ or -.') };
          c.push(v.snap);
        }
        if (v.act === 'snapshot') {
          if (v.ram && k === 'qm') { c.push('--vmstate', '1'); n.push(T('--vmstate 1: sichert auch den RAM. Nach dem Zurückrollen läuft die VM genau dort weiter.', '--vmstate 1: also saves RAM. After a rollback the VM continues exactly there.')); }
          n.push(T('Geht nur auf Speicher mit Snapshot-Funktion (ZFS, LVM-thin, Ceph, qcow2).', 'Only works on storage with snapshot support (ZFS, LVM-thin, Ceph, qcow2).'));
          w.push(T('Ein Snapshot ist kein Backup. Er liegt auf demselben Speicher; dafür vzdump nehmen.', 'A snapshot is not a backup. It lives on the same storage; use vzdump for that.'));
        }
        if (v.act === 'shutdown') n.push(T('Sauber herunterfahren über ACPI' + (k === 'qm' ? ' bzw. den QEMU Guest Agent' : '') + '.', 'Clean shutdown via ACPI' + (k === 'qm' ? ' or the QEMU guest agent' : '') + '.'));
        if (v.act === 'stop') w.push(T('stop ist wie Stecker ziehen. Nur nehmen, wenn shutdown nicht reagiert.', 'stop is like pulling the plug. Only use it when shutdown does not respond.'));
        if (v.act === 'rollback') w.push(T('Alle Änderungen seit dem Snapshot gehen verloren.', 'All changes since the snapshot are lost.'));
        n.push(ROOT_NOTE);
        return { cmd: c.join(' '), notes: n, warn: w };
      }
    },
    {
      id: 'vzdump', cat: 'proxmox', name: T('vzdump: Backup einer VM oder eines Containers', 'vzdump: back up a VM or container'),
      fields: [
        { id: 'ids', type: 'text', req: true, def: '100', label: T('ID(s), mehrere mit Komma', 'ID(s), several with commas') },
        { id: 'storage', type: 'text', req: true, def: 'local', label: T('Ziel-Speicher', 'Target storage') },
        { id: 'mode', type: 'select', def: 'snapshot', label: T('Modus', 'Mode'), opts: [['snapshot', T('snapshot (läuft weiter)', 'snapshot (keeps running)')], ['suspend', T('suspend (kurz angehalten)', 'suspend (briefly paused)')], ['stop', T('stop (ausgeschaltet, am sichersten)', 'stop (powered off, safest)')]] },
        { id: 'comp', type: 'select', def: 'zstd', label: T('Komprimierung', 'Compression'), opts: [['zstd', T('zstd (empfohlen)', 'zstd (recommended)')], ['gzip', T('gzip', 'gzip')], ['lzo', T('lzo', 'lzo')]] },
        { id: 'keep', type: 'num', def: '', label: T('Nur die letzten N behalten (leer = alle)', 'Keep only the last N (empty = all)') }
      ],
      build: function (v) {
        var ids = list(v.ids);
        if (!ids.length || ids.some(function (x) { return !/^\d+$/.test(x) || +x < 100; })) return { err: T('IDs sind Zahlen ab 100, mehrere mit Komma.', 'IDs are numbers from 100, several with commas.') };
        if (!/^[A-Za-z][A-Za-z0-9_.-]*$/.test(v.storage)) return { err: T('Bitte den Namen des Speichers wie in Proxmox angegeben eintragen.', 'Please enter the storage name as shown in Proxmox.') };
        if (v.keep && !/^\d+$/.test(v.keep)) return { err: NUM_ERR };
        var c = ['vzdump'].concat(ids, ['--storage', v.storage, '--mode', v.mode, '--compress', v.comp]), n = [], w = [];
        if (v.keep) { c.push('--prune-backups', 'keep-last=' + v.keep); w.push(T('--prune-backups löscht ältere Backups dieser ID auf dem Ziel, sodass nur ' + v.keep + ' übrig bleiben.', '--prune-backups deletes older backups of this ID on the target so only ' + v.keep + ' remain.')); }
        n.push(T('snapshot: kein Ausfall; für VMs mit QEMU Guest Agent werden die Dateisysteme dabei kurz eingefroren. stop: kurzer Ausfall, dafür garantiert sauber.', 'snapshot: no downtime; for VMs with the QEMU guest agent filesystems are briefly frozen. stop: short downtime but guaranteed consistent.'));
        n.push(T('Zurückspielen: qmrestore (VM) bzw. pct restore (Container), oder in der Oberfläche unter Backup.', 'Restore: qmrestore (VM) or pct restore (container), or in the web UI under Backup.'));
        n.push(T('Ist das Ziel ein Proxmox Backup Server, --compress weglassen; PBS komprimiert selbst.', 'If the target is a Proxmox Backup Server, leave out --compress; PBS compresses itself.'));
        n.push(ROOT_NOTE);
        return { cmd: c.join(' '), notes: n, warn: w };
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
    return { name: t.id + '.sh', text: '#!/usr/bin/env bash\n# ' + t.name[0] + '\n' + cmd + '\n' };
  }

  var api = { CATS: CATS, TEMPLATES: TEMPLATES, byId: byId, defaults: defaults, run: run, asFile: asFile, sq: sq };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.CmdKit = api;
})(this);
