/* ── PPTX-Foto-Kacheln: Foto-Platzierung für den Instandsetzungsreport ──
 *
 * Platziert die Vorher-/Nachher-Fotos in den beiden Foto-Kacheln der
 * Reportseite (obere Kachel = Vorher, untere = Nachher) als 2-Spalten-Raster
 * und konvertiert Bilder in PNG-Bytes. Eigene Einheit, damit der
 * Report-Builder (instandsetzungsreport.ts) unter der Modul-Längen-Grenze bleibt.
 */

import { dataUrlToBytes } from './export';

export interface PptxImage {
  bytes: Uint8Array;
  width: number;
  height: number;
}

export interface SlideMedia extends PptxImage {
  file: string;
}

/* Die beiden Foto-Kacheln aus der Vorlage (slideLayout2): oben „Vorher“,
   unten „Nachher“. In jeder Kachel werden die Fotos als 2-Spalten-Raster
   angeordnet (1 groß, 2 nebeneinander, bis zu 4 als 2×2-Quadrat) – ohne dass
   mehr Platz genutzt wird und ohne die mittlere Textzeile zu überdecken. */
export const VORHER_TILE = { x: 634263, y: 133350, w: 3861537, h: 2424243 };
export const NACHHER_TILE = { x: 634263, y: 2633793, w: 3861537, h: 2438400 };

/** Maximale Anzahl Fotos pro Kachel (2-Spalten-Raster, 2 Reihen). */
export const MAX_IMAGES_PER_TILE = 4;

/* ═══════════════════ Bilder & Platzhalter ═══════════════════ */

/** Konvertiert eine Bild-dataURL in PNG-Bytes (einheitlich für die Vorlage). */
export async function imageToPng(dataUrl: string): Promise<PptxImage> {
  const img = await loadImage(dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas ist nicht verfügbar.');
  ctx.drawImage(img, 0, 0);
  return {
    bytes: dataUrlToBytes(canvas.toDataURL('image/png')),
    width: img.naturalWidth,
    height: img.naturalHeight,
  };
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Bild konnte nicht geladen werden.'));
    img.src = dataUrl;
  });
}

/** Entfernt einen leeren Bildplatzhalter aus der Folie (Fotos werden neu platziert). */
export function removePlaceholder(xml: string, placeholderName: string): string {
  const marker = `name="${placeholderName}"`;
  const markerIdx = xml.indexOf(marker);
  if (markerIdx < 0) return xml;
  const start = xml.lastIndexOf('<p:sp>', markerIdx);
  const end = xml.indexOf('</p:sp>', markerIdx);
  if (start < 0 || end < 0) return xml;
  return xml.slice(0, start) + xml.slice(end + '</p:sp>'.length);
}

/** Baut die <p:pic>-Elemente für alle Fotos einer Reportseite (Kacheln). */
export function buildPhotoPics(
  beforeMedia: SlideMedia[],
  afterMedia: SlideMedia[],
): string {
  const before = beforeMedia.slice(0, MAX_IMAGES_PER_TILE);
  const after = afterMedia.slice(0, MAX_IMAGES_PER_TILE);

  let pics = '';
  let rid = 2; // rId1 ist das Layout – Fotos ab rId2
  let id = 100;

  /* Obere Kachel: Vorher-Bilder */
  const beforeCells = photoGrid(before.length, VORHER_TILE);
  before.forEach((img, i) => {
    pics += buildPicture(img, beforeCells[i], id++, rid++, `Vorher ${i + 1}`);
  });

  /* Untere Kachel: Nachher-Bilder */
  const afterCells = photoGrid(after.length, NACHHER_TILE);
  after.forEach((img, i) => {
    pics += buildPicture(img, afterCells[i], id++, rid++, `Nachher ${i + 1}`);
  });

  return pics;
}

