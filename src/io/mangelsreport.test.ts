import { describe, it, expect } from 'vitest';
import { unzipSync } from 'fflate';
import {
  buildMangelsreportPptx,
  buildReportSlide,
  getMangelsreportTemplateBytes,
  mangelsreportFileName,
  photoGrid,
  reportBeforeImages,
  reportAfterImages,
  VORHER_TILE,
  NACHHER_TILE,
} from './mangelsreport';
import type { MangelsreportCover } from './mangelsreport';
import type { Project, Task } from '../domain/types';

const COVER: MangelsreportCover = {
  kennung: 'OBJ-42',
  saal: 'Saal 1',
  strasse: 'Musterstraße 12',
  plzOrt: '12345 Musterstadt',
  efkName: 'Max Mustermann',
  termin: '2026-08-30',
};

function makeTask(id: string, extra: Partial<Task> = {}): Task {
  return {
    id,
    projectId: 'P1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    name: `Aufgabe ${id}`,
    description: `Beschreibung ${id}`,
    images: [],
    thumbnail: null,
    thumbnailSourceId: null,
    material: [],
    plannedWork: '',
    personnel: 1,
    typ: 'maengel',
    art: 'A1',
    pruefung: 'Sichtprüfung',
    fehlerbeschreibung: '',
    position: '',
    status: 'offen',
    editedBy: '',
    editedAt: '',
    hintText: '',
    afterImages: [],
    afterDocuments: [],
    documents: [],
    ...extra,
  };
}

function makeProject(tasks: Task[]): Project {
  return {
    schemaVersion: 1,
    id: 'P1',
    name: 'Sanierung',
    location: 'Musterstadt',
    description: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    tasks,
    documents: [],
  };
}

/** Prüft, ob ein XML-String wohlgeformt ist (Tag-Balance, self-closing, Kommentare). */
function expectWellFormed(xml: string): void {
  const stack: string[] = [];
  for (const m of xml.matchAll(/<\/?([a-zA-Z0-9]+)[^>]*?\/?>/g)) {
    const tag = m[0];
    if (tag.startsWith('<?') || tag.startsWith('<!')) continue; // Deko/Declaration
    if (tag.endsWith('/>')) continue; // self-closing
    if (tag.startsWith('</')) {
      const name = m[1];
      const open = stack.pop();
      expect(open).toBe(name);
    } else {
      stack.push(m[1]);
    }
  }
  expect(stack).toEqual([]);
}

/** Liefert den Inhalt aller <a:r>-Runs (für Schema-Prüfungen auf Run-Ebene). */
function getRuns(xml: string): string[] {
  return [...xml.matchAll(/<a:r>((?:(?!<\/a:r>)[\s\S])*?)<\/a:r>/g)].map(
    (m) => m[1],
  );
}

/**
 * DrawingML-Schema: Ein <a:r>-Run darf nur EIN <a:t> enthalten, <a:br/>
 * gehört auf Absatzebene zwischen die Runs – sonst repariert PowerPoint.
 */
function expectValidRuns(xml: string): void {
  const runs = getRuns(xml);
  expect(runs.length).toBeGreaterThan(0);
  for (const run of runs) {
    const tCount = (run.match(/<a:t>/g) ?? []).length;
    expect(tCount).toBe(1);
    expect(run).not.toContain('<a:br/>');
  }
}

describe('reportBeforeImages / reportAfterImages', () => {
  it('trennt Vorher- und Nachher-Bilder (max. 4 pro Kachel)', () => {
    const images = Array.from({ length: 3 }, (_, i) => ({ id: `v${i}`, dataUrl: '', hash: 'h' }));
    const afterImages = Array.from({ length: 7 }, (_, i) => ({ id: `n${i}`, dataUrl: '', hash: 'h' }));
    const task = makeTask('T1', { images, afterImages });
    expect(reportBeforeImages(task).map((p) => p.id)).toEqual(['v0', 'v1', 'v2']);
    expect(reportAfterImages(task).map((p) => p.id)).toEqual(['n0', 'n1', 'n2', 'n3']);
  });

  it('liefert leere Listen, wenn keine Bilder vorhanden sind', () => {
    const task = makeTask('T1');
    expect(reportBeforeImages(task)).toEqual([]);
    expect(reportAfterImages(task)).toEqual([]);
  });
});

