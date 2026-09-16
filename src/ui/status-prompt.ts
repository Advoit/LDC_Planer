/* ── Dialog: Status wechseln inkl. „Bearbeitet von/am“ (auch für Sammelaktionen) ── */

import { el } from './dom';
import { openModal } from './modal';
import { showToast } from './toast';
import { getPreference, setPreference } from '../core/preferences';
import { STATUS_LABELS } from '../domain/types';
import type { TaskStatus } from '../domain/types';

export interface StatusPromptResult {
  editedBy: string;
  editedAt: string;
}

const EDITED_BY_PREF = 'taskStatus.editedBy';

/** Zuletzt verwendeter Bearbeiter-Name (wird im Projekt einmalig gemerkt). */
export function lastEditedBy(fallback = ''): string {
  return getPreference<string>(EDITED_BY_PREF, fallback) || fallback;
}

export function rememberEditedBy(name: string): void {
  if (name.trim()) setPreference(EDITED_BY_PREF, name.trim());
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Fragt die Pflichtfelder für einen Statuswechsel ab.
 * Für „Offen“ sind keine Felder nötig – dann wird direkt bestätigt.
 */
export function promptStatusFields(opts: {
  status: TaskStatus;
  title?: string;
  count?: number;
}): Promise<StatusPromptResult | null> {
  const { status } = opts;
  const editedBy = el('input', {
    type: 'text',
    class: 'input',
    placeholder: 'Name',
    value: lastEditedBy(),
  }) as HTMLInputElement;
  const editedAt = el('input', {
    type: 'date',
    class: 'input',
    value: todayISO(),
  }) as HTMLInputElement;

  const head = el('p', { class: 'export-hint' }, [
    opts.count && opts.count > 1
      ? `${opts.count} Aufgaben auf „${STATUS_LABELS[status]}“ setzen.`
      : `Status auf „${STATUS_LABELS[status]}“ setzen.`,
  ]);

  const content = el('div', { class: 'status-prompt' }, [head]);

  if (status !== 'offen') {
    content.appendChild(el('label', { class: 'field-label' }, ['Bearbeitet von *']));
    content.appendChild(editedBy);
    content.appendChild(el('label', { class: 'field-label' }, ['Bearbeitet am *']));
    content.appendChild(editedAt);
  }

  return new Promise((resolve) => {
    const handle = openModal({
      title: opts.title ?? 'Status ändern',
      content,
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
          label: 'Bestätigen',
          kind: 'primary',
          onClick: () => {
            if (status !== 'offen') {
              if (!editedBy.value.trim()) {
                showToast('Bitte „Bearbeitet von“ angeben.', 'error');
                return;
              }
              if (!editedAt.value) {
                showToast('Bitte „Bearbeitet am“ angeben.', 'error');
                return;
              }
            }
            rememberEditedBy(editedBy.value);
            const result: StatusPromptResult = {
              editedBy: editedBy.value,
              editedAt: editedAt.value,
            };
            handle.close();
            resolve(result);
          },
        },
      ],
      onClose: () => resolve(null),
    });
  });
}
