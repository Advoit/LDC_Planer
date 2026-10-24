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
      'Zugang verweigert – API-Token oder Berechtigung prüfen.',
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

/** Prüft, ob Server und Bibliothek erreichbar sind. */
export async function checkServer(
  conn: SeafileConnection,
  token: string,
): Promise<void> {
  await send(repoApi(conn, ''), { method: 'GET' }, token, 15000);
}

async function getUploadLink(
  conn: SeafileConnection,
  token: string,
  dir: string,
): Promise<string> {
  const response = await send(
    repoApi(conn, `upload-link/?p=${encodeURIComponent(dir)}`),
    { method: 'GET' },
    token,
    20000,
  );
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
  const form = new FormData();
  form.append('file', content, name);
  form.append('parent_dir', dir);
  form.append('replace', '1');

  const separator = uploadLink.includes('?') ? '&' : '?';
  await send(uploadLink + separator + 'ret-json=1', { method: 'POST', body: form }, null, 120000);
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
  let response: Response;
  try {
    response = await send(
      repoApi(conn, `file/?p=${encodeURIComponent(filePath)}`),
      { method: 'GET' },
      token,
      20000,
    );
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
  try {
    await send(
      repoApi(conn, `file/?p=${encodeURIComponent(filePath)}`),
      { method: 'DELETE' },
      token,
      20000,
    );
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
