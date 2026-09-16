/* ── Sortier-Helfer für die Aufgaben-Übersicht & den Instandsetzungsreport ── */

import { MANGEL_ARTEN } from './types';

/**
 * Natürlicher Vergleich zweier Positionsangaben („2“ < „10“, „EG 3“ < „OG 1“).
 * Leere Positionen werden ans Ende sortiert.
 */
export function comparePositions(a: string, b: string): number {
  const ka = a.trim().toLowerCase();
  const kb = b.trim().toLowerCase();
  if (!ka && !kb) return 0;
  if (!ka) return 1;
  if (!kb) return -1;

  const chunksA = ka.match(/\d+|\D+/g) ?? [];
  const chunksB = kb.match(/\d+|\D+/g) ?? [];
  for (let i = 0; i < Math.max(chunksA.length, chunksB.length); i++) {
    if (i >= chunksA.length) return -1;
    if (i >= chunksB.length) return 1;
    const ca = chunksA[i];
    const cb = chunksB[i];
    const numA = /^\d+$/.test(ca);
    const numB = /^\d+$/.test(cb);
    if (numA && numB) {
      const diff = BigInt(ca) - BigInt(cb);
      if (diff !== 0n) return diff < 0n ? -1 : 1;
    } else {
      const diff = ca.localeCompare(cb, 'de');
      if (diff !== 0) return diff;
    }
  }
  return 0;
}

/**
 * Vergleicht zwei Mängel-Arten in der Reihenfolge A1–C3.
 * Leere oder unbekannte Arten werden ans Ende sortiert.
 */
export function compareArt(a: string, b: string): number {
  const ia = MANGEL_ARTEN.indexOf(a);
  const ib = MANGEL_ARTEN.indexOf(b);
  const ra = ia < 0 ? Number.MAX_SAFE_INTEGER : ia;
  const rb = ib < 0 ? Number.MAX_SAFE_INTEGER : ib;
  return ra - rb;
}
