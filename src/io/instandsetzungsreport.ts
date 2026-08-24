/* ── Instandsetzungsreport-Export: PPTX auf Basis der Vorlage „Instandsetzungsreport.pptx“ ──
 *
 * Die Ausgabe entsteht aus der Original-Vorlage (eingebettet via
 * scripts/embed-instandsetzungs-template.mjs): Seite 1 = Deckblatt (Platzhalter
 * werden ersetzt), ab Seite 2 folgt pro Mängel eine Standard-Reportseite (nach
 * Position sortiert). So sieht der Export optisch exakt wie die Vorlage aus –
 * ohne zusätzliche Abhängigkeiten.
 */

import { strToU8, unzipSync, zipSync } from 'fflate';
import { INSTANDSETZUNGSREPORT_TEMPLATE_BASE64 } from './instandsetzungsreport-template';
import {
  buildPhotoPics,
  imageToPng,
  MAX_IMAGES_PER_TILE,
  removePlaceholder,
} from './pptx-photo-tiles';
import type { SlideMedia } from './pptx-photo-tiles';
import { comparePositions } from '../domain/sort';
import type { Project, Task, TaskImage } from '../domain/types';
import type { ReportCover } from '../domain/types';

/* Deckblatt-Einstellungen – der Typ lebt im Domain-Modell, damit sie mit der
   Projektsicherung exportiert und beim Laden wiederhergestellt werden können. */
export type InstandsetzungsreportCover = ReportCover;

export interface InstandsetzungsreportOptions {
  cover: InstandsetzungsreportCover;
}

/**
 * Sammelt die Fotos einer Aufgabe für den Report – getrennt nach Vorher- und
 * Nachher-Bildern (begrenzt auf die Fassungsvermögen der jeweiligen Kachel):
 * Vorher-Bilder kommen in die obere, Nachher-Bilder in die untere Foto-Kachel.
 */
export function reportBeforeImages(task: Task): TaskImage[] {
  return task.images.slice(0, MAX_IMAGES_PER_TILE);
}

export function reportAfterImages(task: Task): TaskImage[] {
  return task.afterImages.slice(0, MAX_IMAGES_PER_TILE);
}

const REL_SLIDE_LAYOUT =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout';
const REL_SLIDE =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide';
const REL_IMAGE =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';
const CT_SLIDE =
  'application/vnd.openxmlformats-officedocument.presentationml.slide+xml';

/* ═══════════════════ Öffentliche API ═══════════════════ */

let cachedTemplate: Uint8Array | null = null;

/** Gibt die eingebettete PPTX-Vorlage als Bytes zurück (einmalig dekodiert). */
export function getInstandsetzungsreportTemplateBytes(): Uint8Array {
  if (!cachedTemplate) cachedTemplate = base64ToBytes(INSTANDSETZUNGSREPORT_TEMPLATE_BASE64);
  return cachedTemplate;
}

/**
 * Baut den Instandsetzungsreport (PPTX) aus der eingebetteten Vorlage.
 * Nur Aufgaben vom Typ „Mängel“ werden übernommen – sortiert nach Position.
 */
