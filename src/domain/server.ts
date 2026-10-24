/* ── Seafile-Anbindung: Link-Analyse, Dateinamen und Bearbeitungssperren ── */

import type { ProjectServer } from './types';

/** Verbindungsdaten, wie sie aus einem Seafile-Bibliothekslink entstehen. */
export interface SeafileConnection {
  url: string; // Basis-URL der Seafile-Instanz, z. B. https://cloud.example.com
  repoId: string; // Bibliotheks-ID aus /lib/<repo-id>/… oder /library/<repo-id>/…
  path: string; // Zielordner im Repo, immer mit führendem '/', ohne abschließenden '/'
  /** Pfadsegment der Weboberfläche: „lib“ (älter) oder „library“ (neuer). */
  linkStyle?: 'lib' | 'library';
}

/** Ergebnis der Link-Analyse. Genau eines von beiden ist gesetzt. */
export interface ParsedSeafileLink {
  connection: SeafileConnection | null;
  error: string | null;
}

/**
 * Liest Server, Bibliotheks-ID und Zielordner aus einem Seafile-Bibliothekslink
 * der Form `https://server/lib/<repo-id>/<ordner>/…` oder der neueren Form
 * `https://server/library/<repo-id>/<ordner>/…`.
 *
 * Freigabe- (`/f/…`) und Upload-Links (`/u/…`) reichen für den Abgleich nicht
 * aus und werden mit einer verständlichen Meldung abgelehnt.
 */
export function parseSeafileLink(raw: string): ParsedSeafileLink {
  const value = raw.trim();
  if (!value) {
    return fail('Bitte den Seafile-Link einfügen.');
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return fail(
      'Bitte einen vollständigen Link einfügen, z. B. https://server/lib/<Bibliothek>/<Ordner>.',
    );
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return fail('Der Link muss mit http:// oder https:// beginnen.');
  }

  const libMarker = url.pathname.indexOf('/lib/');
  const libraryMarker = url.pathname.indexOf('/library/');
  let marker = -1;
  let linkStyle: 'lib' | 'library' = 'lib';
  if (libMarker >= 0) {
    marker = libMarker;
    linkStyle = 'lib';
  } else if (libraryMarker >= 0) {
    marker = libraryMarker;
    linkStyle = 'library';
  }

  if (marker < 0) {
    if (url.pathname.startsWith('/f/')) {
      return fail(
        'Das ist ein Freigabe-Link. Er erlaubt keinen Upload. Bitte den Bibliotheks-Link aus Seafile öffnen und diesen einfügen.',
      );
    }
    if (url.pathname.startsWith('/u/')) {
      return fail(
        'Das ist ein Upload-Link. Er erlaubt kein Lesen oder Löschen. Bitte den Bibliotheks-Link der Bibliothek einfügen.',
      );
    }
    return fail(
      'Bitte einen Bibliotheks-Link der Form https://server/lib/<Bibliothek>/<Ordner> oder https://server/library/<Bibliothek>/<Ordner> einfügen.',
    );
  }

  const base = `${url.origin}${url.pathname.slice(0, marker)}`.replace(/\/+$/, '');
  const rest = url.pathname.slice(
    marker + (linkStyle === 'lib' ? '/lib/'.length : '/library/'.length),
  );
  const rawSegments = rest.split('/').filter((part) => part.length > 0);
  const repoId = rawSegments.shift();
  if (!repoId) {
    return fail('Im Link fehlt die Bibliotheks-ID.');
  }

  let segments: string[];
  try {
    segments = rawSegments.map((part) => decodeURIComponent(part));
  } catch {
    return fail('Der Link enthält ungültige Zeichen.');
  }

  return {
    connection: {
      url: base,
      repoId,
      path: segments.length > 0 ? `/${segments.join('/')}` : '/',
      linkStyle,
    },
    error: null,
  };
}

function fail(error: string): ParsedSeafileLink {
  return { connection: null, error };
}

/** Bibliothekslink aus gespeicherten Verbindungsdaten zusammensetzen. */
export function serverLink(server: {
  url: string;
  repoId: string;
  path: string;
  linkStyle?: 'lib' | 'library';
}): string {
  const style = server.linkStyle === 'library' ? 'library' : 'lib';
  const base = `${server.url.replace(/\/+$/, '')}/${style}/${encodeURIComponent(server.repoId)}`;
  if (server.path === '/' || server.path === '') return `${base}/`;
  const suffix = server.path
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join('/');
  return `${base}/${suffix}`;
}

