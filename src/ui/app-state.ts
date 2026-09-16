/* ── Zentraler App-Zustand: geöffnetes Projekt, Projektliste, Persistenz ── */

import { showToast } from './toast';
import { migrateProject } from '../core/migrate';
import {
  getActiveProjectId,
  listProjects,
  loadProject,
  migrateLegacyProject,
  saveProject,
  setActiveProjectId,
} from '../core/project-store';
import {
  StorageQuotaError,
  requestPersistentStorage,
  storageEstimate,
} from '../core/storage';
import type { ProjectSummary } from '../domain/project';
import type { Project } from '../domain/types';

export interface AppState {
  project: Project | null;
  summaries: ProjectSummary[];
  editMode: boolean;
}

export const state: AppState = {
  project: null,
  summaries: [],
  editMode: false,
};

/* ── Rendering: die App-Shell registriert ihre Render-Funktion ── */

let renderFn: () => void = () => undefined;

export function setRenderer(fn: () => void): void {
  renderFn = fn;
}

export function render(): void {
  renderFn();
}

export function setEditMode(value: boolean): void {
  state.editMode = value;
}

export function toggleEditMode(): void {
  state.editMode = !state.editMode;
  render();
}

/* ── Persistenz ── */

let saveTimeout: ReturnType<typeof setTimeout> | null = null;
let dirty = false;
let warnedAboutStorage = false;

function isQuotaError(err: unknown): boolean {
  const name = (err as { name?: string } | null)?.name ?? '';
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED';
}

/** Warnt einmal pro Sitzung, wenn der Speicher knapp wird. */
async function checkStoragePressure(): Promise<void> {
  if (warnedAboutStorage) return;
  const est = await storageEstimate();
  if (!est || est.quota === 0) return;
  if (est.usage / est.quota > 0.9) {
    warnedAboutStorage = true;
    showToast(
      'Der lokale Speicher ist fast voll. Bitte Projekt als ZIP sichern und alte Projekte löschen.',
      'info',
    );
  }
}

export async function persist(): Promise<void> {
  if (!state.project) return;
  try {
    await saveProject(state.project);
    dirty = false;
    void checkStoragePressure();
  } catch (err) {
    if (err instanceof StorageQuotaError || isQuotaError(err)) {
      showToast(
        'Der lokale Speicher ist voll. Bitte Projekt als ZIP sichern und nicht benötigte Projekte löschen.',
        'error',
      );
    } else {
      showToast('Konnte Projekt nicht speichern.', 'error');
    }
  }
}

export function schedulePersist(): void {
  dirty = true;
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    saveTimeout = null;
    void persist();
  }, 500);
}

/** Offene Änderungen sofort schreiben (Tab-Wechsel, Schließen). */
export function flushPersist(): void {
  if (!dirty) return;
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }
  void persist();
}

function installFlushHandlers(): void {
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushPersist();
  });
  window.addEventListener('pagehide', flushPersist);
}

/* ── Projekt setzen ── */

export async function refreshSummaries(): Promise<void> {
  state.summaries = await listProjects();
}

/** Übernimmt ein Projekt als geöffnetes Projekt und speichert es. */
export async function activateProject(next: Project): Promise<void> {
  await flushPersist();
  state.project = next;
  state.editMode = false;
  await setActiveProjectId(next.id);
  await persist();
  await refreshSummaries();
  render();
}

/** Schließt das geöffnete Projekt (z. B. nach dem Löschen). */
export async function closeProject(): Promise<void> {
  state.project = null;
  state.editMode = false;
  await setActiveProjectId(null);
  await refreshSummaries();
  render();
}

/** Beim Start: alter Einzel-Projekt-Speicher, Projektliste und aktives Projekt laden. */
export async function initState(): Promise<void> {
  try {
    await migrateLegacyProject();
    state.summaries = await listProjects();
    const activeId = await getActiveProjectId();
    if (activeId) {
      const raw = await loadProject(activeId);
      state.project = raw ? migrateProject(raw) : null;
      if (!state.project) await setActiveProjectId(null);
    }
  } catch {
    showToast('Konnte gespeichertes Projekt nicht laden.', 'error');
  }

  installFlushHandlers();
  /* Dauerhaften Speicher anfordern (verhindert Datenverlust bei Platznot) */
  void requestPersistentStorage();
}
