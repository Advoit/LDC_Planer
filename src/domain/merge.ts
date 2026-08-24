/* ── Projekt-Zusammenführung ── */

import type { Project, ProjectDocument, Task, TaskImage } from './types';

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
  sameId: boolean; // true, wenn beide Projekte dieselbe Projekt-ID hatten
}

/* ── Merge ── */

/**
 * Führt zwei Projekte zusammen.
 * Bei unterschiedlicher Projekt-ID bleibt die lokale ID bestehen – die
 * importierten Aufgaben werden angehängt und auf das lokale Projekt
 * umgehängt (projectId wird angepasst).
 */
export async function mergeProjects(
  local: Project,
  imported: Project,
  resolve: (conflict: TaskConflict) => ConflictResolution | Promise<ConflictResolution>,
): Promise<MergeResult> {
  const now = new Date().toISOString();
  const sameId = local.id === imported.id;
  let conflictCount = 0;
  let addedCount = 0;

  /* Bestehende lokale Tasks abgleichen */
  const mergedTasks = await Promise.all(local.tasks.map(async (localTask) => {
    const importedTask = imported.tasks.find((t) => t.id === localTask.id);
    if (!importedTask) return localTask;

    /* Inhalt identisch? Dann lokales behalten und nur Bilder/Dokumente mergen. */
    if (tasksContentEqual(localTask, importedTask)) {
      return mergeTaskAssets(localTask, importedTask);
    }

    /* Konflikt: Benutzer entscheidet per Modal. */
    conflictCount++;
    const choice = await resolve({ local: localTask, imported: importedTask });

    if (choice === 'imported') {
      return {
        ...mergeTaskAssets(importedTask, localTask),
        projectId: local.id,
      };
    }
    return mergeTaskAssets(localTask, importedTask);
  }));

  /* Nur im Import existierende Tasks hinzufügen (auf lokale ID umhängen) */
  for (const importedTask of imported.tasks) {
    if (!local.tasks.some((t) => t.id === importedTask.id)) {
      mergedTasks.push({
        ...importedTask,
        projectId: local.id,
      });
      addedCount++;
    }
  }

  const merged: Project = {
    ...local,
    /* Deckblatt-Einstellungen: lokal bevorzugt, sonst die importierten */
    reportCover: local.reportCover ?? imported.reportCover,
    documents: mergeDocumentLists(local.documents, imported.documents),
    tasks: mergedTasks,
    updatedAt: now,
  };

  return {
    merged,
    conflicts: conflictCount,
    added: addedCount,
    sameId,
  };
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
    a.personnel === b.personnel &&
    a.typ === b.typ &&
    a.art === b.art &&
    a.pruefung === b.pruefung &&
    a.fehlerbeschreibung === b.fehlerbeschreibung &&
    a.position === b.position &&
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

/* ── Projekt-Unterlagen mergen (Hash-Deduplizierung) ── */

function mergeDocumentLists(
  a: ProjectDocument[] | undefined,
  b: ProjectDocument[] | undefined,
): ProjectDocument[] {
  const known = new Set((a ?? []).map((d) => d.hash));
  const out = [...(a ?? [])];
  for (const doc of b ?? []) {
    if (!known.has(doc.hash)) {
      out.push(doc);
      known.add(doc.hash);
    }
  }
  return out;
}

/* ── Bilder mergen (Hash-Deduplizierung) ── */

function mergeTaskAssets(base: Task, other: Task): Task {
  return {
    ...base,
    images: mergeImageLists(base.images, other.images),
    afterImages: mergeImageLists(base.afterImages, other.afterImages),
    documents: mergeDocumentLists(base.documents, other.documents),
    afterDocuments: mergeDocumentLists(base.afterDocuments, other.afterDocuments),
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