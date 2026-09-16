import { describe, it, expect } from 'vitest';
import { buildMaterialCsv, materialCsvFileName, sumMaterialByTask } from './material-csv';
import type { Project, Task, TaskStatus } from '../domain/types';

const NOW = '2026-02-01T10:00:00.000Z';

function makeTask(
  id: string,
  name: string,
  material: { name: string; quantity: number; unit: string }[],
  status: TaskStatus = 'offen',
): Task {
  return {
    id,
    projectId: 'PROJ1234',
    createdAt: NOW,
    updatedAt: NOW,
    name,
    description: `Beschreibung ${name}`,
    images: [],
    thumbnail: null,
    thumbnailSourceId: null,
    material: material.map((m, i) => ({ id: `${id}-M${i}`, ...m })),
    plannedWork: '',
    personnel: 1,
    typ: 'maengel',
    art: '',
    pruefung: '',
    fehlerbeschreibung: '',
    position: '',
    documents: [],
    afterDocuments: [],
    status,
    editedBy: '',
    editedAt: '',
    hintText: '',
    afterImages: [],
  };
}

function makeProject(): Project {
  return {
    schemaVersion: 1,
    id: 'PROJ1234',
    name: 'Sanierung',
    location: 'München',
    description: '',
    createdAt: NOW,
    updatedAt: NOW,
    documents: [],
    tasks: [
      makeTask('T1', 'Wand streichen', [
        { name: 'Farbe', quantity: 2.5, unit: 'Eigen' },
        { name: 'Pinsel', quantity: 2, unit: 'Stück' },
      ]),
      makeTask('T2', 'Wand streichen 2', [
        { name: 'Farbe', quantity: 1.5, unit: 'Eigen' },
      ]),
      makeTask('T3', 'Fertig', [{ name: 'Spachtel', quantity: 1, unit: 'Stück' }], 'behoben'),
    ],
  };
}

describe('buildMaterialCsv', () => {
  it('listet Material je Aufgabe auf und lässt behobene Aufgaben weg', () => {
    const csv = buildMaterialCsv(makeProject(), {
      mode: 'tasks',
      includeCompleted: false,
    });
    const lines = csv.split('\r\n');
    expect(lines).toContain('Aufgabe;Wand streichen');
    expect(lines).toContain('Farbe;2,5;Eigen');
    expect(csv).not.toContain('Spachtel');
  });

  it('bezieht behobene Aufgaben auf Wunsch ein', () => {
    const csv = buildMaterialCsv(makeProject(), {
      mode: 'tasks',
      includeCompleted: true,
    });
    expect(csv).toContain('Spachtel');
  });

  it('summiert im Projektmodus nach Name und Einheit', () => {
    const csv = buildMaterialCsv(makeProject(), {
      mode: 'project',
      includeCompleted: true,
    });
    expect(csv).toContain('Projekt;Sanierung');
    expect(csv).toContain('Farbe;4;Eigen');
    expect(csv).toContain('Pinsel;2;Stück');
  });

  it('maskiert Semikolons und Anführungszeichen', () => {
    const project = makeProject();
    project.tasks[0].material[0].name = 'Farbe "Seidenmatt"; weiß';
    const csv = buildMaterialCsv(project, { mode: 'tasks', includeCompleted: false });
    expect(csv).toContain('"Farbe ""Seidenmatt""; weiß";2,5;Eigen');
  });

  it('summiert Material über Aufgaben hinweg', () => {
    const summed = sumMaterialByTask(makeProject().tasks);
    expect(summed.find((s) => s.name === 'Farbe')?.quantity).toBe(4);
  });

  it('erzeugt einen sprechenden Dateinamen', () => {
    expect(materialCsvFileName(makeProject())).toBe(
      'LDC-Sanierung-PROJ1234-Materialliste.csv',
    );
  });
});
