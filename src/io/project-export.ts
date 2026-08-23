/* ── Projekt-Export: echtes PDF (pdf-lib) mit Deckblatt, Inhaltsverzeichnis & Status-Auswahl ── */

import { STATUS_LABELS } from '../domain/types';
import type { Project, ProjectDocument, Task, TaskStatus } from '../domain/types';
import {
  createPdfContext,
  ensureSpace,
  drawText,
  drawParagraph,
  drawHLine,
  drawCentered,
  drawCenteredParagraph,
  drawTable,
  embedImage,
  embedTransparentImage,
  drawImage,
  finalizePdf,
  formatDate,
  formatFileSize,
  statusColor,
  truncateToWidth,
  COLORS,
  PAGE_WIDTH,
  PAGE_HEIGHT,
  CONTENT_WIDTH,
  MARGIN,
} from './pdf';
import type { PdfContext, PdfTableCol, PdfTableRow } from './pdf';

export interface ProjectExportOptions {
  /** Zu exportierende Status (leer = alle). */
  statuses: Set<TaskStatus>;
}

function selectedTasks(project: Project, statuses: Set<TaskStatus>): Task[] {
  if (!statuses || statuses.size === 0) return project.tasks;
  return project.tasks.filter((t) => statuses.has(t.status));
}

/* ═════════════ Deckblatt ═════════════ */

/** Lädt das aktuelle App-Logo (favicon.svg) als dataURL. */
async function fetchLogoDataUrl(): Promise<string | null> {
  try {
    const res = await fetch('favicon.svg');
    if (!res.ok) return null;
    const text = await res.text();
    const bytes = new TextEncoder().encode(text);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return `data:image/svg+xml;base64,${btoa(bin)}`;
  } catch {
    return null;
  }
}

async function drawCover(ctx: PdfContext, project: Project, now: string): Promise<void> {
  /* Blauer Briefkopf über die volle Breite */
  const bandH = 110;
  ctx.page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - bandH,
    width: PAGE_WIDTH,
    height: bandH,
    color: COLORS.blue,
  });

  /* Logo oben rechts – ohne Umrandung, direkt auf dem Briefkopf */
  const logoDataUrl = await fetchLogoDataUrl();
  const logo = logoDataUrl
    ? await embedTransparentImage(ctx, logoDataUrl, 84, 84)
    : null;
  if (logo) {
    ctx.page.drawImage(logo.image, {
      x: PAGE_WIDTH - MARGIN - logo.width,
      y: PAGE_HEIGHT - bandH + (bandH - logo.height) / 2,
      width: logo.width,
      height: logo.height,
    });
  }

  /* Wortmarke links im Briefkopf */
  ctx.page.drawText('LDC Planer', {
    x: MARGIN,
    y: PAGE_HEIGHT - bandH + (bandH - 16) / 2 + 4,
    size: 16,
    font: ctx.bold,
    color: COLORS.white,
  });

  /* Inhalt unterhalb des Briefkopfs */
  ctx.y = PAGE_HEIGHT - bandH - 44;

  /* Projektname */
  drawCenteredParagraph(ctx, project.name, {
    size: 30,
    font: ctx.bold,
    maxWidth: CONTENT_WIDTH - 40,
    spacingAfter: 18,
  });

  /* Akzentlinie */
  const ruleW = 48;
  ctx.page.drawRectangle({
    x: MARGIN + (CONTENT_WIDTH - ruleW) / 2,
    y: ctx.y + 8,
    width: ruleW,
    height: 2.5,
    color: COLORS.blue,
  });
  ctx.y -= 24;

  /* Ort */
  if (project.location) {
    drawCentered(ctx, project.location, { size: 14, color: COLORS.secondary });
  }
  ctx.y -= 8;

  /* Beschreibung */
  if (project.description) {
    drawCenteredParagraph(ctx, project.description, {
      size: 11.5,
      color: COLORS.secondary,
      maxWidth: 430,
      spacingAfter: 28,
    });
  } else {
    ctx.y -= 28;
  }

  /* Zusammenfassungs-Kasten (zentriert, schlicht) */
  const boxLines = [
    `Projekt-ID: ${project.id}`,
    `Erstellt: ${formatDate(project.createdAt)}`,
    `Zuletzt geändert: ${formatDate(project.updatedAt)}`,
    `${project.tasks.length} ${project.tasks.length === 1 ? 'Aufgabe' : 'Aufgaben'} · ${(project.documents ?? []).length} ${(project.documents ?? []).length === 1 ? 'Unterlage' : 'Unterlagen'}`,
  ];
  const lineH = 17;
  const padY = 12;
  const boxW = Math.min(440, CONTENT_WIDTH);
  const boxX = MARGIN + (CONTENT_WIDTH - boxW) / 2;
  const boxH = boxLines.length * lineH + padY * 2;
  ensureSpace(ctx, boxH + 30);
  const boxBottom = ctx.y - boxH;

  ctx.page.drawRectangle({
    x: boxX,
    y: boxBottom,
    width: boxW,
    height: boxH,
    color: COLORS.headerBg,
  });
  ctx.page.drawRectangle({
    x: boxX,
    y: boxBottom,
    width: 3.5,
    height: boxH,
    color: COLORS.blue,
  });

  let ly = ctx.y - padY - lineH + 5;
  for (const line of boxLines) {
    ctx.page.drawText(line, {
      x: boxX + 16,
      y: ly,
      size: 10.5,
      font: ctx.font,
      color: COLORS.text,
    });
    ly -= lineH;
  }

  /* Fußbereich des Deckblatts */
  const foot = `Exportiert am ${now}  ·  LDC Planer`;
  ctx.page.drawText(foot, {
    x: MARGIN + (CONTENT_WIDTH - ctx.font.widthOfTextAtSize(foot, 9)) / 2,
    y: 36,
    size: 9,
    font: ctx.font,
    color: COLORS.tertiary,
  });
}

