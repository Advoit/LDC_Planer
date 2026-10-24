/* ── Server-Synchronisierung: Seafile-Status, Auto-Upload, Sperren ── */

import { el } from './dom';
import { openModal } from './modal';
import { showToast } from './toast';
import { persist, render, state } from './app-state';
import { runMergeFlow } from './merge-flow';
import { lastEditedBy, rememberEditedBy } from './status-prompt';
import { touchProject } from '../domain/project';
import {
  emptyLockFile,
  isLinkedServer,
  isLockActive,
  normalizeLockFile,
  otherLockHolder,
  joinServerPath,
  projectArchiveName,
  projectFolderName,
  projectLockFileName,
  projectTestFileName,
  pruneLocks,
} from '../domain/server';
import type { LockFile, SeafileConnection, TaskLockEntry } from '../domain/server';
import {
  SeafileError,
  checkServer,
  deleteDirectoryAtPath,
  deleteFile,
  deleteFileAtPath,
  downloadFile,
  downloadFileAtPath,
  downloadTextAtPath,
  getDeviceId,
  listDirectory,
  listFilesRecursiveDetailed,
  readServerToken,
  saveServerToken,
  uploadFiles,
  uploadTextAtPath,
} from '../core/seafile';
import { getPreference, setPreference } from '../core/preferences';
import { randomId } from '../core/id';
import { sha256Hex } from '../core/hash';
import { CURRENT_SCHEMA_VERSION } from '../core/migrate';
import type { ProgressReporter } from '../core/progress';
import { buildProjectFiles, projectFileHashes } from '../io/export';
import { parseProjectFiles, parseProjectZip } from '../io/import';
import { applyServerAccess } from '../io/share';
import type { ServerAccess } from '../io/share';
import type { Project, ProjectServer } from '../domain/types';

export type SyncStatus = 'unlinked' | 'online' | 'syncing' | 'offline' | 'error';

export interface SyncState {
  status: SyncStatus;
  detail: string;
  lastSyncAt: string | null;
}

export interface AcquireLockResult {
  ok: boolean;
  holder: TaskLockEntry | null;
  /** true, wenn eine Server-Sperre geschrieben wurde (dann freigeben). */
  held: boolean;
}

export interface ServerTestStep {
  label: string;
  ok: boolean;
}

export interface ServerTestResult {
  ok: boolean;
  steps: ServerTestStep[];
  error: string | null;
}

interface SyncContext {
  project: Project;
  server: ProjectServer;
  conn: SeafileConnection;
  token: string;
}

const LAST_SYNC_KEY = 'seafile.lastSync';
const FILE_LIST_KEY = 'seafile.files';
const FILE_HASHES_KEY = 'seafile.fileHashes';
const FILE_SIGNATURES_KEY = 'seafile.fileSignatures';
const AUTO_SYNC_DELAY = 3000;
const POLL_INTERVAL = 20_000;
const HEARTBEAT_INTERVAL = 60_000;

let snapshot: SyncState = {
  status: 'unlinked',
  detail: 'Kein Server hinterlegt.',
  lastSyncAt: null,
};

const listeners = new Set<() => void>();
let currentLocks: Record<string, TaskLockEntry> = {};
let busy = false;
let pendingSync = false;
let pendingPull = false;
let autoTimer: ReturnType<typeof setTimeout> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let pollInFlight = false;
/* Solange keine Sperrdatei bekannt ist, wird der Ordner gelistet statt eine
   fehlende Datei per GET anzufragen (vermeidet 404-Meldungen im Browser). */
let lockFileKnown = false;
const heartbeats = new Map<string, ReturnType<typeof setInterval>>();
const heartbeatUsers = new Map<string, string>();

/* ── Status-Abo (für das Cloud-Icon) ── */

export function getSyncState(): SyncState {
  return snapshot;
}

export function subscribeSync(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function update(patch: Partial<SyncState>): void {
  snapshot = { ...snapshot, ...patch };
  for (const listener of [...listeners]) listener();
}

/* ── Kleine Helfer ── */

function readLastSync(projectId: string): string | null {
  const map = getPreference<Record<string, string>>(LAST_SYNC_KEY, {});
  const value = map[projectId];
  return typeof value === 'string' ? value : null;
}

function writeLastSync(projectId: string, iso: string): void {
  const map = { ...getPreference<Record<string, string>>(LAST_SYNC_KEY, {}) };
  map[projectId] = iso;
  setPreference(LAST_SYNC_KEY, map);
}

/* Zuletzt hochgeladene Dateien mit Hash – nur für den Abgleich und das
   Aufräumen verwaister Dateien. */

function fileListKey(ctx: SyncContext): string {
  return `${ctx.conn.url.replace(/\/+$/, '')}|${ctx.conn.repoId}|${ctx.conn.path}|${ctx.project.id}`;
}

function readFileList(ctx: SyncContext): string[] {
  const map = getPreference<Record<string, string[]>>(FILE_LIST_KEY, {});
  const value = map[fileListKey(ctx)];
  return Array.isArray(value) ? value.filter((path) => typeof path === 'string') : [];
}

function readFileHashes(ctx: SyncContext): Record<string, string> {
  const map = getPreference<Record<string, Record<string, string>>>(FILE_HASHES_KEY, {});
  const value = map[fileListKey(ctx)];
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const out: Record<string, string> = {};
    for (const [path, hash] of Object.entries(value)) {
      if (typeof hash === 'string') out[path] = hash;
    }
    return out;
  }
  /* Einmalige Migration: alte Versionen speicherten nur Pfade. */
  return Object.fromEntries(readFileList(ctx).map((path) => [path, '']));
}

