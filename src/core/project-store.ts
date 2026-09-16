/* ── Projektablage: mehrere Projekte, aktives Projekt, Migration alter Sicherungen ── */

import { idbDelete, idbGet, idbSet } from './storage';
import { compareProjectSummaries, projectSummary } from '../domain/project';
import type { ProjectSummary } from '../domain/project';
import type { Project } from '../domain/types';
import { deleteRecoveryData } from './recovery-store';

/* Schlüssel im Key-Value-Store */
const INDEX_KEY = 'project-index';
const ACTIVE_KEY = 'active-project-id';
const LEGACY_KEY = 'current-project'; // alte Version: nur ein Projekt

const projectKey = (id: string): string => `project:${id}`;

/** Alle Projekte (Kennzahlen) – zuletzt geänderte zuerst. */
export async function listProjects(): Promise<ProjectSummary[]> {
  const index = (await idbGet<ProjectSummary[]>(INDEX_KEY)) ?? [];
  return [...index].sort(compareProjectSummaries);
}

/** Kennzahlen eines Projekts in den Index schreiben (vorhandenen Eintrag ersetzen). */
async function upsertIndex(project: Project): Promise<void> {
  const index = (await idbGet<ProjectSummary[]>(INDEX_KEY)) ?? [];
  const summary = projectSummary(project);
  const next = [summary, ...index.filter((s) => s.id !== summary.id)];
  await idbSet(INDEX_KEY, next);
}

export async function loadProject(id: string): Promise<unknown | null> {
  return idbGet<unknown>(projectKey(id));
}

/** Speichert ein Projekt und aktualisiert die Projektliste. */
export async function saveProject(project: Project): Promise<void> {
  await idbSet(projectKey(project.id), project);
  await upsertIndex(project);
}

export async function deleteProject(id: string): Promise<void> {
  const index = (await idbGet<ProjectSummary[]>(INDEX_KEY)) ?? [];
  await idbSet(
    INDEX_KEY,
    index.filter((s) => s.id !== id),
  );
  await idbDelete(projectKey(id));
  await deleteRecoveryData(id);
}

export async function getActiveProjectId(): Promise<string | null> {
  return idbGet<string | null>(ACTIVE_KEY);
}

export async function setActiveProjectId(id: string | null): Promise<void> {
  await idbSet(ACTIVE_KEY, id);
}

/**
 * Migriert die alte Ablage (genau ein Projekt unter „current-project“) in die
 * neue Struktur. Wird beim Start einmalig aufgerufen und ist idempotent.
 */
export async function migrateLegacyProject(): Promise<void> {
  const legacy = await idbGet<Project>(LEGACY_KEY);
  if (!legacy) return;

  const index = (await idbGet<ProjectSummary[]>(INDEX_KEY)) ?? [];
  if (index.length === 0 && typeof legacy.id === 'string' && legacy.id) {
    await saveProject(legacy);
    await setActiveProjectId(legacy.id);
    await idbDelete(LEGACY_KEY);
    return;
  }

  /* Neue Ablage existiert bereits (oder Altdaten sind unvollständig): den alten
     Schlüssel nur entfernen, wenn das Projekt in der neuen Ablage vorhanden ist. */
  if (index.some((summary) => summary.id === legacy.id)) {
    await idbDelete(LEGACY_KEY);
  }
}
