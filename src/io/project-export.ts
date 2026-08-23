/* ── Projekt-Export: echtes PDF (pdf-lib) mit Deckblatt, Inhaltsverzeichnis & Status-Auswahl ── */

import { STATUS_LABELS } from '../domain/types';
import type { Project, ProjectDocument, Task, TaskStatus } from '../domain/types';
import {
  createPdfContext,
  ensureSpace,
  drawText,
  drawParagraph,
  drawHLine,
  drawTable,
  embedImage,
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

function drawCover(ctx: PdfContext, project: Project, now: string): void {
  /* Akzentband oben */
  ctx.page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - 12,
    width: PAGE_WIDTH,
    height: 12,
    color: COLORS.blue,
  });

  ctx.y = PAGE_HEIGHT - 96;

  /* Kicker */
  ctx.page.drawText('LDC PROJEKT PLANER', {
    x: MARGIN,
    y: ctx.y,
    size: 11,
    font: ctx.bold,
    color: COLORS.blue,
  });
  ctx.y -= 30;

  /* Projektname */
  drawParagraph(ctx, project.name, { size: 26, font: ctx.bold, spacingAfter: 8 });

  /* Ort */
  if (project.location) {
    drawParagraph(ctx, project.location, {
      size: 14,
      color: COLORS.secondary,
      spacingAfter: 14,
    });
  }

  /* Beschreibung */
  if (project.description) {
    drawParagraph(ctx, project.description, {
      size: 11.5,
      color: COLORS.secondary,
      spacingAfter: 20,
    });
  }

  /* Zusammenfassungs-Kasten */
  const boxLines = [
    `Projekt-ID: ${project.id}`,
    `Erstellt: ${formatDate(project.createdAt)}`,
    `Zuletzt geändert: ${formatDate(project.updatedAt)}`,
    `${project.tasks.length} ${project.tasks.length === 1 ? 'Aufgabe' : 'Aufgaben'} · ${(project.documents ?? []).length} ${(project.documents ?? []).length === 1 ? 'Unterlage' : 'Unterlagen'}`,
  ];
  const lineH = 17;
  const padY = 10;
  const boxH = boxLines.length * lineH + padY * 2;
  const boxBottom = ctx.y - boxH;

  ctx.page.drawRectangle({
    x: MARGIN - 10,
    y: boxBottom,
    width: CONTENT_WIDTH + 20,
    height: boxH,
    color: COLORS.headerBg,
  });
  ctx.page.drawRectangle({
    x: MARGIN - 10,
    y: boxBottom,
    width: 3.5,
    height: boxH,
    color: COLORS.blue,
  });

  let ly = ctx.y - padY - lineH + 5;
  for (const line of boxLines) {
    ctx.page.drawText(line, {
      x: MARGIN + 4,
      y: ly,
      size: 10.5,
      font: ctx.font,
      color: COLORS.text,
    });
    ly -= lineH;
  }

  /* Fußbereich des Deckblatts */
  ctx.page.drawText(`Exportiert am ${now}`, {
    x: MARGIN,
    y: 44,
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
): Promise<void> {
  if (images.length === 0) return;
  ensureSpace(ctx, 18);
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
      if (a) drawImage(ctx, a, 6);
      else if (b) drawImage(ctx, b, 6);
      continue;
    }

    /* Beide Bilder nebeneinander, jeweils mittig in ihrer Hälfte */
    const rowH = Math.max(a.height, b.height) + 6;
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
    13.5,
    CONTENT_WIDTH - statusW - 24,
  );
  ctx.page.drawText(shownName, {
    x: MARGIN - 2,
    y: rectBottom + 17,
    size: 13.5,
    font: ctx.bold,
    color: COLORS.text,
  });
  ctx.page.drawText(statusLabel, {
    x: MARGIN + CONTENT_WIDTH - statusW,
    y: rectBottom + 18,
    size: 10,
    font: ctx.bold,
    color: statusColor(task.status),
  });
  ctx.y = rectBottom - 8;

  /* Beschreibung */
  drawParagraph(ctx, task.description, {
    size: 10.5,
    color: COLORS.secondary,
    spacingAfter: 4,
  });

  /* Metazeile (umbrechend, damit nichts am rechten Rand abgeschnitten wird) */
  const meta: string[] = [];
  if (task.plannedWork) meta.push(`Geplanter Aufwand: ${task.plannedWork}`);
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
  await imageBlock(ctx, 'Nachher-Bilder', task.afterImages);
  documentList(ctx, task.documents, 'Dokumente');
  documentList(ctx, task.afterDocuments, 'Nachher-Dokumente');
  ctx.y -= 8;

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
  const ctx = await createPdfContext(
    `Exportiert am ${now} mit LDC Projekt Planer`,
  );

  /* ── Seite 1: Deckblatt ── */
  drawCover(ctx, project, now);

  /* ── Seite 2+: Bericht ── */
  ctx.page = ctx.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  ctx.y = PAGE_HEIGHT - MARGIN;
  const contentStartPage = ctx.doc.getPageCount(); // 2

  /* Kompakter Berichtskopf */
  ensureSpace(ctx, 90);
  drawText(ctx, 'Projektbericht', { size: 16, font: ctx.bold });
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
  drawHLine(ctx);

  documentList(ctx, project.documents ?? [], 'Unterlagen');

  /* ── Aufgaben ── */
  ensureSpace(ctx, 24);
  drawText(ctx, 'Aufgaben', { size: 12, font: ctx.bold });
  /* Abstand zur ersten Aufgabe, damit der Titelblock nichts überdeckt */
  ctx.y -= 12;

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
