/* ── Neues-Projekt-Flow (Warnung → Formular) ── */

import { el } from './dom';
import { openModal, confirmDialog } from './modal';
import { validateProjectInput, createProject } from '../domain/project';
import type { Project } from '../domain/types';

export async function openNewProjectFlow(
  hasCurrentProject: boolean,
): Promise<Project | null> {
  /* Schritt 1: Warnung, falls ein Projekt existiert */
  if (hasCurrentProject) {
    const confirmed = await confirmDialog({
      title: 'Neues Projekt',
      message:
        'Achtung: Alle vorhandenen Daten werden entfernt. Möchten Sie trotzdem ein neues Projekt anlegen?',
      confirmLabel: 'Neues Projekt anlegen',
      danger: true,
    });
    if (!confirmed) return null;
  }

  /* Schritt 2: Formular */
  const nameInput = el('input', {
    type: 'text',
    class: 'input',
    placeholder: 'Projektname',
    required: 'true',
    autofocus: 'true',
  }) as HTMLInputElement;

  const locationInput = el('input', {
    type: 'text',
    class: 'input',
    placeholder: 'Ort',
    required: 'true',
  }) as HTMLInputElement;

  const descInput = el('textarea', {
    class: 'input textarea',
    placeholder: 'Beschreibung (optional)',
    rows: '3',
  }) as HTMLTextAreaElement;

  const form = el('div', { class: 'project-form' }, [
    el('label', { class: 'field-label' }, ['Projektname *']),
    nameInput,
    el('label', { class: 'field-label' }, ['Ort *']),
    locationInput,
    el('label', { class: 'field-label' }, ['Beschreibung']),
    descInput,
  ]);

  return new Promise((resolve) => {
    const handle = openModal({
      title: 'Neues Projekt',
      content: form,
      actions: [
        {
          label: 'Abbrechen',
          kind: 'secondary',
          onClick: () => {
            handle.close();
            resolve(null);
          },
        },
        {
          label: 'Erstellen',
          kind: 'primary',
          onClick: () => {
            const err = validateProjectInput({
              name: nameInput.value,
              location: locationInput.value,
              description: descInput.value,
            });
            if (err) {
              /* Zeige Fehler inline */
              nameInput.classList.toggle('input-error', !nameInput.value.trim());
              locationInput.classList.toggle('input-error', !locationInput.value.trim());
              return;
            }
            const project = createProject({
              name: nameInput.value,
              location: locationInput.value,
              description: descInput.value,
            });
            handle.close();
            resolve(project);
          },
        },
      ],
      onClose: () => resolve(null),
    });
  });
}