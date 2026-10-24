/* ── Seafile-Web-API: klein und ohne Framework (Upload, Download, Löschen) ── */

import { getPreference, setPreference } from './preferences';
import { randomId } from './id';
import { joinServerPath, serverDirPath } from '../domain/server';
import type { SeafileConnection } from '../domain/server';

export type SeafileErrorKind = 'auth' | 'network' | 'notfound' | 'http';

/** Fehler mit grober Ursache – daraus wird der Cloud-Status abgeleitet. */
export class SeafileError extends Error {
  readonly kind: SeafileErrorKind;
  readonly status: number | null;

  constructor(kind: SeafileErrorKind, message: string, status: number | null = null) {
    super(message);
    this.name = 'SeafileError';
    this.kind = kind;
    this.status = status;
  }
}

function apiUrl(conn: SeafileConnection, path: string): string {
  return `${conn.url.replace(/\/+$/, '')}${path}`;
}

function repoApi(conn: SeafileConnection, suffix: string): string {
  return apiUrl(conn, `/api2/repos/${encodeURIComponent(conn.repoId)}/${suffix}`);
}

/** Pfad innerhalb der Bibliothek – relativ oder bereits absolut. */
function toRepoPath(conn: SeafileConnection, path: string): string {
  return path.startsWith('/') ? path : joinServerPath(conn.path, path);
}

function splitRepoPath(path: string): { dir: string; name: string } {
  const index = path.lastIndexOf('/');
  return { dir: path.slice(0, index + 1), name: path.slice(index + 1) };
}

/* ── Token-Arten ──
   Persönliche API-Token laufen über /api2/repos/<id>/… . Bibliotheks-Token
   (Seafile: Bibliothek → Erweitert → API-Token) akzeptiert Seafile nur über
   die via-repo-token-Endpunkte der API v2.1. Die Art wird beim ersten
   erfolgreichen Test erkannt und für die Sitzung gemerkt. */

type TokenMode = 'personal' | 'repo';

const tokenModes = new Map<string, TokenMode>();

function tokenModeKey(conn: SeafileConnection, token: string): string {
  return `${conn.url.replace(/\/+$/, '')}|${conn.repoId}|${token}`;
}

function repoTokenApi(conn: SeafileConnection, suffix: string): string {
  return apiUrl(conn, `/api/v2.1/via-repo-token/${suffix}`);
}

function isRepoToken(conn: SeafileConnection, token: string): boolean {
  return tokenModes.get(tokenModeKey(conn, token)) === 'repo';
}

function rememberTokenMode(
  conn: SeafileConnection,
  token: string,
  mode: TokenMode,
): void {
  tokenModes.set(tokenModeKey(conn, token), mode);
}

/**
 * Führt eine Anfrage aus. Netzwerkfehler (auch CORS) werden als `network`
 * gemeldet – nur so lässt sich „Server offline“ von „Token ungültig“ trennen.
 */
async function send(
  url: string,
  init: RequestInit,
  token: string | null,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    const headers = new Headers(init.headers);
    if (token) headers.set('Authorization', `Token ${token}`);
    response = await fetch(url, {
      ...init,
      headers,
      signal: controller.signal,
      cache: 'no-store',
    });
  } catch {
    throw new SeafileError(
      'network',
      'Server nicht erreichbar. Bitte Netzwerk und die CORS-Freigabe des Servers prüfen.',
    );
  } finally {
    clearTimeout(timer);
  }

  if (response.ok) return response;

  if (response.status === 401 || response.status === 403) {
    throw new SeafileError(
      'auth',
      'Zugang verweigert – API-Token oder Berechtigung prüfen. Bei einem Bibliotheks-Token: Link und Bibliothek müssen übereinstimmen, der Token braucht Lese-/Schreibrechte (rw).',
      response.status,
    );
  }
  if (response.status === 404) {
    throw new SeafileError(
      'notfound',
      'Bibliothek, Ordner oder Datei wurde nicht gefunden.',
      response.status,
    );
  }
  if (response.status >= 500) {
    throw new SeafileError(
      'network',
      'Der Server meldet einen Fehler. Bitte später erneut versuchen.',
      response.status,
    );
  }
  throw new SeafileError(
    'http',
    `Der Server antwortet mit HTTP ${response.status}.`,
    response.status,
  );
}

