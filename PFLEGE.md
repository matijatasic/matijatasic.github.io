# Pflege-Anleitung für matija-tasic.de

Diese Anleitung erklärt, wie du die Homepage selbst änderst, ohne KI-Werkzeug.
Stand: 24.11.2026, geprüft gegen den Code in diesem Repository.

---

## 1. Grundprinzip

- Die Seite besteht nur aus **HTML, CSS und JavaScript**. Es gibt **keinen Build-Schritt**, kein Framework, kein `npm install`.
- Was im Branch `main` liegt, ist die Seite. Jeder Push auf `main` wird von GitHub Pages **automatisch veröffentlicht**, meist innerhalb einer Minute.
- `.nojekyll` sorgt dafür, dass GitHub die Dateien unverändert ausliefert.
- **Rückweg:** Jede Änderung ist ein Commit. Ein Fehler lässt sich jederzeit mit einem Revert rückgängig machen (siehe Abschnitt 3).

**Nicht anfassen:**

| Datei | Warum |
|---|---|
| `CNAME` | Enthält `matija-tasic.de`. Ändern oder Löschen trennt die Domain von der Seite. |
| `.nojekyll` | Ohne die Datei versucht GitHub, die Seite mit Jekyll zu bauen. |

---

## 2. Werkzeuge

Du brauchst kein Claude und keine kostenpflichtige Software.

| Werkzeug | Gut für | So geht's |
|---|---|---|
| GitHub im Browser | Kleine Textkorrekturen, auch am Handy | Datei im Repo öffnen → Stift-Symbol → ändern → „Commit changes“ |
| github.dev | Mehrere Dateien auf einmal | Im Repo am PC die Taste `.` drücken. VS Code öffnet sich im Browser. |
| VS Code + GitHub Desktop | Größere Änderungen, Vorschau vor dem Veröffentlichen | Repo klonen, lokal ändern und prüfen, dann pushen |

**Lokale Vorschau** (im Ordner des Repos):

```sh
python3 -m http.server 8000
```

Dann im Browser `http://localhost:8000` öffnen. Wichtig: nicht die HTML-Datei per Doppelklick öffnen, sonst funktionieren manche Pfade nicht.

---

## 3. Sicherer Ablauf für Änderungen

So wie bisher, nur ohne KI:

1. **Branch anlegen** (z. B. `text-profil-aktualisieren`). Nie direkt auf `main` arbeiten, außer bei einem Tippfehler.
2. **Ändern und lokal prüfen** (Checkliste in Abschnitt 6).
3. **Pull Request** auf `main` öffnen. Der Diff zeigt genau, was sich ändert.
4. **Mergen.** GitHub veröffentlicht die Seite selbst.
5. **Live prüfen** auf matija-tasic.de (ggf. mit Strg+F5 neu laden).

**Rückgängig machen:** Im gemergten Pull Request auf „Revert“ klicken und den neuen PR mergen. Lokal geht es mit:

```sh
git revert <commit-id>
git push
```

`git revert` löscht nichts aus der Historie, sondern legt einen Gegen-Commit an. Das ist der sichere Weg. `git reset --hard` mit `push --force` auf `main` bitte nicht verwenden.

---

## 4. Die zwei Regeln, die du kennen musst

### Regel 1: Jeder Text steht zweimal (Deutsch und Englisch)

Jeder sichtbare Text steht doppelt im HTML:

```html
<span data-l="de">Ausgewählte Projekte.</span>
<span data-l="en">Selected projects.</span>
```

Der Sprachschalter blendet per CSS die jeweils andere Fassung aus.
**Wenn du einen Text änderst, ändere immer beide Fassungen.** Sonst stimmt die englische Seite nicht mehr.

Ein paar Texte stehen zusätzlich in Attributen, z. B. für Screenreader:
`aria-label`, `data-aria-de`, `data-aria-en`, `data-ph-de`, `data-ph-en`. Bei Links und Formularfeldern diese mitpflegen.

### Regel 2: Cache-Buster hochzählen, wenn du CSS oder JS änderst

CSS- und JS-Dateien sind so eingebunden:

```html
<link rel="stylesheet" href="assets/css/site.css?v=2026110508">
```

Browser merken sich diese Dateien. Damit Besucher nach einer Änderung die neue Fassung bekommen, zählst du die Nummer nach `?v=` hoch (Schema `JJJJMMTTnn`, z. B. `2026112401`).

- Nur nötig bei Änderungen an `.css`- oder `.js`-Dateien, **nicht** bei reinen HTML-Texten.
- Die Nummer in **allen HTML-Dateien** anpassen, die diese Datei einbinden. Suche in VS Code mit Strg+Umschalt+F nach dem Dateinamen, z. B. `site.css?v=`.
- Für `site.css` gilt: in allen 6 HTML-Dateien dieselbe Nummer (seit 24.11.2026 einheitlich).
- Einige JS-Dateien der IT-Tools (z. B. `ipcalc.js`, `ports.js`) sind ohne `?v=` eingebunden. Wenn du eine davon änderst, beim Einbinden ein `?v=` ergänzen.
- Hintergrund: GitHub Pages lässt Browser Dateien nur rund 10 Minuten zwischenspeichern. Ein vergessener Cache-Buster ist also kein Drama, sorgt aber für kurze Zeit für eine gemischte Darstellung.

