/* ── Projekt-Export: saubere .ldcproj-ZIP mit Ordnerstruktur ── */

import { strToU8, zipSync } from 'fflate';
import type { Project, Task, TaskImage } from '../domain/types';

const MIME_EXT: Readonly<Record<string, string>> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
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
}

export interface ExportedProject {
  schemaVersion: number;
  id: string;
  name: string;
  location: string;
  description: string;
  createdAt: string;
  updatedAt: string;
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

/**
 * Baut die .ldcproj-Datei (ZIP) mit folgender Struktur:
 *   LDC-Projekt-<ID>/
 *     project.json
 *     tasks/<Task-ID>/
 *       task.json
 *       thumbnail.png
 *       images/<Bild-ID>.png|.jpg|…
 */
export function buildLdcproj(project: Project): Blob {
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
  };
  files[`${root}/project.json`] = strToU8(
    JSON.stringify(exportedProject, null, 2),
  );

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
  }

  const zipped = zipSync(files, { level: 6 });
  return new Blob([zipped], { type: 'application/zip' });
}

/** Dateiname für den Download (Projektname + ID, sicher bereinigt). */
export function ldcprojFileName(project: Project): string {
  const safeName = project.name
    .replace(/[^a-zA-Z0-9äöüÄÖÜß _-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  return `LDC-${safeName || 'Projekt'}-${project.id}.ldcproj`;
}