/* ═════════════ Inhaltsverzeichnis ═════════════ */

interface TocEntry {
  prefix: string;
  label: string;
  page: number; // Seitenzahl im finalen Dokument
  indent?: boolean;
}

function tocLine(ctx: PdfContext, entry: TocEntry): void {
  ensureSpace(ctx, 22);
  const size = 11;
  const prefixW = ctx.bold.widthOfTextAtSize(entry.prefix, size);
  const pageStr = String(entry.page);
  const pageW = ctx.bold.widthOfTextAtSize(pageStr, size);
  const indentX = entry.indent ? 14 : 0;
  const titleX = MARGIN + prefixW + indentX + 10;
  const maxTitleW = CONTENT_WIDTH - prefixW - indentX - 20 - pageW - 36;
  const shown = truncateToWidth(ctx.font, entry.label, size, maxTitleW);

  ctx.page.drawText(entry.prefix, {
    x: MARGIN + indentX,
    y: ctx.y,
    size,
    font: ctx.bold,
    color: COLORS.text,
  });
  ctx.page.drawText(shown, { x: titleX, y: ctx.y, size, font: ctx.font });
  ctx.page.drawText(pageStr, {
    x: MARGIN + CONTENT_WIDTH - pageW,
    y: ctx.y,
    size,
    font: ctx.bold,
    color: COLORS.text,
  });

  /* Gepunktete Führungslinie zwischen Titel und Seitenzahl */
  const leaderStart = titleX + ctx.font.widthOfTextAtSize(shown, size) + 8;
  const leaderEnd = MARGIN + CONTENT_WIDTH - pageW - 12;
  if (leaderEnd > leaderStart) {
    ctx.page.drawLine({
      start: { x: leaderStart, y: ctx.y + 3.6 },
      end: { x: leaderEnd, y: ctx.y + 3.6 },
      thickness: 0.6,
      color: COLORS.border,
      dashArray: [1, 3],
    });
  }
  ctx.y -= 20;
}

