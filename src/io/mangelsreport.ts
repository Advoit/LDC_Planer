/* ── Mängelreport-Export: PPTX auf Basis der Vorlage „Mängelsreport.pptx“ ──
 *
 * Die Ausgabe entsteht aus der Original-Vorlage (eingebettet via
 * scripts/embed-mangels-template.mjs): Seite 1 = Deckblatt (Platzhalter werden
 * ersetzt), ab Seite 2 folgt pro Mängel eine Standard-Reportseite (nach Position
 * sortiert). So sieht der Export optisch exakt wie die Vorlage aus – ohne
 * zusätzliche Abhängigkeiten.
 */

import { strToU8, unzipSync, zipSync } from 'fflate';
import { dataUrlToBytes } from './export';
import { MANGELSREPORT_TEMPLATE_BASE64 } from './mangelsreport-template';
import { comparePositions } from '../domain/sort';
import type { Project, Task, TaskImage } from '../domain/types';

export interface MangelsreportCover {
  kennung: string; // Kennung (z. B. Projekt-/Objektnummer)
  saal: string; // Saal / Bereich
  strasse: string; // Straße + Hausnummer
  plzOrt: string; // PLZ + Ort
  efkName: string; // Leitende EFK
  termin: string; // Ausführungstermin
}

export interface MangelsreportOptions {
  cover: MangelsreportCover;
}

/**
 * Sammelt die Fotos einer Aufgabe für den Report: zuerst Vorher-, dann
 * Nachher-Bilder – begrenzt auf das Fassungsvermögen einer Reportseite.
 */
export function reportImages(task: Task): TaskImage[] {
  return [...task.images, ...task.afterImages].slice(0, MAX_REPORT_IMAGES);
}

const REL_SLIDE_LAYOUT =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout';
const REL_SLIDE =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide';
const REL_IMAGE =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';
const CT_SLIDE =
  'application/vnd.openxmlformats-officedocument.presentationml.slide+xml';

/* Foto-Fläche aus der Vorlage (slideLayout2): die gesamte linke Spalte.
   Bilder werden darin als Raster angeordnet (1 groß, 2 nebeneinander,
   bis zu 8 als 2-Spalten-Raster) – ohne dass mehr Platz genutzt wird. */
export const PHOTO_CANVAS = { x: 634263, y: 133350, w: 3861537, h: 4938843 };

/** Maximale Anzahl Fotos pro Reportseite (2-Spalten-Raster, 4 Reihen). */
const MAX_REPORT_IMAGES = 8;

interface PptxImage {
  bytes: Uint8Array;
  width: number;
  height: number;
}

interface SlideMedia extends PptxImage {
  file: string;
}

/* ═══════════════════ Öffentliche API ═══════════════════ */

let cachedTemplate: Uint8Array | null = null;

/** Gibt die eingebettete PPTX-Vorlage als Bytes zurück (einmalig dekodiert). */
export function getMangelsreportTemplateBytes(): Uint8Array {
  if (!cachedTemplate) cachedTemplate = base64ToBytes(MANGELSREPORT_TEMPLATE_BASE64);
  return cachedTemplate;
}

/**
 * Baut den Mängelreport (PPTX) aus der eingebetteten Vorlage.
 * Nur Aufgaben vom Typ „Mängel“ werden übernommen – sortiert nach Position.
 */
