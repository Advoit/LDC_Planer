/* ── Sicherungsstände: automatische Zwischenstände ansehen und wiederherstellen ── */

import { el, icon, formatDateTime } from './dom';
import { openModal, confirmDialog } from './modal';
import { showToast } from './toast';
import { migrateProject } from '../core/migrate';
import {
  createSnapshot,
  deleteSnapshot,
  listSnapshots,
  loadSnapshot,
} from '../core/recovery-store';
import type { SnapshotMeta } from '../core/recovery-store';
import type { Project } from '../domain/types';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface SnapshotsModalOptions {
  project: Project;
  onRestore: (snapshot: Project) => void;
}

/** Zeigt die Sicherungsstände des Projekts – inkl. manuellem Anlegen und Wiederherstellen. */
export function openSnapshotsModal(opts: SnapshotsModalOptions): void {
  const body = el('div', { class: 'snapshots-modal' });

  const handle = openModal({
    title: 'Sicherungsstände',
    content: body,
    wide: true,
    actions: [
      {
        label: 'Sicherungsstand jetzt',
        kind: 'secondary',
        onClick: async () => {
          const meta = await createSnapshot(opts.project);
          if (meta) {
            showToast('Sicherungsstand angelegt.', 'success');
            await render();
          } else {
            showToast('Zu wenig Speicherplatz für einen Sicherungsstand.', 'error');
          }
        },
      },
      {
        label: 'Schließen',
        kind: 'primary',
        onClick: () => handle.close(),
      },
    ],
  });

  async function render(): Promise<void> {
    body.replaceChildren();
    const snapshots = await listSnapshots(opts.project.id);

    body.appendChild(
      el('p', { class: 'export-hint' }, [
        `Automatische Zwischenstände vor größeren Änderungen (max. 3). Aktuell: ${formatDateTime(new Date().toISOString())}`,
      ]),
    );

    if (snapshots.length === 0) {
      body.appendChild(
        el('p', { class: 'empty-hint' }, ['Noch keine Sicherungsstände vorhanden.']),
      );
      return;
    }

    for (const meta of snapshots) {
      body.appendChild(snapshotRow(meta));
    }
  }

  function snapshotRow(meta: SnapshotMeta): HTMLElement {
    const restoreBtn = el('button', {
      class: 'btn btn-secondary btn-sm',
      type: 'button',
    }, [icon('rotate-ccw'), ' Wiederherstellen']);
    restoreBtn.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Sicherungsstand wiederherstellen',
        message: `Der aktuelle Stand wird durch den Sicherungsstand vom ${formatDateTime(meta.ts)} ersetzt. Fortfahren?`,
        confirmLabel: 'Wiederherstellen',
        danger: true,
      });
      if (!ok) return;

      const raw = await loadSnapshot(opts.project.id, meta.ts);
      if (!raw) {
        showToast('Sicherungsstand konnte nicht geladen werden.', 'error');
        return;
      }
      handle.close();
      opts.onRestore(migrateProject(raw));
    });

    const delBtn = el('button', {
      class: 'icon-btn document-del',
      type: 'button',
      title: 'Sicherungsstand löschen',
      'aria-label': 'Sicherungsstand löschen',
    }, [icon('trash')]);
    delBtn.addEventListener('click', async () => {
      await deleteSnapshot(opts.project.id, meta.ts);
      await render();
    });

    return el('div', { class: 'snapshot-row' }, [
      el('span', { class: 'snapshot-icon' }, [icon('history')]),
      el('span', { class: 'snapshot-info' }, [
        el('strong', {}, [formatDateTime(meta.ts)]),
        el('span', { class: 'snapshot-meta' }, [
          `${meta.taskCount} ${meta.taskCount === 1 ? 'Aufgabe' : 'Aufgaben'} · ${formatSize(meta.bytes)}`,
        ]),
      ]),
      restoreBtn,
      delBtn,
    ]);
  }

  void render();
}
