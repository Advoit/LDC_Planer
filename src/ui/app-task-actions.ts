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
import { acquireTaskLock, isTaskLockedByOther, releaseTaskLock } from './server-sync';
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

export async function openTask(taskId: string): Promise<void> {
  const project = state.project;
  if (!project) return;

  const lock = await acquireTaskLock(taskId);
  const current = state.project;
  if (!current) {
    if (lock.held) void releaseTaskLock(taskId);
    return;
  }
  const task = current.tasks.find((t) => t.id === taskId);
  if (!task) {
    if (lock.held) void releaseTaskLock(taskId);
    return;
  }

  if (!lock.ok) {
    showToast(
      `„${task.name}“ wird gerade von ${lock.holder?.user ?? 'einer anderen Person'} bearbeitet – nur Ansicht.`,
      'info',
    );
  }

  openTaskDetail({
    project: current,
    taskId,
    readOnly: !lock.ok,
    lockHolder: lock.holder?.user,
    onChanged: (updated) => replaceTask(updated),
    /* Duplizieren nur im Editiermodus und bei eigener Bearbeitung */
    onDuplicate:
      state.editMode && lock.ok ? (t) => void copyTask(t.id) : undefined,
    onClose: lock.held ? () => void releaseTaskLock(taskId) : undefined,
  });
}

export async function newTask(): Promise<void> {
  const project = state.project;
  if (!project) return;
  const result = await openTaskForm({ mode: 'create', project });
  if (!result || result.delete) return;

  /* Während das Formular offen war, kann ein Serverabgleich neue Aufgaben
     eingemischt haben – deshalb den aktuellen Stand verwenden. */
  const current = state.project;
  if (!current || current.id !== project.id) return;
  const task = createTask(current.id, result.input);
  state.project = touchProject({ ...current, tasks: [...current.tasks, task] });
  schedulePersist();
  render();
  showToast('Aufgabe erstellt.', 'success');
}

export async function editTask(taskId: string): Promise<void> {
  const project = state.project;
  if (!project) return;
  const task = project.tasks.find((t) => t.id === taskId);
  if (!task) return;

  const lock = await acquireTaskLock(taskId);
  if (!lock.ok) {
    showToast(
      `„${task.name}“ wird gerade von ${lock.holder?.user ?? 'einer anderen Person'} bearbeitet – nur Ansicht.`,
      'info',
    );
    const current = state.project;
    if (current) {
      openTaskDetail({
        project: current,
        taskId,
        readOnly: true,
        lockHolder: lock.holder?.user,
        onChanged: (updated) => replaceTask(updated),
      });
    }
    return;
  }

  try {
    const current = state.project;
    const currentTask = current?.tasks.find((t) => t.id === taskId) ?? task;
    const result = await openTaskForm({
      mode: 'edit',
      project: current ?? project,
      task: currentTask,
    });
    if (!result) return;

    if (result.delete) {
      await deleteTasks([taskId]);
      return;
    }

    replaceTask({ ...task, ...result.input, updatedAt: new Date().toISOString() });
    showToast('Aufgabe gespeichert.', 'success');
  } finally {
    if (lock.held) void releaseTaskLock(taskId);
  }
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

  const lockedIds = ids.filter((id) => isTaskLockedByOther(id));
  const allowedIds = ids.filter((id) => !lockedIds.includes(id));
  if (allowedIds.length === 0) {
    showToast('Gesperrte Aufgaben können nicht gelöscht werden.', 'info');
    return;
  }

  const idSet = new Set(allowedIds);
  const removed = project.tasks.filter((t) => idSet.has(t.id));
  if (removed.length === 0) return;

  await addToTrash(project.id, removed);

  /* Nach dem asynchronen Papierkorb-Schreiben den aktuellen Stand verwenden,
     damit ein zwischenzeitlicher Serverabgleich nicht überschrieben wird. */
  const current = state.project;
  if (!current || current.id !== project.id) return;

  const deletedAt = new Date().toISOString();
  const removedIds = new Set(removed.map((t) => t.id));
  const deletedTasks = [
    ...(current.deletedTasks ?? []).filter((ref) => !removedIds.has(ref.id)),
    ...removed.map((t) => ({ id: t.id, deletedAt })),
  ];
  state.project = touchProject({
    ...current,
    tasks: current.tasks.filter((t) => !idSet.has(t.id)),
    deletedTasks,
  });
  schedulePersist();
  render();

  const base =
    removed.length === 1
      ? 'Aufgabe gelöscht.'
      : `${removed.length} Aufgaben gelöscht.`;
  showToast(
    lockedIds.length > 0
      ? `${base} ${lockedIds.length} gesperrte übersprungen.`
      : base,
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

  const lockedIds = ids.filter((id) => isTaskLockedByOther(id));
  const allowedIds = ids.filter((id) => !lockedIds.includes(id));
  if (allowedIds.length === 0) {
    showToast('Gesperrte Aufgaben können nicht geändert werden.', 'info');
    return;
  }

  const fields = await promptStatusFields({ status, count: allowedIds.length });
  if (!fields) return;

  const bulk: BulkStatusFields = {
    status,
    editedBy: fields.editedBy,
    editedAt: fields.editedAt,
  };

  /* Nach dem Dialog den aktuellen Stand verwenden, falls inzwischen ein
     Serverabgleich neue Aufgaben eingemischt hat. */
  const current = state.project;
  if (!current || current.id !== project.id) return;
  const { updated, skipped } = applyBulkStatus(current.tasks, new Set(allowedIds), bulk);
  if (updated.length === 0) {
    showToast('Keine Aufgabe konnte geändert werden.', 'error');
    return;
  }

  const updatedById = new Map(updated.map((t) => [t.id, t]));
  state.project = touchProject({
    ...current,
    tasks: current.tasks.map((t) => updatedById.get(t.id) ?? t),
  });
  schedulePersist();
  render();

  const lockedNotice =
    lockedIds.length > 0 ? ` · ${lockedIds.length} gesperrt` : '';
  if (skipped.length > 0) {
    showToast(
      `${updated.length} aktualisiert · ${skipped.length} übersprungen (Hinweistext fehlt)${lockedNotice}.`,
      'info',
    );
  } else {
    showToast(
      `${updated.length} Aufgaben aktualisiert${lockedNotice}.`,
      lockedIds.length > 0 ? 'info' : 'success',
    );
  }
}
