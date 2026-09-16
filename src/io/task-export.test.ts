import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { buildTaskPdf, taskReportFileName } from './task-export';
import type { Project, Task } from '../domain/types';

const NOW = '2026-02-01T10:00:00.000Z';

function makeProject(): { project: Project; task: Task } {
  const task: Task = {
    id: 'T1',
    projectId: 'PROJ1234',
    createdAt: NOW,
    updatedAt: NOW,
    name: 'Wand streichen',
    description: 'Innenwand neu streichen',
    images: [],
    thumbnail: null,
    thumbnailSourceId: null,
    material: [{ id: 'M1', name: 'Farbe', quantity: 2.5, unit: 'Eigen' }],
    plannedWork: '02:30',
    personnel: 2,
    typ: 'maengel',
    art: 'B2',
    pruefung: 'Sichtprüfung',
    fehlerbeschreibung: 'Farbe blättert ab',
    position: 'EG 3',
    documents: [],
    afterDocuments: [],
    status: 'hinweis',
    editedBy: 'Max',
    editedAt: '2026-02-02',
    hintText: 'Farbe angetrocknet',
    afterImages: [],
  };
  return {
    project: {
      schemaVersion: 1,
      id: 'PROJ1234',
      name: 'Sanierung Altbau',
      location: 'München',
      description: '',
      createdAt: NOW,
      updatedAt: NOW,
      documents: [],
      tasks: [task],
    },
    task,
  };
}

describe('buildTaskPdf', () => {
  it('erzeugt ein gültiges einseitiges Aufgaben-PDF', async () => {
    const { project, task } = makeProject();
    const bytes = await buildTaskPdf(project, task);

    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('%PDF');
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
  });

  it('erzeugt einen sprechenden Dateinamen', () => {
    const { project, task } = makeProject();
    expect(taskReportFileName(project, task)).toBe(
      'LDC-Sanierung-Altbau-PROJ1234-Wand-streichen.pdf',
    );
  });
});
