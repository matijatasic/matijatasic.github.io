# matija-tasic.de

Persönliche Homepage von Matija Tasic, gehostet mit GitHub Pages.

- Reines HTML, CSS und etwas JavaScript, kein Build-Schritt
- Deutsch mit Umschalter auf Englisch, helle und dunkle Darstellung
- Schriften lokal eingebunden (Inter, DejaVu Sans Mono), keine Cookies, kein Tracking

## Aufbau

| Pfad | Inhalt |
|---|---|
| `index.html` | Startseite mit allen Kapiteln |
| `impressum.html`, `datenschutz.html` | Rechtstexte |
| `404.html` | Fehlerseite |
| `assets/css/site.css` | Gestaltung, Farben für hell und dunkel |
| `assets/js/site.js` | Sprach- und Darstellungsschalter, Leitung, Kontaktformular |
| `assets/js/config.js` | Einstellungen für das Kontaktformular |
| `assets/fonts/` | Schriften mit Lizenzen |

## Lokal ansehen

```sh
python3 -m http.server 8000
```

Danach im Browser `http://localhost:8000` öffnen.

## Lizenzen der Schriften

Inter: SIL Open Font License 1.1. DejaVu Sans Mono: Bitstream Vera / DejaVu-Lizenz. Die Lizenztexte liegen in `assets/fonts/`.
