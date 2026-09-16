/* ── Startseite: Neues Projekt, Projekt laden, Projekt-ZIP ablegen, Projektliste ── */

import { el, icon } from './dom';
import { buildProjectList } from './project-list';
import type { ProjectSummary } from '../domain/project';

export interface StartScreenOptions {
  summaries: ProjectSummary[];
  currentId: string | null;
  onNewProject: () => void;
  onLoadZip: () => void;
  onOpenProject: (id: string) => void;
  onDeleteProject: (id: string) => void;
  onDropFile: (file: File) => void;
}

export function buildStartScreen(opts: StartScreenOptions): HTMLElement {
  const newBtn = el('button', { class: 'btn btn-primary btn-lg', type: 'button' }, [
    icon('folder-plus'),
    ' Neues Projekt',
  ]);
  newBtn.addEventListener('click', () => opts.onNewProject());

  const loadBtn = el('button', { class: 'btn btn-secondary btn-lg', type: 'button' }, [
    icon('upload'),
    ' Projekt laden',
  ]);
  loadBtn.addEventListener('click', () => opts.onLoadZip());

  /* Projekt-ZIP einfach auf die Startseite schieben (oder Zone anklicken) */
  const dropZone = el('div', { class: 'drop-zone', role: 'button', tabindex: '0' }, [
    el('span', { class: 'drop-zone-icon' }, [icon('upload')]),
    el('strong', {}, ['Projekt-ZIP hier ablegen']),
    el('span', { class: 'drop-zone-hint' }, [
      'oder klicken, um eine Sicherung (.zip) auszuwählen',
    ]),
  ]);
  dropZone.addEventListener('click', () => opts.onLoadZip());
  dropZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      opts.onLoadZip();
    }
  });

  const screen = el('div', { class: 'empty-state' }, [
    el('div', { class: 'empty-icon' }, [icon('folder')]),
    el('h2', {}, [
      opts.summaries.length > 0 ? 'Projekt öffnen' : 'Kein Projekt geöffnet',
    ]),
    el('p', {}, [
      opts.summaries.length > 0
        ? 'Wählen Sie ein gespeichertes Projekt oder legen Sie ein neues an.'
        : 'Legen Sie ein neues Projekt an oder laden Sie eine gesicherte Projekt-ZIP (.zip).',
    ]),
    el('div', { class: 'empty-actions' }, [newBtn, loadBtn]),
    dropZone,
  ]);

  attachZipDrop(screen, dropZone, opts.onDropFile);

  if (opts.summaries.length > 0) {
    screen.appendChild(
      el('div', { class: 'start-projects' }, [
        el('h3', { class: 'start-projects-title' }, [
          `Meine Projekte (${opts.summaries.length})`,
        ]),
        buildProjectList({
          summaries: opts.summaries,
          currentId: opts.currentId,
          onOpen: opts.onOpenProject,
          onDelete: opts.onDeleteProject,
        }),
      ]),
    );
  }

  return screen;
}

/**
 * Erlaubt das Ziehen einer Projekt-ZIP auf die Startseite.
 * `highlight` ist die Zone, die beim Ziehen hervorgehoben wird.
 */
function attachZipDrop(
  target: HTMLElement,
  highlight: HTMLElement,
  onFile: (file: File) => void,
): void {
  let dragDepth = 0;
  const stop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  target.addEventListener('dragenter', (e) => {
    stop(e);
    dragDepth++;
    highlight.classList.add('drag-over');
  });
  target.addEventListener('dragover', (e) => {
    stop(e);
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    highlight.classList.add('drag-over');
  });
  target.addEventListener('dragleave', (e) => {
    stop(e);
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) highlight.classList.remove('drag-over');
  });
  target.addEventListener('drop', (e) => {
    stop(e);
    dragDepth = 0;
    highlight.classList.remove('drag-over');
    const file = e.dataTransfer?.files?.[0];
    if (file) onFile(file);
  });
  target.addEventListener('dragend', () => {
    dragDepth = 0;
    highlight.classList.remove('drag-over');
  });
}
