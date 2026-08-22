/* ── Material-Export: Dialog mit Modi und Druck ── */

import { el } from './dom';
import { openModal } from './modal';
import { openPrintWindow } from './print';
import { buildMaterialReport } from '../io/material-export';
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
      title: 'Materialliste drucken',
      content,
      actions: [
        {
          label: 'Abbrechen',
          kind: 'secondary',
          onClick: () => {
            handle.close();
            resolve();
          },
        },
        {
          label: 'Drucken',
          kind: 'primary',
          onClick: () => {
            const html = buildMaterialReport(project, opts);
            handle.close();
            openPrintWindow(html);
            resolve();
          },
        },
      ],
      onClose: () => resolve(),
    });
  });
}