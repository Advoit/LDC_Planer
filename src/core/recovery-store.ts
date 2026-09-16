/* ── Wiederherstellung: Papierkorb (gelöschte Aufgaben) und Sicherungsstände ── */

import { approximateSize, hasSpaceFor, idbDelete, idbGet, idbSet } from './storage';
import type { Project, Task } from '../domain/types';

/* ═════════════ Papierkorb ═════════════ */

export interface TrashedTask {
  task: Task;
  deletedAt: string;
}

/** So viele gelöschte Aufgaben werden je Projekt höchstens aufbewahrt. */
export const MAX_TRASH_ITEMS = 10;

const trashKey = (projectId: string): string => `trash:${projectId}`;

export async function loadTrash(projectId: string): Promise<TrashedTask[]> {
  return (await idbGet<TrashedTask[]>(trashKey(projectId))) ?? [];
}

export async function saveTrash(
  projectId: string,
  items: TrashedTask[],
): Promise<void> {
  await idbSet(trashKey(projectId), items.slice(0, MAX_TRASH_ITEMS));
}

/** Legt gelöschte Aufgaben in den Papierkorb (neueste zuerst, begrenzt). */
export async function addToTrash(
  projectId: string,
  tasks: Task[],
): Promise<TrashedTask[]> {
  const deletedAt = new Date().toISOString();
  const items = tasks.map((task) => ({ task, deletedAt }));
  const next = [...items, ...(await loadTrash(projectId))].slice(0, MAX_TRASH_ITEMS);
  await saveTrash(projectId, next);
  return next;
}

export async function clearTrash(projectId: string): Promise<void> {
  await idbDelete(trashKey(projectId));
}

export async function deleteTrash(projectId: string): Promise<void> {
  await clearTrash(projectId);
}

/* ═════════════ Sicherungsstände ═════════════ */

export interface SnapshotMeta {
  ts: string;
  name: string;
  taskCount: number;
  bytes: number;
}

/** So viele automatische Sicherungsstände werden je Projekt aufbewahrt. */
export const MAX_SNAPSHOTS = 3;

const snapshotIndexKey = (projectId: string): string => `snapshot-index:${projectId}`;
const snapshotKey = (projectId: string, ts: string): string =>
  `snapshot:${projectId}:${ts}`;

export async function listSnapshots(projectId: string): Promise<SnapshotMeta[]> {
  const list = (await idbGet<SnapshotMeta[]>(snapshotIndexKey(projectId))) ?? [];
  return [...list].sort((a, b) => b.ts.localeCompare(a.ts));
}

/**
 * Legt einen Sicherungsstand an – nur wenn ausreichend Speicherplatz frei ist.
 * Der älteste Stand wird entfernt. Gibt `null` zurück, wenn nicht gesichert wurde.
 */
export async function createSnapshot(project: Project): Promise<SnapshotMeta | null> {
  const bytes = approximateSize(project);
  if (bytes === 0 || !(await hasSpaceFor(bytes))) return null;

  const ts = new Date().toISOString();
  const meta: SnapshotMeta = {
    ts,
    name: project.name,
    taskCount: project.tasks.length,
    bytes,
  };

  try {
    await idbSet(snapshotKey(project.id, ts), project);
  } catch {
    return null;
  }

  const existing = await listSnapshots(project.id);
  const next = [meta, ...existing].slice(0, MAX_SNAPSHOTS);
  const removed = existing.slice(MAX_SNAPSHOTS - 1);
  for (const item of removed) {
    await idbDelete(snapshotKey(project.id, item.ts));
  }
  await idbSet(snapshotIndexKey(project.id), next);
  return meta;
}

export async function loadSnapshot(
  projectId: string,
  ts: string,
): Promise<unknown | null> {
  return idbGet<unknown>(snapshotKey(projectId, ts));
}

export async function deleteSnapshot(projectId: string, ts: string): Promise<void> {
  const existing = await listSnapshots(projectId);
  await idbSet(
    snapshotIndexKey(projectId),
    existing.filter((s) => s.ts !== ts),
  );
  await idbDelete(snapshotKey(projectId, ts));
}

/** Löscht Papierkorb und Sicherungsstände eines Projekts (beim Projektlöschen). */
export async function deleteRecoveryData(projectId: string): Promise<void> {
  for (const meta of await listSnapshots(projectId)) {
    await idbDelete(snapshotKey(projectId, meta.ts));
  }
  await idbDelete(snapshotIndexKey(projectId));
  await deleteTrash(projectId);
}