/** Seafile liefert Links als JSON-String (teilweise mit Anführungszeichen). */
function parseLinkValue(text: string): string {
  const trimmed = text.trim();
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed === 'string') return parsed;
  } catch {
    /* Kein JSON – darunter der einfache Textfall */
  }
  return trimmed.replace(/^"|"$/g, '');
}

/** Prüft einen Bibliotheks-Token und vergleicht die Bibliothek mit dem Link. */
async function checkRepoToken(
  conn: SeafileConnection,
  token: string,
): Promise<void> {
  const response = await send(
    repoTokenApi(conn, 'repo-info/'),
    { method: 'GET' },
    token,
    15000,
  );
  const info = (await response.json().catch(() => null)) as {
    repo_id?: unknown;
  } | null;
  if (
    info &&
    typeof info.repo_id === 'string' &&
    info.repo_id &&
    info.repo_id.toLowerCase() !== conn.repoId.toLowerCase()
  ) {
    throw new SeafileError(
      'auth',
      'Der Bibliotheks-Token gehört zu einer anderen Bibliothek. Bitte den Link der Bibliothek verwenden, für die der Token erstellt wurde.',
    );
  }
  rememberTokenMode(conn, token, 'repo');
}

/** Prüft, ob Server und Bibliothek erreichbar sind. */
export async function checkServer(
  conn: SeafileConnection,
  token: string,
): Promise<void> {
  if (isRepoToken(conn, token)) {
    await checkRepoToken(conn, token);
    return;
  }

  try {
    await send(repoApi(conn, ''), { method: 'GET' }, token, 15000);
    rememberTokenMode(conn, token, 'personal');
  } catch (err) {
    /* Ein Bibliotheks-Token wird von /api2 mit 401/403 abgelehnt. Dann über
       die Token-API prüfen – und sicherstellen, dass der Token wirklich zu
       der Bibliothek aus dem Link gehört. */
    if (!(err instanceof SeafileError) || err.kind !== 'auth') throw err;
    await checkRepoToken(conn, token);
  }
}

async function getUploadLink(
  conn: SeafileConnection,
  token: string,
  dir: string,
): Promise<string> {
  /* Die via-repo-token-API erwartet den Pfad ohne abschließenden Schrägstrich. */
  const linkPath = isRepoToken(conn, token)
    ? dir === '/'
      ? '/'
      : dir.replace(/\/+$/, '')
    : dir;
  const url = isRepoToken(conn, token)
    ? repoTokenApi(conn, `upload-link/?path=${encodeURIComponent(linkPath)}`)
    : repoApi(conn, `upload-link/?p=${encodeURIComponent(dir)}`);
  let response: Response;
  try {
    response = await send(url, { method: 'GET' }, token, 20000);
  } catch (err) {
    if (err instanceof SeafileError && err.kind === 'notfound') {
      throw new SeafileError(
        'notfound',
        `Der Zielordner „${linkPath}“ wurde auf dem Server nicht gefunden. Bitte den Link des Ordners prüfen.`,
        404,
      );
    }
    throw err;
  }
  const link = parseLinkValue(await response.text());
  if (!/^https?:\/\//i.test(link)) {
    throw new SeafileError('http', 'Der Server hat keinen gültigen Upload-Link geliefert.');
  }
  return link;
}

/**
 * Lädt mehrere Dateien in einem Durchgang hoch. Der Upload-Link gilt für das
 * Hauptverzeichnis; `relative_path` legt die Unterordner an (auch mehrere
 * Ebenen). So entsteht die Ordnerstruktur direkt auf dem Server.
 */
export async function uploadFiles(
  conn: SeafileConnection,
  token: string,
  files: Array<{ path: string; content: Blob }>,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  if (files.length === 0) return;
  const uploadLink = await getUploadLink(conn, token, '/');

  for (let i = 0; i < files.length; i++) {
    const repoPath = toRepoPath(conn, files[i].path);
    const { dir, name } = splitRepoPath(repoPath);
    if (!name) {
      throw new SeafileError('http', `Ungültiger Dateipfad: ${repoPath}`);
    }

    const form = new FormData();
    form.append('file', files[i].content, name);
    form.append('parent_dir', '/');
    const relativeDir = dir.replace(/^\/+/, '');
    if (relativeDir) form.append('relative_path', relativeDir);
    form.append('replace', '1');

    const separator = uploadLink.includes('?') ? '&' : '?';
    try {
      await send(
        uploadLink + separator + 'ret-json=1',
        { method: 'POST', body: form },
        null,
        120000,
      );
    } catch (err) {
      if (err instanceof SeafileError && err.kind === 'notfound') {
        throw new SeafileError(
          'notfound',
          `Die Datei „${name}“ wurde nicht hochgeladen: Der Ordner „${dir}“ wurde nicht gefunden.`,
          404,
        );
      }
      throw err;
    }
    onProgress?.(i + 1, files.length);
  }
}

