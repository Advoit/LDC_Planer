/* ── Aktionen rund um Projekte, Sicherungen, Dokumente und Exporte ── */

import { downloadBlob, pickFile } from './dom';
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
import { parseProjectZip } from '../io/import';
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
  const raw = await loadProject(id);
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
  if (!state.project) return;
  await persist();
  downloadBlob(
    buildProjectZip(state.project),
    projectZipFileName(state.project),
  );
  showToast('Projekt exportiert.', 'success');
}

export async function loadZip(): Promise<void> {
  /* .ldcproj bleibt aus Abwärtskompatibilität wählbar (identisches ZIP-Format) */
  const file = await pickFile('.zip,.ldcproj');
  if (!file) return;
  await importProjectFile(file);
}

/** Importiert eine (per Auswahl oder Drag & Drop) übergebene Projekt-ZIP. */
export async function importProjectFile(file: File): Promise<void> {
  let imported: Project | null = null;
  try {
    imported = await parseProjectZip(await file.arrayBuffer());
  } catch {
    imported = null;
  }
  if (!imported) {
    showToast('Die Datei ist keine gültige Projekt-ZIP-Datei.', 'error');
    return;
  }

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
    await activateProject(imported);
    showToast('Projekt geladen.', 'success');
    return;
  }

  /* Projekt existiert bereits → Merge / Überschreiben (auch bei anderer Projekt-ID) */
  const choice = await showMergeOrOverwriteDialog(state.project, imported);
  if (choice === 'cancel') return;
  if (choice === 'overwrite') {
    await createSnapshot(state.project);
    await activateProject(imported);
    showToast('Projekt überschrieben.', 'success');
    return;
  }
  if (choice === 'merge') {
    const merged = await runMergeFlow(state.project, imported);
    if (merged) {
      await createSnapshot(state.project);
      await activateProject(merged);
      showToast('Projekte zusammengeführt.', 'success');
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
  const toAdd = tasks.filter((t) => !existing.has(t.id));
  if (toAdd.length === 0) return;

  state.project = touchProject({
    ...project,
    tasks: [...project.tasks, ...toAdd],
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