describe('photoGrid', () => {
  it('1 Bild = ganze Vorher-Kachel', () => {
    expect(photoGrid(1, VORHER_TILE)).toEqual([{ x: 634263, y: 133350, w: 3861537, h: 2424243 }]);
    expect(photoGrid(0, VORHER_TILE)).toEqual([]);
  });

  it('2 Bilder = nebeneinander (halbe Breite, volle Kachelhöhe)', () => {
    const cells = photoGrid(2, VORHER_TILE);
    expect(cells).toHaveLength(2);
    expect(cells[0]).toEqual({ x: 634263, y: 133350, w: 1930769, h: 2424243 });
    expect(cells[1]).toEqual({ x: 2565032, y: 133350, w: 1930769, h: 2424243 });
  });

  it('4 Bilder = 2×2-Quadrat in der Kachel', () => {
    const cells = photoGrid(4, VORHER_TILE);
    expect(cells).toHaveLength(4);
    expect(new Set(cells.map((c) => c.x)).size).toBe(2);
    expect(new Set(cells.map((c) => c.y)).size).toBe(2);
    for (const c of cells) expect(c.w).toBe(1930769);
  });

  it('3 Bilder = 2 oben nebeneinander, 1 unten über die volle Breite', () => {
    const cells = photoGrid(3, VORHER_TILE);
    expect(cells).toHaveLength(3);
    expect(cells[2]).toEqual({ x: 634263, y: 1345472, w: 3861537, h: 1212122 });
  });

  it('Nachher-Kachel liegt unterhalb der Vorher-Kachel (getrennte Bereiche)', () => {
    const before = photoGrid(1, VORHER_TILE);
    const after = photoGrid(1, NACHHER_TILE);
    expect(after[0]).toEqual({ x: 634263, y: 2633793, w: 3861537, h: 2438400 });
    /* Keine Überlappung mit der Vorher-Kachel */
    expect(before[0].y + before[0].h).toBeLessThanOrEqual(after[0].y);
  });
});

