import { describe, it, expect } from 'vitest';
import {
  clampRatio,
  createUiYielder,
  progressPercent,
  reportProgress,
} from './progress';
import type { ProgressUpdate } from './progress';

describe('reportProgress', () => {
  it('meldet Text ohne Anteil, wenn keine Gesamtzahl bekannt ist', () => {
    const seen: ProgressUpdate[] = [];
    reportProgress((u) => seen.push(u), 'Projekt wird geladen …');
    expect(seen).toEqual([{ label: 'Projekt wird geladen …', ratio: undefined }]);
  });

  it('rechnet den Anteil aus und begrenzt ihn auf 0…1', () => {
    const seen: ProgressUpdate[] = [];
    reportProgress((u) => seen.push(u), 'Läuft', 3, 4);
    reportProgress((u) => seen.push(u), 'Fast fertig', 9, 4);
    expect(seen[0].ratio).toBe(0.75);
    expect(seen[1].ratio).toBe(1);
  });

  it('behandelt eine Gesamtzahl von 0 als unbekannten Anteil', () => {
    const seen: ProgressUpdate[] = [];
    reportProgress((u) => seen.push(u), 'Leer', 0, 0);
    expect(seen[0].ratio).toBeUndefined();
  });

  it('läuft ohne Empfänger fehlerfrei durch', () => {
    expect(() => reportProgress(undefined, 'egal', 1, 2)).not.toThrow();
  });
});

describe('clampRatio / progressPercent', () => {
  it('begrenzt auf 0…1 und fängt ungültige Werte ab', () => {
    expect(clampRatio(0.5)).toBe(0.5);
    expect(clampRatio(-3)).toBe(0);
    expect(clampRatio(2)).toBe(1);
    expect(clampRatio(Number.NaN)).toBe(0);
    expect(clampRatio(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('rundet auf ganze Prozent', () => {
    expect(progressPercent(0.333)).toBe(33);
    expect(progressPercent(0.005)).toBe(1);
    expect(progressPercent(-1)).toBe(0);
    expect(progressPercent(1.5)).toBe(100);
  });
});

describe('createUiYielder', () => {
  it('gibt den Main-Thread erst im nächsten Task frei', async () => {
    const yieldUi = createUiYielder(0);
    let released = false;
    const pending = yieldUi().then(() => {
      released = true;
    });
    /* Synchron darf noch nichts passiert sein – sonst bliebe die Anzeige stehen. */
    expect(released).toBe(false);
    await pending;
    expect(released).toBe(true);
  });

  it('drosselt weitere Aufrufe innerhalb des Intervalls', async () => {
    const yieldUi = createUiYielder(10_000);
    await yieldUi();
    const start = Date.now();
    await yieldUi();
    expect(Date.now() - start).toBeLessThan(20);
  });
});
