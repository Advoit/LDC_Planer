/* ── Projekt-Export: echtes PDF (pdf-lib) mit Status-Auswahl ── */

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

async function imageBlock(
  ctx: PdfContext,
  label: string,
  images: { dataUrl: string }[],
): Promise<void> {
  if (images.length === 0) return;
  ensureSpace(ctx, 18);
  drawText(ctx, label, { size: 9.5, font: ctx.bold, color: COLORS.secondary });
  const maxWidth = (CONTENT_WIDTH - 8) / 2;

  for (const img of images) {
    const entry = await embedImage(ctx, img.dataUrl, maxWidth, 170);
    if (entry) drawImage(ctx, entry, 6);
  }
}

async function taskSection(ctx: PdfContext, task: Task): Promise<void> {
  ensureSpace(ctx, 40);
  ctx.page.drawRectangle({
    x: MARGIN - 10,
    y: ctx.y - 4,
    width: CONTENT_WIDTH + 20,
    height: 30,
    color: COLORS.headerBg,
  });

  /* Name links, Status rechts */
  const statusLabel = STATUS_LABELS[task.status] ?? task.status;
  const statusW = ctx.bold.widthOfTextAtSize(statusLabel, 10);
  const shownName = truncateToWidth(ctx.bold, task.name, 13.5, CONTENT_WIDTH - statusW - 24);
  ctx.page.drawText(shownName, {
    x: MARGIN - 2,
    y: ctx.y + 9,
    size: 13.5,
    font: ctx.bold,
    color: COLORS.text,
  });
  ctx.page.drawText(statusLabel, {
    x: MARGIN + CONTENT_WIDTH - statusW,
    y: ctx.y + 10,
    size: 10,
    font: ctx.bold,
    color: statusColor(task.status),
  });
  ctx.y -= 32;

  drawParagraph(ctx, task.description, {
    size: 10.5,
    color: COLORS.secondary,
    spacingAfter: 4,
  });

  const meta: string[] = [];
  if (task.plannedWork) meta.push(`Geplanter Aufwand: ${task.plannedWork}`);
  if (task.editedBy) meta.push(`Bearbeitet von: ${task.editedBy}`);
  if (task.editedAt) meta.push(`Bearbeitet am: ${formatDate(task.editedAt)}`);
  if (meta.length > 0) {
    drawText(ctx, meta.join('  ·  '), { size: 9.5, color: COLORS.tertiary });
  }

  if (task.hintText) {
    ensureSpace(ctx, 20);
    drawParagraph(ctx, `Hinweis: ${task.hintText}`, {
      size: 10,
      color: COLORS.orange,
      spacingAfter: 4,
    });
  }

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
}

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

  /* Kopfbereich */
  ensureSpace(ctx, 120);
  drawText(ctx, project.name, { size: 22, font: ctx.bold });
  if (project.location) {
    drawText(ctx, project.location, { size: 12, color: COLORS.secondary });
  }
  if (project.description) {
    drawParagraph(ctx, project.description, {
      size: 11,
      color: COLORS.secondary,
      spacingAfter: 6,
    });
  }
  const tasks = selectedTasks(project, opts.statuses);
  const summary = [
    `Projekt-ID: ${project.id}`,
    `Erstellt: ${formatDate(project.createdAt)}`,
    `Zuletzt geändert: ${formatDate(project.updatedAt)}`,
    `${tasks.length} ${tasks.length === 1 ? 'Aufgabe' : 'Aufgaben'}`,
    `${(project.documents ?? []).length} ${(project.documents ?? []).length === 1 ? 'Unterlage' : 'Unterlagen'}`,
  ].join('  ·  ');
  drawText(ctx, summary, { size: 9.5, color: COLORS.tertiary });
  drawHLine(ctx);

  documentList(ctx, project.documents ?? [], 'Unterlagen');

  ensureSpace(ctx, 20);
  drawText(ctx, 'Aufgaben', { size: 12, font: ctx.bold });
  ctx.y -= 4;

  if (tasks.length === 0) {
    drawParagraph(ctx, 'Keine Aufgaben vorhanden.', {
      size: 11,
      color: COLORS.tertiary,
    });
  }
  for (const task of tasks) {
    await taskSection(ctx, task);
  }

  return finalizePdf(ctx);
}

/** Dateiname für den Projektbericht (Projektname + ID, sicher bereinigt). */
export function projectReportFileName(project: Project): string {
  const safeName = project.name
    .replace(/[^a-zA-Z0-9äöüÄÖÜß _-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  return `LDC-${safeName || 'Projekt'}-${project.id}-Projektbericht.pdf`;
}
