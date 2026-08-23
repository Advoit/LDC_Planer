/* ── App-Shell: Projekt-Status, Toolbar, Routing ── */

import { el, icon, clear, downloadBlob, pickFile } from './ui/dom';
import { showToast } from './ui/toast';
import { renderTaskList } from './ui/task-list';
import { openTaskForm } from './ui/task-form';
import { openTaskDetail } from './ui/task-detail';
import { openNewProjectFlow } from './ui/project-form';
import {
  openMaterialExportModal,
  openProjectExportModal,
} from './ui/export-flow';
import { showMergeOrOverwriteDialog, runMergeFlow } from './ui/merge-flow';
import { openProjectDocumentsModal } from './ui/project-documents';
import { loadStoredProject, storeProject } from './core/storage';
import { migrateProject } from './core/migrate';
import { touchProject } from './domain/project';
import { createTask } from './domain/task';
import { buildProjectZip, projectZipFileName } from './io/export';
import { parseProjectZip } from './io/import';
import type { Project, Task } from './domain/types';

const appEl = document.getElementById('app')!;

/* ── App-State ── */
let project: Project | null = null;
let editMode = false;
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

export async function initApp(): Promise<void> {
  /* 1. Gespeichertes Projekt laden & migrieren */
  try {
    const raw = await loadStoredProject();
    if (raw) {
      project = migrateProject(raw);
    }
  } catch {
    showToast('Konnte gespeichertes Projekt nicht laden.', 'error');
  }
  render();
}

/* ── Persistenz ── */

async function persist(): Promise<void> {
  if (!project) return;
  try {
    await storeProject(project);
  } catch {
    showToast('Konnte Projekt nicht speichern.', 'error');
  }
}

function schedulePersist(): void {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    void persist();
  }, 500);
}

/* ── Projekt setzen ── */

async function setProject(p: Project): Promise<void> {
  project = p;
  editMode = false;
  await persist();
  render();
}

/* ── UI-Rendering ── */

function render(): void {
  clear(appEl);

  appEl.appendChild(buildToolbar());
  buildMain();
}

function buildToolbar(): HTMLElement {
  const bar = el('header', { class: 'toolbar' });

  /* Marke + markanter Projekttitel */
  const brand = el('div', { class: 'toolbar-brand' });
  const logo = el('span', { class: 'brand-logo' }, [
    el('img', { class: 'brand-logo-img', src: 'favicon.svg', alt: 'LDC Projekt Planer Logo' }),
  ]);
  const brandText = el('div', { class: 'brand-text' });

  if (project) {
    brandText.appendChild(el('span', { class: 'brand-kicker' }, ['LDC Projekte']));
    brandText.appendChild(
      el('h1', { class: 'project-title', title: project.name }, [project.name]),
    );
    const openCount = project.tasks.filter((t) => t.status !== 'behoben').length;
    brandText.appendChild(
      el('span', { class: 'project-sub' }, [
        project.location,
        ` · ${project.tasks.length} ${project.tasks.length === 1 ? 'Aufgabe' : 'Aufgaben'}`,
        ...(openCount > 0 ? [` · ${openCount} offen`] : []),
      ]),
    );
  } else {
    brandText.appendChild(el('h1', { class: 'brand-title' }, ['LDC Projekte']));
  }

  brand.appendChild(logo);
  brand.appendChild(brandText);
  bar.appendChild(brand);

  /* Aktionen – gruppiert nach Bereich */
  const actions = el('div', { class: 'toolbar-actions' });

  const btn = (
    label: string,
    iconName: string,
    click: () => void,
    extra: string = '',
  ) => {
    const b = el(
      'button',
      { class: `toolbar-btn ${extra}`, type: 'button', title: label, 'aria-label': label },
      [icon(iconName), el('span', { class: 'btn-label' }, [label])],
    ) as HTMLButtonElement;
    b.addEventListener('click', click);
    return b;
  };

  const group = (label: string, buttons: HTMLButtonElement[]): HTMLElement =>
    el('div', { class: 'toolbar-group' }, [
      el('span', { class: 'toolbar-group-label' }, [label]),
      el('div', { class: 'toolbar-group-buttons' }, buttons),
    ]);

  /* ── Gruppe: Projektverwaltung ── */
  actions.appendChild(
    group('Projekt', [
      btn('Neues Projekt', 'folder-plus', () => void handleNewProject()),
      btn('Speichern', 'download', () => void handleSave(), !project ? 'disabled' : ''),
      btn('Laden', 'upload', () => void handleLoad()),
    ]),
  );

  if (project) {
    /* ── Gruppe: Dokumente ── */
    actions.appendChild(
      group('Dokumente', [
        btn('Unterlagen', 'paperclip', () => void handleProjectDocuments()),
        btn('Projekt Export', 'file-text', () => void handleProjectExport()),
        btn('Material Export', 'clipboard', () => {
          if (project) void openMaterialExportModal(project);
        }),
      ]),
    );

    /* ── Gruppe: Aufgaben ── */
    const editLabel = editMode ? 'Fertig' : 'Editieren';
    const editExtra = editMode ? 'active' : '';
    actions.appendChild(
      group('Aufgaben', [
        btn('Neue Aufgabe', 'plus', () => void handleNewTask(), 'primary'),
        btn(editLabel, editMode ? 'check' : 'pencil', () => toggleEditMode(), editExtra),
      ]),
    );
  }

  bar.appendChild(actions);
  return bar;
}