function insertTableOfContents(
  ctx: PdfContext,
  entries: TocEntry[],
  projectName: string,
): void {
  ctx.doc.insertPage(1, [PAGE_WIDTH, PAGE_HEIGHT]);
  ctx.page = ctx.doc.getPage(1);
  ctx.y = PAGE_HEIGHT - MARGIN;

  ensureSpace(ctx, 90);
  drawText(ctx, 'Inhaltsverzeichnis', { size: 18, font: ctx.bold });
  drawText(ctx, projectName, { size: 11, color: COLORS.secondary });
  drawHLine(ctx);
  ctx.y -= 6;

  for (const entry of entries) tocLine(ctx, entry);
}

/* ═════════════ Dokumentlisten ═════════════ */

function documentLine(ctx: PdfContext, doc: ProjectDocument): void {
  ensureSpace(ctx, 16);
  const sizeLabel = formatFileSize(doc.size);
  const sizeW = ctx.font.widthOfTextAtSize(sizeLabel, 9);
  const maxNameW = CONTENT_WIDTH - 12 - sizeW - 16;
  const shownName = truncateToWidth(ctx.font, doc.name, 10, maxNameW);
  ctx.page.drawText(shownName, { x: MARGIN + 12, y: ctx.y, size: 10 });
  ctx.page.drawText(sizeLabel, {
    x: MARGIN + CONTENT_WIDTH - sizeW,
    y: ctx.y,
    size: 9,
    color: COLORS.tertiary,
  });
  ctx.y -= 14;
}

/** Abschnitts-Überschrift mit Trennlinie darüber (für jeden Hauptpunkt). */
function drawSectionHeading(ctx: PdfContext, label: string): void {
  ensureSpace(ctx, 44);
  drawHLine(ctx);
  ctx.y -= 4;
  drawText(ctx, label, { size: 14, font: ctx.bold });
  ctx.y -= 8;
}

function documentList(
  ctx: PdfContext,
  documents: ProjectDocument[],
  label: string,
): void {
  if (documents.length === 0) return;
  ensureSpace(ctx, 18);
  ctx.page.drawRectangle({
    x: MARGIN,
    y: ctx.y - 2,
    width: CONTENT_WIDTH,
    height: 16,
    color: COLORS.headerBg,
  });
  drawText(ctx, label, { size: 9.5, font: ctx.bold, color: COLORS.secondary });
  for (const doc of documents) documentLine(ctx, doc);
  ctx.y -= 6;
}

/* ═════════════ Bilder (bis zu 2 pro Reihe) ═════════════ */

async function imageBlock(
  ctx: PdfContext,
  label: string,
  images: { dataUrl: string }[],
  spaceBefore = 0,
): Promise<void> {
  if (images.length === 0) return;
  ensureSpace(ctx, 18 + spaceBefore);
  ctx.y -= spaceBefore;
  drawText(ctx, label, { size: 9.5, font: ctx.bold, color: COLORS.secondary });

  const maxWidth = (CONTENT_WIDTH - 8) / 2;
  const maxHeight = 170;
  const halfW = CONTENT_WIDTH / 2;

  for (let i = 0; i < images.length; i += 2) {
    const a = await embedImage(ctx, images[i].dataUrl, maxWidth, maxHeight);
    const b =
      i + 1 < images.length
        ? await embedImage(ctx, images[i + 1].dataUrl, maxWidth, maxHeight)
        : null;

    /* Ein einzelnes (bzw. nur ein erfolgreiches) Bild zentriert zeichnen */
    if (!a || !b) {
      if (a) drawImage(ctx, a, 10);
      else if (b) drawImage(ctx, b, 10);
      continue;
    }

    /* Beide Bilder nebeneinander, jeweils mittig in ihrer Hälfte */
    const rowH = Math.max(a.height, b.height) + 10;
    ensureSpace(ctx, rowH);
    const ax = MARGIN + (halfW - a.width) / 2;
    const bx = MARGIN + halfW + (halfW - b.width) / 2;
    ctx.page.drawImage(a.image, {
      x: ax,
      y: ctx.y - a.height,
      width: a.width,
      height: a.height,
    });
    ctx.page.drawImage(b.image, {
      x: bx,
      y: ctx.y - b.height,
      width: b.width,
      height: b.height,
    });
    ctx.y -= rowH;
  }
}

