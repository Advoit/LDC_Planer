import { describe, it, expect } from 'vitest';
import { compareArt, comparePositions } from './sort';

describe('comparePositions', () => {
  it('sortiert numerisch (2 vor 10) und alphabetisch', () => {
    const positions = ['10', 'EG 3', '2', 'EG 1', 'OG 2'];
    positions.sort(comparePositions);
    expect(positions).toEqual(['2', '10', 'EG 1', 'EG 3', 'OG 2']);
  });

  it('sortiert leere Positionen ans Ende', () => {
    const positions = ['', '3', ''];
    positions.sort(comparePositions);
    expect(positions).toEqual(['3', '', '']);
  });

  it('mischt Alphabet und Zahlen (A1 vor A2 vor A10, A1 vor B1)', () => {
    const positions = ['A10', 'B1', 'A2', 'A1'];
    positions.sort(comparePositions);
    expect(positions).toEqual(['A1', 'A2', 'A10', 'B1']);
  });
});

describe('compareArt', () => {
  it('sortiert nach A1–C3', () => {
    const arts = ['B2', 'A1', 'C3', 'A3'];
    arts.sort(compareArt);
    expect(arts).toEqual(['A1', 'A3', 'B2', 'C3']);
  });

  it('sortiert leere Arten ans Ende', () => {
    const arts = ['', 'B1', ''];
    arts.sort(compareArt);
    expect(arts).toEqual(['B1', '', '']);
  });
});