export async function buildInstandsetzungsreportPptx(
  project: Project,
  opts: InstandsetzungsreportOptions,
): Promise<Uint8Array> {
  const files = unzipSync(getInstandsetzungsreportTemplateBytes());
  const decode = (path: string): string =>
    new TextDecoder().decode(files[path]);

  /* ── Deckblatt (Seite 1) ── */
  files['ppt/slides/slide1.xml'] = strToU8(
    buildCoverSlide(decode('ppt/slides/slide1.xml'), opts.cover),
  );

  /* ── Reportseiten (ab Seite 2), natürlich nach Position sortiert ──
     (Buchstaben alphabetisch, Zahlen numerisch: „A1“ vor „A2“ vor „A10“) */
  const maengel = project.tasks
    .filter((t) => (t.typ ?? 'maengel') === 'maengel')
    .sort((a, b) => comparePositions(a.position, b.position));

  /* Die Musterseite (Folie 2 der Vorlage) ist nur die Basis für die
     Reportseiten – sie gehört nicht in den Export und wird entfernt. */
  const baseSlide = decode('ppt/slides/slide2.xml');
  removeTemplateSampleSlide(files);

  let contentTypes = decode('[Content_Types].xml');
  let presentation = decode('ppt/presentation.xml');
  let presRels = decode('ppt/_rels/presentation.xml.rels');
  let appXml = decode('docProps/app.xml');

  let slideNo = 3; // slide1 ist das Deckblatt, Reportseiten ab slide3
  let relId = 100; // freie Relationship-IDs (Vorlage nutzt rId1–rId12)
  let sldId = 1000; // freie Folien-IDs
  let mediaNo = 3; // Vorlage hat bereits media1.png + media2.png

  for (const task of maengel) {
    /* Vorher- und Nachher-Fotos getrennt aufbereiten (obere/untere Kachel) */
    const media: SlideMedia[] = [];
    const mediaBefore: SlideMedia[] = [];
    const mediaAfter: SlideMedia[] = [];
    for (const img of reportBeforeImages(task)) {
      const png = await imageToPng(img.dataUrl);
      const file = `ppt/media/media${mediaNo}.png`;
      files[file] = png.bytes.slice(); // slice(): typsichere eigene Kopie
      media.push({ ...png, file });
      mediaBefore.push({ ...png, file });
      mediaNo++;
    }
    for (const img of reportAfterImages(task)) {
      const png = await imageToPng(img.dataUrl);
      const file = `ppt/media/media${mediaNo}.png`;
      files[file] = png.bytes.slice();
      media.push({ ...png, file });
      mediaAfter.push({ ...png, file });
      mediaNo++;
    }

    files[`ppt/slides/slide${slideNo}.xml`] = strToU8(
      buildReportSlide(baseSlide, task, opts.cover, mediaBefore, mediaAfter),
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
  appXml = appXml.replace(
    /<Slides>\d+<\/Slides>/,
    `<Slides>${maengel.length + 1}</Slides>`,
  );
  files['docProps/app.xml'] = strToU8(appXml);

  /* slice() liefert eine eigene Kopie (typsicher Uint8Array) */
  return zipSync(files, { level: 6 }).slice();
}

/**
 * Entfernt die ungefüllte Musterseite (slide2.xml) der Vorlage aus dem Export:
 * Die Reportseiten werden aus ihr abgeleitet, sie selbst darf nicht in der
 * Präsentation erscheinen. Entfernt werden die Folie, ihre Relationships,
 * der Eintrag in der sldIdLst, das Präsentations-Relationship und der
 * Content-Type-Override.
 */
function removeTemplateSampleSlide(files: Record<string, Uint8Array>): void {
  const decode = (path: string): string =>
    new TextDecoder().decode(files[path]);

  /* rId der Musterseite in den Präsentations-Relationships finden */
  let presRels = decode('ppt/_rels/presentation.xml.rels');
  const relMatch = presRels.match(
    /<Relationship[^>]*Id="(rId\d+)"[^>]*Target="slides\/slide2\.xml"[^>]*\/>/,
  );
  if (!relMatch) return;
  const rid = relMatch[1];
  presRels = presRels.replace(relMatch[0], '');
  files['ppt/_rels/presentation.xml.rels'] = strToU8(presRels);

  /* sldId der Musterseite aus der sldIdLst entfernen */
  let presentation = decode('ppt/presentation.xml');
  const sldIdMatch = presentation.match(
    new RegExp(`<p:sldId[^>]*r:id="${rid}"[^>]*/>`),
  );
  if (sldIdMatch) {
    presentation = presentation.replace(sldIdMatch[0], '');
    files['ppt/presentation.xml'] = strToU8(presentation);
  }

  /* Content-Type-Override für die Musterseite entfernen */
  const ct = decode('[Content_Types].xml');
  const ctMatch = ct.match(
    /<Override PartName="\/ppt\/slides\/slide2\.xml"[^>]*\/>/,
  );
  if (ctMatch) {
    files['[Content_Types].xml'] = strToU8(ct.replace(ctMatch[0], ''));
  }

  /* Folie und ihre Relationships entfernen */
  delete files['ppt/slides/slide2.xml'];
  delete files['ppt/slides/_rels/slide2.xml.rels'];
}

/** Dateiname für den Instandsetzungsreport (Projektname, sicher bereinigt). */
export function instandsetzungsreportFileName(project: Project): string {
  const safeName = project.name
    .replace(/[^a-zA-Z0-9äöüÄÖÜß _-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  return `Instandsetzungsreport-${safeName || 'Projekt'}.pptx`;
}

/* ═══════════════════ Deckblatt ═══════════════════ */

function buildCoverSlide(template: string, cover: InstandsetzungsreportCover): string {
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
    textRun(`Ausführungstermin:\t${formatCoverTermin(cover.termin)}`),
  );
  return xml;
}

/** Formatiert den Ausführungstermin: „unbekannt“ (leer) → „XX.XX.<aktuelles Jahr>“. */
function formatCoverTermin(termin: string): string {
  if (termin.trim()) return termin;
  return `XX.XX.${new Date().getFullYear()}`;
}

/* ═══════════════════ Reportseite ═══════════════════ */

/**
 * Baut eine Reportseite aus der Vorlagen-Folie.
 * Die Fotos werden in den beiden Foto-Kacheln der Vorlage platziert:
 * obere Kachel = Vorher-Bilder, untere Kachel = Nachher-Bilder. In jeder
 * Kachel gilt ein 2-Spalten-Raster: 1 Bild = ganze Kachel, 2 = nebeneinander,
 * 3 = 2 oben + 1 unten breit, 4 = 2×2-Quadrat.
 */
export function buildReportSlide(
  template: string,
  task: Task,
  cover: InstandsetzungsreportCover,
  beforeMedia: SlideMedia[],
  afterMedia: SlideMedia[],
): string {
  let xml = template;

  const pruefung = task.pruefung.trim();
  /* Fehlerbeschreibung: neues Feld, sonst Rückgriff auf die Beschreibung */
  const fehler =
    task.fehlerbeschreibung.trim() || task.description.trim();
  /* Hinweistext der Aufgabe (Status-Bereich) für das Textfeld unten rechts */
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
  /* „Hinweis zur Behebung: […]“ – eckige Klammern entfernen und die
     Aufgabe-Beschreibung dahinter einsetzen (statt Name + Beschreibung unten) */
  xml = replaceRun(
    xml,
    '<a:t>⚠️Hinweis zur Behebung:\u200B [</a:t>',
    '<a:t>⚠️Hinweis zur Behebung:\u200B </a:t>',
  );
  xml = replaceRun(
    xml,
    '<a:t>Beschreibung</a:t>',
    textWithBreaks(task.description.trim()),
  );
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

  /* Textfeld unten rechts (Bildbeschreibung): Hinweistext der Aufgabe */
  if (hinweis) {
    xml = xml.replace(
      '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="de-DE" dirty="0"/></a:p></p:txBody>',
      buildHintBody(hinweis),
    );
  }

  /* Fotos: Platzhalter der jeweiligen Kachel entfernen und Fotos in die
     Kacheln setzen (oben Vorher, unten Nachher). Ohne Fotos bleiben die
     Platzhalter (wie in der Vorlage) sichtbar. */
  if (beforeMedia.length > 0 || afterMedia.length > 0) {
    if (beforeMedia.length > 0) {
      xml = removePlaceholder(xml, 'Bildplatzhalter 3'); // obere Kachel (Vorher)
    }
    if (afterMedia.length > 0) {
      xml = removePlaceholder(xml, 'Bildplatzhalter 1'); // untere Kachel (Nachher)
    }
    const pics = buildPhotoPics(beforeMedia, afterMedia);
    xml = xml.replace('</p:spTree>', pics + '</p:spTree>');
  }

  return xml;
}

function buildHintBody(text: string): string {
  const paragraphs = text.split('\n').map(
    (line) =>
      `<a:p><a:r><a:rPr lang="de-DE" dirty="0"/><a:t>${escapeXml(line)}</a:t></a:r></a:p>`,
  );
  return `<p:txBody><a:bodyPr/><a:lstStyle/>${paragraphs.join('')}</p:txBody>`;
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

/**
 * Text mit Zeilenumbrüchen schema-konform aufbereiten: Ein DrawingML-Run
 * (<a:r>) darf nur EIN <a:t> enthalten; Zeilenumbrüche gehören als <a:br/>
 * auf Absatzebene zwischen die Runs. Die erste Zeile bleibt im bestehenden
 * Run, jede weitere Zeile schließt den Run ab und öffnet einen neuen
 * (<a:br/> dazwischen). So bleibt das XML gültig und PowerPoint repariert
 * die Datei nicht.
 */
function textWithBreaks(value: string): string {
  const lines = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  let out = `<a:t>${escapeXml(lines[0])}</a:t>`;
  for (let i = 1; i < lines.length; i++) {
    out += `</a:r><a:br/><a:r><a:rPr lang="de-DE" dirty="0"/><a:t>${escapeXml(lines[i])}</a:t>`;
  }
  return out;
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