/** Lädt eine einzelne Datei an einen Pfad innerhalb der Bibliothek. */
export async function uploadFileAtPath(
  conn: SeafileConnection,
  token: string,
  path: string,
  content: Blob,
): Promise<void> {
  await uploadFiles(conn, token, [{ path, content }]);
}

export async function uploadTextAtPath(
  conn: SeafileConnection,
  token: string,
  path: string,
  text: string,
  mime = 'text/plain;charset=utf-8',
): Promise<void> {
  await uploadFileAtPath(conn, token, path, new Blob([text], { type: mime }));
}

/** Lädt eine Datei in den verknüpften Ordner (vorhandene Namen werden ersetzt). */
export async function uploadFile(
  conn: SeafileConnection,
  token: string,
  name: string,
  content: Blob,
): Promise<void> {
  const dir = serverDirPath(conn.path);
  const uploadLink = await getUploadLink(conn, token, dir);
  /* Seafile verlangt, dass parent_dir exakt dem Pfad des Upload-Links
     entspricht. Die via-repo-token-API arbeitet ohne abschließenden
     Schrägstrich; /api2 erwartet ihn. */
  const parentDir = isRepoToken(conn, token)
    ? conn.path === '/'
      ? '/'
      : conn.path.replace(/\/+$/, '')
    : dir;
  const form = new FormData();
  form.append('file', content, name);
  form.append('parent_dir', parentDir);
  form.append('replace', '1');

  const separator = uploadLink.includes('?') ? '&' : '?';
  try {
    await send(
      uploadLink + separator + 'ret-json=1',
      { method: 'POST', body: form },
      null,
      120000,
    );
  } catch (err) {
    if (err instanceof SeafileError && err.kind === 'notfound') {
      throw new SeafileError(
        'notfound',
        `Der Upload-Ordner „${parentDir}“ wurde auf dem Server nicht gefunden.`,
        404,
      );
    }
    throw err;
  }
}

export async function uploadText(
  conn: SeafileConnection,
  token: string,
  name: string,
  text: string,
  mime = 'text/plain;charset=utf-8',
): Promise<void> {
  await uploadFile(conn, token, name, new Blob([text], { type: mime }));
}

/** Liest eine Datei an einem Pfad innerhalb der Bibliothek. */
export async function downloadFileAtPath(
  conn: SeafileConnection,
  token: string,
  path: string,
): Promise<Uint8Array | null> {
  const filePath = toRepoPath(conn, path);
  const url = isRepoToken(conn, token)
    ? repoTokenApi(conn, `download-link/?path=${encodeURIComponent(filePath)}`)
    : repoApi(conn, `file/?p=${encodeURIComponent(filePath)}`);
  let response: Response;
  try {
    response = await send(url, { method: 'GET' }, token, 20000);
  } catch (err) {
    if (err instanceof SeafileError && err.kind === 'notfound') return null;
    throw err;
  }

  const rawLink = parseLinkValue(await response.text());
  let link: string;
  try {
    link = new URL(rawLink, conn.url).toString();
  } catch {
    throw new SeafileError('http', 'Der Download-Link konnte nicht gelesen werden.');
  }

  const fileResponse = await send(link, { method: 'GET' }, null, 120000);
  return new Uint8Array(await fileResponse.arrayBuffer());
}

/** Liest eine Datei; `null`, wenn sie noch nicht existiert. */
export async function downloadFile(
  conn: SeafileConnection,
  token: string,
  name: string,
): Promise<Uint8Array | null> {
  return downloadFileAtPath(conn, token, joinServerPath(conn.path, name));
}

export async function downloadTextAtPath(
  conn: SeafileConnection,
  token: string,
  path: string,
): Promise<string | null> {
  const bytes = await downloadFileAtPath(conn, token, path);
  if (!bytes) return null;
  return new TextDecoder().decode(bytes);
}

export async function downloadText(
  conn: SeafileConnection,
  token: string,
  name: string,
): Promise<string | null> {
  return downloadTextAtPath(conn, token, joinServerPath(conn.path, name));
}

