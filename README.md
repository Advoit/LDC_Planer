<div align="center">

# LDC Planer

**Bau- und Sanierungsprojekte planen, abarbeiten und dokumentieren – offline, ohne Konto, optional mit Seafile-Abgleich.**

### ▶︎ [App öffnen](https://advoit.github.io/LDC_Planer/)

<img src="https://img.shields.io/badge/offline--f%C3%A4hig-nach%20dem%20ersten%20Laden-34C759?style=flat-square" alt="offline-fähig"> <img src="https://img.shields.io/badge/Daten-standardm%C3%A4%C3%9Fig%20lokal-007AFF?style=flat-square" alt="Daten bleiben standardmäßig lokal"> <img src="https://img.shields.io/badge/mobil%20%26%20Desktop-responsiv-1D1D1F?style=flat-square" alt="mobil und Desktop"> <img src="https://img.shields.io/badge/installierbar-als%20App-FF9500?style=flat-square" alt="installierbar">

</div>

---

## Kurz gesagt

Der LDC Planer ist eine Web-App für die Baustelle: Mängel und Umbau-Aufgaben erfassen, Fotos und Pläne anhängen, den Bearbeitungsstand nachhalten und am Ende Bericht, Materialliste oder Instandsetzungsreport ausgeben.

- **Standardmäßig lokal.** Keine Anmeldung, kein Zwang zu einem Server – die Projekte liegen im Browser-Speicher des Geräts. Wer möchte, verknüpft ein Projekt optional mit einer Seafile-Bibliothek.
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
- Vorher- und Nachher-Bilder – antippen zum Vergrößern, in der Großansicht **zoomen** (Mausrad, Doppelklick, +/−, Tastatur) und bei Zoom **verschieben**; Vorschaubild wählbar, auf dem Handy **direkt fotografieren**
- Große Fotos werden beim Hochladen automatisch verkleinert (längste Kante 1600 px)
- Dokumente und Pläne je Aufgabe oder je Projekt, mit Vorschau im Browser
- Material mit Vorschlägen aus früheren Aufgaben (Artikel **und** zuletzt verwendete Einheit)
- Geplanter Arbeitsaufwand (hh:mm) und Personalbedarf
- **Duplizieren** für ähnliche Aufgaben – Material und Bilder kommen mit, der Status startet neu

**☁️ Server & Abgleich (optional)**
- **Seafile verknüpfen:** Bibliothekslink und API-Token unter **Projekt → Server** eintragen
- **Token bleibt lokal:** Jede Person trägt denselben Token einmalig auf ihrem Gerät ein – als persönlichen API-Token oder als Bibliotheks-Token (Bibliothek → Erweitert → API-Token, Rechte `rw`)
- **Test:** schreibt, liest und löscht eine Testdatei auf dem Server
- **Zwei-Wege-Abgleich:** Verknüpfen lädt die Projekt-ZIP hoch, Änderungen gehen automatisch nach, beim Öffnen wird der Serverstand zusammengeführt
- **Status-Icon oben rechts:** grün online, blau beim Sync, gelb Server offline, rot nicht verbunden, grau ohne Server – antippen zeigt Details
- **Bearbeitungssperre:** Wer eine Aufgabe öffnet, hält sie für andere gesperrt (rotes Schloss, nur Ansicht); ohne Heartbeat läuft die Sperre nach 5 Minuten ab
- Voraussetzung: Seafile-Server mit CORS-Freigabe für `/api2`, `/api/v2.1`, `/upload-api` und `/seafhttp`; Bibliotheks-Token werden über `/api/v2.1/via-repo-token/…` angesprochen

**✅ Status & Übersicht**
- Statusfluss **Offen → Hinweis → Behoben** mit Pflichtfeldern („Bearbeitet von“, „Bearbeitet am“, Hinweistext)
- **Schnellwechsel** in der Detailansicht: Status antippen – Name und Datum sind vorbelegt
- Suche und Filter (Status, Typ), Sortierung nach Name, Status, Zeitaufwand, Art oder Position
- **Auswahlmodus**: mehrere Aufgaben auf einmal umstellen, als PDF ausgeben oder löschen
- Aufgaben einzeln als PDF-Blatt ausgeben

**🛟 Wiederherstellung**
- **Papierkorb** für gelöschte Aufgaben (max. 10) – inklusive „Rückgängig“ direkt nach dem Löschen
- **Sicherungsstände**: vor Überschreiben, Zusammenführen und Wiederherstellen wird automatisch ein Stand gesichert

