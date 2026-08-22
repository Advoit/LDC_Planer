/* ── Projekt-Import: .ldcproj-ZIP einlesen ── */

import { unzipSync } from 'fflate';
import type { Project, Task, TaskImage } from '../domain/types';
import { sha256Hex } from '../core/hash';
import type { ExportedProject, ExportedTask, ImageRef } from './export';
import { migrateProject } from '../core/migrate';

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + chunkSize)));
  }
  return btoa(chunks.join(''));
}

/** Gibt MIME-Type für eine Dateiendung zurück. */
function mimeForExt(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  if (!m) return 'image/png';
  switch (m[1].toLowerCase()) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'svg':
      return 'image/svg+xml';
    default:
      return 'image/png';
  }
}

function bytesToDataUrl(bytes: Uint8Array, fileName: string): string {
  const mime = mimeForExt(fileName);
  return `data:${mime};base64,${bytesToBase64(bytes)}`;
}

async function loadImages(
  fileMap: Map<string, Uint8Array>,
  refs: ImageRef[],
  taskDir: string,
): Promise<TaskImage[]> {
  const images: TaskImage[] = [];
  for (const ref of refs) {
    const path =
      ref.file.startsWith('/') || ref.file.startsWith('.')
        ? ref.file
        : `${taskDir}/${ref.file}`;
    const bytes = fileMap.get(path);
    if (!bytes) continue;
    const dataUrl = bytesToDataUrl(bytes, ref.file);
    const copy = new Uint8Array(bytes); // eigene ArrayBuffer-Kopie
    const hash = await sha256Hex(copy.buffer);
    images.push({ id: ref.id, dataUrl, hash });
  }
  return images;
}

async function rebuildTasks(
  fileMap: Map<string, Uint8Array>,
  exportedTasks: ExportedTask[],
  root: string,
): Promise<Task[]> {
  const tasks: Task[] = [];
  for (const et of exportedTasks) {
    const taskDir = `${root}/tasks/${et.id}`;
    const images = await loadImages(fileMap, et.images, taskDir);
    const afterImages = await loadImages(fileMap, et.afterImages, taskDir);
    let thumbnail: string | null = null;
    if (et.thumbnail) {
      const thumbPath = `${taskDir}/${et.thumbnail}`;
      const thumbBytes = fileMap.get(thumbPath);
      if (thumbBytes) {
        thumbnail = bytesToDataUrl(thumbBytes, et.thumbnail);
      }
    }
    tasks.push({
      id: et.id,
      projectId: et.projectId,
      createdAt: et.createdAt,
      updatedAt: et.updatedAt,
      name: et.name,
      description: et.description,
      images,
      thumbnail,
      thumbnailSourceId: et.thumbnailSourceId ?? null,
      material: et.material ?? [],
      plannedWork: et.plannedWork ?? '',
      status: et.status ?? 'offen',
      editedBy: et.editedBy ?? '',
      editedAt: et.editedAt ?? '',
      hintText: et.hintText ?? '',
      afterImages,
    });
  }
  return tasks;
}

export async function parseLdcproj(
  buffer: ArrayBuffer,
): Promise<Project | null> {
  const data = new Uint8Array(buffer);
  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(data);
  } catch {
    return null;
  }

  const fileMap = new Map(Object.entries(unzipped));

  /* Suchen: project.json irgendwo im ZIP */
  let projectJsonBytes: Uint8Array | null = null;
  let root = '';
  for (const [path, bytes] of fileMap) {
    if (path.endsWith('project.json')) {
      projectJsonBytes = bytes;
      root = path.replace(/\/?project\.json$/, '');
      break;
    }
  }
  if (!projectJsonBytes) return null;

  let exportedProject: ExportedProject;
  try {
    exportedProject = JSON.parse(
      new TextDecoder().decode(projectJsonBytes),
    ) as ExportedProject;
  } catch {
    return null;
  }

  /* Tasks aus allen task.json-Dateien sammeln */
  const exportedTasks: ExportedTask[] = [];
  for (const [path, bytes] of fileMap) {
    if (path.includes('/tasks/') && path.endsWith('task.json')) {
      try {
        const et = JSON.parse(new TextDecoder().decode(bytes)) as ExportedTask;
        exportedTasks.push(et);
      } catch {
        /* Korrupten Task überspringen */
      }
    }
  }

  const tasks = await rebuildTasks(fileMap, exportedTasks, root);

  const project: Project = migrateProject({
    schemaVersion: exportedProject.schemaVersion,
    id: exportedProject.id,
    name: exportedProject.name,
    location: exportedProject.location,
    description: exportedProject.description,
    createdAt: exportedProject.createdAt,
    updatedAt: exportedProject.updatedAt,
    tasks,
  });

  return project;
}