/* ═════════════ Aufgaben-Abschnitt ═════════════ */

async function taskSection(ctx: PdfContext, task: Task): Promise<number> {
  ensureSpace(ctx, 64);

  /* Startseite fürs Inhaltsverzeichnis (nach möglichem Seitenumbruch) */
  const startPage = ctx.doc.getPageCount();

  /* Titelblock: Hintergrund darf die Überschrift darüber nicht überdecken */
  const rectBottom = ctx.y - 6;
  const rectHeight = 30;
  ctx.page.drawRectangle({
    x: MARGIN - 10,
    y: rectBottom,
    width: CONTENT_WIDTH + 20,
    height: rectHeight,
    color: COLORS.headerBg,
  });

  const statusLabel = STATUS_LABELS[task.status] ?? task.status;
  const statusW = ctx.bold.widthOfTextAtSize(statusLabel, 10);
  const shownName = truncateToWidth(
    ctx.bold,
    task.name,
    12.5,
    CONTENT_WIDTH - statusW - 24,
  );
  /* Titel & Status vertikal zentriert im grauen Kasten */
  ctx.page.drawText(shownName, {
    x: MARGIN - 2,
    y: rectBottom + 12,
    size: 12.5,
    font: ctx.bold,
    color: COLORS.text,
  });
  ctx.page.drawText(statusLabel, {
    x: MARGIN + CONTENT_WIDTH - statusW,
    y: rectBottom + 12.5,
    size: 10,
    font: ctx.bold,
    color: statusColor(task.status),
  });
  /* Etwas mehr Abstand zur darunter liegenden Zeile */
  ctx.y = rectBottom - 13;

  /* Beschreibung */
  drawParagraph(ctx, task.description, {
    size: 10.5,
    color: COLORS.secondary,
    spacingAfter: 4,
  });

  /* Metazeile (umbrechend, damit nichts am rechten Rand abgeschnitten wird) */
  const meta: string[] = [];
  if (task.plannedWork) meta.push(`Geplanter Aufwand: ${task.plannedWork}`);
  if (task.personnel) meta.push(`Personalbedarf: ${task.personnel}`);
  if (task.editedBy) meta.push(`Bearbeitet von: ${task.editedBy}`);
  if (task.editedAt) meta.push(`Bearbeitet am: ${formatDate(task.editedAt)}`);
  if (meta.length > 0) {
    drawParagraph(ctx, meta.join('  ·  '), {
      size: 9.5,
      color: COLORS.tertiary,
      spacingAfter: 2,
    });
  }

  /* Hinweistext: schwarz, Status bleibt farbig */
  if (task.hintText) {
    ensureSpace(ctx, 20);
    drawParagraph(ctx, `Hinweis: ${task.hintText}`, {
      size: 10,
      color: COLORS.text,
      spacingAfter: 4,
    });
  }

  /* Materialtabelle */
  if (task.material.length > 0) {
    const cols: PdfTableCol[] = [
      { header: 'Material', width: 0.62 },
      { header: 'Menge', width: 0.16, align: 'right' },
      { header: 'Einheit', width: 0.22 },
    ];
    const rows: PdfTableRow[] = task.material.map((m) => ({
      cells: [m.name, String(m.quantity), m.unit],
    }));
    ensureSpace(ctx, 30);
    drawTable(ctx, cols, rows);
  }

  await imageBlock(ctx, 'Vorher-Bilder', task.images);
  await imageBlock(ctx, 'Nachher-Bilder', task.afterImages, 10);
  documentList(ctx, task.documents, 'Dokumente');
  documentList(ctx, task.afterDocuments, 'Nachher-Dokumente');
  /* Klarer Abstand zur nächsten Aufgabe */
  ctx.y -= 20;

  return startPage;
}