---

## 5. Häufige Änderungen

### 5.1 Text auf der Startseite ändern

1. `index.html` öffnen.
2. Kapitel finden: Suche nach `id="profil"`, `id="weiterbildungen"`, `id="projekte"` oder `id="kontakt"`.
3. Text ändern, **deutsch und englisch** (Regel 1).

### 5.2 Neues Zertifikat hinzufügen

1. Zertifikat als PDF oder JPG nach `assets/zertifikate/` legen. Dateiname klein, ohne Leerzeichen und Umlaute, z. B. `active-directory-grundlagen.pdf`.
2. In `index.html` im Kapitel „Zertifikate“ (`id="weiterbildungen"`) die passende Kategorie suchen (z. B. „Microsoft &amp; Cloud“).
3. Dort einen bestehenden `<li>…</li>`-Eintrag kopieren und anpassen:
   - `<time>` mit Monat und Jahr (`MM.JJJJ`)
   - `href` auf die neue Datei
   - Kursname im Link-Text und in `aria-label`, `data-aria-de`, `data-aria-en`
   - Neue Einträge oben einfügen, die Liste ist nach Datum absteigend sortiert.
4. **Zähler anpassen**, sie werden nicht automatisch berechnet:
   - Anzahl der Kurse der Kategorie: `<span class="pq-layer d">4 <span data-l="de">Kurse</span>…` → Zahl erhöhen
   - Gesamtzahl (derzeit 20) steht **an drei Stellen** in `index.html`:
     1. im Profiltext: „Seit 2024 habe ich 20 Weiterbildungen …“ (deutsch und englisch prüfen)
     2. im Kennzahlen-Band im Profil (`href="#weiterbildungen"`, Zahl steht in `data-l="de"` und `data-l="en"`)
     3. in der großen Kachel im Kapitel Zertifikate (`class="zq3-big"`)
   - Tipp: In VS Code nach `20` suchen und nur diese Treffer ändern.

### 5.3 Neues Projekt hinzufügen

1. In `index.html` im Kapitel `id="projekte"` den Block `<div class="pq6">` suchen.
2. Ein komplettes bestehendes `<article>…</article>` kopieren (z. B. Proxmox Backup Server).
3. Anpassen: Titel, Beschreibung (DE und EN), Tags in `<ul class="tags">`, Link auf das GitHub-Repo des Projekts.
4. Das Symbol im Kreis ist ein kleines SVG. Du kannst das vorhandene behalten oder von einem anderen Projekt übernehmen.

### 5.4 Farben ändern

Farben stehen als Variablen oben in `assets/css/site.css`:

- `:root { … }` = helle Darstellung
- `:root[data-theme="dark"] { … }` = dunkle Darstellung

Weiter unten in der Datei werden einzelne Werte für das Layout „Netzplan“ noch einmal überschrieben. Wenn eine Änderung oben keine Wirkung zeigt, nach dem Variablennamen (z. B. `--bg`) in der ganzen Datei suchen. Danach Cache-Buster hochzählen (Regel 2).

### 5.5 Neue Unterseite anlegen

1. Eine bestehende Unterseite kopieren und den Inhalt ersetzen. Für eine Seite, die bei Google erscheinen soll, `werkzeuge.html` als Vorlage nehmen (hat `canonical`). `impressum.html` und `datenschutz.html` sind bewusst ohne `canonical` und auf `noindex` gesetzt.
2. Link in der Kopfleiste ergänzen. Die Kopfleiste steht in **jeder** HTML-Datei einzeln (alle 6 Seiten), also überall nachtragen, auch im Handy-Raster.
3. Seite in `sitemap.xml` eintragen (wenn Suchmaschinen sie finden sollen).
4. In der neuen Seite `<title>`, `<meta name="description">` und `<link rel="canonical">` auf die neue Adresse anpassen.

### 5.6 Sitemap aktuell halten

Nach größeren inhaltlichen Änderungen in `sitemap.xml` bei der betroffenen Seite `<lastmod>` auf das heutige Datum setzen (`JJJJ-MM-TT`).

---

## 6. Prüfen vor dem Veröffentlichen

- [ ] Lokale Vorschau läuft (`python3 -m http.server 8000`)
- [ ] Deutsch **und** Englisch umgeschaltet und gelesen
- [ ] Hell **und** Dunkel geprüft
- [ ] Handy-Ansicht: Browser-Entwicklertools (F12) → Gerätesymbol → z. B. 390 px Breite, kein seitliches Scrollen
- [ ] Browser-Konsole (F12 → Konsole): keine roten Fehler
- [ ] Bei Änderungen an CSS/JS: Cache-Buster hochgezählt
- [ ] Bei Änderungen an den IT-Tools oder am Quiz: Tests laufen (siehe unten)

