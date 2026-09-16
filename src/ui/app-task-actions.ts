/* ── Aktionen rund um Aufgaben (anlegen, bearbeiten, duplizieren, löschen, sammeln) ── */

import { showToast } from './toast';
import { openTaskForm } from './task-form';
import { openTaskDetail } from './task-detail';
import { promptStatusFields } from './status-prompt';
import { addToTrash } from '../core/recovery-store';
import { touchProject } from '../domain/project';
import { applyBulkStatus, createTask, duplicateTask } from '../domain/task';
import type { BulkStatusFields } from '../domain/task';
import { render, schedulePersist, state } from './app-state';
import { restoreTasks } from './app-project-actions';
import type { Task, TaskStatus } from '../domain/types';

/** Übernimmt eine geänderte Aufgabe in das geöffnete Projekt. */
function replaceTask(updatedTask: Task): void {
  const project = state.project;
  if (!project) return;
  state.project = touchProject({
    ...project,
    tasks: project.tasks.map((t) => (t.id === updatedTask.id ? updatedTask : t)),
  });
  schedulePersist();
  render();
}

export function openTask(taskId: string): void {
  if (!state.project) return;
  openTaskDetail({
    project: state.project,
    taskId,
    onChanged: (updated) => replaceTask(updated),
    onDuplicate: (task) => void copyTask(task.id),
  });
}

export async function newTask(): Promise<void> {
  const project = state.project;
  if (!project) return;
  const result = await openTaskForm({ mode: 'create', project });
  if (!result || result.delete) return;
  const task = createTask(project.id, result.input);
  state.project = touchProject({ ...project, tasks: [...project.tasks, task] });
  schedulePersist();
  render();
  showToast('Aufgabe erstellt.', 'success');
}

export async function editTask(taskId: string): Promise<void> {
  const project = state.project;
  if (!project) return;
  const task = project.tasks.find((t) => t.id === taskId);
  if (!task) return;
  const result = await openTaskForm({ mode: 'edit', project, task });
  if (!result) return;

  if (result.delete) {
    await deleteTasks([taskId]);
    return;
  }

  replaceTask({ ...task, ...result.input, updatedAt: new Date().toISOString() });
  showToast('Aufgabe gespeichert.', 'success');
}

/** Dupliziert eine Aufgabe (Status-Bereich startet neu) – mit Undo im Toast. */
export async function copyTask(taskId: string): Promise<void> {
  const project = state.project;
  if (!project) return;
  const task = project.tasks.find((t) => t.id === taskId);
  if (!task) return;

  const copy = duplicateTask(task);
  state.project = touchProject({ ...project, tasks: [...project.tasks, copy] });
  schedulePersist();
  render();
  showToast('Aufgabe dupliziert.', 'success', {
    label: 'Rückgängig',
    onClick: () => {
      if (!state.project) return;
      state.project = touchProject({
        ...state.project,
        tasks: state.project.tasks.filter((t) => t.id !== copy.id),
      });
      schedulePersist();
      render();
    },
  });
}

/** Löscht Aufgaben in den Papierkorb (Undo über Toast oder Papierkorb). */
export async function deleteTasks(ids: string[]): Promise<void> {
  const project = state.project;
  if (!project || ids.length === 0) return;
  const idSet = new Set(ids);
  const removed = project.tasks.filter((t) => idSet.has(t.id));
  if (removed.length === 0) return;

  await addToTrash(project.id, removed);
  state.project = touchProject({
    ...project,
    tasks: project.tasks.filter((t) => !idSet.has(t.id)),
  });
  schedulePersist();
  render();

  showToast(
    removed.length === 1
      ? 'Aufgabe gelöscht.'
      : `${removed.length} Aufgaben gelöscht.`,
    'info',
    { label: 'Rückgängig', onClick: () => void restoreTasks(removed) },
  );
}

/** Setzt den Status mehrerer Aufgaben in einem Schritt. */
export async function bulkStatus(
  ids: string[],
  status: TaskStatus,
): Promise<void> {
  const project = state.project;
  if (!project || ids.length === 0) return;

  const fields = await promptStatusFields({ status, count: ids.length });
  if (!fields) return;

  const bulk: BulkStatusFields = {
    status,
    editedBy: fields.editedBy,
    editedAt: fields.editedAt,
  };
  const { updated, skipped } = applyBulkStatus(project.tasks, new Set(ids), bulk);
  if (updated.length === 0) {
    showToast('Keine Aufgabe konnte geändert werden.', 'error');
    return;
  }

  const updatedById = new Map(updated.map((t) => [t.id, t]));
  state.project = touchProject({
    ...project,
    tasks: project.tasks.map((t) => updatedById.get(t.id) ?? t),
  });
  schedulePersist();
  render();

  if (skipped.length > 0) {
    showToast(
      `${updated.length} aktualisiert · ${skipped.length} übersprungen (Hinweistext fehlt).`,
      'info',
    );
  } else {
    showToast(`${updated.length} Aufgaben aktualisiert.`, 'success');
  }
}