describe('buildReportSlide (Foto-Kacheln: oben Vorher, unten Nachher)', () => {
  const media = (n: number, prefix: string) =>
    Array.from({ length: n }, (_, i) => ({
      bytes: new Uint8Array(0),
      width: 800,
      height: 600,
      file: `ppt/media/${prefix}${i + 1}.png`,
    }));

  it('platziert 2 Vorher-Bilder nebeneinander in der oberen Kachel', () => {
    const files = unzipSync(getMangelsreportTemplateBytes());
    const baseSlide = new TextDecoder().decode(files['ppt/slides/slide2.xml']);
    const xml = buildReportSlide(baseSlide, makeTask('T1'), COVER, media(2, 'b'), []);

    const pics = xml.match(/<p:pic>[\s\S]*?<\/p:pic>/g) ?? [];
    expect(pics).toHaveLength(2);
    /* Nebeneinander in der oberen Kachel: gleiche y/h, linke/rechte Hälfte */
    expect(xml).toContain('<a:off x="634263" y="133350"/>');
    expect(xml).toContain('<a:off x="2565032" y="133350"/>');
    expect(xml).toContain('<a:ext cx="1930769" cy="2424243"/>');
    /* Nur die obere Kachel (Vorher) wird entfernt, die untere bleibt */
    expect(xml).not.toContain('Bildplatzhalter 3');
    expect(xml).toContain('Bildplatzhalter 1');
    expectWellFormed(xml);
  });

  it('platziert Vorher oben und Nachher unten in getrennten Kacheln', () => {
    const files = unzipSync(getMangelsreportTemplateBytes());
    const baseSlide = new TextDecoder().decode(files['ppt/slides/slide2.xml']);
    const xml = buildReportSlide(
      baseSlide,
      makeTask('T1'),
      COVER,
      media(2, 'b'),
      media(2, 'n'),
    );

    const pics = xml.match(/<p:pic>[\s\S]*?<\/p:pic>/g) ?? [];
    expect(pics).toHaveLength(4);
    /* Vorher in der oberen Kachel (y=133350) … */
    expect(xml).toContain('<a:off x="634263" y="133350"/>');
    expect(xml).toContain('<a:ext cx="1930769" cy="2424243"/>');
    /* … Nachher in der unteren Kachel (y=2633793) */
    expect(xml).toContain('<a:off x="634263" y="2633793"/>');
    expect(xml).toContain('<a:ext cx="1930769" cy="2438400"/>');
    /* Beide leeren Platzhalter sind entfernt */
    expect(xml).not.toContain('Bildplatzhalter 3');
    expect(xml).not.toContain('Bildplatzhalter 1');
    expectWellFormed(xml);
  });

  it('platziert 4 Nachher-Bilder als 2×2-Quadrat in der unteren Kachel', () => {
    const files = unzipSync(getMangelsreportTemplateBytes());
    const baseSlide = new TextDecoder().decode(files['ppt/slides/slide2.xml']);
    const xml = buildReportSlide(baseSlide, makeTask('T1'), COVER, [], media(4, 'n'));

    const pics = xml.match(/<p:pic>[\s\S]*?<\/p:pic>/g) ?? [];
    expect(pics).toHaveLength(4);
    /* Alle Foto-Zellen liegen in der unteren Kachel (y >= 2633793) */
    const picOffs = pics
      .join('')
      .matchAll(/<a:off x="\d+" y="(\d+)"\/>/g);
    const picYs = [...picOffs].map((m) => Number(m[1]));
    for (const y of picYs) expect(y).toBeGreaterThanOrEqual(2633793);
    expectWellFormed(xml);
  });

  it('behält ohne Fotos die leeren Platzhalter der Vorlage', () => {
    const files = unzipSync(getMangelsreportTemplateBytes());
    const baseSlide = new TextDecoder().decode(files['ppt/slides/slide2.xml']);
    const xml = buildReportSlide(baseSlide, makeTask('T1'), COVER, [], []);
    expect(xml).toContain('Bildplatzhalter 3');
    expect(xml).toContain('Bildplatzhalter 1');
    expect(xml).not.toContain('<p:pic>');
  });

  it('schneidet ein breites Bild seitlich symmetrisch zu (srcRect l == r)', () => {
    const files = unzipSync(getMangelsreportTemplateBytes());
    const baseSlide = new TextDecoder().decode(files['ppt/slides/slide2.xml']);
    const wide = [
      { bytes: new Uint8Array(0), width: 2400, height: 1000, file: 'ppt/media/b1.png' },
    ];
    const xml = buildReportSlide(baseSlide, makeTask('T1'), COVER, wide, []);

    const srcRect = xml.match(/<a:srcRect[^/]*\/>/)?.[0] ?? '';
    const l = Number(srcRect.match(/l="(\d+)"/)?.[1] ?? 0);
    const r = Number(srcRect.match(/r="(\d+)"/)?.[1] ?? 0);
    /* l/t/r/b sind Abstände von den Rändern → symmetrischer Zuschnitt */
    expect(l).toBeGreaterThan(0);
    expect(r).toBe(l);
    expect(srcRect).toContain('t="0"');
    expect(srcRect).toContain('b="0"');
  });

  it('schneidet ein hohes Bild oben/unten symmetrisch zu (srcRect t == b)', () => {
    const files = unzipSync(getMangelsreportTemplateBytes());
    const baseSlide = new TextDecoder().decode(files['ppt/slides/slide2.xml']);
    const tall = [
      { bytes: new Uint8Array(0), width: 800, height: 2000, file: 'ppt/media/b1.png' },
    ];
    const xml = buildReportSlide(baseSlide, makeTask('T1'), COVER, tall, []);

    const srcRect = xml.match(/<a:srcRect[^/]*\/>/)?.[0] ?? '';
    const t = Number(srcRect.match(/t="(\d+)"/)?.[1] ?? 0);
    const b = Number(srcRect.match(/b="(\d+)"/)?.[1] ?? 0);
    expect(t).toBeGreaterThan(0);
    expect(b).toBe(t);
    expect(srcRect).toContain('l="0"');
    expect(srcRect).toContain('r="0"');
  });

  it('nutzt bei passendem Seitenverhältnis keinen Zuschnitt', () => {
    const files = unzipSync(getMangelsreportTemplateBytes());
    const baseSlide = new TextDecoder().decode(files['ppt/slides/slide2.xml']);
    /* Exakt das Seitenverhältnis der Vorher-Kachel (3861537 × 2424243) */
    const fit = [
      { bytes: new Uint8Array(0), width: 3861537, height: 2424243, file: 'ppt/media/b1.png' },
    ];
    const xml = buildReportSlide(baseSlide, makeTask('T1'), COVER, fit, []);
    expect(xml).toContain('<a:srcRect l="0" t="0" r="0" b="0"/>');
  });
});

