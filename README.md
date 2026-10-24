<div align="center">

# LDC Planer

**Bau- und Sanierungsprojekte planen, abarbeiten und dokumentieren – offline, ohne Konto, optional mit Seafile-Abgleich.**

### ▶︎ [App öffnen](https://advoit.github.io/LDC_Planer/)

<img src="https://img.shields.io/badge/offline--f%C3%A4hig-34C759?style=flat-square" alt="offline-fähig">
<img src="https://img.shields.io/badge/Daten-lokal-007AFF?style=flat-square" alt="Daten bleiben lokal">
<img src="https://img.shields.io/badge/PWA-installierbar-FF9500?style=flat-square" alt="installierbar">
<img src="https://img.shields.io/badge/Seafile-optional-1D1D1F?style=flat-square" alt="Seafile optional">

</div>

---

## Kurz gesagt

Der LDC Planer ist eine Web-App für die Baustelle: Mängel und Umbau-Aufgaben erfassen, Fotos und Pläne anhängen, den Status nachhalten und am Ende Berichte, Materiallisten oder den Instandsetzungsreport ausgeben.

- **Standardmäßig lokal** – keine Anmeldung, kein Konto, kein Tracking. Projekte liegen im Browser-Speicher des Geräts.
- **Offline nutzbar** – nach dem ersten Laden funktioniert die App ohne Netz und lässt sich wie eine native App installieren.
- **Mobil & Desktop** – responsive, installierbar und mit Tag-/Nachtmodus.
- **Sicherbar** – jedes Projekt als ZIP exportieren, wieder laden, zusammenführen oder überschreiben.

## Schnellstart

