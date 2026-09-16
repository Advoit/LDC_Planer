/* ── Export-Dialog: Projektbericht (PDF) ── */

import { el, downloadBlob, pdfBlob } from './dom';
import { openModal } from './modal';
import { showToast } from './toast';
import { withProgress } from './progress';
import type { ProjectExportOptions } from '../io/project-export';
import { STATUS_LABELS, TASK_STATUSES } from '../domain/types';
import type { Project, TaskStatus } from '../domain/types';

export interface ProjectExportModalOptions {
  /** Nur diese Aufgaben exportieren (z. B. eine Auswahl aus der Übersicht). */
  taskIds?: Set<string>;
}

export function openProjectExportModal(
  project: Project,
  modalOpts: ProjectExportModalOptions = {},
): Promise<void> {
  const selected = new Set<TaskStatus>(TASK_STATUSES);
  const onlySelection = modalOpts.taskIds;
  const selectionCount = onlySelection ? onlySelection.size : 0;

  const statusRow = el('div', { class: 'export-form' }, [
    el('p', { class: 'export-hint' }, [
      'Wählen Sie, welche Aufgaben-Status in den Bericht aufgenommen werden:',
    ]),
  ]);
  for (const status of TASK_STATUSES) {
    const check = el('input', {
      type: 'checkbox',
      checked: 'true',
    }) as HTMLInputElement;
    check.addEventListener('change', () => {
      if (check.checked) selected.add(status);
      else selected.delete(status);
    });
    statusRow.appendChild(
      el('label', { class: 'checkbox-row' }, [check, ` ${STATUS_LABELS[status]}`]),
    );
  }

  const content = el('div', { class: 'export-form' }, [
    el('p', { class: 'export-hint' }, [
      'Der Bericht enthält Beschreibung, Material, Hinweise sowie Vorher-/Nachher-Bilder in großer Darstellung.',
    ]),
    ...(onlySelection
      ? [
          el('p', { class: 'export-hint export-hint-strong' }, [
            `Es werden nur die ${selectionCount} ausgewählten ${selectionCount === 1 ? 'Aufgabe' : 'Aufgaben'} exportiert.`,
          ]),
        ]
      : []),
    statusRow,
  ]);

  return new Promise<void>((resolve) => {
    const handle = openModal({
      title: 'Projektbericht als PDF',
      content,
      actions: [
        {
          label: 'Zurück',
          kind: 'secondary',
          onClick: () => {
            handle.close();
            resolve();
          },
        },
        {
          label: 'PDF erstellen',
          kind: 'primary',
          onClick: async () => {
            if (selected.size === 0) {
              showToast('Bitte mindestens einen Status auswählen.', 'error');
              return;
            }
            handle.close();
            const opts: ProjectExportOptions = {
              statuses: selected,
              taskIds: onlySelection,
            };
            try {
              const { buildProjectPdf, projectReportFileName } = await import(
                '../io/project-export'
              );
              const bytes = await withProgress(
                'Projektbericht wird erstellt …',
                (report) => buildProjectPdf(project, opts, report),
              );
              downloadBlob(pdfBlob(bytes), projectReportFileName(project));
              showToast('Projektbericht als PDF exportiert.', 'success');
            } catch {
              showToast('PDF konnte nicht erstellt werden.', 'error');
            }
            resolve();
          },
        },
      ],
      onClose: () => resolve(),
    });
  });
}