function writeFileHashes(ctx: SyncContext, hashes: Record<string, string>): void {
  const map = { ...getPreference<Record<string, Record<string, string>>>(FILE_HASHES_KEY, {}) };
  map[fileListKey(ctx)] = hashes;
  setPreference(FILE_HASHES_KEY, map);
}

/* Datei-Metadaten (Größe, Änderungszeit, Objekt-ID) für den schnellen
   Abgleich: Stimmen sie mit dem letzten Stand überein, muss die Datei weder
   geladen noch gehasht werden. */

interface RemoteSignatureSource {
  size?: number;
  mtime?: number;
  id?: string;
}

function remoteSignature(entry: RemoteSignatureSource): string | null {
  if (entry.mtime === undefined && entry.size === undefined) return null;
  return `${entry.mtime ?? ''}:${entry.size ?? ''}${entry.id ? `:${entry.id}` : ''}`;
}

function readFileSignatures(ctx: SyncContext): Record<string, string> {
  const map = getPreference<Record<string, Record<string, string>>>(
    FILE_SIGNATURES_KEY,
    {},
  );
  const value = map[fileListKey(ctx)];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [path, signature] of Object.entries(value)) {
    if (typeof signature === 'string') out[path] = signature;
  }
  return out;
}

function writeFileSignatures(
  ctx: SyncContext,
  signatures: Record<string, string>,
): void {
  const map = { ...getPreference<Record<string, Record<string, string>>>(FILE_SIGNATURES_KEY, {}) };
  map[fileListKey(ctx)] = signatures;
  setPreference(FILE_SIGNATURES_KEY, map);
}

/** Dateien, deren Inhalt sich gegenüber dem letzten Upload geändert hat. */
export function filesToUpload(
  previous: Record<string, string>,
  next: Record<string, string>,
): string[] {
  return Object.keys(next).filter((path) => previous[path] !== next[path]);
}

/** Dateien, die nach dem Upload nicht mehr im Projekt vorkommen. */
export function filesToRemove(previous: string[], next: string[]): string[] {
  const nextSet = new Set(next);
  return previous.filter((path) => !nextSet.has(path));
}

async function hashBytes(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return sha256Hex(copy.buffer);
}

async function hashProjectFiles(
  files: Record<string, Uint8Array>,
): Promise<Record<string, string>> {
  const hashes: Record<string, string> = {};
  for (const [path, bytes] of Object.entries(files)) {
    hashes[path] = await hashBytes(bytes);
  }
  return hashes;
}

/** Ordner einer Datei bis zum Projektordner (ohne diesen selbst). */
export function parentDirsWithin(
  projectPrefix: string,
  filePath: string,
): string[] {
  const out: string[] = [];
  const slash = filePath.lastIndexOf('/');
  if (slash <= 0) return out;
  let dir = filePath.slice(0, slash + 1);
  while (dir.startsWith(`${projectPrefix}/`) && dir !== `${projectPrefix}/`) {
    out.push(dir);
    const trimmed = dir.replace(/\/+$/, '');
    const parentSlash = trimmed.lastIndexOf('/');
    if (parentSlash < 0) break;
    dir = trimmed.slice(0, parentSlash + 1);
  }
  return out;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : 'Unbekannter Fehler.';
}

/** Übersetzt Fehler in Cloud-Status und eine verständliche Meldung. */
function describeFailure(err: unknown): { status: SyncStatus; detail: string } {
  if (err instanceof SeafileError) {
    if (err.kind === 'auth') {
      return { status: 'error', detail: err.message };
    }
    if (err.kind === 'notfound') {
      return { status: 'error', detail: err.message };
    }
    if (err.kind === 'network') {
      return {
        status: 'offline',
        detail: 'Server nicht erreichbar. Bitte Netzwerk und CORS prüfen.',
      };
    }
    return { status: 'error', detail: err.message };
  }
  return { status: 'offline', detail: 'Server nicht erreichbar.' };
}

function context(): SyncContext | null {
  const project = state.project;
  if (!project?.server || !isLinkedServer(project.server)) return null;
  const token = readServerToken(project.server);
  if (!token) return null;
  return { project, server: project.server, conn: project.server, token };
}

/* ── Sperrdatei ── */

