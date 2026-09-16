/* ── Aufgaben-Übersicht: Suche, Filter, Sortierung, Liste, Auswahl ── */

import { el, icon, clear } from './dom';
import { STATUS_LABELS, TASK_TYPS, TASK_TYP_LABELS } from '../domain/types';
import type { Project, Task, TaskStatus } from '../domain/types';
import { defaultTaskFilter, filterTasks } from '../domain/task-filter';
import type { TaskFilter, TaskSortKey } from '../domain/task-filter';
import { createBulkBar } from './task-bulk-bar';

export interface TaskListOptions {
  project: Project;
  editMode: boolean;
  onOpenTask: (taskId: string) => void;
  onEditTask: (taskId: string) => void;
  onDuplicateTask: (taskId: string) => void;
  /** Sammelaktionen: bearbeiten mehrere ausgewählte Aufgaben auf einmal. */
  onBulkStatus: (taskIds: string[], status: TaskStatus) => void;
  onBulkDelete: (taskIds: string[]) => void;
  onBulkExport: (taskIds: string[]) => void;
}

/* Der Zustand bleibt außerhalb des Render-Zyklus erhalten, solange dasselbe
   Projekt geöffnet ist (die App-Shell rendert die Übersicht nach jeder Änderung). */
let taskListProjectId: string | null = null;
let filter: TaskFilter = defaultTaskFilter();
let selectionMode = false;
const selectedIds = new Set<string>();

