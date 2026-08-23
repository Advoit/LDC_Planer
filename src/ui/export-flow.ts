/* ── Exporte: PDF-Export-Dialoge (Projektbericht & Materialliste) ── */

import { el } from './dom';
import { downloadBlob } from './dom';
import { openModal } from './modal';
import { showToast } from './toast';
import { getPreference, setPreference } from '../core/preferences';
import { buildMaterialPdf, materialReportFileName } from '../io/material-export';
import type { MaterialReportOptions } from '../io/material-export';
import { buildProjectPdf, projectReportFileName } from '../io/project-export';
import type { ProjectExportOptions } from '../io/project-export';
import {
  buildMangelsreportPptx,
  mangelsreportFileName,
} from '../io/mangelsreport';
import type { MangelsreportCover } from '../io/mangelsreport';
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

/* ═════════════════ Mängelreport (PPTX) ═════════════════ */

function coverField(label: string, input: HTMLInputElement): HTMLElement {
  const wrap = el('div', { class: 'cover-field' });
  wrap.appendChild(el('label', { class: 'field-label' }, [label]));
  wrap.appendChild(input);
  return wrap;
}

/** „Deckblatt Einstellungen“ – erstellt den Mängelreport als PPTX. */
export function openMangelsreportModal(project: Project): Promise<void> {
  const saved = getPreference<Partial<MangelsreportCover>>(
    'mangelsreport.cover',
    {},
  );
  const today = new Date().toISOString().slice(0, 10);

  const maengelCount = project.tasks.filter(
    (t) => (t.typ ?? 'maengel') === 'maengel',
  ).length;

  const kennung = el('input', {
    type: 'text',
    class: 'input',
    name: 'kennung',
    placeholder: 'z. B. Objekt-/Auftragsnummer',
    value: saved.kennung ?? project.id,
  }) as HTMLInputElement;
  const saal = el('input', {
    type: 'text',
    class: 'input',
    name: 'saal',
    placeholder: 'z. B. EG / Saal 2',
    value: saved.saal ?? '',
  }) as HTMLInputElement;
  const strasse = el('input', {
    type: 'text',
    class: 'input',
    name: 'strasse',
    placeholder: 'z. B. Musterstraße 12',
    value: saved.strasse ?? '',
  }) as HTMLInputElement;
  const plzOrt = el('input', {
    type: 'text',
    class: 'input',
    name: 'plzOrt',
    placeholder: 'z. B. 12345 Musterstadt',
    value: saved.plzOrt ?? project.location,
  }) as HTMLInputElement;
  const efkName = el('input', {
    type: 'text',
    class: 'input',
    name: 'efkName',
    placeholder: 'Name der leitenden EFK',
    value: saved.efkName ?? '',
  }) as HTMLInputElement;
  const termin = el('input', {
    type: 'date',
    class: 'input',
    name: 'termin',
    value: saved.termin ?? today,
  }) as HTMLInputElement;

  const content = el('div', { class: 'export-form' }, [
    el('p', { class: 'export-hint' }, [
      `Der Report enthält ${maengelCount} ${maengelCount === 1 ? 'Mängel-Aufgabe' : 'Mängel-Aufgaben'} (nach Position sortiert). Bitte die Angaben für das Deckblatt angeben:`,
    ]),
    coverField('Kennung', kennung),
    coverField('Saal / Bereich', saal),
    coverField('Straße + Hausnummer', strasse),
    coverField('PLZ + Ort', plzOrt),
    coverField('Leitende EFK (Name)', efkName),
    coverField('Ausführungstermin', termin),
  ]);

  return new Promise<void>((resolve) => {
    const handle = openModal({
      title: 'Deckblatt Einstellungen',
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
          label: 'Mängelreport erstellen',
          kind: 'primary',
          onClick: async () => {
            if (maengelCount === 0) {
              showToast('Keine Mängel-Aufgaben vorhanden.', 'error');
              return;
            }
            const cover: MangelsreportCover = {
              kennung: kennung.value.trim(),
              saal: saal.value.trim(),
              strasse: strasse.value.trim(),
              plzOrt: plzOrt.value.trim(),
              efkName: efkName.value.trim(),
              termin: termin.value,
            };
            setPreference('mangelsreport.cover', cover);
            handle.close();
            showToast('Mängelreport wird erstellt…', 'info');
            try {
              const bytes = await buildMangelsreportPptx(project, { cover });
              downloadBlob(
                new Blob([bytes.slice()], {
                  type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                }),
                mangelsreportFileName(project),
              );
              showToast('Mängelreport als PPTX exportiert.', 'success');
            } catch {
              showToast('Mängelreport konnte nicht erstellt werden.', 'error');
            }
            resolve();
          },
        },
      ],
      onClose: () => resolve(),
    });
  });
}
