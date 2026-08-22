/* ── Projekt-Export: saubere ZIP mit Ordnerstruktur ── */

import { strToU8, zipSync } from 'fflate';
import type { Project, ProjectDocument, Task, TaskImage } from '../domain/types';

const MIME_EXT: Readonly<Record<string, string>> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'text/plain': '.txt',
  'text/csv': '.csv',
  'application/zip': '.zip',
};

export interface ImageRef {
  id: string;
  hash: string;
  file: string;
}

export interface ExportedTask {
  id: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
  name: string;
  description: string;
  images: ImageRef[];
  thumbnail: string | null;
  thumbnailSourceId: string | null;
  material: Task['material'];
  plannedWork: string;
  status: Task['status'];
  editedBy: string;
  editedAt: string;
  hintText: string;
  afterImages: ImageRef[];
  documents: DocumentRef[];
}

export interface DocumentRef {
  id: string;
  name: string;
  mime: string;
  size: number;
  hash: string;
  file: string;
}

export interface ExportedProject {
  schemaVersion: number;
  id: string;
  name: string;
  location: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  documents: DocumentRef[];
}

export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const commaIdx = dataUrl.indexOf(',');
  const b64 = dataUrl.slice(commaIdx + 1);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function dataUrlMime(dataUrl: string): string {
  const match = /^data:([^;,]+)[;,]/i.exec(dataUrl);
  return match ? match[1].toLowerCase() : 'image/png';
}

function imageRef(img: TaskImage, dir: string): ImageRef {
  const ext = MIME_EXT[dataUrlMime(img.dataUrl)] ?? '.img';
  return { id: img.id, hash: img.hash, file: `${dir}/${img.id}${ext}` };
}

function documentRef(doc: ProjectDocument, dir: string): DocumentRef {
  const ext = MIME_EXT[doc.mime.toLowerCase()] ?? extensionFromName(doc.name);
  return {
    id: doc.id,
    name: doc.name,
    mime: doc.mime,
    size: doc.size,
    hash: doc.hash,
    file: `${dir}/${doc.id}${ext}`,
  };
}

function extensionFromName(name: string): string {
  const m = /\.([a-z0-9]{1,5})$/i.exec(name);
  return m ? `.${m[1].toLowerCase()}` : '.bin';
}

/**
 * Baut die Projekt-ZIP-Datei mit folgender Struktur:
 *   LDC-Projekt-<ID>/
 *     project.json
 *     tasks/<Task-ID>/
 *       task.json
 *       thumbnail.png
 *       images/<Bild-ID>.png|.jpg|…
 *
 * Hinweis: Alte .ldcproj-Backups sind identische ZIP-Dateien und
 * bleiben weiterhin ladbar.
 */
export function buildProjectZip(project: Project): Blob {
  const files: Record<string, Uint8Array> = {};
  const root = `LDC-Projekt-${project.id}`;

  const exportedProject: ExportedProject = {
    schemaVersion: project.schemaVersion,
    id: project.id,
    name: project.name,
    location: project.location,
    description: project.description,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    documents: (project.documents ?? []).map((doc) =>
      documentRef(doc, 'documents'),
    ),
  };
  files[`${root}/project.json`] = strToU8(
    JSON.stringify(exportedProject, null, 2),
  );

  /* Projektbezogene Unterlagen */
  for (const doc of project.documents ?? []) {
    const ext = MIME_EXT[doc.mime.toLowerCase()] ?? extensionFromName(doc.name);
    files[`${root}/documents/${doc.id}${ext}`] = dataUrlToBytes(doc.dataUrl);
  }

  for (const task of project.tasks) {
    const dir = `${root}/tasks/${task.id}`;
    const exportedTask: ExportedTask = {
      id: task.id,
      projectId: task.projectId,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      name: task.name,
      description: task.description,
      images: task.images.map((img) => imageRef(img, 'images')),
      thumbnail: task.thumbnail ? 'thumbnail.png' : null,
      thumbnailSourceId: task.thumbnailSourceId,
      material: task.material,
      plannedWork: task.plannedWork,
      status: task.status,
      editedBy: task.editedBy,
      editedAt: task.editedAt,
      hintText: task.hintText,
      afterImages: task.afterImages.map((img) => imageRef(img, 'images')),
      documents: (task.documents ?? []).map((doc) =>
        documentRef(doc, 'documents'),
      ),
    };
    files[`${dir}/task.json`] = strToU8(JSON.stringify(exportedTask, null, 2));

    for (const img of task.images) {
      const ext = MIME_EXT[dataUrlMime(img.dataUrl)] ?? '.img';
      files[`${dir}/images/${img.id}${ext}`] = dataUrlToBytes(img.dataUrl);
    }
    for (const img of task.afterImages) {
      const ext = MIME_EXT[dataUrlMime(img.dataUrl)] ?? '.img';
      files[`${dir}/images/${img.id}${ext}`] = dataUrlToBytes(img.dataUrl);
    }
    if (task.thumbnail) {
      files[`${dir}/thumbnail.png`] = dataUrlToBytes(task.thumbnail);
    }
    for (const doc of task.documents ?? []) {
      const ext = MIME_EXT[doc.mime.toLowerCase()] ?? extensionFromName(doc.name);
      files[`${dir}/documents/${doc.id}${ext}`] = dataUrlToBytes(doc.dataUrl);
    }
  }

  const zipped = zipSync(files, { level: 6 });
  return new Blob([zipped], { type: 'application/zip' });
}

/** Dateiname für den Download (Projektname + ID, sicher bereinigt). */
export function projectZipFileName(project: Project): string {
  const safeName = project.name
    .replace(/[^a-zA-Z0-9äöüÄÖÜß _-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  return `LDC-${safeName || 'Projekt'}-${project.id}.zip`;
}