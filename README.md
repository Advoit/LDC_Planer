<div align="center">

# LDC Planer

**Bau- und Sanierungsprojekte planen, abarbeiten und dokumentieren – offline, ohne Konto, ohne Server.**

### ▶︎ [App öffnen](https://advoit.github.io/LDC_Planer/)

<img src="https://img.shields.io/badge/offline--f%C3%A4hig-nach%20dem%20ersten%20Laden-34C759?style=flat-square" alt="offline-fähig"> <img src="https://img.shields.io/badge/Daten-bleiben%20auf%20dem%20Ger%C3%A4t-007AFF?style=flat-square" alt="Daten bleiben lokal"> <img src="https://img.shields.io/badge/mobil%20%26%20Desktop-responsiv-1D1D1F?style=flat-square" alt="mobil und Desktop"> <img src="https://img.shields.io/badge/installierbar-als%20App-FF9500?style=flat-square" alt="installierbar">

</div>

---

## Kurz gesagt

Der LDC Planer ist eine Web-App für die Baustelle: Mängel und Umbau-Aufgaben erfassen, Fotos und Pläne anhängen, den Bearbeitungsstand nachhalten und am Ende Bericht, Materialliste oder Instandsetzungsreport ausgeben.

- **Alles bleibt lokal.** Keine Anmeldung, kein Server, keine Datenübertragung – die Projekte liegen im Browser-Speicher des Geräts.
- **Auch ohne Netz.** Einmal geladen, funktioniert die App vollständig offline. Am Handy lässt sie sich wie eine normale App installieren.
- **Sicherbar.** Jedes Projekt lässt sich als ZIP-Datei sichern, wieder laden, zusammenführen oder überschreiben.

## Funktionen

**📁 Projekte**
- Beliebig viele Projekte parallel verwalten – öffnen, wechseln, löschen
- Neues Projekt mit Name, Ort und Beschreibung (individuelle 8-stellige Projekt-ID)
- Projekt-ZIP laden per Knopf **oder** einfach in die Ablagefläche auf der Startseite ziehen
- Beim Laden wählen: **zusammenführen** (auch bei anderer Projekt-ID) oder **überschreiben**

**📝 Aufgaben**
- Name und Beschreibung, Typ **Mängel** oder **Umbau/Neuinstallation**, Art **A1–C3**
- Bei Mängeln zusätzlich: Prüfung, Fehlerbeschreibung, Position
- Vorher- und Nachher-Bilder (antippen zum Vergrößern), Vorschaubild wählbar, auf dem Handy **direkt fotografieren**
- Große Fotos werden beim Hochladen automatisch verkleinert (längste Kante 1600 px)
- Dokumente und Pläne je Aufgabe oder je Projekt, mit Vorschau im Browser
- Material mit Vorschlägen aus früheren Aufgaben (Artikel **und** zuletzt verwendete Einheit)
- Geplanter Arbeitsaufwand (hh:mm) und Personalbedarf
- **Duplizieren** für ähnliche Aufgaben – Material und Bilder kommen mit, der Status startet neu

**✅ Status & Übersicht**
- Statusfluss **Offen → Hinweis → Behoben** mit Pflichtfeldern („Bearbeitet von“, „Bearbeitet am“, Hinweistext)
- **Schnellwechsel** in der Detailansicht: Status antippen – Name und Datum sind vorbelegt
- Suche und Filter (Status, Typ), Sortierung nach Name, Status, Zeitaufwand, Art oder Position
- **Auswahlmodus**: mehrere Aufgaben auf einmal umstellen, als PDF ausgeben oder löschen
- Aufgaben einzeln als PDF-Blatt ausgeben

**🛟 Wiederherstellung**
- **Papierkorb** für gelöschte Aufgaben (max. 10) – inklusive „Rückgängig“ direkt nach dem Löschen
- **Sicherungsstände**: vor Überschreiben, Zusammenführen und Wiederherstellen wird automatisch ein Stand gesichert

## Exporte

| Export | Inhalt | Datei |
| --- | --- | --- |
| **Projektbericht** | Deckblatt, klickbares Inhaltsverzeichnis, Projektinformationen, Unterlagen und alle Aufgaben – nach Status gruppiert, jede Aufgabe auf eigener Seite | PDF |
| **Materialliste** | nach Aufgaben gruppiert oder als summierte Gesamtliste (nach Name + Einheit) | PDF, CSV |
| **Einzelaufgabe** | eine Aufgabe als Blatt zum Ausdrucken oder Weitergeben | PDF |
| **Instandsetzungsreport** | Report auf Basis der Vorlage `Instandsetzungsreport.pptx`, eine Seite pro Mangel, sortiert nach Position | PPTX |