async function loadLockFile(ctx: SyncContext): Promise<LockFile> {
  const name = projectLockFileName(ctx.project.id);
  if (!lockFileKnown) {
    /* Erst im Ordner nachsehen: Eine fehlende Sperrdatei ist normal und soll
       keinen 404-Request (und keine Fehlermeldung im Browser) erzeugen. */
    const entries = await listDirectory(ctx.conn, ctx.token, ctx.conn.path);
    const exists = Boolean(
      entries?.some((entry) => entry.type === 'file' && entry.name === name),
    );
    if (!exists) return emptyLockFile();
    lockFileKnown = true;
  }

  const bytes = await downloadFile(ctx.conn, ctx.token, name);
  if (!bytes) {
    lockFileKnown = false;
    return emptyLockFile();
  }
  try {
    return normalizeLockFile(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return emptyLockFile();
  }
}

async function writeLockFile(ctx: SyncContext, file: LockFile): Promise<void> {
  await uploadTextAtPath(
    ctx.conn,
    ctx.token,
    joinServerPath(ctx.conn.path, projectLockFileName(ctx.project.id)),
    JSON.stringify(file, null, 2),
    'application/json',
  );
  lockFileKnown = true;
}

function setLocks(file: LockFile): void {
  const now = Date.now();
  const active: Record<string, TaskLockEntry> = {};
  for (const [taskId, entry] of Object.entries(pruneLocks(file, now).locks)) {
    active[taskId] = entry;
  }
  if (JSON.stringify(active) === JSON.stringify(currentLocks)) return;
  currentLocks = active;
  window.dispatchEvent(new CustomEvent('ldc:locks-changed'));
}

/** Aktive Sperre einer anderen Person auf diesem Gerät. */
export function getTaskLockHolder(taskId: string): TaskLockEntry | null {
  const project = state.project;
  if (!project?.server || !isLinkedServer(project.server)) return null;
  const entry = currentLocks[taskId];
  if (!entry || !isLockActive(entry)) return null;
  if (entry.deviceId === getDeviceId()) return null;
  return entry;
}

export function isTaskLockedByOther(taskId: string): boolean {
  return getTaskLockHolder(taskId) !== null;
}

export function activeLockCount(): number {
  return Object.values(currentLocks).filter((entry) => isLockActive(entry)).length;
}

/* ── Identität für die Sperre ── */

let namePrompt: Promise<string> | null = null;

function ensureUserName(): Promise<string> {
  const existing = lastEditedBy();
  if (existing) return Promise.resolve(existing);
  if (namePrompt) return namePrompt;

  namePrompt = new Promise<string>((resolve) => {
    let done = false;
    const finish = (value: string): void => {
      if (done) return;
      done = true;
      namePrompt = null;
      resolve(value);
    };

    const input = el('input', {
      type: 'text',
      class: 'input',
      placeholder: 'Ihr Name',
      autocomplete: 'name',
    }) as HTMLInputElement;
    const content = el('div', { class: 'server-form' }, [
      el('p', { class: 'export-hint' }, [
        'Der Name erscheint bei anderen als Verantwortlicher dieser Bearbeitung.',
      ]),
      el('label', { class: 'field-label' }, ['Name *']),
      input,
    ]);

    const handle = openModal({
      title: 'Wer bearbeitet?',
      content,
      actions: [
        {
          label: 'Ohne Namen',
          kind: 'secondary',
          onClick: () => {
            handle.close();
            finish('Unbekannt');
          },
        },
        {
          label: 'Weiter',
          kind: 'primary',
          onClick: () => {
            const value = input.value.trim();
            if (!value) {
              showToast('Bitte einen Namen angeben.', 'error');
              input.focus();
              return;
            }
            rememberEditedBy(value);
            handle.close();
            finish(value);
          },
        },
      ],
      onClose: () => finish('Unbekannt'),
    });
    input.focus();
  });

  return namePrompt;
}

/* ── Sperren anfordern / freigeben ── */

export async function acquireTaskLock(taskId: string): Promise<AcquireLockResult> {
  const ctx = context();
  /* Ohne Verbindung wird lokal weitergearbeitet – die App bleibt offline nutzbar. */
  if (!ctx || (snapshot.status !== 'online' && snapshot.status !== 'syncing')) {
    return { ok: true, holder: null, held: false };
  }

  const deviceId = getDeviceId();
  const user = await ensureUserName();
  const nowIso = new Date().toISOString();

  let file: LockFile;
  try {
    file = pruneLocks(await loadLockFile(ctx), Date.now());
  } catch (err) {
    const failure = describeFailure(err);
    update({
      status: failure.status,
      detail: failure.detail,
      lastSyncAt: readLastSync(ctx.project.id),
    });
    return { ok: true, holder: null, held: false };
  }

  const holder = otherLockHolder(file, taskId, deviceId);
  if (holder) {
    setLocks(file);
    return { ok: false, holder, held: false };
  }

  const existing = file.locks[taskId];
  file.locks[taskId] = {
    user,
    deviceId,
    since: existing?.deviceId === deviceId ? existing.since : nowIso,
    heartbeat: nowIso,
  };

  try {
    await writeLockFile(ctx, file);
  } catch (err) {
    const failure = describeFailure(err);
    update({
      status: failure.status,
      detail: failure.detail,
      lastSyncAt: readLastSync(ctx.project.id),
    });
    return { ok: true, holder: null, held: false };
  }

  /* Nach dem Schreiben gegenlesen: Bei gleichzeitigem Öffnen gewinnt der
     letzte Schreiber – der andere darf die Aufgabe nicht bearbeiten. */
  let verified = file;
  try {
    verified = pruneLocks(await loadLockFile(ctx), Date.now());
  } catch {
    /* Konnte nicht gegengelesen werden – eigene Sperre gilt. */
  }
  const own = verified.locks[taskId];
  if (!own || own.deviceId !== deviceId) {
    stopHeartbeat(taskId);
    setLocks(verified);
    return {
      ok: false,
      holder: otherLockHolder(verified, taskId, deviceId) ?? null,
      held: false,
    };
  }

  setLocks(verified);
  startHeartbeat(taskId, user);
  return { ok: true, holder: null, held: true };
}

export async function releaseTaskLock(taskId: string): Promise<void> {
  stopHeartbeat(taskId);
  const ctx = context();
  if (!ctx) return;

  try {
    const file = pruneLocks(await loadLockFile(ctx), Date.now());
    const entry = file.locks[taskId];
    if (!entry || entry.deviceId !== getDeviceId()) return;
    delete file.locks[taskId];
    await writeLockFile(ctx, file);
    setLocks(file);
  } catch {
    /* Beim Schließen darf nichts blockieren – die TTL räumt sonst auf. */
  }
}

function startHeartbeat(taskId: string, user: string): void {
  stopHeartbeat(taskId);
  heartbeatUsers.set(taskId, user);
  heartbeats.set(
    taskId,
    setInterval(() => {
      void sendHeartbeat(taskId);
    }, HEARTBEAT_INTERVAL),
  );
}

function stopHeartbeat(taskId: string): void {
  const timer = heartbeats.get(taskId);
  if (timer) clearInterval(timer);
  heartbeats.delete(taskId);
  heartbeatUsers.delete(taskId);
}

function stopAllHeartbeats(): void {
  for (const timer of heartbeats.values()) clearInterval(timer);
  heartbeats.clear();
  heartbeatUsers.clear();
}

async function sendHeartbeat(taskId: string): Promise<void> {
  if (document.hidden) return;
  const ctx = context();
  if (!ctx) return;
  const user = heartbeatUsers.get(taskId);
  if (!user) return;

  try {
    const file = pruneLocks(await loadLockFile(ctx), Date.now());
    const deviceId = getDeviceId();
    const existing = file.locks[taskId];
    if (existing && existing.deviceId !== deviceId) {
      /* Jemand hat die abgelaufene Sperre übernommen – nicht zurückschreiben. */
      stopHeartbeat(taskId);
      return;
    }
    const nowIso = new Date().toISOString();
    file.locks[taskId] = {
      user,
      deviceId,
      since: existing?.since ?? nowIso,
      heartbeat: nowIso,
    };
    await writeLockFile(ctx, file);
    setLocks(file);
  } catch {
    /* Der Status-Poll meldet die Ursache. */
  }
}

/* ── Status-Polling ── */

function startPolling(): void {
  stopPolling();
  /* Sofort einmal Sperren holen, damit die Liste nicht bis zum ersten
     Intervall ohne Schlösser dasteht. */
  void pollOnce();
  pollTimer = setInterval(() => {
    void pollOnce();
  }, POLL_INTERVAL);
}

function stopPolling(): void {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

/** Prüft Erreichbarkeit und holt die aktuellen Sperren. */
export async function pollOnce(): Promise<void> {
  if (document.hidden || pollInFlight || busy) return;
  const ctx = context();
  if (!ctx) return;

  pollInFlight = true;
  try {
    await checkServer(ctx.conn, ctx.token);
    setLocks(await loadLockFile(ctx));
    if (snapshot.status === 'offline' || snapshot.status === 'error') {
      update({
        status: 'online',
        detail: 'Mit Server verbunden.',
        lastSyncAt: readLastSync(ctx.project.id),
      });
    }
  } catch (err) {
    const failure = describeFailure(err);
    update({ status: failure.status, detail: failure.detail });
  } finally {
    pollInFlight = false;
  }
}

/* ── Zwei-Wege-Abgleich ── */

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

interface RemoteFileRef {
  file?: unknown;
  hash?: unknown;
}

interface RemoteSnapshot {
  project: Project;
  hashes: Record<string, string>;
  signatures: Record<string, string>;
  usedArchive: boolean;
}

function resolveRefPath(baseDir: string, file: string): string {
  return file.startsWith('/') || file.startsWith('.')
    ? file
    : `${baseDir}/${file}`;
}

/** Sammelt Dateireferenzen (mit Inhalt-Hash) aus einem Server-JSON. */
function collectRefHashes(
  value: unknown,
  baseDir: string,
  out: Map<string, string>,
): void {
  if (!Array.isArray(value)) return;
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue;
    const ref = item as RemoteFileRef;
    if (
      typeof ref.file !== 'string' ||
      typeof ref.hash !== 'string' ||
      !ref.hash
    ) {
      continue;
    }
    out.set(resolveRefPath(baseDir, ref.file), ref.hash);
  }
}

function collectProjectRefs(
  bytes: Uint8Array,
  projectJsonPath: string,
  out: Map<string, string>,
): void {
  try {
    const data = JSON.parse(new TextDecoder().decode(bytes)) as {
      documents?: unknown;
    };
    const root = projectJsonPath.replace(/\/?project\.json$/, '');
    collectRefHashes(data.documents, root, out);
  } catch {
    /* Ungültige project.json – der Aufrufer fällt auf die ZIP-Sicherung zurück. */
  }
}

function collectTaskRefs(
  bytes: Uint8Array,
  taskJsonPath: string,
  out: Map<string, string>,
): void {
  try {
    const data = JSON.parse(new TextDecoder().decode(bytes)) as Record<
      string,
      unknown
    >;
    const dir = taskJsonPath.replace(/\/?task\.json$/, '');
    for (const key of ['images', 'afterImages', 'documents', 'afterDocuments']) {
      collectRefHashes(data[key], dir, out);
    }
  } catch {
    /* Ungültige task.json – die Aufgabe wird später übersprungen. */
  }
}

/**
 * Liest den Serverstand ein. Kleine JSON-Dateien werden immer geladen; Bilder
 * und Dokumente nur, wenn ihr Inhalt laut project.json/task.json vom lokalen
 * Stand abweicht. So löst eine geänderte project.json keinen Komplettdownload
 * aller Dateien mehr aus.
 */
async function downloadRemoteSnapshot(
  ctx: SyncContext,
  options: {
    base?: Project | null;
    projectJsonBytes?: Uint8Array | null;
    report?: ProgressReporter;
  } = {},
): Promise<RemoteSnapshot | null> {
  const projectId = ctx.project.id;
  const projectFolder = joinServerPath(
    ctx.conn.path,
    projectFolderName(projectId),
  );
  const projectJsonPath = joinServerPath(projectFolder, 'project.json');
  const entries = await listFilesRecursiveDetailed(
    ctx.conn,
    ctx.token,
    projectFolder,
  );
  const knownSignatures = readFileSignatures(ctx);
  const knownHashes = readFileHashes(ctx);
  const remoteSignatures: Record<string, string> = {};
  const remoteSizes: Record<string, number> = {};

  let remote: Project | null = null;
  let hashes: Record<string, string> = {};

  if (entries && entries.length > 0) {
    const paths = entries.map((entry) => entry.path);
    for (const entry of entries) {
      const signature = remoteSignature(entry);
      if (signature) remoteSignatures[entry.path] = signature;
      if (entry.size !== undefined) remoteSizes[entry.path] = entry.size;
    }
    const total = paths.length;
    let done = 0;
    const report = (label: string, ratio?: number): void => {
      update({ detail: label });
      if (ratio === undefined) options.report?.({ label });
      else options.report?.({ label, ratio });
    };
    const step = (): void => {
      done++;
      report(
        `Serverstand wird geprüft (${done}/${total}) …`,
        total > 0 ? done / total : undefined,
      );
    };

    const files = new Map<string, Uint8Array>();
    const handled = new Set<string>();
    const remoteRefHashes = new Map<string, string>();
    const jsonPaths = paths.filter(
      (path) => path === projectJsonPath || path.endsWith('/task.json'),
    );

    /* Zuerst die JSON-Dateien: Sie enthalten die Hashes der Bild- und
       Dokumentdateien und entscheiden, was wirklich geladen werden muss. */
    for (const path of jsonPaths) {
      handled.add(path);
      const bytes =
        path === projectJsonPath && options.projectJsonBytes
          ? options.projectJsonBytes
          : await downloadFileAtPath(ctx.conn, ctx.token, path);
      if (bytes) {
        files.set(path, bytes);
        if (path === projectJsonPath) {
          collectProjectRefs(bytes, path, remoteRefHashes);
        } else {
          collectTaskRefs(bytes, path, remoteRefHashes);
        }
      }
      step();
    }

    /* Lokale Dateien als Ersatz bereitstellen, wenn der Server-Hash passt. */
    const localFiles = new Map<string, Uint8Array>();
    const localFileHashes = new Map<string, string>();
    if (options.base) {
      for (const [relative, hash] of Object.entries(
        projectFileHashes(options.base),
      )) {
        localFileHashes.set(joinServerPath(ctx.conn.path, relative), hash);
      }
    }
    if (options.base && remoteRefHashes.size > 0) {
      const built = buildProjectFiles(options.base, { includeServer: false });
      for (const [relative, bytes] of Object.entries(built)) {
        localFiles.set(joinServerPath(ctx.conn.path, relative), bytes);
      }
    }
    const localHashes = new Map<string, string>();
    const hashLocalFile = async (path: string): Promise<string | null> => {
      const bytes = localFiles.get(path);
      if (!bytes) return null;
      const cached = localHashes.get(path);
      if (cached) return cached;
      const hash = await hashBytes(bytes);
      localHashes.set(path, hash);
      return hash;
    };

    for (const path of paths) {
      if (handled.has(path)) continue;
      const expected = remoteRefHashes.get(path);
      const local = localFiles.get(path);
      const signature = remoteSignatures[path];
      const localHashValue = localFileHashes.get(path);
      const knownHash = knownHashes[path];
      const remoteSize = remoteSizes[path];

      /* Unveränderte Serverdatei: lokale Fassung verwenden, ohne sie zu
         hashen. Das spart bei vielen Bildern/Dokumenten Rechenzeit. Der
         lokale Hash muss dem letzten Abgleich entsprechen – sonst könnte
         eine lokale Änderung den Serverstand verdecken. */
      if (
        signature &&
        knownSignatures[path] === signature &&
        local &&
        localHashValue &&
        knownHash === localHashValue &&
        (remoteSize === undefined || local.length === remoteSize)
      ) {
        files.set(path, local);
        step();
        continue;
      }

      if (
        expected &&
        local &&
        (await hashLocalFile(path)) === expected
      ) {
        files.set(path, local);
        step();
        continue;
      }

      const bytes = await downloadFileAtPath(ctx.conn, ctx.token, path);
      if (bytes) files.set(path, bytes);
      step();
    }

    report('Projektdateien werden vorbereitet …');
    remote = await parseProjectFiles(files);
    if (remote) {
      hashes = await hashProjectFiles(Object.fromEntries(files));
    }
  }

  /* Übergang: eine vorhandene Projekt-ZIP wird noch eingelesen. Erst im
     Zielordner nachsehen, damit ein neues Projekt keinen 404-GET erzeugt. */
  if (!remote) {
    const archiveName = projectArchiveName(projectId);
    const baseEntries = await listDirectory(ctx.conn, ctx.token, ctx.conn.path);
    const hasArchive = Boolean(
      baseEntries?.some(
        (entry) => entry.type === 'file' && entry.name === archiveName,
      ),
    );
    if (!hasArchive) return null;
    const bytes = await downloadFile(ctx.conn, ctx.token, archiveName);
    if (!bytes) return null;
    remote = await parseProjectZip(toArrayBuffer(bytes));
    if (!remote) return null;
    return {
      project: remote,
      hashes: {},
      signatures: {},
      usedArchive: true,
    };
  }

  return {
    project: remote,
    hashes,
    signatures: remoteSignatures,
    usedArchive: false,
  };
}

async function pullRemote(ctx: SyncContext): Promise<boolean> {
  const project = state.project;
  if (!project || project.id !== ctx.project.id) return false;

  const projectFolder = joinServerPath(
    ctx.conn.path,
    projectFolderName(project.id),
  );
  const projectJsonPath = joinServerPath(projectFolder, 'project.json');
  const knownHashes = readFileHashes(ctx);
  const knownProjectHash = knownHashes[projectJsonPath];
  const knownSignatures = readFileSignatures(ctx);
  const knownProjectSignature = knownSignatures[projectJsonPath];
  let projectJsonBytes: Uint8Array | null = null;

  /* Schnellster Fall: Die Metadaten der project.json sind unverändert.
     Dann genügt ein einzelner Verzeichnisaufruf – kein Download, kein Hash. */
  if (knownProjectSignature) {
    const entries = await listDirectory(ctx.conn, ctx.token, projectFolder);
    const entry = entries?.find(
      (item) => item.type === 'file' && item.name === 'project.json',
    );
    if (entry && remoteSignature(entry) === knownProjectSignature) {
      return false;
    }
  }

  /* Fallback ohne Metadaten: project.json laden und per Hash vergleichen. */
  if (knownProjectHash) {
    projectJsonBytes = await downloadFileAtPath(
      ctx.conn,
      ctx.token,
      projectJsonPath,
    );
    if (
      projectJsonBytes &&
      (await hashBytes(projectJsonBytes)) === knownProjectHash
    ) {
      /* Beim ersten Lauf nach dem Update fehlt evtl. noch die Metadaten-Ablage.
         Einmal den Verzeichniseintrag merken – danach genügt der Metadaten-
         Vergleich ohne Download. */
      if (!knownProjectSignature) {
        const entries = await listDirectory(ctx.conn, ctx.token, projectFolder);
        const entry = entries?.find(
          (item) => item.type === 'file' && item.name === 'project.json',
        );
        const signature = entry ? remoteSignature(entry) : null;
        if (signature) {
          writeFileSignatures(ctx, {
            ...knownSignatures,
            [projectJsonPath]: signature,
          });
        }
      }
      return false;
    }
  }

  const snapshot = await downloadRemoteSnapshot(ctx, {
    base: project,
    projectJsonBytes,
  });
  if (!snapshot) return false;

  /* Während des Downloads kann das Projekt gewechselt haben. */
  if (state.project?.id !== project.id) return snapshot.usedArchive;

  writeFileHashes(ctx, snapshot.hashes);
  writeFileSignatures(ctx, snapshot.signatures);

  const lastSync = readLastSync(project.id);
  if (lastSync && snapshot.project.updatedAt <= lastSync) {
    return snapshot.usedArchive;
  }

  const merged = await runMergeFlow(project, snapshot.project);
  state.project = touchProject(merged);
  await persist();
  render();
  showToast('Serverstand wurde zusammengeführt.', 'info');
  return snapshot.usedArchive;
}

async function uploadProject(ctx: SyncContext): Promise<void> {
  const project = state.project;
  if (!project || project.id !== ctx.project.id) return;

  const files = buildProjectFiles(project, { includeServer: false });
  /* Hashes und Pfade einheitlich absolut speichern – so passen sie zu den
     Pfaden, die beim Herunterladen vom Server entstehen. */
  const absoluteFiles: Record<string, Uint8Array> = {};
  for (const [path, bytes] of Object.entries(files)) {
    absoluteFiles[joinServerPath(ctx.conn.path, path)] = bytes;
  }
  const hashes = await hashProjectFiles(absoluteFiles);
  const previousHashes = readFileHashes(ctx);
  const changedPaths = filesToUpload(previousHashes, hashes);

  if (state.project?.id !== project.id) return;

  if (changedPaths.length > 0) {
    const entries = changedPaths.map((path) => {
      const bytes = absoluteFiles[path];
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      return { path, content: new Blob([copy]) };
    });
    /* Erst Bilder/Dokumente, dann task.json, zuletzt project.json – so verweist
       keine JSON-Datei auf eine Datei, die noch nicht hochgeladen ist. */
    const priority = (path: string): number => {
      if (path.endsWith('/project.json')) return 2;
      if (path.endsWith('/task.json')) return 1;
      return 0;
    };
    entries.sort((a, b) => priority(a.path) - priority(b.path));

    await uploadFiles(ctx.conn, ctx.token, entries, (done, total) => {
      update({ detail: `Serverdateien werden hochgeladen (${done}/${total}) …` });
    });
  } else {
    update({ detail: 'Keine Änderungen zum Hochladen.' });
  }

  const newPaths = Object.keys(absoluteFiles);
  const projectPrefix = joinServerPath(
    ctx.conn.path,
    projectFolderName(ctx.project.id),
  );
  const previous = Object.keys(previousHashes);
  const staleDirs = new Set<string>();
  let cleanupFailed = false;
  for (const oldPath of filesToRemove(previous, newPaths)) {
    /* Nur innerhalb des eigenen Projektordners aufräumen. */
    if (!oldPath.startsWith(`${projectPrefix}/`)) continue;
    for (const dir of parentDirsWithin(projectPrefix, oldPath)) {
      staleDirs.add(dir);
    }
    try {
      await deleteFileAtPath(ctx.conn, ctx.token, oldPath);
    } catch {
      cleanupFailed = true;
    }
  }
  /* Leere Aufgaben-/Bildordner entfernen; nicht leere Ordner bleiben stehen. */
  const dirs = [...staleDirs].sort(
    (a, b) => b.split('/').length - a.split('/').length,
  );
  for (const dir of dirs) {
    if (dir === `${projectPrefix}/` || !dir.startsWith(`${projectPrefix}/`)) {
      continue;
    }
    try {
      await deleteDirectoryAtPath(ctx.conn, ctx.token, dir);
    } catch {
      /* Nicht kritisch – der Ordner ist evtl. noch nicht leer. */
    }
  }
  writeFileHashes(
    ctx,
    cleanupFailed ? { ...previousHashes, ...hashes } : hashes,
  );
  writeLastSync(project.id, new Date().toISOString());
}

export interface SyncRunResult {
  ok: boolean;
  error: string | null;
}

async function runSync(opts: {
  pull: boolean;
  manual: boolean;
}): Promise<SyncRunResult> {
  const ctx = context();
  if (!ctx) {
    const project = state.project;
    let message = 'Kein Server hinterlegt.';
    if (!project) {
      message = 'Kein Projekt geöffnet.';
    } else if (!project.server) {
      update({ status: 'unlinked', detail: message, lastSyncAt: null });
    } else if (!isLinkedServer(project.server)) {
      message = 'Server ist hinterlegt, aber noch nicht verknüpft.';
      update({ status: 'error', detail: message });
    } else {
      message = 'Nicht verbunden – API-Token fehlt auf diesem Gerät.';
      update({ status: 'error', detail: message });
    }
    if (opts.manual) showToast(message, 'error');
    return { ok: false, error: message };
  }

  if (busy) {
    pendingSync = true;
    pendingPull = pendingPull || opts.pull;
    if (opts.manual) showToast('Synchronisierung läuft bereits.', 'info');
    return { ok: false, error: 'Synchronisierung läuft bereits.' };
  }

  busy = true;
  update({
    status: 'syncing',
    detail: 'Synchronisierung läuft …',
    lastSyncAt: readLastSync(ctx.project.id),
  });

  try {
    await checkServer(ctx.conn, ctx.token);
    const usedArchive = opts.pull ? await pullRemote(ctx) : false;
    await uploadProject(ctx);
    /* Die alte ZIP-Sicherung nur entfernen, wenn sie tatsächlich gelesen
       wurde – sonst entstünde bei jedem Abgleich ein unnötiger 404-Request. */
    if (usedArchive) {
      try {
        await deleteFile(ctx.conn, ctx.token, projectArchiveName(ctx.project.id));
      } catch {
        /* Nicht kritisch – die Einzeldateien sind bereits hochgeladen. */
      }
    }
    if (state.project?.id !== ctx.project.id) {
      return { ok: false, error: 'Projekt wurde gewechselt.' };
    }
    const lastSyncAt = readLastSync(ctx.project.id);
    update({
      status: 'online',
      detail: 'Projekt ist online und synchronisiert.',
      lastSyncAt,
    });
    if (opts.manual) showToast('Synchronisiert.', 'success');
    return { ok: true, error: null };
  } catch (err) {
    const failure = describeFailure(err);
    update({
      status: failure.status,
      detail: failure.detail,
      lastSyncAt: readLastSync(ctx.project.id),
    });
    if (opts.manual) showToast(failure.detail, 'error');
    return { ok: false, error: failure.detail };
  } finally {
    busy = false;
    if (pendingSync) {
      const pull = pendingPull;
      pendingSync = false;
      pendingPull = false;
      void runSync({ pull, manual: false });
    }
  }
}

/** Manueller Abgleich (Icon-Info / Server-Dialog). */
export async function syncNow(): Promise<SyncRunResult> {
  return runSync({ pull: true, manual: true });
}

/** Nach dem Speichern eines Server-Entwurfs (noch ohne Verknüpfung). */
export function noteServerDraft(): void {
  const project = state.project;
  if (!project?.server) return;
  if (isLinkedServer(project.server)) return;
  update({
    status: 'error',
    detail: 'Server ist hinterlegt, aber noch nicht verknüpft.',
    lastSyncAt: readLastSync(project.id),
  });
}

/** Nach einer lokalen Änderung gebündelt hochladen. */
export function scheduleAutoSync(): void {
  const project = state.project;
  if (!project?.server || !isLinkedServer(project.server)) return;
  if (!readServerToken(project.server)) return;
  if (autoTimer) clearTimeout(autoTimer);
  autoTimer = setTimeout(() => {
    autoTimer = null;
    void runSync({ pull: false, manual: false });
  }, AUTO_SYNC_DELAY);
}

/* ── Projektaktivierung / Ereignisse ── */

export async function startProjectSync(): Promise<void> {
  stopPolling();
  stopAllHeartbeats();
  if (autoTimer) {
    clearTimeout(autoTimer);
    autoTimer = null;
  }
  currentLocks = {};
  lockFileKnown = false;
  window.dispatchEvent(new CustomEvent('ldc:locks-changed'));

  const project = state.project;
  update({
    status: 'unlinked',
    detail: 'Kein Server hinterlegt.',
    lastSyncAt: project ? readLastSync(project.id) : null,
  });
  if (!project?.server) return;

  if (!isLinkedServer(project.server)) {
    update({
      status: 'error',
      detail: 'Server ist hinterlegt, aber noch nicht verknüpft.',
      lastSyncAt: readLastSync(project.id),
    });
    return;
  }

  if (!readServerToken(project.server)) {
    update({
      status: 'error',
      detail: 'Nicht verbunden – API-Token fehlt auf diesem Gerät.',
      lastSyncAt: readLastSync(project.id),
    });
    return;
  }

  await runSync({ pull: true, manual: false });
  startPolling();
}

export interface SharedProjectLoadResult {
  ok: boolean;
  project: Project | null;
  error: string | null;
}

/**
 * Lädt den Serverstand zu einer Freigabe-Zugangsdatei. Das Projekt muss dafür
 * noch nicht lokal vorhanden sein – die Daten kommen direkt vom Server.
 */
export async function loadSharedProject(
  access: ServerAccess,
  onProgress?: ProgressReporter,
): Promise<SharedProjectLoadResult> {
  const now = new Date().toISOString();
  const server: ProjectServer = {
    url: access.url,
    repoId: access.repoId,
    path: access.path,
    linkedAt: now,
    ...(access.linkStyle ? { linkStyle: access.linkStyle } : {}),
  };
  const placeholder: Project = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: access.projectId,
    name: `Projekt ${access.projectId}`,
    location: '',
    description: '',
    createdAt: now,
    updatedAt: now,
    tasks: [],
    documents: [],
  };
  const ctx: SyncContext = {
    project: placeholder,
    server,
    conn: server,
    token: access.token,
  };

  try {
    onProgress?.({ label: 'Server wird geprüft …' });
    await checkServer(ctx.conn, ctx.token);
    const snapshot = await downloadRemoteSnapshot(ctx, { report: onProgress });
    if (!snapshot) {
      return {
        ok: false,
        project: null,
        error:
          'Auf dem Server wurde kein Projektstand gefunden. Bitte Freigabe-ZIP und Zugangsdaten prüfen.',
      };
    }

    /* Den gerade geladenen Stand als Ausgangspunkt merken, damit der erste
       Abgleich nicht sofort wieder alle Dateien herunterlädt. */
    writeFileHashes(ctx, snapshot.hashes);
    writeFileSignatures(ctx, snapshot.signatures);

    const applied = applyServerAccess(
      {
        ...snapshot.project,
        id: access.projectId,
        tasks: snapshot.project.tasks.map((task) => ({
          ...task,
          projectId: access.projectId,
        })),
      },
      access,
    );
    if (!applied.applied) {
      return {
        ok: false,
        project: null,
        error: 'Die Zugangsdaten passen nicht zum Serverstand.',
      };
    }
    return { ok: true, project: applied.project, error: null };
  } catch (err) {
    const failure = describeFailure(err);
    update({ status: failure.status, detail: failure.detail });
    return { ok: false, project: null, error: failure.detail };
  }
}

