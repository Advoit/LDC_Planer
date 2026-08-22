/* ── Aufgaben-Formular (Erstellen / Bearbeiten) ── */

import { el } from './dom';
import { openModal, confirmDialog } from './modal';
import { showToast } from './toast';
import { createImageUploader } from './image-upload';
import { createMaterialEditor } from './material-editor';
import { validateTaskInput } from '../domain/task';
import type { NewTaskInput } from '../domain/task';
import type { Project, Task } from '../domain/types';

export type TaskFormMode = 'create' | 'edit';

export interface TaskFormResult {
  input: NewTaskInput;
  delete?: boolean;
}

export function openTaskForm(opts: {
  mode: TaskFormMode;
  project: Project;
  task?: Task;
}): Promise<TaskFormResult | null> {
  const isEdit = opts.mode === 'edit';
  const task = opts.task;
  const title = isEdit ? 'Aufgabe bearbeiten' : 'Neue Aufgabe';
  const saveLabel = isEdit ? 'Speichern' : 'Erstellen';

  /* Bild-Uploader */
  const imageUploader = createImageUploader({
    images: task?.images ?? [],
    thumbnailSourceId: task?.thumbnailSourceId ?? null,
    showThumbnailPicker: true,
    label: 'Aufgabenbilder (Vorher)',
  });

  /* Material-Editor */
  const materialEditor = createMaterialEditor({
    tasks: opts.project.tasks,
    initial: task?.material ?? [],
    exceptTaskId: task?.id,
  });

  const body = el('div', { class: 'task-form' }, [
    /* Name */
    el('label', { class: 'field-label' }, ['Name *']),
    el('input', {
      type: 'text',
      class: 'input',
      name: 'name',
      placeholder: 'Aufgabenname',
      value: task?.name ?? '',
      required: 'true',
    }),

    /* Beschreibung */
    el('label', { class: 'field-label' }, ['Beschreibung *']),
    el('textarea', {
      class: 'input textarea',
      name: 'description',
      placeholder: 'Aufgabenbeschreibung',
      rows: '3',
    }, [task?.description ?? '']),

    /* Bilder */
    imageUploader.element,

    /* Material */
    materialEditor.element,

    /* Geplanter Arbeitsaufwand */
    el('label', { class: 'field-label' }, ['Geplanter Arbeitsaufwand (hh:mm)']),
    el('input', {
      type: 'text',
      class: 'input input-time',
      name: 'plannedWork',
      placeholder: 'z.B. 02:30',
      pattern: '\\d{1,2}:\\d{2}',
      value: task?.plannedWork ?? '',
    }),
  ]);

  return new Promise((resolve) => {
    const actions: { label: string; kind: 'primary' | 'secondary' | 'danger'; onClick: () => void | Promise<void> }[] = [
      {
        label: 'Abbrechen',
        kind: 'secondary' as const,
        onClick: () => {
          handle.close();
          resolve(null);
        },
      },
      {
        label: saveLabel,
        kind: 'primary' as const,
        onClick: () => {
          const nameInput = body.querySelector<HTMLInputElement>('[name="name"]');
          const descInput = body.querySelector<HTMLTextAreaElement>('[name="description"]');
          const timeInput = body.querySelector<HTMLInputElement>('[name="plannedWork"]');

          const input: NewTaskInput = {
            name: nameInput?.value ?? '',
            description: descInput?.value ?? '',
            images: imageUploader.getImages(),
            thumbnail: imageUploader.getThumbnail(),
            thumbnailSourceId: imageUploader.getThumbnailSourceId(),
            material: materialEditor.getItems(),
            plannedWork: timeInput?.value?.trim() ?? '',
          };

          const err = validateTaskInput(input);
          if (err) {
            showToast(err, 'error');
            return;
          }

          handle.close();
          resolve({ input });
        },
      },
    ];

    /* Löschen-Button nur im Edit-Modus */
    if (isEdit) {
      actions.push({
        label: 'Löschen',
        kind: 'danger' as const,

        onClick: async () => {
          const confirmed = await confirmDialog({
            title: 'Aufgabe löschen',
            message: `Möchten Sie die Aufgabe „${task?.name}“ wirklich löschen?`,
            danger: true,
          });
          if (confirmed) {
            handle.close();
            resolve({ input: {} as NewTaskInput, delete: true });
          }
        },
      });
    }

    const handle = openModal({
      title,
      content: body,
      actions,
      wide: true,
      onClose: () => resolve(null),
    });
  });
}