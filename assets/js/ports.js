/* matija-tasic.de · Daten für das Port-Nachschlagewerk
   - eine Zeile je Port: Port, Protokoll, Dienst (Text oder [DE, EN]), Bereich, Hinweis DE, Hinweis EN
   - Standard-Ports nach IANA bzw. Hersteller-Voreinstellung; im Betrieb können Dienste umkonfiguriert sein
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
    iot: ['IoT und Heimnetz', 'IoT and home network'],
    mon: ['Überwachung', 'Monitoring'],
    db: ['Datenbanken', 'Databases'],
    admin: ['Verwaltung', 'Management'],
    voice: ['Telefonie', 'Voice']
  };

  var PORTS = [
    [20, 'TCP', ['FTP (Daten)', 'FTP (data)'], 'storage', 'Unverschlüsselt. Besser SFTP über SSH nutzen.', 'Unencrypted. Prefer SFTP over SSH.'],
    [21, 'TCP', ['FTP (Steuerung)', 'FTP (control)'], 'storage', 'Unverschlüsselt, Passwort im Klartext. Besser SFTP.', 'Unencrypted, password in clear text. Prefer SFTP.'],
    [22, 'TCP', 'SSH, SFTP, SCP', 'remote', 'Nur aus dem Management-Netz erlauben, Anmeldung per Schlüssel.', 'Allow only from the management network, use key login.'],
    [23, 'TCP', 'Telnet', 'remote', 'Unverschlüsselt. Nicht verwenden, SSH nutzen.', 'Unencrypted. Do not use, use SSH instead.'],
    [25, 'TCP', 'SMTP', 'mail', 'Mailserver untereinander. Ausgehend aus Client-Netzen meist sperren.', 'Mail server to mail server. Usually block outbound from client networks.'],
    [53, 'TCP/UDP', 'DNS', 'net', 'Clients nur zum eigenen Resolver (z. B. OPNsense) erlauben.', 'Allow clients only to your own resolver (e.g. OPNsense).'],
    [67, 'UDP', 'DHCP (Server)', 'net', 'Broadcast, bleibt im VLAN. Über Netzgrenzen nur mit DHCP-Relay.', 'Broadcast, stays inside the VLAN. Across networks only with a DHCP relay.'],
    [68, 'UDP', 'DHCP (Client)', 'net', 'Gegenstück zu Port 67.', 'Counterpart to port 67.'],
    [69, 'UDP', 'TFTP', 'admin', 'Für PXE-Boot und Switch-Firmware. Ohne Anmeldung, nur intern.', 'For PXE boot and switch firmware. No authentication, internal only.'],
    [80, 'TCP', 'HTTP', 'web', 'Meist nur zur Weiterleitung auf HTTPS und für Let’s-Encrypt-Prüfung.', 'Usually only for redirecting to HTTPS and for Let’s Encrypt validation.'],
    [81, 'TCP', ['Nginx Proxy Manager (Verwaltung)', 'Nginx Proxy Manager (admin)'], 'admin', 'Verwaltungsoberfläche von NPM. Nicht ins Internet freigeben.', 'NPM admin interface. Do not expose to the internet.'],
    [88, 'TCP/UDP', 'Kerberos', 'auth', 'Anmeldung im Active Directory.', 'Authentication in Active Directory.'],
    [110, 'TCP', 'POP3', 'mail', 'Unverschlüsselt. Besser POP3S (995) oder IMAPS (993).', 'Unencrypted. Prefer POP3S (995) or IMAPS (993).'],
    [123, 'UDP', 'NTP', 'net', 'Zeit vom eigenen Zeitserver holen; richtige Zeit ist Pflicht für Zertifikate und Logs.', 'Get time from your own time server; correct time is required for certificates and logs.'],
    [137, 'UDP', ['NetBIOS-Namensdienst', 'NetBIOS name service'], 'storage', 'Alt. Nie ins Internet, zwischen Zonen sperren.', 'Legacy. Never to the internet, block between zones.'],
    [138, 'UDP', ['NetBIOS-Datagramm', 'NetBIOS datagram'], 'storage', 'Alt. Nie ins Internet, zwischen Zonen sperren.', 'Legacy. Never to the internet, block between zones.'],
    [139, 'TCP', ['NetBIOS-Sitzung', 'NetBIOS session'], 'storage', 'Alt. Nie ins Internet, zwischen Zonen sperren.', 'Legacy. Never to the internet, block between zones.'],
    [143, 'TCP', 'IMAP', 'mail', 'Nur mit STARTTLS, besser IMAPS (993).', 'Only with STARTTLS, prefer IMAPS (993).'],
    [161, 'UDP', 'SNMP', 'mon', 'SNMPv3 nutzen; v1/v2c senden die Community im Klartext.', 'Use SNMPv3; v1/v2c send the community in clear text.'],
    [162, 'UDP', 'SNMP-Trap', 'mon', 'Meldungen der Geräte an das Monitoring.', 'Notifications from devices to the monitoring system.'],
    [389, 'TCP/UDP', 'LDAP', 'auth', 'Unverschlüsselt. Besser LDAPS (636).', 'Unencrypted. Prefer LDAPS (636).'],
    [443, 'TCP', 'HTTPS', 'web', 'Standard für Weboberflächen und Reverse Proxy.', 'Standard for web interfaces and reverse proxy.'],
    [443, 'UDP', 'HTTP/3 (QUIC)', 'web', 'Neuere Browser nutzen UDP 443 zusätzlich zu TCP 443.', 'Newer browsers use UDP 443 in addition to TCP 443.'],
    [445, 'TCP', 'SMB', 'storage', 'Windows-Freigaben. Niemals ins Internet freigeben.', 'Windows file shares. Never expose to the internet.'],
    [465, 'TCP', ['SMTPS (Einlieferung)', 'SMTPS (submission)'], 'mail', 'E-Mail-Versand vom Client mit TLS.', 'Mail submission from clients over TLS.'],
    [500, 'UDP', 'IPsec IKE', 'vpn', 'Schlüsselaustausch für IPsec-VPN.', 'Key exchange for IPsec VPN.'],
    [514, 'UDP', 'Syslog', 'mon', 'Unverschlüsselt und ohne Zustellgarantie. Für sensible Logs Syslog über TLS (6514).', 'Unencrypted and without delivery guarantee. For sensitive logs use syslog over TLS (6514).'],
    [546, 'UDP', 'DHCPv6 (Client)', 'net', 'Gegenstück zu Port 547.', 'Counterpart to port 547.'],
    [547, 'UDP', 'DHCPv6 (Server)', 'net', 'Vergabe von IPv6-Adressen und Präfixen.', 'Assigns IPv6 addresses and prefixes.'],
    [587, 'TCP', 'SMTP Submission', 'mail', 'E-Mail-Versand vom Client mit STARTTLS und Anmeldung.', 'Mail submission from clients with STARTTLS and authentication.'],
    [631, 'TCP', ['IPP (Drucken)', 'IPP (printing)'], 'iot', 'Drucker im eigenen Netz; aus der Gäste-Zone meist sperren.', 'Printers in your own network; usually block from the guest zone.'],
    [636, 'TCP', 'LDAPS', 'auth', 'LDAP über TLS.', 'LDAP over TLS.'],
    [853, 'TCP', 'DNS over TLS', 'net', 'Verschlüsselte DNS-Anfragen, z. B. vom Resolver zum Upstream.', 'Encrypted DNS queries, e.g. from the resolver to the upstream.'],
    [993, 'TCP', 'IMAPS', 'mail', 'IMAP über TLS.', 'IMAP over TLS.'],
    [995, 'TCP', 'POP3S', 'mail', 'POP3 über TLS.', 'POP3 over TLS.'],
    [1194, 'UDP', 'OpenVPN', 'vpn', 'Standard-Port, oft auch auf TCP 443 umgestellt.', 'Default port, often moved to TCP 443.'],
    [1812, 'UDP', ['RADIUS (Anmeldung)', 'RADIUS (authentication)'], 'auth', 'Für WPA2/WPA3-Enterprise und 802.1X.', 'For WPA2/WPA3 Enterprise and 802.1X.'],
    [1813, 'UDP', ['RADIUS (Abrechnung)', 'RADIUS (accounting)'], 'auth', 'Accounting zu Port 1812.', 'Accounting for port 1812.'],
    [1883, 'TCP', 'MQTT', 'iot', 'Unverschlüsselt. Broker nur im IoT-Netz, besser MQTT über TLS (8883).', 'Unencrypted. Keep the broker in the IoT network, prefer MQTT over TLS (8883).'],
    [1900, 'UDP', 'SSDP / UPnP', 'iot', 'Geräteerkennung. Nicht zwischen Zonen weiterleiten, UPnP an der Firewall aus.', 'Device discovery. Do not forward between zones, keep UPnP off on the firewall.'],
    [2049, 'TCP', 'NFS', 'storage', 'Netzwerkfreigaben für Linux und Hypervisor, nur im Storage-Netz.', 'Network shares for Linux and hypervisors, storage network only.'],
    [3260, 'TCP', 'iSCSI', 'storage', 'Blockspeicher über das Netz, am besten in eigenem VLAN.', 'Block storage over the network, ideally in its own VLAN.'],
    [3306, 'TCP', 'MySQL / MariaDB', 'db', 'Nur vom Anwendungsserver erreichbar machen, nie ins Internet.', 'Reachable only from the application server, never from the internet.'],
    [3389, 'TCP/UDP', 'RDP', 'remote', 'Nie direkt ins Internet, nur über VPN.', 'Never directly to the internet, only via VPN.'],
    [3478, 'UDP', 'STUN / TURN', 'voice', 'Für Videoanrufe hinter NAT, z. B. Nextcloud Talk.', 'For video calls behind NAT, e.g. Nextcloud Talk.'],
    [4500, 'UDP', 'IPsec NAT-T', 'vpn', 'IPsec durch NAT hindurch, zusammen mit UDP 500.', 'IPsec through NAT, together with UDP 500.'],
    [5060, 'TCP/UDP', 'SIP', 'voice', 'Telefonie-Signalisierung. Unverschlüsselt, besser SIP über TLS (5061).', 'Voice signalling. Unencrypted, prefer SIP over TLS (5061).'],
    [5061, 'TCP', ['SIP über TLS', 'SIP over TLS'], 'voice', 'Verschlüsselte Telefonie-Signalisierung.', 'Encrypted voice signalling.'],
    [5353, 'UDP', 'mDNS', 'iot', 'Geräteerkennung (AirPlay, Chromecast). Bleibt im VLAN; über Zonen nur mit mDNS-Repeater.', 'Device discovery (AirPlay, Chromecast). Stays in the VLAN; across zones only with an mDNS repeater.'],
    [5432, 'TCP', 'PostgreSQL', 'db', 'Nur vom Anwendungsserver erreichbar machen, nie ins Internet.', 'Reachable only from the application server, never from the internet.'],
    [5900, 'TCP', 'VNC', 'remote', 'Oft schwach geschützt. Nur intern oder über VPN.', 'Often weakly protected. Internal or via VPN only.'],
    [6514, 'TCP', ['Syslog über TLS', 'Syslog over TLS'], 'mon', 'Verschlüsselte Log-Übertragung.', 'Encrypted log transport.'],
    [8006, 'TCP', ['Proxmox VE (Weboberfläche)', 'Proxmox VE (web interface)'], 'admin', 'Nur aus dem Management-Netz erlauben.', 'Allow only from the management network.'],
    [8007, 'TCP', 'Proxmox Backup Server', 'admin', 'Weboberfläche und Datenübertragung des PBS.', 'Web interface and data transfer of PBS.'],
    [8080, 'TCP', ['HTTP (alternativ)', 'HTTP (alternative)'], 'web', 'Häufig für Testserver und Verwaltungsoberflächen.', 'Often used for test servers and admin interfaces.'],
    [8123, 'TCP', 'Home Assistant', 'iot', 'Weboberfläche. Von außen nur über Reverse Proxy oder VPN.', 'Web interface. From outside only via reverse proxy or VPN.'],
    [8443, 'TCP', ['HTTPS (alternativ)', 'HTTPS (alternative)'], 'web', 'Häufig für Verwaltungsoberflächen, z. B. WLAN-Controller.', 'Often used for admin interfaces, e.g. Wi-Fi controllers.'],
    [8883, 'TCP', ['MQTT über TLS', 'MQTT over TLS'], 'iot', 'Verschlüsseltes MQTT.', 'Encrypted MQTT.'],
    [9100, 'TCP', ['Drucken (RAW / JetDirect)', 'Printing (RAW / JetDirect)'], 'iot', 'Druckaufträge ohne Anmeldung. Nur aus berechtigten Zonen.', 'Print jobs without authentication. Only from permitted zones.'],
    [51820, 'UDP', 'WireGuard', 'vpn', 'Standard-Port; schlank und schnell, einziger offener Port für den VPN-Zugang.', 'Default port; lean and fast, the only open port needed for VPN access.']
  ];

  /* IANA-Bereiche für Ports, die nicht in der Liste stehen */
  function portRange(p) {
    if (p <= 1023) return 'system';
    if (p <= 49151) return 'registered';
    return 'dynamic';
  }

  var api = { CATEGORIES: CATEGORIES, PORTS: PORTS, portRange: portRange };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.PortData = api;
})(this);
