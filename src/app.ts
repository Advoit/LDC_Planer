/* ── App-Shell: Initialisierung, Rendering und Verdrahtung der Aktionen ── */

import { el, clear } from './ui/dom';
import { renderTaskList } from './ui/task-list';
import { buildStartScreen } from './ui/start-screen';
import { buildMobileNavigation, buildToolbar } from './ui/app-toolbar';
import type { ToolbarHandlers } from './ui/app-toolbar';
import { initState, setRenderer, state, toggleEditMode } from './ui/app-state';
import {
  importProjectFile,
  loadZip,
  newProject,
  openProject,
  openProjects,
  removeProject,
  saveZip,
  showInstandsetzungsreport,
  showMaterialExport,
  showProjectDocuments,
  showProjectExport,
  showSnapshots,
  showTrash,
} from './ui/app-project-actions';
import {
  bulkStatus,
  copyTask,
  deleteTasks,
  editTask,
  newTask,
  openTask,
} from './ui/app-task-actions';

const appEl = document.getElementById('app')!;

export async function initApp(): Promise<void> {
  setRenderer(renderApp);
  await initState();
  renderApp();
}

/* ── Rendering ── */

function renderApp(): void {
  clear(appEl);
  appEl.appendChild(buildToolbar(toolbarOptions()));
  buildMain();
  appEl.appendChild(buildMobileNavigation(toolbarOptions()));
}

function toolbarOptions(): Parameters<typeof buildToolbar>[0] {
  const handlers: ToolbarHandlers = {
    newProject: () => void newProject(),
    openProjects: () => void openProjects(),
    saveZip: () => void saveZip(),
    loadZip: () => void loadZip(),
    openSnapshots: () => showSnapshots(),
    openTrash: () => showTrash(),
    openDocuments: () => void showProjectDocuments(),
    openInstandsetzungsreport: () => void showInstandsetzungsreport(),
    openProjectExport: () => void showProjectExport(),
    openMaterialExport: () => void showMaterialExport(),
    newTask: () => void newTask(),
    toggleEditMode: () => toggleEditMode(),
  };
  return { project: state.project, editMode: state.editMode, handlers };
}

function buildMain(): void {
  if (!state.project) {
    appEl.appendChild(
      buildStartScreen({
        summaries: state.summaries,
        currentId: null,
        onNewProject: () => void newProject(),
        onLoadZip: () => void loadZip(),
        onOpenProject: (id) => void openProject(id),
        onDeleteProject: (id) => void removeProject(id),
        onDropFile: (file) => void importProjectFile(file),
      }),
    );
    return;
  }

  const main = el('main', { class: 'main-view' });
  renderTaskList(main, {
    project: state.project,
    editMode: state.editMode,
    onOpenTask: (id) => openTask(id),
    onEditTask: (id) => void editTask(id),
    onDuplicateTask: (id) => void copyTask(id),
    onBulkStatus: (ids, status) => void bulkStatus(ids, status),
    onBulkDelete: (ids) => void deleteTasks(ids),
    onBulkExport: (ids) => void showProjectExport(ids),
  });
  appEl.appendChild(main);
}
