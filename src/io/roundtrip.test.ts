import { describe, it, expect } from 'vitest';
import { buildLdcproj } from './export';
import { parseLdcproj } from './import';
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
  };
}

describe('Export/Import-Roundtrip', () => {
  it('übersteht einen kompletten .ldcproj-Zyklus', async () => {
    const project = await makeProject();
    const blob = buildLdcproj(project);
    const buffer = await blob.arrayBuffer();

    const imported = await parseLdcproj(buffer);
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
  });

  it('liefert null bei ungültigen Daten', async () => {
    const junk = new TextEncoder().encode('kein zip').buffer;
    expect(await parseLdcproj(junk)).toBeNull();
  });
});