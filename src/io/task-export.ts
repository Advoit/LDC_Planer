/* ── Einzelaufgabe als PDF (Mängelblatt) ── */

import type { Project, Task } from '../domain/types';
import {
  createPdfContext,
  drawHLine,
  drawText,
  finalizePdf,
  formatDate,
  COLORS,
} from './pdf';
import { drawTaskSection } from './pdf-task';
import { exportBaseName, safeFileNamePart } from '../core/file-name';

/**
 * Erstellt ein PDF mit genau einer Aufgabe (Titelblock, Beschreibung, Material,
 * Hinweis sowie Vorher-/Nachher-Bildern und Dokumenten) – ideal zum Ausdrucken.
 */
export async function buildTaskPdf(
  project: Project,
  task: Task,
): Promise<Uint8Array> {
  const now = new Date().toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const ctx = await createPdfContext(
    `${project.name}  ·  Exportiert am ${now} mit LDC Planer`,
  );

  /* Kopfzeile: Projekt + Datum */
  drawText(ctx, project.name, { size: 16, font: ctx.bold });
  const sub = [project.location, `Angelegt: ${formatDate(task.createdAt)}`]
    .filter(Boolean)
    .join('  ·  ');
  drawText(ctx, sub, { size: 9.5, color: COLORS.tertiary });
  drawHLine(ctx);
  ctx.y -= 6;

  await drawTaskSection(ctx, task);

  return finalizePdf(ctx);
}

/** Dateiname für das Aufgaben-PDF (Projektname, ID und Aufgabenname). */
export function taskReportFileName(project: Project, task: Task): string {
  return `${exportBaseName(project.name, project.id)}-${safeFileNamePart(task.name)}.pdf`;
}
