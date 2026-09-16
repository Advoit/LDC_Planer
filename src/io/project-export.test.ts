import { describe, it, expect } from 'vitest';
import { PDFArray, PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { buildProjectPdf } from './project-export';
import { TASK_STATUSES } from '../domain/types';
import type { Project, Task, TaskStatus } from '../domain/types';

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
        typ: 'umbau',
        art: '',
        pruefung: '',
        fehlerbeschreibung: '',
        position: '',
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

const NOW = '2026-02-01T10:00:00.000Z';

function makeTask(id: string, index: number, status: TaskStatus): Task {
  return {
    id,
    projectId: 'PROJ1234',
    createdAt: NOW,
    updatedAt: NOW,
    name: `Aufgabe ${index}`,
    description: `Beschreibung ${index}`,
    images: [],
    thumbnail: null,
    thumbnailSourceId: null,
    material: [],
    plannedWork: '',
    personnel: 1,
    typ: 'maengel',
    art: 'A1',
    pruefung: '',
    fehlerbeschreibung: '',
    position: `P${index}`,
    documents: [],
    afterDocuments: [],
    status,
    editedBy: '',
    editedAt: '',
    hintText: '',
    afterImages: [],
  };
}

/** Projekt mit beliebig vielen Aufgaben (Status rotiert, sofern nicht vorgegeben). */
function makeManyTaskProject(count: number, statuses?: TaskStatus[]): Project {
  const base = makeProject();
  const tasks = Array.from({ length: count }, (_, i) =>
    makeTask(`T${i + 1}`, i + 1, statuses?.[i % statuses.length] ?? 'offen'),
  );
  return { ...base, tasks };
}

function annotCount(pdf: PDFDocument, pageIndex: number): number {
  return pdf.getPage(pageIndex).node.Annots()?.size() ?? 0;
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

  it('gibt jeder Aufgabe und jeder Statusgruppe eine eigene Seite', async () => {
    /* Drei Aufgaben mit gleichem Status → Gruppen-Seite + 2 weitere Aufgabenseiten */
    const project = makeManyTaskProject(3, ['offen']);
    const bytes = await buildProjectPdf(project, {
      statuses: new Set(TASK_STATUSES),
    });
    const pdf = await PDFDocument.load(bytes);

    /* Deckblatt (1) + Inhaltsverzeichnis (1) + Inhaltsseite (1)
       + Gruppen-Seite „Offen“ (1) + 2 Aufgabenseiten (2) = 6 */
    expect(pdf.getPageCount()).toBe(6);
  });

  it('fügt ein mehrseitiges Inhaltsverzeichnis hinter das Deckblatt ein (nicht ans Ende)', async () => {
    const project = makeManyTaskProject(40, ['offen', 'hinweis', 'behoben']);
    const bytes = await buildProjectPdf(project, {
      statuses: new Set(TASK_STATUSES),
    });
    const pdf = await PDFDocument.load(bytes);

    /* Deckblatt ohne Einträge, danach mehrere Verzeichnis-Seiten mit Links */
    expect(annotCount(pdf, 0)).toBe(0);
    expect(annotCount(pdf, 1)).toBeGreaterThan(0);
    expect(annotCount(pdf, 2)).toBeGreaterThan(0);

    /* Inhalt beginnt anschließend ohne Verzeichnis-Einträge … */
    expect(annotCount(pdf, 3)).toBe(0);
    /* … und die letzte Seite ist eine Aufgabenseite (kein angehängtes Verzeichnis). */
    expect(annotCount(pdf, pdf.getPageCount() - 1)).toBe(0);
  });

  it('verlinkt die Einträge des Inhaltsverzeichnisses mit der Zielseite', async () => {
    const project = makeManyTaskProject(3, ['offen', 'hinweis', 'behoben']);
    const bytes = await buildProjectPdf(project, {
      statuses: new Set(TASK_STATUSES),
    });
    const pdf = await PDFDocument.load(bytes);

    const annots = pdf.getPage(1).node.Annots();
    expect(annots).toBeDefined();

    const annot = annots!.lookup(0, PDFDict);
    expect(annot.get(PDFName.of('Subtype'))?.toString()).toBe('/Link');

    const dest = annot.lookup(PDFName.of('Dest'), PDFArray);
    const target = dest.get(0).toString();
    expect(pdf.getPages().map((p) => p.ref.toString())).toContain(target);
  });
});
