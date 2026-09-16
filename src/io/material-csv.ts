/* ── Materialliste als CSV (Excel-freundlich: Semikolon + UTF-8-BOM) ── */

import type { MaterialItem, Project, Task } from '../domain/types';
import type { MaterialReportOptions } from './material-export';
import { exportFileName } from '../core/file-name';

const SEPARATOR = ';';

function escapeCell(value: string | number): string {
  const text = String(value);
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function row(cells: (string | number)[]): string {
  return cells.map(escapeCell).join(SEPARATOR);
}

function materialRows(items: MaterialItem[]): string[] {
  return items.map((m) => row([m.name, String(m.quantity).replace('.', ','), m.unit]));
}

interface GroupedMaterial {
  name: string;
  unit: string;
  quantity: number;
}

/** Summiert das Material über alle Aufgaben hinweg nach (Name + Einheit). */
export function sumMaterialByTask(tasks: Task[]): GroupedMaterial[] {
  const grouped = new Map<string, GroupedMaterial>();
  for (const task of tasks) {
    for (const item of task.material) {
      const key = `${item.name.trim()}\x00${item.unit.trim()}`;
      const entry = grouped.get(key);
      if (entry) entry.quantity += item.quantity;
      else grouped.set(key, { name: item.name.trim(), unit: item.unit.trim(), quantity: item.quantity });
    }
  }
  return [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

function selectedTasks(project: Project, opts: MaterialReportOptions): Task[] {
  if (opts.includeCompleted) return project.tasks;
  return project.tasks.filter((t) => t.status !== 'behoben');
}

/**
 * Baut die Materialliste als CSV. Aufbau je nach Modus:
 * - „tasks“: pro Aufgabe ein Block (Name, Beschreibung, dann Materialzeilen)
 * - „project“: eine summierte Gesamtliste (nach Name + Einheit gruppiert)
 */
export function buildMaterialCsv(
  project: Project,
  opts: MaterialReportOptions,
): string {
  const tasks = selectedTasks(project, opts);
  const lines: string[] = [];

  lines.push(row(['Projekt', project.name]));
  if (project.location) lines.push(row(['Ort', project.location]));
  lines.push(
    row([
      'Modus',
      opts.mode === 'tasks' ? 'Nach Aufgaben' : 'Gesamtes Projekt (summiert)',
    ]),
  );
  lines.push(
    row([
      'Abgeschlossene Aufgaben',
      opts.includeCompleted ? 'einbezogen' : 'nicht einbezogen',
    ]),
  );
  lines.push('');

  if (opts.mode === 'project') {
    lines.push(row(['Material', 'Menge', 'Einheit']));
    for (const item of sumMaterialByTask(tasks)) {
      lines.push(row([item.name, String(item.quantity).replace('.', ','), item.unit]));
    }
    return lines.join('\r\n');
  }

  for (const task of tasks) {
    if (task.material.length === 0) continue;
    lines.push(row(['Aufgabe', task.name]));
    if (task.description) lines.push(row(['Beschreibung', task.description]));
    lines.push(row(['Material', 'Menge', 'Einheit']));
    lines.push(...materialRows(task.material));
    lines.push('');
  }

  return lines.join('\r\n');
}

/** Dateiname der Materialliste als CSV. */
export function materialCsvFileName(project: Project): string {
  return exportFileName(project.name, project.id, '-Materialliste', 'csv');
}
