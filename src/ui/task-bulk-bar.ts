/* ── Aktionsleiste für Sammelaktionen (mehrere Aufgaben auf einmal) ── */

import { el, icon, clear } from './dom';
import { STATUS_LABELS, TASK_STATUSES } from '../domain/types';
import type { TaskStatus } from '../domain/types';

export interface BulkBarOptions {
  onStatus: (ids: string[], status: TaskStatus) => void;
  onDelete: (ids: string[]) => void;
  onExport: (ids: string[]) => void;
  /** Auswahl aller sichtbaren Aufgaben umschalten (Liste zeichnet danach neu). */
  onToggleAll: () => void;
}

export interface BulkBarHandle {
  element: HTMLElement;
  /** Zeichnet die Leiste für die aktuelle Auswahl (leer = ausgeblendet). */
  update(selected: Set<string>, visibleCount: number): void;
}

export function createBulkBar(opts: BulkBarOptions): BulkBarHandle {
  const element = el('div', { class: 'bulk-bar' });

  function update(selected: Set<string>, visibleCount: number): void {
    clear(element);
    const ids = [...selected];
    if (ids.length === 0) {
      element.classList.remove('open');
      return;
    }
    element.classList.add('open');

    element.appendChild(
      el('span', { class: 'bulk-count' }, [`${ids.length} ausgewählt`]),
    );

    const statusSelect = el('select', { class: 'input bulk-status' }) as HTMLSelectElement;
    statusSelect.appendChild(el('option', { value: '' }, ['Status ändern …']));
    for (const status of TASK_STATUSES) {
      statusSelect.appendChild(el('option', { value: status }, [STATUS_LABELS[status]]));
    }
    statusSelect.addEventListener('change', () => {
      const value = statusSelect.value as TaskStatus | '';
      statusSelect.value = '';
      if (value) opts.onStatus(ids, value);
    });
    element.appendChild(statusSelect);

    const pdfBtn = el('button', { class: 'btn btn-secondary btn-sm', type: 'button' }, [
      icon('file-down'),
      ' Als PDF',
    ]);
    pdfBtn.addEventListener('click', () => opts.onExport(ids));
    element.appendChild(pdfBtn);

    const delBtn = el('button', { class: 'btn btn-danger btn-sm', type: 'button' }, [
      icon('trash'),
      ' Löschen',
    ]);
    delBtn.addEventListener('click', () => {
      selected.clear();
      opts.onDelete(ids);
    });
    element.appendChild(delBtn);

    const allSelected = visibleCount > 0 && ids.length >= visibleCount;
    const allBtn = el('button', { class: 'link-btn', type: 'button' }, [
      allSelected ? 'Auswahl aufheben' : 'Alle auswählen',
    ]);
    allBtn.addEventListener('click', () => opts.onToggleAll());
    element.appendChild(allBtn);
  }

  return { element, update };
}
