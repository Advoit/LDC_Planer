/* ── Projektliste: gespeicherte Projekte öffnen oder löschen ── */

import { el, icon, formatDateTime } from './dom';
import { openModal, confirmDialog } from './modal';
import type { ProjectSummary } from '../domain/project';

export interface ProjectListOptions {
  summaries: ProjectSummary[];
  currentId: string | null;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}

function subtitle(summary: ProjectSummary): string {
  const tasks = `${summary.taskCount} ${summary.taskCount === 1 ? 'Aufgabe' : 'Aufgaben'}`;
  const open = summary.openCount > 0 ? ` · ${summary.openCount} offen` : '';
  const place = summary.location ? `${summary.location} · ` : '';
  return `${place}${tasks}${open}`;
}

/** Liste der gespeicherten Projekte (als Karten). */
export function buildProjectList(opts: ProjectListOptions): HTMLElement {
  const list = el('div', { class: 'project-list' });

  for (const summary of opts.summaries) {
    const isCurrent = summary.id === opts.currentId;

    const openBtn = el('button', {
      class: 'project-card-open',
      type: 'button',
      title: 'Projekt öffnen',
    }, [
      el('span', { class: 'project-card-name' }, [summary.name]),
      el('span', { class: 'project-card-meta' }, [subtitle(summary)]),
      el('span', { class: 'project-card-date' }, [
        `Geändert: ${formatDateTime(summary.updatedAt)}`,
      ]),
    ]);
    openBtn.addEventListener('click', () => opts.onOpen(summary.id));

    const card = el('div', {
      class: `project-card${isCurrent ? ' current' : ''}`,
    }, [
      el('span', { class: 'project-card-icon' }, [icon('folder')]),
      openBtn,
    ]);

    if (isCurrent) {
      card.appendChild(el('span', { class: 'badge badge-current' }, ['geöffnet']));
    }

    const delBtn = el('button', {
      class: 'icon-btn project-card-del',
      type: 'button',
      title: 'Projekt löschen',
      'aria-label': 'Projekt löschen',
    }, [icon('trash')]);
    delBtn.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Projekt löschen',
        message: `Möchten Sie das Projekt „${summary.name}“ mit allen Aufgaben, Bildern und Sicherungsständen unwiderruflich löschen?`,
        confirmLabel: 'Löschen',
        danger: true,
      });
      if (ok) opts.onDelete(summary.id);
    });
    card.appendChild(delBtn);

    list.appendChild(card);
  }

  return list;
}

export interface ProjectsModalOptions extends ProjectListOptions {
  onNewProject: () => void;
  onLoadZip: () => void;
}

/** „Meine Projekte“ als Modal (aus der Toolbar). */
export function openProjectsModal(opts: ProjectsModalOptions): void {
  const content = el('div', { class: 'projects-modal' }, [
    opts.summaries.length === 0
      ? el('p', { class: 'export-hint' }, [
          'Noch keine gespeicherten Projekte. Legen Sie ein neues Projekt an oder laden Sie eine Projekt-ZIP.',
        ])
      : buildProjectList(opts),
  ]);

  const handle = openModal({
    title: 'Meine Projekte',
    content,
    wide: true,
    actions: [
      {
        label: 'Neues Projekt',
        kind: 'secondary',
        onClick: () => {
          handle.close();
          opts.onNewProject();
        },
      },
      {
        label: 'ZIP laden',
        kind: 'primary',
        onClick: () => {
          handle.close();
          opts.onLoadZip();
        },
      },
    ],
  });
}
