import { describe, it, expect } from 'vitest';
import { migrateProject, CURRENT_SCHEMA_VERSION } from './migrate';

describe('migrateProject', () => {
  it('normalisiert unvollständige Daten (abwärtskompatibel)', () => {
    const raw = {
      id: 'ABCD1234',
      name: 'Alt',
      location: 'Köln',
      description: '',
      tasks: [
        { id: 'T1', name: 'Task', description: 'd' },
        { id: 'T2', name: 'Task 2', description: 'd', status: 'hinweis' },
      ],
    };
    const project = migrateProject(raw);

    expect(project.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(project.id).toBe('ABCD1234');
    expect(project.tasks).toHaveLength(2);
    expect(project.tasks[0].status).toBe('offen');
    expect(project.tasks[0].images).toEqual([]);
    expect(project.tasks[0].afterImages).toEqual([]);
    expect(project.tasks[0].material).toEqual([]);
    expect(project.tasks[1].status).toBe('hinweis');
  });

  it('wirft bei unbekannter zukünftiger Version einen Fehler', () => {
    expect(() => migrateProject({ schemaVersion: 99, tasks: [] })).toThrow();
  });

  it('liefert null-Input als leeres Projekt', () => {
    const project = migrateProject(null);
    expect(project.id).toBe('');
    expect(project.tasks).toEqual([]);
  });
});