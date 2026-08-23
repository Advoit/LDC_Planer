/* ── Aufgaben-Formular (Erstellen / Bearbeiten) ── */

import { el } from './dom';
import { openModal, confirmDialog } from './modal';
import { showToast } from './toast';
import { createImageUploader } from './image-upload';
import { createDocumentUploader } from './document-upload';
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

  /* Dokument-Uploader */
  const documentUploader = createDocumentUploader({
    documents: task?.documents ?? [],
    label: 'Dokumente (Pläne, Anhänge)',
    hint: 'Weitere Unterlagen zur Aufgabe, z. B. Pläne oder Angebote.',
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

    /* Dokumente */
    documentUploader.element,

    /* Material */
    materialEditor.element,

    /* Geplanter Arbeitsaufwand */
    el('label', { class: 'field-label' }, ['Geplanter Arbeitsaufwand (hh:mm)']),
    el('input', {
      type: 'time',
      class: 'input input-time',
      name: 'plannedWork',
      step: '60',
      value: task?.plannedWork ?? '',
    }),

    /* Personalbedarf */
    el('label', { class: 'field-label' }, ['Personalbedarf (Anzahl Personen)']),
    el('input', {
      type: 'number',
      class: 'input input-time',
      name: 'personnel',
      min: '1',
      step: '1',
      inputmode: 'numeric',
      placeholder: '1',
      value: task?.personnel ?? 1,
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
          const personnelInput = body.querySelector<HTMLInputElement>('[name="personnel"]');

          const personnelRaw = personnelInput?.value.trim() ?? '';
          const personnel = personnelRaw === '' ? 1 : Number(personnelRaw);

          const input: NewTaskInput = {
            name: nameInput?.value ?? '',
            description: descInput?.value ?? '',
            images: imageUploader.getImages(),
            thumbnail: imageUploader.getThumbnail(),
            thumbnailSourceId: imageUploader.getThumbnailSourceId(),
            material: materialEditor.getItems(),
            plannedWork: timeInput?.value?.trim() ?? '',
            personnel,
            documents: documentUploader.getDocuments(),
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