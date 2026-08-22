import { describe, it, expect } from 'vitest';
import { mergeProjects, canMergeProjects } from './merge';
import type { Project, Task, TaskImage } from './types';

function makeProject(id = 'ABCD1234'): Project {
  return {
    schemaVersion: 1,
    id,
    name: 'Testprojekt',
    location: 'Berlin',
    description: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    tasks: [],
  };
}

function makeTask(id: string, name: string, extra: Partial<Task> = {}): Task {
  return {
    id,
    projectId: 'ABCD1234',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    name,
    description: 'Beschreibung ' + name,
    images: [],
    thumbnail: null,
    thumbnailSourceId: null,
    material: [],
    plannedWork: '',
    status: 'offen',
    editedBy: '',
    editedAt: '',
    hintText: '',
    afterImages: [],
    ...extra,
  };
}

function makeImage(id: string, hash: string): TaskImage {
  return { id, dataUrl: `data:image/png;base64,${id}`, hash };
}

describe('canMergeProjects', () => {
  it('erlaubt Merge nur bei identischer Projekt-ID', () => {
    expect(canMergeProjects(makeProject('AAAA1111'), makeProject('AAAA1111'))).toBe(true);
    expect(canMergeProjects(makeProject('AAAA1111'), makeProject('BBBB2222'))).toBe(false);
    expect(canMergeProjects(null, makeProject())).toBe(false);
  });
});

describe('mergeProjects', () => {
  it('behält identische Tasks ohne Konflikt (lokal) und führt Bilder zusammen', async () => {
    const local = makeProject('AAAA1111');
    local.tasks = [makeTask('T1', 'Gleich', { images: [makeImage('img1', 'hash-a')] })];
    const imported = makeProject('AAAA1111');
    imported.tasks = [
      makeTask('T1', 'Gleich', { images: [makeImage('img1', 'hash-a'), makeImage('img2', 'hash-b')] }),
    ];

    const conflicts: string[] = [];
    const result = await mergeProjects(local, imported, (c) => {
      conflicts.push(c.local.name);
      return 'local';
    });

    expect(conflicts).toEqual([]);
    expect(result.merged.tasks).toHaveLength(1);
    expect(result.merged.tasks[0].images.map((i) => i.hash)).toEqual(['hash-a', 'hash-b']);
  });

  it('ruft bei inhaltlichem Konflikt die resolve-Funktion pro Task auf', async () => {
    const local = makeProject('AAAA1111');
    local.tasks = [makeTask('T1', 'Alt', { description: 'lokal' })];
    const imported = makeProject('AAAA1111');
    imported.tasks = [makeTask('T1', 'Alt', { description: 'importiert' })];

    const choices: string[] = [];
    const result = await mergeProjects(local, imported, (c) => {
      choices.push(c.local.description);
      return 'imported';
    });

    expect(choices).toEqual(['lokal']);
    expect(result.conflicts).toBe(1);
    expect(result.merged.tasks[0].description).toBe('importiert');
  });

  it('hängt bei „Lokal behalten“ importierte Bilder mit anderem Hash an', async () => {
    const local = makeProject('AAAA1111');
    local.tasks = [makeTask('T1', 'X', { images: [makeImage('l1', 'hash-l')] })];
    const imported = makeProject('AAAA1111');
    imported.tasks = [makeTask('T1', 'Y', { images: [makeImage('i1', 'hash-i'), makeImage('i2', 'hash-l')] })];

    const result = await mergeProjects(local, imported, () => 'local');
    expect(result.merged.tasks[0].images.map((i) => i.hash)).toEqual(['hash-l', 'hash-i']);
  });

  it('übernimmt bei „Importiertes übernehmen“ Inhalte und hängt lokale Bilder an', async () => {
    const local = makeProject('AAAA1111');
    local.tasks = [makeTask('T1', 'X', { images: [makeImage('l1', 'hash-l')] })];
    const imported = makeProject('AAAA1111');
    imported.tasks = [makeTask('T1', 'Y', { images: [makeImage('i1', 'hash-i')] })];

    const result = await mergeProjects(local, imported, () => 'imported');
    expect(result.merged.tasks[0].name).toBe('Y');
    expect(result.merged.tasks[0].images.map((i) => i.hash)).toEqual(['hash-i', 'hash-l']);
  });

  it('fügt nur im Import vorhandene Tasks hinzu und behält nur lokale', async () => {
    const local = makeProject('AAAA1111');
    local.tasks = [makeTask('T-L', 'Nur lokal')];
    const imported = makeProject('AAAA1111');
    imported.tasks = [makeTask('T-I', 'Nur importiert')];

    const result = await mergeProjects(local, imported, () => 'local');
    const names = result.merged.tasks.map((t) => t.id).sort();
    expect(names).toEqual(['T-I', 'T-L']);
    expect(result.added).toBe(1);
  });
});