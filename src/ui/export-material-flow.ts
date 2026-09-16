/* ── Export-Dialog: Materialliste (PDF und CSV) ── */

import { el, downloadBlob, pdfBlob } from './dom';
import { openModal } from './modal';
import { showToast } from './toast';
import { withProgress } from './progress';
import type { MaterialReportOptions } from '../io/material-export';
import type { Project } from '../domain/types';

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
      title: 'Materialliste exportieren',
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
          label: 'Als CSV',
          kind: 'secondary',
          onClick: async () => {
            handle.close();
            try {
              const { buildMaterialCsv, materialCsvFileName } = await import(
                '../io/material-csv'
              );
              const csv = await withProgress('Materialliste wird erstellt …',
                async () => buildMaterialCsv(project, opts),
              );
              /* BOM, damit Excel die Umlaute korrekt liest */
              const blob = new Blob(['\uFEFF' + csv], {
                type: 'text/csv;charset=utf-8',
              });
              downloadBlob(blob, materialCsvFileName(project));
              showToast('Materialliste als CSV exportiert.', 'success');
            } catch {
              showToast('CSV konnte nicht erstellt werden.', 'error');
            }
            resolve();
          },
        },
        {
          label: 'PDF erstellen',
          kind: 'primary',
          onClick: async () => {
            handle.close();
            try {
              const { buildMaterialPdf, materialReportFileName } = await import(
                '../io/material-export'
              );
              const bytes = await withProgress(
                'Materialliste wird erstellt …',
                async () => buildMaterialPdf(project, opts),
              );
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
