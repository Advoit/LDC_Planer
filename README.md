# LDC Planer

Eine **offline-first PWA** zum Planen und Ausführen von Bau- und Sanierungsprojekten. Alle Daten bleiben lokal auf dem Gerät (IndexedDB) – es wird kein Server oder Backend benötigt. Nach dem ersten Laden funktioniert die App vollständig offline.

## Funktionen im Überblick

| Bereich | Funktionen |
| --- | --- |
| **Projekte** | Neues Projekt mit Name, Ort und Beschreibung; individuelle 8-stellige Projekt-ID |
| **Aufgaben** | Vorher-/Nachher-Bilder, Dokumente, Material mit Intellisense, geplanter Arbeitsaufwand (hh:mm), Personalbedarf, **Typ** (Mängel/Umbau) und **Art** (A1–C3) |
| **Mängel-Felder** | Bei Typ „Mängel“: Prüfung, Fehlerbeschreibung (mehrzeilig) und Position – letzte Wahl/Eingabe bleibt erhalten |
| **Status** | Offen → Hinweis → Behoben mit Pflichtfeldern („Bearbeitet von“, „Bearbeitet am“, Hinweistext) |
| **Übersicht** | Aufklappbare Suche & Filter (Status + Typ Mängel/Umbau), Sortierung nach Name, Status, Zeitaufwand, Art oder Position |
| **Unterlagen** | Pläne und Dokumente projekt- oder aufgabenbezogen, mit Web-Vorschau (PDF, Bilder, Text) |
| **Sichern & Laden** | Projekt als ZIP exportieren, später laden, zusammenführen oder überschreiben |
| **Exporte** | Projektbericht und Materialliste als PDF, **Mängelreport als PPTX** (wie die Vorlage) |

## Nutzungsanleitung

### Projekt anlegen und verwalten

1. **Neues Projekt**: In der Leiste unter **Projekt → Neues Projekt** anlegen (Name und Ort sind Pflicht). Beim Anlegen eines neuen Projekts werden vorhandene Daten entfernt – es erscheint eine Sicherheitsabfrage.
2. **Speichern**: Das Projekt wird automatisch lokal gespeichert. Zusätzlich kann es unter **Projekt → Speichern** als ZIP-Datei heruntergeladen werden (Sicherung).
3. **Laden**: Unter **Projekt → Laden** eine gesicherte ZIP-Datei importieren. Ist bereits ein Projekt geöffnet, kann man **Zusammenführen** oder **Überschreiben** wählen – auch bei unterschiedlicher Projekt-ID ist das Zusammenführen möglich (die Import-ID geht dabei verloren, nur die Aufgaben werden angehängt).

### Aufgaben erstellen und bearbeiten

- **Neue Aufgabe** unter **Aufgaben → Neue Aufgabe**:
  - Name und Beschreibung (Pflicht)
  - **Vorher-Bilder** hochladen (antippen zum Vergrößern), eines davon als Vorschau-Bild wählen
  - **Dokumente** (Pläne, Anhänge) hinzufügen
  - **Material** mit Intellisense: Bekannte Artikel aus anderen Aufgaben werden mit der zuletzt verwendeten Einheit vorgeschlagen
  - **Geplanter Arbeitsaufwand** (hh:mm, optional) und **Personalbedarf** (Anzahl Personen, Standard: 1)
  - **Typ** (Mängel / Umbau/Neuinstallation) und **Art** (A1–C3) – die letzte Wahl bleibt für neue Aufgaben erhalten
  - Bei Typ **Mängel** werden zusätzlich **Prüfung**, **Fehlerbeschreibung** und **Position** eingeblendet (letzte Eingaben bleiben erhalten)
- **Bearbeiten**: In der Leiste **Aufgaben → Editieren** aktivieren, dann erscheint an jeder Aufgabe ein Bleistift. Aufgaben lassen sich bearbeiten oder löschen.

### Status einer Aufgabe verwalten

Eine Aufgabe in der Übersicht antippen, um die Detailansicht zu öffnen:

- **Offen → Hinweis**: „Bearbeitet von“ und „Bearbeitet am“ sind Pflicht, zusätzlich muss ein **Hinweistext** angegeben werden. Optional können **Nachher-Bilder** und **Nachher-Dokumente** hochgeladen werden.
- **Hinweis → Behoben** (oder direkt Offen → Behoben): „Bearbeitet von“ und „Bearbeitet am“ sind Pflicht.

### Unterlagen verwalten

- **Projektbezogene Unterlagen** (z. B. Pläne, Genehmigungen) unter **Dokumente → Unterlagen**.
- **Aufgabenbezogene Dokumente** direkt beim Erstellen/Bearbeiten einer Aufgabe.
- Dokumente lassen sich per **Web-Vorschau** (PDF, Bilder, Text) öffnen oder herunterladen.

### Exporte

- **Mängelreport** unter **Dokumente → Mängelreport**: Erstellt eine **PPTX-Datei auf Basis der Vorlage** (`Mängelsreport.pptx`, Seite 1 = Deckblatt, ab Seite 2 eine Reportseite pro Mängel). Es öffnet sich zuerst das Fenster **„Deckblatt Einstellungen“** für Kennung, Saal, Straße, PLZ/Ort, Leitende EFK und Ausführungstermin (Eingaben werden gemerkt). Die Mängel werden **nach Position sortiert** übernommen, inkl. Material, Prüfung, Fehlerbeschreibung und Hinweis zur Behebung. Fotos (Vorher- und Nachher-Bilder, bis zu 8) werden als Raster in der Foto-Fläche platziert – 1 Bild groß, 2 Bilder nebeneinander, mehr im 2-Spalten-Raster – ohne dass die Reportseite mehr Platz braucht.
- **Projektbericht** unter **Dokumente → Projekt Export**: Enthält Deckblatt, Inhaltsverzeichnis, Projektinformationen, Unterlagen und alle ausgewählten Aufgaben (Status wählbar, Standard: alle). Beschreibung, Material, Hinweise sowie Vorher-/Nachher-Bilder werden mit exportiert.
- **Materialliste** unter **Dokumente → Material Export**: Nach Aufgaben gruppiert oder als summierte Gesamtliste (nach Name + Einheit). Abgeschlossene Aufgaben können wahlweise einbezogen werden.

Die Exporte werden als echte Dateien (PDF/PPTX) heruntergeladen – es öffnet sich kein neues Fenster. In der Übersicht lässt sich zusätzlich nach **Mängel** bzw. **Umbau/Neuinstallation** filtern (beide sind standardmäßig eingeblendet).

## Projektdatei-Format

Eine Sicherung ist eine `.zip` mit folgender Struktur:

```
LDC-Projekt-<PROJEKT-ID>/
├── project.json              # Projekt-Metadaten + Dokumenten-Referenzen
├── documents/                # Projektbezogene Unterlagen
└── tasks/
    └── <AUFGABEN-ID>/
        ├── task.json         # Aufgabendaten + Dokumenten-Referenzen
        ├── thumbnail.png
        ├── images/           # Vorher-/Nachher-Bilder
        └── documents/        # Aufgaben-Dokumente
```

Bilder und Dokumente werden per **SHA-256-Hash** dedupliziert – beim Zusammenführen werden identische Dateien übersprungen, unterschiedliche angehängt. Alte Sicherungen (`.ldcproj`) bleiben ladbar.

## Entwicklung

**Tech-Stack:** TypeScript (strict) · Vite · Vanilla JS (kein Framework) · IndexedDB · vite-plugin-pwa (autoUpdate) · fflate (ZIP) · pdf-lib (PDF-Export) · Vitest

```bash
npm install     # Abhängigkeiten installieren
npm run dev     # Dev-Server starten → http://localhost:5173
npm run build   # Typecheck + Production-Build nach dist/
npm test        # Tests ausführen

npm run embed:mangels   # nach Änderungen an Mängelsreport.pptx (Vorlage neu einbetten)
```

## Lizenz

Privat / intern – kein Open-Source-Lizenzmodell hinterlegt.