1. **[App öffnen](https://advoit.github.io/LDC_Planer/)** – keine Anmeldung nötig.
2. **Projekt anlegen** (Name und Ort sind Pflicht) und Aufgaben erfassen – gespeichert wird automatisch.
3. **Optional installieren:** am Handy „Zum Startbildschirm hinzufügen“, am Desktop das Installations-Symbol in der Adressleiste.

## ✨ Funktionen

**Projekte**
- Mehrere Projekte parallel verwalten, öffnen, wechseln und löschen
- Projekt-ZIP per Knopf oder Drag & Drop laden – zusammenführen oder überschreiben
- Automatische Sicherungsstände vor kritischen Aktionen

**Aufgaben**
- Mängel oder Umbau/Neuinstallation, inklusive Art **A1–C3**
- Statusfluss **Offen → Hinweis → Behoben** mit Bearbeiter, Datum und Hinweistext
- Material mit Vorschlägen aus früheren Aufgaben, geplanter Arbeitsaufwand und Personalbedarf
- Suche, Filter, Sortierung und Mehrfachauswahl
- Aufgaben duplizieren, als PDF ausgeben oder in den Papierkorb legen

**Bilder & Unterlagen**
- Vorher-/Nachher-Bilder mit Zoom und wählbarem Vorschaubild
- Fotos werden beim Hochladen automatisch optimiert
- Dokumente und Pläne je Aufgabe oder Projekt, mit Vorschau

## ☁️ Server & Teilen

Ohne verknüpfte Seafile-Bibliothek bleibt alles lokal. Optional lässt sich ein Projekt mit Seafile abgleichen.

**Abgleich**
- Bibliothekslink, Zielordner und API-Token unter **Projekt → Server** hinterlegen
- Einzeldateien statt ZIP: Projekt, Aufgaben, Bilder und Dokumente liegen einzeln auf dem Server
- Nur Änderungen werden übertragen – SHA-256-Vergleich und Datei-Metadaten verhindern unnötige Downloads
- Zwei-Wege-Abgleich beim Öffnen und alle 20 Sekunden, automatischer Upload nach Änderungen
- Bearbeitungssperren für Aufgaben und Status-Icon für Online, Sync, Offline und Fehler

Benötigt wird ein Seafile-Server mit CORS für `/api2`, `/api/v2.1`, `/upload-api` und `/seafhttp`. Der API-Token braucht `rw`-Rechte und bleibt lokal.

**Freigabe**
- **Projekt → Teilen** erzeugt eine ZIP ausschließlich mit den Server-Zugangsdaten – keine Projektdateien.
- Optional mit Passwort geschützt (mindestens 8 Zeichen): AES-256-GCM, Schlüsselableitung per PBKDF2-SHA-256 (600.000 Iterationen). Das Passwort wird nicht gespeichert und kann nicht wiederhergestellt werden.
- Empfänger öffnen die ZIP über **Projekt → Laden** und geben bei Bedarf das Passwort ein. Ist das Projekt lokal noch nicht vorhanden, lädt die App den Projektstand direkt vom Server.
- Es gibt **keinen Freigabe-Link und keinen Upload der ZIP**. Die Datei wird lokal gespeichert und manuell weitergegeben.

> **Wichtig:** Frühere Versionen legten Freigabe-ZIPs mit Klartext-Token auf dem Server ab und erzeugten Links. Bitte alte `LDC-Freigabe-*.zip` und Links in Seafile löschen und den API-Token erneuern, falls er weitergegeben wurde.

## 📄 Exporte

| Export | Inhalt | Format |
| --- | --- | --- |
| **Projektbericht** | Deckblatt, Inhaltsverzeichnis, Projektinfos, Unterlagen und alle Aufgaben | PDF |
| **Materialliste** | nach Aufgaben gruppiert oder als summierte Gesamtliste | PDF, CSV |
| **Einzelaufgabe** | eine Aufgabe als druckbares Blatt | PDF |
| **Instandsetzungsreport** | eine Seite pro Mangel, sortiert nach Position, mit Vorher-/Nachher-Fotos | PPTX |

## 🔒 Daten & Sicherheit

- Projekte, Bilder und Dokumente liegen in **IndexedDB**; Einstellungen und Token in **localStorage**.
- Ohne Server verlasst nichts das Gerät. Es gibt **keine Cookies von Drittanbietern und kein Tracking**.
- Beim Server-Abgleich werden nur die Projektdateien und die Sperrdatei an die selbst angegebene Seafile-Bibliothek übertragen.
- Freigabe-ZIPs enthalten den API-Token. Ohne Passwort im Klartext, mit Passwort verschlüsselt – nur an berechtigte Personen weitergeben.
- Papierkorb und Sicherungsstände schützen vor versehentlichem Löschen oder Überschreiben.

## 🛠 Entwicklung

**Stack:** TypeScript (strict) · Vite · IndexedDB · PWA · fflate · pdf-lib · Vitest

```bash
npm install     # Abhängigkeiten installieren
npm run dev     # Dev-Server → http://localhost:5173
npm run build   # Typecheck + Production-Build nach dist/
npm test        # Tests ausführen
```

Weitere Befehle:

```bash
npm run icons:tabler             # Tabler-Icons neu einbetten
npm run embed:instandsetzungs    # PPTX-Vorlage neu einbetten
```

Der Branch `main` wird per GitHub Actions automatisch nach GitHub Pages veröffentlicht. Details im [Deploy-Workflow](.github/workflows/deploy.yml).

<details>
<summary><strong>Projektstruktur</strong></summary>

```text
src/
├── core/     IndexedDB, Migration, Hashing, Bilder, Fortschritt, Einstellungen
├── domain/   Typen und Fachlogik: Aufgaben, Projekte, Merge, Filter, Sortierung
├── io/       ZIP, PDF, CSV, PPTX und Seafile-Dateiformate
├── ui/       Oberfläche, Dialoge, Aktionen und Ladeanzeigen
├── styles/   CSS-Variablen, Layout und Komponenten
├── app.ts    App-Shell
└── main.ts   Einstiegspunkt und Service Worker
```

</details>

## Icons & Lizenz

Icons: [Tabler Icons](https://tabler.io/icons) (MIT). Sie liegen als Inline-SVG in `src/ui/icons.ts`.

Privat / intern – kein Open-Source-Lizenzmodell hinterlegt.