export async function buildMangelsreportPptx(
  project: Project,
  opts: MangelsreportOptions,
): Promise<Uint8Array> {
  const files = unzipSync(getMangelsreportTemplateBytes());
  const decode = (path: string): string =>
    new TextDecoder().decode(files[path]);

  /* ── Deckblatt (Seite 1) ── */
  files['ppt/slides/slide1.xml'] = strToU8(
    buildCoverSlide(decode('ppt/slides/slide1.xml'), opts.cover),
  );

  /* ── Reportseiten (ab Seite 2), nach Position sortiert ── */
  const maengel = project.tasks
    .filter((t) => (t.typ ?? 'maengel') === 'maengel')
    .sort((a, b) => comparePositions(a.position, b.position));

  const baseSlide = decode('ppt/slides/slide2.xml');
  let contentTypes = decode('[Content_Types].xml');
  let presentation = decode('ppt/presentation.xml');
  let presRels = decode('ppt/_rels/presentation.xml.rels');
  let appXml = decode('docProps/app.xml');

  let slideNo = 3; // slide1 + slide2 sind in der Vorlage vorhanden
  let relId = 100; // freie Relationship-IDs (Vorlage nutzt rId1–rId12)
  let sldId = 1000; // freie Folien-IDs
  let mediaNo = 3; // Vorlage hat bereits media1.png + media2.png

  for (const task of maengel) {
    const media: SlideMedia[] = [];
    for (const img of reportImages(task)) {
      const png = await imageToPng(img.dataUrl);
      const file = `ppt/media/media${mediaNo}.png`;
      files[file] = png.bytes.slice(); // slice(): typsichere eigene Kopie
      media.push({ ...png, file });
      mediaNo++;
    }

    files[`ppt/slides/slide${slideNo}.xml`] = strToU8(
      buildReportSlide(baseSlide, task, opts.cover, media),
    );
    files[`ppt/slides/_rels/slide${slideNo}.xml.rels`] = strToU8(
      buildSlideRels(media),
    );

    presentation = presentation.replace(
      '</p:sldIdLst>',
      `<p:sldId id="${sldId}" r:id="rId${relId}"/></p:sldIdLst>`,
    );
    presRels = presRels.replace(
      '</Relationships>',
      `<Relationship Id="rId${relId}" Type="${REL_SLIDE}" Target="slides/slide${slideNo}.xml"/></Relationships>`,
    );
    contentTypes = contentTypes.replace(
      '</Types>',
      `<Override PartName="/ppt/slides/slide${slideNo}.xml" ContentType="${CT_SLIDE}"/></Types>`,
    );

    slideNo++;
    relId++;
    sldId++;
  }

  files['[Content_Types].xml'] = strToU8(contentTypes);
  files['ppt/presentation.xml'] = strToU8(presentation);
  files['ppt/_rels/presentation.xml.rels'] = strToU8(presRels);

  /* Seitenzahl in den Dokument-Metadaten aktualisieren */
  if (maengel.length > 0) {
    appXml = appXml.replace(
      /<Slides>\d+<\/Slides>/,
      `<Slides>${maengel.length + 1}</Slides>`,
    );
    files['docProps/app.xml'] = strToU8(appXml);
  }

  /* slice() liefert eine eigene Kopie (typsicher Uint8Array) */
  return zipSync(files, { level: 6 }).slice();
}

