/* ── Projekt-Domain: Erzeugen & Validieren ── */

import { CURRENT_SCHEMA_VERSION } from '../core/migrate';
import { randomId } from '../core/id';
import type { Project } from './types';

export interface NewProjectInput {
  name: string;
  location: string;
  description: string;
}

export function createProject(input: NewProjectInput): Project {
  const now = new Date().toISOString();
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: randomId(),
    name: input.name.trim(),
    location: input.location.trim(),
    description: input.description.trim(),
    createdAt: now,
    updatedAt: now,
    tasks: [],
    documents: [],
  };
}

export function validateProjectInput(input: NewProjectInput): string | null {
  if (!input.name.trim()) return 'Bitte einen Projektnamen angeben.';
  if (!input.location.trim()) return 'Bitte einen Ort angeben.';
  return null;
}

export function touchProject(project: Project): Project {
  return { ...project, updatedAt: new Date().toISOString() };
}

/** Leichtgewichtige Projekt-Kennzahlen für die Projektliste (ohne Bilder/Daten). */
export interface ProjectSummary {
  id: string;
  name: string;
  location: string;
  createdAt: string;
  updatedAt: string;
  taskCount: number;
  openCount: number;
  documentCount: number;
}

export function projectSummary(project: Project): ProjectSummary {
  return {
    id: project.id,
    name: project.name,
    location: project.location,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    taskCount: project.tasks.length,
    openCount: project.tasks.filter((t) => t.status !== 'behoben').length,
    documentCount: (project.documents ?? []).length,
  };
}

/** Sortiert Projektübersichten: zuletzt geänderte zuerst. */
export function compareProjectSummaries(
  a: ProjectSummary,
  b: ProjectSummary,
): number {
  return b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name, 'de');
}