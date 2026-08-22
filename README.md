# LDC Projekt Planer

Eine **dynamische PWA** zum Planen und Ausführen von Projekten – **offline-first, local-first**.

Alle Daten bleiben **lokal auf dem Gerät** (IndexedDB). Es werden keine Daten an einen Server gesendet – der Server dient nur als „Gerüst“ zum Ausliefern der App (GitHub Pages). Die App funktioniert nach dem ersten Laden **vollständig offline**, inklusive aller Bilder.

## Features

- **Neues Projekt** anlegen (Name, Ort, Beschreibung) mit individueller Projekt-ID (8 Zeichen) – mit Sicherheitsabfrage, da vorhandene Daten entfernt werden
- **Projekt sichern** als `.ldcproj`-ZIP mit sauberer Ordnerstruktur (JSON + Bilder)
- **Projekt laden / zusammenführen**:
  - Gleiche Projekt-ID → Zusammenführen oder Überschreiben wählbar
  - Unterschiedliche Projekt-ID → klare Meldung, nur „Aktuelles Projekt überschreiben“ möglich
  - Zusammenführen: Konflikte pro Aufgabe per Modal („Lokal behalten“ vs. „Importiertes übernehmen“), Bilder werden über **SHA-256-Hash** dedupliziert (gleicher Hash → überspringen, anderer Hash → anhängen)
- **Neue Aufgabe** mit Erstellungsdatum, Aufgaben-ID, Name, Beschreibung, Vorher-Bildern (antippen zum Vergrößern), Thumbnail-Picker (Standard: Bild 1), Material mit **Intellisense** (Name + zuletzt verwendete Einheit) und geplantem Arbeitsaufwand (hh:mm)
- **Aufgabe bearbeiten** (Toggle in der Toolbar): Bleistift an jeder Aufgabe, Felder wie bei „Neue Aufgabe“ + Löschen
- **Aufgabenübersicht** mit Suche, Filter (Offen/Hinweis/Behoben) und Sortierung (Name/Status/Zeitaufwand), Client-seitige 60×60-Thumbnails (Canvas, mittig zugeschnitten)
- **Aufgaben-Detail** (Antippen): Statuswechsel Offen → Hinweis → Behoben mit Pflichtfeldern „Bearbeitet von“/„Bearbeitet am“, Hinweistext (Pflicht bei „Hinweis“), Nachher-Bilder
- **Materialliste drucken**: nach Aufgaben oder als Gesamtliste (nach Name + Einheit summiert), nur offene Aufgaben – abgeschlossene nur mit Checkbox

## Technik

| Bereich | Wahl |
| --- | --- |
| Sprache | TypeScript (strict) |
| Framework | Vanilla (kein Framework) + Vite |
| Speicherung | IndexedDB (lokal, offline) |
| PWA | `vite-plugin-pwa` (Workbox), autoUpdate |
| ZIP | `fflate` |
| Tests | Vitest (Merge, Migration, Material, Export/Import-Roundtrip) |

### Architektur & Regeln

- **DRY** und **SRP**: kleine, fokussierte Module
- Klassen/Module maximal **300 Zeilen** – Ausnahme: Datenklassen/DTOs in `src/domain/types.ts` (bewusst kompakt, ohne Logik)
- **Sprechende Namen** für extrahierte Methoden und neue Klassen (Zweck im Namen)
- **Datenmigration** mit maximaler Abwärtskompatibilität: `src/core/migrate.ts` normalisiert alte Daten schrittweise (`schemaVersion`, Default-Werte für fehlende Felder) – alte `.ldcproj`-Dateien und alte lokale Daten bleiben ladbar

## Lokale Entwicklung

```bash
npm install        # Abhängigkeiten installieren
npm run dev        # Dev-Server starten (http://localhost:5173)
npm run build      # Typecheck + Production-Build nach dist/
npm run preview    # Build lokal testen
npm test           # Tests ausführen
npm run icons      # PWA-Icons neu generieren (nur bei Bedarf)
```

## Release über GitHub Pages

Die App wird automatisch über einen GitHub-Actions-Workflow (`.github/workflows/deploy.yml`) auf GitHub Pages veröffentlicht, sobald Änderungen auf den `main`-Branch gepusht werden.

### Einmalige Einrichtung

1. **Repository anlegen** und Code pushen:
   ```bash
   git init
   git add .
   git commit -m "LDC Projekt Planer"
   git branch -M main
   git remote add origin https://github.com/<BENUTZER>/<REPO>.git
   git push -u origin main
   ```
   > **Hinweis:** GitHub Pages funktioniert nur bei **öffentlichen Repos** (oder mit einem kostenpflichtigen GitHub-Plan bei privaten Repos).

2. **GitHub Pages aktivieren**:
   - Repository → **Settings → Pages**
   - Unter **Build and deployment**: Quelle **„GitHub Actions“** auswählen (nicht „Deploy from a branch“)

3. **Release auslösen**:
   - Ein Push auf `main` löst den Workflow automatisch aus
   - Manuell: **Actions → „Deploy to GitHub Pages“ → Run workflow**

4. **Veröffentlichen**:
   - Der Workflow baut die App (`npm run build`) und veröffentlicht das `dist/`-Verzeichnis
   - Die App ist danach unter folgender URL erreichbar:
     ```
     https://<BENUTZER>.github.io/<REPO>/
     ```
   - Den aktuellen Status zeigt die Übersicht **Actions → Deploy to GitHub Pages**

5. **Auf dem Gerät installieren (PWA)**:
   - Website im Browser öffnen → Installieren/„Zum Home-Bildschirm hinzufügen“
   - Danach komplett offline nutzbar

### Neue Version veröffentlichen

1. Änderungen committen und auf `main` pushen
2. Kurz in den **Actions**-Tab schauen, bis „Deploy to GitHub Pages“ grün ist
3. Seite mit `Strg/Cmd + F5` neu laden – die PWA aktualisiert sich automatisch (autoUpdate)

## Projektdatei-Format (.ldcproj)

Eine `.ldcproj`-Datei ist eine **ZIP-Datei** mit folgender Struktur:

```
LDC-Projekt-<PROJEKT-ID>/
├── project.json              # Projekt-Metadaten (ID, Name, Ort, Beschreibung)
└── tasks/
    └── <AUFGABEN-ID>/
        ├── task.json         # Aufgabendaten (inkl. Material, Status)
        ├── thumbnail.png     # 60×60-Vorschaubild
        └── images/
            ├── <BILD-ID>.png # Vorher-Bilder
            └── <BILD-ID>.jpg # Nachher-Bilder
```

Bilder werden über ihren **SHA-256-Hash** der Bilddaten dedupliziert – beim Zusammenführen werden identische Bilder übersprungen, unterschiedliche angehängt.

## Lizenz

Privat / intern – kein Open-Source-Lizenzmodell hinterlegt.
