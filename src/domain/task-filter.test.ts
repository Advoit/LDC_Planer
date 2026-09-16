import { describe, it, expect } from 'vitest';
import { defaultTaskFilter, filterTasks } from './task-filter';
import type { Task } from './types';

const NOW = '2026-02-01T10:00:00.000Z';

function makeTask(extra: Partial<Task> = {}): Task {
  return {
    id: 'T1',
    projectId: 'P1',
    createdAt: NOW,
    updatedAt: NOW,
    name: 'Aufgabe',
    description: 'Beschreibung',
    images: [],
    thumbnail: null,
    thumbnailSourceId: null,
    material: [],
    plannedWork: '',
    personnel: 1,
    typ: 'maengel',
    art: '',
    pruefung: '',
    fehlerbeschreibung: '',
    position: '',
    documents: [],
    status: 'offen',
    editedBy: '',
    editedAt: '',
    hintText: '',
    afterImages: [],
    afterDocuments: [],
    ...extra,
  };
}

const tasks: Task[] = [
  makeTask({ id: 'A', name: 'Wand streichen', plannedWork: '02:00', art: 'A2', position: 'EG 10' }),
  makeTask({ id: 'B', name: 'Fenster tauschen', status: 'hinweis', plannedWork: '05:00', typ: 'umbau', position: 'EG 2' }),
  makeTask({ id: 'C', name: 'Decke prüfen', status: 'behoben', description: 'Riss in der Decke', position: 'OG 1' }),
];

describe('filterTasks', () => {
  it('blendet behobene Aufgaben im Standardfilter aus und sortiert nach Name', () => {
    const result = filterTasks(tasks, defaultTaskFilter());
    expect(result.map((t) => t.id)).toEqual(['B', 'A']); // Fenster … vor Wand …
  });

  it('filtert nach Status', () => {
    const result = filterTasks(tasks, {
      ...defaultTaskFilter(),
      statuses: new Set(['behoben']),
    });
    expect(result.map((t) => t.id)).toEqual(['C']);
  });

  it('filtert nach Typ', () => {
    const result = filterTasks(tasks, {
      ...defaultTaskFilter(),
      typs: new Set(['umbau']),
    });
    expect(result.map((t) => t.id)).toEqual(['B']);
  });

  it('sucht in Name und Beschreibung', () => {
    const filter = { ...defaultTaskFilter(), statuses: new Set<'offen' | 'hinweis' | 'behoben'>(['offen', 'hinweis', 'behoben']) };
    expect(filterTasks(tasks, { ...filter, query: 'fenster' }).map((t) => t.id)).toEqual(['B']);
    expect(filterTasks(tasks, { ...filter, query: 'riss' }).map((t) => t.id)).toEqual(['C']);
  });

  it('sortiert nach Name, Status, Zeitaufwand und Position', () => {
    const all = { ...defaultTaskFilter(), statuses: new Set<'offen' | 'hinweis' | 'behoben'>(['offen', 'hinweis', 'behoben']) };
    expect(filterTasks(tasks, { ...all, sort: 'name' }).map((t) => t.id)).toEqual(['C', 'B', 'A']);
    expect(filterTasks(tasks, { ...all, sort: 'status' }).map((t) => t.id)).toEqual(['A', 'B', 'C']);
    expect(filterTasks(tasks, { ...all, sort: 'time' }).map((t) => t.id)).toEqual(['A', 'B', 'C']);
    expect(filterTasks(tasks, { ...all, sort: 'position' }).map((t) => t.id)).toEqual(['B', 'A', 'C']);
    /* Aufgaben ohne Art stehen hinten */
    expect(filterTasks(tasks, { ...all, sort: 'art' }).map((t) => t.id)).toEqual(['A', 'C', 'B']);
  });
});
