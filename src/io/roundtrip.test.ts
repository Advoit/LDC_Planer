import { describe, it, expect } from 'vitest';
import { buildProjectZip } from './export';
import { parseProjectZip } from './import';
import { hashDataUrl } from '../core/hash';
import type { Project, Task } from '../domain/types';

function tinyPngDataUrl(): string {
  /* 1×1 rotes PNG */
  return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
}

async function makeProject(): Promise<Project> {
  const png = tinyPngDataUrl();
  const hash = await hashDataUrl(png);
  const task: Task = {
    id: 'TASK1234',
    projectId: 'PROJ5678',
    createdAt: '2026-02-01T10:00:00.000Z',
    updatedAt: '2026-02-01T10:00:00.000Z',
    name: 'Wand streichen',
    description: 'Innenwand neu streichen',
    images: [{ id: 'IMG-1', dataUrl: png, hash }],
    thumbnail: png,
    thumbnailSourceId: 'IMG-1',
    material: [
      { id: 'M1', name: 'Farbe', quantity: 2.5, unit: 'Eigen' },
      { id: 'M2', name: 'Pinsel', quantity: 2, unit: 'Stück' },
    ],
    plannedWork: '02:30',
    status: 'hinweis',
    editedBy: 'Max',
    editedAt: '2026-02-02',
    hintText: 'Farbe angetrocknet',
    afterImages: [{ id: 'IMG-2', dataUrl: png, hash }],
    afterDocuments: [
      {
        id: 'ADOC-1',
        name: 'Abnahmebericht.txt',
        mime: 'text/plain',
        size: 42,
        dataUrl: 'data:text/plain;base64,SGFsbG8h',
        hash: 'adoc-hash-1',
      },
    ],
    documents: [
      {
        id: 'DOC-1',
        name: 'Bauplan.pdf',
        mime: 'application/pdf',
        size: 1234,
        dataUrl: 'data:application/pdf;base64,JVBERi0xLjQ=',
        hash: 'doc-hash-1',
      },
    ],
  };
  return {
    schemaVersion: 1,
    id: 'PROJ5678',
    name: 'Bauprojekt',
    location: 'München',
    description: 'Sanierung',
    createdAt: '2026-02-01T09:00:00.000Z',
    updatedAt: '2026-02-01T10:00:00.000Z',
    tasks: [task],
    documents: [
      {
        id: 'PDOC-1',
        name: 'Genehmigung.pdf',
        mime: 'application/pdf',
        size: 2048,
        dataUrl: 'data:application/pdf;base64,JVBERi0xLjU=',
        hash: 'pdoc-hash-1',
      },
    ],
  };
}

describe('Export/Import-Roundtrip', () => {
  it('übersteht einen kompletten ZIP-Zyklus', async () => {
    const project = await makeProject();
    const blob = buildProjectZip(project);
    const buffer = await blob.arrayBuffer();

    const imported = await parseProjectZip(buffer);
    expect(imported).not.toBeNull();

    expect(imported!.id).toBe('PROJ5678');
    expect(imported!.name).toBe('Bauprojekt');
    expect(imported!.tasks).toHaveLength(1);

    const t = imported!.tasks[0];
    expect(t.name).toBe('Wand streichen');
    expect(t.status).toBe('hinweis');
    expect(t.hintText).toBe('Farbe angetrocknet');
    expect(t.images).toHaveLength(1);
    expect(t.afterImages).toHaveLength(1);
    expect(t.images[0].hash).toBe(project.tasks[0].images[0].hash);
    expect(t.images[0].dataUrl.startsWith('data:image/png')).toBe(true);
    expect(t.material).toHaveLength(2);
    expect(t.plannedWork).toBe('02:30');
    /* Dokumente */
    expect(t.documents).toHaveLength(1);
    expect(t.documents[0].name).toBe('Bauplan.pdf');
    expect(t.documents[0].mime).toBe('application/pdf');
    expect(t.documents[0].dataUrl.startsWith('data:application/pdf')).toBe(true);
    /* Nachher-Dokumente */
    expect(t.afterDocuments).toHaveLength(1);
    expect(t.afterDocuments[0].name).toBe('Abnahmebericht.txt');
    expect(t.afterDocuments[0].dataUrl.startsWith('data:text/plain')).toBe(true);
    expect(imported!.documents).toHaveLength(1);
    expect(imported!.documents[0].name).toBe('Genehmigung.pdf');
  });

  it('liefert null bei ungültigen Daten', async () => {
    const junk = new TextEncoder().encode('kein zip').buffer;
    expect(await parseProjectZip(junk)).toBeNull();
  });
});