export function renderTaskList(container: HTMLElement, opts: TaskListOptions): void {
  clear(container);

  if (taskListProjectId !== opts.project.id) {
    taskListProjectId = opts.project.id;
    filter = defaultTaskFilter();
    selectionMode = false;
    selectedIds.clear();
  }

  /* ── Steuerleiste (aufklappbar) ── */
  const controls = el('div', { class: 'list-controls' });

  const toggleBtn = el('button', { class: 'filter-toggle', type: 'button' }, [
    icon('search'),
    el('span', { class: 'filter-toggle-label' }, ['Suche & Filter']),
    icon('chevron'),
  ]) as HTMLButtonElement;
  toggleBtn.addEventListener('click', () => {
    const open = controls.classList.toggle('filter-open');
    toggleBtn.classList.toggle('open', open);
  });
  controls.appendChild(toggleBtn);

  const panel = el('div', { class: 'list-filter-panel' });

  const searchInput = el('input', {
    type: 'search',
    class: 'input search-input',
    placeholder: 'Aufgaben durchsuchen…',
  }) as HTMLInputElement;
  searchInput.value = filter.query;
  searchInput.addEventListener('input', () => {
    filter = { ...filter, query: searchInput.value };
    renderList();
  });

  const statusRow = el('div', { class: 'filter-row' });
  for (const status of ['offen', 'hinweis', 'behoben'] as TaskStatus[]) {
    const chip = el('button', { class: 'chip', type: 'button' }, [
      STATUS_LABELS[status],
    ]) as HTMLButtonElement;
    chip.classList.toggle('active', filter.statuses.has(status));
    chip.addEventListener('click', () => {
      const statuses = new Set(filter.statuses);
      if (statuses.has(status)) statuses.delete(status);
      else statuses.add(status);
      filter = { ...filter, statuses };
      chip.classList.toggle('active', filter.statuses.has(status));
      renderList();
    });
    statusRow.appendChild(chip);
  }

  const sortSelect = el('select', { class: 'input sort-select' }) as HTMLSelectElement;
  const sortOptions: { value: TaskSortKey; label: string }[] = [
    { value: 'name', label: 'Name' },
    { value: 'status', label: 'Status' },
    { value: 'time', label: 'Zeitaufwand' },
    { value: 'art', label: 'Art' },
    { value: 'position', label: 'Position' },
  ];
  for (const option of sortOptions) {
    sortSelect.appendChild(el('option', { value: option.value }, [option.label]));
  }
  sortSelect.value = filter.sort;
  sortSelect.addEventListener('change', () => {
    filter = { ...filter, sort: sortSelect.value as TaskSortKey };
    renderList();
  });

  panel.appendChild(searchInput);
  panel.appendChild(el('div', { class: 'filter-sort-row' }, [statusRow, sortSelect]));

  /* Typ-Filter: Mängel / Umbau/Neuinstallation (Standard: beide eingeblendet) */
  const typRow = el('div', { class: 'filter-row' });
  typRow.appendChild(el('span', { class: 'filter-label' }, ['Typ:']));
  for (const typ of TASK_TYPS) {
    const chip = el('button', { class: 'chip', type: 'button' }, [
      TASK_TYP_LABELS[typ],
    ]) as HTMLButtonElement;
    chip.classList.toggle('active', filter.typs.has(typ));
    chip.addEventListener('click', () => {
      const typs = new Set(filter.typs);
      if (typs.has(typ)) typs.delete(typ);
      else typs.add(typ);
      filter = { ...filter, typs };
      chip.classList.toggle('active', filter.typs.has(typ));
      renderList();
    });
    typRow.appendChild(chip);
  }
  panel.appendChild(typRow);
  controls.appendChild(panel);

  /* Auswahlmodus für Sammelaktionen */
  const selectToggle = el('button', {
    class: 'btn btn-secondary btn-sm select-toggle',
    type: 'button',
  }, [icon('check-square'), el('span', { class: 'btn-select-label' }, [' Auswählen'])]);
  selectToggle.addEventListener('click', () => {
    selectionMode = !selectionMode;
    if (!selectionMode) selectedIds.clear();
    renderList();
  });
  controls.appendChild(el('div', { class: 'list-actions' }, [selectToggle]));

  container.appendChild(controls);

  /* ── Ergebnisliste ── */
  const listEl = el('div', { class: 'task-list' });
  container.appendChild(listEl);

  const bulkBar = createBulkBar({
    onStatus: (ids, status) => opts.onBulkStatus(ids, status),
    onDelete: (ids) => opts.onBulkDelete(ids),
    onExport: (ids) => opts.onBulkExport(ids),
    onToggleAll: () => {
      const visible = filterTasks(opts.project.tasks, filter);
      if (selectedIds.size >= visible.length) selectedIds.clear();
      else for (const task of visible) selectedIds.add(task.id);
      renderList();
    },
  });
  container.appendChild(bulkBar.element);

  /* ── Zeichnen ── */

  function toggleSelection(taskId: string): void {
    if (selectedIds.has(taskId)) selectedIds.delete(taskId);
    else selectedIds.add(taskId);
    renderList();
  }

  function renderList(): void {
    clear(listEl);
    const tasks = filterTasks(opts.project.tasks, filter);

    selectToggle.classList.toggle('active', selectionMode);
    const labelEl = selectToggle.querySelector('.btn-select-label');
    if (labelEl) labelEl.textContent = selectionMode ? ' Fertig' : ' Auswählen';

    bulkBar.update(selectedIds, tasks.length);

    if (tasks.length === 0) {
      listEl.appendChild(
        el('div', { class: 'empty-hint' }, [
          opts.project.tasks.length === 0
            ? 'Noch keine Aufgaben – „Neue Aufgabe“ anlegen.'
            : 'Keine Aufgaben gefunden.',
        ]),
      );
      return;
    }

    for (const task of tasks) listEl.appendChild(buildRow(task));
  }

  function buildRow(task: Task): HTMLElement {
    const thumb = task.thumbnail
      ? el('img', { src: task.thumbnail, class: 'task-thumb', alt: '' })
      : el('div', { class: 'task-thumb placeholder' }, [icon('image')]);

    const statusBadge = el('span', { class: `badge badge-${task.status}` }, [
      STATUS_LABELS[task.status],
    ]);
    const typ = task.typ ?? 'maengel';
    const typBadge = el('span', { class: `badge badge-typ badge-typ-${typ}` }, [
      TASK_TYP_LABELS[typ],
    ]);

    const info = el('div', { class: 'task-info' }, [
      el('div', { class: 'task-info-top' }, [
        el('span', { class: 'task-name' }, [task.name]),
        el('span', { class: 'task-badges' }, [typBadge, statusBadge]),
      ]),
      el('p', { class: 'task-desc-clamp' }, [task.description]),
      el('div', { class: 'task-meta' }, [
        task.art ? el('span', {}, [`🏷 ${task.art}`]) : el('span'),
        task.position ? el('span', {}, [`📍 ${task.position}`]) : el('span'),
        task.plannedWork ? el('span', {}, [`⏱ ${task.plannedWork}`]) : el('span'),
        el('span', {}, [`👤 ${task.personnel ?? 1} Pers.`]),
        task.material.length > 0
          ? el('span', {}, [`${task.material.length} Materialpositionen`])
          : el('span'),
      ]),
    ]);

    const row = el('div', { class: 'task-row', 'data-task-id': task.id }, [thumb, info]);

    if (selectionMode) {
      const check = el('input', {
        type: 'checkbox',
        class: 'row-check',
        'aria-label': 'Aufgabe auswählen',
      }) as HTMLInputElement;
      check.checked = selectedIds.has(task.id);
      check.addEventListener('click', (e) => e.stopPropagation());
      check.addEventListener('change', () => toggleSelection(task.id));
      row.prepend(check);
      row.classList.toggle('selected', check.checked);
    }

    if (opts.editMode) {
      row.appendChild(
        iconButton('copy', 'Aufgabe duplizieren', () => opts.onDuplicateTask(task.id)),
      );
      row.appendChild(
        iconButton('pencil', 'Aufgabe bearbeiten', () => opts.onEditTask(task.id)),
      );
    }

    row.addEventListener('click', () => {
      if (selectionMode) toggleSelection(task.id);
      else if (opts.editMode) opts.onEditTask(task.id);
      else opts.onOpenTask(task.id);
    });

    return row;
  }

  renderList();
}

function iconButton(iconName: string, title: string, onClick: () => void): HTMLElement {
  const btn = el('button', {
    class: 'icon-btn task-edit-btn',
    type: 'button',
    title,
    'aria-label': title,
  }, [icon(iconName)]);
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return btn;
}