**⏳ Ladeanzeige**
- **Fortschrittsbalken** bei allen langen Vorgängen: Projekt laden oder importieren, Projektbericht, Materialliste, Aufgaben-PDF, Instandsetzungsreport und ZIP-Sicherung – mit Prozentangabe und Zähler („Aufgabe 12 von 40“)
- **Kein Aufblitzen**: kurze Vorgänge (unter ~0,2 s) laufen ohne Anzeige durch

**🎨 Darstellung**
- **Tag-/Nachtmodus** unter **Einstellungen** – die Wahl bleibt im Browser gespeichert; ohne eigene Wahl folgt die App der Geräteeinstellung

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
- **Optionaler Server:** Ohne verknüpfte Seafile-Bibliothek gibt es kein Backend – nichts verlässt das Gerät. Mit **Projekt → Server** werden Projekt-ZIP und Sperrdatei an den angegebenen Seafile-Server übertragen; der API-Token bleibt lokal.

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

## Datenschutz & Cookies

Der Planer arbeitet standardmäßig offline und ohne Backend. Es gibt **keine Cookies von Drittanbietern und kein Tracking**. Daten werden nur übertragen, wenn Sie selbst eine Seafile-Bibliothek verknüpfen. Gespeichert wird ausschließlich, was für die Funktion erforderlich ist:

| Kategorie | Zweck | Ort |
| --- | --- | --- |
| **Unbedingt erforderlich** (nicht abwählbar) | Projekte, Bilder und Dokumente | IndexedDB |
| **Unbedingt erforderlich** | Einstellungen (Tag-/Nachtmodus, Ansicht/Filter, letzte Person) | localStorage |
| **Unbedingt erforderlich** | App-Shell für die Offline-Nutzung | Service-Worker-Cache |
| **Nur bei Server-Verknüpfung** | Projekt-ZIP und Sperrdatei | Seafile-Server (vom Nutzer angegeben) |
| **Nur bei Server-Verknüpfung** | API-Token | localStorage |

Rechtsgrundlage ist § 25 Abs. 2 TDDDG (unbedingt erforderliche Speicherung). Beim ersten Start erscheint ein **einmaliger Hinweis**, der darüber informiert und die Entscheidung samt Zeitstempel festhält. Er lässt sich jederzeit über **Einstellungen → Info** erneut öffnen. Kommen später optionale Kategorien (z. B. Statistik) hinzu, erscheinen automatisch Zustimmungsschalter sowie „Alle akzeptieren“ und „Nur notwendige“ mit gleicher Gewichtung.

## Feedback

Verbesserungsvorschläge und Fehlerberichte sind willkommen: **[github.com/Advoit/LDC_Planer](https://github.com/Advoit/LDC_Planer)** – in der App über **Einstellungen → Verbesserungsvorschläge** erreichbar.

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
│             Migration, Hashing, Bild-Komprimierung, Dateinamen, Fortschritt,
│             Einstellungen
├── domain/   Fachlogik ohne UI: types, task (inkl. Duplizieren/Sammelstatus),
│             project, task-filter, sort, merge, material
├── io/       Dateien: ZIP-Export/-Import, PDF (pdf, pdf-cover, pdf-toc, pdf-task),
│             Projektbericht, Aufgaben-PDF, Materialliste (PDF/CSV), PPTX-Report
├── ui/       Oberfläche: app-state + Aktionen, Toolbar, Startseite, Projektliste,
│             Aufgabenliste/-formular/-detail, Dialoge, Ladeanzeige, Assistenten
├── styles/   CSS (Variablen, Layout, Komponenten)
├── app.ts    App-Shell: Init, Rendering, Verdrahtung
└── main.ts   Einstiegspunkt + Service-Worker
```

</details>

## Icons

Alle Symbole in der Oberfläche stammen von **[Tabler Icons](https://tabler.io/icons)** (MIT-Lizenz, Repository: [tabler/tabler-icons](https://github.com/tabler/tabler-icons)). Die verwendeten Icons sind als Inline-SVG in `src/ui/icons.ts` eingebunden und lassen sich mit einem Befehl neu von Tabler herunterladen:

```bash
npm run icons:tabler
```

## Lizenz

Privat / intern – kein Open-Source-Lizenzmodell hinterlegt.