describe('buildReportSlide (mehrzeiliger Text, PowerPoint-kompatibel)', () => {
  it('erzeugt bei mehrzeiligem Text gültige Runs (a:br als Geschwister, ein a:t pro Run)', () => {
    const files = unzipSync(getMangelsreportTemplateBytes());
    const baseSlide = new TextDecoder().decode(files['ppt/slides/slide2.xml']);
    const task = makeTask('T1', {
      pruefung: 'Sichtprüfung',
      fehlerbeschreibung: 'Zeile 1\nZeile 2 mit &amp;',
      hintText: 'Hinweis A\nHinweis B',
    });
    const xml = buildReportSlide(baseSlide, task, COVER, [], []);

    expectWellFormed(xml);
    /* Schema-konform: ein a:t pro Run, kein a:br innerhalb eines Runs */
    expectValidRuns(xml);
    /* Umbrüche stehen auf Absatzebene zwischen den Runs */
    expect(xml).toContain('</a:r><a:br/><a:r>');
    expect(xml).toContain('<a:t>Zeile 1</a:t>');
    expect(xml).toContain('<a:t>Zeile 2 mit &amp;amp;</a:t>');
    expect(xml).toContain('<a:t>Hinweis A</a:t>');
    expect(xml).toContain('<a:t>Hinweis B</a:t>');
  });

  it('lässt einzeiligen Text unverändert (ein Run, ein a:t)', () => {
    const files = unzipSync(getMangelsreportTemplateBytes());
    const baseSlide = new TextDecoder().decode(files['ppt/slides/slide2.xml']);
    const xml = buildReportSlide(
      baseSlide,
      makeTask('T1', { fehlerbeschreibung: 'Einzeilig' }),
      COVER,
      [],
      [],
    );
    expect(xml).toContain('<a:t>Einzeilig</a:t>');
    expect(xml).not.toContain('<a:br/>');
    expectWellFormed(xml);
  });
});