/** Löscht eine Datei an einem Pfad innerhalb der Bibliothek. */
export async function deleteFileAtPath(
  conn: SeafileConnection,
  token: string,
  path: string,
): Promise<boolean> {
  const filePath = toRepoPath(conn, path);
  const url = isRepoToken(conn, token)
    ? repoTokenApi(conn, `file/?path=${encodeURIComponent(filePath)}`)
    : repoApi(conn, `file/?p=${encodeURIComponent(filePath)}`);
  try {
    await send(url, { method: 'DELETE' }, token, 20000);
    return true;
  } catch (err) {
    if (err instanceof SeafileError && err.kind === 'notfound') return false;
    throw err;
  }
}

/** Löscht ein leeres Verzeichnis; `false`, wenn es fehlt oder nicht leer ist. */
export async function deleteDirectoryAtPath(
  conn: SeafileConnection,
  token: string,
  path: string,
): Promise<boolean> {
  const repoPath = toRepoPath(conn, path);
  const url = isRepoToken(conn, token)
    ? repoTokenApi(conn, `dir/?path=${encodeURIComponent(repoPath)}`)
    : repoApi(conn, `dir/?p=${encodeURIComponent(repoPath)}`);
  try {
    await send(url, { method: 'DELETE' }, token, 20000);
    return true;
  } catch (err) {
    if (
      err instanceof SeafileError &&
      (err.kind === 'notfound' || err.kind === 'http')
    ) {
      return false;
    }
    throw err;
  }
}

/** Löscht eine Datei. `false`, wenn sie bereits weg war. */
export async function deleteFile(
  conn: SeafileConnection,
  token: string,
  name: string,
): Promise<boolean> {
  return deleteFileAtPath(conn, token, joinServerPath(conn.path, name));
}

export interface RemoteDirEntry {
  type: 'file' | 'dir';
  name: string;
  /** Größe in Byte (nur bei Dateien, sofern der Server sie liefert). */
  size?: number;
  /** Änderungszeit (Unix-Sekunden) – für den schnellen Abgleich. */
  mtime?: number;
  /** Inhalts-/Objekt-ID, sofern Seafile sie im Verzeichnis liefert. */
  id?: string;
}

function remoteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

/** Liest ein Verzeichnis; `null`, wenn es nicht existiert. */
export async function listDirectory(
  conn: SeafileConnection,
  token: string,
  path: string,
): Promise<RemoteDirEntry[] | null> {
  const repoPath = toRepoPath(conn, path);
  const url = isRepoToken(conn, token)
    ? repoTokenApi(conn, `dir/?path=${encodeURIComponent(repoPath)}`)
    : repoApi(conn, `dir/?p=${encodeURIComponent(repoPath)}`);
  let response: Response;
  try {
    response = await send(url, { method: 'GET' }, token, 20000);
  } catch (err) {
    if (err instanceof SeafileError && err.kind === 'notfound') return null;
    throw err;
  }

  const data = (await response.json().catch(() => null)) as unknown;
  const rawList = Array.isArray(data)
    ? data
    : data &&
        typeof data === 'object' &&
        Array.isArray((data as { dirent_list?: unknown }).dirent_list)
      ? (data as { dirent_list: unknown[] }).dirent_list
      : [];
  const entries: RemoteDirEntry[] = [];
  for (const item of rawList) {
    if (typeof item !== 'object' || item === null) continue;
    const entry = item as {
      type?: unknown;
      name?: unknown;
      size?: unknown;
      mtime?: unknown;
      id?: unknown;
    };
    if (
      (entry.type === 'file' || entry.type === 'dir') &&
      typeof entry.name === 'string' &&
      entry.name
    ) {
      const parsed: RemoteDirEntry = { type: entry.type, name: entry.name };
      const size = remoteNumber(entry.size);
      const mtime = remoteNumber(entry.mtime);
      if (size !== undefined) parsed.size = size;
      if (mtime !== undefined) parsed.mtime = mtime;
      if (typeof entry.id === 'string' && entry.id) parsed.id = entry.id;
      entries.push(parsed);
    }
  }
  return entries;
}

export interface RemoteFileEntry {
  path: string;
  name: string;
  size?: number;
  mtime?: number;
  id?: string;
}

