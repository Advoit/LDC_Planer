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