describe('buildMangelsreportPptx', () => {
  it('erzeugt Deckblatt + Reportseiten (nach Position sortiert, nur Mängel)', async () => {
    const project = makeProject([
      makeTask('T10', { position: '10', fehlerbeschreibung: 'Riss', hintText: 'Abdichten' }),
      makeTask('T2', { position: '2', art: 'B2', fehlerbeschreibung: 'Kratzer', material: [{ id: 'M1', name: 'Farbe', quantity: 2, unit: 'Eigen' }] }),
      makeTask('TU', { typ: 'umbau', position: '1' }), // Umbau → nicht im Report
    ]);

    const bytes = await buildMangelsreportPptx(project, { cover: COVER });
    const files = unzipSync(bytes);

    /* Deckblatt: Platzhalter ersetzt */
    const slide1 = new TextDecoder().decode(files['ppt/slides/slide1.xml']);
    expect(slide1).toContain('<a:t>OBJ-42</a:t>');
    expect(slide1).toContain('<a:t>Saal 1</a:t>');
    expect(slide1).toContain('<a:t>Musterstraße 12</a:t>');
    expect(slide1).toContain('<a:t>12345 Musterstadt</a:t>');
    expect(slide1).toContain('Leitende EFK:\tMax Mustermann');
    expect(slide1).toContain('Ausführungstermin:\t2026-08-30');
    expect(slide1).not.toContain('[Kennung]');

    /* 1 Deckblatt + 2 Reportseiten (Umbau-Aufgabe fehlt) */
    expect(files['ppt/slides/slide3.xml']).toBeDefined();
    expect(files['ppt/slides/slide4.xml']).toBeDefined();
    expect(files['ppt/slides/slide5.xml']).toBeUndefined();
    /* Die ungefüllte Musterseite der Vorlage gehört nicht in den Export */
    expect(files['ppt/slides/slide2.xml']).toBeUndefined();

    /* Sortierung nach Position: T2 (2) vor T10 (10) */
    /* Generierte XML-Dateien sind wohlgeformt */
    expectWellFormed(slide1);
    expectWellFormed(new TextDecoder().decode(files['ppt/slides/slide3.xml']));
    expectWellFormed(new TextDecoder().decode(files['ppt/slides/slide4.xml']));
    expectWellFormed(new TextDecoder().decode(files['ppt/presentation.xml']));
    expectWellFormed(new TextDecoder().decode(files['ppt/_rels/presentation.xml.rels']));
    expectWellFormed(new TextDecoder().decode(files['[Content_Types].xml']));

    const slide3 = new TextDecoder().decode(files['ppt/slides/slide3.xml']);
    const slide4 = new TextDecoder().decode(files['ppt/slides/slide4.xml']);
    expect(slide3).toContain('<a:t>Kratzer</a:t>');
    expect(slide3).toContain('<a:t>B2</a:t>');
    expect(slide3).toContain('<a:t>2</a:t>');
    expect(slide4).toContain('<a:t>Riss</a:t>');

    /* Fehlerbeschreibung fällt auf die Aufgabe-Beschreibung zurück */
    expect(slide3).toContain('<a:t>Beschreibung T2</a:t>');

    /* Hinweis zur Behebung: Platzhalter-Klammern entfernt, Text eingesetzt */
    expect(slide4).toContain('Hinweis zur Behebung:');
    expect(slide4).toContain('<a:t>Abdichten</a:t>');
    expect(slide4).not.toContain('\u200B [');

    /* Materialzeilen angehängt */
    expect(slide3).toContain('• Farbe: 2 Eigen');

    /* Präsentation registriert alle Folien (1 Deckblatt + 2 Reportseiten) */
    const presentation = new TextDecoder().decode(files['ppt/presentation.xml']);
    expect(presentation.match(/<p:sldId /g)).toHaveLength(3);
    const presRels = new TextDecoder().decode(files['ppt/_rels/presentation.xml.rels']);
    expect(presRels).toContain('slides/slide3.xml');
    expect(presRels).toContain('slides/slide4.xml');
    const contentTypes = new TextDecoder().decode(files['[Content_Types].xml']);
    expect(contentTypes).toContain('/ppt/slides/slide4.xml');

    /* Mehrzeilige Felder: kein a:br innerhalb eines Runs */
    expectWellFormed(new TextDecoder().decode(files['ppt/slides/slide3.xml']));
  });

  it('behält nur das Deckblatt, wenn keine Mängel-Aufgaben existieren', async () => {
    const project = makeProject([makeTask('TU', { typ: 'umbau' })]);
    const bytes = await buildMangelsreportPptx(project, { cover: COVER });
    const files = unzipSync(bytes);
    expect(files['ppt/slides/slide3.xml']).toBeUndefined();
    expect(files['ppt/slides/slide2.xml']).toBeUndefined();
    const presentation = new TextDecoder().decode(files['ppt/presentation.xml']);
    expect(presentation.match(/<p:sldId /g)).toHaveLength(1);
  });

  it('erzeugt keine a:br-innerhalb-a:r-Verstöße im kompletten Export (mehrzeilige Felder)', async () => {
    const project = makeProject([
      makeTask('T1', {
        position: '1',
        fehlerbeschreibung: 'Erste Zeile\nZweite Zeile mit <Tag> & mehr',
        hintText: 'Hinweis 1\nHinweis 2',
      }),
      makeTask('T2', { position: '2', fehlerbeschreibung: 'Einzeilig' }),
    ]);
    const bytes = await buildMangelsreportPptx(project, { cover: COVER });
    const files = unzipSync(bytes);
    for (let i = 3; i <= 4; i++) {
      const xml = new TextDecoder().decode(files[`ppt/slides/slide${i}.xml`]);
      expectWellFormed(xml);
      expectValidRuns(xml);
    }
  });
});

describe('mangelsreportFileName', () => {
  it('bereinigt den Projektnamen', () => {
    const project = makeProject([]);
    project.name = 'Sanierung / Altbau!';
    expect(mangelsreportFileName(project)).toBe('Mängelreport-Sanierung-Altbau.pptx');
  });
});
