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

/** Liest eine Datei; `null`, wenn sie noch nicht existiert. */
export async function downloadFile(
  conn: SeafileConnection,
  token: string,
  name: string,
): Promise<Uint8Array | null> {
  const filePath = joinServerPath(conn.path, name);
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

export async function downloadText(
  conn: SeafileConnection,
  token: string,
  name: string,
): Promise<string | null> {
  const bytes = await downloadFile(conn, token, name);
  if (!bytes) return null;
  return new TextDecoder().decode(bytes);
}

/** Löscht eine Datei. `false`, wenn sie bereits weg war. */
export async function deleteFile(
  conn: SeafileConnection,
  token: string,
  name: string,
): Promise<boolean> {
  const filePath = joinServerPath(conn.path, name);
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
