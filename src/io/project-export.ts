/* ── Projekt-Report bauen (strukturiert, druckbar → PDF) ── */

import { STATUS_LABELS } from '../domain/types';
import type { Project, ProjectDocument, Task } from '../domain/types';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

const STATUS_BADGE: Record<string, string> = {
  offen: '#007AFF',
  hinweis: '#FF9500',
  behoben: '#34C759',
};

function documentList(documents: ProjectDocument[]): string {
  if (documents.length === 0) return '';
  const rows = documents
    .map(
      (d) =>
        `<li><span class="doc-name">${escapeHtml(d.name)}</span>` +
        `<span class="doc-meta">${formatFileSize(d.size)} · ${escapeHtml(d.mime)}</span></li>`,
    )
    .join('');
  return `<div class="doc-section"><h4>Unterlagen</h4><ul class="doc-list">${rows}</ul></div>`;
}

function taskSection(task: Task): string {
  const status = STATUS_LABELS[task.status] ?? task.status;
  const badge = STATUS_BADGE[task.status] ?? '#86868b';

  const meta: string[] = [];
  if (task.plannedWork) meta.push(`Geplanter Aufwand: ${task.plannedWork}`);
  if (task.editedBy) meta.push(`Bearbeitet von: ${task.editedBy}`);
  if (task.editedAt) meta.push(`Bearbeitet am: ${formatDate(task.editedAt)}`);
  if (task.hintText) meta.push(`Hinweis: ${task.hintText}`);

  let materialTable = '';
  if (task.material.length > 0) {
    const rows = task.material
      .map(
        (m) =>
          `<tr><td>${escapeHtml(m.name)}</td><td class="num">${m.quantity}</td>` +
          `<td>${escapeHtml(m.unit)}</td></tr>`,
      )
      .join('');
    materialTable = `
      <table class="material">
        <thead><tr><th>Material</th><th class="num">Menge</th><th>Einheit</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  let imagesHtml = '';
  if (task.images.length > 0) {
    const thumbs = task.images
      .map(
        (img) =>
          `<img class="task-img" src="${img.dataUrl}" alt="${escapeHtml(task.name)}" />`,
      )
      .join('');
    imagesHtml = `<div class="img-grid">${thumbs}</div>`;
  }

  return `
  <section class="task-section">
    <div class="task-head">
      <h3>${escapeHtml(task.name)}</h3>
      <span class="status-badge" style="color:${badge};border-color:${badge};">${escapeHtml(status)}</span>
    </div>
    <p class="task-desc">${escapeHtml(task.description)}</p>
    ${meta.length > 0 ? `<p class="task-meta">${meta.map(escapeHtml).join(' · ')}</p>` : ''}
    ${materialTable}
    ${imagesHtml}
    ${documentList(task.documents)}
  </section>`;
}

export function buildProjectReport(project: Project): string {
  const now = new Date().toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const tasksHtml = project.tasks
    .map((t) => taskSection(t))
    .join('');

  const projectDocs = documentList(project.documents ?? []);

  const summary = [
    `Projekt-ID: ${project.id}`,
    `Erstellt: ${formatDate(project.createdAt)}`,
    `Zuletzt geändert: ${formatDate(project.updatedAt)}`,
    `${project.tasks.length} ${project.tasks.length === 1 ? 'Aufgabe' : 'Aufgaben'}`,
    `${(project.documents ?? []).length} ${(project.documents ?? []).length === 1 ? 'Unterlage' : 'Unterlagen'}`,
  ].join(' · ');

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<title>Projekt – ${escapeHtml(project.name)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',Roboto,Helvetica,Arial,sans-serif;
       font-size:13px;color:#1d1d1f;padding:32px 24px;max-width:760px;margin:auto;}
  header.project-header{background:#f5f5f7;border-radius:14px;padding:24px;margin-bottom:24px;}
  h1{font-size:26px;letter-spacing:-0.02em;margin-bottom:4px;}
  .project-location{font-size:14px;color:#86868b;margin-bottom:8px;}
  .project-desc{font-size:14px;color:#515154;margin-bottom:8px;white-space:pre-wrap;}
  .project-summary{font-size:12px;color:#86868b;}
  h2{font-size:15px;text-transform:uppercase;letter-spacing:1px;color:#86868b;margin:24px 0 8px;}
  .task-section{border:1px solid #e5e5ea;border-radius:12px;padding:16px;margin-bottom:14px;
                page-break-inside:avoid;}
  .task-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;}
  h3{font-size:16px;letter-spacing:-0.01em;}
  .status-badge{display:inline-block;border:1.5px solid;border-radius:100px;padding:2px 10px;
                font-size:11px;font-weight:600;letter-spacing:0.3px;}
  .task-desc{color:#515154;margin:4px 0;}
  .task-meta{color:#86868b;font-size:12px;margin:4px 0;}
  table{width:100%;border-collapse:collapse;margin:10px 0;}
  th,td{padding:6px 8px;text-align:left;border-bottom:1px solid #e5e5ea;}
  th{font-weight:600;color:#515154;font-size:12px;}
  .num{text-align:right;width:80px;}
  .img-grid{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0;}
  .task-img{width:64px;height:64px;object-fit:cover;border-radius:8px;border:1px solid #e5e5ea;}
  .doc-section{margin-top:8px;}
  .doc-section h4{font-size:12px;text-transform:uppercase;letter-spacing:0.8px;color:#86868b;margin-bottom:4px;}
  .doc-list{list-style:none;}
  .doc-list li{padding:4px 0;border-bottom:1px dashed #e5e5ea;display:flex;justify-content:space-between;gap:16px;}
  .doc-name{font-weight:500;}
  .doc-meta{color:#86868b;font-size:12px;white-space:nowrap;}
  footer{text-align:center;color:#aeaeb2;margin-top:32px;font-size:12px;}
  @media print{
    body{padding:16px;}
    .task-section{break-inside:avoid;page-break-inside:avoid;}
  }
</style>
</head>
<body>
<header class="project-header">
  <h1>${escapeHtml(project.name)}</h1>
  <p class="project-location">${escapeHtml(project.location)}</p>
  ${project.description ? `<p class="project-desc">${escapeHtml(project.description)}</p>` : ''}
  <p class="project-summary">${escapeHtml(summary)}</p>
</header>
${projectDocs}
<h2>Aufgaben</h2>
${tasksHtml || '<p>Keine Aufgaben vorhanden.</p>'}
<footer>Exportiert am ${now} mit LDC Projekt Planer</footer>
</body>
</html>`;
}
