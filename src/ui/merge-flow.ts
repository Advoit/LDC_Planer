/* ── Merge-Ablauf: Dialoge + Konfliktauflösung ── */

import { el } from './dom';
import { openModal } from './modal';
import { mergeProjects } from '../domain/merge';
import type { TaskConflict, ConflictResolution } from '../domain/merge';
import type { Project, Task } from '../domain/types';

export type MergeChoice = 'merge' | 'overwrite' | 'cancel';

/**
 * Fragt: Zusammenführen / Überschreiben / Abbrechen.
 * Zusammenführen ist auch bei unterschiedlicher Projekt-ID möglich –
 * dann wird auf den Verlust der Import-ID hingewiesen.
 */
export function showMergeOrOverwriteDialog(
  local: Project,
  imported: Project,
): Promise<MergeChoice> {
  return new Promise((resolve) => {
    const sameId = local.id === imported.id;
    const warning =
      sameId
        ? el('p', {}, [
            'Möchten Sie das geladene Projekt mit dem aktuellen zusammenführen oder das aktuelle überschreiben?',
          ])
        : el('div', { class: 'merge-warning' }, [
            el('p', {}, [
              `Die Projekt-ID des Imports (${imported.id}) unterscheidet sich vom aktuellen Projekt (${local.id}).`,
            ]),
            el('p', { class: 'merge-warning-note' }, [
              'Beim Zusammenführen wird die ID des Imports verworfen – es werden nur die Aufgaben angehängt.',
            ]),
          ]);

    const handle = openModal({
      title: 'Projekt laden',
      content: warning,
      actions: [
        {
          label: 'Abbrechen',
          kind: 'secondary',
          onClick: () => {
            handle.close();
            resolve('cancel');
          },
        },
        {
          label: 'Zusammenführen',
          kind: 'primary',
          onClick: () => {
            handle.close();
            resolve('merge');
          },
        },
        {
          label: 'Überschreiben',
          kind: 'danger',
          onClick: () => {
            handle.close();
            resolve('overwrite');
          },
        },
      ],
      onClose: () => resolve('cancel'),
    });
  });
}

/** Führt die Zusammenführung aus und löst Konflikte per Modal auf. */
export async function runMergeFlow(
  local: Project,
  imported: Project,
): Promise<Project> {
  let conflictIdx = 0;

  async function resolveConflict(
    conflict: TaskConflict,
  ): Promise<ConflictResolution> {
    conflictIdx++;
    const content = el('div', { class: 'merge-content' }, [
      el('p', { class: 'merge-conflict-title' }, [
        `Konflikt ${conflictIdx}: „${conflict.local.name}“`,
      ]),
      el('div', { class: 'merge-cols' }, [
        el('div', { class: 'merge-col' }, [
          el('strong', {}, ['Lokale Aufgabe']),
          el('pre', {}, [formatTaskText(conflict.local)]),
        ]),
        el('div', { class: 'merge-col' }, [
          el('strong', {}, ['Importierte Aufgabe']),
          el('pre', {}, [formatTaskText(conflict.imported)]),
        ]),
      ]),
    ]);

    return new Promise((resolve) => {
      const handle = openModal({
        title: 'Konflikt auflösen',
        content,
        actions: [
          {
            label: 'Lokal behalten',
            kind: 'primary',
            onClick: () => {
              handle.close();
              resolve('local');
            },
          },
          {
            label: 'Importiertes übernehmen',
            kind: 'secondary',
            onClick: () => {
              handle.close();
              resolve('imported');
            },
          },
        ],
        onClose: () => resolve('local'),
      });
    });
  }

  const result = await mergeProjects(local, imported, resolveConflict);
  return result.merged;
}

function formatTaskText(task: Task): string {
  const status = { offen: 'Offen', hinweis: 'Hinweis', behoben: 'Behoben' }[
    task.status
  ];
  return [
    `Status: ${status}`,
    `Beschreibung: ${task.description}`,
    task.plannedWork ? `Arbeitsaufwand: ${task.plannedWork}` : '',
    `Material: ${task.material.length} Positionen`,
    task.editedBy ? `Bearbeitet von: ${task.editedBy}` : '',
    task.hintText ? `Hinweis: ${task.hintText}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}