<details>
<summary><strong>Mehr zum Instandsetzungsreport</strong></summary>

- Zuerst öffnet sich das Fenster **„Deckblatt Einstellungen“**: Kennung, Saal, Straße, PLZ/Ort, Leitende EFK und Ausführungstermin. Die Angaben werden im Projekt gespeichert und mit der Sicherung exportiert.
- Beim Ausführungstermin ist auch **„Unbekannt“** möglich – im Report steht dann `XX.XX.<aktuelles Jahr>`.
- Mängel werden **natürlich nach Position sortiert** („A1“ vor „A2“ vor „A10“) und enthalten Material, Prüfung, Fehlerbeschreibung sowie den Hinweis zur Behebung.
- Fotos landen in den beiden Kacheln der Vorlage: **oben Vorher-, unten Nachher-Bilder** (je bis zu 4) – als Raster 1 groß, 2 nebeneinander, 3 als 2+1, 4 als 2×2.

</details>

## Los geht's

1. **[App öffnen](https://advoit.github.io/LDC_Planer/)** – es ist keine Installation und keine Anmeldung nötig.
2. **Optional als App installieren:** am Handy „Zum Startbildschirm hinzufügen“, am Desktop das Installations-Symbol in der Adressleiste. Danach startet der Planer wie eine eigene App.
3. **Projekt anlegen** (Name und Ort sind Pflicht) und Aufgaben erfassen – gespeichert wird automatisch.

## Speichern & Daten

- **Automatisch:** Jede Änderung wird lokal gespeichert, spätestens beim Tab-Wechsel oder Schließen.
- **Als Datei:** **Projekt → Speichern** schreibt eine ZIP-Sicherung mit allen Bildern und Dokumenten.
- **Speicherplatz:** Die App fordert dauerhaften Speicher an und warnt, wenn es knapp wird – dann hilft eine ZIP-Sicherung.
- **Keine Cloud:** Es gibt kein Backend. Nichts verlässt das Gerät, es sei denn, Sie geben eine Datei selbst weiter.

<details>
<summary><strong>Aufbau der Projektdatei</strong></summary>

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

Bilder und Dokumente werden per **SHA-256-Hash** dedupliziert – beim Zusammenführen werden identische Dateien übersprungen, unterschiedliche angehängt. Ältere Sicherungen (`.ldcproj`) bleiben ladbar.

</details>

## Entwicklung

**Stack:** TypeScript (strict) · Vite · Vanilla JS ohne Framework · IndexedDB · vite-plugin-pwa · fflate (ZIP) · pdf-lib (PDF) · Vitest

```bash
npm install     # Abhängigkeiten installieren
npm run dev     # Dev-Server starten → http://localhost:5173
npm run build   # Typecheck + Production-Build nach dist/
npm test        # Tests ausführen

npm run embed:instandsetzungs   # Instandsetzungsreport.pptx neu einbetten (nach Vorlagenänderungen)
```

Der Branch `main` wird per GitHub Actions automatisch nach GitHub Pages veröffentlicht ([Workflow](.github/workflows/deploy.yml)).

<details>
<summary><strong>Projektstruktur</strong></summary>

```
src/
├── core/     Infrastruktur: IndexedDB (storage, project-store, recovery-store),
│             Migration, Hashing, Bild-Komprimierung, Dateinamen, Einstellungen
├── domain/   Fachlogik ohne UI: types, task (inkl. Duplizieren/Sammelstatus),
│             project, task-filter, sort, merge, material
├── io/       Dateien: ZIP-Export/-Import, PDF (pdf, pdf-cover, pdf-toc, pdf-task),
│             Projektbericht, Aufgaben-PDF, Materialliste (PDF/CSV), PPTX-Report
├── ui/       Oberfläche: app-state + Aktionen, Toolbar, Startseite, Projektliste,
│             Aufgabenliste/-formular/-detail, Dialoge, Assistenten
├── styles/   CSS (Variablen, Layout, Komponenten)
├── app.ts    App-Shell: Init, Rendering, Verdrahtung
└── main.ts   Einstiegspunkt + Service-Worker
```

</details>

## Lizenz

Privat / intern – kein Open-Source-Lizenzmodell hinterlegt.
