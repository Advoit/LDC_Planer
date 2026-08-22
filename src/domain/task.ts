/* ── Aufgaben-Domain: Erzeugen, Validieren, Statuswechsel ── */

import { randomId } from '../core/id';
import type { MaterialItem, ProjectDocument, Task, TaskImage, TaskStatus } from './types';

export interface NewTaskInput {
  name: string;
  description: string;
  images: TaskImage[];
  thumbnail: string | null;
  thumbnailSourceId: string | null;
  material: MaterialItem[];
  plannedWork: string;
  documents: ProjectDocument[];
}

export interface StatusFields {
  status: TaskStatus;
  editedBy: string;
  editedAt: string;
  hintText: string;
  afterImages: TaskImage[];
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
    documents: input.documents,
    status: 'offen',
    editedBy: '',
    editedAt: '',
    hintText: '',
    afterImages: [],
  };
}

export function validateTaskInput(input: NewTaskInput): string | null {
  if (!input.name.trim()) return 'Bitte einen Aufgabennamen angeben.';
  if (!input.description.trim()) return 'Bitte eine Beschreibung angeben.';
  if (input.plannedWork && !/^\d{1,2}:\d{2}$/.test(input.plannedWork.trim())) {
    return 'Geplanter Arbeitsaufwand muss im Format hh:mm sein.';
  }
  return null;
}

/**
 * Validiert einen Statuswechsel gemäß den Regeln:
 * - Offen → Hinweis: „Bearbeitet von“, „Bearbeitet am“ und „Hinweistext“ Pflicht
 * - → Behoben (aus Offen oder Hinweis): „Bearbeitet von“, „Bearbeitet am“ Pflicht
 */
export function validateStatusFields(fields: StatusFields): string | null {
  const { status, editedBy, editedAt, hintText } = fields;

  if (status === 'offen') {
    /* Für Offen sind keine Status-Felder nötig. */
    return null;
  }

  if (!editedBy.trim()) return 'Bitte „Bearbeitet von“ angeben.';
  if (!editedAt) return 'Bitte „Bearbeitet am“ angeben.';

  if (status === 'hinweis' && !hintText.trim()) {
    return 'Beim Status „Hinweis“ muss ein Hinweistext angegeben werden.';
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
    updatedAt: now,
  };
}

export function plannedWorkToMinutes(plannedWork: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(plannedWork.trim());
  if (!m) return Number.POSITIVE_INFINITY; // leere/unbekannte Werte ans Ende
  return Number(m[1]) * 60 + Number(m[2]);
}