let eventsInstalled = false;

/** Einmalig beim Start: Ereignisse der App-Shell abonnieren. */
export function installSyncEvents(): void {
  if (eventsInstalled) return;
  eventsInstalled = true;

  window.addEventListener('ldc:project-activated', () => {
    void startProjectSync();
  });
  window.addEventListener('ldc:project-changed', () => {
    scheduleAutoSync();
  });
  window.addEventListener('online', () => {
    /* Nach einer Offline-Phase den aufgelaufenen Stand nachziehen. */
    void runSync({ pull: true, manual: false });
  });
  window.addEventListener('offline', () => {
    if (state.project?.server) {
      update({ status: 'offline', detail: 'Keine Internetverbindung.' });
    }
  });
  window.addEventListener('pagehide', () => {
    stopAllHeartbeats();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void pollOnce();
  });
}

/* ── Verbinden & Test ── */

export async function connectProject(
  conn: SeafileConnection,
  token: string,
): Promise<SyncRunResult> {
  const project = state.project;
  if (!project) return { ok: false, error: 'Kein Projekt geöffnet.' };

  saveServerToken(conn, token);
  state.project = touchProject({
    ...project,
    server: {
      url: conn.url,
      repoId: conn.repoId,
      path: conn.path,
      linkedAt: new Date().toISOString(),
      ...(conn.linkStyle ? { linkStyle: conn.linkStyle } : {}),
    },
  });
  await persist();
  render();

  /* Erst einen vorhandenen Serverstand einmischen, dann hochladen – so
     überschreibt ein neues Gerät keine Änderungen anderer. */
  const result = await runSync({ pull: true, manual: false });
  startPolling();
  return result;
}

