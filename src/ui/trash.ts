/* ── Papierkorb: gelöschte Aufgaben wiederherstellen ── */

import { el, icon, formatDateTime } from './dom';
import { openModal, confirmDialog } from './modal';
import { STATUS_LABELS } from '../domain/types';
import type { Task } from '../domain/types';
import { clearTrash, loadTrash, saveTrash } from '../core/recovery-store';
import type { TrashedTask } from '../core/recovery-store';

export interface TrashModalOptions {
  projectId: string;
  onRestore: (tasks: Task[]) => void;
}

/** Zeigt die gelöschten Aufgaben und erlaubt das Wiederherstellen. */
export function openTrashModal(opts: TrashModalOptions): void {
  const body = el('div', { class: 'trash-modal' });

  const handle = openModal({
    title: 'Gelöschte Aufgaben',
    content: body,
    wide: true,
    actions: [
      {
        label: 'Papierkorb leeren',
        kind: 'danger',
        onClick: async () => {
          const ok = await confirmDialog({
            title: 'Papierkorb leeren',
            message:
              'Alle gelöschten Aufgaben werden endgültig entfernt. Fortfahren?',
            confirmLabel: 'Endgültig löschen',
            danger: true,
          });
          if (!ok) return;
          await clearTrash(opts.projectId);
          await render();
        },
      },
      {
        label: 'Schließen',
        kind: 'secondary',
        onClick: () => handle.close(),
      },
    ],
  });

  function row(item: TrashedTask): HTMLElement {
    const restoreBtn = el('button', {
      class: 'btn btn-secondary btn-sm',
      type: 'button',
    }, [icon('rotate-ccw'), ' Wiederherstellen']);
    restoreBtn.addEventListener('click', async () => {
      handle.close();
      opts.onRestore([item.task]);
    });

    return el('div', { class: 'trash-row' }, [
      el('span', { class: 'snapshot-info' }, [
        el('strong', {}, [item.task.name]),
        el('span', { class: 'snapshot-meta' }, [
          `${STATUS_LABELS[item.task.status]} · gelöscht am ${formatDateTime(item.deletedAt)}`,
        ]),
      ]),
      restoreBtn,
    ]);
  }

  async function render(): Promise<void> {
    body.replaceChildren();
    const items = await loadTrash(opts.projectId);

    if (items.length === 0) {
      body.appendChild(
        el('p', { class: 'empty-hint' }, ['Der Papierkorb ist leer.']),
      );
      return;
    }

    const allBtn = el('button', {
      class: 'btn btn-secondary btn-sm',
      type: 'button',
    }, [icon('rotate-ccw'), ' Alle wiederherstellen']);
    allBtn.addEventListener('click', async () => {
      handle.close();
      opts.onRestore(items.map((i) => i.task));
      await saveTrash(opts.projectId, []);
    });

    body.appendChild(
      el('p', { class: 'export-hint' }, [
        `Gelöschte Aufgaben bleiben hier, bis der Papierkorb geleert wird (max. 10).`,
      ]),
    );
    body.appendChild(el('div', { class: 'trash-actions' }, [allBtn]));
    for (const item of items) body.appendChild(row(item));
  }

  void render();
}
