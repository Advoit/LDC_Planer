/* ── Aufgaben-Übersicht: Suche, Filter, Sortierung, Liste ── */

import { el, icon, clear } from './dom';
import { STATUS_LABELS } from '../domain/types';
import type { Project, Task, TaskStatus } from '../domain/types';
import { plannedWorkToMinutes } from '../domain/task';

export interface TaskListOptions {
  project: Project;
  editMode: boolean;
  onOpenTask: (taskId: string) => void;
  onEditTask: (taskId: string) => void;
}

type SortKey = 'name' | 'status' | 'time';

const STATUS_ORDER: Record<TaskStatus, number> = {
  offen: 0,
  hinweis: 1,
  behoben: 2,
};

export function renderTaskList(container: HTMLElement, opts: TaskListOptions): void {
  clear(container);

  const state: { query: string; filters: Set<TaskStatus>; sort: SortKey } = {
    query: '',
    filters: new Set<TaskStatus>(['offen', 'hinweis']),
    sort: 'name',
  };

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
    chips.set(def.status, chip);
    filterRow.appendChild(chip);
  }
  chips.get('offen')!.classList.add('active');
  chips.get('hinweis')!.classList.add('active');

  const sortSelect = el('select', { class: 'input sort-select' }) as HTMLSelectElement;
  const sortOptions: { value: SortKey; label: string }[] = [
    { value: 'name', label: 'Name' },
    { value: 'status', label: 'Status' },
    { value: 'time', label: 'Zeitaufwand' },
  ];
  for (const o of sortOptions) {
    sortSelect.appendChild(el('option', { value: o.value }, [o.label]));
  }
  sortSelect.addEventListener('change', () => {
    state.sort = sortSelect.value as SortKey;
    renderList();
  });

  panel.appendChild(searchInput);
  panel.appendChild(el('div', { class: 'filter-sort-row' }, [filterRow, sortSelect]));
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

      const info = el('div', { class: 'task-info' }, [
        el('div', { class: 'task-info-top' }, [
          el('span', { class: 'task-name' }, [task.name]),
          statusBadge,
        ]),
        el('p', { class: 'task-desc-clamp' }, [task.description]),
        el('div', { class: 'task-meta' }, [
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