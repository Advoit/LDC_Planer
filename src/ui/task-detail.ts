/* ── Aufgaben-Detail: Übersicht, Schnellstatus & Status-Änderung ── */

import { el, downloadBlob, pdfBlob } from './dom';
import { openModal } from './modal';
import { showToast } from './toast';
import { withProgress } from './progress';
import { createImageUploader } from './image-upload';
import { createDocumentUploader } from './document-upload';
import { lastEditedBy, rememberEditedBy } from './status-prompt';
import { buildTaskOverview } from './task-detail-overview';
import { validateStatusFields, applyStatusFields } from '../domain/task';
import type { StatusFields } from '../domain/task';
import { TASK_STATUSES, STATUS_LABELS } from '../domain/types';
import type { Project, Task, TaskStatus } from '../domain/types';

export function openTaskDetail(opts: {
  project: Project;
  taskId: string;
  onChanged: (updatedTask: Task) => void;
  onDuplicate?: (task: Task) => void;
}): void {
  const found = opts.project.tasks.find((t) => t.id === opts.taskId);
  if (!found) return;
  /* Explizit typisiert, damit die Verengung auch in Callbacks gilt */
  const task: Task = found;

  const afterImages = createImageUploader({
    images: task.afterImages,
    thumbnailSourceId: null,
    showThumbnailPicker: false,
    label: 'Nachher-Bilder',
  });

  const afterDocs = createDocumentUploader({
    documents: task.afterDocuments ?? [],
    label: 'Nachher-Dokumente',
    hint: 'Dokumente zur Nachbearbeitung, z. B. Berichte oder Fotos als Datei (optional).',
  });

  const body = el('div', { class: 'task-detail' });

  /* ── Erstellungsfelder (nur lesbar) ── */
  body.appendChild(buildTaskOverview(task));

  /* ── Status-Editor ── */
  const statusSection = el('div', { class: 'detail-section status-section' });

  /* Status-Select */
  const statusSelect = el('select', { class: 'input', name: 'status' });
  for (const s of TASK_STATUSES) {
    statusSelect.appendChild(
      el('option', { value: s, selected: s === task.status ? 'true' : null }, [STATUS_LABELS[s]]),
    );
  }
  statusSection.appendChild(el('label', { class: 'field-label' }, ['Status']));
  statusSection.appendChild(statusSelect);

  /* Schnellwechsel: Status direkt setzen (Felder werden vorbelegt) */
  const quickRow = el('div', { class: 'quick-status' });
  const chips = new Map<TaskStatus, HTMLButtonElement>();
  for (const s of TASK_STATUSES) {
    const chip = el('button', { class: 'chip', type: 'button' }, [
      STATUS_LABELS[s],
    ]) as HTMLButtonElement;
    chip.addEventListener('click', () => void quickSwitch(s));
    chips.set(s, chip);
    quickRow.appendChild(chip);
  }
  statusSection.appendChild(
    el('p', { class: 'field-hint' }, [
      'Schnellwechsel: Status antippen – die Pflichtfelder werden mit der letzten Person und dem heutigen Datum vorbelegt.',
    ]),
  );
  statusSection.appendChild(quickRow);

  /* Bearbeitet von */
  const editedByInput = el('input', {
    type: 'text',
    class: 'input',
    name: 'editedBy',
    placeholder: 'Name',
    value: task.editedBy || lastEditedBy(),
  }) as HTMLInputElement;
  statusSection.appendChild(el('label', { class: 'field-label' }, ['Bearbeitet von *']));
  statusSection.appendChild(editedByInput);

  /* Bearbeitet am */
  const editedAtInput = el('input', {
    type: 'date',
    class: 'input',
    name: 'editedAt',
    value: task.editedAt ? task.editedAt.slice(0, 10) : todayISO(),
  }) as HTMLInputElement;
  statusSection.appendChild(el('label', { class: 'field-label' }, ['Bearbeitet am *']));
  statusSection.appendChild(editedAtInput);

  /* Hinweistext */
  const hintTextInput = el('textarea', {
    class: 'input textarea',
    name: 'hintText',
    placeholder: 'Hinweistext',
    rows: '3',
  }, [task.hintText]) as HTMLTextAreaElement;
  statusSection.appendChild(el('label', { class: 'field-label hint-label' }, ['Hinweistext *']));
  statusSection.appendChild(hintTextInput);

  /* Nachher-Bilder */
  statusSection.appendChild(afterImages.element);

  /* Nachher-Dokumente */
  statusSection.appendChild(afterDocs.element);

  /* Dynamische Pflichtfelder */
  const hintLabel = statusSection.querySelector('.hint-label')!;
  /* Hinweistext: Pflicht bei „Hinweis“, bei Mängel-Aufgaben auch bei „Behoben“ */
  const isMaengelTask = task.typ === 'maengel';
  function updateRequiredFields(): void {
    const s = statusSelect.value as TaskStatus;
    const needFields = s !== 'offen';
    editedByInput.required = needFields;
    editedAtInput.required = needFields;
    hintLabel.classList.toggle(
      'required',
      s === 'hinweis' || (s === 'behoben' && isMaengelTask),
    );
    for (const [status, chip] of chips) {
      chip.classList.toggle('active', status === s);
    }
  }
  statusSelect.addEventListener('change', updateRequiredFields);
  updateRequiredFields();

  body.appendChild(statusSection);

  /* Status-Felder aus dem Formular lesen */
  function readFields(): StatusFields {
    return {
      status: statusSelect.value as TaskStatus,
      editedBy: editedByInput.value,
      editedAt: editedAtInput.value,
      hintText: hintTextInput.value,
      afterImages: afterImages.getImages(),
      afterDocuments: afterDocs.getDocuments(),
    };
  }

  /** Prüft, speichert und schließt die Detailansicht. */
  function saveStatus(fields: StatusFields): boolean {
    const err = validateStatusFields(fields, task.typ);
    if (err) {
      showToast(err, 'error');
      if (!hintTextInput.value.trim()) {
        hintTextInput.focus();
        hintTextInput.classList.add('input-error');
      } else {
        editedByInput.focus();
      }
      return false;
    }
    rememberEditedBy(fields.editedBy);
    const updated = applyStatusFields(task, fields);
    handle.close();
    opts.onChanged(updated);
    return true;
  }

  /** Schnellwechsel: Status setzen und – wenn erlaubt – direkt speichern. */
  function quickSwitch(status: TaskStatus): void {
    statusSelect.value = status;
    updateRequiredFields();
    saveStatus(readFields());
  }

  /* ── Modal ── */
  const actions: {
    label: string;
    kind: 'primary' | 'secondary' | 'danger';
    onClick: () => void | Promise<void>;
  }[] = [
    {
      label: 'Abbrechen',
      kind: 'secondary',
      onClick: () => handle.close(),
    },
  ];

  if (opts.onDuplicate) {
    actions.push({
      label: 'Duplizieren',
      kind: 'secondary',
      onClick: () => {
        handle.close();
        opts.onDuplicate!(task);
      },
    });
  }

  actions.push({
    label: 'PDF',
    kind: 'secondary',
    onClick: async () => {
      try {
        const { buildTaskPdf, taskReportFileName } = await import('../io/task-export');
        const bytes = await withProgress('Aufgaben-PDF wird erstellt …', async () =>
          buildTaskPdf(opts.project, task),
        );
        downloadBlob(pdfBlob(bytes), taskReportFileName(opts.project, task));
        showToast('Aufgabe als PDF exportiert.', 'success');
      } catch {
        showToast('PDF konnte nicht erstellt werden.', 'error');
      }
    },
  });

  actions.push({
    label: 'Speichern',
    kind: 'primary',
    onClick: () => {
      saveStatus(readFields());
    },
  });

  const handle = openModal({
    title: 'Aufgabe',
    content: body,
    wide: true,
    dismissible: true,
    actions,
  });
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
