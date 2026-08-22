/* ── Datenmigration – abwärtskompatibel zu alten App-Versionen ── */

import type { Project, Task } from '../domain/types';
import type { TaskImage } from '../domain/types';

export const CURRENT_SCHEMA_VERSION = 1;

/**
 * Migriert rohe Daten auf die aktuelle Version.
 * Neue Versionen werden schrittweise aufbauend migriert.
 */
export function migrateProject(raw: unknown): Project {
  const data = (raw ?? {}) as Record<string, unknown>;
  let version: number =
    typeof data['schemaVersion'] === 'number' ? data['schemaVersion'] : 0;
  let current = raw as Project;

  if (version < 1) {
    current = migrateToV1(raw);
    version = 1;
  }

  if (current.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `Nicht unterstützte Projektdaten-Version: ${current.schemaVersion} (erwartet: ${CURRENT_SCHEMA_VERSION})`,
    );
  }

  /* Alle Tasks tiefensanft normalisieren (fehlende Felder ergänzen) */
  if (Array.isArray(current.tasks)) {
    current.tasks = current.tasks.map(normalizeTask);
  } else {
    current.tasks = [];
  }

  return current;
}

/* ── Migration v1: Normalisierung fehlender Felder ── */

function migrateToV1(raw: unknown): Project {
  const p = (raw ?? {}) as Partial<Project>;
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: typeof p.id === 'string' ? p.id : '',
    name: typeof p.name === 'string' ? p.name : '',
    location: typeof p.location === 'string' ? p.location : '',
    description: typeof p.description === 'string' ? p.description : '',
    createdAt: typeof p.createdAt === 'string' ? p.createdAt : now,
    updatedAt: typeof p.updatedAt === 'string' ? p.updatedAt : now,
    tasks: Array.isArray(p.tasks) ? p.tasks : [],
  };
}

/* ── Task-Normalisierung (wird nach jeder Migration und nach Import aufgerufen) ── */

function normalizeTask(t: Partial<Task>): Task {
  return {
    id: typeof t.id === 'string' ? t.id : '',
    projectId: typeof t.projectId === 'string' ? t.projectId : '',
    createdAt: typeof t.createdAt === 'string' ? t.createdAt : new Date().toISOString(),
    updatedAt: typeof t.updatedAt === 'string' ? t.updatedAt : new Date().toISOString(),
    name: typeof t.name === 'string' ? t.name : '',
    description: typeof t.description === 'string' ? t.description : '',
    images: normalizeImages(t.images),
    thumbnail: typeof t.thumbnail === 'string' ? t.thumbnail : null,
    thumbnailSourceId:
      typeof t.thumbnailSourceId === 'string' ? t.thumbnailSourceId : null,
    material: Array.isArray(t.material) ? t.material : [],
    plannedWork: typeof t.plannedWork === 'string' ? t.plannedWork : '',
    status:
      typeof t.status === 'string' &&
      ['offen', 'hinweis', 'behoben'].includes(t.status)
        ? (t.status as Task['status'])
        : 'offen',
    editedBy: typeof t.editedBy === 'string' ? t.editedBy : '',
    editedAt: typeof t.editedAt === 'string' ? t.editedAt : '',
    hintText: typeof t.hintText === 'string' ? t.hintText : '',
    afterImages: normalizeImages(t.afterImages),
  };
}

function normalizeImages(images: unknown): TaskImage[] {
  if (!Array.isArray(images)) return [];
  return images
    .filter(
      (img: unknown): img is TaskImage =>
        typeof img === 'object' &&
        img !== null &&
        typeof (img as TaskImage).id === 'string' &&
        typeof (img as TaskImage).dataUrl === 'string' &&
        typeof (img as TaskImage).hash === 'string',
    );
}