/**
 * Testet Schreiben, Lesen und Löschen mit einer kleinen Testdatei.
 * Die Datei wird nach dem Test wieder entfernt – auch wenn das Lesen scheitert.
 */
export async function testServerConnection(
  conn: SeafileConnection,
  token: string,
  projectId: string,
): Promise<ServerTestResult> {
  const steps: ServerTestStep[] = [];
  const testPath = joinServerPath(conn.path, projectTestFileName(projectId));
  const content = `LDC Planer Test ${new Date().toISOString()} ${randomId(6)}`;
  let uploaded = false;
  let error: string | null = null;

  try {
    await checkServer(conn, token);
    steps.push({ label: 'Server und Bibliothek erreichbar', ok: true });

    await uploadTextAtPath(conn, token, testPath, content);
    uploaded = true;
    steps.push({ label: 'Testdatei geschrieben', ok: true });

    const read = await downloadTextAtPath(conn, token, testPath);
    if (read === null) throw new Error('Testdatei wurde nicht gefunden.');
    if (read !== content) {
      throw new Error('Testdatei wurde mit anderem Inhalt gelesen.');
    }
    steps.push({ label: 'Testdatei gelesen', ok: true });
  } catch (err) {
    error = errorText(err);
    steps.push({ label: error, ok: false });
  } finally {
    if (uploaded) {
      try {
        await deleteFileAtPath(conn, token, testPath);
        steps.push({ label: 'Testdatei gelöscht', ok: true });
      } catch (err) {
        const message = `Testdatei konnte nicht gelöscht werden: ${errorText(err)}`;
        steps.push({ label: message, ok: false });
        if (!error) error = message;
      }
    }
  }

  return {
    ok: error === null && steps.every((step) => step.ok),
    steps,
    error,
  };
}