/** Eine Projekt-ID als sicheren Dateinamensteil (Import-IDs sind nicht geprüft). */
export function safeNamePart(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, '_');
}

export function projectArchiveName(projectId: string): string {
  return `LDC-Projekt-${safeNamePart(projectId)}.zip`;
}

export function projectLockFileName(projectId: string): string {
  return `LDC-Projekt-${safeNamePart(projectId)}.locks.json`;
}

export function projectTestFileName(projectId: string): string {
  return `LDC-Test-${safeNamePart(projectId)}.txt`;
}

/** Ordnerpfad + Dateiname, ohne doppelte Schrägstriche. */
export function joinServerPath(dir: string, name: string): string {
  const base = dir.replace(/\/+$/, '');
  return `${base}/${name}`;
}

/** Ordnerpfad in der Schreibweise, die Seafile für `parent_dir` erwartet. */
export function serverDirPath(path: string): string {
  const clean = path.trim();
  if (!clean || clean === '/') return '/';
  return `${clean.replace(/\/+$/, '')}/`;
}

/* ── Bearbeitungssperren ──
   Alle Sperren eines Projekts liegen in einer kleinen JSON-Datei neben der
   Projekt-ZIP. Jeder Client schreibt beim Öffnen einer Aufgabe seinen Eintrag
   und hält ihn per Heartbeat lebendig. Ohne Heartbeat läuft die Sperre ab,
   damit ein abgestürzter Client die Aufgabe nicht dauerhaft blockiert. */

export interface TaskLockEntry {
  user: string;
  deviceId: string;
  since: string;
  heartbeat: string;
}

export interface LockFile {
  version: 1;
  locks: Record<string, TaskLockEntry>;
}

/** Sperre läuft nach fünf Minuten ohne Heartbeat ab. */
export const LOCK_TTL_MS = 5 * 60 * 1000;

export function emptyLockFile(): LockFile {
  return { version: 1, locks: {} };
}

export function normalizeLockFile(raw: unknown): LockFile {
  if (typeof raw !== 'object' || raw === null) return emptyLockFile();
  const data = raw as { locks?: unknown };
  if (typeof data.locks !== 'object' || data.locks === null) return emptyLockFile();

  const locks: Record<string, TaskLockEntry> = {};
  for (const [taskId, value] of Object.entries(data.locks as Record<string, unknown>)) {
    if (!taskId || typeof value !== 'object' || value === null) continue;
    const entry = value as Partial<TaskLockEntry>;
    if (
      typeof entry.user !== 'string' ||
      typeof entry.deviceId !== 'string' ||
      typeof entry.since !== 'string' ||
      typeof entry.heartbeat !== 'string'
    ) {
      continue;
    }
    locks[taskId] = {
      user: entry.user,
      deviceId: entry.deviceId,
      since: entry.since,
      heartbeat: entry.heartbeat,
    };
  }
  return { version: 1, locks };
}

export function isLockActive(entry: TaskLockEntry, now = Date.now()): boolean {
  const heartbeat = Date.parse(entry.heartbeat);
  if (!Number.isFinite(heartbeat)) return false;
  /* Ein Heartbeat „aus der Zukunft“ (Uhrenabweichung) gilt als frisch. */
  return now - heartbeat < LOCK_TTL_MS;
}

/** Entfernt abgelaufene Sperren. */
export function pruneLocks(file: LockFile, now = Date.now()): LockFile {
  const locks: Record<string, TaskLockEntry> = {};
  for (const [taskId, entry] of Object.entries(file.locks)) {
    if (isLockActive(entry, now)) locks[taskId] = entry;
  }
  return { version: 1, locks };
}

/** Aktive Sperre einer anderen Person (eigenes Gerät zählt nicht). */
export function otherLockHolder(
  file: LockFile,
  taskId: string,
  deviceId: string,
  now = Date.now(),
): TaskLockEntry | null {
  const entry = file.locks[taskId];
  if (!entry) return null;
  if (entry.deviceId === deviceId) return null;
  return isLockActive(entry, now) ? entry : null;
}

/** Anzahl aktiver Sperren (für die Status-Info). */
export function countActiveLocks(file: LockFile, now = Date.now()): number {
  return Object.values(file.locks).filter((entry) => isLockActive(entry, now)).length;
}

/** Ist ein Server vollständig verknüpft (nicht nur vorbereitet)? */
export function isLinkedServer(server: ProjectServer | undefined): boolean {
  return Boolean(server && server.linkedAt);
}
