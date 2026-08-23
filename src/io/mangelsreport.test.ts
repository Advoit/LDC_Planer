import { describe, it, expect } from 'vitest';
import { unzipSync } from 'fflate';
import {
  buildMangelsreportPptx,
  buildReportSlide,
  getMangelsreportTemplateBytes,
  mangelsreportFileName,
  photoGrid,
  reportImages,
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

describe('reportImages', () => {
  it('nimmt Vorher- und Nachher-Bilder auf (Vorher zuerst, max. 8)', () => {
    const images = Array.from({ length: 3 }, (_, i) => ({ id: `v${i}`, dataUrl: '', hash: 'h' }));
    const afterImages = Array.from({ length: 7 }, (_, i) => ({ id: `n${i}`, dataUrl: '', hash: 'h' }));
    const task = makeTask('T1', { images, afterImages });
    const photos = reportImages(task);
    expect(photos).toHaveLength(8);
    expect(photos[0].id).toBe('v0');
    expect(photos[3].id).toBe('n0');
  });

  it('liefert leere Liste, wenn keine Bilder vorhanden sind', () => {
    expect(reportImages(makeTask('T1'))).toEqual([]);
  });
});

describe('photoGrid', () => {
  it('1 Bild = ganze Foto-Fläche', () => {
    expect(photoGrid(1)).toEqual([{ x: 634263, y: 133350, w: 3861537, h: 4938843 }]);
    expect(photoGrid(0)).toEqual([]);
  });

  it('2 Bilder = nebeneinander (halbe Breite, volle Höhe)', () => {
    const cells = photoGrid(2);
    expect(cells).toHaveLength(2);
    expect(cells[0]).toEqual({ x: 634263, y: 133350, w: 1930769, h: 4938843 });
    expect(cells[1]).toEqual({ x: 2565032, y: 133350, w: 1930769, h: 4938843 });
  });

  it('4 Bilder = 2×2-Quadrat auf der gleichen Fläche', () => {
    const cells = photoGrid(4);
    expect(cells).toHaveLength(4);
    expect(new Set(cells.map((c) => c.x)).size).toBe(2);
    expect(new Set(cells.map((c) => c.y)).size).toBe(2);
    for (const c of cells) expect(c.w).toBe(1930769);
  });

  it('3 Bilder = 2 oben nebeneinander, 1 unten über die volle Breite', () => {
    const cells = photoGrid(3);
    expect(cells).toHaveLength(3);
    expect(cells[2]).toEqual({ x: 634263, y: 2602772, w: 3861537, h: 2469422 });
  });

  it('5 Bilder = 3 Reihen, letzte Zelle über die volle Breite', () => {
    const cells = photoGrid(5);
    expect(cells).toHaveLength(5);
    expect(new Set(cells.map((c) => c.y)).size).toBe(3);
    expect(cells[4]).toEqual({ x: 634263, y: 3425912, w: 3861537, h: 1646281 });
  });

  it('6 Bilder = 3 Reihen à 2 Spalten', () => {
    const cells = photoGrid(6);
    expect(cells).toHaveLength(6);
    for (const c of cells) expect(c.w).toBe(1930769);
    expect(new Set(cells.map((c) => c.y)).size).toBe(3);
  });
});

describe('buildReportSlide (Foto-Raster)', () => {
  it('platziert 2 Bilder nebeneinander und entfernt die leeren Platzhalter', () => {
    const files = unzipSync(getMangelsreportTemplateBytes());
    const baseSlide = new TextDecoder().decode(files['ppt/slides/slide2.xml']);
    const media = [
      { bytes: new Uint8Array(0), width: 800, height: 600, file: 'ppt/media/media9.png' },
      { bytes: new Uint8Array(0), width: 800, height: 600, file: 'ppt/media/media10.png' },
    ];
    const xml = buildReportSlide(baseSlide, makeTask('T1'), COVER, media);

    const pics = xml.match(/<p:pic>[\s\S]*?<\/p:pic>/g) ?? [];
    expect(pics).toHaveLength(2);
    /* Nebeneinander: gleiche y/h, linke und rechte Hälfte */
    expect(xml).toContain('<a:off x="634263" y="133350"/>');
    expect(xml).toContain('<a:off x="2565032" y="133350"/>');
    expect(xml).toContain('<a:ext cx="1930769" cy="4938843"/>');
    /* Die leeren Bildplatzhalter der Vorlage sind entfernt */
    expect(xml).not.toContain('Bildplatzhalter 3');
    expect(xml).not.toContain('Bildplatzhalter 1');
    expectWellFormed(xml);
  });

  it('platziert 4 Bilder als 2×2-Quadrat', () => {
    const files = unzipSync(getMangelsreportTemplateBytes());
    const baseSlide = new TextDecoder().decode(files['ppt/slides/slide2.xml']);
    const media = Array.from({ length: 4 }, (_, i) => ({
      bytes: new Uint8Array(0),
      width: 800,
      height: 600,
      file: `ppt/media/media${20 + i}.png`,
    }));
    const xml = buildReportSlide(baseSlide, makeTask('T1'), COVER, media);

    const pics = xml.match(/<p:pic>[\s\S]*?<\/p:pic>/g) ?? [];
    expect(pics).toHaveLength(4);
    expectWellFormed(xml);
  });

  it('platziert 6 Bilder in 3 Reihen', () => {
    const files = unzipSync(getMangelsreportTemplateBytes());
    const baseSlide = new TextDecoder().decode(files['ppt/slides/slide2.xml']);
    const media = Array.from({ length: 6 }, (_, i) => ({
      bytes: new Uint8Array(0),
      width: 800,
      height: 600,
      file: `ppt/media/media${30 + i}.png`,
    }));
    const xml = buildReportSlide(baseSlide, makeTask('T1'), COVER, media);

    const pics = xml.match(/<p:pic>[\s\S]*?<\/p:pic>/g) ?? [];
    expect(pics).toHaveLength(6);
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

    /* Präsentation registriert alle Folien */
    const presentation = new TextDecoder().decode(files['ppt/presentation.xml']);
    expect(presentation.match(/<p:sldId /g)).toHaveLength(4);
    const presRels = new TextDecoder().decode(files['ppt/_rels/presentation.xml.rels']);
    expect(presRels).toContain('slides/slide3.xml');
    expect(presRels).toContain('slides/slide4.xml');
    const contentTypes = new TextDecoder().decode(files['[Content_Types].xml']);
    expect(contentTypes).toContain('/ppt/slides/slide4.xml');
  });

  it('behält nur das Deckblatt, wenn keine Mängel-Aufgaben existieren', async () => {
    const project = makeProject([makeTask('TU', { typ: 'umbau' })]);
    const bytes = await buildMangelsreportPptx(project, { cover: COVER });
    const files = unzipSync(bytes);
    expect(files['ppt/slides/slide3.xml']).toBeUndefined();
    const presentation = new TextDecoder().decode(files['ppt/presentation.xml']);
    expect(presentation.match(/<p:sldId /g)).toHaveLength(2);
  });
});

describe('mangelsreportFileName', () => {
  it('bereinigt den Projektnamen', () => {
    const project = makeProject([]);
    project.name = 'Sanierung / Altbau!';
    expect(mangelsreportFileName(project)).toBe('Mängelreport-Sanierung-Altbau.pptx');
  });
});
