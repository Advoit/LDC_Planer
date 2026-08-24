/* ── Aufgaben-Formular (Erstellen / Bearbeiten) ── */

import { el } from './dom';
import { openModal, confirmDialog } from './modal';
import { showToast } from './toast';
import { createImageUploader } from './image-upload';
import { createDocumentUploader } from './document-upload';
import { createMaterialEditor } from './material-editor';
import { validateTaskInput } from '../domain/task';
import { getPreference, setPreference } from '../core/preferences';
import { MANGEL_ARTEN, TASK_TYPS, TASK_TYP_LABELS } from '../domain/types';
import type { NewTaskInput } from '../domain/task';
import type { Project, Task, TaskTyp } from '../domain/types';

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

    /* Aufgabenbeschreibung */
    el('label', { class: 'field-label' }, ['Aufgabenbeschreibung *']),
    el('textarea', {
      class: 'input textarea',
      name: 'description',
      placeholder: 'Aufgabenbeschreibung',
      rows: '3',
    }, [task?.description ?? '']),

    /* ── Mängel-/Umbau-Klassifizierung ── */

    /* Typ (letzte Wahl bleibt erhalten) */
    el('label', { class: 'field-label' }, ['Typ']),
    buildTypSelect(),

    /* Art A1–C3 (letzte Wahl bleibt erhalten) */
    el('label', { class: 'field-label' }, ['Art']),
    buildArtSelect(),

    /* Mängel-Felder: nur bei Typ „Mängel“ sichtbar */
    buildMaengelFields(),

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

  /* Mängel-Felder initial ein-/ausblenden */
  syncMaengelFields();

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
          const typInput = body.querySelector<HTMLSelectElement>('[name="typ"]');
          const artInput = body.querySelector<HTMLSelectElement>('[name="art"]');
          const pruefungInput = body.querySelector<HTMLInputElement>('[name="pruefung"]');
          const fehlerInput = body.querySelector<HTMLTextAreaElement>('[name="fehlerbeschreibung"]');
          const positionInput = body.querySelector<HTMLInputElement>('[name="position"]');

          const personnelRaw = personnelInput?.value.trim() ?? '';
          const personnel = personnelRaw === '' ? 1 : Number(personnelRaw);

          /* Letzte Wahl & letzte Eingaben dauerhaft merken */
          setPreference('taskForm.typ', typInput?.value ?? 'maengel');
          setPreference('taskForm.art', artInput?.value ?? '');
          setPreference('taskForm.pruefung', pruefungInput?.value ?? '');
          setPreference('taskForm.position', positionInput?.value ?? '');

          const input: NewTaskInput = {
            name: nameInput?.value ?? '',
            description: descInput?.value ?? '',
            images: imageUploader.getImages(),
            thumbnail: imageUploader.getThumbnail(),
            thumbnailSourceId: imageUploader.getThumbnailSourceId(),
            material: materialEditor.getItems(),
            plannedWork: timeInput?.value?.trim() ?? '',
            personnel,
            typ: (typInput?.value as TaskTyp) ?? 'maengel',
            art: artInput?.value ?? '',
            pruefung: pruefungInput?.value ?? '',
            fehlerbeschreibung: fehlerInput?.value ?? '',
            position: positionInput?.value ?? '',
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

  /* ── Helfer für die Mängel-/Umbau-Felder ── */

  function buildTypSelect(): HTMLSelectElement {
    const initial = isEdit
      ? (task?.typ ?? 'maengel')
      : getPreference<TaskTyp>('taskForm.typ', 'maengel');
    const select = el('select', { class: 'input', name: 'typ' }) as HTMLSelectElement;
    for (const t of TASK_TYPS) {
      select.appendChild(el('option', { value: t }, [TASK_TYP_LABELS[t]]));
    }
    select.value = initial;
    select.addEventListener('change', () => {
      setPreference('taskForm.typ', select.value as TaskTyp);
      syncMaengelFields();
    });
    return select;
  }

  function buildArtSelect(): HTMLSelectElement {
    const initial = isEdit
      ? (task?.art ?? '')
      : getPreference<string>('taskForm.art', '');
    const select = el('select', { class: 'input', name: 'art' }) as HTMLSelectElement;
    select.appendChild(el('option', { value: '' }, ['–']));
    for (const art of MANGEL_ARTEN) {
      select.appendChild(el('option', { value: art }, [art]));
    }
    select.value = initial;
    select.addEventListener('change', () => {
      setPreference('taskForm.art', select.value);
    });
    return select;
  }

  function buildMaengelFields(): HTMLElement {
    const pruefungInput = el('input', {
      type: 'text',
      class: 'input',
      name: 'pruefung',
      placeholder: 'z. B. Sichtprüfung, Messung, Funktionsprüfung…',
      value: isEdit
        ? (task?.pruefung ?? '')
        : getPreference<string>('taskForm.pruefung', ''),
    }) as HTMLInputElement;
    const fehlerInput = el('textarea', {
      class: 'input textarea',
      name: 'fehlerbeschreibung',
      placeholder: 'Fehlerbeschreibung',
      rows: '3',
    }, [task?.fehlerbeschreibung ?? '']);
    const positionInput = el('input', {
      type: 'text',
      class: 'input',
      name: 'position',
      placeholder: 'z. B. EG, Raum 101, Wand 3…',
      value: isEdit
        ? (task?.position ?? '')
        : getPreference<string>('taskForm.position', ''),
    }) as HTMLInputElement;

    pruefungInput.addEventListener('input', () => {
      setPreference('taskForm.pruefung', pruefungInput.value);
    });
    positionInput.addEventListener('input', () => {
      setPreference('taskForm.position', positionInput.value);
    });

    const fields = el('div', { class: 'maengel-fields' }, [
      el('label', { class: 'field-label' }, ['Prüfung']),
      pruefungInput,
      el('label', { class: 'field-label' }, ['Fehlerbeschreibung']),
      fehlerInput,
      el('label', { class: 'field-label' }, ['Position']),
      positionInput,
    ]);
    return fields;
  }

  function syncMaengelFields(): void {
    const typEl = body.querySelector<HTMLSelectElement>('[name="typ"]');
    const fields = body.querySelector<HTMLElement>('.maengel-fields');
    if (typEl && fields) fields.hidden = typEl.value !== 'maengel';
  }
}