/* ═════════════ Bericht bauen ═════════════ */

export async function buildProjectPdf(
  project: Project,
  opts: ProjectExportOptions,
): Promise<Uint8Array> {
  const now = new Date().toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const ctx = await createPdfContext(`Exportiert am ${now} mit LDC Planer`);

  /* ── Seite 1: Deckblatt ── */
  await drawCover(ctx, project, now);

  /* ── Seite 2+: Bericht ── */
  ctx.page = ctx.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  ctx.y = PAGE_HEIGHT - MARGIN;
  const contentStartPage = ctx.doc.getPageCount(); // 2

  /* ── Abschnitt: Projektinformationen ── */
  drawSectionHeading(ctx, 'Projektinformationen');
  ctx.y -= 2;
  drawText(ctx, project.name, { size: 13, font: ctx.bold });
  if (project.location) {
    drawText(ctx, project.location, { size: 11, color: COLORS.secondary });
  }
  const tasks = selectedTasks(project, opts.statuses);
  const summary = [
    `Projekt-ID: ${project.id}`,
    `Erstellt: ${formatDate(project.createdAt)}`,
    `Zuletzt geändert: ${formatDate(project.updatedAt)}`,
    `${tasks.length} ${tasks.length === 1 ? 'Aufgabe' : 'Aufgaben'}`,
    `${(project.documents ?? []).length} ${(project.documents ?? []).length === 1 ? 'Unterlage' : 'Unterlagen'}`,
  ].join('  ·  ');
  drawText(ctx, truncateToWidth(ctx.font, summary, 9.5, CONTENT_WIDTH), {
    size: 9.5,
    color: COLORS.tertiary,
  });
  ctx.y -= 6;

  /* ── Abschnitt: Unterlagen ── */
  if ((project.documents ?? []).length > 0) {
    drawSectionHeading(ctx, 'Unterlagen');
    for (const doc of project.documents ?? []) documentLine(ctx, doc);
    ctx.y -= 4;
  }

  /* ── Abschnitt: Aufgaben ── */
  drawSectionHeading(ctx, 'Aufgaben');
  /* Abstand zur ersten Aufgabe, damit der Titelblock nichts überdeckt */
  ctx.y -= 6;

  const tocEntries: TocEntry[] = [
    { prefix: '1.', label: 'Projektinformationen', page: contentStartPage + 1 },
  ];
  if ((project.documents ?? []).length > 0) {
    tocEntries.push({
      prefix: '2.',
      label: 'Unterlagen',
      page: contentStartPage + 1,
    });
  }
  tocEntries.push({
    prefix: String(tocEntries.length + 1) + '.',
    label: 'Aufgaben',
    page: contentStartPage + 1,
  });

  if (tasks.length === 0) {
    drawParagraph(ctx, 'Keine Aufgaben vorhanden.', {
      size: 11,
      color: COLORS.tertiary,
    });
  }
  for (const task of tasks) {
    const startPage = await taskSection(ctx, task);
    tocEntries.push({
      prefix: '–',
      label: task.name,
      page: startPage + 1,
      indent: true,
    });
  }

  /* ── Inhaltsverzeichnis auf Seite 2 einfügen ── */
  insertTableOfContents(ctx, tocEntries, project.name);

  return finalizePdf(ctx, { skipFirstPage: true });
}

/** Dateiname für den Projektbericht (Projektname + ID, sicher bereinigt). */
export function projectReportFileName(project: Project): string {
  const safeName = project.name
    .replace(/[^a-zA-Z0-9äöüÄÖÜß _-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  return `LDC-${safeName || 'Projekt'}-${project.id}-Projektbericht.pdf`;
}