/** Dateiname für den Mängelreport (Projektname, sicher bereinigt). */
export function mangelsreportFileName(project: Project): string {
  const safeName = project.name
    .replace(/[^a-zA-Z0-9äöüÄÖÜß _-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  return `Mängelreport-${safeName || 'Projekt'}.pptx`;
}

/* ═══════════════════ Deckblatt ═══════════════════ */

function buildCoverSlide(template: string, cover: MangelsreportCover): string {
  let xml = template;
  xml = replaceRun(xml, '<a:t>[Kennung]</a:t>', textRun(cover.kennung));
  xml = replaceRun(xml, '<a:t>[Saal]</a:t>', textRun(cover.saal));
  xml = replaceRun(
    xml,
    '<a:t>[Straße + Hausnummer]</a:t>',
    textRun(cover.strasse),
  );
  xml = replaceRun(xml, '<a:t>[PLZ] [Ort]</a:t>', textRun(cover.plzOrt));
  xml = replaceRun(
    xml,
    '<a:t>Leitende EFK:\t[Name]</a:t>',
    textRun(`Leitende EFK:\t${cover.efkName}`),
  );
  xml = replaceRun(
    xml,
    '<a:t>Ausführungstermin:\t[Datum]</a:t>',
    textRun(`Ausführungstermin:\t${cover.termin}`),
  );
  return xml;
}

/* ═══════════════════ Reportseite ═══════════════════ */

/**
 * Baut eine Reportseite aus der Vorlagen-Folie.
 * Die Fotos werden als Raster in der Foto-Fläche platziert (2 Spalten):
 * 1 Bild = ganze Fläche, 2 Bilder = nebeneinander, 3 = 2 oben + 1 unten breit,
 * 4 = 2×2-Quadrat, mehr = weitere Zeilen (letzte ungerade Zelle volle Breite).
 */
export function buildReportSlide(
  template: string,
  task: Task,
  cover: MangelsreportCover,
  media: SlideMedia[],
): string {
  let xml = template;

  const pruefung = task.pruefung.trim();
  /* Fehlerbeschreibung: neues Feld, sonst Rückgriff auf die Beschreibung */
  const fehler =
    task.fehlerbeschreibung.trim() || task.description.trim();
  const hinweis = task.hintText.trim();
  const kopf = [cover.kennung, cover.saal, cover.strasse]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' · ');

  xml = replaceRun(xml, '<a:t>🧩[Prüfung]</a:t>', textWithBreaks(`🧩${pruefung}`));
  xml = replaceRun(
    xml,
    '<a:t>[Fehlerbeschreibung]</a:t>',
    textWithBreaks(fehler),
  );
  /* „Hinweis zur Behebung: […]“ – eckige Klammern entfernen, Text einsetzen */
  xml = replaceRun(
    xml,
    '<a:t>⚠️Hinweis zur Behebung:\u200B [</a:t>',
    '<a:t>⚠️Hinweis zur Behebung:\u200B </a:t>',
  );
  xml = replaceRun(xml, '<a:t>Beschreibung</a:t>', textWithBreaks(hinweis));
  xml = replaceRun(xml, '<a:t>]</a:t>', '<a:t></a:t>');
  xml = replaceRun(xml, '<a:t>[Art]</a:t>', textRun(task.art));
  xml = replaceRun(xml, '<a:t>[Position]</a:t>', textRun(task.position));
  xml = replaceRun(
    xml,
    '<a:t>[Kennung + Ort + Straße]</a:t>',
    textRun(kopf),
  );

  /* Material unter den Material-Header anhängen */
  const materialLines = task.material.map(
    (m) => `• ${m.name}: ${m.quantity} ${m.unit}`.trim(),
  );
  if (materialLines.length > 0) {
    const anchor =
      '<a:t>📦Material (Beschaffung durch …):\u200B</a:t></a:r></a:p>';
    const paragraphs = materialLines
      .map(
        (line) =>
          `<a:p><a:r><a:rPr lang="de-DE" dirty="0"/><a:t>${escapeXml(line)}</a:t></a:r></a:p>`,
      )
      .join('');
    xml = xml.replace(anchor, anchor + paragraphs);
  }

  /* Aufgabentitel + Beschreibung in das (in der Vorlage leere) Textfeld unten rechts */
  const nameDesc = [task.name.trim(), task.description.trim()]
    .filter(Boolean)
    .join('\n');
  if (nameDesc) {
    xml = xml.replace(
      '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="de-DE" dirty="0"/></a:p></p:txBody>',
      buildNameDescBody(nameDesc),
    );
  }

  /* Fotos: leere Bildplatzhalter entfernen und als Raster in die Foto-Fläche setzen.
     Ohne Fotos bleiben die Platzhalter (wie in der Vorlage) sichtbar. */
  if (media.length > 0) {
    xml = removePlaceholder(xml, 'Bildplatzhalter 3');
    xml = removePlaceholder(xml, 'Bildplatzhalter 1');
    const pics = buildPhotoPics(media);
    xml = xml.replace('</p:spTree>', pics + '</p:spTree>');
  }

  return xml;
}

function buildNameDescBody(text: string): string {
  const lines = text.split('\n');
  const paragraphs = lines.map((line, i) => {
    const bold = i === 0 ? ' b="1"' : '';
    return `<a:p><a:r><a:rPr lang="de-DE" dirty="0"${bold}/><a:t>${escapeXml(line)}</a:t></a:r></a:p>`;
  });
  return `<p:txBody><a:bodyPr/><a:lstStyle/>${paragraphs.join('')}</p:txBody>`;
}

/* ═══════════════════ Bilder & Platzhalter ═══════════════════ */

/** Konvertiert eine Bild-dataURL in PNG-Bytes (einheitlich für die Vorlage). */
async function imageToPng(dataUrl: string): Promise<PptxImage> {
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
function removePlaceholder(xml: string, placeholderName: string): string {
  const marker = `name="${placeholderName}"`;
  const markerIdx = xml.indexOf(marker);
  if (markerIdx < 0) return xml;
  const start = xml.lastIndexOf('<p:sp>', markerIdx);
  const end = xml.indexOf('</p:sp>', markerIdx);
  if (start < 0 || end < 0) return xml;
  return xml.slice(0, start) + xml.slice(end + '</p:sp>'.length);
}

/** Baut die <p:pic>-Elemente für alle Fotos einer Reportseite (Raster). */
function buildPhotoPics(media: SlideMedia[]): string {
  const imgs = media.slice(0, MAX_REPORT_IMAGES);
  const cells = photoGrid(imgs.length);
  return imgs
    .map((img, i) =>
      buildPicture(img, cells[i], 100 + i, 2 + i, `Bild ${i + 1}`),
    )
    .join('');
}

/**
 * Berechnet die Raster-Zellen für n Bilder in der Foto-Fläche (2 Spalten,
 * die letzte ungerade Zelle bekommt die volle Breite):
 * 1 → ganze Fläche · 2 → nebeneinander · 3 → 2 oben, 1 unten breit ·
 * 4 → 2×2-Quadrat · mehr → weitere Zeilen. Die Fläche bleibt immer gleich groß.
 */
export function photoGrid(
  imageCount: number,
): { x: number; y: number; w: number; h: number }[] {
  const c = PHOTO_CANVAS;
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
    return { l: crop, t: 0, r: k - crop, b: 0 };
  }
  if (frameAspect > imgAspect) {
    /* Bild ist höher → oben/unten abschneiden */
    const keep = imgAspect / frameAspect;
    const crop = Math.round(((1 - keep) / 2) * k);
    return { l: 0, t: crop, r: 0, b: k - crop };
  }
  return { l: 0, t: 0, r: 0, b: 0 };
}

function buildSlideRels(media: SlideMedia[]): string {
  let rels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\r\n` +
    `<Relationship Id="rId1" Type="${REL_SLIDE_LAYOUT}" Target="../slideLayouts/slideLayout2.xml"/>`;
  media.forEach((m, i) => {
    rels += `\r\n<Relationship Id="rId${i + 2}" Type="${REL_IMAGE}" Target="../media/${m.file.split('/').pop()}"/>`;
  });
  return rels + '\r\n</Relationships>';
}

/* ═══════════════════ XML-Helfer ═══════════════════ */

function replaceRun(xml: string, from: string, to: string): string {
  return xml.split(from).join(to);
}

function textRun(value: string): string {
  return `<a:t>${escapeXml(value)}</a:t>`;
}

/** Text mit Zeilenumbrüchen als mehrere Runs mit <a:br/> (mehrzeilige Felder). */
function textWithBreaks(value: string): string {
  return value
    .split('\n')
    .map((line) => `<a:t>${escapeXml(line)}</a:t>`)
    .join('<a:br/>');
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function base64ToBytes(base64: string): Uint8Array {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
