/* ── Datenmigration – abwärtskompatibel zu alten App-Versionen ── */

import type { Project, Task } from '../domain/types';
import type { ProjectDocument, ReportCover, TaskImage } from '../domain/types';

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

  /* Projekt und alle Tasks tiefensanft normalisieren (fehlende Felder ergänzen) */
  current = normalizeProject(current);
  if (Array.isArray(current.tasks)) {
    current.tasks = current.tasks.map(normalizeTask);
  } else {
    current.tasks = [];
  }

  return current;
}

/* ── Projekt-Normalisierung (ergänzt fehlende Felder, z. B. documents) ── */

function normalizeProject(p: Project): Project {
  return {
    schemaVersion: p.schemaVersion,
    id: typeof p.id === 'string' ? p.id : '',
    name: typeof p.name === 'string' ? p.name : '',
    location: typeof p.location === 'string' ? p.location : '',
    description: typeof p.description === 'string' ? p.description : '',
    createdAt: typeof p.createdAt === 'string' ? p.createdAt : new Date().toISOString(),
    updatedAt: typeof p.updatedAt === 'string' ? p.updatedAt : new Date().toISOString(),
    tasks: Array.isArray(p.tasks) ? p.tasks : [],
    documents: normalizeDocuments(p.documents),
    reportCover: normalizeReportCover(p.reportCover),
  };
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
    documents: normalizeDocuments(p.documents),
    reportCover: normalizeReportCover(p.reportCover),
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
    personnel:
      typeof t.personnel === 'number' &&
      Number.isInteger(t.personnel) &&
      t.personnel >= 1
        ? t.personnel
        : 1,
    /* Mängel-/Umbau-Klassifizierung: alte Aufgaben gelten als Mängel */
    typ: t.typ === 'umbau' ? 'umbau' : 'maengel',
    art: typeof t.art === 'string' ? t.art : '',
    pruefung: typeof t.pruefung === 'string' ? t.pruefung : '',
    fehlerbeschreibung:
      typeof t.fehlerbeschreibung === 'string' ? t.fehlerbeschreibung : '',
    position: typeof t.position === 'string' ? t.position : '',
    documents: normalizeDocuments(t.documents),
    status:
      typeof t.status === 'string' &&
      ['offen', 'hinweis', 'behoben'].includes(t.status)
        ? (t.status as Task['status'])
        : 'offen',
    editedBy: typeof t.editedBy === 'string' ? t.editedBy : '',
    editedAt: typeof t.editedAt === 'string' ? t.editedAt : '',
    hintText: typeof t.hintText === 'string' ? t.hintText : '',
    afterImages: normalizeImages(t.afterImages),
    afterDocuments: normalizeDocuments(t.afterDocuments),
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

function normalizeDocuments(documents: unknown): ProjectDocument[] {
  if (!Array.isArray(documents)) return [];
  return documents
    .filter(
      (doc: unknown): doc is ProjectDocument =>
        typeof doc === 'object' &&
        doc !== null &&
        typeof (doc as ProjectDocument).id === 'string' &&
        typeof (doc as ProjectDocument).name === 'string' &&
        typeof (doc as ProjectDocument).mime === 'string' &&
        typeof (doc as ProjectDocument).size === 'number' &&
        typeof (doc as ProjectDocument).dataUrl === 'string' &&
        typeof (doc as ProjectDocument).hash === 'string',
    );
}

/* Deckblatt-Einstellungen: übernehmen nur, wenn alle Felder Strings sind.
   Fehlt das Feld (alte Sicherungen), bleibt es undefiniert – die
   Einstellungen sind optional und fallen dann auf die lokalen Vorgaben zurück. */
function normalizeReportCover(cover: unknown): ReportCover | undefined {
  if (typeof cover !== 'object' || cover === null) return undefined;
  const c = cover as Partial<ReportCover>;
  const fields = ['kennung', 'saal', 'strasse', 'plzOrt', 'efkName', 'termin'] as const;
  if (!fields.every((f) => typeof c[f] === 'string')) return undefined;
  return {
    kennung: c.kennung as string,
    saal: c.saal as string,
    strasse: c.strasse as string,
    plzOrt: c.plzOrt as string,
    efkName: c.efkName as string,
    termin: c.termin as string,
  };
}