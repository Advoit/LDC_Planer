/* ── Projekt-Zusammenführung ── */

import type { Project, Task, TaskImage } from './types';

/* ── Typen ── */

export interface TaskConflict {
  local: Task;
  imported: Task;
}

export type ConflictResolution = 'local' | 'imported';

export interface MergeResult {
  merged: Project;
  conflicts: number; // Anzahl der aufgelösten Konflikte
  added: number; // Anzahl neu hinzugefügter Tasks (nur importiert)
}

/* ── Prüfung, ob Projekte zusammengeführt werden können ── */

export function canMergeProjects(
  local: Project | null,
  imported: Project,
): boolean {
  return local !== null && local.id === imported.id;
}

/* ── Merge ── */

export async function mergeProjects(
  local: Project,
  imported: Project,
  resolve: (conflict: TaskConflict) => ConflictResolution | Promise<ConflictResolution>,
): Promise<MergeResult> {
  const now = new Date().toISOString();
  let conflictCount = 0;
  let addedCount = 0;

  /* Bestehende lokale Tasks abgleichen */
  const mergedTasks = await Promise.all(local.tasks.map(async (localTask) => {
    const importedTask = imported.tasks.find((t) => t.id === localTask.id);
    if (!importedTask) return localTask;

    /* Inhalt identisch? Dann lokales behalten und nur Bilder mergen. */
    if (tasksContentEqual(localTask, importedTask)) {
      return mergeTaskImages(localTask, importedTask);
    }

    /* Konflikt: Benutzer entscheidet per Modal. */      conflictCount++;
      const choice = await resolve({ local: localTask, imported: importedTask });

    if (choice === 'imported') {
      return mergeTaskImages(importedTask, localTask);
    }
    return mergeTaskImages(localTask, importedTask);
  }));

  /* Nur im Import existierende Tasks hinzufügen */
  for (const importedTask of imported.tasks) {
    if (!local.tasks.some((t) => t.id === importedTask.id)) {
      mergedTasks.push(importedTask);
      addedCount++;
    }
  }

  const merged: Project = {
    ...local,
    tasks: mergedTasks,
    updatedAt: now,
  };

  return { merged, conflicts: conflictCount, added: addedCount };
}

/* ── Aufgaben-Inhalte vergleichen (ohne Bilder) ── */

function tasksContentEqual(a: Task, b: Task): boolean {
  return (
    a.name === b.name &&
    a.description === b.description &&
    a.status === b.status &&
    a.editedBy === b.editedBy &&
    a.editedAt === b.editedAt &&
    a.hintText === b.hintText &&
    a.plannedWork === b.plannedWork &&
    materialEqual(a.material, b.material)
  );
}

function materialEqual(a: Task['material'], b: Task['material']): boolean {
  if (a.length !== b.length) return false;
  const key = (m: { name: string; quantity: number; unit: string }) =>
    `${m.name}|${m.quantity}|${m.unit}`;
  const sa = [...a].map(key).sort();
  const sb = [...b].map(key).sort();
  return sa.every((v, i) => v === sb[i]);
}

/* ── Bilder mergen (Hash-Deduplizierung) ── */

function mergeTaskImages(base: Task, other: Task): Task {
  return {
    ...base,
    images: mergeImageLists(base.images, other.images),
    afterImages: mergeImageLists(base.afterImages, other.afterImages),
  };
}

function mergeImageLists(a: TaskImage[], b: TaskImage[]): TaskImage[] {
  const known = new Set(a.map((img) => img.hash));
  const out = [...a];
  for (const img of b) {
    if (!known.has(img.hash)) {
      out.push(img);
      known.add(img.hash);
    }
  }
  return out;
}