/**
 * Berechnet die Raster-Zellen für n Bilder in einer Kachel (2 Spalten,
 * die letzte ungerade Zelle bekommt die volle Breite):
 * 1 → ganze Kachel · 2 → nebeneinander · 3 → 2 oben, 1 unten breit ·
 * 4 → 2×2-Quadrat. Die Kachel bleibt immer gleich groß.
 */
export function photoGrid(
  imageCount: number,
  tile: { x: number; y: number; w: number; h: number } = VORHER_TILE,
): { x: number; y: number; w: number; h: number }[] {
  const c = tile;
  if (imageCount <= 0) return [];
  if (imageCount === 1) return [{ ...c }];

  const cols = 2;
  const rows = Math.ceil(imageCount / cols);
  const cellW = Math.round(c.w / cols);
  const cellH = Math.round(c.h / rows);
  const oddCount = imageCount % cols === 1; // letzte Zeile hat nur 1 Bild

  const cells: { x: number; y: number; w: number; h: number }[] = [];
  for (let i = 0; i < imageCount; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const isLast = i === imageCount - 1;
    cells.push({
      x: c.x + col * cellW,
      y: c.y + row * cellH,
      w: isLast && oddCount ? c.w : cellW,
      h: cellH,
    });
  }
  return cells;
}

function buildPicture(
  image: PptxImage,
  frame: { x: number; y: number; w: number; h: number },
  id: number,
  rid: number,
  name: string,
): string {
  const crop = coverCrop(image.width, image.height, frame.w, frame.h);
  const srcRect = crop
    ? `<a:srcRect l="${crop.l}" t="${crop.t}" r="${crop.r}" b="${crop.b}"/>`
    : '';
  return (
    `<p:pic>` +
    `<p:nvPicPr>` +
    `<p:cNvPr id="${id}" name="${name}"/>` +
    `<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr>` +
    `<p:nvPr/>` +
    `</p:nvPicPr>` +
    `<p:blipFill>` +
    `<a:blip r:embed="rId${rid}"/>` +
    srcRect +
    `<a:stretch><a:fillRect/></a:stretch>` +
    `</p:blipFill>` +
    `<p:spPr>` +
    `<a:xfrm><a:off x="${frame.x}" y="${frame.y}"/><a:ext cx="${frame.w}" cy="${frame.h}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
    `<a:ln><a:noFill/></a:ln>` +
    `</p:spPr>` +
    `</p:pic>`
  );
}

/**
 * Berechnet den Bildausschnitt (srcRect) für eine „Cover“-Darstellung:
 * Das Bild füllt den Rahmen ohne Verzerrung, überschüssige Bereiche werden abgeschnitten.
 *
 * Achtung: l/t/r/b sind Abstände von der jeweiligen Bildkante („wie viel wird
 * abgeschnitten“), NICHT Koordinaten der rechten Kante. Bei einem seitlichen
 * Zuschnitt ist daher r === l, bei einem oberen/unteren b === t.
 */
function coverCrop(
  imgW: number,
  imgH: number,
  frameW: number,
  frameH: number,
): { l: number; t: number; r: number; b: number } | null {
  if (imgW <= 0 || imgH <= 0) return null;
  const imgAspect = imgW / imgH;
  const frameAspect = frameW / frameH;
  const k = 100000; // srcRect wird in 1/1000 Prozent angegeben
  if (imgAspect > frameAspect) {
    /* Bild ist breiter → seitlich abschneiden */
    const keep = frameAspect / imgAspect;
    const crop = Math.round(((1 - keep) / 2) * k);
    return { l: crop, t: 0, r: crop, b: 0 };
  }
  if (frameAspect > imgAspect) {
    /* Bild ist höher → oben/unten abschneiden */
    const keep = imgAspect / frameAspect;
    const crop = Math.round(((1 - keep) / 2) * k);
    return { l: 0, t: crop, r: 0, b: crop };
  }
  return { l: 0, t: 0, r: 0, b: 0 };
}
