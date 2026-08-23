/* ── Exporte: PDF-Export-Dialoge (Projektbericht & Materialliste) ── */

import { el } from './dom';
import { downloadBlob } from './dom';
import { openModal } from './modal';
import { showToast } from './toast';
import { buildMaterialPdf, materialReportFileName } from '../io/material-export';
import type { MaterialReportOptions } from '../io/material-export';
import { buildProjectPdf, projectReportFileName } from '../io/project-export';
import type { ProjectExportOptions } from '../io/project-export';
import { TASK_STATUSES, STATUS_LABELS } from '../domain/types';
import type { Project, TaskStatus } from '../domain/types';

function pdfBlob(bytes: Uint8Array): Blob {
  /* slice() liefert eine eigene ArrayBuffer-Kopie (typsicher für BlobPart) */
  return new Blob([bytes.slice()], { type: 'application/pdf' });
}

/* ═════════════ Materialliste ═════════════ */

export function openMaterialExportModal(project: Project): Promise<void> {
  const opts: MaterialReportOptions = {
    mode: 'tasks',
    includeCompleted: false,
  };

  const tasksRadio = el('input', {
    type: 'radio',
    name: 'export-mode',
    value: 'tasks',
    checked: 'true',
  }) as HTMLInputElement;
  const projectRadio = el('input', {
    type: 'radio',
    name: 'export-mode',
    value: 'project',
  }) as HTMLInputElement;
  const completedCheck = el('input', {
    type: 'checkbox',
    id: 'inc-completed',
  }) as HTMLInputElement;

  tasksRadio.addEventListener('change', () => {
    opts.mode = 'tasks';
  });
  projectRadio.addEventListener('change', () => {
    opts.mode = 'project';
  });
  completedCheck.addEventListener('change', () => {
    opts.includeCompleted = completedCheck.checked;
  });

  const content = el('div', { class: 'export-form' }, [
    el('label', { class: 'radio-row' }, [tasksRadio, ' Nach Aufgaben gruppiert']),
    el('label', { class: 'radio-row' }, [projectRadio, ' Gesamtes Projekt (summiert)']),
    el('label', { class: 'checkbox-row' }, [
      completedCheck,
      ' Abgeschlossene (behobene) Aufgaben einbeziehen',
    ]),
  ]);

  return new Promise<void>((resolve) => {
    const handle = openModal({
      title: 'Materialliste als PDF',
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
            handle.close();
            try {
              const bytes = await buildMaterialPdf(project, opts);
              downloadBlob(pdfBlob(bytes), materialReportFileName(project));
              showToast('Materialliste als PDF exportiert.', 'success');
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

/* ═════════════ Projektbericht ═════════════ */

export function openProjectExportModal(project: Project): Promise<void> {
  const selected = new Set<TaskStatus>(TASK_STATUSES);

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
            const opts: ProjectExportOptions = { statuses: selected };
            try {
              const bytes = await buildProjectPdf(project, opts);
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
