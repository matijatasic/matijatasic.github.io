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
      'Zu Hause gilt auch 192.168.1.0/24. Der PC hält die Ziele für lokal und schickt nichts durchs VPN.', 'Home uses 192.168.1.0/24 too. The PC thinks the targets are local and sends nothing through the VPN.']
  ];
  var makeTicket = function (rnd) {
    var i = Math.floor(rnd() * TICKETS.length), t = TICKETS[i];
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

  var api = { ROUNDS: ROUNDS, SECONDS: SECONDS, PORTS: PORTS, TICKETS: TICKETS, fwHit: fwHit, MODES: Object.keys(MAKERS), make: make, points: points, delta: delta, ringPct: ringPct, addScore: addScore, maskOf: maskOf, hostsOf: hostsOf };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  global.NetQuiz = api;

  /* ======================= Oberfläche ======================= */
  var kt = document.querySelector('[data-quiz]');
  if (!kt) return;
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var bi = function (de, en) { return '<span data-l="de">' + de + '</span><span data-l="en">' + en + '</span>'; };
  var tx = function (o) { return o.de === o.en ? o.de : bi(o.de, o.en); };
  var NAMES = { binaer: 'binär', subnetz: 'subnetz', ports: 'ports', firewall: 'firewall', ticket: 'ticket' };
  var FILES = { binaer: 'binaer.sh', subnetz: 'subnetz.sh', ports: 'ports.sh', firewall: 'firewall.sh', ticket: 'ticket.sh' };
  var ORDER = ['binaer', 'subnetz', 'ports', 'firewall', 'ticket'];
  var $ = function (s) { return kt.querySelector(s); };
  var view = $('[data-quiz-view]'), cmd = $('[data-quiz-cmd]'), tools = Array.prototype.slice.call(document.querySelectorAll('[data-quiz-tool]'));
  var modeBtns = kt.querySelectorAll('[data-quiz-mode]');

  var mode = 'binaer';
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
    var sub = cur == null ? bi('Bereit · Start drücken', 'Ready · press start')
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

  var intro = function () {
    stop(); g = null; live = null; board();
    var b = getTop(mode)[0] || 0;
    view.innerHTML =
      '<div class="kt-out c">' + bi('[*] Bereit: 5 Fragen, je 30 Sekunden.', '[*] Ready: 5 questions, 30 seconds each.') + '</div>' +
      '<div class="kt-out d">' + bi('# Schneller antworten bringt mehr Punkte.', '# Faster answers earn more points.') + '</div>' +
      (b ? '<div class="kt-out y">' + bi('Ihr Rekord: ' + b.toLocaleString('de-DE') + ' Punkte', 'Your record: ' + b.toLocaleString('en-US') + ' points') + '</div>' : '') +
      '<div class="kt-act"><button type="button" class="pri" data-quiz-start>▶ ' + bi('Start', 'Start') + '</button></div>';
    view.querySelector('[data-quiz-start]').addEventListener('click', start);
  };

  var start = function () {
    stop();
    g = { i: 0, pts: 0, res: [], used: {}, times: [] };
    live = { cur: 0, prev: getLast(mode), done: false, newRec: false };
    board();
    ask();
  };

  var ask = function () {
    var q, tries = 0;
    do { q = make(mode); } while (g.used[q.key] && ++tries < 30);
    g.used[q.key] = 1; g.q = q; g.left = SECONDS; g.t0 = Date.now(); g.done = false; g.over = false;
    var keys = ['A', 'B', 'C'], o = '';
    q.opts.forEach(function (op, i) {
      o += '<button type="button" class="kt-opt" data-opt="' + i + '"><span class="k">' + keys[i] + '</span><span class="v">' + tx(op) + '</span><span class="m"></span></button>';
    });
    var v = '<b class="y">' + tx(q.v) + '</b>';
    // Firewall-Regelwerk oder Ticket-Text über der Frage (Firewall als Tabelle in Festbreite)
    var pre = q.pre ? (q.pre.de === q.pre.en ? '<div class="kt-pre kt-pre-' + mode + '">' + q.pre.de + '</div>'
      : '<div class="kt-pre kt-pre-' + mode + '" data-l="de">' + q.pre.de + '</div><div class="kt-pre kt-pre-' + mode + '" data-l="en">' + q.pre.en + '</div>') : '';
    view.innerHTML =
      '<div class="kt-timer" data-quiz-timer><span class="kt-sec">⏱ <b data-quiz-sec>30</b> s</span><div><i data-quiz-bar></i></div><span class="y" data-quiz-bonus>+' + PER_SEC * SECONDS + ' Bonus</span></div>' +
      '<div class="kt-out c">' + bi('Runde', 'Round') + ' ' + (g.i + 1) + '/' + ROUNDS + ' ' + dotsHtml() + ' · ' + bi('Punkte', 'Points') + ' ' + g.pts + '</div>' +
      pre +
      '<div class="kt-q">' + bi(q.q.de.replace('{v}', v), q.q.en.replace('{v}', v)) + '</div>' +
      '<div class="kt-opts">' + o + '</div>';
    view.querySelectorAll('[data-opt]').forEach(function (b) {
      b.addEventListener('click', function () { answer(+b.getAttribute('data-opt')); });
    });
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
    if (bonus) bonus.textContent = '+' + PER_SEC * Math.floor(left) + ' Bonus';
    var tm = view.querySelector('[data-quiz-timer]');
    if (tm) tm.classList.toggle('is-low', left <= 10);
    // Zeit abgelaufen: Frage bleibt stehen, bis der Spieler wählt (dann ohne Zeitbonus)
    if (left <= 0 && !g.over) {
      g.over = true; clearInterval(timer); timer = 0;
      var w = document.createElement('div');
      w.className = 'kt-out r'; w.setAttribute('role', 'status');
      w.innerHTML = '[!] ' + bi('Zeit abgelaufen · Wählen Sie trotzdem eine Antwort (ohne Zeitbonus).', 'Time is up · Pick an answer anyway (no time bonus).');
      var opts = view.querySelector('.kt-opts');
      if (opts) opts.parentNode.insertBefore(w, opts);
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
    g.done = true; clearInterval(timer); timer = 0;
    var ok = i === g.q.a, used = Math.min(SECONDS, (Date.now() - g.t0) / 1000), p = points(ok, g.left);
    g.pts += p; g.res.push({ ok: ok }); g.times.push(used);
    if (live) { live.cur = g.pts; board(); }
    view.querySelectorAll('[data-opt]').forEach(function (b, j) {
      b.disabled = true;
      var m = b.querySelector('.m');
      if (j === g.q.a) { b.classList.add('ok'); m.innerHTML = '✓ ' + bi('richtig', 'correct'); }
      else if (j === i) { b.classList.add('bad'); m.innerHTML = '✗ ' + bi('falsch', 'wrong'); }
    });
    var fb = document.createElement('div');
    fb.className = 'kt-out ' + (ok ? 'g' : 'r');
    fb.setAttribute('role', 'status');
    fb.innerHTML = ok ? '[+] ' + bi('Richtig', 'Correct') + ': +' + p + ' ' + bi('Punkte', 'points')
      : '[-] ' + bi('Falsch', 'Wrong') + ' · ' + bi('Lösung', 'Answer') + ': ' + tx(g.q.opts[g.q.a]);
    view.appendChild(fb);
    // Kurze Erklärung, damit man aus jeder Frage etwas mitnimmt
    if (g.q.why) {
      var wy = document.createElement('div');
      wy.className = 'kt-out kt-why';
      wy.innerHTML = '# ' + bi(esc(g.q.why.de), esc(g.q.why.en));
      view.appendChild(wy);
    }
    var nx = document.createElement('div');
    nx.className = 'kt-act';
    nx.innerHTML = '<button type="button" class="pri" data-quiz-next>' + (g.i + 1 < ROUNDS ? bi('Weiter', 'Next') + ' →' : bi('Ergebnis', 'Result') + ' →') + '</button>';
    view.appendChild(nx);
    var go = function () { clearTimeout(next); next = 0; g.i++; if (g.i < ROUNDS) ask(); else result(); };
    nx.querySelector('button').addEventListener('click', go);
    nx.querySelector('button').focus({ preventScroll: true });
    // Automatisch weiter, damit das Spiel im Fluss bleibt (bei falscher Antwort etwas länger zum Lesen)
    // Mit Erklärung bleibt mehr Zeit zum Lesen. Beim Störungsticket geht es nur per Klick auf „Weiter“ weiter,
    // damit man in Ruhe nachlesen und recherchieren kann.
    if (mode !== 'ticket') next = setTimeout(go, g.q.why ? (ok ? 3500 : 7000) : (ok ? 1400 : 2600));
  };

  var result = function () {
    stop();
    var right = g.res.filter(function (r) { return r.ok; }).length, pct = Math.round(right / ROUNDS * 100);
    var avg = g.times.reduce(function (a, b) { return a + b; }, 0) / g.times.length;
    var top = getTop(mode), add = addScore(top, g.pts), rec = add.place === 1, best = add.top[0] || 0;
    var d = live ? delta(g.pts, live.prev) : null;
    setTop(mode, add.top);
    setLast(mode, g.pts);
    if (live) { live.cur = g.pts; live.done = true; live.newRec = rec; }
    board();
    var chips = g.res.map(function (r, i) { return '<span class="' + (r.ok ? 'ok' : 'bad') + '">' + (i + 1) + ' ' + (r.ok ? '✓' : '✗') + '</span>'; }).join('');
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
