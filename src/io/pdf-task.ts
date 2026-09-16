/* ── PDF-Bausteine für Aufgaben: Titelblock, Material, Bilder, Dokumente ── */

import { STATUS_LABELS } from '../domain/types';
import type { ProjectDocument, Task, TaskStatus } from '../domain/types';
import {
  drawImage,
  drawParagraph,
  drawTable,
  drawText,
  ensureSpace,
  embedImage,
  formatDate,
  formatFileSize,
  statusColor,
  truncateToWidth,
  drawHLine,
  COLORS,
  CONTENT_WIDTH,
  MARGIN,
  PAGE_HEIGHT,
  PAGE_WIDTH,
} from './pdf';
import type { PdfContext, PdfTableCol, PdfTableRow } from './pdf';

/** Beginnt eine neue Seite und liefert deren (1-basierte) Seitenzahl. */
export function newPage(ctx: PdfContext): number {
  ctx.page = ctx.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  ctx.y = PAGE_HEIGHT - MARGIN;
  return ctx.doc.getPageCount();
}

/** Abschnitts-Überschrift mit Trennlinie darüber (für jeden Hauptpunkt). */
export function drawSectionHeading(ctx: PdfContext, label: string): void {
  ensureSpace(ctx, 44);
  drawHLine(ctx);
  ctx.y -= 4;
  drawText(ctx, label, { size: 14, font: ctx.bold });
  ctx.y -= 8;
}

/** Überschrift einer Statusgruppe (Offen / Hinweis / Behoben). */
export function drawStatusHeading(
  ctx: PdfContext,
  status: TaskStatus,
  count: number,
): void {
  ensureSpace(ctx, 44);
  drawText(ctx, `${STATUS_LABELS[status]} (${count})`, {
    size: 15,
    font: ctx.bold,
    color: statusColor(status),
  });
  drawHLine(ctx);
  ctx.y -= 4;
}

/* ═════════════ Dokumentlisten ═════════════ */

export function documentLine(ctx: PdfContext, doc: ProjectDocument): void {
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

export function documentList(
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

/**
 * Zeichnet eine Aufgabe ab der aktuellen Schreibposition und liefert die
 * Seitenzahl, auf der die Aufgabe beginnt (für das Inhaltsverzeichnis).
 */
export async function drawTaskSection(
  ctx: PdfContext,
  task: Task,
): Promise<number> {
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
