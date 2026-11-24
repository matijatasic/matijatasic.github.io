# matija-tasic.de

Persönliche Homepage von Matija Tasic, gehostet mit GitHub Pages.

- Reines HTML, CSS und etwas JavaScript, kein Build-Schritt, kein Framework
- Deutsch mit Umschalter auf Englisch, helle und dunkle Darstellung
- Schriften lokal eingebunden, keine Cookies
- Besucherstatistik über GoatCounter (ohne Cookies), Zähler in der Fußzeile
- Jeder Push auf `main` wird von GitHub Pages automatisch veröffentlicht

**Selbst pflegen:** siehe [PFLEGE.md](PFLEGE.md) (Werkzeuge, sicherer Ablauf, Rezepte, Checkliste).
**Projektdokumentation:** [homepage-github-pages](https://github.com/matijatasic/homepage-github-pages)

## Aufbau

| Pfad | Inhalt |
|---|---|
| `index.html` | Startseite: Start, Schwerpunkte, 01 Profil, 02 Zertifikate, 03 Projekte, 04 Kontakt |
| `werkzeuge.html` | IT-Tools: Subnetzrechner, VLAN-Planer, Port-Lexikon, Passwortgenerator, Hash-Rechner, Befehls-Baukasten, Binär-Umrechner, Cron-Erklärer |
| `terminal.html` | Terminal-Quiz (immer dunkel): `ticket.sh`, `binaer.sh`, `subnetz.sh`, `ports.sh`, `firewall.sh` |
| `impressum.html`, `datenschutz.html` | Rechtstexte (für Suchmaschinen auf `noindex`) |
| `404.html` | Fehlerseite (absolute Pfade mit `/`) |
| `robots.txt`, `sitemap.xml` | Hinweise für Suchmaschinen |
| `CNAME` | Eigene Domain für GitHub Pages, **nicht ändern** |
| `.nojekyll` | Seite wird ohne Jekyll ausgeliefert, **nicht löschen** |
| `assets/css/site.css` | Gesamte Gestaltung, Farben für hell und dunkel, Handy-Ansicht |
| `assets/js/site.js` | Sprach- und Darstellungsschalter, Kopfleiste, Kontaktformular, Besucherzähler |
| `assets/js/config.js` | Einstellungen Kontaktformular (`formEndpoint` leer = `mailto`) |
| `assets/js/quiz.js` | Terminal-Quiz |
| `assets/js/tools.js` | Oberfläche und Texte der IT-Tools |
| `assets/js/ipcalc.js` | IPv4-Rechenlogik (Subnetzrechner, VLAN-Planer) |
| `assets/js/ports.js` | Daten des Port-Lexikons (auch vom Quiz genutzt) |
| `assets/js/pwgen.js` | Passwortgenerator (Zufall nur aus Web Crypto) |
| `assets/js/hash.js` | MD5, SHA-1, SHA-256, SHA-512 |
| `assets/js/cmds.js` | Linux-Vorlagen des Befehls-Baukastens, sicheres Maskieren |
| `assets/js/binconv.js` | Binär-Umrechner |
| `assets/js/cron.js` | Cron-Erklärer |
| `assets/zertifikate/` | 20 Zertifikate als PDF/JPG |
| `assets/img/` | Portrait, Favicon, Vorschaubild für soziale Netze (1200 × 630) |
| `assets/fonts/` | Inter, IBM Plex Sans, DejaVu Sans Mono, Oxanium (WOFF2) mit Lizenztexten |
| `tests/` | Tests der Tool- und Quiz-Logik |

## Lokal ansehen

```sh
python3 -m http.server 8000
```

Danach im Browser `http://localhost:8000` öffnen.

## Tests

```sh
for t in tests/*.test.js; do node "$t" || echo "FEHLER in $t"; done
```

Acht Testdateien prüfen die Rechenlogik der IT-Tools und des Quiz (Subnetze, Ports, Passwörter, Hashes, Befehle, Binär, Cron, Quiz). Braucht nur Node, keine Pakete.

## Externe Dienste

| Dienst | Wofür | Erwähnt in |
|---|---|---|
| GitHub Pages | Hosting, HTTPS | Datenschutzerklärung, Abschnitt 02 |
| STRATO | Domain, DNS, E-Mail `kontakt@matija-tasic.de` | Datenschutzerklärung, Abschnitt 03 |
| GoatCounter | Besucherstatistik: Skript von `gc.zgo.at`, Zählerstand von `matija.goatcounter.com` | Datenschutzerklärung, Abschnitt 04 |

Neue externe Dienste immer zuerst in der Datenschutzerklärung ergänzen.

## Lizenzen der Schriften

Inter, IBM Plex Sans und Oxanium: SIL Open Font License 1.1. DejaVu Sans Mono: Bitstream Vera / DejaVu-Lizenz. Die Lizenztexte liegen in `assets/fonts/`.
