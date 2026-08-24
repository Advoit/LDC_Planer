/* ── Domain-Typen – reine Datencontainer (DTOs) ── */

export type TaskStatus = 'offen' | 'hinweis' | 'behoben';

export const TASK_STATUSES: readonly TaskStatus[] = ['offen', 'hinweis', 'behoben'];

export const STATUS_LABELS: Readonly<Record<TaskStatus, string>> = {
  offen: 'Offen',
  hinweis: 'Hinweis',
  behoben: 'Behoben',
};

/* ── Aufgabentyp (Mängel / Umbau) ── */

export type TaskTyp = 'maengel' | 'umbau';

export const TASK_TYPS: readonly TaskTyp[] = ['maengel', 'umbau'];

export const TASK_TYP_LABELS: Readonly<Record<TaskTyp, string>> = {
  maengel: 'Mängel',
  umbau: 'Umbau/Neuinstallation',
};

/** Mängel-Klassifikation „Art“ (A1–C3). */
export const MANGEL_ARTEN: readonly string[] = [
  'A1',
  'A2',
  'A3',
  'B1',
  'B2',
  'B3',
  'C1',
  'C2',
  'C3',
];

export const MATERIAL_UNITS = ['Stück', 'VPE', 'Meter', 'Eigen'] as const;
export type MaterialUnit = (typeof MATERIAL_UNITS)[number];

export const SCHEMA_VERSION = 1;

/* ── Sub-Objekte ── */

export interface TaskImage {
  id: string;
  dataUrl: string;
  hash: string; // SHA-256 der Roh-Bilddaten
}

export interface ProjectDocument {
  id: string;
  name: string; // Original-Dateiname
  mime: string; // MIME-Typ
  size: number; // Größe in Byte
  dataUrl: string; // data:<mime>;base64,…
  hash: string; // SHA-256 der Roh-Daten
}

export interface MaterialItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
}

/* ── Aufgabe ── */

export interface Task {
  id: string;
  projectId: string;

  /* Erstellungs-Felder */
  createdAt: string; // ISO
  updatedAt: string;
  name: string;
  description: string;
  images: TaskImage[]; // Vorher-Bilder
  thumbnail: string | null; // dataURL des 60×60 Vorschaubilds
  thumbnailSourceId: string | null; // ID des Quell-Bildes für thumbnail
  material: MaterialItem[];
  plannedWork: string; // hh:mm, leer erlaubt
  personnel: number; // Personalbedarf (Anzahl Personen), ganzzahlig, Standard 1

  /* Mängel-/Umbau-Klassifizierung */
  typ: TaskTyp; // Mängel oder Umbau/Neuinstallation
  art: string; // A1–C3 ('' = nicht gesetzt)
  pruefung: string; // Prüfung (einzeilig, nur bei Mängel)
  fehlerbeschreibung: string; // Fehlerbeschreibung (mehrzeilig, nur bei Mängel)
  position: string; // Position (einzeilig, nur bei Mängel)
  documents: ProjectDocument[]; // Pläne, Anhänge, sonstige Unterlagen

  /* Status-Felder */
  status: TaskStatus;
  editedBy: string;
  editedAt: string;
  hintText: string;
  afterImages: TaskImage[]; // Nachher-Bilder
  afterDocuments: ProjectDocument[]; // Dokumente zur Nachbearbeitung (Status-Bereich)
}

/* ── Deckblatt-Einstellungen des Instandsetzungsreports ── */

export interface ReportCover {
  kennung: string; // Kennung (z. B. Projekt-/Objektnummer)
  saal: string; // Saal / Bereich
  strasse: string; // Straße + Hausnummer
  plzOrt: string; // PLZ + Ort
  efkName: string; // Leitende EFK
  termin: string; // Ausführungstermin
}

/* ── Projekt ── */

export interface Project {
  schemaVersion: number;
  id: string;
  name: string;
  location: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  tasks: Task[];
  documents: ProjectDocument[]; // Projektbezogene Unterlagen (Pläne etc.)
  reportCover?: ReportCover; // Deckblatt-Einstellungen des Instandsetzungsreports (gehen in die Sicherung)
}