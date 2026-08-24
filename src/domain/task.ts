/* ── Aufgaben-Domain: Erzeugen, Validieren, Statuswechsel ── */

import { randomId } from '../core/id';
import { MANGEL_ARTEN } from './types';
import type {
  MaterialItem,
  ProjectDocument,
  Task,
  TaskImage,
  TaskStatus,
  TaskTyp,
} from './types';

export interface NewTaskInput {
  name: string;
  description: string;
  images: TaskImage[];
  thumbnail: string | null;
  thumbnailSourceId: string | null;
  material: MaterialItem[];
  plannedWork: string;
  personnel: number; // Personalbedarf, ganzzahlig >= 1 (Standard 1)
  typ: TaskTyp; // Mängel oder Umbau/Neuinstallation
  art: string; // A1–C3 ('' = nicht gesetzt)
  pruefung: string; // Prüfung (einzeilig, nur bei Mängel)
  fehlerbeschreibung: string; // Fehlerbeschreibung (mehrzeilig, nur bei Mängel)
  position: string; // Position (einzeilig, nur bei Mängel)
  documents: ProjectDocument[];
}

export interface StatusFields {
  status: TaskStatus;
  editedBy: string;
  editedAt: string;
  hintText: string;
  afterImages: TaskImage[];
  afterDocuments: ProjectDocument[];
}

export function createTask(projectId: string, input: NewTaskInput): Task {
  const now = new Date().toISOString();
  return {
    id: randomId(),
    projectId,
    createdAt: now,
    updatedAt: now,
    name: input.name.trim(),
    description: input.description.trim(),
    images: input.images,
    thumbnail: input.thumbnail,
    thumbnailSourceId: input.thumbnailSourceId,
    material: input.material,
    plannedWork: input.plannedWork,
    personnel: normalizePersonnel(input.personnel),
    typ: input.typ === 'umbau' ? 'umbau' : 'maengel',
    art: input.art?.trim() ?? '',
    pruefung: input.pruefung?.trim() ?? '',
    fehlerbeschreibung: input.fehlerbeschreibung?.trim() ?? '',
    position: input.position?.trim() ?? '',
    documents: input.documents,
    status: 'offen',
    editedBy: '',
    editedAt: '',
    hintText: '',
    afterImages: [],
    afterDocuments: [],
  };
}

export function validateTaskInput(input: NewTaskInput): string | null {
  if (!input.name.trim()) return 'Bitte einen Aufgabennamen angeben.';
  if (!input.description.trim()) return 'Bitte eine Beschreibung angeben.';
  if (input.plannedWork && !/^\d{1,2}:\d{2}$/.test(input.plannedWork.trim())) {
    return 'Geplanter Arbeitsaufwand muss im Format hh:mm sein.';
  }
  if (!Number.isInteger(input.personnel) || input.personnel < 1) {
    return 'Personalbedarf muss eine ganze Zahl ab 1 sein.';
  }
  if (input.art && !MANGEL_ARTEN.includes(input.art)) {
    return 'Art muss eine gültige Klassifikation (A1–C3) sein.';
  }
  return null;
}

/** Normalisiert den Personalbedarf auf eine ganze Zahl >= 1 (Standard 1). */
export function normalizePersonnel(value: number | undefined | null): number {
  return Number.isInteger(value) && (value as number) >= 1 ? (value as number) : 1;
}

/**
 * Validiert einen Statuswechsel gemäß den Regeln:
 * - Offen → Hinweis: „Bearbeitet von“, „Bearbeitet am“ und „Hinweistext“ Pflicht
 * - → Behoben (aus Offen oder Hinweis): „Bearbeitet von“, „Bearbeitet am“ Pflicht;
 *   bei Mängel-Aufgaben ist zusätzlich der „Hinweistext“ Pflicht (wie bei „Hinweis“)
 */
export function validateStatusFields(
  fields: StatusFields,
  taskTyp?: TaskTyp,
): string | null {
  const { status, editedBy, editedAt, hintText } = fields;

  if (status === 'offen') {
    /* Für Offen sind keine Status-Felder nötig. */
    return null;
  }

  if (!editedBy.trim()) return 'Bitte „Bearbeitet von“ angeben.';
  if (!editedAt) return 'Bitte „Bearbeitet am“ angeben.';

  const needsHint =
    status === 'hinweis' || (status === 'behoben' && taskTyp === 'maengel');
  if (needsHint && !hintText.trim()) {
    return status === 'hinweis'
      ? 'Beim Status „Hinweis“ muss ein Hinweistext angegeben werden.'
      : 'Beim Status „Behoben“ muss bei Mängel-Aufgaben ein Hinweistext angegeben werden.';
  }

  return null;
}

export function applyStatusFields(task: Task, fields: StatusFields): Task {
  const now = new Date().toISOString();
  return {
    ...task,
    status: fields.status,
    editedBy: fields.editedBy.trim(),
    editedAt: fields.editedAt,
    hintText: fields.hintText.trim(),
    afterImages: fields.afterImages,
    afterDocuments: fields.afterDocuments,
    updatedAt: now,
  };
}

export function plannedWorkToMinutes(plannedWork: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(plannedWork.trim());
  if (!m) return Number.POSITIVE_INFINITY; // leere/unbekannte Werte ans Ende
  return Number(m[1]) * 60 + Number(m[2]);
}