import { describe, it, expect } from 'vitest';
import { fitDimensions } from './image';

describe('fitDimensions', () => {
  it('lässt kleine Bilder unverändert', () => {
    expect(fitDimensions(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });

  it('skaliert Querformat auf die längste Kante', () => {
    expect(fitDimensions(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
  });

  it('skaliert Hochformat auf die längste Kante', () => {
    expect(fitDimensions(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
  });

  it('rundet auf mindestens 1 Pixel', () => {
    expect(fitDimensions(4000, 2, 1600)).toEqual({ width: 1600, height: 1 });
  });

  it('verkraftet fehlerhafte Größen', () => {
    expect(fitDimensions(0, 0, 1600)).toEqual({ width: 1, height: 1 });
  });
});
