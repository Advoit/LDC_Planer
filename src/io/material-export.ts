/* ── Material-Export: echtes PDF (pdf-lib) – nach Aufgaben oder summiert ── */

import type { MaterialItem, Project, Task } from '../domain/types';
import {
  createPdfContext,
  ensureSpace,
  drawText,
  drawParagraph,
  drawTable,
  finalizePdf,
  COLORS,
} from './pdf';
import type { PdfContext, PdfTableCol, PdfTableRow } from './pdf';

export interface MaterialReportOptions {
  mode: 'tasks' | 'project';
  includeCompleted: boolean;
}

function selectedTasks(project: Project, opts: MaterialReportOptions): Task[] {
  if (opts.includeCompleted) return project.tasks;
  return project.tasks.filter((t) => t.status !== 'behoben');
}

const MATERIAL_COLS: PdfTableCol[] = [
  { header: 'Material', width: 0.6 },
  { header: 'Menge', width: 0.18, align: 'right' },
  { header: 'Einheit', width: 0.22 },
];

function materialRows(items: MaterialItem[]): PdfTableRow[] {
  return items.map((m) => ({
    cells: [m.name, String(m.quantity), m.unit],
  }));
}

function totalRow(items: MaterialItem[]): PdfTableRow[] {
  /* Mengen verschiedener Einheiten lassen sich nicht sinnvoll summieren –
     daher nur die Anzahl der Positionen (Name + Einheit) anzeigen. */
  const positions = new Set(
    items.map((i) => `${i.name.trim()}\x00${i.unit.trim()}`),
  );
  return [{ cells: [`Alle Artikel (${positions.size})`, '', ''] }];
}

/** Modus „Nach Aufgaben“: pro Aufgabe ein Abschnitt mit Materialtabelle. */
async function buildByTasks(ctx: PdfContext, tasks: Task[]): Promise<void> {
  for (const t of tasks) {
    if (t.material.length === 0) continue;
    ensureSpace(ctx, 40);
    drawText(ctx, t.name, { size: 12.5, font: ctx.bold });
    if (t.description) {
      drawParagraph(ctx, t.description, {
        size: 10,
        color: COLORS.secondary,
        spacingAfter: 4,
      });
    }
    drawTable(ctx, MATERIAL_COLS, materialRows(t.material));
    ctx.y -= 8;
  }
}

/** Modus „Gesamtes Projekt“: nach (Name + Einheit) summiert. */
function buildProjectSummary(tasks: Task[]): { rows: PdfTableRow[]; items: MaterialItem[] } {
  const grouped = new Map<string, { quantity: number; unit: string }>();
  for (const t of tasks) {
    for (const item of t.material) {
      const key = `${item.name.trim()}\x00${item.unit.trim()}`;
      const entry = grouped.get(key);
      if (entry) {
        entry.quantity += item.quantity;
      } else {
        grouped.set(key, { quantity: item.quantity, unit: item.unit.trim() });
      }
    }
  }
  const items: MaterialItem[] = [...grouped.entries()]
    .map(([k, v]) => {
      const [name] = k.split('\x00');
      return { id: '', name, quantity: v.quantity, unit: v.unit };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  return { rows: materialRows(items), items };
}

export async function buildMaterialPdf(
  project: Project,
  opts: MaterialReportOptions,
): Promise<Uint8Array> {
  const now = new Date().toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const ctx = await createPdfContext(`Exportiert am ${now} mit LDC Planer`);
  const tasks = selectedTasks(project, opts);

  ensureSpace(ctx, 90);
  drawText(ctx, project.name, { size: 20, font: ctx.bold });
  const modeLabel = opts.mode === 'tasks' ? 'Nach Aufgaben' : 'Gesamtes Projekt';
  const scope = opts.includeCompleted ? ' (inkl. abgeschlossener Aufgaben)' : '';
  drawText(ctx, `Materialliste – ${modeLabel}${scope}`, {
    size: 12,
    color: COLORS.secondary,
  });
  if (project.location) {
    drawText(ctx, `${project.location}  ·  ${now}`, {
      size: 10,
      color: COLORS.tertiary,
    });
  }
  ctx.y -= 6;

  if (opts.mode === 'tasks') {
    await buildByTasks(ctx, tasks);
  } else {
    const { rows, items } = buildProjectSummary(tasks);
    drawTable(ctx, [
      { header: 'Material', width: 0.6 },
      { header: 'Gesamtmenge', width: 0.18, align: 'right' },
      { header: 'Einheit', width: 0.22 },
    ], [...rows, ...totalRow(items)]);
  }

  return finalizePdf(ctx);
}

/** Dateiname für die Materialliste (Projektname + ID, sicher bereinigt). */
export function materialReportFileName(project: Project): string {
  const safeName = project.name
    .replace(/[^a-zA-Z0-9äöüÄÖÜß _-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  return `LDC-${safeName || 'Projekt'}-${project.id}-Materialliste.pdf`;
}
