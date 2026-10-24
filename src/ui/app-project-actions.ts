/* ── Aktionen rund um Projekte, Sicherungen, Dokumente und Exporte ── */

import { downloadBlob, pickFile, readFileAsArrayBuffer } from './dom';
import { showToast } from './toast';
import { openNewProjectFlow } from './project-form';
import { showMergeOrOverwriteDialog, runMergeFlow } from './merge-flow';
import { openProjectDocumentsModal } from './project-documents';
import { openProjectsModal } from './project-list';
import { openSnapshotsModal } from './snapshots';
import { openTrashModal } from './trash';
import {
  createSnapshot,
  loadTrash,
  saveTrash,
} from '../core/recovery-store';
import { deleteProject, loadProject } from '../core/project-store';
import { migrateProject } from '../core/migrate';
import { touchProject } from '../domain/project';
import { buildProjectZip, projectZipFileName } from '../io/export';
import { parseProjectZipDetailed } from '../io/import';
import { applyServerAccess } from '../io/share';
import type { ServerAccess } from '../io/share';
import { withProgress } from './progress';
import {
  activateProject,
  closeProject,
  persist,
  refreshSummaries,
  render,
  schedulePersist,
  state,
} from './app-state';
import type { Project, Task } from '../domain/types';

export async function newProject(): Promise<void> {
  const created = await openNewProjectFlow();
  if (!created) return;
  await activateProject(created);
  showToast('Neues Projekt erstellt.', 'success');
}

export async function openProjects(): Promise<void> {
  await refreshSummaries();
  openProjectsModal({
    summaries: state.summaries,
    currentId: state.project?.id ?? null,
    onOpen: (id) => void openProject(id),
    onDelete: (id) => void removeProject(id),
    onNewProject: () => void newProject(),
    onLoadZip: () => void loadZip(),
  });
}

export async function openProject(id: string): Promise<void> {
  if (state.project?.id === id) {
    showToast('Dieses Projekt ist bereits geöffnet.', 'info');
    return;
  }
  const raw = await withProgress('Projekt wird geladen …', () =>
    loadProject(id),
  );
  if (!raw) {
    showToast('Projekt konnte nicht geladen werden.', 'error');
    await refreshSummaries();
    render();
    return;
  }
  await activateProject(migrateProject(raw));
  showToast('Projekt geöffnet.', 'success');
}

export async function removeProject(id: string): Promise<void> {
  await deleteProject(id);
  if (state.project?.id === id) {
    await closeProject();
  } else {
    await refreshSummaries();
    render();
  }
  showToast('Projekt gelöscht.', 'info');
}

export async function saveZip(): Promise<void> {
  const project = state.project;
  if (!project) return;
  /* Das ZIP-Packen blockiert den Main-Thread – daher Anzeige sofort einblenden. */
  await withProgress(
    'Projekt-ZIP wird erstellt …',
    async () => {
      await persist();
      downloadBlob(buildProjectZip(project), projectZipFileName(project));
    },
    { immediate: true },
  );
  showToast('Projekt exportiert.', 'success');
}

export async function loadZip(): Promise<void> {
  /* Neben den Endungen auch MIME-Typen angeben: iOS (Dateien-App) und Android
     blenden ZIP-Dateien sonst je nach Browser/Version aus. `.ldcproj` bleibt
     aus Abwärtskompatibilität wählbar (identisches ZIP-Format). */
  const file = await pickFile(
    'application/zip,application/x-zip-compressed,application/octet-stream,.zip,.ldcproj',
  );
  if (!file) return;
  await importProjectFile(file);
}