function buildMain(): void {
  if (!project) {
    const empty = el('div', { class: 'empty-state' }, [
      el('div', { class: 'empty-icon' }, [icon('folder')]),
      el('h2', {}, ['Kein Projekt geöffnet']),
      el('p', {}, [
        'Legen Sie ein neues Projekt an oder laden Sie eine gesicherte Projekt-ZIP (.zip).',
      ]),
      el('button', { class: 'btn btn-primary btn-lg', type: 'button' }, [
        icon('folder'),
        ' Neues Projekt',
      ]),
    ]);
    empty
      .querySelector('button')!
      .addEventListener('click', () => void handleNewProject());
    appEl.appendChild(empty);
    return;
  }

  const main = el('main', { class: 'main-view' });
  renderList(main);
  appEl.appendChild(main);
}

function renderList(container: HTMLElement): void {
  if (!project) return;
  renderTaskList(container, {
    project,
    editMode,
    onOpenTask: (id) => {
      void openTaskDetail({
        project: project!,
        taskId: id,
        onChanged: (updatedTask) => {
          if (!project) return;
          project = touchProject({
            ...project,
            tasks: project.tasks.map((t) =>
              t.id === updatedTask.id ? updatedTask : t,
            ),
          });
          schedulePersist();
          render();
        },
      });
    },
    onEditTask: (id) => {
      void handleEditTask(id);
    },
  });
}

function toggleEditMode(): void {
  editMode = !editMode;
  render();
}

/* ── Handler ── */

async function handleNewProject(): Promise<void> {
  const p = await openNewProjectFlow(project !== null);
  if (!p) return;
  await setProject(p);
  showToast('Neues Projekt erstellt.', 'success');
}

async function handleSave(): Promise<void> {
  if (!project) return;
  await persist();
  const blob = buildProjectZip(project);
  const name = projectZipFileName(project);
  downloadBlob(blob, name);
  showToast('Projekt exportiert.', 'success');
}

async function handleLoad(): Promise<void> {
  /* .ldcproj bleibt aus Abwärtskompatibilität wählbar (identisches ZIP-Format) */
  const file = await pickFile('.zip,.ldcproj');
  if (!file) return;
  const buf = await file.arrayBuffer();
  const imported = await parseProjectZip(buf);
  if (!imported) {
    showToast('Die Datei ist keine gültige Projekt-ZIP-Datei.', 'error');
    return;
  }

  if (!project) {
    await setProject(imported);
    showToast('Projekt geladen.', 'success');
    return;
  }

  /* Projekt existiert bereits → Merge / Überschreiben (auch bei anderer Projekt-ID) */
  const choice = await showMergeOrOverwriteDialog(project, imported);
  if (choice === 'cancel') return;
  if (choice === 'overwrite') {
    await setProject(imported);
    showToast('Projekt überschrieben.', 'success');
    return;
  }
  if (choice === 'merge') {
    const merged = await runMergeFlow(project, imported);
    if (merged) {
      await setProject(merged);
      showToast('Projekte zusammengeführt.', 'success');
    }
  }
}

async function handleNewTask(): Promise<void> {
  if (!project) return;
  const result = await openTaskForm({ mode: 'create', project });
  if (!result || result.delete) return;
  const task = createTask(project.id, result.input);
  project = touchProject({ ...project, tasks: [...project.tasks, task] });
  schedulePersist();
  render();
  showToast('Aufgabe erstellt.', 'success');
}

async function handleProjectDocuments(): Promise<void> {
  if (!project) return;
  const docs = await openProjectDocumentsModal(project);
  if (!docs) return;
  project = touchProject({ ...project, documents: docs });
  schedulePersist();
  render();
  showToast('Unterlagen gespeichert.', 'success');
}

function handleProjectExport(): void {
  if (!project) return;
  void openProjectExportModal(project);
}

async function handleEditTask(taskId: string): Promise<void> {
  if (!project) return;
  const task = project.tasks.find((t) => t.id === taskId);
  if (!task) return;
  const result = await openTaskForm({ mode: 'edit', project, task });
  if (!result) return;

  if (result.delete) {
    project = touchProject({
      ...project,
      tasks: project.tasks.filter((t) => t.id !== taskId),
    });
    schedulePersist();
    render();
    showToast('Aufgabe gelöscht.', 'info');
    return;
  }

  const updated: Task = {
    ...task,
    ...result.input,
    updatedAt: new Date().toISOString(),
  };
  project = touchProject({
    ...project,
    tasks: project.tasks.map((t) => (t.id === taskId ? updated : t)),
  });
  schedulePersist();
  render();
  showToast('Aufgabe gespeichert.', 'success');
}
