# LDC Projekt Planer

Eine **offline-first PWA** zum Planen und Ausführen von Bau- und Sanierungsprojekten. Alle Daten bleiben lokal auf dem Gerät – es wird kein Server oder Backend benötigt.

## Highlights

- 🔒 **100 % lokal** – Projekte, Bilder und Dokumente liegen ausschließlich in der IndexedDB des Browsers
- 📱 **Installierbar** – als PWA auf Smartphone, Tablet und Desktop nutzbar, vollständig offline
- 🗜️ **Sichern & Zusammenführen** – Projekt als ZIP exportieren, später laden oder per Aufgaben-ID zusammenführen
- 📋 **Aufgaben** – mit Status (Offen/Hinweis/Behoben), Vorher-/Nachher-Bildern, Material und Arbeitsaufwand
- 📄 **Exporte** – Materialliste und komplettes Projekt als druckbares PDF
- 📎 **Unterlagen** – Pläne und Dokumente projekt- oder aufgabenbezogen verwalten

## Funktionen

| Bereich | Details |
| --- | --- |
| Projekt | Name, Ort, Beschreibung, individuelle Projekt-ID (8 Zeichen) |
| Sichern | Export als `.zip` mit sauberer Ordnerstruktur (JSON + Bilder + Dokumente) |
| Laden | ZIP importieren, bei gleicher ID zusammenführen oder überschreiben |
| Zusammenführen | Konfliktlösung pro Aufgabe, Deduplizierung per SHA-256-Hash |
| Aufgaben | Bilder mit Thumbnail-Picker, Material mit Intellisense, geplanter Aufwand (hh:mm) |
| Übersicht | Suche, Filter (Offen/Hinweis/Behoben), Sortierung, 60×60-Vorschauen |
| Status | Offen → Hinweis → Behoben mit Pflichtfeldern „Bearbeitet von“/„Bearbeitet am“ |
| Material | Druck als Aufgabenliste oder summierte Gesamtliste |
| PDF | Gesamtes Projekt als strukturierter Bericht |
| Unterlagen | Dateien projekt- oder aufgabenbezogen hochladen und herunterladen |

## Tech-Stack

- **TypeScript** (strict) + **Vite**
- **Vanilla JS** – kein Framework
- **IndexedDB** – lokale, offline-fähige Speicherung
- **vite-plugin-pwa** – PWA-Support (autoUpdate)
- **fflate** – ZIP-Erzeugung und -Entpacken
- **Vitest** – Unit-Tests (Merge, Migration, Material, Roundtrip)

## Schnellstart

```bash
npm install     # Abhängigkeiten installieren
npm run dev     # Dev-Server starten → http://localhost:5173
npm run build   # Typecheck + Production-Build nach dist/
npm test        # Tests ausführen
```

## Deployment auf GitHub Pages

Ein Push auf `main` baut die App automatisch und veröffentlicht sie über den GitHub-Actions-Workflow (`.github/workflows/deploy.yml`).

**Einmalige Einrichtung:**

1. Repository anlegen und Code auf `main` pushen
2. In den Repo-Settings unter **Pages → Build and deployment** die Quelle **„GitHub Actions“** auswählen
3. Den Workflow über **Actions → „Deploy to GitHub Pages“** starten

Die App ist danach unter `https://<BENUTZER>.github.io/<REPO>/` erreichbar. Zum Offline-Nutzen einfach „Zum Home-Bildschirm hinzufügen“ wählen.

> **Hinweis:** GitHub Pages erfordert ein öffentliches Repository (bei privaten Repos ein kostenpflichtiger Plan).

## Projektdatei-Format

Eine Projektdatei ist eine `.zip` mit folgender Struktur:

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

Bilder und Dokumente werden per **SHA-256-Hash** dedupliziert – beim Zusammenführen werden identische Dateien übersprungen, unterschiedliche angehängt.

## Lizenz

Privat / intern – kein Open-Source-Lizenzmodell hinterlegt.
