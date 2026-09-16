/* ── Projektbericht-PDF: Deckblatt, Inhaltsverzeichnis, nach Status gruppierte Aufgaben ── */

import { STATUS_LABELS, TASK_STATUSES } from '../domain/types';
import type { Project, Task, TaskStatus } from '../domain/types';
import {
  createPdfContext,
  drawParagraph,
  drawText,
  finalizePdf,
  formatDate,
  truncateToWidth,
  COLORS,
  CONTENT_WIDTH,
  MARGIN,
  PAGE_HEIGHT,
  PAGE_WIDTH,
} from './pdf';
import { drawCover } from './pdf-cover';
import { exportFileName } from '../core/file-name';
import { insertTableOfContents, paginateToc } from './pdf-toc';
import type { TocEntry } from './pdf-toc';
import type { PdfContext } from './pdf';
import {
  documentLine,
  drawSectionHeading,
  drawStatusHeading,
  drawTaskSection,
  newPage,
} from './pdf-task';

export interface ProjectExportOptions {
  /** Zu exportierende Status (leer = alle). */
  statuses: Set<TaskStatus>;
  /** Nur diese Aufgaben exportieren (z. B. eine Auswahl aus der Übersicht). */
  taskIds?: Set<string>;
}

function selectedTasks(project: Project, opts: ProjectExportOptions): Task[] {
  let tasks = project.tasks;
  if (opts.taskIds) tasks = tasks.filter((t) => opts.taskIds!.has(t.id));
  if (opts.statuses && opts.statuses.size > 0) {
    tasks = tasks.filter((t) => opts.statuses.has(t.status));
  }
  return tasks;
}

interface TaskGroup {
  status: TaskStatus;
  tasks: Task[];
}

function groupByStatus(tasks: Task[]): TaskGroup[] {
  return TASK_STATUSES.map((status) => ({
    status,
    tasks: tasks.filter((t) => t.status === status),
  })).filter((group) => group.tasks.length > 0);
}

/* ── Inhaltsseite: Projektinformationen, Unterlagen, Aufgaben-Übersicht ── */

function drawContentSection(
  ctx: PdfContext,
  project: Project,
  tasks: Task[],
  groups: TaskGroup[],
): void {
  /* Projektinformationen */
  drawSectionHeading(ctx, 'Projektinformationen');
  ctx.y -= 2;
  drawText(ctx, project.name, { size: 13, font: ctx.bold });
  if (project.location) {
    drawText(ctx, project.location, { size: 11, color: COLORS.secondary });
  }
  const docCount = (project.documents ?? []).length;
  const summary = [
    `Projekt-ID: ${project.id}`,
    `Erstellt: ${formatDate(project.createdAt)}`,
    `Zuletzt geändert: ${formatDate(project.updatedAt)}`,
    `${tasks.length} ${tasks.length === 1 ? 'Aufgabe' : 'Aufgaben'}`,
    `${docCount} ${docCount === 1 ? 'Unterlage' : 'Unterlagen'}`,
  ].join('  ·  ');
  drawText(ctx, truncateToWidth(ctx.font, summary, 9.5, CONTENT_WIDTH), {
    size: 9.5,
    color: COLORS.tertiary,
  });
  ctx.y -= 6;

  /* Unterlagen */
  if (docCount > 0) {
    drawSectionHeading(ctx, 'Unterlagen');
    for (const doc of project.documents ?? []) documentLine(ctx, doc);
    ctx.y -= 4;
  }

  /* Aufgaben: Kurzübersicht über die folgenden Statusgruppen */
  drawSectionHeading(ctx, 'Aufgaben');
  ctx.y -= 2;
  if (tasks.length === 0) {
    drawParagraph(ctx, 'Keine Aufgaben vorhanden.', {
      size: 11,
      color: COLORS.tertiary,
    });
  } else {
    const counts = groups
      .map((group) => `${STATUS_LABELS[group.status]}: ${group.tasks.length}`)
      .join('  ·  ');
    drawParagraph(
      ctx,
      `${tasks.length} ${tasks.length === 1 ? 'Aufgabe' : 'Aufgaben'} · ${counts}`,
      { size: 10, color: COLORS.tertiary, spacingAfter: 2 },
    );
  }
  ctx.y -= 6;
}

/* ── Inhaltsverzeichnis-Einträge ── */

function sectionEntries(project: Project, contentPage: number): {
  entries: TocEntry[];
  tasksSectionNo: number;
} {
  const entries: TocEntry[] = [
    { prefix: '1.', label: 'Projektinformationen', page: contentPage },
  ];
  let sectionNo = 1;
  if ((project.documents ?? []).length > 0) {
    sectionNo += 1;
    entries.push({
      prefix: `${sectionNo}.`,
      label: 'Unterlagen',
      page: contentPage,
    });
  }
  sectionNo += 1;
  entries.push({ prefix: `${sectionNo}.`, label: 'Aufgaben', page: contentPage });
  return { entries, tasksSectionNo: sectionNo };
}

/* ── Bericht bauen ── */

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

  /* Seite 1: Deckblatt */
  await drawCover(ctx, project, now);

  /* Seite 2+: Inhalt (das Verzeichnis wird später davor eingefügt) */
  ctx.page = ctx.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  ctx.y = PAGE_HEIGHT - MARGIN;
  const contentStartPage = ctx.doc.getPageCount();

  const tasks = selectedTasks(project, opts);
  const groups = groupByStatus(tasks);

  drawContentSection(ctx, project, tasks, groups);

  const { entries: tocEntries, tasksSectionNo } = sectionEntries(
    project,
    contentStartPage,
  );

  /* Jede Statusgruppe beginnt auf einer neuen Seite, jede weitere Aufgabe ebenfalls. */
  for (let gi = 0; gi < groups.length; gi++) {
    const group = groups[gi];
    const groupPage = newPage(ctx);
    drawStatusHeading(ctx, group.status, group.tasks.length);
    tocEntries.push({
      prefix: `${tasksSectionNo}.${gi + 1}`,
      label: `${STATUS_LABELS[group.status]} (${group.tasks.length})`,
      page: groupPage,
    });

    for (let ti = 0; ti < group.tasks.length; ti++) {
      if (ti > 0) newPage(ctx);
      const task = group.tasks[ti];
      const startPage = await drawTaskSection(ctx, task);
      tocEntries.push({
        prefix: '–',
        label: task.name,
        page: startPage,
        indent: true,
      });
    }
  }

  /* Inhaltsverzeichnis (ggf. mehrseitig) direkt hinter das Deckblatt setzen. */
  const tocPages = paginateToc(tocEntries);
  /* Durch die eingefügten Verzeichnis-Seiten verschieben sich alle Inhaltsseiten. */
  for (const entry of tocEntries) entry.page += tocPages.length;
  insertTableOfContents(ctx, tocPages, project.name);

  return finalizePdf(ctx, { skipFirstPage: true });
}

/** Dateiname für den Projektbericht (Projektname + ID, sicher bereinigt). */
export function projectReportFileName(project: Project): string {
  return exportFileName(project.name, project.id, '-Projektbericht', 'pdf');
}