/** Importiert eine (per Auswahl oder Drag & Drop) übergebene Projekt-ZIP. */
export async function importProjectFile(file: File): Promise<void> {
  if (file.size === 0) {
    showToast('Die Datei ist leer.', 'error');
    return;
  }

  let imported: Project | null = null;
  let access: ServerAccess | null = null;
  let readFailed = false;
  try {
    /* FileReader-Fallback für ältere iOS-/Android-Browser (kein Blob.arrayBuffer). */
    const buffer = await readFileAsArrayBuffer(file);
    const parsed = await withProgress('Projekt wird geladen …', async (report) =>
      parseProjectZipDetailed(buffer, report),
    );
    imported = parsed.project;
    access = parsed.access;
  } catch {
    readFailed = true;
  }
  if (!imported) {
    showToast(
      readFailed
        ? 'Die Datei konnte nicht gelesen werden. Bitte erneut auswählen.'
        : 'Die Datei ist keine gültige Projekt-ZIP-Datei.',
      'error',
    );
    return;
  }

  const applyAccess = (
    project: Project,
  ): { project: Project; applied: boolean } => {
    if (!access) return { project, applied: false };
    return applyServerAccess(project, access);
  };

  if (!state.project) {
    /* Existiert bereits ein Projekt mit dieser ID, dessen Stand vorher sichern */
    const stored = state.summaries.some((s) => s.id === imported!.id)
      ? await loadProject(imported.id)
      : null;
    if (stored) {
      const existing = migrateProject(stored);
      if (existing.tasks.length > 0 || existing.documents.length > 0) {
        await createSnapshot(existing);
      }
    }
    const applied = applyAccess(imported);
    await activateProject(applied.project);
    showToast(
      applied.applied
        ? 'Projekt geladen – Server-Zugang übernommen.'
        : 'Projekt geladen.',
      'success',
    );
    return;
  }

  /* Projekt existiert bereits → Merge / Überschreiben (auch bei anderer Projekt-ID) */
  const choice = await showMergeOrOverwriteDialog(state.project, imported);
  if (choice === 'cancel') return;
  if (choice === 'overwrite') {
    await createSnapshot(state.project);
    const applied = applyAccess(imported);
    await activateProject(applied.project);
    showToast(
      applied.applied
        ? 'Projekt überschrieben – Server-Zugang übernommen.'
        : 'Projekt überschrieben.',
      'success',
    );
    return;
  }
  if (choice === 'merge') {
    const merged = await runMergeFlow(state.project, imported);
    if (merged) {
      /* Ein vorhandener lokaler Server bleibt beim Zusammenführen erhalten. */
      const applied = merged.server
        ? { project: merged, applied: false }
        : applyAccess(merged);
      await createSnapshot(state.project);
      await activateProject(applied.project);
      showToast(
        applied.applied
          ? 'Projekte zusammengeführt – Server-Zugang übernommen.'
          : 'Projekte zusammengeführt.',
        'success',
      );
    }
  }
}

/* ── Sicherungsstände & Papierkorb ── */

export function showSnapshots(): void {
  const current = state.project;
  if (!current) return;
  openSnapshotsModal({
    project: current,
    onRestore: (snapshot) => {
      void (async () => {
        await createSnapshot(current);
        await activateProject(touchProject(snapshot));
        showToast('Sicherungsstand wiederhergestellt.', 'success');
      })();
    },
  });
}

export function showTrash(): void {
  const current = state.project;
  if (!current) return;
  openTrashModal({
    projectId: current.id,
    onRestore: (tasks) => void restoreTasks(tasks),
  });
}

/** Holt Aufgaben aus dem Papierkorb zurück ins Projekt. */
export async function restoreTasks(tasks: Task[]): Promise<void> {
  const project = state.project;
  if (!project || tasks.length === 0) return;
  const existing = new Set(project.tasks.map((t) => t.id));
  /* updatedAt auf jetzt setzen: So gewinnt die Wiederherstellung auch gegen
     einen älteren Löschvermerk eines anderen Geräts. */
  const now = new Date().toISOString();
  const toAdd = tasks
    .filter((t) => !existing.has(t.id))
    .map((t) => ({ ...t, updatedAt: now }));
  if (toAdd.length === 0) return;

  const restoredIds = new Set(toAdd.map((t) => t.id));
  state.project = touchProject({
    ...project,
    tasks: [...project.tasks, ...toAdd],
    /* Wiederherstellen macht den Löschvermerk rückgängig. */
    deletedTasks: (project.deletedTasks ?? []).filter(
      (ref) => !restoredIds.has(ref.id),
    ),
  });
  const trash = await loadTrash(project.id);
  await saveTrash(
    project.id,
    trash.filter((item) => !toAdd.some((t) => t.id === item.task.id)),
  );
  schedulePersist();
  render();
  showToast(
    toAdd.length === 1
      ? 'Aufgabe wiederhergestellt.'
      : `${toAdd.length} Aufgaben wiederhergestellt.`,
    'success',
  );
}

/* ── Unterlagen & Exporte ── */

export async function showProjectDocuments(): Promise<void> {
  const project = state.project;
  if (!project) return;
  const docs = await openProjectDocumentsModal(project);
  if (!docs) return;
  state.project = touchProject({ ...project, documents: docs });
  schedulePersist();
  render();
  showToast('Unterlagen gespeichert.', 'success');
}

export async function showMaterialExport(): Promise<void> {
  const project = state.project;
  if (!project) return;
  const { openMaterialExportModal } = await import('./export-material-flow');
  await openMaterialExportModal(project);
}

/** Projektbericht-PDF – optional nur für die ausgewählten Aufgaben. */
export async function showProjectExport(taskIds?: string[]): Promise<void> {
  const project = state.project;
  if (!project) return;
  const { openProjectExportModal } = await import('./export-project-flow');
  await openProjectExportModal(
    project,
    taskIds ? { taskIds: new Set(taskIds) } : undefined,
  );
}

export async function showInstandsetzungsreport(): Promise<void> {
  const project = state.project;
  if (!project) return;
  const { openInstandsetzungsreportModal } = await import('./export-instandsetzung-flow');
  const cover = await openInstandsetzungsreportModal(project);
  if (!cover) return;
  state.project = touchProject({ ...project, reportCover: cover });
  schedulePersist();
  render();
}
