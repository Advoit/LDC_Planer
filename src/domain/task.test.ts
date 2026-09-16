import { describe, it, expect } from 'vitest';
import {
  validateStatusFields,
  applyStatusFields,
  duplicateTask,
  applyBulkStatus,
} from './task';
import type { StatusFields } from './task';
import type { Task } from './types';

function makeTask(extra: Partial<Task> = {}): Task {
  return {
    id: 'T1',
    projectId: 'P1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
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

function makeFields(extra: Partial<StatusFields> = {}): StatusFields {
  return {
    status: 'behoben',
    editedBy: 'Max',
    editedAt: '2026-08-24',
    hintText: 'Riss abdichten',
    afterImages: [],
    afterDocuments: [],
    ...extra,
  };
}

describe('validateStatusFields', () => {
  it('erlaubt „Offen“ ohne Status-Felder', () => {
    expect(
      validateStatusFields(
        makeFields({ status: 'offen', editedBy: '', editedAt: '', hintText: '' }),
      ),
    ).toBeNull();
  });

  it('verlangt „Bearbeitet von“ und „Bearbeitet am“ ab Status „Hinweis“', () => {
    expect(validateStatusFields(makeFields({ status: 'hinweis', editedBy: '' }))).toContain(
      'Bearbeitet von',
    );
    expect(validateStatusFields(makeFields({ status: 'hinweis', editedAt: '' }))).toContain(
      'Bearbeitet am',
    );
  });

  it('verlangt den Hinweistext beim Status „Hinweis“', () => {
    expect(
      validateStatusFields(makeFields({ status: 'hinweis', hintText: '' })),
    ).toContain('Hinweistext');
  });

  it('verlangt den Hinweistext bei „Behoben“ nur für Mängel-Aufgaben', () => {
    expect(validateStatusFields(makeFields({ hintText: '' }), 'maengel')).toContain(
      'Hinweistext',
    );
    expect(validateStatusFields(makeFields({ hintText: '' }), 'umbau')).toBeNull();
    /* Ohne Typ (alte Daten) gilt der Hinweistext weiterhin nicht als Pflicht */
    expect(validateStatusFields(makeFields({ hintText: '' }), undefined)).toBeNull();
  });

  it('akzeptiert „Behoben“ mit Hinweistext bei Mängel-Aufgaben', () => {
    expect(validateStatusFields(makeFields(), 'maengel')).toBeNull();
    expect(validateStatusFields(makeFields(), 'umbau')).toBeNull();
  });
});

describe('applyStatusFields', () => {
  it('übernimmt die Status-Felder (getrimmt) und aktualisiert updatedAt', () => {
    const task = makeTask();
    const updated = applyStatusFields(
      task,
      makeFields({ editedBy: '  Max  ', hintText: '  Riss abdichten  ' }),
    );
    expect(updated.status).toBe('behoben');
    expect(updated.editedBy).toBe('Max');
    expect(updated.hintText).toBe('Riss abdichten');
    expect(updated.editedAt).toBe('2026-08-24');
    expect(updated.updatedAt).not.toBe(task.updatedAt);
  });
});

describe('duplicateTask', () => {
  it('kopiert die Stammdaten und startet die Kopie als offene Aufgabe', () => {
    const task = makeTask({
      status: 'behoben',
      editedBy: 'Max',
      editedAt: '2026-08-24',
      hintText: 'erledigt',
      material: [{ id: 'M1', name: 'Farbe', quantity: 2, unit: 'Eigen' }],
      images: [{ id: 'IMG1', dataUrl: 'data:image/png;base64,AA==', hash: 'h1' }],
      thumbnailSourceId: 'IMG1',
      thumbnail: 'data:image/png;base64,AA==',
      afterImages: [{ id: 'IMG2', dataUrl: 'data:image/png;base64,AA==', hash: 'h2' }],
    });

    const copy = duplicateTask(task);

    expect(copy.id).not.toBe(task.id);
    expect(copy.name).toBe('Aufgabe (Kopie)');
    expect(copy.description).toBe(task.description);
    expect(copy.material[0].name).toBe('Farbe');
    expect(copy.material[0].id).not.toBe('M1');

    /* Status-Bereich startet neu */
    expect(copy.status).toBe('offen');
    expect(copy.editedBy).toBe('');
    expect(copy.hintText).toBe('');
    expect(copy.afterImages).toHaveLength(0);

    /* Bilder bekommen neue IDs, die Vorschau-Auswahl zeigt auf die Kopie */
    expect(copy.images[0].id).not.toBe('IMG1');
    expect(copy.images[0].hash).toBe('h1');
    expect(copy.thumbnailSourceId).toBe(copy.images[0].id);
  });
});

describe('applyBulkStatus', () => {
  const open = makeTask({ id: 'A' });
  const umbau = makeTask({ id: 'B', typ: 'umbau' });

  it('setzt Status und Bearbeiter für alle gewählten Aufgaben', () => {
    const { updated, skipped } = applyBulkStatus([open, umbau], new Set(['A', 'B']), {
      status: 'behoben',
      editedBy: '  Max  ',
      editedAt: '2026-08-24',
    });

    expect(skipped).toHaveLength(1); // Mängel braucht einen Hinweistext
    expect(skipped[0].id).toBe('A');
    expect(updated).toHaveLength(1);
    expect(updated[0].id).toBe('B');
    expect(updated[0].status).toBe('behoben');
    expect(updated[0].editedBy).toBe('Max');
  });

  it('lässt Aufgaben außerhalb der Auswahl unangetastet', () => {
    const { updated } = applyBulkStatus([open, umbau], new Set(['B']), {
      status: 'offen',
      editedBy: '',
      editedAt: '',
    });
    expect(updated.map((t) => t.id)).toEqual(['B']);
    expect(updated[0].status).toBe('offen');
  });

  it('überspringt Aufgaben ohne Pflicht-Hinweistext und behält bestehende Bearbeiter', () => {
    const withoutHint = makeTask({ id: 'C', editedBy: 'Eva' });
    const withHint = makeTask({ id: 'D', hintText: 'Prüfen', editedBy: 'Tom' });

    const result = applyBulkStatus([withoutHint, withHint], new Set(['C', 'D']), {
      status: 'hinweis',
      editedBy: '',
      editedAt: '',
    });

    expect(result.skipped.map((t) => t.id)).toEqual(['C']);
    expect(result.updated.map((t) => t.id)).toEqual(['D']);
    expect(result.updated[0].editedBy).toBe('Tom');
    expect(result.updated[0].hintText).toBe('Prüfen');
  });
});