/** Liest alle Dateien eines Ordners rekursiv inklusive Metadaten. */
export async function listFilesRecursiveDetailed(
  conn: SeafileConnection,
  token: string,
  path: string,
): Promise<RemoteFileEntry[] | null> {
  const root = toRepoPath(conn, path);
  const files: RemoteFileEntry[] = [];

  async function walk(dir: string): Promise<boolean> {
    const entries = await listDirectory(conn, token, dir);
    if (entries === null) return false;
    for (const entry of entries) {
      const child = `${dir.replace(/\/+$/, '')}/${entry.name}`;
      if (entry.type === 'dir') {
        await walk(child);
      } else {
        files.push({
          path: child,
          name: entry.name,
          ...(entry.size !== undefined ? { size: entry.size } : {}),
          ...(entry.mtime !== undefined ? { mtime: entry.mtime } : {}),
          ...(entry.id ? { id: entry.id } : {}),
        });
      }
    }
    return true;
  }

  if (!(await walk(root))) return null;
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return files;
}

/** Liest alle Dateien eines Ordners rekursiv; `null`, wenn er fehlt. */
export async function listFilesRecursive(
  conn: SeafileConnection,
  token: string,
  path: string,
): Promise<string[] | null> {
  const files = await listFilesRecursiveDetailed(conn, token, path);
  return files?.map((entry) => entry.path) ?? null;
}

export interface SeafileShareLink {
  link: string;
  token: string;
}

/**
 * Erstellt einen Seafile-Freigabe-Link für eine Datei oder einen Ordner.
 * Der Link erlaubt nur Lesen/Herunterladen, keine Änderungen.
 */
export async function createShareLink(
  conn: SeafileConnection,
  token: string,
  path: string,
): Promise<SeafileShareLink> {
  const repoPath = toRepoPath(conn, path);
  let response: Response;
  try {
    response = await send(
      apiUrl(conn, '/api/v2.1/share-links/'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repo_id: conn.repoId,
          path: repoPath,
          permissions: { can_edit: false, can_download: true },
        }),
      },
      token,
      30000,
    );
  } catch (err) {
    if (err instanceof SeafileError && err.kind === 'auth') {
      throw new SeafileError(
        'auth',
        'Dieser Token darf keine Freigabe-Links erstellen. Bitte einen persönlichen API-Token verwenden oder die Freigabe-ZIP manuell weitergeben.',
        err.status,
      );
    }
    throw err;
  }

  const data = (await response.json().catch(() => null)) as {
    link?: unknown;
    token?: unknown;
  } | null;
  if (!data || typeof data.link !== 'string' || !data.link.trim()) {
    throw new SeafileError(
      'http',
      'Der Server hat keinen gültigen Freigabe-Link geliefert.',
    );
  }

  let link: string;
  try {
    link = new URL(data.link, conn.url).toString();
  } catch {
    throw new SeafileError('http', 'Der Freigabe-Link konnte nicht gelesen werden.');
  }

  return {
    link,
    token: typeof data.token === 'string' ? data.token : '',
  };
}

/* ── Token & Geräte-ID: bleiben ausschließlich auf diesem Gerät ── */

const TOKEN_KEY = 'seafile.tokens';
const DEVICE_KEY = 'seafile.deviceId';

function tokenKey(conn: Pick<SeafileConnection, 'url' | 'repoId'>): string {
  return `${conn.url.replace(/\/+$/, '')}|${conn.repoId}`;
}

export function readServerToken(conn: Pick<SeafileConnection, 'url' | 'repoId'>): string {
  const tokens = getPreference<Record<string, string>>(TOKEN_KEY, {});
  const value = tokens[tokenKey(conn)];
  return typeof value === 'string' ? value : '';
}

export function saveServerToken(
  conn: Pick<SeafileConnection, 'url' | 'repoId'>,
  token: string,
): void {
  const tokens = { ...getPreference<Record<string, string>>(TOKEN_KEY, {}) };
  const key = tokenKey(conn);
  const trimmed = token.trim();
  if (trimmed) tokens[key] = trimmed;
  else delete tokens[key];
  setPreference(TOKEN_KEY, tokens);
}

let cachedDeviceId: string | null = null;

/** Stabile Geräte-ID – unterscheidet eigene von fremden Sperren. */
export function getDeviceId(): string {
  if (cachedDeviceId) return cachedDeviceId;
  let id = getPreference<string>(DEVICE_KEY, '');
  if (!id) {
    id = randomId(12);
    setPreference(DEVICE_KEY, id);
  }
  cachedDeviceId = id;
  return id;
}
