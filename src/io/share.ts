/* ── Projekt teilen: Freigabe-ZIP mit Zugangsdatei ── */

import { strToU8, zipSync } from 'fflate';
import { exportBaseName } from '../core/file-name';
import { saveServerToken } from '../core/seafile';
import {
  normalizeServerPath,
  projectFolderName,
  safeNamePart,
} from '../domain/server';
import type { Project, ProjectServer } from '../domain/types';
import { buildProjectFiles } from './export';

/** Inhalt der Zugangsdatei – enthält bewusst den API-Token. */
export interface ServerAccess {
  type: 'ldc-server-access';
  version: 1;
  projectId: string;
  url: string;
  repoId: string;
  path: string;
  linkStyle?: 'lib' | 'library';
  token: string;
  createdAt: string;
}

/** Dateiname der Zugangsdatei innerhalb der Freigabe-ZIP. */
export function accessFileName(projectId: string): string {
  return `LDC-Zugang-${safeNamePart(projectId)}.json`;
}

/** Fester Dateiname der Freigabe-ZIP auf dem Server (wird beim Teilen ersetzt). */
export function serverShareName(projectId: string): string {
  return `LDC-Freigabe-${safeNamePart(projectId)}.zip`;
}

/** Dateiname für den lokalen Download der Freigabe-ZIP. */
export function shareZipDownloadName(project: Project): string {
  return `${exportBaseName(project.name, project.id)}-Freigabe.zip`;
}

/** Baut die Zugangsdaten aus der Verknüpfung und dem lokalen Token. */
export function createServerAccess(
  project: Project,
  server: ProjectServer,
  token: string,
): ServerAccess | null {
  const cleanToken = token.trim();
  if (!cleanToken) return null;
  if (!/^https?:\/\//i.test(server.url) || !server.repoId.trim()) return null;
  const normalizedPath = normalizeServerPath(server.path);
  if (normalizedPath.error) return null;
  return {
    type: 'ldc-server-access',
    version: 1,
    projectId: project.id,
    url: server.url.replace(/\/+$/, ''),
    repoId: server.repoId,
    path: normalizedPath.path,
    ...(server.linkStyle ? { linkStyle: server.linkStyle } : {}),
    token: cleanToken,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Baut eine Freigabe-ZIP: die normalen Projektdateien plus die Zugangsdatei.
 * Der Token steht nur in der Zugangsdatei, nicht in `project.json`.
 */
export function buildShareZip(
  project: Project,
  access: ServerAccess,
): Uint8Array {
  const files = buildProjectFiles(project);
  files[`${projectFolderName(project.id)}/${accessFileName(project.id)}`] = strToU8(
    JSON.stringify(access, null, 2),
  );
  return zipSync(files, { level: 6 });
}

/** Prüft und normalisiert eine gelesene Zugangsdatei. */
export function normalizeServerAccess(raw: unknown): ServerAccess | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const value = raw as Partial<ServerAccess> & { type?: unknown; version?: unknown };
  if (value.type !== 'ldc-server-access' || value.version !== 1) return null;
  if (
    typeof value.projectId !== 'string' ||
    !value.projectId ||
    typeof value.url !== 'string' ||
    !/^https?:\/\//i.test(value.url) ||
    typeof value.repoId !== 'string' ||
    !value.repoId.trim() ||
    typeof value.path !== 'string' ||
    typeof value.token !== 'string' ||
    !value.token.trim()
  ) {
    return null;
  }
  const normalizedPath = normalizeServerPath(value.path);
  if (normalizedPath.error) return null;
  const linkStyle =
    value.linkStyle === 'lib' || value.linkStyle === 'library'
      ? value.linkStyle
      : undefined;
  return {
    type: 'ldc-server-access',
    version: 1,
    projectId: value.projectId,
    url: value.url.replace(/\/+$/, ''),
    repoId: value.repoId,
    path: normalizedPath.path,
    ...(linkStyle ? { linkStyle } : {}),
    token: value.token.trim(),
    createdAt:
      typeof value.createdAt === 'string' ? value.createdAt : new Date().toISOString(),
  };
}

/** Sucht die Zugangsdatei in einer entpackten Projekt-ZIP. */
export function readServerAccessFromFiles(
  files: Map<string, Uint8Array>,
): ServerAccess | null {
  for (const [path, bytes] of files) {
    if (!/(^|\/)LDC-Zugang[^/]*\.json$/i.test(path)) continue;
    try {
      const parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
      const access = normalizeServerAccess(parsed);
      if (access) return access;
    } catch {
      /* Ungültige Zugangsdatei ignorieren. */
    }
  }
  return null;
}

/**
 * Übernimmt die Zugangsdaten in ein geladenes Projekt und speichert den Token
 * lokal. Die Zugangsdatei gilt nur für das Projekt, aus dem sie stammt.
 */
export function applyServerAccess(
  project: Project,
  access: ServerAccess,
): { project: Project; applied: boolean } {
  if (access.projectId !== project.id) {
    return { project, applied: false };
  }
  saveServerToken(access, access.token);
  return {
    project: {
      ...project,
      server: {
        url: access.url,
        repoId: access.repoId,
        path: access.path,
        linkedAt: new Date().toISOString(),
        ...(access.linkStyle ? { linkStyle: access.linkStyle } : {}),
      },
    },
    applied: true,
  };
}
