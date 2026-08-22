/* ── Aufgaben-Detail: Übersicht & Status-Änderung ── */

import { el, formatDateTime } from './dom';
import { openModal } from './modal';
import { showToast } from './toast';
import { openImageViewer } from './image-viewer';
import { createImageUploader } from './image-upload';
import { validateStatusFields, applyStatusFields } from '../domain/task';
import type { StatusFields } from '../domain/task';
import { TASK_STATUSES, STATUS_LABELS } from '../domain/types';
import type { Project, Task, TaskStatus } from '../domain/types';

export function openTaskDetail(opts: {
  project: Project;
  taskId: string;
  onChanged: (updatedTask: Task) => void;
}): void {
  const task = opts.project.tasks.find((t) => t.id === opts.taskId);
  if (!task) return;

  const afterImages = createImageUploader({
    images: task.afterImages,
    thumbnailSourceId: null,
    showThumbnailPicker: false,
    label: 'Nachher-Bilder',
  });

  const body = el('div', { class: 'task-detail' });

  /* ── Erstellungsfelder (nur lesbar) ── */
  body.appendChild(
    el('div', { class: 'detail-section' }, [
      el('h3', { class: 'detail-task-name' }, [task.name]),
      el('p', { class: 'detail-meta' }, [formatDateTime(task.createdAt)]),
      el('p', { class: 'detail-desc' }, [task.description]),
      task.plannedWork
        ? el('p', { class: 'detail-meta' }, [`Geplanter Aufwand: ${task.plannedWork}`])
        : el('div'),
    ]),
  );

  /* Material (read-only) */
  if (task.material.length > 0) {
    const matList = el('ul', { class: 'detail-material' });
    for (const m of task.material) {
      matList.appendChild(
        el('li', {}, [`${m.name} – ${m.quantity} ${m.unit}`]),
      );
    }
    body.appendChild(el('div', { class: 'detail-section' }, [el('h4', {}, ['Material']), matList]));
  }

  /* Vorher-Bilder */
  if (task.images.length > 0) {
    const imgGrid = el('div', { class: 'detail-image-grid' });
    for (const img of task.images) {
      const thumb = el('img', { src: img.dataUrl, class: 'detail-img' });
      thumb.addEventListener('click', () => openImageViewer(img.dataUrl));
      imgGrid.appendChild(thumb);
    }
    body.appendChild(el('div', { class: 'detail-section' }, [el('h4', {}, ['Vorher-Bilder']), imgGrid]));
  }

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

  /* Bearbeitet von */
  const editedByInput = el('input', {
    type: 'text',
    class: 'input',
    name: 'editedBy',
    placeholder: 'Name',
    value: task.editedBy,
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

  /* Dynamische Pflichtfelder */
  const hintLabel = statusSection.querySelector('.hint-label')!;
  function updateRequiredFields(): void {
    const s = statusSelect.value as TaskStatus;
    const needFields = s !== 'offen';
    editedByInput.required = needFields;
    editedAtInput.required = needFields;
    hintLabel.classList.toggle('required', s === 'hinweis');
  }
  statusSelect.addEventListener('change', updateRequiredFields);
  updateRequiredFields();

  body.appendChild(statusSection);

  /* ── Modal ── */
  const handle = openModal({
    title: 'Aufgabe',
    content: body,
    wide: true,
    dismissible: true,
    actions: [
      {
        label: 'Abbrechen',
        kind: 'secondary',
        onClick: () => {
          handle.close();
        },
      },
      {
        label: 'Speichern',
        kind: 'primary',
        onClick: async () => {
          const fields: StatusFields = {
            status: statusSelect.value as TaskStatus,
            editedBy: editedByInput.value,
            editedAt: editedAtInput.value,
            hintText: hintTextInput.value,
            afterImages: afterImages.getImages(),
          };
          const err = validateStatusFields(fields);
          if (err) {
            showToast(err, 'error');
            return;
          }
          const updated = applyStatusFields(task, fields);
          handle.close();
          opts.onChanged(updated);
        },
      },
    ],
  });
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}