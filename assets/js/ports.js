/* matija-tasic.de · Daten für das Port-Lexikon
   - ein Eintrag je Portnummer; tcp/udp zeigen, über welches Protokoll der Dienst läuft
   - Texte immer [Deutsch, Englisch]: name, desc (wofür), note (Hinweis für die Firewall)
   - related: verwandte Portnummern, die im Lexikon verlinkt werden
   - nur relevante Well-known-Ports (0–1023) nach IANA; Dienste können umkonfiguriert sein
   - läuft im Browser und in Node (tests/ports.test.js)
*/
(function (global) {
  'use strict';

  var CATEGORIES = {
    net: ['Netzdienste', 'Network services'],
    remote: ['Fernzugriff', 'Remote access'],
    web: ['Web', 'Web'],
    mail: ['E-Mail', 'Email'],
    vpn: ['VPN', 'VPN'],
    auth: ['Anmeldung', 'Authentication'],
    storage: ['Dateien und Speicher', 'Files and storage'],
    iot: ['Drucken', 'Printing'],
    mon: ['Überwachung', 'Monitoring'],
    admin: ['Verwaltung', 'Management']
  };

  function P(port, tcp, udp, cat, name, desc, note, related) {
    return { port: port, tcp: tcp, udp: udp, cat: cat, name: name, desc: desc, note: note, related: related || [] };
  }
  var T = true, F = false;

  var PORTS = [
    P(20, T, F, 'storage', ['FTP (Daten)', 'FTP (data)'],
      ['Datenkanal von FTP im aktiven Modus. Über ihn laufen die eigentlichen Dateien, gesteuert über Port 21.', 'Data channel of FTP in active mode. The actual files travel here, controlled via port 21.'],
      ['Unverschlüsselt. Besser SFTP über SSH (22) nutzen.', 'Unencrypted. Prefer SFTP over SSH (22).'], [21, 22]),
    P(21, T, F, 'storage', ['FTP (Steuerung)', 'FTP (control)'],
      ['Steuerkanal von FTP: Anmeldung und Befehle für die Dateiübertragung.', 'FTP control channel: login and commands for file transfer.'],
      ['Benutzername und Passwort gehen im Klartext über das Netz. Nicht ins Internet freigeben.', 'Username and password cross the network in clear text. Do not expose to the internet.'], [20, 22]),
    P(22, T, F, 'remote', 'SSH, SFTP, SCP',
      ['Verschlüsselter Fernzugriff auf die Kommandozeile von Linux, Switches und Firewalls. SFTP und SCP übertragen Dateien über dieselbe Verbindung.', 'Encrypted remote access to the command line of Linux, switches and firewalls. SFTP and SCP transfer files over the same connection.'],
      ['Nur aus dem Management-Netz erlauben, Anmeldung per Schlüssel statt Passwort.', 'Allow only from the management network, use key login instead of password.'], [23, 21]),
    P(23, T, F, 'remote', 'Telnet',
      ['Alter Fernzugriff auf die Kommandozeile, Vorgänger von SSH. Heute nur noch bei sehr alten Geräten.', 'Legacy remote command-line access, predecessor of SSH. Today only found on very old devices.'],
      ['Alles im Klartext, auch das Passwort. Abschalten und SSH nutzen.', 'Everything in clear text, including the password. Turn it off and use SSH.'], [22]),
    P(25, T, F, 'mail', 'SMTP',
      ['Transport von E-Mails zwischen Mailservern.', 'Transports email between mail servers.'],
      ['Ausgehend aus Client-Netzen meist sperren, damit infizierte Geräte keinen Spam versenden.', 'Usually block outbound from client networks so infected devices cannot send spam.'], [465, 587]),
    P(53, T, T, 'net', 'DNS',
      ['Namensauflösung: übersetzt Namen wie matija-tasic.de in IP-Adressen. Normal über UDP, große Antworten und Zonentransfers über TCP.', 'Name resolution: translates names like matija-tasic.de into IP addresses. Normally over UDP, large answers and zone transfers over TCP.'],
      ['Clients nur zum eigenen Resolver (z. B. OPNsense) erlauben, direkten DNS ins Internet sperren.', 'Allow clients only to your own resolver (e.g. OPNsense), block direct DNS to the internet.'], [853]),
    P(67, F, T, 'net', ['DHCP (Server)', 'DHCP (server)'],
      ['Der DHCP-Server vergibt IP-Adresse, Gateway und DNS-Server an Geräte im Netz.', 'The DHCP server hands out IP address, gateway and DNS server to devices on the network.'],
      ['Läuft per Broadcast und bleibt im VLAN. Über Netzgrenzen nur mit DHCP-Relay.', 'Works by broadcast and stays inside the VLAN. Across networks only with a DHCP relay.'], [68, 547]),
    P(68, F, T, 'net', ['DHCP (Client)', 'DHCP (client)'],
      ['Port, auf dem Geräte die Antwort des DHCP-Servers empfangen.', 'Port on which devices receive the DHCP server’s answer.'],
      ['Gehört immer zu Port 67.', 'Always goes together with port 67.'], [67]),
    P(69, F, T, 'admin', 'TFTP',
      ['Sehr einfache Dateiübertragung, z. B. für PXE-Netzwerkboot oder Firmware von Switches und Telefonen.', 'Very simple file transfer, e.g. for PXE network boot or firmware for switches and phones.'],
      ['Keine Anmeldung, keine Verschlüsselung. Nur intern und nur zum TFTP-Server.', 'No login, no encryption. Internal only and only to the TFTP server.'], []),
    P(80, T, F, 'web', 'HTTP',
      ['Unverschlüsselte Webseiten.', 'Unencrypted websites.'],
      ['Meist nur noch zur Weiterleitung auf HTTPS und für die Let’s-Encrypt-Prüfung offen.', 'Usually only kept open for the redirect to HTTPS and for Let’s Encrypt validation.'], [443]),
    P(88, T, T, 'auth', 'Kerberos',
      ['Anmeldeverfahren im Active Directory: Clients holen sich Tickets beim Domänencontroller.', 'Authentication in Active Directory: clients get tickets from the domain controller.'],
      ['Nur zwischen Clients und Domänencontrollern erlauben.', 'Allow only between clients and domain controllers.'], [389, 636]),
    P(110, T, F, 'mail', 'POP3',
      ['Abholen von E-Mails vom Server; die Mails werden meist lokal gespeichert.', 'Retrieves email from the server; mails are usually stored locally.'],
      ['Unverschlüsselt. Besser POP3S (995) oder IMAPS (993).', 'Unencrypted. Prefer POP3S (995) or IMAPS (993).'], [995, 143]),
    P(123, F, T, 'net', 'NTP',
      ['Zeitsynchronisation. Richtige Zeit ist Pflicht für Zertifikate, Logs und Anmeldung.', 'Time synchronisation. Correct time is required for certificates, logs and authentication.'],
      ['Clients nur zum eigenen Zeitserver, z. B. auf der Firewall.', 'Clients only to your own time server, e.g. on the firewall.'], []),
    P(135, T, T, 'admin', ['RPC (Endpunkt-Zuordnung)', 'RPC (endpoint mapper)'],
      ['Vermittelt unter Windows die Verbindungen zu RPC-Diensten, z. B. für Active Directory, WMI und die Fernverwaltung.', 'On Windows, brokers connections to RPC services, e.g. for Active Directory, WMI and remote management.'],
      ['Danach folgen dynamische Ports ab 49152. Nur zwischen Clients und Servern im internen Netz erlauben, nie ins Internet.', 'Dynamic ports from 49152 follow. Allow only between clients and servers on the internal network, never from the internet.'], [445, 389]),
    P(137, F, T, 'storage', ['NetBIOS-Namensdienst', 'NetBIOS name service'],
      ['Alte Namensauflösung in Windows-Netzen, Teil der NetBIOS-Familie (137–139).', 'Legacy name resolution in Windows networks, part of the NetBIOS family (137–139).'],
      ['Nie ins Internet, zwischen Zonen sperren. In modernen Netzen meist abschaltbar.', 'Never to the internet, block between zones. Can usually be turned off in modern networks.'], [138, 139, 445]),
    P(138, F, T, 'storage', ['NetBIOS-Datagramm', 'NetBIOS datagram'],
      ['NetBIOS-Datagrammdienst, z. B. für die alte Netzwerkumgebung von Windows.', 'NetBIOS datagram service, e.g. for the old Windows network browser.'],
      ['Nie ins Internet, zwischen Zonen sperren.', 'Never to the internet, block between zones.'], [137, 139]),
    P(139, T, F, 'storage', ['NetBIOS-Sitzung', 'NetBIOS session'],
      ['Alter Weg für Windows-Freigaben über NetBIOS, heute durch SMB direkt auf 445 ersetzt.', 'Old way of Windows file sharing over NetBIOS, today replaced by SMB directly on 445.'],
      ['Nie ins Internet, zwischen Zonen sperren.', 'Never to the internet, block between zones.'], [137, 445]),
    P(143, T, F, 'mail', 'IMAP',
      ['Zugriff auf das Postfach auf dem Server; Mails bleiben dort und sind auf allen Geräten gleich.', 'Access to the mailbox on the server; mails stay there and look the same on all devices.'],
      ['Nur mit STARTTLS, besser IMAPS (993).', 'Only with STARTTLS, prefer IMAPS (993).'], [993, 110]),
    P(161, F, T, 'mon', 'SNMP',
      ['Abfragen von Werten aus Switches, Routern und Servern für das Monitoring.', 'Reads values from switches, routers and servers for monitoring.'],
      ['SNMPv3 nutzen; v1 und v2c senden die Community im Klartext. Nur vom Monitoring-Server erlauben.', 'Use SNMPv3; v1 and v2c send the community in clear text. Allow only from the monitoring server.'], [162]),
    P(162, F, T, 'mon', 'SNMP-Trap',
      ['Geräte melden Ereignisse von sich aus an das Monitoring, z. B. einen Port-Ausfall.', 'Devices report events to the monitoring system on their own, e.g. a port going down.'],
      ['Nur vom Gerät zum Monitoring-Server.', 'Only from the device to the monitoring server.'], [161]),
    P(389, T, T, 'auth', 'LDAP',
      ['Verzeichnisdienst, z. B. Active Directory: Benutzer, Gruppen und Anmeldung für andere Dienste.', 'Directory service, e.g. Active Directory: users, groups and login for other services.'],
      ['Unverschlüsselt. Besser LDAPS (636) oder STARTTLS.', 'Unencrypted. Prefer LDAPS (636) or STARTTLS.'], [636, 88]),
    P(443, T, T, 'web', 'HTTPS',
      ['Verschlüsselte Webseiten und die meisten Weboberflächen. Über UDP läuft HTTP/3 (QUIC), das neuere Browser zusätzlich nutzen.', 'Encrypted websites and most web interfaces. HTTP/3 (QUIC), used additionally by newer browsers, runs over UDP.'],
      ['Standard für Reverse Proxy und Dienste nach außen. Wer UDP 443 sperrt, zwingt Browser zurück auf TCP.', 'Standard for reverse proxy and public services. Blocking UDP 443 forces browsers back to TCP.'], [80]),
    P(445, T, F, 'storage', 'SMB',
      ['Windows-Freigaben für Dateien und Drucker, auch von NAS-Systemen genutzt.', 'Windows file and printer sharing, also used by NAS systems.'],
      ['Niemals ins Internet freigeben. Zwischen Zonen nur gezielt zum Dateiserver.', 'Never expose to the internet. Between zones only specifically to the file server.'], [139]),
    P(465, T, F, 'mail', ['SMTPS (Einlieferung)', 'SMTPS (submission)'],
      ['Versand von E-Mails vom Mailprogramm zum Server, von Anfang an mit TLS.', 'Sending email from the mail client to the server, with TLS from the start.'],
      ['Mit Anmeldung, nur zum eigenen Mailserver.', 'With authentication, only to your own mail server.'], [587, 25]),
    P(500, F, T, 'vpn', 'IPsec IKE',
      ['Schlüsselaustausch beim Aufbau eines IPsec-VPN, z. B. Standort-zu-Standort.', 'Key exchange when setting up an IPsec VPN, e.g. site-to-site.'],
      ['Nur von bekannten Gegenstellen erlauben. Hinter NAT zusätzlich UDP 4500.', 'Allow only from known peers. Behind NAT also UDP 4500.'], []),
    P(514, F, T, 'mon', 'Syslog',
      ['Geräte schicken ihre Logs an einen zentralen Log-Server.', 'Devices send their logs to a central log server.'],
      ['Unverschlüsselt und ohne Zustellgarantie. Für sensible Logs Syslog über TLS (6514).', 'Unencrypted and without delivery guarantee. For sensitive logs use syslog over TLS (6514).'], []),
    P(547, F, T, 'net', ['DHCPv6 (Server)', 'DHCPv6 (server)'],
      ['Vergabe von IPv6-Adressen, DNS-Servern und Präfixen (Prefix Delegation). Clients antworten auf Port 546.', 'Assigns IPv6 addresses, DNS servers and prefixes (prefix delegation). Clients answer on port 546.'],
      ['Wie DHCP nur im eigenen Netz; Prefix Delegation kommt vom Provider auf das WAN.', 'Like DHCP only inside the network; prefix delegation comes from the provider on the WAN.'], [67]),
    P(587, T, F, 'mail', 'SMTP Submission',
      ['Versand von E-Mails vom Mailprogramm zum Server mit STARTTLS.', 'Sending email from the mail client to the server with STARTTLS.'],
      ['Mit Anmeldung, nur zum eigenen Mailserver.', 'With authentication, only to your own mail server.'], [465, 25]),
    P(631, T, F, 'iot', ['IPP (Drucken)', 'IPP (printing)'],
      ['Internet Printing Protocol: Drucken über das Netz, auch AirPrint nutzt es.', 'Internet Printing Protocol: printing over the network, also used by AirPrint.'],
      ['Nur aus Zonen, die drucken dürfen; aus dem Gäste-Netz meist sperren.', 'Only from zones that may print; usually block from the guest network.'], []),
    P(636, T, F, 'auth', 'LDAPS',
      ['LDAP über TLS: verschlüsselte Abfragen an den Verzeichnisdienst.', 'LDAP over TLS: encrypted queries to the directory service.'],
      ['Nur von den Diensten, die gegen das Verzeichnis anmelden.', 'Only from the services that authenticate against the directory.'], [389]),
    P(853, T, F, 'net', 'DNS over TLS',
      ['Verschlüsselte DNS-Anfragen, z. B. vom eigenen Resolver zum Upstream-Anbieter.', 'Encrypted DNS queries, e.g. from your own resolver to the upstream provider.'],
      ['Ausgehend nur vom Resolver erlauben, sonst umgehen Clients den eigenen DNS.', 'Allow outbound only from the resolver, otherwise clients bypass your own DNS.'], [53]),
    P(993, T, F, 'mail', 'IMAPS',
      ['IMAP über TLS: verschlüsselter Zugriff auf das Postfach.', 'IMAP over TLS: encrypted access to the mailbox.'],
      ['Standard für Mailprogramme.', 'Standard for mail clients.'], [143]),
    P(995, T, F, 'mail', 'POP3S',
      ['POP3 über TLS: verschlüsseltes Abholen von E-Mails.', 'POP3 over TLS: encrypted email retrieval.'],
      ['Nur zum eigenen Mailserver.', 'Only to your own mail server.'], [110])
  ];

  /* IANA-Bereiche für Ports, die nicht im Lexikon stehen */
  function portRange(p) {
    if (p <= 1023) return 'system';
    if (p <= 49151) return 'registered';
    return 'dynamic';
  }

  var api = { CATEGORIES: CATEGORIES, PORTS: PORTS, portRange: portRange };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.PortData = api;
})(this);
