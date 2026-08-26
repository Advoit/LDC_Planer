/* ── Aufgaben-Übersicht: Suche, Filter, Sortierung, Liste ── */

import { el, icon, clear } from './dom';
import { STATUS_LABELS, TASK_TYPS, TASK_TYP_LABELS } from '../domain/types';
import type { Project, Task, TaskStatus, TaskTyp } from '../domain/types';
import { plannedWorkToMinutes } from '../domain/task';
import { compareArt, comparePositions } from '../domain/sort';

export interface TaskListOptions {
  project: Project;
  editMode: boolean;
  onOpenTask: (taskId: string) => void;
  onEditTask: (taskId: string) => void;
}

type SortKey = 'name' | 'status' | 'time' | 'art' | 'position';

interface TaskListState {
  query: string;
  filters: Set<TaskStatus>;
  typFilters: Set<TaskTyp>;
  sort: SortKey;
}

function createDefaultTaskListState(): TaskListState {
  return {
    query: '',
    filters: new Set<TaskStatus>(['offen', 'hinweis']),
    /* Standard: beide Typen eingeblendet */
    typFilters: new Set<TaskTyp>(TASK_TYPS),
    sort: 'name',
  };
}

let taskListProjectId: string | null = null;
let taskListState = createDefaultTaskListState();

const STATUS_ORDER: Record<TaskStatus, number> = {
  offen: 0,
  hinweis: 1,
  behoben: 2,
};

export function renderTaskList(container: HTMLElement, opts: TaskListOptions): void {
  clear(container);

  /*
   * Das App-Shell rendert die Übersicht nach jeder Änderung komplett neu.
   * Der Zustand bleibt deshalb außerhalb dieser Funktion erhalten, solange
   * weiterhin dasselbe Projekt geöffnet ist.
   */
  if (taskListProjectId !== opts.project.id) {
    taskListProjectId = opts.project.id;
    taskListState = createDefaultTaskListState();
  }
  const state = taskListState;

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
  searchInput.value = state.query;
  searchInput.addEventListener('input', () => {
    state.query = searchInput.value;
    renderList();
  });

  const filterRow = el('div', { class: 'filter-row' });
  const chipDefs: { status: TaskStatus; label: string }[] = [
    { status: 'offen', label: 'Offen' },
    { status: 'hinweis', label: 'Hinweis' },
    { status: 'behoben', label: 'Behoben' },
  ];
  const chips = new Map<TaskStatus, HTMLButtonElement>();
  for (const def of chipDefs) {
    const chip = el('button', { class: 'chip', type: 'button' }, [def.label]) as HTMLButtonElement;
    chip.addEventListener('click', () => {
      if (state.filters.has(def.status)) {
        state.filters.delete(def.status);
      } else {
        state.filters.add(def.status);
      }
      chip.classList.toggle('active', state.filters.has(def.status));
      renderList();
    });
    chip.classList.toggle('active', state.filters.has(def.status));
    chips.set(def.status, chip);
    filterRow.appendChild(chip);
  }

  /* Typ-Filter: Mängel / Umbau/Neuinstallation (Standard: beide eingeblendet) */
  const typRow = el('div', { class: 'filter-row' });
  typRow.appendChild(el('span', { class: 'filter-label' }, ['Typ:']));
  const typChips = new Map<TaskTyp, HTMLButtonElement>();
  for (const typ of TASK_TYPS) {
    const chip = el('button', { class: 'chip', type: 'button' }, [
      TASK_TYP_LABELS[typ],
    ]) as HTMLButtonElement;
    chip.addEventListener('click', () => {
      if (state.typFilters.has(typ)) state.typFilters.delete(typ);
      else state.typFilters.add(typ);
      chip.classList.toggle('active', state.typFilters.has(typ));
      renderList();
    });
    chip.classList.toggle('active', state.typFilters.has(typ));
    typChips.set(typ, chip);
    typRow.appendChild(chip);
  }

  const sortSelect = el('select', { class: 'input sort-select' }) as HTMLSelectElement;
  const sortOptions: { value: SortKey; label: string }[] = [
    { value: 'name', label: 'Name' },
    { value: 'status', label: 'Status' },
    { value: 'time', label: 'Zeitaufwand' },
    { value: 'art', label: 'Art' },
    { value: 'position', label: 'Position' },
  ];
  for (const o of sortOptions) {
    sortSelect.appendChild(el('option', { value: o.value }, [o.label]));
  }
  sortSelect.value = state.sort;
  sortSelect.addEventListener('change', () => {
    state.sort = sortSelect.value as SortKey;
    renderList();
  });

  panel.appendChild(searchInput);
  panel.appendChild(el('div', { class: 'filter-sort-row' }, [filterRow, sortSelect]));
  panel.appendChild(typRow);

  controls.appendChild(panel);

  container.appendChild(controls);

  /* ── Ergebnisliste ── */
  const listEl = el('div', { class: 'task-list' });
  container.appendChild(listEl);

  function filteredTasks(): Task[] {
    let tasks = opts.project.tasks;
    if (state.filters.size > 0) {
      tasks = tasks.filter((t) => state.filters.has(t.status));
    }
    if (state.typFilters.size > 0) {
      tasks = tasks.filter((t) => state.typFilters.has(t.typ ?? 'maengel'));
    }
    const q = state.query.trim().toLowerCase();
    if (q) {
      tasks = tasks.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q),
      );
    }
    switch (state.sort) {
      case 'name':
        tasks = [...tasks].sort((a, b) => a.name.localeCompare(b.name, 'de'));
        break;
      case 'status':
        tasks = [...tasks].sort(
          (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name, 'de'),
        );
        break;
      case 'time':
        tasks = [...tasks].sort(
          (a, b) => plannedWorkToMinutes(a.plannedWork) - plannedWorkToMinutes(b.plannedWork),
        );
        break;
      case 'art':
        tasks = [...tasks].sort(
          (a, b) =>
            compareArt(a.art ?? '', b.art ?? '') ||
            a.name.localeCompare(b.name, 'de'),
        );
        break;
      case 'position':
        tasks = [...tasks].sort(
          (a, b) =>
            comparePositions(a.position ?? '', b.position ?? '') ||
            a.name.localeCompare(b.name, 'de'),
        );
        break;
    }
    return tasks;
  }

  function renderList(): void {
    clear(listEl);
    const tasks = filteredTasks();

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

    for (const task of tasks) {
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

      if (opts.editMode) {
        const editBtn = el('button', {
          class: 'icon-btn task-edit-btn',
          type: 'button',
          title: 'Aufgabe bearbeiten',
          'aria-label': 'Aufgabe bearbeiten',
        }, [icon('pencil')]);
        editBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          opts.onEditTask(task.id);
        });
        row.appendChild(editBtn);
      }

      row.addEventListener('click', () => {
        if (opts.editMode) opts.onEditTask(task.id);
        else opts.onOpenTask(task.id);
      });

      listEl.appendChild(row);
    }
  }

  renderList();
}