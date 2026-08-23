import { describe, it, expect } from 'vitest';
import {
  collectMaterialSuggestions,
  searchSuggestions,
} from './material';
import type { Task } from './types';

function makeTask(id: string, material: { name: string; quantity: number; unit: string }[]): Task {
  return {
    id,
    projectId: 'P1',
    createdAt: '',
    updatedAt: '',
    name: id,
    description: '',
    images: [],
    thumbnail: null,
    thumbnailSourceId: null,
    material: material.map((m, i) => ({ id: `${id}-${i}`, ...m })),
    plannedWork: '',
    status: 'offen',
    editedBy: '',
    editedAt: '',
    hintText: '',
    afterImages: [],
    afterDocuments: [],
    documents: [],
  };
}

describe('collectMaterialSuggestions', () => {
  it('liefert (Name, Einheit)-Tupel mit zuletzt verwendeter Einheit', () => {
    const tasks = [
      makeTask('T1', [{ name: 'Schraube', quantity: 10, unit: 'Stück' }]),
      makeTask('T2', [{ name: 'Schraube', quantity: 5, unit: 'VPE' }]),
      makeTask('T3', [{ name: 'Kabel', quantity: 3, unit: 'Meter' }]),
    ];
    const suggestions = collectMaterialSuggestions(tasks);
    const schraube = suggestions.find((s) => s.name === 'Schraube');
    expect(schraube?.unit).toBe('VPE');
    expect(suggestions).toHaveLength(2);
  });

  it('ignoriert leere Namen und die ausgenommene Aufgabe', () => {
    const tasks = [
      makeTask('T1', [{ name: '   ', quantity: 1, unit: 'Stück' }]),
      makeTask('T2', [{ name: 'Farbe', quantity: 1, unit: 'Eigen' }]),
    ];
    const suggestions = collectMaterialSuggestions(tasks, 'T1');
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].name).toBe('Farbe');
  });
});

describe('searchSuggestions', () => {
  it('filtert nach Namen und Einheit', () => {
    const suggestions = [
      { name: 'Schraube', unit: 'Stück' },
      { name: 'Kabel', unit: 'Meter' },
      { name: 'Farbe', unit: 'Eigen' },
    ];
    expect(searchSuggestions(suggestions, 'schr').map((s) => s.name)).toEqual(['Schraube']);
    expect(searchSuggestions(suggestions, 'meter').map((s) => s.name)).toEqual(['Kabel']);
  });

  it('begrenzt die Anzahl', () => {
    const suggestions = Array.from({ length: 20 }, (_, i) => ({
      name: `Material ${i}`,
      unit: 'Stück',
    }));
    expect(searchSuggestions(suggestions, '').length).toBe(8);
  });
});