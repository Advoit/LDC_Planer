/* ── Aufgaben-Filter & Sortierung (reine Logik, testbar) ── */

import { TASK_TYPS } from './types';
import type { Task, TaskStatus, TaskTyp } from './types';
import { plannedWorkToMinutes } from './task';
import { compareArt, comparePositions } from './sort';

export type TaskSortKey = 'name' | 'status' | 'time' | 'art' | 'position';

export interface TaskFilter {
  query: string;
  statuses: Set<TaskStatus>;
  typs: Set<TaskTyp>;
  sort: TaskSortKey;
}

const STATUS_ORDER: Record<TaskStatus, number> = {
  offen: 0,
  hinweis: 1,
  behoben: 2,
};

/** Standardfilter der Übersicht: offene + Hinweis-Aufgaben, sortiert nach Name. */
export function defaultTaskFilter(): TaskFilter {
  return {
    query: '',
    statuses: new Set<TaskStatus>(['offen', 'hinweis']),
    typs: new Set<TaskTyp>(TASK_TYPS),
    sort: 'name',
  };
}

/** Wendet Suche, Status-/Typ-Filter und Sortierung auf die Aufgaben an. */
export function filterTasks(tasks: Task[], filter: TaskFilter): Task[] {
  let result = tasks;

  if (filter.statuses.size > 0) {
    result = result.filter((t) => filter.statuses.has(t.status));
  }
  if (filter.typs.size > 0) {
    result = result.filter((t) => filter.typs.has(t.typ ?? 'maengel'));
  }

  const query = filter.query.trim().toLowerCase();
  if (query) {
    result = result.filter(
      (t) =>
        t.name.toLowerCase().includes(query) ||
        t.description.toLowerCase().includes(query),
    );
  }

  switch (filter.sort) {
    case 'name':
      return [...result].sort((a, b) => a.name.localeCompare(b.name, 'de'));
    case 'status':
      return [...result].sort(
        (a, b) =>
          STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
          a.name.localeCompare(b.name, 'de'),
      );
    case 'time':
      return [...result].sort(
        (a, b) =>
          plannedWorkToMinutes(a.plannedWork) - plannedWorkToMinutes(b.plannedWork),
      );
    case 'art':
      return [...result].sort(
        (a, b) =>
          compareArt(a.art ?? '', b.art ?? '') ||
          a.name.localeCompare(b.name, 'de'),
      );
    case 'position':
      return [...result].sort(
        (a, b) =>
          comparePositions(a.position ?? '', b.position ?? '') ||
          a.name.localeCompare(b.name, 'de'),
      );
    default:
      return [...result];
  }
}
