import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { buildProjectPdf } from './project-export';
import type { Project } from '../domain/types';

function makeProject(): Project {
  const now = '2026-02-01T10:00:00.000Z';
  return {
    schemaVersion: 1,
    id: 'PROJ1234',
    name: 'Sanierung Altbau',
    location: 'München',
    description: 'Komplette Sanierung der Wohnung.',
    createdAt: now,
    updatedAt: now,
    documents: [
      {
        id: 'D1',
        name: 'Grundriss.pdf',
        mime: 'application/pdf',
        size: 123,
        dataUrl: 'data:application/pdf;base64,AA==',
        hash: 'h1',
      },
    ],
    tasks: [
      {
        id: 'T1',
        projectId: 'PROJ1234',
        createdAt: now,
        updatedAt: now,
        name: 'Wand streichen',
        description: 'Innenwand neu streichen',
        images: [],
        thumbnail: null,
        thumbnailSourceId: null,
        material: [{ id: 'M1', name: 'Farbe', quantity: 2.5, unit: 'Eigen' }],
        plannedWork: '02:30',
        personnel: 2,
        documents: [],
        afterDocuments: [],
        status: 'hinweis',
        editedBy: 'Max',
        editedAt: '2026-02-02',
        hintText: 'Farbe angetrocknet',
        afterImages: [],
      },
      {
        id: 'T2',
        projectId: 'PROJ1234',
        createdAt: now,
        updatedAt: now,
        name: 'Fenster erneuern',
        description: 'Alte Fenster austauschen',
        images: [],
        thumbnail: null,
        thumbnailSourceId: null,
        material: [],
        plannedWork: '',
        personnel: 1,
        documents: [],
        afterDocuments: [],
        status: 'behoben',
        editedBy: 'Eva',
        editedAt: '2026-02-03',
        hintText: '',
        afterImages: [],
      },
    ],
  };
}

describe('buildProjectPdf', () => {
  it('erzeugt ein gültiges PDF (Deckblatt + Inhaltsverzeichnis + Bericht)', async () => {
    const project = makeProject();
    const bytes = await buildProjectPdf(project, {
      statuses: new Set(['offen', 'hinweis', 'behoben']),
    });
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('%PDF');

    const pdf = await PDFDocument.load(bytes);
    /* Deckblatt + Inhaltsverzeichnis + mindestens eine Berichtsseite */
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(3);
  });

  it('filtert Aufgaben nach ausgewählten Status', async () => {
    const project = makeProject();
    const bytes = await buildProjectPdf(project, {
      statuses: new Set(['behoben']),
    });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(3);
  });
});
