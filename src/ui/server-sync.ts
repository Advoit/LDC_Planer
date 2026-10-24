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
  listFilesRecursive,
  readServerToken,
  saveServerToken,
  uploadFiles,
  uploadTextAtPath,
} from '../core/seafile';
import { getPreference, setPreference } from '../core/preferences';
import { randomId } from '../core/id';
import { buildProjectFiles } from '../io/export';
import { parseProjectFiles, parseProjectZip } from '../io/import';
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

/* Zuletzt hochgeladene Dateien – nur für das Aufräumen verwaister Dateien. */

function fileListKey(ctx: SyncContext): string {
  return `${ctx.conn.url.replace(/\/+$/, '')}|${ctx.conn.repoId}|${ctx.conn.path}|${ctx.project.id}`;
}

function readFileList(ctx: SyncContext): string[] {
  const map = getPreference<Record<string, string[]>>(FILE_LIST_KEY, {});
  const value = map[fileListKey(ctx)];
  return Array.isArray(value) ? value.filter((path) => typeof path === 'string') : [];
}

function writeFileList(ctx: SyncContext, paths: string[]): void {
  const map = { ...getPreference<Record<string, string[]>>(FILE_LIST_KEY, {}) };
  map[fileListKey(ctx)] = paths;
  setPreference(FILE_LIST_KEY, map);
}

/** Dateien, die nach dem Upload nicht mehr im Projekt vorkommen. */
export function filesToRemove(previous: string[], next: string[]): string[] {
  const nextSet = new Set(next);
  return previous.filter((path) => !nextSet.has(path));
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
  const bytes = await downloadFile(
    ctx.conn,
    ctx.token,
    projectLockFileName(ctx.project.id),
  );
  if (!bytes) return emptyLockFile();
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

async function pullRemote(ctx: SyncContext): Promise<void> {
  const project = state.project;
  if (!project) return;

  const projectFolder = joinServerPath(
    ctx.conn.path,
    projectFolderName(project.id),
  );
  const paths = await listFilesRecursive(ctx.conn, ctx.token, projectFolder);
  let remote: Project | null = null;

  if (paths && paths.length > 0) {
    const files = new Map<string, Uint8Array>();
    for (let i = 0; i < paths.length; i++) {
      const bytes = await downloadFileAtPath(ctx.conn, ctx.token, paths[i]);
      if (bytes) files.set(paths[i], bytes);
      update({
        detail: `Serverdateien werden geladen (${i + 1}/${paths.length}) …`,
      });
    }
    remote = await parseProjectFiles(files);
    if (remote) writeFileList(ctx, paths);
  }

  /* Übergang: eine vorhandene Projekt-ZIP wird noch eingelesen. */
  if (!remote) {
    const bytes = await downloadFile(
      ctx.conn,
      ctx.token,
      projectArchiveName(project.id),
    );
    if (!bytes) return;
    remote = await parseProjectZip(toArrayBuffer(bytes));
    if (!remote) return;
  }

  /* Während des Downloads kann das Projekt gewechselt haben. */
  if (state.project?.id !== project.id) return;

  const lastSync = readLastSync(project.id);
  if (lastSync && remote.updatedAt <= lastSync) return;

  const merged = await runMergeFlow(project, remote);
  state.project = touchProject(merged);
  await persist();
  render();
  showToast('Serverstand wurde zusammengeführt.', 'info');
}

async function uploadProject(ctx: SyncContext): Promise<void> {
  const project = state.project;
  if (!project || project.id !== ctx.project.id) return;

  const files = buildProjectFiles(project, { includeServer: false });
  const entries = Object.entries(files).map(([path, bytes]) => {
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

  const newPaths = Object.keys(files).map((path) =>
    joinServerPath(ctx.conn.path, path),
  );
  const projectPrefix = joinServerPath(
    ctx.conn.path,
    projectFolderName(ctx.project.id),
  );
  const previous = readFileList(ctx);
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
  writeFileList(
    ctx,
    cleanupFailed ? [...new Set([...previous, ...newPaths])] : newPaths,
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
    if (opts.pull) await pullRemote(ctx);
    await uploadProject(ctx);
    /* Die alte ZIP-Sicherung ist nach erfolgreichem Upload überflüssig. */
    try {
      await deleteFile(ctx.conn, ctx.token, projectArchiveName(ctx.project.id));
    } catch {
      /* Nicht kritisch – die Einzeldateien sind bereits hochgeladen. */
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
