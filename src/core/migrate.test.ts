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
    expect(project.tasks[0].documents).toEqual([]);
    /* Personalbedarf fehlt in alten Daten → Standard 1 */
    expect(project.tasks[0].personnel).toBe(1);
    /* Mängel-/Umbau-Felder: alte Aufgaben gelten als Mängel, Rest leer */
    expect(project.tasks[0].typ).toBe('maengel');
    expect(project.tasks[0].art).toBe('');
    expect(project.tasks[0].pruefung).toBe('');
    expect(project.tasks[0].fehlerbeschreibung).toBe('');
    expect(project.tasks[0].position).toBe('');
    expect(project.documents).toEqual([]);
    expect(project.tasks[1].status).toBe('hinweis');
  });

  it('übernimmt Deckblatt-Einstellungen und lässt alte Daten ohne sie durchlaufen', () => {
    const cover = {
      kennung: 'OBJ-1',
      saal: 'Saal 2',
      strasse: 'Musterstr. 3',
      plzOrt: '12345 Stadt',
      efkName: 'E. F. K.',
      termin: '2026-09-01',
    };
    expect(migrateProject({ id: 'X', reportCover: cover }).reportCover).toEqual(cover);
    /* Ohne Feld (alte Daten) bleibt reportCover undefiniert */
    expect(migrateProject({ id: 'Y' }).reportCover).toBeUndefined();
    /* Ungültige Daten werden verworfen */
    expect(migrateProject({ id: 'Z', reportCover: { kennung: 5 } }).reportCover).toBeUndefined();
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