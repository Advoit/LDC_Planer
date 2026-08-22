/* ── Domain-Typen – reine Datencontainer (DTOs) ── */

export type TaskStatus = 'offen' | 'hinweis' | 'behoben';

export const TASK_STATUSES: readonly TaskStatus[] = ['offen', 'hinweis', 'behoben'];

export const STATUS_LABELS: Readonly<Record<TaskStatus, string>> = {
  offen: 'Offen',
  hinweis: 'Hinweis',
  behoben: 'Behoben',
};

export const MATERIAL_UNITS = ['Stück', 'VPE', 'Meter', 'Eigen'] as const;
export type MaterialUnit = (typeof MATERIAL_UNITS)[number];

export const SCHEMA_VERSION = 1;

/* ── Sub-Objekte ── */

export interface TaskImage {
  id: string;
  dataUrl: string;
  hash: string; // SHA-256 der Roh-Bilddaten
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

  /* Status-Felder */
  status: TaskStatus;
  editedBy: string;
  editedAt: string;
  hintText: string;
  afterImages: TaskImage[]; // Nachher-Bilder
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
}