/* ── Materialbericht bauen (Print-Vorschau) ── */

import type { MaterialItem, Project, Task } from '../domain/types';

export interface MaterialReportOptions {
  mode: 'tasks' | 'project';
  includeCompleted: boolean;
}

function selectedTasks(project: Project, opts: MaterialReportOptions): Task[] {
  if (opts.includeCompleted) return project.tasks;
  return project.tasks.filter((t) => t.status !== 'behoben');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function materialRows(items: MaterialItem[]): string {
  return items
    .map(
      (m) =>
        `<tr><td>${escapeHtml(m.name)}</td><td class="num">${m.quantity}</td><td>${escapeHtml(m.unit)}</td></tr>`,
    )
    .join('');
}

function totalRow(items: MaterialItem[]): string {
  const q = items.reduce((s, i) => s + i.quantity, 0);
  const names = [...new Set(items.map((i) => i.name))].sort().join(', ');
  return `<tr class="total"><td>Alle Artikel (${names.length})</td><td class="num">${q}</td><td></td></tr>`;
}

/* ── Modus: Nach Aufgaben ── */
function buildByTasks(tasks: Task[]): string {
  return tasks
    .map((t) => {
      if (t.material.length === 0) return '';
      return `
      <section class="task-section">
        <h3>${escapeHtml(t.name)}</h3>
        <p class="task-desc">${escapeHtml(t.description)}</p>
        <table>
          <thead><tr><th>Material</th><th class="num">Menge</th><th>Einheit</th></tr></thead>
          <tbody>${materialRows(t.material)}</tbody>
        </table>
      </section>`;
    })
    .join('');
}

/* ── Modus: Gesamtes Projekt ── */
function buildProjectSummary(tasks: Task[]): string {
  const grouped = new Map<string, { quantity: number; unit: string }>();
  for (const t of tasks) {
    for (const item of t.material) {
      const key = `${item.name.trim()}\x00${item.unit.trim()}`;
      const entry = grouped.get(key);
      if (entry) {
        entry.quantity += item.quantity;
      } else {
        grouped.set(key, {
          quantity: item.quantity,
          unit: item.unit.trim(),
        });
      }
    }
  }
  const items: MaterialItem[] = [...grouped.entries()]
    .map(([k, v]) => {
      const [name] = k.split('\x00');
      return { id: '', name, quantity: v.quantity, unit: v.unit };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));

  return `
    <table>
      <thead><tr><th>Material</th><th class="num">Gesamtmenge</th><th>Einheit</th></tr></thead>
      <tbody>${materialRows(items)}</tbody>
      <tbody>${totalRow(items)}</tbody>
    </table>`;
}

export function buildMaterialReport(
  project: Project,
  opts: MaterialReportOptions,
): string {
  const tasks = selectedTasks(project, opts);
  const now = new Date().toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const modeLabel =
    opts.mode === 'tasks' ? 'Nach Aufgaben' : 'Gesamtes Projekt';
  const scope =
    opts.includeCompleted && opts.mode === 'tasks'
      ? '(inkl. abgeschlossener Aufgaben)'
      : opts.includeCompleted && opts.mode === 'project'
        ? '(inkl. abgeschlossener Aufgaben)'
        : '';

  const body =
    opts.mode === 'tasks'
      ? buildByTasks(tasks)
      : buildProjectSummary(tasks);

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<title>Materialliste – ${escapeHtml(project.name)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',Roboto,Helvetica,Arial,sans-serif;
       font-size:13px;color:#1d1d1f;padding:32px 24px;max-width:740px;margin:auto;}
  h1{font-size:22px;margin-bottom:4px;}
  h2{font-size:15px;color:#86868b;font-weight:400;margin-bottom:24px;}
  h3{border-bottom:2px solid #007AFF;padding-bottom:4px;margin:20px 0 8px;}
  .task-desc{color:#515154;margin-bottom:8px;}
  table{width:100%;border-collapse:collapse;margin-bottom:12px;}
  th,td{padding:6px 8px;text-align:left;border-bottom:1px solid #e5e5ea;}
  th{font-weight:600;color:#515154;}
  .num{text-align:right;width:70px;}
  .total{font-weight:700;border-top:2px solid #1d1d1f;}
  footer{text-align:center;color:#aeaeb2;margin-top:32px;}
  @media print {
    body{padding:16px;font-size:12px;}
  }
</style>
</head>
<body>
<h1>${escapeHtml(project.name)}</h1>
<h2>Materialliste – ${modeLabel} ${scope} | ${project.location} | ${now}</h2>
${body}
<footer>Exportiert mit LDC Projekt Planer</footer>
</body>
</html>`;
}