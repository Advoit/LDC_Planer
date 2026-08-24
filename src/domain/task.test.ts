import { describe, it, expect } from 'vitest';
import { validateStatusFields, applyStatusFields } from './task';
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
