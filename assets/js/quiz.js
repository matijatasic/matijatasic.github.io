/* Netzwerk-Quiz im Bereich „03 Interaktiv“ (Kali-Terminal mit Zeitbonus)
   Fünf Modi (Binär, Subnetze, Ports, Firewall-Richter, Störungsticket), 5 Runden, je 3 Antworten, 30 Sekunden pro Frage.
   Der obere Teil (Fragen erzeugen) ist ohne Browser testbar: node tests/quiz.test.js */
(function (global) {
  'use strict';

  var ROUNDS = 5, SECONDS = 30, BASE = 100, PER_SEC = 10;

  // Well-known Ports bis 1023, wie im Port-Lexikon: [Port, Name DE, Name EN, gleichwertige Namen]
  var PORTS = [
    [20, 'FTP-Daten', 'FTP data', ['ftp', 'ftpdata']], [21, 'FTP-Steuerung', 'FTP control', ['ftp']],
    [22, 'SSH', 'SSH', ['sftp', 'scp']], [23, 'Telnet', 'Telnet', []], [25, 'SMTP', 'SMTP', []],
    [53, 'DNS', 'DNS', []], [67, 'DHCP-Server', 'DHCP server', ['dhcp', 'bootps']],
    [68, 'DHCP-Client', 'DHCP client', ['dhcp', 'bootpc']], [69, 'TFTP', 'TFTP', []],
    [80, 'HTTP', 'HTTP', []], [88, 'Kerberos', 'Kerberos', []], [110, 'POP3', 'POP3', []],
    [123, 'NTP', 'NTP', []], [135, 'RPC', 'RPC', ['msrpc', 'dcom', 'epmap']],
    [137, 'NetBIOS-Namen', 'NetBIOS names', ['netbios', 'netbiosns']],
    [138, 'NetBIOS-Datagramm', 'NetBIOS datagram', ['netbios', 'netbiosdgm']],
    [139, 'NetBIOS-Sitzung', 'NetBIOS session', ['netbios', 'netbiosssn', 'smb']],
    [143, 'IMAP', 'IMAP', []], [161, 'SNMP', 'SNMP', []],
    [162, 'SNMP-Traps', 'SNMP traps', ['snmp', 'snmptrap']], [389, 'LDAP', 'LDAP', []],
    [443, 'HTTPS', 'HTTPS', []], [445, 'SMB', 'SMB', ['cifs']], [465, 'SMTPS', 'SMTPS', []],
    [500, 'IPsec IKE', 'IPsec IKE', ['ike', 'ipsec', 'isakmp']], [514, 'Syslog', 'Syslog', []],
    [547, 'DHCPv6-Server', 'DHCPv6 server', ['dhcpv6']], [587, 'SMTP-Submission', 'SMTP submission', ['submission']],
    [631, 'IPP (Drucken)', 'IPP (printing)', ['ipp', 'cups']], [636, 'LDAPS', 'LDAPS', []],
    [853, 'DNS over TLS', 'DNS over TLS', ['dot']], [993, 'IMAPS', 'IMAPS', []], [995, 'POP3S', 'POP3S', []]
  ];

  var maskOf = function (p) {
    var m = p === 0 ? 0 : (0xffffffff << (32 - p)) >>> 0;
    return [m >>> 24, (m >>> 16) & 255, (m >>> 8) & 255, m & 255].join('.');
  };
  var hostsOf = function (p) { return Math.pow(2, 32 - p) - 2; };
  var bin8 = function (n) { return ('00000000' + n.toString(2)).slice(-8); };
  var norm = function (v) { return v.toLowerCase().replace(/[\s\-_.\/()]/g, ''); };
  var same = function (t) { return { de: t, en: t }; };
  var num = function (n) { return { de: n.toLocaleString('de-DE'), en: n.toLocaleString('en-US') }; };
  var pickIn = function (arr, rnd) { return arr[Math.floor(rnd() * arr.length)]; };
  var shuffle = function (arr, rnd) {
    for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)), t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
    return arr;
  };

  // Aus der richtigen Antwort und den Kandidaten 3 verschiedene Antworten in zufälliger Reihenfolge bauen
  var build = function (key, q, v, right, cands, rnd) {
    var seen = {}, wrong = [];
    seen[right.de] = 1;
    shuffle(cands.slice(), rnd).forEach(function (c) {
      if (wrong.length < 2 && !seen[c.de]) { seen[c.de] = 1; wrong.push(c); }
    });
    if (wrong.length < 2) throw new Error('Zu wenige Falschantworten für ' + key);
    var opts = shuffle([right].concat(wrong), rnd);
    return { key: key, q: q, v: v, opts: opts, a: opts.indexOf(right) };
  };

  // Binär: 8-Bit-Zahl → Dezimalzahl. Falschantworten unterscheiden sich in genau einem Bit.
  var makeBin = function (rnd) {
    var n = 1 + Math.floor(rnd() * 254), cands = [];
    for (var k = 0; k < 8; k++) { var x = n ^ (1 << k); if (x >= 1 && x <= 255) cands.push(num(x)); }
    return build('b' + n, { de: 'Welche Dezimalzahl ist {v}?', en: 'Which decimal number is {v}?' }, same(bin8(n)), num(n), cands, rnd);
  };

  // Subnetze: Präfix → Hosts, Präfix → Maske, Hosts → Präfix. Falschantworten sind Nachbar-Präfixe
  // oder der typische Fehler „Netz- und Broadcast-Adresse nicht abgezogen“.
  var makeSubnet = function (rnd) {
    var t = Math.floor(rnd() * 3), p, d, cands = [];
    if (t === 0) {
      p = pickIn([22, 23, 24, 25, 26, 27, 28, 29, 30], rnd);
      cands.push(num(Math.pow(2, 32 - p)), num(hostsOf(p - 1)));
      if (p < 30) cands.push(num(hostsOf(p + 1)));
      return build('h' + p, { de: 'Wie viele nutzbare Hosts hat {v}?', en: 'How many usable hosts does {v} have?' }, same('/' + p), num(hostsOf(p)), cands, rnd);
    }
    if (t === 1) {
      p = pickIn([24, 25, 26, 27, 28, 29, 30], rnd);
      for (d = -2; d <= 2; d++) if (d && p + d >= 22 && p + d <= 30) cands.push(same(maskOf(p + d)));
      return build('m' + p, { de: 'Welche Subnetzmaske gehört zu {v}?', en: 'Which subnet mask belongs to {v}?' }, same('/' + p), same(maskOf(p)), cands, rnd);
    }
    p = pickIn([22, 23, 24, 25, 26, 27, 28, 29, 30], rnd);
    for (d = -2; d <= 2; d++) if (d && p + d >= 21 && p + d <= 30) cands.push(same('/' + (p + d)));
    return build('p' + p, { de: 'Welches Präfix hat genau {v} nutzbare Hosts?', en: 'Which prefix has exactly {v} usable hosts?' }, num(hostsOf(p)), same('/' + p), cands, rnd);
  };

  // Ports: Dienst → Port oder Port → Dienst. Dienste, die auch als richtig gelten könnten
  // (z. B. SMB auf 139), kommen nicht als Falschantwort vor.
  var clash = function (a, b) { return b[3].indexOf(norm(a[1])) !== -1 || a[3].indexOf(norm(b[1])) !== -1; };
  var makePort = function (rnd) {
    var e = pickIn(PORTS, rnd);
    var others = PORTS.filter(function (o) { return o[0] !== e[0] && !clash(e, o); });
    if (rnd() < 0.5) {
      return build('pn' + e[0], { de: 'Welcher Port gehört zu {v}?', en: 'Which port belongs to {v}?' }, { de: e[1], en: e[2] },
        same(String(e[0])), others.map(function (o) { return same(String(o[0])); }), rnd);
    }
    return build('np' + e[0], { de: 'Welcher Dienst läuft auf Port {v}?', en: 'Which service runs on port {v}?' }, same(String(e[0])),
      { de: e[1], en: e[2] }, others.map(function (o) { return { de: o[1], en: o[2] }; }), rnd);
  };

  /* Firewall-Richter: ein kleines Regelwerk wie in OPNsense (Regeln gelten auf der Schnittstelle,
     von oben nach unten, die erste passende Regel gewinnt, am Ende „Default deny“) und ein Paket.
     Gesucht ist die Regel, die greift. Ziele: ein anderes VLAN, die Firewall selbst oder „any“. */
  var VLANS = { 10: ['Server', 'Servers'], 20: ['Clients', 'Clients'], 30: ['Gäste', 'Guests'], 40: ['IoT', 'IoT'] };
  var FW_PORTS = [22, 53, 80, 443, 445, 3389];
  var FW_PNAME = { 22: 'SSH', 53: 'DNS', 80: 'HTTP', 443: 'HTTPS', 445: 'SMB', 3389: 'RDP' };
  var WAN_IPS = ['1.1.1.1', '8.8.8.8', '9.9.9.9', '140.82.121.4', '185.199.108.153'];
  var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  var pad = function (s, n) { s = String(s); while (s.length < n) s += ' '; return s; };
  // Passt die Regel auf das Paket? Getrennt nach Ziel und Port, damit die Erklärung zeigen kann, woran es scheitert.
  var fwDst = function (r, p) { return r.dst === 'any' || r.dst === p.dst; };
  var fwPort = function (r, p) { return r.port === '*' || r.port === p.port; };
  var fwHit = function (rules, p) {
    for (var i = 0; i < rules.length; i++) if (fwDst(rules[i], p) && fwPort(rules[i], p)) return i;
    return rules.length; // Default deny
  };
  var makeFirewall = function (rnd) {
    var s = pickIn([20, 30, 40], rnd);
    var dsts = [10, 20, 30, 40].filter(function (v) { return v !== s; }).map(function (v) { return 'VLAN' + v; }).concat(['Firewall']);
    var rule = function () {
      return { act: rnd() < 0.5 ? 'pass' : 'block', dst: rnd() < 0.2 ? 'any' : pickIn(dsts, rnd), port: rnd() < 0.3 ? '*' : pickIn(FW_PORTS, rnd) };
    };
    var packet = function () {
      var r = rnd(), dst, ip;
      if (r < 0.65) { dst = pickIn(dsts.slice(0, 3), rnd); ip = '10.0.' + dst.slice(4) + '.' + (2 + Math.floor(rnd() * 250)); }
      else if (r < 0.85) { dst = 'Firewall'; ip = '10.0.' + s + '.1'; }
      else { dst = 'WAN'; ip = pickIn(WAN_IPS, rnd); }
      return { dst: dst, ip: ip, port: pickIn(FW_PORTS, rnd), src: '10.0.' + s + '.' + (10 + Math.floor(rnd() * 200)) };
    };
    var key = function (r) { return r.act + r.dst + r.port; };
    // Ziel-Antwort (Regel 1–3 oder Default) gleich verteilt wählen und ein passendes, nicht triviales Rätsel suchen:
    // Vor der richtigen Regel soll eine Regel nur knapp scheitern, oder (bei Regel 1) eine spätere ebenfalls passen.
    var want = Math.floor(rnd() * 4), best = null;
    for (var n = 0; n < 400; n++) {
      var rules = [rule(), rule(), rule()];
      if (key(rules[0]) === key(rules[1]) || key(rules[1]) === key(rules[2]) || key(rules[0]) === key(rules[2])) continue;
      // realistisch: keine Regel „alles nach überall“ und mindestens eine pass- und eine block-Regel
      if (rules.some(function (r) { return r.dst === 'any' && r.port === '*'; })) continue;
      var acts = rules.map(function (r) { return r.act; }).join();
      if (acts.indexOf('pass') < 0 || acts.indexOf('block') < 0) continue;
      var p = packet(), hit = fwHit(rules, p);
      if (hit !== want) continue;
      best = { rules: rules, p: p, hit: hit };
      var tricky = hit === 0 ? fwHit(rules.slice(1), p) < 2 :
        rules.slice(0, hit).some(function (r) { return fwDst(r, p) !== fwPort(r, p); });
      if (tricky) break;
    }
    if (!best) { // sehr unwahrscheinlich: dann eben irgendein gültiges Rätsel
      var rr = [rule(), rule(), rule()], pp = packet();
      best = { rules: rr, p: pp, hit: fwHit(rr, pp) };
    }
    var R = best.rules, P = best.p, H = best.hit;
    var lab = function (i) {
      return i < 3 ? { de: 'Regel ' + (i + 1) + ' · ' + R[i].act, en: 'Rule ' + (i + 1) + ' · ' + R[i].act } : same('Default deny');
    };
    var row = function (no, r, de) {
      var a = '<span class="' + (r.act === 'pass' ? 'g' : 'r') + '">' + pad(r.act, 7) + '</span>';
      var port = r.port === '*' ? '*' : r.port + ' <span class="d">' + FW_PNAME[r.port] + '</span>';
      return '<span class="y">' + pad(no, 3) + '</span>' + a + pad(r.dst, 10) + port + (no === '*' ? ' <span class="d">' + (de ? '(Standard)' : '(default)') + '</span>' : '');
    };
    var table = function (de) {
      var v = VLANS[s][de ? 0 : 1];
      var h = '<span class="d"># ' + (de ? 'Regeln auf VLAN' + s + ' (' + v + ')' : 'Rules on VLAN' + s + ' (' + v + ')') + '</span>\n' +
        '<span class="d"># ' + (de ? 'erste passende Regel gewinnt' : 'first matching rule wins') + '</span>\n' +
        '<span class="d">' + pad('#', 3) + pad(de ? 'Aktion' : 'Action', 7) + pad(de ? 'Ziel' : 'Dest', 10) + 'Port</span>\n';
      R.forEach(function (r, i) { h += row(String(i + 1), r, de) + '\n'; });
      h += row('*', { act: 'block', dst: 'any', port: '*' }, de) + '\n';
      h += '<span class="d"># VLANxx = 10.0.xx.0/24</span>\n<span class="d"># Firewall = 10.0.' + s + '.1</span>';
      return h;
    };
    // Erklärung: Regel für Regel, woran sie scheitert, bis zur ersten passenden
    var why = function (de) {
      var parts = [];
      for (var i = 0; i < Math.min(H + 1, 3); i++) {
        var d = fwDst(R[i], P), o = fwPort(R[i], P);
        parts.push((i + 1) + (d && o ? ' ✓' : ' ✗ ' + (!d ? (de ? 'Ziel' : 'dest') : 'Port')));
      }
      if (H === 3) parts.push(de ? 'keine passt → Default deny' : 'none matches → default deny');
      else parts[parts.length - 1] += ' → ' + R[H].act;
      return (de ? 'Regel ' : 'Rule ') + parts.join(' · ');
    };
    var q = build('fw' + s + R.map(key).join('|') + P.dst + P.port + P.ip,
      { de: 'Welche Regel greift für {v}?', en: 'Which rule matches {v}?' },
      same(P.src + ' → ' + P.ip + ':' + P.port),
      lab(H), [0, 1, 2, 3].filter(function (i) { return i !== H; }).map(lab), rnd);
    q.pre = { de: table(true), en: table(false) };
    q.why = { de: why(true), en: why(false) };
    q.hit = H; q.rules = R; q.packet = P;
    return q;
  };

  /* Störungsticket: ein Symptom wie aus dem Helpdesk, gesucht ist die wahrscheinlichste Ursache.
     Feste Liste: [Symptom DE, Symptom EN, richtig [DE, EN], falsch 1 [DE, EN], falsch 2 [DE, EN], Erklärung DE, Erklärung EN] */
  var TICKETS = [
    ['Internet geht nicht. ping 8.8.8.8 klappt, ping google.de nicht.', 'No internet. ping 8.8.8.8 works, ping google.com does not.',
      ['DNS', 'DNS'], ['Default-Gateway', 'Default gateway'], ['Netzwerkkabel', 'Network cable'],
      'IP-Adressen sind erreichbar, nur Namen nicht: Die Namensauflösung fehlt.', 'IP addresses are reachable, names are not: name resolution is broken.'],
    ['Neuer PC hat die IP 169.254.12.7 und kein Netz.', 'New PC has IP 169.254.12.7 and no network.',
      ['DHCP antwortet nicht', 'DHCP not answering'], ['DNS-Server falsch', 'Wrong DNS server'], ['Proxy-Einstellung', 'Proxy setting'],
      '169.254.x.x (APIPA) vergibt Windows selbst, wenn kein DHCP-Server antwortet.', 'Windows assigns 169.254.x.x (APIPA) itself when no DHCP server answers.'],
    ['PC erreicht alles im eigenen Netz, aber nichts außerhalb.', 'PC reaches everything in its own subnet, nothing outside.',
      ['Default-Gateway', 'Default gateway'], ['DNS', 'DNS'], ['Switch-Port', 'Switch port'],
      'Für alles außerhalb des eigenen Subnetzes braucht der PC ein gültiges Gateway.', 'Anything outside the own subnet needs a valid gateway.'],
    ['Nach Umzug an einen anderen Platz: kein Netz, Link-LED am PC ist aus.', 'After moving desks: no network, link LED on the PC is off.',
      ['Kabel, Dose oder Switch-Port', 'Cable, wall jack or switch port'], ['DHCP-Server', 'DHCP server'], ['DNS', 'DNS'],
      'Keine Link-LED heißt: Schicht 1. Ohne Verbindung kommt DHCP gar nicht erst zum Zug.', 'No link LED means layer 1. Without a link DHCP never even starts.'],
    ['Zwei Geräte verlieren abwechselnd das Netz, Windows meldet einen Adresskonflikt.', 'Two devices drop off in turns, Windows reports an address conflict.',
      ['Doppelte statische IP', 'Duplicate static IP'], ['WLAN-Störung', 'Wi-Fi interference'], ['DNS-Cache', 'DNS cache'],
      'Zwei Geräte mit derselben IP überschreiben sich gegenseitig im ARP-Cache.', 'Two devices with the same IP keep overwriting each other in the ARP cache.'],
    ['Anmeldung an der Domäne schlägt fehl: „Uhrzeit weicht ab“.', 'Domain logon fails: “clock skew too great”.',
      ['Uhrzeit / NTP', 'Time / NTP'], ['Passwort abgelaufen', 'Password expired'], ['Benutzerprofil defekt', 'Corrupt user profile'],
      'Kerberos erlaubt standardmäßig höchstens 5 Minuten Zeitabweichung.', 'By default Kerberos allows at most 5 minutes of clock skew.'],
    ['Nach Passwortänderung wird das Konto alle paar Minuten gesperrt.', 'After a password change the account locks every few minutes.',
      ['Altes Passwort auf einem Gerät', 'Old password on a device'], ['Angriff von außen', 'Attack from outside'], ['AD-Replikation', 'AD replication'],
      'Typisch: Ein Gerät (Handy, Laufwerk, Dienst) meldet sich immer wieder mit dem alten Passwort an.', 'Typical: a device (phone, mapped drive, service) keeps logging on with the old password.'],
    ['Laptop im Gäste-WLAN erreicht den Bürodrucker nicht, Internet geht.', 'Laptop on guest Wi-Fi cannot reach the office printer, internet works.',
      ['Gewollte VLAN-Trennung', 'Intended VLAN isolation'], ['Druckertreiber', 'Printer driver'], ['DHCP', 'DHCP'],
      'Das Gästenetz ist absichtlich vom Büronetz getrennt. Das ist kein Fehler, sondern Sicherheit.', 'The guest network is isolated from the office on purpose. That is security, not a fault.'],
    ['Nur auf einem PC zeigen alle HTTPS-Seiten Zertifikatsfehler.', 'On one PC only, every HTTPS site shows a certificate error.',
      ['Systemuhr falsch', 'Wrong system clock'], ['Zertifikate abgelaufen', 'Certificates expired'], ['Firewall sperrt 443', 'Firewall blocks 443'],
      'Betrifft es alle Seiten, aber nur einen PC, liegt es am PC. Mit falscher Uhr scheint jedes Zertifikat ungültig.', 'All sites but only one PC points to the PC. With a wrong clock every certificate looks invalid.'],
    ['Linux-Server: df -h zeigt 40 % frei, trotzdem „No space left on device“.', 'Linux server: df -h shows 40 % free, yet “No space left on device”.',
      ['Keine Inodes mehr frei', 'Out of inodes'], ['Festplatte defekt', 'Failed disk'], ['Fehlende Schreibrechte', 'Missing write permission'],
      'Viele kleine Dateien verbrauchen alle Inodes. Prüfen mit df -i.', 'Lots of small files use up every inode. Check with df -i.'],
    ['Webdienst lief, ist nach dem Server-Neustart aber weg.', 'Web service ran fine but is gone after a server reboot.',
      ['Autostart nicht aktiviert', 'Autostart not enabled'], ['DNS', 'DNS'], ['Zertifikat', 'Certificate'],
      'Der Dienst wurde nur gestartet, nicht aktiviert: systemctl enable fehlt.', 'The service was started but not enabled: systemctl enable is missing.'],
    ['Neues VLAN 30 angelegt, Gerät am Access-Port bekommt keine IP.', 'New VLAN 30 created, device on the access port gets no IP.',
      ['Kein DHCP im neuen VLAN', 'No DHCP in the new VLAN'], ['DNS-Server fehlt', 'DNS server missing'], ['Falsche Subnetzmaske am Client', 'Wrong subnet mask on client'],
      'Jedes VLAN braucht einen eigenen DHCP-Bereich oder ein DHCP-Relay.', 'Every VLAN needs its own DHCP scope or a DHCP relay.'],
    ['Ganzes Stockwerk extrem langsam, alle Switch-LEDs blinken im Dauerfeuer.', 'Whole floor extremely slow, all switch LEDs blink non-stop.',
      ['Netzwerkschleife', 'Network loop'], ['Internetanbieter', 'Internet provider'], ['DNS langsam', 'Slow DNS'],
      'Eine Schleife ohne Spanning Tree erzeugt einen Broadcast-Sturm.', 'A loop without spanning tree causes a broadcast storm.'],
    ['ssh zum Server: sofort „Connection refused“.', 'ssh to the server: instant “Connection refused”.',
      ['SSH-Dienst läuft nicht', 'SSH service not running'], ['Firewall verwirft Pakete', 'Firewall drops packets'], ['Falsches Passwort', 'Wrong password'],
      '„Refused“ heißt: Der Server antwortet, aber auf dem Port lauscht nichts. Ein Firewall-Drop würde hängen.', '“Refused” means the host answers but nothing listens on the port. A firewall drop would hang.'],
    ['ssh zum Server hängt lange, dann „Connection timed out“.', 'ssh to the server hangs, then “Connection timed out”.',
      ['Firewall verwirft Pakete', 'Firewall drops packets'], ['Falsches Passwort', 'Wrong password'], ['SSH-Schlüssel abgelaufen', 'SSH key expired'],
      'Keine Antwort bis zum Timeout: Die Pakete kommen nicht an oder werden verworfen.', 'No answer until the timeout: packets never arrive or are dropped.'],
    ['Ping auf den Server geht nicht, RDP auf denselben Server klappt.', 'Ping to the server fails, RDP to the same server works.',
      ['ICMP wird geblockt', 'ICMP is blocked'], ['Server ist aus', 'Server is off'], ['Falsche IP', 'Wrong IP'],
      'RDP geht, also lebt der Server. Die Windows-Firewall blockt Ping oft standardmäßig.', 'RDP works, so the server is alive. Windows Firewall often blocks ping by default.'],
    ['Seit dem Domainwechsel landen unsere Mails beim Kunden im Spam.', 'Since the domain change our mails land in the customer’s spam.',
      ['SPF/DKIM fehlen', 'SPF/DKIM missing'], ['MX-Eintrag falsch', 'Wrong MX record'], ['Postfach voll', 'Mailbox full'],
      'SPF und DKIM beweisen, dass wir senden dürfen. Der MX-Eintrag betrifft nur eingehende Mails.', 'SPF and DKIM prove we may send. The MX record only affects incoming mail.'],
    ['Webseiten laden, aber große Downloads und das VPN brechen ab.', 'Web pages load, but large downloads and the VPN keep breaking.',
      ['MTU / Fragmentierung', 'MTU / fragmentation'], ['DNS', 'DNS'], ['DHCP-Lease', 'DHCP lease'],
      'Kleine Pakete gehen durch, große nicht: klassisches MTU-Problem, oft durch VPN oder PPPoE.', 'Small packets pass, big ones don’t: a classic MTU issue, often caused by VPN or PPPoE.'],
    ['Drucker druckt nach Wochen nicht mehr, am Gerät steht eine neue IP.', 'Printer stops printing after weeks, the device shows a new IP.',
      ['Keine DHCP-Reservierung', 'No DHCP reservation'], ['Druckertreiber', 'Printer driver'], ['Toner leer', 'Toner empty'],
      'Der Drucker hat per DHCP eine neue Adresse bekommen, die PCs drucken an die alte.', 'The printer got a new address via DHCP, the PCs still print to the old one.'],
    ['Skript läuft manuell im Terminal, per cron aber nicht.', 'Script runs manually in the terminal but not from cron.',
      ['Andere Umgebung (PATH)', 'Different environment (PATH)'], ['Festplatte voll', 'Disk full'], ['Falsches Passwort', 'Wrong password'],
      'cron startet mit minimalem PATH und ohne die Variablen der Shell. Volle Pfade verwenden.', 'cron starts with a minimal PATH and none of your shell variables. Use full paths.'],
    ['Nach einem Update erreicht ein PC das alte NAS nicht mehr, alle anderen schon.', 'After an update one PC can’t reach the old NAS, all others can.',
      ['SMB1 wurde deaktiviert', 'SMB1 was disabled'], ['NAS ist aus', 'NAS is off'], ['DNS', 'DNS'],
      'Neue Windows-Versionen schalten das unsichere SMB1 ab. Lösung: NAS auf SMB2/3 umstellen.', 'Newer Windows versions disable insecure SMB1. Fix: switch the NAS to SMB2/3.'],
    ['Über VPN geht intranet.firma.local nicht, per IP-Adresse schon.', 'Over VPN intranet.company.local fails, by IP address it works.',
      ['VPN nutzt nicht den internen DNS', 'VPN doesn’t use internal DNS'], ['Firewall sperrt das Intranet', 'Firewall blocks the intranet'], ['Zertifikat', 'Certificate'],
      'Per IP geht es, also stimmen Route und Firewall. Nur der interne Name wird nicht aufgelöst.', 'By IP it works, so routing and firewall are fine. Only the internal name isn’t resolved.'],
    ['Nach Firewall-Tausch: Internet geht, der Webserver ist von außen nicht erreichbar.', 'After a firewall swap: internet works, the web server is unreachable from outside.',
      ['Portweiterleitung fehlt', 'Port forward missing'], ['Gateway der Clients', 'Clients’ gateway'], ['DHCP', 'DHCP'],
      'Ausgehend klappt NAT automatisch, eingehend braucht es eine Portweiterleitung (DNAT).', 'Outbound NAT is automatic, inbound needs a port forward (DNAT).'],
    ['„Zugriff verweigert“ auf einen Ordner, obwohl die Freigabe „Jeder: Vollzugriff“ hat.', '“Access denied” on a folder although the share says “Everyone: full control”.',
      ['NTFS-Rechte', 'NTFS permissions'], ['Freigabename falsch', 'Wrong share name'], ['Netzwerkkabel', 'Network cable'],
      'Es gilt immer die strengere Regel von Freigabe- und NTFS-Rechten.', 'The stricter of share and NTFS permissions always applies.'],
    ['Seit Einführung von MFA fragt das alte Outlook ständig nach dem Passwort.', 'Since MFA was introduced the old Outlook keeps asking for the password.',
      ['Alte Anmeldung ohne MFA', 'Legacy auth without MFA'], ['Postfach voll', 'Mailbox full'], ['DNS', 'DNS'],
      'Alte Clients nutzen Basic Auth und können MFA nicht. Nötig ist Modern Authentication.', 'Old clients use basic auth and can’t do MFA. Modern authentication is required.'],
    ['Neuer Benutzer ist angelegt, aber Outlook im Web meldet: kein Postfach.', 'New user is created, but Outlook on the web says: no mailbox.',
      ['Keine Lizenz zugewiesen', 'No license assigned'], ['Passwort falsch', 'Wrong password'], ['MX-Eintrag', 'MX record'],
      'Das Exchange-Online-Postfach entsteht erst, wenn eine passende Lizenz zugewiesen ist.', 'The Exchange Online mailbox is only created once a matching license is assigned.'],
    ['Nach Zurücksetzen auf einen alten VM-Snapshot: „Vertrauensstellung zur Domäne fehlgeschlagen“.', 'After reverting to an old VM snapshot: “trust relationship with the domain failed”.',
      ['Computerkennwort veraltet', 'Outdated computer password'], ['Benutzerpasswort abgelaufen', 'User password expired'], ['DNS-Cache', 'DNS cache'],
      'Das Computerkonto wechselt sein Kennwort regelmäßig. Der Snapshot kennt nur das alte.', 'The computer account changes its password regularly. The snapshot only knows the old one.'],
    ['Neue Gruppenrichtlinie greift beim Benutzer nicht, gpresult zeigt sie gar nicht.', 'New group policy doesn’t apply to the user, gpresult doesn’t even list it.',
      ['GPO an falscher OU verknüpft', 'GPO linked to wrong OU'], ['Benutzer im falschen VLAN', 'User in wrong VLAN'], ['Lizenz fehlt', 'License missing'],
      'Eine GPO wirkt nur auf Objekte in der OU, an der sie verknüpft ist (und passt sie zum Filter).', 'A GPO only applies to objects in the OU it is linked to (and matching its filter).'],
    ['Linux-Dienst startet nicht, im Log steht „Address already in use“.', 'Linux service won’t start, the log says “Address already in use”.',
      ['Port ist schon belegt', 'Port already in use'], ['Festplatte voll', 'Disk full'], ['DNS', 'DNS'],
      'Ein anderer Prozess lauscht schon auf dem Port. Prüfen mit ss -tlnp.', 'Another process already listens on the port. Check with ss -tlnp.'],
    ['Proxmox: Mehrere VMs frieren ein, Meldung zum Speicher „local-lvm“ voll.', 'Proxmox: several VMs freeze, message says storage “local-lvm” is full.',
      ['LVM-Thin-Pool voll', 'LVM thin pool full'], ['RAM defekt', 'Faulty RAM'], ['Netzwerkbrücke', 'Network bridge'],
      'Thin-Provisioning verspricht mehr Platz, als da ist. Snapshots und volle Disks füllen den Pool.', 'Thin provisioning promises more space than exists. Snapshots and growing disks fill the pool.'],
    ['Proxmox-VM hat Link, bekommt aber keine IP aus VLAN 20.', 'Proxmox VM has a link but gets no IP from VLAN 20.',
      ['VLAN-Tag an der VM fehlt', 'VLAN tag missing on the VM'], ['Festplatte voll', 'Disk full'], ['DNS', 'DNS'],
      'Ohne Tag (und VLAN-aware Bridge) landet die VM im ungetaggten Netz.', 'Without a tag (and a VLAN-aware bridge) the VM ends up in the untagged network.'],
    ['WLAN im Besprechungsraum: volles Signal, aber sehr langsam. Viele Nachbarnetze.', 'Wi-Fi in the meeting room: full signal but very slow. Many neighbouring networks.',
      ['Funkkanal überlastet', 'Channel congested'], ['DNS', 'DNS'], ['Falsches WLAN-Passwort', 'Wrong Wi-Fi password'],
      'Netze auf demselben Kanal teilen sich die Sendezeit. Besser 5 GHz oder ein freier Kanal.', 'Networks on the same channel share airtime. Use 5 GHz or a free channel.'],
    ['Nach AP-Tausch findet ein altes IoT-Gerät das WLAN nicht mehr, Handys schon.', 'After an AP swap an old IoT device can’t find the Wi-Fi, phones can.',
      ['Gerät kann nur 2,4 GHz', 'Device only does 2.4 GHz'], ['DHCP-Pool voll', 'DHCP pool full'], ['DNS', 'DNS'],
      'Viele alte Geräte können weder 5 GHz noch WPA3. Der neue AP sendet dafür nichts Passendes.', 'Many old devices support neither 5 GHz nor WPA3. The new AP offers nothing they can use.'],
    ['Ab 9 Uhr bekommen neue Geräte keine IP mehr, frühmorgens klappt es.', 'From 9 a.m. new devices get no IP, early in the morning it works.',
      ['DHCP-Pool erschöpft', 'DHCP pool exhausted'], ['Netzwerkkabel', 'Network cable'], ['DNS', 'DNS'],
      'Alle Adressen sind vergeben. Pool vergrößern oder Lease-Zeit verkürzen.', 'All addresses are leased. Enlarge the pool or shorten the lease time.'],
    ['Webseite der Firma geht von außen, intern über den Namen aber nicht.', 'The company website works from outside, but not by name from inside.',
      ['Hairpin-NAT/Split-DNS fehlt', 'No hairpin NAT/split DNS'], ['Zertifikat', 'Certificate'], ['Webserver ist aus', 'Web server is off'],
      'Intern zeigt der Name auf die öffentliche IP, und die Firewall leitet das nicht zurück ins LAN.', 'Internally the name points to the public IP and the firewall doesn’t loop it back into the LAN.'],
    ['Nach Zertifikatstausch: Browser zeigen alles grün, die Handy-App meldet Zertifikatsfehler.', 'After a certificate swap: browsers are fine, the mobile app reports a certificate error.',
      ['Zwischenzertifikat fehlt', 'Intermediate cert missing'], ['Uhrzeit am Server', 'Server clock'], ['DNS', 'DNS'],
      'Browser ergänzen eine unvollständige Kette oft selbst, Apps nicht. Die ganze Kette ausliefern.', 'Browsers often complete a broken chain themselves, apps don’t. Serve the full chain.'],
    ['Nach Server-Umzug sieht ein Kollege noch die alte Webseite, alle anderen die neue.', 'After a server move one colleague still sees the old website, everyone else the new one.',
      ['Alter DNS-Eintrag im Cache', 'Old DNS entry cached'], ['Webserver defekt', 'Web server broken'], ['Firewall', 'Firewall'],
      'Der alte Eintrag bleibt bis zum Ablauf der TTL im Cache. Hilft: ipconfig /flushdns.', 'The old entry stays cached until its TTL expires. Fix: ipconfig /flushdns.'],
    ['Netzlaufwerk zeigt nach der Anmeldung ein rotes X, ein Doppelklick verbindet es.', 'Mapped drive shows a red X after logon, a double-click connects it.',
      ['Netz bei Anmeldung nicht bereit', 'Network not ready at logon'], ['Freigabe gelöscht', 'Share deleted'], ['Virus', 'Virus'],
      'Windows meldet an, bevor das Netz bereit ist. GPO „Beim Start auf das Netzwerk warten“.', 'Windows logs on before the network is ready. GPO “Always wait for the network at startup”.'],
    ['Niemand kann mehr drucken, alle Aufträge hängen in der Warteschlange.', 'Nobody can print, every job is stuck in the queue.',
      ['Druckspooler hängt', 'Print spooler stuck'], ['DNS', 'DNS'], ['Lizenz abgelaufen', 'License expired'],
      'Ein defekter Auftrag blockiert den Spooler. Auftrag löschen, Spooler-Dienst neu starten.', 'A broken job blocks the spooler. Delete the job, restart the spooler service.'],
    ['RDP auf den Terminalserver: „keine Remotedesktoplizenzen verfügbar“.', 'RDP to the terminal server: “no Remote Desktop licenses available”.',
      ['RDS-CALs fehlen', 'RDS CALs missing'], ['Firewall sperrt 3389', 'Firewall blocks 3389'], ['Falsches Passwort', 'Wrong password'],
      'Die 120-tägige Kulanzzeit ist vorbei, und es sind keine RDS-Lizenzen hinterlegt.', 'The 120-day grace period is over and no RDS licenses are installed.'],
    ['Jede SSH-Anmeldung am Server dauert etwa 20 Sekunden, danach ist alles schnell.', 'Every SSH login to the server takes about 20 seconds, then everything is fast.',
      ['Reverse-DNS-Abfrage', 'Reverse DNS lookup'], ['Langsame Festplatte', 'Slow disk'], ['Falscher Port', 'Wrong port'],
      'sshd löst die Client-IP rückwärts auf und wartet aufs Timeout. UseDNS no oder PTR-Eintrag.', 'sshd reverse-resolves the client IP and waits for the timeout. UseDNS no or add a PTR record.'],
    ['Linux: df meldet die Platte voll, aber du findet keine großen Dateien.', 'Linux: df says the disk is full, but du finds no large files.',
      ['Gelöschte Datei noch offen', 'Deleted file still open'], ['Keine Inodes mehr frei', 'Out of inodes'], ['Dateisystem defekt', 'Corrupt file system'],
      'Ein Prozess hält eine gelöschte Logdatei offen. Finden mit lsof +L1, Dienst neu starten.', 'A process still holds a deleted log file open. Find it with lsof +L1, restart the service.'],
    ['Seit dem Domainumzug kommen externe Mails nicht mehr an, interne schon.', 'Since the domain move external mails don’t arrive, internal ones do.',
      ['MX-Eintrag zeigt falsch', 'MX record points wrong'], ['SPF fehlt', 'SPF missing'], ['Postfach voll', 'Mailbox full'],
      'Der MX-Eintrag bestimmt, wohin eingehende Mails zugestellt werden.', 'The MX record decides where incoming mail is delivered.'],
    ['Neuer Switch: VoIP-Telefone gehen, die PCs dahinter haben kein Netz.', 'New switch: VoIP phones work, the PCs behind them have no network.',
      ['Daten-VLAN am Port falsch', 'Wrong data VLAN on port'], ['PoE zu schwach', 'Not enough PoE'], ['DNS', 'DNS'],
      'Das Telefon nutzt das getaggte Voice-VLAN, der PC das ungetaggte Daten-VLAN am Port.', 'The phone uses the tagged voice VLAN, the PC the untagged data VLAN on the port.'],
    ['Neue Kamera bleibt an einem Port dunkel, an einem anderen Port läuft sie.', 'New camera stays dark on one port but works on another.',
      ['Port liefert kein PoE', 'Port provides no PoE'], ['Falsches VLAN', 'Wrong VLAN'], ['Kamera defekt', 'Camera faulty'],
      'An einem anderen Port geht sie, also ist die Kamera heil. Der Port hat kein PoE oder das Budget ist aufgebraucht.', 'It works elsewhere, so the camera is fine. The port has no PoE or the budget is used up.'],
    ['Ein Mitarbeiter steckt einen Mini-Switch an, der Port geht sofort aus.', 'An employee plugs in a mini switch, the port shuts down instantly.',
      ['BPDU-Guard/Port-Security', 'BPDU guard/port security'], ['Kabel defekt', 'Faulty cable'], ['DHCP', 'DHCP'],
      'Eine Schutzfunktion schaltet den Port ab, wenn dort ein Switch oder eine fremde MAC auftaucht.', 'A protection feature disables the port when a switch or unknown MAC appears.'],
    ['Gigabit-Port verbindet nur mit 100 Mbit/s.', 'Gigabit port only links at 100 Mbit/s.',
      ['Adernpaar im Kabel defekt', 'Broken wire pair in cable'], ['DNS', 'DNS'], ['Zu viele Benutzer', 'Too many users'],
      '1 Gbit/s braucht alle 4 Adernpaare, 100 Mbit/s nur 2. Fällt eins aus, wird heruntergeschaltet.', '1 Gbit/s needs all 4 pairs, 100 Mbit/s only 2. If one fails, the link drops down.'],
    ['Excel meldet „von anderem Benutzer gesperrt“, aber niemand hat die Datei offen.', 'Excel says “locked by another user”, but nobody has the file open.',
      ['Verwaiste Dateisperre', 'Orphaned file lock'], ['Virus', 'Virus'], ['Lizenz abgelaufen', 'License expired'],
      'Eine alte Sitzung hält die Datei noch. Auf dem Server unter „Geöffnete Dateien“ schließen.', 'An old session still holds the file. Close it on the server under “Open files”.'],
    ['OneDrive synchronisiert die meisten Dateien, ein paar zeigen Fehler.', 'OneDrive syncs most files, a few show errors.',
      ['Pfad zu lang/ungültige Zeichen', 'Path too long/invalid chars'], ['Lizenz abgelaufen', 'License expired'], ['Internet weg', 'Internet down'],
      'Betrifft es nur einzelne Dateien, liegt es an diesen: zu lange Pfade oder unzulässige Zeichen.', 'If only some files fail, it’s those files: paths too long or invalid characters.'],
    ['Homeoffice: VPN ist verbunden, das Firmennetz 192.168.1.0/24 aber nicht erreichbar.', 'Home office: VPN is connected, but the company network 192.168.1.0/24 is unreachable.',
      ['Heimnetz hat gleiches Subnetz', 'Home LAN uses same subnet'], ['VPN-Lizenz fehlt', 'VPN license missing'], ['DNS', 'DNS'],
      'Zu Hause gilt auch 192.168.1.0/24. Der PC hält die Ziele für lokal und schickt nichts durchs VPN.', 'Home uses 192.168.1.0/24 too. The PC thinks the targets are local and sends nothing through the VPN.'],
    /* Schicht 1/2: Kabel, Switch, VLAN, WLAN */
    ['PC verliert alle paar Minuten kurz die Verbindung, Kabel ist geknickt und mit Klebeband geflickt.', 'PC drops the connection every few minutes, the cable is kinked and taped up.',
      ['Defektes Patchkabel', 'Faulty patch cable'], ['DHCP-Lease zu kurz', 'DHCP lease too short'], ['DNS-Server langsam', 'Slow DNS server'],
      'Beschädigte Kabel verursachen Wackelkontakte und CRC-Fehler. Kabel tauschen ist der schnellste Test.', 'Damaged cables cause intermittent links and CRC errors. Swapping the cable is the quickest test.'],
    ['Am Switch-Port steigen die CRC-Fehler ständig, der PC ist spürbar langsam.', 'CRC errors keep rising on the switch port, the PC is noticeably slow.',
      ['Kabel oder Dose defekt', 'Bad cable or wall jack'], ['Falsches VLAN', 'Wrong VLAN'], ['DNS-Cache voll', 'DNS cache full'],
      'CRC-Fehler sind Übertragungsfehler auf Schicht 1/2, fast immer Kabel, Dose oder Stecker.', 'CRC errors are transmission errors on layer 1/2, almost always cable, jack or connector.'],
    ['Nach dem Umpatchen im Serverschrank hat eine ganze Abteilung kein Netz mehr.', 'After re-patching in the rack a whole department has no network.',
      ['Uplink falsch gesteckt', 'Uplink patched wrong'], ['DHCP-Server voll', 'DHCP server full'], ['Passwörter abgelaufen', 'Passwords expired'],
      'Betrifft es alle Geräte hinter einem Switch, ist meist der Uplink zu diesem Switch unterbrochen.', 'When every device behind one switch fails, the uplink to that switch is usually broken.'],
    ['Notebook im Dock hat kein LAN, ohne Dock per USB-Adapter klappt es.', 'Laptop in the dock has no LAN, a USB adapter without the dock works.',
      ['Dock-Treiber/Firmware', 'Dock driver/firmware'], ['DHCP-Server', 'DHCP server'], ['Switch-Port gesperrt', 'Switch port blocked'],
      'Funktioniert derselbe Port mit anderem Adapter, liegt es am Dock. Firmware und Treiber aktualisieren.', 'If the same port works with another adapter, the dock is the problem. Update firmware and drivers.'],
    ['Mehrere PoE-Kameras starten ständig neu, seit zwei weitere angeschlossen wurden.', 'Several PoE cameras keep rebooting since two more were connected.',
      ['PoE-Budget des Switches erschöpft', 'Switch PoE budget exceeded'], ['IP-Konflikt', 'IP conflict'], ['DNS', 'DNS'],
      'Der Switch hat nur ein begrenztes PoE-Gesamtbudget. Wird es überschritten, schaltet er Ports ab.', 'The switch has a limited total PoE budget. When it is exceeded, ports get switched off.'],
    ['PC zeigt „Netzwerkkabel nicht angeschlossen“, das Kabel steckt aber fest.', 'PC says “network cable unplugged”, but the cable is firmly in.',
      ['Kabel, Dose oder Port defekt', 'Bad cable, jack or port'], ['DNS falsch', 'Wrong DNS'], ['Proxy aktiv', 'Proxy enabled'],
      'Kein Link ist immer Schicht 1. Mit einem anderen Kabel und Port eingrenzen.', 'No link is always layer 1. Narrow it down with another cable and port.'],
    ['Datenübertragung zwischen zwei Gigabit-Geräten ist sehr langsam, am Port steigen die Kollisionen.', 'Transfers between two gigabit devices are very slow, collisions rise on the port.',
      ['Duplex-Fehlanpassung', 'Duplex mismatch'], ['DNS langsam', 'Slow DNS'], ['Zu viele VLANs', 'Too many VLANs'],
      'Eine Seite fest auf Vollduplex, die andere auf Auto: Es entstehen Kollisionen. Beide Seiten auf Auto.', 'One side fixed to full duplex, the other on auto: collisions occur. Set both to auto.'],
    ['Neuer Switch angeschlossen, seitdem sind alle Server-VLANs am Uplink weg, nur VLAN 1 geht.', 'New switch connected, since then all server VLANs on the uplink are gone, only VLAN 1 works.',
      ['Uplink nicht als Trunk', 'Uplink not set as trunk'], ['DHCP-Server aus', 'DHCP server off'], ['DNS', 'DNS'],
      'Ein Access-Port transportiert nur ein VLAN. Für mehrere VLANs muss der Uplink getaggt (Trunk) sein.', 'An access port carries only one VLAN. For several VLANs the uplink must be tagged (trunk).'],
    ['Ein PC landet im falschen Netz und bekommt eine IP aus dem Gäste-Bereich.', 'A PC ends up in the wrong network and gets a guest-range IP.',
      ['Switch-Port im falschen VLAN', 'Switch port in wrong VLAN'], ['DNS-Server falsch', 'Wrong DNS server'], ['Netzwerkkarte defekt', 'Faulty network card'],
      'Die IP kommt aus dem VLAN, in dem der Port steckt. Port-VLAN am Switch prüfen.', 'The IP comes from the VLAN the port is in. Check the port VLAN on the switch.'],
    ['IP-Telefon funktioniert, der PC am Telefon-Durchgang bekommt keine IP.', 'IP phone works, the PC plugged into the phone’s pass-through gets no IP.',
      ['Daten-VLAN am Port fehlt', 'Data VLAN missing on port'], ['Telefon defekt', 'Phone broken'], ['DNS', 'DNS'],
      'Telefon nutzt das Voice-VLAN (getaggt), der PC das Daten-VLAN (ungetaggt). Fehlt eines, geht nur ein Gerät.', 'The phone uses the voice VLAN (tagged), the PC the data VLAN (untagged). If one is missing, only one device works.'],
    ['Nach Stromausfall läuft der Core-Switch, aber alle VLAN-Einstellungen sind weg.', 'After a power cut the core switch runs, but all VLAN settings are gone.',
      ['Konfiguration nicht gespeichert', 'Config was never saved'], ['Firmware-Update', 'Firmware update'], ['DHCP-Server', 'DHCP server'],
      'Änderungen lagen nur in der laufenden Konfiguration. Nach jeder Änderung speichern (startup-config).', 'Changes were only in the running config. Save after every change (startup config).'],
    ['WLAN bricht immer am selben Ort im Flur ab, zwischen zwei Access Points.', 'Wi-Fi drops at the same spot in the hallway, between two access points.',
      ['Funkloch / schlechtes Roaming', 'Coverage gap / poor roaming'], ['DNS', 'DNS'], ['DHCP-Pool voll', 'DHCP pool full'],
      'Zwischen den APs ist das Signal zu schwach oder das Gerät wechselt zu spät. Ausleuchtung messen.', 'Between the APs the signal is too weak or the device roams too late. Do a site survey.'],
    ['Laptop verbindet sich mit dem WLAN, bekommt aber sofort „Kein Internet, gesichert“ und keine IP.', 'Laptop joins the Wi-Fi but immediately shows “No internet, secured” and no IP.',
      ['DHCP im WLAN-VLAN fehlt', 'No DHCP in the Wi-Fi VLAN'], ['Falsches WLAN-Passwort', 'Wrong Wi-Fi password'], ['Akku schwach', 'Low battery'],
      'Mit falschem Passwort gäbe es keine Verbindung. Verbunden ohne IP heißt: DHCP erreicht das Gerät nicht.', 'A wrong password would give no connection at all. Connected without an IP means DHCP doesn’t reach the device.'],
    ['Im Lager reißt das WLAN immer ab, wenn die Mikrowelle in der Kaffeeküche läuft.', 'In the warehouse Wi-Fi drops whenever the microwave in the kitchen runs.',
      ['Störung im 2,4-GHz-Band', 'Interference in 2.4 GHz band'], ['DNS', 'DNS'], ['Zu kurze DHCP-Lease', 'DHCP lease too short'],
      'Mikrowellen funken auf 2,4 GHz. Abhilfe: 5 GHz nutzen oder AP weiter weg.', 'Microwaves emit at 2.4 GHz. Fix: use 5 GHz or move the AP.'],
    ['Glasfaser-Uplink zum Nebengebäude ist dunkel, beide Switches laufen.', 'Fibre uplink to the other building is dark, both switches are running.',
      ['SFP oder Faser defekt/vertauscht', 'SFP or fibre bad/swapped'], ['DNS', 'DNS'], ['VLAN fehlt', 'VLAN missing'],
      'Kein Link auf Glas: SFP-Modul, verschmutzte Stecker oder vertauschte Sende-/Empfangsfaser prüfen.', 'No link on fibre: check the SFP module, dirty connectors or swapped TX/RX strands.'],
    ['Neues SFP-Modul im Switch wird nicht erkannt, der Port bleibt aus.', 'New SFP module isn’t recognised by the switch, the port stays down.',
      ['Inkompatibles SFP-Modul', 'Incompatible SFP module'], ['Falsches VLAN', 'Wrong VLAN'], ['DHCP', 'DHCP'],
      'Viele Switches akzeptieren nur kompatible (oft herstellereigene) SFP-Module.', 'Many switches only accept compatible (often vendor-coded) SFP modules.'],
    ['Server mit zwei gebündelten Netzwerkkarten ist mal erreichbar, mal nicht.', 'Server with two bonded NICs is reachable sometimes, sometimes not.',
      ['LACP nur auf einer Seite', 'LACP set on one side only'], ['DNS-TTL', 'DNS TTL'], ['Festplatte voll', 'Disk full'],
      'Ein Team/Bond braucht passende Einstellungen am Switch (LACP oder statisch), sonst gehen Pakete verloren.', 'A team/bond needs matching settings on the switch (LACP or static), otherwise packets get lost.'],
    ['Ein Port steht nach Spanning-Tree-Umstellung dauerhaft auf „blocking“.', 'After a spanning tree change a port is permanently in “blocking”.',
      ['STP verhindert eine Schleife', 'STP is preventing a loop'], ['Kabel defekt', 'Faulty cable'], ['DHCP', 'DHCP'],
      'Blocking ist bei redundanten Wegen gewollt: STP schaltet einen Weg ab, damit keine Schleife entsteht.', 'Blocking is intended with redundant paths: STP disables one path so no loop forms.'],
    ['Neues Netzwerkgerät hat an jedem Port Link, wird aber nicht gefunden. Es steht auf 192.168.0.1.', 'New network device has a link on every port but can’t be found. It is set to 192.168.0.1.',
      ['Werks-IP liegt im anderen Netz', 'Factory IP in another subnet'], ['Kabel defekt', 'Faulty cable'], ['DNS', 'DNS'],
      'Geräte im Auslieferungszustand haben oft eine feste IP. Zum Einrichten den PC kurz ins selbe Netz setzen.', 'Devices in factory state often have a fixed IP. Put the PC into the same subnet briefly to set it up.'],
    ['In einem Netz tauchen zwei DHCP-Server auf, Clients bekommen zufällig falsche IPs.', 'Two DHCP servers appear in one network, clients randomly get wrong IPs.',
      ['Fremder DHCP-Server (Router)', 'Rogue DHCP server (router)'], ['DNS-Cache', 'DNS cache'], ['Kabel defekt', 'Faulty cable'],
      'Oft hängt ein Heimrouter falsch herum im Netz. DHCP Snooping am Switch verhindert das.', 'Often a home router is plugged in the wrong way round. DHCP snooping on the switch prevents this.'],
    ['Zwei Switches über zwei Kabel verbunden, seitdem bricht das Netz regelmäßig zusammen.', 'Two switches connected with two cables, since then the network keeps collapsing.',
      ['Schleife ohne Spanning Tree', 'Loop without spanning tree'], ['DHCP-Pool voll', 'DHCP pool full'], ['Firewall', 'Firewall'],
      'Zwei Verbindungen ohne STP oder Link-Aggregation bilden eine Schleife.', 'Two links without STP or link aggregation form a loop.'],
    ['Drucker im Flur ist nicht erreichbar, am Switch steht der Port auf „administratively down“.', 'Printer in the hallway is unreachable, the switch port shows “administratively down”.',
      ['Port manuell abgeschaltet', 'Port shut down manually'], ['Druckertreiber', 'Printer driver'], ['DNS', 'DNS'],
      '„Administratively down“ heißt: Jemand hat den Port in der Konfiguration abgeschaltet (shutdown).', '“Administratively down” means someone disabled the port in the config (shutdown).'],
    ['Nach Umbau im Büro: Dose 2.14 hat kein Netz, das Kabel im Schrank hängt lose.', 'After office works: wall jack 2.14 has no network, its cable in the rack is unplugged.',
      ['Dose nicht gepatcht', 'Jack not patched'], ['DHCP-Server', 'DHCP server'], ['Benutzerkonto gesperrt', 'Account locked'],
      'Die Dose ist nur mit dem Patchfeld verbunden. Erst ein Patchkabel zum Switch macht sie aktiv.', 'The jack only goes to the patch panel. A patch cable to the switch makes it live.'],
    ['WLAN-Gäste sehen die Geräte anderer Gäste und können sie anpingen.', 'Wi-Fi guests can see and ping other guests’ devices.',
      ['Client-Isolation fehlt', 'Client isolation off'], ['DNS', 'DNS'], ['Zu schwaches Signal', 'Signal too weak'],
      'Im Gästenetz sollten sich Geräte nicht gegenseitig erreichen. Client-Isolation am AP aktivieren.', 'Guest devices shouldn’t reach each other. Enable client isolation on the AP.'],
    ['Zwei Standorte, gleiches VLAN 10 per Kabel verbunden: Seitdem doppelte IPs und DHCP-Chaos.', 'Two sites, same VLAN 10 bridged by cable: since then duplicate IPs and DHCP chaos.',
      ['Zwei DHCP-Server im selben VLAN', 'Two DHCP servers in one VLAN'], ['Kabel zu lang', 'Cable too long'], ['Zertifikat', 'Certificate'],
      'Werden zwei Netze zu einem verbunden, verteilen beide DHCP-Server Adressen aus demselben Bereich.', 'Merging two networks makes both DHCP servers hand out addresses in the same segment.'],
    /* Schicht 3/4: IP, DHCP, Routing, NAT, Ports */
    ['PC hat IP 192.168.10.50 mit Maske 255.255.0.0, alle anderen /24. Einige Server im Netz 192.168.20.x gehen nicht.', 'PC has IP 192.168.10.50 with mask 255.255.0.0, everyone else /24. Some servers in 192.168.20.x fail.',
      ['Falsche Subnetzmaske', 'Wrong subnet mask'], ['DNS-Server falsch', 'Wrong DNS server'], ['Netzwerkkabel', 'Network cable'],
      'Mit /16 hält der PC 192.168.20.x für lokal und fragt per ARP, statt über das Gateway zu gehen.', 'With /16 the PC thinks 192.168.20.x is local and ARPs for it instead of using the gateway.'],
    ['Statisch eingerichteter Server: Gateway 192.168.1.1, das Netz ist aber 192.168.2.0/24.', 'Statically configured server: gateway 192.168.1.1, but the network is 192.168.2.0/24.',
      ['Gateway liegt nicht im Subnetz', 'Gateway not in the subnet'], ['DNS', 'DNS'], ['Lizenz', 'License'],
      'Das Gateway muss im eigenen Subnetz liegen, sonst kann der Server es nicht erreichen.', 'The gateway must be in the own subnet, otherwise the server can’t reach it.'],
    ['ipconfig zeigt eine gültige IP, aber kein Standardgateway. Nur das lokale Netz geht.', 'ipconfig shows a valid IP but no default gateway. Only the local network works.',
      ['DHCP-Option Router fehlt', 'DHCP router option missing'], ['DNS-Cache', 'DNS cache'], ['Kabel', 'Cable'],
      'Der DHCP-Bereich verteilt IP und Maske, aber nicht die Option 3 (Router/Gateway).', 'The DHCP scope hands out IP and mask but not option 3 (router/gateway).'],
    ['Nach Router-Tausch: Clients bekommen IP und Gateway, aber keinen DNS-Server.', 'After a router swap: clients get IP and gateway but no DNS server.',
      ['DHCP-Option DNS fehlt', 'DHCP DNS option missing'], ['Switch defekt', 'Faulty switch'], ['Proxy', 'Proxy'],
      'Option 6 (DNS-Server) wurde im neuen DHCP nicht eingetragen.', 'Option 6 (DNS servers) wasn’t configured in the new DHCP.'],
    ['Standort B erreicht Standort A über VPN, aber die Antworten kommen nie zurück.', 'Site B reaches site A over VPN, but the replies never come back.',
      ['Rückroute fehlt', 'Return route missing'], ['DNS', 'DNS'], ['Zertifikat', 'Certificate'],
      'Routing muss in beide Richtungen stimmen. Standort A kennt den Weg zum Netz von B nicht.', 'Routing must work both ways. Site A doesn’t know the route back to site B’s network.'],
    ['Neues Netz 10.0.50.0/24 an der Firewall angelegt, Clients dort erreichen kein Internet.', 'New network 10.0.50.0/24 created on the firewall, clients there have no internet.',
      ['NAT-Regel fehlt', 'Outbound NAT rule missing'], ['DNS-TTL', 'DNS TTL'], ['Kabel', 'Cable'],
      'Private Netze brauchen ausgehendes NAT. Bei manuellem NAT muss das neue Netz ergänzt werden.', 'Private networks need outbound NAT. With manual NAT the new network must be added.'],
    ['Zwei Standorte sollen per VPN verbunden werden, beide nutzen 192.168.178.0/24.', 'Two sites should be linked via VPN, both use 192.168.178.0/24.',
      ['Überlappende Subnetze', 'Overlapping subnets'], ['Zu langsames Internet', 'Internet too slow'], ['DNS', 'DNS'],
      'Gleiche Netze auf beiden Seiten lassen sich nicht routen. Ein Standort muss umnummeriert werden (oder NAT).', 'Identical networks on both sides can’t be routed. One site must be renumbered (or use NAT).'],
    ['tracert zum Server endet beim zweiten Hop mit Sternchen, Ping vom Router selbst geht.', 'tracert to the server stops at hop 2 with asterisks, ping from the router itself works.',
      ['Routing/Firewall am 2. Hop', 'Routing/firewall at hop 2'], ['DNS', 'DNS'], ['PC-Netzwerkkarte', 'PC network card'],
      'Bis Hop 1 kommt das Paket, danach nicht weiter. Dort fehlt eine Route oder eine Regel blockt.', 'The packet reaches hop 1, not beyond. A route is missing there or a rule blocks it.'],
    ['Server lauscht laut netstat auf 127.0.0.1:8080, von anderen PCs ist er nicht erreichbar.', 'Server listens on 127.0.0.1:8080 per netstat, other PCs can’t reach it.',
      ['Dienst bindet nur an localhost', 'Service bound to localhost only'], ['DNS', 'DNS'], ['Switch-Port', 'Switch port'],
      '127.0.0.1 ist nur lokal erreichbar. Der Dienst muss an 0.0.0.0 oder die Server-IP binden.', '127.0.0.1 is local only. The service must bind to 0.0.0.0 or the server IP.'],
    ['Portweiterleitung für den Webserver ist eingerichtet, von außen geht es trotzdem nicht. Der Webserver hat kein Gateway.', 'Port forward for the web server is set up, still fails from outside. The web server has no gateway.',
      ['Server-Gateway fehlt', 'Server gateway missing'], ['Zertifikat', 'Certificate'], ['DNS-Cache', 'DNS cache'],
      'Die Anfrage kommt an, aber die Antwort an eine Internet-IP findet ohne Gateway keinen Weg zurück.', 'The request arrives, but without a gateway the reply to an internet IP has no way back.'],
    ['Internet funktioniert, aber nur sehr langsam. Der Router zeigt 100 % CPU durch ein Gerät mit tausenden Verbindungen.', 'Internet works but is very slow. The router shows 100 % CPU from one device with thousands of connections.',
      ['Infizierter/fehlerhafter Client', 'Infected or misbehaving client'], ['DNS', 'DNS'], ['Kabel', 'Cable'],
      'Ein Gerät mit tausenden Verbindungen (Malware, Torrent, Fehlkonfiguration) überlastet die NAT-Tabelle.', 'One device with thousands of connections (malware, torrent, misconfig) overloads the NAT table.'],
    ['DHCP-Server und Clients in unterschiedlichen VLANs: Clients bekommen keine IP.', 'DHCP server and clients in different VLANs: clients get no IP.',
      ['DHCP-Relay fehlt', 'DHCP relay missing'], ['DNS falsch', 'Wrong DNS'], ['Zu viele Clients', 'Too many clients'],
      'DHCP-Anfragen sind Broadcasts und enden am Router. Ein Relay (ip helper) leitet sie weiter.', 'DHCP requests are broadcasts and stop at the router. A relay (IP helper) forwards them.'],
    ['Server bekommt bei jedem Neustart eine neue IP, Dienste anderer Rechner finden ihn nicht mehr.', 'Server gets a new IP on every reboot, other machines can’t find its services.',
      ['Keine feste IP/Reservierung', 'No static IP/reservation'], ['DNS-Zone', 'DNS zone'], ['Firewall', 'Firewall'],
      'Server brauchen eine feste Adresse oder eine DHCP-Reservierung.', 'Servers need a static address or a DHCP reservation.'],
    ['DHCP-Reservierung für den Drucker ist angelegt, er bekommt trotzdem eine andere IP.', 'DHCP reservation for the printer exists, it still gets a different IP.',
      ['Falsche MAC-Adresse reserviert', 'Wrong MAC address reserved'], ['Druckertreiber', 'Printer driver'], ['DNS', 'DNS'],
      'Oft wurde die WLAN-MAC statt der LAN-MAC eingetragen oder umgekehrt.', 'Often the Wi-Fi MAC was entered instead of the LAN MAC or vice versa.'],
    ['Statische IP eines neuen Servers liegt mitten im DHCP-Bereich, ab und zu gibt es Adresskonflikte.', 'A new server’s static IP lies inside the DHCP range, occasional address conflicts occur.',
      ['Statische IP im DHCP-Pool', 'Static IP inside DHCP pool'], ['DNS', 'DNS'], ['Kabel', 'Cable'],
      'DHCP vergibt die Adresse irgendwann an einen Client. Feste IPs außerhalb des Pools wählen oder ausschließen.', 'DHCP will eventually lease that address to a client. Use static IPs outside the pool or exclude them.'],
    ['Zugriff auf den Webshop geht, aber nur über http. https läuft in einen Timeout.', 'Access to the web shop works, but only via http. https times out.',
      ['Port 443 nicht weitergeleitet', 'Port 443 blocked/not forwarded'], ['DNS', 'DNS'], ['Browser-Cache', 'Browser cache'],
      'Port 80 ist offen, 443 nicht. Regel oder Weiterleitung für 443 fehlt.', 'Port 80 is open, 443 isn’t. The rule or forward for 443 is missing.'],
    ['FTP-Anmeldung klappt, aber das Verzeichnis-Listing hängt.', 'FTP login works, but the directory listing hangs.',
      ['Passiv-Ports gesperrt', 'Passive ports blocked'], ['Falsches Passwort', 'Wrong password'], ['DNS', 'DNS'],
      'FTP nutzt für Daten eigene Ports. Im Passivmodus muss die Firewall den Port-Bereich zulassen.', 'FTP uses separate ports for data. In passive mode the firewall must allow that port range.'],
    ['Kunde ruft an: Internet komplett weg. Router zeigt keine öffentliche IP, DSL-LED blinkt.', 'Customer calls: internet completely down. Router shows no public IP, DSL LED is blinking.',
      ['Leitung/Provider gestört', 'Line/provider outage'], ['DNS', 'DNS'], ['DHCP-Pool', 'DHCP pool'],
      'Ohne Synchronisation (blinkende DSL-LED) ist die Leitung selbst das Problem. Störung beim Provider melden.', 'No sync (blinking DSL LED) means the line itself is the problem. Report it to the provider.'],
    ['Seit Provider-Wechsel: Router hat Sync, aber keine Internetverbindung, Login-Fehler im Log.', 'Since switching provider: router has sync but no internet, login errors in the log.',
      ['Falsche Zugangsdaten (PPPoE)', 'Wrong PPPoE credentials'], ['DNS', 'DNS'], ['Switch', 'Switch'],
      'Sync heißt: Leitung ist da. Die PPPoE-Anmeldung braucht die neuen Zugangsdaten des Providers.', 'Sync means the line is up. PPPoE login needs the new provider’s credentials.'],
    ['Nach Umzug auf neue öffentliche IP funktioniert die Anbindung an den Kunden-SFTP nicht mehr.', 'After moving to a new public IP the connection to the customer SFTP stops working.',
      ['IP-Freigabe beim Kunden fehlt', 'Customer IP allowlist outdated'], ['DNS', 'DNS'], ['Kabel', 'Cable'],
      'Viele Partner erlauben nur bekannte IPs. Die neue Adresse muss dort freigegeben werden.', 'Many partners only allow known IPs. The new address must be allowlisted there.'],
    ['Server 1 pingt Server 2, aber Server 2 nicht Server 1. Beide im selben Netz.', 'Server 1 pings server 2, but server 2 can’t ping server 1. Both in the same network.',
      ['Firewall auf Server 1 blockt ICMP', 'Server 1 firewall blocks ICMP'], ['Switch-Port', 'Switch port'], ['DNS', 'DNS'],
      'Einseitig heißt: Netz geht, aber ein Host verwirft eingehende Pings.', 'One-way means the network works, but one host drops incoming pings.'],
    ['Telefonie über VoIP: Man hört den Anrufer, er hört uns aber nicht.', 'VoIP call: we hear the caller, but they can’t hear us.',
      ['NAT/SIP-ALG stört RTP', 'NAT/SIP ALG breaks RTP'], ['Headset defekt', 'Faulty headset'], ['DNS', 'DNS'],
      'Einseitiger Ton ist ein klassisches NAT-Problem: Der Sprachstrom (RTP) findet den Rückweg nicht.', 'One-way audio is a classic NAT problem: the voice stream (RTP) can’t find its way back.'],
    ['IPv6 ist aktiv, manche Webseiten laden extrem lange, mit IPv4 sofort.', 'IPv6 is on, some websites take ages, over IPv4 they load instantly.',
      ['Defektes IPv6-Routing', 'Broken IPv6 routing'], ['Browser-Cache', 'Browser cache'], ['Druckertreiber', 'Printer driver'],
      'Der Client bevorzugt IPv6, kommt aber nicht durch und fällt erst nach Timeout auf IPv4 zurück.', 'The client prefers IPv6, can’t get through and only falls back to IPv4 after a timeout.'],
    ['Clients im Netz 10.1.0.0/16 erreichen 10.1.200.5 nicht, obwohl er im selben Netz sein sollte. Der Server hat /24.', 'Clients in 10.1.0.0/16 can’t reach 10.1.200.5, though it should be in the same network. The server has /24.',
      ['Maske am Server zu klein', 'Server mask too small'], ['DNS', 'DNS'], ['Kabel', 'Cable'],
      'Der Server hält nur 10.1.200.x für lokal und schickt Antworten an andere Clients zum Gateway.', 'The server considers only 10.1.200.x local and sends replies to other clients via the gateway.'],
    ['Remote-Wartung per Port 3389 direkt ins Internet freigegeben. Seitdem tausende Anmeldeversuche.', 'Remote access via port 3389 opened directly to the internet. Since then thousands of login attempts.',
      ['RDP offen im Internet', 'RDP exposed to the internet'], ['DNS', 'DNS'], ['Lizenz', 'License'],
      'RDP nie direkt ins Internet. Zugriff nur über VPN oder ein RD-Gateway mit MFA.', 'Never expose RDP directly. Access only via VPN or an RD gateway with MFA.'],
    /* DNS */
    ['Neuer PC lässt sich nicht in die Domäne aufnehmen: „Domänencontroller nicht gefunden“. Als DNS ist 8.8.8.8 eingetragen.', 'New PC can’t join the domain: “domain controller not found”. DNS is set to 8.8.8.8.',
      ['Client nutzt öffentlichen DNS', 'Client uses public DNS'], ['Falsches Admin-Kennwort', 'Wrong admin password'], ['Zu wenig RAM', 'Not enough RAM'],
      'Nur der interne DNS (meist der DC) kennt die Domäne und ihre SRV-Einträge. Öffentliche DNS-Server kennen sie nicht.', 'Only the internal DNS (usually the DC) knows the domain and its SRV records. Public DNS servers don’t.'],
    ['Interne Namen werden aufgelöst, aber keine Internetseiten. Der DNS-Server ist der DC, ping 1.1.1.1 geht.', 'Internal names resolve but no websites. DNS server is the DC, ping 1.1.1.1 works.',
      ['Weiterleitung am DNS-Server fehlt', 'DNS forwarder missing'], ['Gateway fehlt', 'Gateway missing'], ['Proxy-Ausnahme', 'Proxy exception'],
      'Der DC muss externe Anfragen weiterleiten (Forwarder oder Stammhinweise). Fehlt das oder ist es blockiert, bleibt das Internet namenlos.', 'The DC must forward external queries (forwarders or root hints). If that’s missing or blocked, the internet has no names.'],
    ['Neue PCs tauchen im DNS nicht auf, man erreicht sie nur per IP. Ältere PCs sind vorhanden.', 'New PCs don’t show up in DNS, they’re only reachable by IP. Older PCs are listed.',
      ['Dynamische Updates sind aus', 'Dynamic updates are off'], ['Firewall am Client', 'Client firewall'], ['Lizenz fehlt', 'License missing'],
      'Ohne dynamische Updates registrieren sich Clients nicht selbst in der Zone. In AD-Zonen auf „Nur sichere“ stellen.', 'Without dynamic updates clients don’t register in the zone. In AD zones set it to “secure only”.'],
    ['RDP auf PC-0815 landet auf einem ganz anderen Rechner. Im DNS steht PC-0815 mit einer alten IP.', 'RDP to PC-0815 lands on a different machine. DNS lists PC-0815 with an old IP.',
      ['Veraltete Einträge (Aufräumen aus)', 'Stale records (scavenging off)'], ['RDP-Port geändert', 'RDP port changed'], ['Kerberos-Fehler', 'Kerberos error'],
      'Ohne Alterung und Aufräumen bleiben alte DHCP-Einträge stehen, während die IP längst ein anderer PC hat.', 'Without aging and scavenging old DHCP records remain while another PC already has that IP.'],
    ['nslookup intranet liefert 10.0.0.20, aber ping intranet geht an 10.0.0.99.', 'nslookup intranet returns 10.0.0.20, but ping intranet goes to 10.0.0.99.',
      ['Eintrag in der hosts-Datei', 'Entry in the hosts file'], ['Zwei DNS-Server', 'Two DNS servers'], ['ARP-Cache', 'ARP cache'],
      'nslookup fragt direkt den DNS-Server, ping nutzt den Resolver und der liest zuerst die hosts-Datei.', 'nslookup asks the DNS server directly, ping uses the resolver, which reads the hosts file first.'],
    ['Webseite auf neuen Server umgezogen, DNS geändert. Manche Kunden sehen nach Stunden noch die alte Seite.', 'Website moved to a new server, DNS changed. Some customers still see the old site hours later.',
      ['TTL noch nicht abgelaufen', 'TTL hasn’t expired yet'], ['Zertifikat falsch', 'Wrong certificate'], ['Webserver aus', 'Web server down'],
      'Resolver dürfen den alten Eintrag bis zum Ablauf der TTL behalten. Vor einem Umzug die TTL vorher senken.', 'Resolvers may keep the old record until the TTL expires. Lower the TTL before a migration.'],
    ['ping fileserver01.firma.local geht, ping fileserver01 nicht. Nur auf einem PC.', 'ping fileserver01.firma.local works, ping fileserver01 doesn’t. Only on one PC.',
      ['DNS-Suffix fehlt', 'DNS suffix missing'], ['Server aus', 'Server off'], ['SMB-Version', 'SMB version'],
      'Kurze Namen ergänzt der Client mit dem DNS-Suffix. Fehlt es (DHCP-Option 15 oder Suchliste), scheitert der kurze Name.', 'The client appends the DNS suffix to short names. If it’s missing (DHCP option 15 or search list), the short name fails.'],
    ['Seit heute gehen Webseite und E-Mail der Firma nicht mehr. Der Server läuft, die DNS-Abfrage liefert nichts.', 'Since today website and email are down. The server runs, DNS lookups return nothing.',
      ['Domain ist ausgelaufen', 'Domain has expired'], ['Spamfilter', 'Spam filter'], ['Zertifikat abgelaufen', 'Certificate expired'],
      'Wird die Domain nicht verlängert (Zahlung, Ansprechpartner weg), verschwinden alle DNS-Einträge auf einmal.', 'If the domain isn’t renewed (payment, contact gone), all DNS records vanish at once.'],
    ['nslookup zeigt bei jedem Aufruf „Server: UnKnown“, die Antworten stimmen aber.', 'nslookup always shows “Server: UnKnown”, but the answers are correct.',
      ['Reverse-Zone (PTR) fehlt', 'Reverse zone (PTR) missing'], ['DNS-Server defekt', 'DNS server broken'], ['Falsche Maske', 'Wrong mask'],
      'nslookup sucht den Namen des DNS-Servers per Reverse-Lookup. Ohne PTR-Eintrag steht dort „UnKnown“, harmlos aber unsauber.', 'nslookup looks up the DNS server’s name via reverse lookup. Without a PTR record it shows “UnKnown”, harmless but untidy.'],
    ['Eigener Mailserver: Große Anbieter lehnen Mails ab, „reverse DNS does not match“.', 'Own mail server: large providers reject mail, “reverse DNS does not match”.',
      ['PTR beim Provider fehlt', 'PTR missing at provider'], ['Postfach voll', 'Mailbox full'], ['Port 25 offen', 'Port 25 open'],
      'Die öffentliche IP braucht einen PTR auf den Mailservernamen. Den setzt der Internetanbieter, nicht die eigene Zone.', 'The public IP needs a PTR to the mail server name. The ISP sets it, not your own zone.'],
    ['DC1 wird gewartet und plötzlich hängen alle Anmeldungen und Laufwerke. DC2 läuft.', 'DC1 is under maintenance and suddenly all logons and drives hang. DC2 is running.',
      ['Clients haben nur DC1 als DNS', 'Clients only have DC1 as DNS'], ['FSMO auf DC2', 'FSMO on DC2'], ['Lizenz', 'License'],
      'Ohne zweiten DNS-Eintrag finden Clients bei Ausfall von DC1 keinen DC mehr. Im DHCP beide DCs als DNS verteilen.', 'Without a second DNS entry clients can’t find any DC when DC1 is down. Hand out both DCs via DHCP.'],
    ['Seit dem VPN zur Partnerfirma soll intranet.partner.local erreichbar sein. Per IP geht es, per Name nicht.', 'After the VPN to a partner, intranet.partner.local should work. By IP yes, by name no.',
      ['Bedingte Weiterleitung fehlt', 'Conditional forwarder missing'], ['Routing fehlt', 'Routing missing'], ['Zertifikat', 'Certificate'],
      'Der eigene DNS kennt die fremde Zone nicht. Eine bedingte Weiterleitung schickt Anfragen dafür an den DNS des Partners.', 'Your DNS doesn’t know the foreign zone. A conditional forwarder sends those queries to the partner’s DNS.'],
    ['firma.de lädt im Browser, www.firma.de meldet „Seite nicht gefunden“.', 'firma.de loads in the browser, www.firma.de says “site not found”.',
      ['DNS-Eintrag für www fehlt', 'DNS record for www missing'], ['Cache voll', 'Cache full'], ['HTTPS kaputt', 'HTTPS broken'],
      'www ist ein eigener Name und braucht einen eigenen A- oder CNAME-Eintrag.', 'www is a separate name and needs its own A or CNAME record.'],
    ['nslookup meldet „DNS request timed out“, ping auf den DNS-Server geht.', 'nslookup reports “DNS request timed out”, ping to the DNS server works.',
      ['DNS-Dienst läuft nicht', 'DNS service not running'], ['Kabel defekt', 'Cable faulty'], ['Falsche Maske', 'Wrong mask'],
      'Der Server lebt, aber auf Port 53 antwortet niemand: Dienst gestoppt oder Port 53 durch die Firewall gesperrt.', 'The server is alive but nothing answers on port 53: service stopped or port 53 blocked by a firewall.'],
    ['Neuer Eintrag im DNS angelegt, der Client hat ipconfig /flushdns gemacht und bekommt trotzdem „nicht gefunden“.', 'New DNS record created, the client ran ipconfig /flushdns and still gets “not found”.',
      ['Negativer Cache am DNS-Server', 'Negative cache on DNS server'], ['hosts-Datei', 'hosts file'], ['Firewall', 'Firewall'],
      'Auch der fragende DNS-Server (z. B. Router) merkt sich „gibt es nicht“. Dessen Cache leeren oder TTL abwarten.', 'The forwarding DNS server (e.g. router) also caches “doesn’t exist”. Clear its cache or wait for the TTL.'],
    ['Let’s-Encrypt-Zertifikat lässt sich nicht erneuern. Per IPv4 ist die Seite erreichbar.', 'Let’s Encrypt certificate won’t renew. The site is reachable via IPv4.',
      ['Veralteter AAAA-Eintrag', 'Stale AAAA record'], ['Port 22 zu', 'Port 22 closed'], ['Uhrzeit falsch', 'Wrong time'],
      'Die Prüfung nutzt IPv6, wenn ein AAAA existiert. Zeigt er auf einen alten Server, scheitert die Validierung.', 'Validation prefers IPv6 when an AAAA exists. If it points to an old server, validation fails.'],
    ['Intranet geht in Edge, in Firefox kommt „Server nicht gefunden“. Gleicher PC.', 'Intranet works in Edge, Firefox says “server not found”. Same PC.',
      ['DNS über HTTPS im Browser', 'DNS over HTTPS in the browser'], ['Firefox veraltet', 'Firefox outdated'], ['Proxy-Ausnahme', 'Proxy exception'],
      'Mit DoH fragt Firefox einen externen DNS und umgeht den internen. Per Richtlinie abschalten.', 'With DoH Firefox asks an external DNS and bypasses the internal one. Disable it by policy.'],
    ['Der DC hat zwei Netzwerkkarten. Clients erreichen ihn manchmal nicht, nslookup dc01 liefert zwei IPs.', 'The DC has two NICs. Clients sometimes can’t reach it, nslookup dc01 returns two IPs.',
      ['Zweite NIC registriert sich', 'Second NIC registers in DNS'], ['DNS-Cache voll', 'DNS cache full'], ['Gateway falsch', 'Wrong gateway'],
      'Beide Adressen landen im DNS, Clients nehmen auch die unerreichbare. Auf der zweiten NIC die DNS-Registrierung abschalten.', 'Both addresses land in DNS and clients also pick the unreachable one. Disable DNS registration on the second NIC.'],
    ['Seit gestern ist die Seite eines Lieferanten von keinem PC aus erreichbar. Per Handy im Mobilfunk geht sie.', 'Since yesterday a supplier’s site is unreachable from every PC. On a phone via mobile data it works.',
      ['DNS-Filter blockiert die Domain', 'DNS filter blocks the domain'], ['Browser-Cache', 'Browser cache'], ['Lizenz', 'License'],
      'Filter an Firewall oder DNS (Kategorie, Bedrohungsliste) liefern für gesperrte Domains keine Antwort. Ausnahme prüfen.', 'Filters on firewall or DNS (category, threat list) return no answer for blocked domains. Check for an exception.'],
    ['Server von „altfs“ in „fs01“ umbenannt. Hunderte Verknüpfungen auf \\\\altfs gehen nicht mehr.', 'Server renamed from “altfs” to “fs01”. Hundreds of shortcuts to \\\\altfs no longer work.',
      ['Alias (CNAME) für alten Namen', 'Alias (CNAME) for old name'], ['Freigabe neu anlegen', 'Recreate the share'], ['Kabel', 'Cable'],
      'Ein CNAME „altfs“ auf fs01 hilft übergangsweise. Bei SMB zusätzlich den Alias am Server registrieren (netdom).', 'A CNAME “altfs” to fs01 helps for now. For SMB also register the alias on the server (netdom).'],
    ['DNS stimmt, trotzdem: „Ein AD-DC für die Domäne konnte nicht kontaktiert werden“. In der Zone fehlt _msdcs.', 'DNS is correct, still: “An AD DC for the domain could not be contacted”. _msdcs is missing in the zone.',
      ['SRV-Einträge des DC fehlen', 'DC SRV records missing'], ['Uhrzeit falsch', 'Wrong time'], ['Kennwort falsch', 'Wrong password'],
      'Clients finden DCs über SRV-Einträge. Netlogon-Dienst am DC neu starten, er registriert sie wieder.', 'Clients find DCs via SRV records. Restart Netlogon on the DC, it re-registers them.'],
    ['Die eigene Domain soll in Microsoft 365 hinzugefügt werden. Die Prüfung schlägt immer fehl.', 'The company domain should be added to Microsoft 365. Verification always fails.',
      ['TXT-Eintrag zur Prüfung fehlt', 'Verification TXT record missing'], ['MX falsch', 'Wrong MX'], ['Lizenz fehlt', 'License missing'],
      'Microsoft will den Besitz per TXT-Eintrag (MS=…) sehen. Erst danach lässt sich die Domain nutzen.', 'Microsoft wants proof of ownership via a TXT record (MS=…). Only then can the domain be used.'],
    ['Bei Störung der VPN-Strecke zur Zentrale geht in der Filiale gar nichts mehr, auch kein Internet.', 'When the VPN to headquarters fails the branch can’t do anything, not even internet.',
      ['DNS läuft nur über die VPN', 'DNS only via the VPN'], ['Router defekt', 'Router broken'], ['Lizenz', 'License'],
      'Steht als DNS nur der DC in der Zentrale, fehlt bei VPN-Ausfall jede Namensauflösung. Lokalen DNS oder Weiterleitung einrichten.', 'If the only DNS is the DC at headquarters, all name resolution fails with the VPN. Add a local DNS or forwarder.'],
    ['Der alte DC wurde abgeschaltet. Seitdem dauert die Anmeldung an PCs mit DHCP sehr lange.', 'The old DC was shut down. Since then logon on DHCP PCs takes very long.',
      ['Alter DNS-Server im DHCP', 'Old DNS server in DHCP'], ['Profil defekt', 'Profile corrupt'], ['Zu viele GPOs', 'Too many GPOs'],
      'Der DHCP-Bereich verteilt noch die IP des alten DC als DNS. Clients warten erst auf dessen Timeout.', 'The DHCP scope still hands out the old DC as DNS. Clients wait for its timeout first.'],
    ['Nach dem Anbieterwechsel geht der VPN-Zugang über vpn.firma.de nicht mehr. Per neuer IP klappt es.', 'After switching ISP the VPN via vpn.firma.de stops working. With the new IP it works.',
      ['Öffentliche IP hat sich geändert', 'Public IP has changed'], ['VPN-Lizenz', 'VPN license'], ['Zertifikat', 'Certificate'],
      'Der öffentliche A-Eintrag zeigt noch auf die alte feste IP des früheren Anschlusses.', 'The public A record still points to the old static IP of the previous line.'],
    /* Active Directory und Gruppenrichtlinien */
    ['Benutzer wurde vor 10 Minuten in die Gruppe „Buchhaltung“ aufgenommen, hat aber weiter keinen Zugriff auf die Freigabe.', 'User was added to the “Accounting” group 10 minutes ago but still can’t access the share.',
      ['Ab- und wieder anmelden', 'Sign out and back in'], ['Freigabe neu anlegen', 'Recreate the share'], ['DNS-Cache leeren', 'Clear DNS cache'],
      'Gruppen stehen im Anmelde-Token. Neue Mitgliedschaften gelten erst nach neuer Anmeldung (bzw. neuem Kerberos-Ticket).', 'Groups are part of the logon token. New memberships only apply after a new logon (or new Kerberos ticket).'],
    ['Gruppenrichtlinie geändert, beim Benutzer ist noch alles wie vorher.', 'Group Policy changed, the user still sees the old settings.',
      ['Richtlinie noch nicht aktualisiert', 'Policy not refreshed yet'], ['GPO defekt', 'GPO broken'], ['Lizenz', 'License'],
      'Clients holen GPOs etwa alle 90 Minuten. gpupdate /force oder neu anmelden beschleunigt es.', 'Clients refresh GPOs about every 90 minutes. gpupdate /force or a new logon speeds it up.'],
    ['In der Sicherheitsfilterung wurde „Authentifizierte Benutzer“ durch eine Gruppe ersetzt. Seitdem greift die GPO bei keinem.', 'Security filtering: “Authenticated Users” was replaced by a group. Since then the GPO applies to nobody.',
      ['Leserecht für Computer fehlt', 'Read right for computers missing'], ['Gruppe zu groß', 'Group too large'], ['SYSVOL voll', 'SYSVOL full'],
      'Die GPO wird im Computerkontext gelesen. „Authentifizierte Benutzer“ oder „Domänencomputer“ brauchen weiter das Leserecht.', 'The GPO is read in computer context. “Authenticated Users” or “Domain Computers” still need read permission.'],
    ['Seit der Admin sein Kennwort geändert hat, läuft die nächtliche Datensicherung per Aufgabenplanung nicht mehr.', 'Since the admin changed their password, the nightly backup in Task Scheduler no longer runs.',
      ['Aufgabe nutzt altes Kennwort', 'Task uses the old password'], ['Festplatte voll', 'Disk full'], ['Uhrzeit falsch', 'Wrong time'],
      'Aufgaben und Dienste speichern das Kennwort. Besser ein eigenes Dienstkonto statt des persönlichen Admins nutzen.', 'Tasks and services store the password. Better use a dedicated service account, not a personal admin.'],
    ['Aushilfe kann sich seit heute nicht mehr anmelden: „Das Konto ist abgelaufen“. Kennwort stimmt.', 'Temp worker can’t log on since today: “The account has expired”. Password is correct.',
      ['Ablaufdatum am Konto erreicht', 'Account expiry date reached'], ['Kennwort abgelaufen', 'Password expired'], ['Profil defekt', 'Profile corrupt'],
      'Das Konto selbst hat ein Ablaufdatum (Reiter Konto). Das ist etwas anderes als ein abgelaufenes Kennwort.', 'The account itself has an expiry date (Account tab). That’s different from an expired password.'],
    ['Kennwort per Telefon zurückgesetzt. Der Laptop im Homeoffice nimmt nur das alte Kennwort an.', 'Password reset by phone. The laptop at home only accepts the old password.',
      ['Zwischengespeicherte Anmeldung', 'Cached logon'], ['Tastatur falsch', 'Wrong keyboard layout'], ['Konto gesperrt', 'Account locked'],
      'Ohne DC-Kontakt prüft Windows gegen das zwischengespeicherte Kennwort. Mit altem anmelden, VPN aufbauen, dann sperren und neu.', 'Without DC contact Windows checks the cached password. Log on with the old one, connect VPN, then lock and unlock.'],
    ['Neuer Benutzer an DC1 angelegt. In der Filiale (DC2) heißt es „Benutzername oder Kennwort falsch“.', 'New user created on DC1. At the branch (DC2) it says “user name or password incorrect”.',
      ['Replikation noch nicht durch', 'Replication not done yet'], ['Konto deaktiviert', 'Account disabled'], ['Lizenz fehlt', 'License missing'],
      'Zwischen Standorten repliziert AD zeitversetzt. Abwarten oder per repadmin /syncall anstoßen.', 'Between sites AD replicates with a delay. Wait or trigger it with repadmin /syncall.'],
    ['repadmin /showrepl zeigt zwischen den Standort-DCs Fehler 1722 „RPC-Server nicht verfügbar“.', 'repadmin /showrepl shows error 1722 “RPC server unavailable” between site DCs.',
      ['Firewall blockt RPC-Ports', 'Firewall blocks RPC ports'], ['Kennwort falsch', 'Wrong password'], ['Festplatte voll', 'Disk full'],
      'Replikation braucht 135 und dynamische RPC-Ports. Eine neue Firewall dazwischen blockt sie oft.', 'Replication needs 135 and dynamic RPC ports. A new firewall in between often blocks them.'],
    ['Der alte DC ist abgestürzt und wurde einfach entsorgt. Jetzt lassen sich keine neuen Benutzer mehr anlegen.', 'The old DC crashed and was simply thrown out. Now no new users can be created.',
      ['RID-Master fehlt (FSMO)', 'RID master missing (FSMO)'], ['Lizenz voll', 'License full'], ['DNS-Zone voll', 'DNS zone full'],
      'Neue Objekte brauchen IDs vom RID-Master. Die FSMO-Rolle auf einen lebenden DC übernehmen (seize).', 'New objects need IDs from the RID master. Seize the FSMO role onto a working DC.'],
    ['Ein Benutzer wurde versehentlich gelöscht, samt aller Gruppen. Er soll genau so wiederkommen.', 'A user was deleted by mistake, with all groups. They should come back exactly as before.',
      ['Aus dem AD-Papierkorb holen', 'Restore from AD Recycle Bin'], ['Neu anlegen', 'Create again'], ['DC neu starten', 'Restart the DC'],
      'Mit aktivem AD-Papierkorb kommt das Objekt mit SID und Gruppen zurück. Neu anlegen ergibt eine neue SID ohne Rechte.', 'With the AD Recycle Bin the object returns with SID and groups. Recreating gives a new SID without rights.'],
    ['Benutzer hat keine Netzlaufwerke und kein Outlook-Profil. Angemeldet ist er als „PC-12\\mueller“.', 'User has no network drives and no Outlook profile. They’re signed in as “PC-12\\mueller”.',
      ['Lokal statt an der Domäne', 'Local instead of domain logon'], ['Profil defekt', 'Profile corrupt'], ['DHCP aus', 'DHCP off'],
      'Das ist ein lokales Konto auf dem PC. Mit FIRMA\\mueller oder der E-Mail-Adresse anmelden.', 'That’s a local account on the PC. Sign in with COMPANY\\mueller or the email address.'],
    ['Domänen-Admin öffnet D:\\Daten im Explorer: „Sie verfügen nicht über die Berechtigung“. Als Gruppe hat er Vollzugriff.', 'Domain admin opens D:\\Data in Explorer: “You don’t have permission”. Their group has full control.',
      ['UAC filtert Admin-Rechte', 'UAC filters admin rights'], ['NTFS defekt', 'NTFS corrupt'], ['Kerberos', 'Kerberos'],
      'Der Explorer läuft ohne Rechteerhöhung, Admin-Gruppen zählen dann nicht. Rechte lieber über eine eigene Gruppe vergeben.', 'Explorer runs without elevation, so admin groups don’t count. Grant rights via a dedicated group instead.'],
    ['Benutzer-GPO für die Terminalserver ist mit der OU der Server verknüpft, wirkt aber nicht.', 'User GPO for terminal servers is linked to the servers’ OU, but has no effect.',
      ['Loopback-Verarbeitung fehlt', 'Loopback processing missing'], ['RDS-Lizenz', 'RDS license'], ['WMI-Filter', 'WMI filter'],
      'Benutzereinstellungen greifen sonst nur über die OU des Benutzers. Loopback (Ersetzen/Zusammenführen) aktivieren.', 'User settings otherwise only apply via the user’s OU. Enable loopback (replace/merge).'],
    ['Kennwortrichtlinie in einer GPO auf der OU „Verwaltung“ gesetzt. Die Benutzer dort haben weiter die alten Regeln.', 'Password policy set in a GPO on the “Admin” OU. Users there still have the old rules.',
      ['Gilt nur auf Domänenebene', 'Only works at domain level'], ['gpupdate fehlt', 'gpupdate missing'], ['OU gesperrt', 'OU blocked'],
      'Die Kennwortrichtlinie für Domänenkonten kommt nur aus einer GPO an der Domäne. Für Gruppen gibt es Fine-Grained Policies.', 'Password policy for domain accounts only comes from a GPO on the domain. For groups use fine-grained policies.'],
    ['Neue Kollegin hat keine Laufwerke und keinen Drucker. Das Konto wurde von einem Lager-Mitarbeiter kopiert.', 'New colleague has no drives and no printer. Her account was copied from a warehouse worker.',
      ['Falsche Vorlage kopiert', 'Wrong template copied'], ['DHCP-Pool voll', 'DHCP pool full'], ['Profil fehlt', 'Profile missing'],
      'Beim Kopieren übernimmt sie Gruppen und Pfade des Lagers. Konten aus passenden Vorlagen anlegen.', 'Copying takes over the warehouse groups and paths. Create accounts from matching templates.'],
    ['PC neu installiert, gleicher Name. Domänenbeitritt: „Ein Konto mit demselben Namen ist bereits vorhanden“.', 'PC reinstalled, same name. Domain join: “An account with the same name exists”.',
      ['Kontowiederverwendung gesperrt', 'Account reuse blocked'], ['Lizenz fehlt', 'License missing'], ['Uhrzeit falsch', 'Wrong time'],
      'Seit 2022 darf ein Konto nur wiederverwenden, wer es erstellt hat. Altes Computerkonto löschen oder mit dem Ersteller beitreten.', 'Since 2022 only the creator may reuse a computer account. Delete the old one or join with the creator.'],
    ['Techniker braucht das lokale Admin-Kennwort eines PCs. Jeder PC hat ein anderes.', 'Technician needs a PC’s local admin password. Every PC has a different one.',
      ['Im LAPS nachsehen', 'Look it up in LAPS'], ['Mit Domänen-Admin rein', 'Use domain admin'], ['PC neu aufsetzen', 'Reinstall the PC'],
      'LAPS setzt pro PC ein eigenes Kennwort und speichert es im AD bzw. Entra. Berechtigte lesen es dort aus.', 'LAPS sets a unique password per PC and stores it in AD or Entra. Authorized staff read it there.'],
    ['GPO an DC1 geändert. An DC2 ist der Ordner im SYSVOL seit Wochen alt.', 'GPO changed on DC1. On DC2 the SYSVOL folder has been outdated for weeks.',
      ['SYSVOL-Replikation gestört', 'SYSVOL replication broken'], ['GPO gesperrt', 'GPO blocked'], ['Lizenz', 'License'],
      'SYSVOL repliziert per DFSR getrennt vom AD. Ereignisanzeige „DFS Replication“ prüfen.', 'SYSVOL replicates via DFSR separately from AD. Check the “DFS Replication” event log.'],
    ['Neuer Laptop wird im Homeoffice ausgepackt. Anmeldung: „Zurzeit sind keine Anmeldeserver verfügbar“.', 'New laptop is unboxed at home. Logon: “There are currently no logon servers available”.',
      ['Erstanmeldung braucht DC-Kontakt', 'First logon needs a DC'], ['Kennwort falsch', 'Wrong password'], ['WLAN defekt', 'Wi-Fi broken'],
      'Ohne zwischengespeicherte Anmeldung muss der DC erreichbar sein: erst im Büro anmelden oder VPN vor der Anmeldung.', 'Without a cached logon the DC must be reachable: first logon in the office or VPN before logon.'],
    ['Nach Heirat heißt sie jetzt Schmidt statt Meier. Mit s.schmidt klappt die Anmeldung nicht.', 'After marriage she’s now Schmidt instead of Meier. Logon as s.schmidt fails.',
      ['Anmeldename nicht geändert', 'Logon name not changed'], ['Konto gesperrt', 'Account locked'], ['DNS falsch', 'Wrong DNS'],
      'Anzeigename geändert reicht nicht: Anmeldename (sAMAccountName) und UPN müssen auch angepasst werden.', 'Changing the display name isn’t enough: logon name (sAMAccountName) and UPN must be updated too.'],
    ['Mitarbeiter soll per RDP auf den Server: „Die Verbindung wurde verweigert, Konto nicht autorisiert“.', 'Employee should RDP to a server: “The connection was denied, account not authorized”.',
      ['Nicht in Remotedesktopbenutzer', 'Not in Remote Desktop Users'], ['Port 3389 zu', 'Port 3389 closed'], ['Lizenz', 'License'],
      'Die Verbindung steht, nur das Recht fehlt. Gruppe „Remotedesktopbenutzer“ auf dem Server ergänzen.', 'The connection works, only the right is missing. Add them to “Remote Desktop Users” on the server.'],
    ['Anmeldung in der Filiale dauert Minuten. Die Clients melden sich am DC in der Zentrale an statt am lokalen.', 'Logon at the branch takes minutes. Clients authenticate at the HQ DC instead of the local one.',
      ['Subnetz keinem AD-Standort', 'Subnet not in any AD site'], ['DNS-Cache', 'DNS cache'], ['Zu viele GPOs', 'Too many GPOs'],
      'Nur über Standorte und Subnetze weiß ein Client, welcher DC nah ist. Das Filial-Subnetz dem Standort zuordnen.', 'Only sites and subnets tell a client which DC is close. Assign the branch subnet to its site.'],
    ['Neue Gruppe „Projekt-X“ lässt sich in den Ordnerrechten nicht auswählen.', 'New group “Project-X” can’t be selected in folder permissions.',
      ['Verteiler- statt Sicherheitsgruppe', 'Distribution, not security group'], ['Gruppe zu neu', 'Group too new'], ['NTFS defekt', 'NTFS corrupt'],
      'Verteilergruppen sind nur für E-Mail. Rechte gibt es nur für Sicherheitsgruppen, der Typ lässt sich umstellen.', 'Distribution groups are for email only. Permissions need security groups, the type can be changed.'],
    ['Softwareverteilung per GPO für Computer eingerichtet, gpupdate gemacht, nichts passiert.', 'Software deployment by GPO for computers set up, gpupdate run, nothing happens.',
      ['Neustart nötig', 'Restart required'], ['Benutzer neu anmelden', 'User logs on again'], ['Lizenz fehlt', 'License missing'],
      'Computer-Softwareinstallation und manche Computereinstellungen greifen erst beim Start des PCs.', 'Computer software installation and some computer settings only apply at startup.'],
    ['Neue Azubi im Support soll Kennwörter zurücksetzen, bekommt aber „Zugriff verweigert“.', 'New support trainee should reset passwords but gets “access denied”.',
      ['Rechte an der OU fehlen', 'Rights on the OU missing'], ['Muss Domänen-Admin sein', 'Must be domain admin'], ['Kennwort zu kurz', 'Password too short'],
      'Kennwort-Reset lässt sich per Delegation gezielt für eine OU vergeben. Domänen-Admin wäre viel zu viel Recht.', 'Password reset can be delegated for one OU. Domain admin would be far too much.'],
    /* Windows-Client */
    ['Nach der Anmeldung: „Sie wurden mit einem temporären Profil angemeldet“. Desktop ist leer.', 'After logon: “You’ve been signed in with a temporary profile”. Desktop is empty.',
      ['Benutzerprofil beschädigt', 'User profile corrupt'], ['Konto gesperrt', 'Account locked'], ['Festplatte defekt', 'Disk broken'],
      'Windows konnte das Profil nicht laden, in ProfileList steht ein .bak-Eintrag. Daten liegen meist noch unter C:\\Users.', 'Windows couldn’t load the profile, ProfileList shows a .bak entry. Data usually still sits in C:\\Users.'],
    ['Nach dem BIOS-Update fragt der Laptop beim Start nach einem 48-stelligen Schlüssel.', 'After a BIOS update the laptop asks for a 48-digit key at boot.',
      ['BitLocker-Wiederherstellung', 'BitLocker recovery'], ['Virus', 'Virus'], ['Festplatte defekt', 'Disk broken'],
      'Das TPM sieht eine geänderte Firmware und gibt den Schlüssel nicht frei. Vor BIOS-Updates BitLocker pausieren.', 'The TPM sees changed firmware and won’t release the key. Suspend BitLocker before BIOS updates.'],
    ['Windows-Update bricht mit 0x80070070 ab, der PC ist außerdem sehr langsam.', 'Windows Update fails with 0x80070070 and the PC is very slow.',
      ['Laufwerk C: ist voll', 'Drive C: is full'], ['Lizenz abgelaufen', 'License expired'], ['Kein Internet', 'No internet'],
      '0x80070070 heißt zu wenig Speicherplatz. Datenträgerbereinigung, Temp-Dateien und alte Updates löschen.', '0x80070070 means not enough disk space. Run Disk Cleanup, remove temp files and old updates.'],
    ['Auf den PC eines Kollegen kann man nicht zugreifen, Ping geht auch nicht. Er ist im Firmen-WLAN.', 'Nobody can reach a colleague’s PC, ping fails too. It’s on the company Wi-Fi.',
      ['Netzwerkprofil „Öffentlich“', 'Network profile “Public”'], ['IP doppelt', 'Duplicate IP'], ['Kabel', 'Cable'],
      'Im Profil „Öffentlich“ blockt die Windows-Firewall Freigaben und Ping. Firmennetze auf „Privat“ bzw. „Domäne“.', 'With profile “Public” Windows Firewall blocks sharing and ping. Company networks should be Private or Domain.'],
    ['Der Standarddrucker springt ständig auf einen anderen Drucker um.', 'The default printer keeps switching to another printer.',
      ['Windows verwaltet Standarddrucker', 'Windows manages default printer'], ['Treiber defekt', 'Driver broken'], ['Spooler voll', 'Spooler full'],
      'Windows nimmt sonst den zuletzt benutzten Drucker. In den Einstellungen diese Automatik abschalten.', 'Otherwise Windows uses the last printer used. Turn off that option in Settings.'],
    ['Alter Büro-PC braucht 10 Minuten zum Start. Im Task-Manager steht der Datenträger dauerhaft bei 100 %.', 'Old office PC takes 10 minutes to boot. Task Manager shows the disk at 100% constantly.',
      ['Alte HDD statt SSD', 'Old HDD instead of SSD'], ['Zu wenig Lizenz', 'Too few licenses'], ['Netzwerkkabel', 'Network cable'],
      'Windows 10/11 ist auf einer klassischen Festplatte ständig ausgelastet. Eine SSD löst das fast immer.', 'Windows 10/11 constantly saturates a spinning hard disk. An SSD nearly always fixes it.'],
    ['Der Benutzer fährt jeden Abend herunter, der Task-Manager zeigt aber 23 Tage Betriebszeit. Updates hängen.', 'The user shuts down every evening, but Task Manager shows 23 days uptime. Updates hang.',
      ['Schnellstart ist aktiv', 'Fast Startup is on'], ['Uhrzeit falsch', 'Wrong clock'], ['Virus', 'Virus'],
      'Mit Schnellstart ist Herunterfahren ein Ruhezustand. Nur „Neu starten“ startet Windows wirklich neu.', 'With Fast Startup shutdown is a hibernation. Only “Restart” really restarts Windows.'],
    ['In Teams hört niemand den Benutzer. Das Headset funktioniert an einem anderen PC.', 'Nobody can hear the user in Teams. The headset works on another PC.',
      ['Mikrofonzugriff aus (Datenschutz)', 'Mic access off (privacy)'], ['Teams-Lizenz', 'Teams license'], ['Firewall', 'Firewall'],
      'In den Datenschutzeinstellungen kann der Zugriff aufs Mikrofon für Apps gesperrt sein. Dort freigeben.', 'Privacy settings can block microphone access for apps. Allow it there.'],
    ['Kamerabild in Teams bleibt schwarz, der Geräte-Manager zeigt keinen Fehler.', 'Camera image in Teams stays black, Device Manager shows no error.',
      ['Abdeckung oder Kamera-Taste', 'Shutter or camera key'], ['Grafiktreiber', 'Graphics driver'], ['Bandbreite', 'Bandwidth'],
      'Viele Laptops haben einen Schieber oder eine Fn-Taste, die die Kamera elektrisch abschaltet.', 'Many laptops have a shutter or Fn key that disconnects the camera.'],
    ['Auf dem Laptop kommen beim Tippen Zahlen statt Buchstaben (j wird 1, k wird 2).', 'On the laptop typing gives numbers instead of letters (j becomes 1, k becomes 2).',
      ['Num-Lock ist aktiv', 'Num Lock is on'], ['Tastatur defekt', 'Keyboard broken'], ['Virus', 'Virus'],
      'Kleine Laptops legen den Ziffernblock auf die Buchstabentasten. Num-Lock ausschalten.', 'Small laptops map the numpad onto letter keys. Turn Num Lock off.'],
    ['Kennwort wird abgelehnt. Beim Tippen ins Suchfeld sind Y und Z vertauscht.', 'Password is rejected. Typing into the search box swaps Y and Z.',
      ['Englisches Tastaturlayout', 'English keyboard layout'], ['Konto gesperrt', 'Account locked'], ['Num-Lock', 'Num Lock'],
      'Mit Alt+Umschalt wechselt das Layout leicht auf EN. Dann stimmen Y/Z und Sonderzeichen im Kennwort nicht.', 'Alt+Shift easily switches the layout to EN. Then Y/Z and special characters in the password differ.'],
    ['Nach dem Update kein Ton mehr. Lautstärke steht auf 80 %, Treiber ist installiert.', 'After an update there’s no sound. Volume is at 80%, driver is installed.',
      ['Falsches Ausgabegerät gewählt', 'Wrong output device'], ['Lautsprecher defekt', 'Speaker broken'], ['Lizenz', 'License'],
      'Oft wird der Monitor (HDMI) oder ein Dock zum Standard-Ausgabegerät. Im Lautstärke-Menü umstellen.', 'Often the monitor (HDMI) or a dock becomes the default output. Switch it in the volume menu.'],
    ['Nach Mainboard-Tausch meldet Windows „Nicht aktiviert“.', 'After a mainboard swap Windows says “Not activated”.',
      ['Aktivierung an Hardware gebunden', 'Activation tied to hardware'], ['Virus', 'Virus'], ['Festplatte neu', 'New disk'],
      'Die digitale Lizenz hängt am Mainboard. Mit Microsoft-Konto per Problembehandlung reaktivieren oder neuen Key nutzen.', 'The digital license is tied to the mainboard. Reactivate via the troubleshooter with an MS account or use a new key.'],
    ['Ein PC bekommt seit Monaten keine Updates. „Einige Einstellungen werden von Ihrer Organisation verwaltet.“', 'A PC has had no updates for months. “Some settings are managed by your organization.”',
      ['GPO zeigt auf alten WSUS', 'GPO points to old WSUS'], ['Windows zu alt', 'Windows too old'], ['Kein Speicher', 'No storage'],
      'Der PC fragt nur den eingetragenen WSUS. Gibt es den nicht mehr, kommen keine Updates. GPO oder Registry anpassen.', 'The PC only asks the configured WSUS. If it no longer exists, no updates arrive. Fix the GPO or registry.'],
    ['Rechner mit 8 GB RAM, Chrome mit 40 Tabs, Teams und Outlook offen. Alles ruckelt.', 'PC with 8 GB RAM, Chrome with 40 tabs, Teams and Outlook open. Everything stutters.',
      ['Arbeitsspeicher voll', 'Memory exhausted'], ['Netzwerk langsam', 'Slow network'], ['Bildschirm defekt', 'Screen broken'],
      'Ist der RAM voll, lagert Windows auf die Platte aus. Tabs schließen oder Speicher aufrüsten.', 'When RAM is full Windows pages to disk. Close tabs or add memory.'],
    ['Ein selbst geschriebenes Firmenprogramm ist nach dem Neustart plötzlich weg.', 'An in-house company tool vanished after a restart.',
      ['Virenscanner hat es entfernt', 'Antivirus removed it'], ['Profil defekt', 'Profile corrupt'], ['Update', 'Update'],
      'Unsignierte Programme landen oft in der Quarantäne. Prüfen, freigeben und eine Ausnahme setzen.', 'Unsigned programs often end up in quarantine. Check, restore and add an exclusion.'],
    ['Benutzer will ein Programm installieren, Windows fragt nach Admin-Name und Kennwort.', 'User wants to install a program, Windows asks for an admin name and password.',
      ['Keine lokalen Adminrechte', 'No local admin rights'], ['Programm defekt', 'Program broken'], ['Konto gesperrt', 'Account locked'],
      'Das ist gewollt: Benutzer arbeiten ohne Adminrechte. Software kommt über die IT oder Softwareverteilung.', 'That’s intended: users work without admin rights. Software comes via IT or software deployment.'],
    ['Nach BIOS-Update: „Ihre PIN ist nicht mehr verfügbar“. Kennwort-Anmeldung geht.', 'After a BIOS update: “Your PIN is no longer available”. Password logon works.',
      ['TPM zurückgesetzt, PIN neu', 'TPM reset, set up PIN again'], ['Konto gesperrt', 'Account locked'], ['Tastatur defekt', 'Keyboard broken'],
      'Die Windows-Hello-PIN liegt im TPM. Wurde es gelöscht, muss die PIN neu eingerichtet werden.', 'The Windows Hello PIN lives in the TPM. If it was cleared the PIN must be set up again.'],
    ['Nach dem Aufwachen aus dem Energiesparmodus hat der PC kein Netzwerk. Nach Neustart geht es.', 'After waking from sleep the PC has no network. After a restart it works.',
      ['Energiesparen an der Netzwerkkarte', 'NIC power saving'], ['DHCP-Pool voll', 'DHCP pool full'], ['Kabel', 'Cable'],
      'Windows darf die Netzwerkkarte zum Stromsparen abschalten und weckt sie nicht sauber. Im Geräte-Manager deaktivieren.', 'Windows may turn off the NIC to save power and doesn’t wake it cleanly. Disable that in Device Manager.'],
    ['Kopieren und Einfügen zwischen PC und Remotedesktop-Sitzung geht plötzlich nicht mehr.', 'Copy and paste between PC and Remote Desktop session suddenly stops working.',
      ['Zwischenablage-Dienst hängt', 'Clipboard service hangs'], ['RDP-Lizenz', 'RDP license'], ['Speicher voll', 'Disk full'],
      'rdpclip.exe in der Sitzung hängt. Prozess beenden und neu starten, oder in der Richtlinie ist die Umleitung gesperrt.', 'rdpclip.exe in the session hangs. Kill and restart it, or redirection is blocked by policy.'],
    ['USB-Stick wird erkannt, beim Öffnen: „Zugriff verweigert“. An anderen PCs geht er.', 'USB stick is detected, opening it: “Access denied”. It works on other PCs.',
      ['USB per Richtlinie gesperrt', 'USB storage blocked by policy'], ['Stick defekt', 'Stick broken'], ['Treiber fehlt', 'Driver missing'],
      'Viele Firmen sperren Wechseldatenträger per GPO oder Endpoint-Schutz. Ausnahme nur über die IT.', 'Many companies block removable storage via GPO or endpoint protection. Exceptions only via IT.'],
    ['Netzwerksymbol zeigt „Kein Internet“ mit gelbem Dreieck, Webseiten laden aber normal.', 'Network icon shows “No internet” with a yellow triangle, but websites load fine.',
      ['Internetprüfung blockiert (NCSI)', 'Internet check blocked (NCSI)'], ['DNS defekt', 'DNS broken'], ['WLAN zu schwach', 'Wi-Fi too weak'],
      'Windows prüft per Test-URL bei Microsoft. Blockt Proxy oder Firewall diese, erscheint das Dreieck, Outlook/Teams meckern mit.', 'Windows checks via a Microsoft test URL. If proxy or firewall block it, the triangle appears and Outlook/Teams complain.'],
    ['PDFs öffnen sich seit dem Update in Edge statt in Acrobat.', 'PDFs open in Edge instead of Acrobat since the update.',
      ['Standard-App zurückgesetzt', 'Default app was reset'], ['Acrobat defekt', 'Acrobat broken'], ['PDF beschädigt', 'PDF corrupt'],
      'Updates setzen Dateizuordnungen gern zurück. Unter Standard-Apps oder per GPO-Zuordnungsdatei festlegen.', 'Updates like to reset file associations. Set them in Default apps or with a GPO association file.'],
    ['Benutzer sagt, alle Dateien auf dem Desktop sind weg. Im Explorer heißt der Desktop jetzt „OneDrive – Firma“.', 'User says all desktop files are gone. Explorer shows the desktop under “OneDrive – Company”.',
      ['Desktop in OneDrive umgeleitet', 'Desktop redirected to OneDrive'], ['Virus', 'Virus'], ['Profil gelöscht', 'Profile deleted'],
      'Die Ordnersicherung leitet Desktop/Dokumente nach OneDrive um. Alte Dateien liegen noch unter C:\\Users\\Name\\Desktop.', 'Known folder backup redirects Desktop/Documents to OneDrive. Old files still sit in C:\\Users\\Name\\Desktop.'],
    ['Windows-11-Upgrade wird auf einem 6 Jahre alten PC nicht angeboten.', 'Windows 11 upgrade isn’t offered on a 6-year-old PC.',
      ['CPU/TPM 2.0 nicht unterstützt', 'CPU/TPM 2.0 not supported'], ['Kein Internet', 'No internet'], ['Lizenz abgelaufen', 'License expired'],
      'Windows 11 verlangt TPM 2.0, Secure Boot und eine neuere CPU. Oft fehlt nur das TPM im BIOS, sonst Austausch.', 'Windows 11 requires TPM 2.0, Secure Boot and a newer CPU. Often just TPM is off in BIOS, otherwise replace.'],
    /* Windows Server, Datei, Druck, RDS, Backup, Hyper-V */
    ['Benutzer hat eine Excel-Datei auf dem Server gestern überschrieben. Das Backup ist von vorgestern.', 'User overwrote an Excel file on the server yesterday. The backup is from the day before.',
      ['Vorgängerversionen (Schattenkopie)', 'Previous versions (shadow copy)'], ['Datei ist verloren', 'File is lost'], ['Papierkorb', 'Recycle bin'],
      'Mit Schattenkopien auf dem Volume zeigt „Vorgängerversionen“ ältere Stände. Für Server-Freigaben gibt es keinen Papierkorb.', 'With shadow copies on the volume “Previous versions” shows older states. Server shares have no recycle bin.'],
    ['Benutzer kann auf dem Fileserver nicht speichern: „Nicht genügend Speicherplatz“. Das Laufwerk hat 400 GB frei.', 'User can’t save on the file server: “Not enough space”. The drive has 400 GB free.',
      ['Kontingent (Quota) erreicht', 'Quota reached'], ['NTFS-Rechte', 'NTFS permissions'], ['Datei zu groß', 'File too large'],
      'Ein FSRM- oder NTFS-Kontingent begrenzt den Ordner bzw. Benutzer, unabhängig vom freien Platz.', 'An FSRM or NTFS quota limits the folder or user, regardless of free space.'],
    ['Datensicherung des Servers bricht jede Nacht mit einem VSS-Fehler ab.', 'The server backup fails every night with a VSS error.',
      ['VSS-Writer hängt', 'VSS writer stuck'], ['Bandlaufwerk voll', 'Tape full'], ['Kennwort abgelaufen', 'Password expired'],
      'vssadmin list writers zeigt Writer im Fehlerzustand. Zugehörigen Dienst neu starten oder Server neu booten.', 'vssadmin list writers shows writers in a failed state. Restart the related service or reboot the server.'],
    ['Seit einem Update fragt Windows beim Verbinden eines Netzwerkdruckers nach Admin-Rechten.', 'Since an update Windows asks for admin rights when connecting a network printer.',
      ['Point-and-Print-Schutz', 'Point and Print hardening'], ['Drucker defekt', 'Printer broken'], ['Konto gesperrt', 'Account locked'],
      'Nach PrintNightmare dürfen Benutzer Treiber nicht mehr selbst installieren. Treiber vorab verteilen oder per GPO erlauben.', 'After PrintNightmare users can’t install drivers themselves. Pre-deploy drivers or allow them via GPO.'],
    ['Drucker druckt bei jedem Auftrag seitenweise wirre Zeichen.', 'Printer prints pages of garbage characters on every job.',
      ['Falscher Druckertreiber', 'Wrong printer driver'], ['Toner leer', 'Toner empty'], ['Papierstau', 'Paper jam'],
      'Der Treiber spricht eine andere Druckersprache (PCL/PostScript) als das Gerät. Passenden Treiber einrichten.', 'The driver speaks a different printer language (PCL/PostScript) than the device. Install the right driver.'],
    ['Drucker steht in Windows auf „Offline“, ist aber per Ping erreichbar und druckt von anderen Servern.', 'Printer shows “Offline” in Windows but responds to ping and prints from other servers.',
      ['SNMP-Status am Port falsch', 'SNMP status on the port wrong'], ['Toner leer', 'Toner empty'], ['Kabel', 'Cable'],
      'Windows fragt den Status per SNMP. Stimmt die Community nicht oder ist SNMP am Drucker aus, gilt er als offline.', 'Windows queries status via SNMP. Wrong community or SNMP off on the printer means “offline”.'],
    ['Benutzer kann sich am Terminalserver nicht anmelden, es hängt bei „Bitte warten“. Andere kommen rein.', 'User can’t log on to the terminal server, stuck at “Please wait”. Others get in.',
      ['Alte Sitzung hängt', 'Old session is stuck'], ['RDS-Lizenz', 'RDS license'], ['DNS', 'DNS'],
      'Eine getrennte Sitzung des Benutzers hängt noch. Im Task-Manager oder Server-Manager abmelden.', 'A disconnected session of that user still hangs. Sign it off in Task Manager or Server Manager.'],
    ['Bei jeder RDP-Verbindung zum Server: „Die Identität des Remotecomputers kann nicht überprüft werden“.', 'On every RDP connection to the server: “The identity of the remote computer cannot be verified”.',
      ['Selbstsigniertes Zertifikat', 'Self-signed certificate'], ['Server gehackt', 'Server hacked'], ['Kennwort falsch', 'Wrong password'],
      'RDP nutzt ein eigenes Zertifikat, dem der Client nicht vertraut. Zertifikat aus der Firmen-CA verteilen.', 'RDP uses its own certificate the client doesn’t trust. Deploy a certificate from the company CA.'],
    ['Hyper-V: Eine VM lässt sich nicht starten, „Nicht genügend Arbeitsspeicher“.', 'Hyper-V: a VM won’t start, “Not enough memory”.',
      ['Zu wenig RAM auf dem Host', 'Not enough RAM on the host'], ['VM-Datei defekt', 'VM file corrupt'], ['Lizenz', 'License'],
      'Der Host kann den zugewiesenen Startspeicher nicht bereitstellen. Andere VMs verkleinern oder RAM erweitern.', 'The host can’t provide the assigned startup memory. Shrink other VMs or add RAM.'],
    ['Datenträger des Hyper-V-Hosts läuft voll. Im VM-Ordner liegen viele .avhdx-Dateien.', 'The Hyper-V host disk is filling up. The VM folder holds many .avhdx files.',
      ['Alte Prüfpunkte nicht entfernt', 'Old checkpoints not removed'], ['Logdateien', 'Log files'], ['Papierkorb voll', 'Recycle bin full'],
      'Jeder Prüfpunkt schreibt in eine .avhdx. Bricht das Backup ab, bleiben sie stehen und wachsen. Prüfpunkte zusammenführen.', 'Each checkpoint writes to an .avhdx. If the backup aborts they stay and grow. Merge the checkpoints.'],
    ['Nach dem Neustart startet der Dienst der Warenwirtschaft nicht: „Anmeldefehler“.', 'After restart the ERP service won’t start: “logon failure”.',
      ['Dienstkonto-Kennwort abgelaufen', 'Service account password expired'], ['Datenbank voll', 'Database full'], ['Lizenz', 'License'],
      'Dienstkonten mit Ablauf-Kennwort fallen beim nächsten Start um. Für sie „Kennwort läuft nie ab“ oder gMSA nutzen.', 'Service accounts with expiring passwords fail at the next start. Use “never expires” or a gMSA.'],
    ['Der Server war heute Nacht um 3 Uhr kurz weg. In der Ereignisanzeige steht ein geplanter Neustart.', 'The server was down briefly at 3 a.m. Event Viewer shows a planned restart.',
      ['Automatischer Update-Neustart', 'Automatic update restart'], ['Stromausfall', 'Power outage'], ['Hackerangriff', 'Hacker attack'],
      'Windows Update startet bei Standardeinstellung selbst neu. Für Server Wartungsfenster festlegen.', 'Windows Update restarts on its own by default. Define maintenance windows for servers.'],
    ['Sicherung auf USB-Platte geht seit dem Wechsel auf die zweite Platte nicht mehr: „Ziel nicht gefunden“.', 'Backup to USB disk fails since swapping to the second disk: “target not found”.',
      ['Anderer Laufwerksbuchstabe', 'Different drive letter'], ['USB defekt', 'USB broken'], ['Backup-Lizenz', 'Backup license'],
      'Die zweite Platte bekommt einen anderen Buchstaben oder ist nicht im Job hinterlegt. Beide Platten im Job eintragen.', 'The second disk gets another letter or isn’t in the job. Add both disks to the job.'],
    ['Der Server piept, die Management-Konsole meldet „Logical drive degraded“.', 'The server beeps, the management console reports “Logical drive degraded”.',
      ['Festplatte im RAID ausgefallen', 'Disk in the RAID failed'], ['Lüfter defekt', 'Fan broken'], ['Windows-Update', 'Windows Update'],
      'Das RAID läuft ohne Redundanz weiter. Platte zügig tauschen, bis dahin ist das Backup besonders wichtig.', 'The RAID runs without redundancy. Replace the disk soon, the backup matters even more until then.'],
    ['Beim Stromausfall gestern ist der Server einfach ausgegangen, obwohl eine USV dranhängt.', 'During yesterday’s power cut the server simply died although a UPS is attached.',
      ['USV ohne Abschalt-Software', 'UPS without shutdown software'], ['Netzteil defekt', 'PSU broken'], ['Windows-Fehler', 'Windows bug'],
      'Ohne USB/Netzwerk-Agent weiß der Server nichts vom Akku. Er läuft, bis die USV leer ist, und fällt hart aus.', 'Without a USB/network agent the server knows nothing about the battery. It runs until the UPS is empty and crashes.'],
    ['Nach dem Fileserver-Umzug landen manche Benutzer über \\\\firma\\daten noch auf dem alten Server.', 'After the file server move some users still land on the old server via \\\\company\\data.',
      ['DFS-Ziel noch aktiv', 'DFS target still enabled'], ['DNS-Cache', 'DNS cache'], ['Kabel', 'Cable'],
      'Im DFS-Namespace ist das alte Ordnerziel noch eingetragen. Deaktivieren, Clients nehmen dann das neue.', 'The old folder target is still in the DFS namespace. Disable it so clients use the new one.'],
    ['Benutzer sehen auf dem Laufwerk alle Abteilungsordner, auch die, die sie nicht öffnen dürfen.', 'Users see all department folders on the drive, including those they can’t open.',
      ['Zugriffsbasierte Aufzählung aus', 'Access-based enumeration off'], ['NTFS defekt', 'NTFS corrupt'], ['Zu viele Rechte', 'Too many rights'],
      'Mit ABE an der Freigabe zeigt der Server nur Ordner, auf die der Benutzer Rechte hat.', 'With ABE on the share the server only shows folders the user has rights to.'],
    ['Beim Kopieren in die Projektablage: „Der Dateiname ist zu lang“.', 'Copying into the project folder: “The file name is too long”.',
      ['Pfad über 260 Zeichen', 'Path over 260 characters'], ['Datei zu groß', 'File too large'], ['Kontingent', 'Quota'],
      'Tiefe Ordner mit langen Namen sprengen die klassische Grenze. Struktur kürzen oder tiefer freigeben.', 'Deep folders with long names exceed the classic limit. Shorten the structure or share deeper.'],
    ['SQL-Server-VM ist ständig bei 95 % RAM. Andere Dienste darauf werden langsam.', 'SQL Server VM is constantly at 95% RAM. Other services on it get slow.',
      ['SQL-Maximalspeicher nicht gesetzt', 'SQL max memory not set'], ['Speicherleck in Windows', 'Windows memory leak'], ['Virus', 'Virus'],
      'SQL Server nimmt sich standardmäßig fast allen RAM als Cache. „Max. Serverarbeitsspeicher“ begrenzen.', 'SQL Server takes almost all RAM as cache by default. Limit “max server memory”.'],
    ['Der alte Windows Server 2012 R2 bekommt keine Sicherheitsupdates mehr.', 'The old Windows Server 2012 R2 no longer gets security updates.',
      ['Support ist beendet', 'Support has ended'], ['WSUS defekt', 'WSUS broken'], ['Lizenz abgelaufen', 'License expired'],
      'Seit Oktober 2023 ist 2012 R2 ohne Support. Migration planen, Updates gibt es nur noch gegen Aufpreis (ESU).', 'Since October 2023 2012 R2 is unsupported. Plan a migration, updates only via paid ESU.'],
    ['Nach jedem Neustart läuft der Lizenzserver der CAD-Software nicht, manuell starten geht.', 'After every restart the CAD license server isn’t running, starting it manually works.',
      ['Starttyp steht auf Manuell', 'Startup type is Manual'], ['Lizenz abgelaufen', 'License expired'], ['Firewall', 'Firewall'],
      'Ein Dienst startet nur mit Starttyp „Automatisch“ beim Booten. Ggf. „Verzögert“, wenn er Netz braucht.', 'A service only starts at boot with startup type “Automatic”. Use “Delayed” if it needs the network.'],
    ['VM auf einen anderen Hyper-V-Host verschoben. Sie startet, hat aber kein Netzwerk.', 'VM moved to another Hyper-V host. It starts but has no network.',
      ['Virtueller Switch heißt anders', 'Virtual switch name differs'], ['IP doppelt', 'Duplicate IP'], ['Lizenz', 'License'],
      'Die VM-Netzwerkkarte hängt am Switch-Namen. Gibt es den auf dem neuen Host nicht, ist sie getrennt.', 'The VM NIC is bound to a switch name. If it doesn’t exist on the new host, it’s disconnected.'],
    ['Ein Server fährt jede Stunde von selbst herunter. Unten rechts steht „Windows-Lizenz ist abgelaufen“.', 'A server shuts down by itself every hour. Bottom right: “Windows license has expired”.',
      ['Testversion abgelaufen', 'Evaluation has expired'], ['Überhitzung', 'Overheating'], ['Virus', 'Virus'],
      'Evaluierungsversionen fahren nach Ablauf stündlich herunter. Per DISM auf eine Vollversion umstellen.', 'Evaluation editions shut down hourly after expiry. Convert to a full edition with DISM.'],
    ['Ordner mit dem Explorer auf den neuen Server kopiert. Jetzt hat jeder Zugriff auf alles.', 'Folders copied to the new server with Explorer. Now everyone has access to everything.',
      ['Rechte beim Kopieren verloren', 'Permissions lost while copying'], ['Freigabe falsch', 'Share wrong'], ['Virus', 'Virus'],
      'Der Explorer übernimmt die Rechte des Zielordners. Mit robocopy /COPYALL bzw. /SEC bleiben die NTFS-Rechte erhalten.', 'Explorer applies the target folder’s rights. robocopy /COPYALL or /SEC keeps the NTFS permissions.'],
    ['Neue virtuelle Festplatte hinzugefügt. In der Datenträgerverwaltung steht sie als „Offline“.', 'New virtual disk added. Disk Management shows it as “Offline”.',
      ['SAN-Richtlinie: offline', 'SAN policy: offline'], ['Festplatte defekt', 'Disk broken'], ['Lizenz fehlt', 'License missing'],
      'Server setzen neue Datenträger oft per SAN-Richtlinie offline. Online schalten, initialisieren, formatieren.', 'Servers often set new disks offline by SAN policy. Bring online, initialize, format.'],
    /* Microsoft 365, Exchange, Outlook, Teams, E-Mail */
    ['Outlook-Einrichtung mit der Firmenadresse findet den Server nicht. Webmail funktioniert.', 'Outlook setup with the company address can’t find the server. Webmail works.',
      ['Autodiscover-Eintrag fehlt', 'Autodiscover record missing'], ['Postfach voll', 'Mailbox full'], ['Lizenz fehlt', 'License missing'],
      'Outlook sucht seine Einstellungen über autodiscover.firma.de. Ohne den CNAME im DNS scheitert die Einrichtung.', 'Outlook finds its settings via autodiscover.company.com. Without that CNAME setup fails.'],
    ['Benutzer kann keine E-Mails mehr senden, oben steht ein roter Balken. Mails kommen auch nicht mehr an.', 'User can’t send emails, there’s a red bar at the top. Mail no longer arrives either.',
      ['Postfach ist voll', 'Mailbox is full'], ['Kennwort abgelaufen', 'Password expired'], ['Spamfilter', 'Spam filter'],
      'Ab dem Grenzwert sperrt Exchange erst Senden, dann Empfangen. Archivieren, Postfach aufräumen oder Archiv aktivieren.', 'At the quota Exchange blocks sending, then receiving. Archive, clean up or enable the archive mailbox.'],
    ['Mitarbeiterin hat Vollzugriff auf info@, kann aber nicht als info@ senden.', 'Employee has full access to info@ but can’t send as info@.',
      ['Recht „Senden als“ fehlt', '“Send as” permission missing'], ['Postfach voll', 'Mailbox full'], ['DNS', 'DNS'],
      'Vollzugriff erlaubt nur Lesen. Zum Absenden braucht es zusätzlich „Senden als“ oder „Senden im Auftrag“.', 'Full access only allows reading. Sending also needs “Send as” or “Send on behalf”.'],
    ['Benutzer wurde für ein freigegebenes Postfach berechtigt, in Outlook taucht es nicht auf.', 'User was given rights to a shared mailbox, it doesn’t appear in Outlook.',
      ['Automapping braucht Zeit', 'Automapping takes time'], ['Lizenz fehlt', 'License missing'], ['Postfach gelöscht', 'Mailbox deleted'],
      'Outlook bindet neue Postfächer per Automapping erst nach einiger Zeit ein. Outlook später neu starten.', 'Outlook adds new mailboxes via automapping only after a while. Restart Outlook later.'],
    ['Outlook-Suche findet Mails der letzten Wochen nicht. Ältere werden gefunden.', 'Outlook search doesn’t find mails from recent weeks. Older ones are found.',
      ['Suchindex unvollständig', 'Search index incomplete'], ['Postfach voll', 'Mailbox full'], ['Mails gelöscht', 'Mails deleted'],
      'Die Windows-Suche indiziert lokal und hängt oft hinterher. Index neu aufbauen lassen.', 'Windows Search indexes locally and often lags. Rebuild the index.'],
    ['Seit der Kennwortänderung fragt Outlook ständig nach Anmeldedaten und bleibt auf „Verbindung wird hergestellt“.', 'Since the password change Outlook keeps asking for credentials and stays on “Trying to connect”.',
      ['Alte Anmeldedaten gespeichert', 'Old credentials stored'], ['Postfach gesperrt', 'Mailbox locked'], ['DNS falsch', 'Wrong DNS'],
      'In der Anmeldeinformationsverwaltung bzw. im Konto liegt das alte Kennwort. Entfernen und neu anmelden.', 'Credential Manager or the account still holds the old password. Remove it and sign in again.'],
    ['Neues Team ist für den Benutzer im Browser sichtbar, in der Teams-App nicht.', 'New team is visible to the user in the browser, not in the Teams app.',
      ['Teams-Cache veraltet', 'Teams cache stale'], ['Lizenz fehlt', 'License missing'], ['Team gelöscht', 'Team deleted'],
      'Die App zeigt einen alten Stand. Teams beenden, Cache leeren oder abmelden und neu anmelden.', 'The app shows a stale state. Quit Teams, clear the cache or sign out and in.'],
    ['Ein Kunde kann einen geteilten OneDrive-Link nicht öffnen: „Freigabe für externe Benutzer nicht möglich“.', 'A customer can’t open a shared OneDrive link: “Sharing with external users isn’t possible”.',
      ['Externe Freigabe deaktiviert', 'External sharing disabled'], ['Datei zu groß', 'File too large'], ['Kunde ohne Lizenz', 'Customer has no license'],
      'Im SharePoint-/OneDrive-Admin ist externes Teilen aus oder eingeschränkt. Gewollte Einstellung prüfen.', 'External sharing is off or restricted in the SharePoint/OneDrive admin. Check the intended setting.'],
    ['Automatische Weiterleitung an die private Adresse kommt nie an, der Benutzer bekommt eine Unzustellbarkeitsmeldung.', 'Auto-forward to a private address never arrives, the user gets a bounce.',
      ['Externe Weiterleitung blockiert', 'External forwarding blocked'], ['Postfach voll', 'Mailbox full'], ['MX falsch', 'Wrong MX'],
      'Microsoft 365 blockt automatische Weiterleitung nach außen standardmäßig, gegen Datenabfluss.', 'Microsoft 365 blocks automatic external forwarding by default, to prevent data leaks.'],
    ['Mail mit Bauplänen kommt zurück: „Nachricht zu groß“.', 'Mail with building plans bounces: “Message too large”.',
      ['Anhang über der Größengrenze', 'Attachment over size limit'], ['Postfach voll', 'Mailbox full'], ['Virus erkannt', 'Virus detected'],
      'Viele Mailsysteme nehmen nur 10–35 MB an. Große Dateien als Link (OneDrive/SharePoint) teilen.', 'Many mail systems only accept 10–35 MB. Share large files as a link (OneDrive/SharePoint).'],
    ['Scannen an E-Mail über smtp.office365.com geht seit gestern nicht mehr. Am Kopierer wurde nichts geändert.', 'Scan to email via smtp.office365.com stopped working yesterday. Nothing changed on the copier.',
      ['SMTP-Basic-Auth abgeschaltet', 'SMTP basic auth turned off'], ['Toner leer', 'Toner empty'], ['DNS', 'DNS'],
      'Microsoft schaltet einfache Anmeldung für SMTP ab. Lösung: SMTP-Relay per Connector oder ein Gerät mit OAuth.', 'Microsoft is turning off basic auth for SMTP. Fix: SMTP relay via connector or a device with OAuth.'],
    ['Mitarbeiter ist ausgeschieden. Sein Postfach soll ohne Lizenzkosten für Kollegen erreichbar bleiben.', 'Employee has left. Their mailbox should stay accessible to colleagues without license cost.',
      ['In freigegebenes Postfach wandeln', 'Convert to shared mailbox'], ['Als PST exportieren', 'Export as PST'], ['Lizenz behalten', 'Keep the license'],
      'Freigegebene Postfächer bis 50 GB brauchen keine Lizenz. Danach die Lizenz entfernen und Kollegen berechtigen.', 'Shared mailboxes up to 50 GB need no license. Then remove the license and grant colleagues access.'],
    ['Abwesenheitsnotiz ist an. Kollegen bekommen sie, externe Kunden nicht.', 'Out of office is on. Colleagues get it, external customers don’t.',
      ['Nur interne Antwort aktiv', 'Only internal reply enabled'], ['Spamfilter', 'Spam filter'], ['Postfach voll', 'Mailbox full'],
      'Für externe Absender gibt es einen eigenen Reiter. Dort „Außerhalb meiner Organisation“ aktivieren.', 'External senders have their own tab. Enable “Outside my organization” there.'],
    ['Assistenz sieht im Kalender des Chefs nur „Gebucht“, keine Termindetails.', 'Assistant only sees “Busy” in the boss’s calendar, no details.',
      ['Kalenderrecht nur Frei/Gebucht', 'Calendar right only free/busy'], ['Outlook veraltet', 'Outlook outdated'], ['Lizenz', 'License'],
      'Standard ist nur Verfügbarkeit. Für Details mindestens „Prüfer“ bzw. „Kann alle Details anzeigen“ vergeben.', 'Default is availability only. For details grant at least “Reviewer” or “Can view all details”.'],
    ['Ein Kunde hat eine Rechnung geschickt, sie ist weder im Posteingang noch im Junk-Ordner.', 'A customer sent an invoice, it’s neither in the inbox nor in the junk folder.',
      ['Mail liegt in der Quarantäne', 'Mail is in quarantine'], ['Postfach voll', 'Mailbox full'], ['Kunde lügt', 'Customer is lying'],
      'Verdächtige Mails hält der Filter zentral zurück. Im Quarantäne-Bereich (Defender/Firewall) prüfen und freigeben.', 'Suspicious mail is held centrally by the filter. Check and release it in quarantine (Defender/firewall).'],
    ['Word und Excel zeigen „Nicht lizenziertes Produkt“. Lizenz ist im Admin-Center zugewiesen.', 'Word and Excel show “Unlicensed product”. A license is assigned in the admin center.',
      ['Mit privatem Konto angemeldet', 'Signed in with a private account'], ['Office defekt', 'Office broken'], ['Lizenz abgelaufen', 'License expired'],
      'Office prüft das angemeldete Konto. Ist oben rechts ein privates Konto aktiv, findet es keine Firmenlizenz.', 'Office checks the signed-in account. If a private account is active, it finds no company license.'],
    ['Externe Teilnehmer hängen im Teams-Meeting minutenlang im Wartebereich.', 'External participants wait for minutes in the Teams meeting lobby.',
      ['Lobby-Einstellung der Besprechung', 'Meeting lobby setting'], ['Bandbreite', 'Bandwidth'], ['Teams-Lizenz', 'Teams license'],
      'In den Besprechungsoptionen legt man fest, wer die Lobby umgehen darf. Jemand muss sie sonst hereinlassen.', 'Meeting options decide who may bypass the lobby. Otherwise someone must admit them.'],
    ['Outlook stürzt beim Start sofort ab, mit outlook.exe /safe läuft es.', 'Outlook crashes right at startup, with outlook.exe /safe it runs.',
      ['Ein Add-In stört', 'An add-in interferes'], ['Postfach voll', 'Mailbox full'], ['Lizenz fehlt', 'License missing'],
      'Im abgesicherten Modus sind Add-Ins aus. Einzeln deaktivieren, bis der Übeltäter gefunden ist.', 'Safe mode disables add-ins. Turn them off one by one until the culprit is found.'],
    ['Mails aus dem Postfach info@ landen in „Gesendet“ des eigenen Postfachs statt bei info@.', 'Mails sent from info@ end up in the user’s own Sent items instead of info@.',
      ['Gesendet-Kopie nicht aktiviert', 'Sent copy not enabled'], ['Rechte fehlen', 'Rights missing'], ['Outlook defekt', 'Outlook broken'],
      'Für freigegebene Postfächer gibt es eine Einstellung, gesendete Elemente auch dort abzulegen.', 'Shared mailboxes have a setting to also store sent items there.'],
    ['Nach der Postfach-Migration kommen Mails an Kollegen zurück: „IMCEAEX…“ unbekannt.', 'After the mailbox migration mails to colleagues bounce: “IMCEAEX…” unknown.',
      ['Alter AutoVervollständigen-Eintrag', 'Stale autocomplete entry'], ['DNS falsch', 'Wrong DNS'], ['Postfach voll', 'Mailbox full'],
      'Outlook schlägt die alte interne Adresse vor. Vorschlag mit dem X löschen und Adresse neu wählen.', 'Outlook suggests the old internal address. Delete the suggestion with X and pick the address again.'],
    ['Benutzer hat einen Outlook-Ordner mit Projektmails gelöscht und den Papierkorb geleert.', 'User deleted an Outlook folder with project mail and emptied the deleted items.',
      ['Gelöschte Elemente zurückholen', '“Recover deleted items”'], ['Für immer verloren', 'Lost forever'], ['Neues Postfach', 'New mailbox'],
      'Exchange hält endgültig Gelöschtes standardmäßig 14 Tage zum Wiederherstellen vor.', 'Exchange keeps permanently deleted items for 14 days by default for recovery.'],
    ['Neues Handy, alte Authenticator-App weg. Die Anmeldung bei Microsoft 365 hängt an der Bestätigung.', 'New phone, old Authenticator app gone. Microsoft 365 sign-in is stuck at the approval.',
      ['MFA-Methode neu registrieren', 'Register MFA method again'], ['Kennwort ändern', 'Change password'], ['Lizenz neu', 'New license'],
      'Ein Admin setzt die MFA-Registrierung zurück, danach richtet der Benutzer die App auf dem neuen Handy ein.', 'An admin resets the MFA registration, then the user sets up the app on the new phone.'],
    ['Ein Kunde schreibt an vertrieb@ (Verteilerliste) und bekommt eine Fehlermeldung zurück.', 'A customer writes to sales@ (distribution list) and gets an error back.',
      ['Verteiler nur intern erlaubt', 'List only accepts internal'], ['Postfach voll', 'Mailbox full'], ['MX falsch', 'Wrong MX'],
      'Verteilerlisten lehnen externe Absender standardmäßig ab. Option „Externe Absender zulassen“ setzen.', 'Distribution lists reject external senders by default. Allow external senders.'],
    ['Außendienstler im Ausland kommt nicht mehr in Microsoft 365, Kennwort und MFA stimmen.', 'Field rep abroad can’t get into Microsoft 365, password and MFA are correct.',
      ['Bedingter Zugriff blockt das Land', 'Conditional Access blocks country'], ['Lizenz abgelaufen', 'License expired'], ['Roaming aus', 'Roaming off'],
      'Eine Richtlinie für bedingten Zugriff erlaubt nur bestimmte Länder. Anmeldeprotokoll in Entra zeigt den Grund.', 'A Conditional Access policy only allows certain countries. The Entra sign-in log shows why.'],
    ['Mails vom eigenen Mailserver an mehrere Empfänger kommen zurück: „550 5.7.1 listed in Spamhaus“.', 'Mail from your own mail server bounces at several recipients: “550 5.7.1 listed in Spamhaus”.',
      ['Öffentliche IP auf Sperrliste', 'Public IP on a blocklist'], ['Postfach voll', 'Mailbox full'], ['Zertifikat', 'Certificate'],
      'Die IP wurde als Spamquelle gelistet, oft wegen gehacktem Konto oder Gerät. Ursache beheben, dann Delisting beantragen.', 'The IP was listed as a spam source, often due to a hacked account or device. Fix it, then request delisting.'],
    /* Schicht 5–7: Sicherheit, Firewall, VPN, Web */
    ['Kunden melden: Beim Aufruf der Firmenwebseite erscheint „Ihre Verbindung ist nicht privat“. Gestern ging es noch.', 'Customers report: the company website shows “Your connection is not private”. Yesterday it worked.',
      ['Zertifikat abgelaufen', 'Certificate expired'], ['Webserver gehackt', 'Web server hacked'], ['DNS falsch', 'Wrong DNS'],
      'Zertifikate haben ein Ablaufdatum. Automatische Verlängerung einrichten und überwachen.', 'Certificates expire. Set up automatic renewal and monitor it.'],
    ['Das NAS ist unter https://nas.firma.local sauber, unter https://192.168.1.20 kommt eine Zertifikatswarnung.', 'The NAS is fine at https://nas.company.local, at https://192.168.1.20 a certificate warning appears.',
      ['Name passt nicht zum Zertifikat', 'Name doesn’t match certificate'], ['Zertifikat abgelaufen', 'Certificate expired'], ['NAS defekt', 'NAS broken'],
      'Ein Zertifikat gilt nur für die eingetragenen Namen. Die IP steht nicht drin, also warnt der Browser.', 'A certificate is only valid for its listed names. The IP isn’t listed, so the browser warns.'],
    ['Laptop hat im Homeoffice kein Internet, im Büro schon. Andere Geräte zu Hause funktionieren.', 'Laptop has no internet at home, but works in the office. Other home devices work.',
      ['Proxy fest eingetragen', 'Proxy set manually'], ['WLAN-Treiber', 'Wi-Fi driver'], ['Lizenz', 'License'],
      'Ein fest eingetragener Firmenproxy ist von zu Hause nicht erreichbar. PAC-Datei oder automatische Erkennung nutzen.', 'A manually set company proxy isn’t reachable from home. Use a PAC file or automatic detection.'],
    ['Nach dem Update der Webanwendung sieht ein Benutzer noch die alte Oberfläche, alle anderen die neue.', 'After the web app update one user still sees the old interface, everyone else the new one.',
      ['Browser-Cache', 'Browser cache'], ['DNS falsch', 'Wrong DNS'], ['Server defekt', 'Server broken'],
      'Der Browser nutzt zwischengespeicherte Skripte. Strg+F5 oder Cache leeren hilft.', 'The browser uses cached scripts. Ctrl+F5 or clearing the cache helps.'],
    ['Excel-Datei aus einer Kunden-Mail: Makros sind gesperrt, „Microsoft hat Makros blockiert“.', 'Excel file from a customer mail: macros are blocked, “Microsoft has blocked macros”.',
      ['Datei aus dem Internet markiert', 'File marked as from internet'], ['Excel defekt', 'Excel broken'], ['Lizenz fehlt', 'License missing'],
      'Dateien aus dem Internet tragen eine Markierung. Office blockt dort Makros, aus gutem Grund. Nur vertrauenswürdige freigeben.', 'Files from the internet carry a mark. Office blocks macros there for good reason. Unblock only trusted ones.'],
    ['Externe Kontakte bekommen von einer Mitarbeiterin seltsame Mails mit Link zu „Dokument ansehen“. Sie hat nichts geschickt.', 'External contacts receive odd mails with a “view document” link from an employee. She sent nothing.',
      ['Konto kompromittiert', 'Account compromised'], ['Spamfilter falsch', 'Spam filter wrong'], ['DNS', 'DNS'],
      'Typisch nach Phishing: Kennwort ändern, Sitzungen widerrufen, MFA prüfen und nach Weiterleitungsregeln suchen.', 'Typical after phishing: change password, revoke sessions, check MFA and look for forwarding rules.'],
    ['Buchhaltung bekommt eine Mail vom „Chef“: dringende Überweisung, bitte diskret. Absender: chef.firma@gmail.com.', 'Accounting gets a mail from the “boss”: urgent transfer, keep it quiet. Sender: boss.company@gmail.com.',
      ['CEO-Betrug (gefälschter Absender)', 'CEO fraud (spoofed sender)'], ['Chef im Urlaub', 'Boss on vacation'], ['Spamfilter defekt', 'Spam filter broken'],
      'Klassischer Betrug. Nicht antworten, telefonisch beim echten Chef rückfragen und der IT melden.', 'Classic fraud. Don’t reply, call the real boss and report it to IT.'],
    ['Web-Oberfläche einer alten USV lässt sich nicht öffnen: „ERR_SSL_VERSION_OR_CIPHER_MISMATCH“.', 'The web UI of an old UPS won’t open: “ERR_SSL_VERSION_OR_CIPHER_MISMATCH”.',
      ['Veraltetes TLS am Gerät', 'Outdated TLS on the device'], ['Kabel', 'Cable'], ['DNS', 'DNS'],
      'Das Gerät kann nur TLS 1.0/1.1, moderne Browser lehnen das ab. Firmware aktualisieren oder Gerät ersetzen.', 'The device only supports TLS 1.0/1.1, modern browsers refuse it. Update firmware or replace the device.'],
    ['Seit heute Morgen kommt kein Mitarbeiter mehr ins VPN. Gestern ging es bei allen.', 'Since this morning no employee can connect to the VPN. Yesterday it worked for everyone.',
      ['VPN-Zertifikat abgelaufen', 'VPN certificate expired'], ['Internet zu langsam', 'Internet too slow'], ['Lizenz', 'License'],
      'Fällt ein Dienst für alle gleichzeitig aus, ist oft ein Server- oder CA-Zertifikat abgelaufen.', 'When a service fails for everyone at once, a server or CA certificate has often expired.'],
    ['PC neu installiert. Am LAN-Port bekommt er nur das Gäste-VLAN, vorher war er im Büronetz.', 'PC reinstalled. On the LAN port it only gets the guest VLAN, before it was in the office network.',
      ['Gerätezertifikat fehlt (802.1X)', 'Device cert missing (802.1X)'], ['Kabel defekt', 'Cable broken'], ['DHCP voll', 'DHCP full'],
      'Bei 802.1X weist sich der PC per Zertifikat aus. Ohne, landet er im Fallback-VLAN. Neu ausrollen.', 'With 802.1X the PC authenticates by certificate. Without one it lands in the fallback VLAN. Re-enroll.'],
    ['WLAN-Kennwort wurde geändert. Laptops verbinden sich nicht, ohne nach dem neuen Kennwort zu fragen.', 'Wi-Fi password was changed. Laptops fail to connect without asking for the new one.',
      ['Altes WLAN-Profil gespeichert', 'Old Wi-Fi profile stored'], ['Access Point defekt', 'AP broken'], ['DHCP', 'DHCP'],
      'Windows versucht es mit dem gespeicherten Kennwort. Netzwerk „vergessen“ und neu verbinden.', 'Windows tries with the saved password. “Forget” the network and connect again.'],
    ['Im Hotel ist der Laptop im WLAN, das VPN baut sich aber nicht auf.', 'In the hotel the laptop is on the Wi-Fi but the VPN won’t connect.',
      ['Hotel-Anmeldeseite offen', 'Hotel login page pending'], ['VPN-Lizenz', 'VPN license'], ['Akku leer', 'Battery low'],
      'Erst nach Bestätigung der Captive-Portal-Seite im Browser ist das Internet frei.', 'Only after accepting the captive portal page in the browser is internet open.'],
    ['Neue Firewall-Regel „Erlauben“ für den Server angelegt, der Verkehr wird trotzdem geblockt.', 'New firewall “allow” rule for the server created, traffic is still blocked.',
      ['Regel steht unter einer Sperre', 'Rule is below a deny'], ['Server aus', 'Server off'], ['Kabel', 'Cable'],
      'Firewalls prüfen Regeln von oben nach unten, die erste passende gewinnt. Regel nach oben schieben.', 'Firewalls check rules top-down, the first match wins. Move the rule up.'],
    ['Auf dem Laufwerk heißen plötzlich alle Dateien „*.locked“, eine Datei „LIES_MICH.txt“ liegt im Ordner.', 'On the drive all files are suddenly named “*.locked”, a “README.txt” lies in the folder.',
      ['Ransomware: sofort vom Netz', 'Ransomware: disconnect now'], ['Dateisystem defekt', 'File system broken'], ['Update', 'Update'],
      'Betroffene Geräte sofort trennen (nicht ausschalten), IT/Notfallplan auslösen, Backups schützen.', 'Disconnect affected devices immediately (don’t power off), trigger the incident plan, protect backups.'],
    ['Seit die Firewall HTTPS prüft, melden Teams und Software-Updates Zertifikatsfehler.', 'Since the firewall inspects HTTPS, Teams and software updates report certificate errors.',
      ['Firewall-CA nicht verteilt', 'Firewall CA not deployed'], ['Internet langsam', 'Slow internet'], ['Lizenz', 'License'],
      'Die Firewall stellt eigene Zertifikate aus. Ohne ihre CA im Zertifikatsspeicher vertrauen Clients ihr nicht.', 'The firewall issues its own certificates. Without its CA in the store clients don’t trust them.'],
    ['Anmeldung am Lieferantenportal klappt in Edge, in Chrome springt es immer zur Login-Seite zurück.', 'Login to the supplier portal works in Edge, in Chrome it keeps jumping back to the login page.',
      ['Cookies blockiert', 'Cookies blocked'], ['Kennwort falsch', 'Wrong password'], ['Portal defekt', 'Portal broken'],
      'Ohne Cookie bleibt die Sitzung nicht bestehen. Cookies für die Seite erlauben.', 'Without a cookie the session doesn’t persist. Allow cookies for the site.'],
    ['Im Online-Banking passiert beim Klick auf „Auftrag freigeben“ nichts.', 'In online banking nothing happens when clicking “approve order”.',
      ['Popup-Blocker', 'Pop-up blocker'], ['Bank offline', 'Bank offline'], ['Maus defekt', 'Mouse broken'],
      'Das Fenster wird als Popup geblockt, rechts in der Adressleiste erscheint ein Symbol. Für die Seite erlauben.', 'The window is blocked as a pop-up, an icon appears in the address bar. Allow it for the site.'],
    ['Alte Zeiterfassung im Browser zeigt nur „Diese Seite benötigt Internet Explorer“.', 'Old time-tracking web app only shows “This page requires Internet Explorer”.',
      ['Edge im IE-Modus öffnen', 'Open in Edge IE mode'], ['IE neu installieren', 'Reinstall IE'], ['Chrome nutzen', 'Use Chrome'],
      'IE ist abgeschaltet. Edge kann solche Seiten per Liste im IE-Modus öffnen, bis die Software ersetzt ist.', 'IE is retired. Edge can open such pages in IE mode via a site list until the software is replaced.'],
    ['https://firma.de lädt, http://firma.de läuft in einen Timeout.', 'https://company.com loads, http://company.com times out.',
      ['Port 80 zu, Weiterleitung fehlt', 'Port 80 closed, no redirect'], ['Zertifikat', 'Certificate'], ['DNS', 'DNS'],
      'Ohne offenen Port 80 und Umleitung auf HTTPS scheitern alte Links und Eingaben ohne https://.', 'Without port 80 open and a redirect to HTTPS old links and typed URLs fail.'],
    ['Anrufer vom „Microsoft-Support“ bittet eine Kollegin, TeamViewer zu installieren, ihr PC sei infiziert.', 'Caller from “Microsoft support” asks a colleague to install TeamViewer, her PC is infected.',
      ['Betrugsanruf', 'Scam call'], ['Echter Support', 'Real support'], ['Lizenzprüfung', 'License check'],
      'Microsoft ruft nie unaufgefordert an. Auflegen, keinen Fernzugriff geben, IT informieren.', 'Microsoft never calls unsolicited. Hang up, give no remote access, inform IT.'],
    ['Nextcloud hinter dem Reverse Proxy zeigt „502 Bad Gateway“.', 'Nextcloud behind the reverse proxy shows “502 Bad Gateway”.',
      ['Backend-Dienst nicht erreichbar', 'Backend service unreachable'], ['Zertifikat', 'Certificate'], ['Browser-Cache', 'Browser cache'],
      'Der Proxy läuft, bekommt aber vom Ziel keine Antwort: Container/Dienst aus oder falscher Port/IP.', 'The proxy runs but gets no answer from the target: container/service down or wrong port/IP.'],
    ['Die 6-stelligen Codes aus der Authenticator-App werden immer abgelehnt.', 'The 6-digit codes from the authenticator app are always rejected.',
      ['Uhrzeit am Handy falsch', 'Phone clock is wrong'], ['Konto gesperrt', 'Account locked'], ['Kein Netz', 'No signal'],
      'TOTP-Codes hängen an der Uhrzeit. Am Handy „Zeit automatisch“ einschalten.', 'TOTP codes depend on the time. Enable “automatic time” on the phone.'],
    ['VPN ist verbunden, aber kein Server im Büronetz 10.10.0.0/16 antwortet. Internet geht.', 'VPN is connected but no server in office network 10.10.0.0/16 responds. Internet works.',
      ['Route ins Firmennetz fehlt', 'Route to company network missing'], ['Server aus', 'Server off'], ['WLAN schwach', 'Weak Wi-Fi'],
      'Beim Split-Tunnel muss das Firmennetz als Route übergeben werden, sonst geht der Verkehr ins Internet.', 'With split tunnel the company network must be pushed as a route, otherwise traffic goes to the internet.'],
    ['Standortkopplung per IPsec: Phase 1 steht, Phase 2 kommt nicht hoch.', 'Site-to-site IPsec: phase 1 is up, phase 2 won’t come up.',
      ['Netze in Phase 2 passen nicht', 'Phase 2 networks don’t match'], ['Kennwort falsch', 'Wrong password'], ['Kabel', 'Cable'],
      'Phase 1 beweist, dass Schlüssel passen. In Phase 2 müssen lokale und entfernte Netze auf beiden Seiten spiegelgleich sein.', 'Phase 1 proves the keys match. In phase 2 local and remote networks must mirror each other on both sides.'],
    ['WLAN auf „nur WPA3“ umgestellt. Zwei ältere Scanner und ein Laptop finden keine Verbindung mehr.', 'Wi-Fi switched to “WPA3 only”. Two older scanners and a laptop can’t connect anymore.',
      ['Geräte können kein WPA3', 'Devices don’t support WPA3'], ['Kennwort falsch', 'Wrong password'], ['Kanal belegt', 'Channel busy'],
      'Ältere Geräte kennen nur WPA2. Übergangsmodus WPA2/WPA3 nutzen oder Geräte tauschen.', 'Older devices only know WPA2. Use WPA2/WPA3 transition mode or replace them.']
  ];
  var makeTicket = function (rnd, idx) {
    var i = idx != null && TICKETS[idx] ? idx : Math.floor(rnd() * TICKETS.length), t = TICKETS[i];
    var o = function (a) { return { de: a[0], en: a[1] }; };
    var q = build('t' + i, { de: 'Ticket {v}: Wo liegt die Ursache?', en: 'Ticket {v}: what is the cause?' },
      same('#' + (48200 + i * 37)), o(t[2]), [o(t[3]), o(t[4])], rnd);
    q.pre = { de: '„' + esc(t[0]) + '“', en: '“' + esc(t[1]) + '”' };
    q.why = { de: t[5], en: t[6] };
    return q;
  };

  var MAKERS = { binaer: makeBin, subnetz: makeSubnet, ports: makePort, firewall: makeFirewall, ticket: makeTicket };
  var make = function (mode, rnd) { return MAKERS[mode](rnd || Math.random); };
  // Punkte: richtig = 100 + 10 je volle übrige Sekunde, falsch oder Zeit abgelaufen = 0
  var points = function (right, left) { return right ? BASE + PER_SEC * Math.max(0, Math.floor(left)) : 0; };

  // Abstand zur Vorrunde (null, wenn es noch keine Vorrunde gibt)
  var delta = function (cur, prev) { return typeof prev === 'number' && isFinite(prev) ? cur - prev : null; };
  // Anteil am Rekord in Prozent für den Ring (0–100, ohne Rekord 0)
  var ringPct = function (cur, rec) { return rec > 0 ? Math.max(0, Math.min(100, Math.round(cur / rec * 100))) : 0; };
  // Bestenliste: höchstens 3 Punktestände, absteigend. Gibt die neue Liste und den Platz (1–3, sonst 0) zurück.
  var addScore = function (list, pts) {
    var top = (list || []).filter(function (x) { return typeof x === 'number' && isFinite(x); }).slice(0, 3);
    if (!(pts > 0)) return { top: top, place: 0 };
    var i = 0;
    while (i < top.length && top[i] >= pts) i++;
    if (i >= 3) return { top: top, place: 0 };
    top.splice(i, 0, pts);
    return { top: top.slice(0, 3), place: i + 1 };
  };

  // Rechenweg nach der Antwort (Binär und Subnetz): kurze Skizze, wie man auf die Lösung kommt.
  // Liefert HTML (zweisprachig über data-l) oder '' für Modi ohne Skizze.
  var sk2 = function (de, en) { return de === en ? de : '<span data-l="de">' + de + '</span><span data-l="en">' + en + '</span>'; };
  var sup = function (n) { return '2' + String(n).replace(/\d/g, function (d) { return '⁰¹²³⁴⁵⁶⁷⁸⁹'.charAt(+d); }); };
  var sketch = function (key) {
    var t = key.charAt(0), n = +key.slice(1), i, h = '';
    if (t === 'b') {
      var bits = '', vals = '', parts = [];
      for (i = 7; i >= 0; i--) {
        var on = (n >> i) & 1, w = 1 << i;
        bits += '<td class="' + (on ? 'on' : 'off') + '">' + on + '</td>';
        vals += '<td class="' + (on ? 'on' : 'off') + '">' + w + '</td>';
        if (on) parts.push(w);
      }
      return '<div class="kq-sk"><div class="sk-h"># ' + sk2('Rechenweg', 'How to') + '</div>' +
        '<table><tr><th>Bit</th>' + bits + '</tr><tr><th>' + sk2('Wert', 'Value') + '</th>' + vals + '</tr></table>' +
        '<div class="sk-r">' + sk2('Nur die Einsen zählen', 'Add the ones only') + ': ' + parts.join(' + ') + ' = <b>' + n + '</b></div></div>';
    }
    if (t === 'h' || t === 'p') {
      var hb = 32 - n, all = Math.pow(2, hb), hosts = all - 2;
      var steps = t === 'h'
        ? ['32 − ' + n + ' = ' + hb + ' ' + sk2('Host-Bits', 'host bits'), sup(hb) + ' = ' + all + ' ' + sk2('Adressen', 'addresses'),
           all + ' − 2 ' + sk2('(Netz + Broadcast)', '(network + broadcast)') + ' = <b>' + hosts + ' Hosts</b>']
        : [hosts + ' + 2 ' + sk2('(Netz + Broadcast)', '(network + broadcast)') + ' = ' + all, all + ' = ' + sup(hb) + ' → ' + hb + ' ' + sk2('Host-Bits', 'host bits'),
           '32 − ' + hb + ' = <b>/' + n + '</b>'];
      for (i = 0; i < steps.length; i++) h += '<li><i>' + (i + 1) + '</i>' + steps[i] + '</li>';
      return '<div class="kq-sk"><div class="sk-h"># ' + sk2('Rechenweg', 'How to') + '</div><ol>' + h + '</ol></div>';
    }
    if (t === 'm') {
      var oct = [], dec = [];
      for (var o = 0; o < 4; o++) {
        var ones = Math.max(0, Math.min(8, n - o * 8)), s8 = '', v = 0, add = [];
        for (i = 0; i < 8; i++) { s8 += i < ones ? '1' : '<u>0</u>'; if (i < ones) { v += 128 >> i; add.push(128 >> i); } }
        oct.push(s8); dec.push(v);
        if (ones > 1 && ones < 8) h = add.join(' + ') + ' = ' + v;
      }
      return '<div class="kq-sk"><div class="sk-h"># ' + sk2('Rechenweg', 'How to') + ': ' + n + ' ' + sk2('Einsen von links', 'ones from the left') + '</div>' +
        '<div class="sk-m">' + oct.join('.<wbr>') + '</div>' +
        (h ? '<div class="sk-r">' + sk2('Angebrochenes Oktett', 'Partial octet') + ': ' + h + '</div>' : '') +
        '<div class="sk-r">→ <b>' + dec.join('.') + '</b></div></div>';
    }
    return '';
  };

  var api = { ROUNDS: ROUNDS, SECONDS: SECONDS, PORTS: PORTS, TICKETS: TICKETS, fwHit: fwHit, MODES: Object.keys(MAKERS), make: make, points: points, delta: delta, ringPct: ringPct, addScore: addScore, maskOf: maskOf, hostsOf: hostsOf, sketch: sketch };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  global.NetQuiz = api;

  /* ======================= Oberfläche ======================= */
  var kt = document.querySelector('[data-quiz]');
  if (!kt) return;
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var bi = function (de, en) { return '<span data-l="de">' + de + '</span><span data-l="en">' + en + '</span>'; };
  var tx = function (o) { return o.de === o.en ? o.de : bi(o.de, o.en); };
  var NAMES = { binaer: 'binär', subnetz: 'subnetz', ports: 'ports', firewall: 'firewall', ticket: 'ticket' };
  var LABELS = { binaer: { de: 'Binär → Dezimal', en: 'Binary → decimal' }, subnetz: { de: 'Subnetze', en: 'Subnets' }, ports: { de: 'Ports & Dienste', en: 'Ports & services' },
    firewall: { de: 'Firewall-Regelwerk', en: 'Firewall rules' }, ticket: { de: 'Störungsticket', en: 'Support ticket' } };
  var FILES = { binaer: 'binaer.sh', subnetz: 'subnetz.sh', ports: 'ports.sh', firewall: 'firewall.sh', ticket: 'ticket.sh' };
  var ORDER = ['ticket', 'binaer', 'subnetz', 'ports', 'firewall'];
  var $ = function (s) { return kt.querySelector(s); };
  var view = $('[data-quiz-view]'), cmd = $('[data-quiz-cmd]'), tools = Array.prototype.slice.call(document.querySelectorAll('[data-quiz-tool]'));
  var modeBtns = kt.querySelectorAll('[data-quiz-mode]');

  var mode = 'ticket';
  try { var s = sessionStorage.getItem('quiz'); if (MAKERS[s]) mode = s; } catch (e) {}
  // Bestenliste pro Modus, nur im Browser des Besuchers
  var getTop = function (m) {
    try { var t = JSON.parse(localStorage.getItem('quiz-top-' + m) || '[]'); return Array.isArray(t) ? addScore(t, 0).top : []; } catch (e) { return []; }
  };
  var setTop = function (m, t) { try { localStorage.setItem('quiz-top-' + m, JSON.stringify(t)); } catch (e) {} };
  var fmt = function (n) { return bi(n.toLocaleString('de-DE'), n.toLocaleString('en-US')); };
  var getLast = function (m) {
    try { var v = JSON.parse(localStorage.getItem('quiz-last-' + m)); return typeof v === 'number' && isFinite(v) ? v : null; } catch (e) { return null; }
  };
  var setLast = function (m, v) { try { localStorage.setItem('quiz-last-' + m, JSON.stringify(v)); } catch (e) {} };
  // Antwort-Pult rechts unter der Rangliste (nur Desktop, wenn die rechte Spalte neben dem Spielfeld steht).
  // Schmaler bleiben Antworten und „Weiter“ im Spielfeld unter der Frage.
  var pult = $('[data-quiz-pult]'), mqWide = window.matchMedia ? window.matchMedia('(min-width: 1081px)') : null;
  var pultMsg = function (de, en) { if (pult) pult.innerHTML = '<div class="kt-out d"># ' + bi(de, en) + '</div>'; };
  var place = function () {
    if (!g || !g.opts) return;
    var wide = !!(pult && mqWide && mqWide.matches), fb = view.querySelector('.kq-fb');
    if (wide) { pult.appendChild(g.opts); if (g.act) pult.appendChild(g.act); }
    else {
      // Schmal: Frage, Antworten, Ergebnis
      var card = view.querySelector('.kq-card');
      view.insertBefore(g.opts, card ? card.nextSibling : null);
      if (fb) { view.insertBefore(fb, g.opts.nextSibling); if (g.act) fb.appendChild(g.act); }
    }
  };
  if (mqWide) { if (mqWide.addEventListener) mqWide.addEventListener('change', place); else if (mqWide.addListener) mqWide.addListener(place); }
  var boardEl = document.querySelector('[data-quiz-board]'), podName = document.querySelector('[data-quiz-podname]');
  // live: laufende oder gerade beendete Runde { cur, prev, done, newRec }; null = noch nicht gestartet
  var live = null;
  // Rechts: Ring mit den Punkten der aktuellen Runde im Verhältnis zum Rekord, Abstand zur Vorrunde,
  // darunter persönlicher Rekord und letzte Runde (alles nur im Browser des Besuchers)
  var board = function () {
    if (podName) podName.textContent = mode;
    if (!boardEl) return;
    var rec = getTop(mode)[0], prev = live ? live.prev : getLast(mode);
    var cur = live ? live.cur : null, pct = cur == null ? 0 : (live.newRec ? 100 : ringPct(cur, rec));
    var sub = cur == null ? bi('Bereit · Antwort wählen', 'Ready · pick an answer')
      : live.newRec ? bi('Neuer Rekord!', 'New record!')
      : rec ? bi(pct + ' % vom Rekord', pct + ' % of record') : bi('Erste Runde', 'First round');
    var d = cur == null ? null : delta(cur, prev), dh = '';
    // Während der Runde: nur der Abstand zur Vorrunde (sonst stünde anfangs immer ein großes Minus da).
    // Am Ende der Runde: ▲/▼ mit dem Ergebnis im Vergleich zur Vorrunde.
    if (d != null && !live.done) {
      dh = d < 0 ? '<div class="rk-d">' + bi('noch ' + (-d).toLocaleString('de-DE') + ' bis zur Vorrunde', (-d).toLocaleString('en-US') + ' to go to beat last round') + '</div>'
        : '<div class="rk-d up">▲ ' + bi('Vorrunde übertroffen', 'Last round beaten') + '</div>';
    } else if (d != null) {
      var n = Math.abs(d), nde = n.toLocaleString('de-DE'), nen = n.toLocaleString('en-US');
      dh = d > 0 ? '<div class="rk-d up">▲ ' + bi('+' + nde + ' zur Vorrunde', '+' + nen + ' vs. last round') + '</div>'
        : d < 0 ? '<div class="rk-d down">▼ ' + bi('−' + nde + ' zur Vorrunde', '−' + nen + ' vs. last round') + '</div>'
        : '<div class="rk-d">± ' + bi('0 · gleich wie Vorrunde', '0 · same as last round') + '</div>';
    }
    boardEl.innerHTML =
      '<div class="rk-ring' + (cur == null ? ' idle' : '') + (live && live.newRec ? ' rec' : '') + '" style="--p:' + pct + '"><div><b>' + (cur == null ? '–' : fmt(cur)) + '</b><span class="rk-s">' + sub + '</span></div></div>' + dh +
      '<ul class="rk-list"><li class="rec"><span>🏆 ' + bi('Rekord', 'Record') + '</span><b>' + (rec ? fmt(rec) : '–') + '</b></li>' +
      '<li><span>' + bi('Letzte Runde', 'Last round') + '</span><b>' + (prev != null ? fmt(prev) : '–') + '</b></li></ul>';
  };

  // Störungstickets als gemischter Stapel: zufällige Reihenfolge, und keines kommt doppelt,
  // bis alle einmal dran waren. Der Stapel bleibt im Browser des Besuchers, auch über Runden hinweg.
  var nextTicket = function () {
    var n = TICKETS.length, deck = null;
    try { deck = JSON.parse(localStorage.getItem('quiz-deck-ticket')); } catch (e) {}
    if (!Array.isArray(deck) || !deck.length || deck.some(function (x) { return typeof x !== 'number' || x < 0 || x >= n; })) {
      deck = [];
      for (var i = 0; i < n; i++) deck.push(i);
      shuffle(deck, Math.random);
    }
    var pick = deck.pop();
    try { localStorage.setItem('quiz-deck-ticket', JSON.stringify(deck)); } catch (e) {}
    return pick;
  };

  // Neuer Rekord (alter Rekord übertroffen): „Goldener Siegerring“. Der Ring leuchtet und pulsiert,
  // ein Stempel „NEUER REKORD“ springt ein und goldenes Konfetti rieselt über den Ring (einmalig, ca. 3 s).
  var celebrate = function () {
    var ring = boardEl && boardEl.querySelector('.rk-ring');
    if (!ring) return;
    var st = document.createElement('span');
    st.className = 'rk-stamp'; st.setAttribute('aria-hidden', 'true');
    st.innerHTML = bi('NEUER REKORD', 'NEW RECORD');
    ring.appendChild(st);
    ring.classList.add('rk-win');
    if (reduceMotion) return;
    // Canvas im Ranglisten-Block, damit es mit dem Ring mitwandert, auch wenn sich das Layout darüber ändert
    var W = ring.offsetWidth + 160, H = ring.offsetHeight + 200, d = window.devicePixelRatio || 1;
    var c = document.createElement('canvas');
    c.className = 'rk-confetti'; c.setAttribute('aria-hidden', 'true');
    c.width = W * d; c.height = H * d;
    c.style.cssText = 'left:' + (ring.offsetLeft - 80) + 'px;top:' + (ring.offsetTop - 140) + 'px;width:' + W + 'px;height:' + H + 'px';
    boardEl.appendChild(c);
    var x = c.getContext('2d'), cols = ['#e0b23a', '#f5c04a', '#fff0b8', '#c8962a'], ps = [];
    x.setTransform(d, 0, 0, d, 0, 0);
    for (var i = 0; i < 60; i++) ps.push({ x: Math.random() * W, y: -10 - Math.random() * 110, vx: (Math.random() - 0.5) * 30, vy: 60 + Math.random() * 80,
      r: Math.random() * 6, vr: (Math.random() - 0.5) * 8, w: 4 + Math.random() * 4, h: 7 + Math.random() * 5, c: cols[i % 4] });
    var t0 = 0, DUR = 3;
    var frame = function (t) {
      if (!t0) t0 = t;
      var k = (t - t0) / 1000;
      x.clearRect(0, 0, W, H);
      ps.forEach(function (p) {
        x.save();
        x.translate(p.x + p.vx * k + Math.sin(k * 3 + p.r) * 12, p.y + p.vy * k + 40 * k * k);
        x.rotate(p.r + p.vr * k); x.scale(1, Math.cos(k * 6 + p.r));
        x.globalAlpha = Math.max(0, 1 - k / DUR); x.fillStyle = p.c;
        x.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        x.restore();
      });
      if (k < DUR) requestAnimationFrame(frame); else if (c.parentNode) c.parentNode.removeChild(c);
    };
    setTimeout(function () { requestAnimationFrame(frame); }, 500);
  };

  // Spielstand
  var g = null, timer = 0, next = 0;
  var stop = function () { clearInterval(timer); clearTimeout(next); timer = 0; next = 0; };

  var dotsHtml = function () {
    var h = '<span class="kt-dots" aria-hidden="true">';
    for (var i = 0; i < ROUNDS; i++) {
      var r = g.res[i];
      h += '<i class="' + (r ? (r.ok ? 'ok' : 'bad') : (i === g.i ? 'cur' : '')) + '"></i>';
    }
    return h + '</span>';
  };

  // Beim Laden und beim Wechsel des Modus steht Frage 1 schon offen da. Die Uhr läuft noch nicht:
  // Die erste Antwort startet das Spiel (Frage 1 ohne Zeitbonus, nur Grundpunkte), danach weiter mit „Weiter“ oder Enter.
  var intro = function () {
    stop(); live = null; board();
    g = { i: 0, pts: 0, res: [], used: {}, times: [] };
    ask(true);
  };

  var start = function () {
    stop();
    g = { i: 0, pts: 0, res: [], used: {}, times: [] };
    live = { cur: 0, prev: getLast(mode), done: false, newRec: false };
    board();
    ask(true);
  };

  var ask = function (warm) {
    var q, tries = 0;
    do { q = mode === 'ticket' ? makeTicket(Math.random, nextTicket()) : make(mode); } while (g.used[q.key] && ++tries < 30);
    g.used[q.key] = 1; g.q = q; g.left = SECONDS; g.t0 = Date.now(); g.done = false; g.over = false; g.warm = !!warm;
    var keys = ['A', 'B', 'C'], o = '';
    q.opts.forEach(function (op, i) {
      o += '<button type="button" class="kt-opt" data-opt="' + i + '"><span class="k">' + keys[i] + '</span><span class="v">' + tx(op) + '</span><span class="m"></span></button>';
    });
    var v = '<b class="y">' + tx(q.v) + '</b>';
    // Firewall-Regelwerk oder Ticket-Text über der Frage (Firewall als Tabelle in Festbreite)
    var pre = q.pre ? (q.pre.de === q.pre.en ? '<div class="kt-pre kt-pre-' + mode + '">' + q.pre.de + '</div>'
      : '<div class="kt-pre kt-pre-' + mode + '" data-l="de">' + q.pre.de + '</div><div class="kt-pre kt-pre-' + mode + '" data-l="en">' + q.pre.en + '</div>') : '';
    // Arcade-Aufbau: Anzeige (Runde, Zeit, Bonus, Punkte + Zeitbalken) · Fragekarte · Antworten · später Ergebnisfeld
    view.innerHTML =
      '<div class="kq-hud" data-quiz-timer>' +
      '<div class="kq-c"><small>' + bi('Runde', 'Round') + '</small><b>' + (g.i + 1) + '/' + ROUNDS + '</b>' + dotsHtml() + '</div>' +
      '<div class="kq-c t"><small>' + bi('Zeit', 'Time') + '</small><b>' + (warm ? '<span data-quiz-sec>–</span>' : '<span data-quiz-sec>' + SECONDS + '</span> s') + '</b></div>' +
      '<div class="kq-c"><small>Bonus</small><b data-quiz-bonus>+' + (warm ? 0 : PER_SEC * SECONDS) + '</b></div>' +
      '<div class="kq-c s"><small>' + bi('Punkte', 'Points') + '</small><b data-quiz-pts>' + fmt(g.pts) + '</b></div>' +
      '<div class="kq-bar"><i data-quiz-bar></i></div></div>' +
      '<div class="kq-card"><div class="kq-lab">' + tx(LABELS[mode]) + '</div>' + pre +
      '<div class="kt-q">' + bi(q.q.de.replace('{v}', v), q.q.en.replace('{v}', v)) + '</div></div>' +
      '<div class="kt-opts">' + o + '</div>' +
      (warm ? '<div class="kt-out d kq-warm">' + bi('# Frage 1 ohne Zeitbonus: Antwort anklicken (oder A/B/C) startet das Spiel. Uhr und Bonus laufen ab Frage 2.', '# Question 1 has no time bonus: click an answer (or A/B/C) to start. Clock and bonus run from question 2.') + '</div>' : '');
    g.opts = view.querySelector('.kt-opts'); g.act = null;
    if (pult) pult.innerHTML = '';
    place();
    g.opts.querySelectorAll('[data-opt]').forEach(function (b) {
      b.addEventListener('click', function () { answer(+b.getAttribute('data-opt')); });
    });
    if (warm) { var wb = view.querySelector('[data-quiz-bar]'); if (wb) wb.style.width = '0%'; return; }
    tick();
    timer = setInterval(tick, 100);
  };

  var tick = function () {
    if (!g || g.done) return;
    var left = Math.max(0, SECONDS - (Date.now() - g.t0) / 1000);
    g.left = left;
    var sec = view.querySelector('[data-quiz-sec]'), bar = view.querySelector('[data-quiz-bar]'), bonus = view.querySelector('[data-quiz-bonus]');
    if (sec) sec.textContent = Math.ceil(left);
    if (bar) bar.style.width = (left / SECONDS * 100) + '%';
    if (bonus) bonus.textContent = '+' + PER_SEC * Math.floor(left);
    var tm = view.querySelector('[data-quiz-timer]');
    if (tm) tm.classList.toggle('is-low', left <= 10);
    // Zeit abgelaufen: Frage bleibt stehen, bis der Spieler wählt (dann ohne Zeitbonus)
    if (left <= 0 && !g.over) {
      g.over = true; clearInterval(timer); timer = 0;
      var w = document.createElement('div');
      w.className = 'kt-out r'; w.setAttribute('role', 'status');
      w.innerHTML = '[!] ' + bi('Zeit abgelaufen · Wählen Sie trotzdem eine Antwort (ohne Zeitbonus).', 'Time is up · Pick an answer anyway (no time bonus).');
      var card = view.querySelector('.kq-card');
      if (card) view.insertBefore(w, card.nextSibling);
    }
  };

  // Tab im Hintergrund: Uhr anhalten und beim Zurückkommen weiterlaufen lassen
  var hiddenAt = 0;
  document.addEventListener('visibilitychange', function () {
    if (!g || g.done) return;
    if (document.hidden) hiddenAt = Date.now();
    else if (hiddenAt) { g.t0 += Date.now() - hiddenAt; hiddenAt = 0; }
  });

  var answer = function (i) {
    if (!g || g.done) return;
    // Erste Antwort auf die offene Startfrage: jetzt beginnt die Runde
    if (g.warm) {
      g.warm = false; g.left = 0; g.t0 = Date.now();
      live = { cur: 0, prev: getLast(mode), done: false, newRec: false };
      var wh = view.querySelector('.kq-warm'); if (wh) wh.parentNode.removeChild(wh);
    }
    g.done = true; clearInterval(timer); timer = 0;
    var ok = i === g.q.a, used = Math.min(SECONDS, (Date.now() - g.t0) / 1000), p = points(ok, g.left);
    g.pts += p; g.res.push({ ok: ok }); g.times.push(used);
    if (live) { live.cur = g.pts; board(); }
    var ptsEl = view.querySelector('[data-quiz-pts]');
    if (ptsEl) ptsEl.innerHTML = fmt(g.pts);
    var dot = view.querySelectorAll('.kq-hud .kt-dots i')[g.i];
    if (dot) dot.className = ok ? 'ok' : 'bad';
    g.opts.querySelectorAll('[data-opt]').forEach(function (b, j) {
      b.disabled = true;
      var m = b.querySelector('.m');
      if (j === g.q.a) { b.classList.add('ok'); m.innerHTML = '✓ ' + bi('richtig', 'correct'); }
      else if (j === i) { b.classList.add('bad'); m.innerHTML = '✗ ' + bi('falsch', 'wrong'); }
    });
    // Ergebnisfeld: Meldung, Erklärung und „Weiter“ zusammen in einem Kasten
    var box = document.createElement('div');
    box.className = 'kq-fb ' + (ok ? 'ok' : 'bad');
    // Ergebnis direkt unter der Frage (schmal: unter den Antworten)
    var anchor = g.opts.parentNode === view ? g.opts : view.querySelector('.kq-card');
    view.insertBefore(box, anchor ? anchor.nextSibling : null);
    var fb = document.createElement('div');
    fb.className = 'kt-out ' + (ok ? 'g' : 'r');
    fb.setAttribute('role', 'status');
    fb.innerHTML = ok ? '[+] ' + bi('Richtig', 'Correct') + ': +' + p + ' ' + bi('Punkte', 'points')
      : '[-] ' + bi('Falsch', 'Wrong') + ' · ' + bi('Lösung', 'Answer') + ': ' + tx(g.q.opts[g.q.a]);
    box.appendChild(fb);
    // Kurze Erklärung, damit man aus jeder Frage etwas mitnimmt
    if (g.q.why) {
      var wy = document.createElement('div');
      wy.className = 'kt-out kt-why';
      wy.innerHTML = '# ' + bi(esc(g.q.why.de), esc(g.q.why.en));
      box.appendChild(wy);
    }
    // Binär und Subnetz: Rechenweg als kleine Skizze; Ports: Steckbrief aus dem Port-Lexikon
    if (mode === 'binaer' || mode === 'subnetz') box.insertAdjacentHTML('beforeend', sketch(g.q.key));
    else if (mode === 'ports') box.insertAdjacentHTML('beforeend', portInfo(+g.q.key.slice(2)));
    var nx = document.createElement('div');
    nx.className = 'kt-act';
    nx.innerHTML = '<button type="button" class="pri" data-quiz-next>' + (g.i + 1 < ROUNDS ? bi('Weiter', 'Next') + ' →' : bi('Ergebnis', 'Result') + ' →') + '</button>';
    box.appendChild(nx);
    g.act = nx; place();
    // Weiter geht es in allen Spielen nur per Klick auf „Weiter“ oder mit Enter, damit man in Ruhe lesen kann
    var cur = g, at = g.i;
    g.go = function () { if (g !== cur || g.i !== at || !g.done) return; g.go = null; g.i++; if (g.i < ROUNDS) ask(); else result(); };
    nx.querySelector('button').addEventListener('click', function () { if (g && g.go) g.go(); });
    nx.querySelector('button').focus({ preventScroll: true });
  };

  // Port-Steckbrief nach der Antwort: Protokoll, Bereich, wofür, Firewall-Hinweis, verwandte Ports (Daten aus ports.js)
  var portInfo = function (port) {
    var PD = global.PortData, e = null, i;
    if (!PD) return '';
    for (i = 0; i < PD.PORTS.length; i++) if (PD.PORTS[i].port === port) e = PD.PORTS[i];
    if (!e) return '';
    var t2 = function (x) { return typeof x === 'string' ? x : bi(esc(x[0]), esc(x[1])); };
    var cat = PD.CATEGORIES[e.cat], yes = function (on, l) { return '<span class="pi-c ' + (on ? 'on' : 'off') + '">' + (on ? '✓ ' : '✗ ') + l + '</span>'; };
    var rel = e.related.map(function (r) {
      var o = null; for (var j = 0; j < PD.PORTS.length; j++) if (PD.PORTS[j].port === r) o = PD.PORTS[j];
      return '<span class="pi-r">' + r + (o ? ' ' + t2(o.name) : '') + '</span>';
    }).join('');
    return '<div class="kq-sk kq-pi"><div class="sk-h"># ' + bi('Steckbrief', 'Fact sheet') + ': <b>Port ' + port + '</b> · ' + t2(e.name) + '</div>' +
      '<div class="pi-cs">' + yes(e.tcp, 'TCP') + yes(e.udp, 'UDP') + (cat ? '<span class="pi-c cat">' + bi(cat[0], cat[1]) + '</span>' : '') + '</div>' +
      '<dl><dt>' + bi('Wofür', 'Purpose') + '</dt><dd>' + t2(e.desc) + '</dd>' +
      '<dt>Firewall</dt><dd>' + t2(e.note) + '</dd>' +
      (rel ? '<dt>' + bi('Verwandt', 'Related') + '</dt><dd class="pi-rs">' + rel + '</dd>' : '') + '</dl></div>';
  };

  var result = function () {
    stop();
    var right = g.res.filter(function (r) { return r.ok; }).length, pct = Math.round(right / ROUNDS * 100);
    var avg = g.times.reduce(function (a, b) { return a + b; }, 0) / g.times.length;
    var top = getTop(mode), add = addScore(top, g.pts), rec = add.place === 1, best = add.top[0] || 0;
    var beat = rec && top.length > 0 && g.pts > top[0];
    var d = live ? delta(g.pts, live.prev) : null;
    setTop(mode, add.top);
    setLast(mode, g.pts);
    if (live) { live.cur = g.pts; live.done = true; live.newRec = rec; }
    board();
    if (beat) celebrate();
    var chips = g.res.map(function (r, i) { return '<span class="' + (r.ok ? 'ok' : 'bad') + '">' + (i + 1) + ' ' + (r.ok ? '✓' : '✗') + '</span>'; }).join('');
    pultMsg('Runde beendet · Ergebnis im Spielfeld.', 'Round complete · see the result in the game.');
    var col = pct >= 80 ? 'g' : (pct >= 40 ? 'y' : 'r');
    var nextMode = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];
    view.innerHTML =
      '<div class="kt-res" role="status">' +
      '<div class="kt-out g">[+] ' + bi('Runde beendet', 'Round complete') + '</div>' +
      '<div class="resrow"><div class="kt-pct ' + col + '">' + pct + ' %</div><div class="resinfo">' +
      '<div class="kt-out">' + bi(right + ' von ' + ROUNDS + ' richtig', right + ' of ' + ROUNDS + ' correct') + ' · ' + bi('Punkte', 'Points') + ' <b class="y">' + fmt(g.pts) + '</b></div>' +
      (rec ? '<div class="kt-out g">★ ' + bi('Neuer persönlicher Rekord!', 'New personal record!') + '</div>'
        : d != null ? '<div class="kt-out ' + (d > 0 ? 'g">▲ +' : d < 0 ? 'r">▼ −' : 'd">± ') + bi(Math.abs(d).toLocaleString('de-DE') + ' zur Vorrunde', Math.abs(d).toLocaleString('en-US') + ' vs. last round') + '</div>' : '') +
      '</div></div><div class="kt-bar2 ' + col + '"><i style="width:' + pct + '%"></i></div>' +
      '<div class="kt-out y">' + bi('Ø ' + avg.toFixed(1).replace('.', ',') + ' s pro Antwort', 'avg ' + avg.toFixed(1) + ' s per answer') + '</div>' +
      '<div class="kt-out d">' + (rec ? bi('# Das ist Ihr neuer Bestwert für diesen Modus.', '# That is your new best for this mode.')
        : best && best === g.pts ? bi('# Rekord genau eingestellt.', '# You matched your record.')
        : best ? bi('# Noch ' + (best - g.pts).toLocaleString('de-DE') + ' Punkte bis zum Rekord.', '# ' + (best - g.pts).toLocaleString('en-US') + ' points short of your record.')
        : bi('# Ohne Punkte kein Rekord. Gleich nochmal?', '# No points, no record. Try again?')) + '</div>' +
      '<div class="kt-review">' + chips + '</div>' +
      '<div class="kt-act"><button type="button" class="pri" data-quiz-again>↻ ' + bi('Nochmal', 'Again') + '</button>' +
      '<button type="button" data-quiz-nextmode>' + bi('Nächster Modus', 'Next mode') + ': ' + NAMES[nextMode] + ' →</button></div></div>';
    view.querySelector('[data-quiz-again]').addEventListener('click', start);
    view.querySelector('[data-quiz-nextmode]').addEventListener('click', function () { setMode(nextMode); start(); });
  };

  var setMode = function (m) {
    mode = m; live = null;
    try { sessionStorage.setItem('quiz', m); } catch (e) {}
    modeBtns.forEach(function (b) {
      var on = b.getAttribute('data-quiz-mode') === m;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    if (cmd) cmd.textContent = './' + FILES[m] + ' --timer ' + SECONDS;
    // Cheatsheet links: das Werkzeug zur gewählten Runde hervorheben
    tools.forEach(function (a) { a.classList.toggle('on', a.getAttribute('data-quiz-tool') === m); });
    board();
  };
  modeBtns.forEach(function (b) {
    b.addEventListener('click', function () { setMode(b.getAttribute('data-quiz-mode')); intro(); });
  });

  // Enter: nach einer Antwort weiter zur nächsten Frage, egal wo der Fokus gerade liegt
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || e.ctrlKey || e.metaKey || e.altKey || !g || !g.done || !g.go) return;
    var t = e.target, tag = t && t.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (tag === 'A' && !kt.contains(t))) return;
    e.preventDefault(); g.go();
  });

  // Tastatur: A/B/C oder 1/2/3 wählt eine Antwort, solange der Fokus im Terminal liegt
  kt.addEventListener('keydown', function (e) {
    if (!g || g.done || e.ctrlKey || e.metaKey || e.altKey) return;
    var i = 'abc'.indexOf(e.key.toLowerCase());
    if (i < 0) i = '123'.indexOf(e.key);
    if (i >= 0) { e.preventDefault(); answer(i); }
  });

  setMode(mode);
  intro();

  // Glitch: kurze Bildstörung, einmal 30 s nach dem Laden (nicht bei „Bewegung reduzieren“)
  kt.addEventListener('animationend', function (e) {
    if (e.target === kt && e.animationName === 'glitch') kt.classList.remove('is-glitch');
  });
  if (!reduceMotion) setTimeout(function () { if (!document.hidden) kt.classList.add('is-glitch'); }, 30000);

  // Easter Egg: Klick auf den Fenstertitel
  var sudo = $('[data-sudo]');
  if (sudo) {
    var idle = sudo.innerHTML, busy = false;
    sudo.addEventListener('click', function () {
      if (busy) return;
      busy = true;
      sudo.innerHTML = 'gast@matija-tasic: $ sudo su';
      setTimeout(function () { sudo.classList.add('is-denied'); sudo.innerHTML = bi('Netter Versuch: verweigert.', 'Nice try: denied.'); }, 600);
      setTimeout(function () { sudo.classList.remove('is-denied'); sudo.innerHTML = idle; busy = false; }, 3600);
    });
  }
})(this);