**Tests** (brauchen nur Node.js, keine Pakete):

```sh
for t in tests/*.test.js; do node "$t" || echo "FEHLER in $t"; done
```

Stand 24.11.2026: alle 8 Testdateien laufen ohne Fehler.

---

## 7. Rechtliches und Datenschutz

- Die Seite nutzt **GoatCounter** für eine Besucherstatistik ohne Cookies: Das Zählskript kommt von `gc.zgo.at` (in jeder HTML-Datei), der Zählerstand in der Fußzeile wird von `matija.goatcounter.com` abgefragt (`assets/js/site.js`). Beides steht in der Datenschutzerklärung, Abschnitt 04.
- **Wenn du einen neuen externen Dienst einbindest** (Schriften, Videos, Karten, Formular-Dienst, Analyse), muss die Datenschutzerklärung (`datenschutz.html`) angepasst werden. Im Zweifel lieber lokal einbinden, so wie die Schriften in `assets/fonts/`.
- Neue Schriften nur mit Lizenzdatei in `assets/fonts/` ablegen.
- Keine Passwörter, Schlüssel oder privaten Daten ins Repository. Es ist öffentlich, und gelöschte Dateien bleiben in der Git-Historie.

---

## 8. Kontaktformular

`assets/js/config.js` steuert das Formular:

- `formEndpoint: ''` (leer) = das Formular öffnet beim Absenden das E-Mail-Programm des Besuchers (`mailto`). So ist es gewollt, ohne fremden Dienst.
- `email` = Zieladresse (`kontakt@matija-tasic.de`).

Wer später einen Formular-Dienst nutzen will, trägt dessen URL bei `formEndpoint` ein und ergänzt die Datenschutzerklärung.

---

## 9. Bei jeder Änderung mitziehen

Damit Seite, Anleitung und Dokumentation zusammenpassen, nach jeder Änderung prüfen:

| Was hat sich geändert? | Was muss mit? |
|---|---|
| Text, Zahl oder Aussage auf der Seite | Beide Sprachen; gleiche Aussage auch an anderen Stellen (z. B. Zahl „20“ dreimal, Prüfungsergebnis) |
| CSS oder JS | Cache-Buster in allen betroffenen HTML-Dateien |
| Neue oder entfernte Datei | Tabelle in `README.md` und Abschnitt „Wo was liegt“ in dieser Datei |
| Neue Seite | Kopfleiste in allen Seiten, `sitemap.xml`, `README.md` |
| Neuer externer Dienst, neues Skript von fremdem Server, neue Speicherung im Browser | `datenschutz.html` (DE und EN) **vor** dem Veröffentlichen |
| Name, Anschrift, E-Mail | `impressum.html` und `datenschutz.html` |
| Neue Tool- oder Quiz-Logik | passender Test in `tests/` |
| Jede größere Änderung | Projektdoku im Repo [homepage-github-pages](https://github.com/matijatasic/homepage-github-pages): Stand, Änderungsverlauf, Entscheidungen |
| Abschluss | Tests laufen lassen, Checkliste aus Abschnitt 6 durchgehen |

---

## 10. Wo was liegt

| Datei / Ordner | Inhalt |
|---|---|
| `index.html` | Startseite: Start, Schwerpunkte, Profil, Zertifikate, Projekte, Kontakt |
| `werkzeuge.html` | IT-Tools |
| `terminal.html` | Terminal-Quiz (immer dunkel) |
| `impressum.html`, `datenschutz.html` | Rechtstexte |
| `404.html` | Fehlerseite (nutzt absolute Pfade mit `/`, weil sie unter jeder Adresse erscheinen kann) |
| `assets/css/site.css` | Gesamte Gestaltung |
| `assets/js/site.js` | Sprach- und Darstellungsschalter, Kopfleiste, Formular |
| `assets/js/quiz.js` | Terminal-Quiz |
| `assets/js/tools.js` | Oberfläche der IT-Tools |
| `assets/js/ipcalc.js`, `ports.js`, `pwgen.js`, `hash.js`, `cmds.js`, `binconv.js`, `cron.js` | Logik der einzelnen IT-Tools |
| `assets/js/config.js` | Einstellungen Kontaktformular |
| `assets/zertifikate/` | Zertifikate als PDF/JPG |
| `assets/img/` | Portrait, Favicon, Vorschaubild für soziale Netze (1200 × 630) |
| `assets/fonts/` | Inter, IBM Plex Sans, DejaVu Sans Mono, Oxanium mit Lizenzen |
| `tests/` | Tests der Tool- und Quiz-Logik |
| `robots.txt`, `sitemap.xml` | Hinweise für Suchmaschinen |

**Gespeichert im Browser der Besucher:** Sprache (localStorage), Darstellung nur für den laufenden Besuch (sessionStorage), Quiz-Rangliste (localStorage).
