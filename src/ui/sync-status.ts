/* ── Cloud-Status oben rechts (grün/blau/gelb/rot/grau) ── */

import { el, icon, formatDateTime } from './dom';
import { openModal } from './modal';
import { openServerModal } from './server-modal';
import {
  activeLockCount,
  getSyncState,
  subscribeSync,
  syncNow,
} from './server-sync';
import type { SyncStatus } from './server-sync';
import { isLinkedServer, serverLink } from '../domain/server';
import { state } from './app-state';

const STATUS_LABEL: Readonly<Record<SyncStatus, string>> = {
  unlinked: 'Kein Server hinterlegt',
  online: 'Online und synchronisiert',
  syncing: 'Synchronisierung läuft',
  offline: 'Server nicht erreichbar',
  error: 'Nicht verbunden',
};

const STATUS_ICON: Readonly<Record<SyncStatus, string>> = {
  unlinked: 'cloud-off',
  online: 'cloud-check',
  syncing: 'cloud-upload',
  offline: 'cloud-question',
  error: 'cloud-exclamation',
};

/** Baut das kleine Cloud-Icon für die Kopfleiste. */
export function buildSyncStatusButton(): HTMLElement {
  const button = el('button', {
    class: 'sync-status',
    type: 'button',
    'aria-live': 'polite',
  }) as HTMLButtonElement;

  let unsubscribe = (): void => undefined;
  let firstPaint = true;

  const paint = (): void => {
    /* Beim ersten Aufbau ist der Button noch nicht eingehängt. */
    if (!firstPaint && !button.isConnected) {
      unsubscribe();
      return;
    }
    firstPaint = false;
    const current = getSyncState();
    button.className = `sync-status ${current.status}`;
    button.replaceChildren(icon(STATUS_ICON[current.status]));
    const label = `${STATUS_LABEL[current.status]} – ${current.detail}`;
    button.title = label;
    button.setAttribute('aria-label', `Serverstatus: ${label}`);
  };

  unsubscribe = subscribeSync(paint);
  paint();

  button.addEventListener('click', () => openSyncInfo());
  return button;
}

function infoRow(label: string, value: string): HTMLElement {
  return el('div', { class: 'sync-info-row' }, [
    el('span', { class: 'sync-info-label' }, [label]),
    el('span', { class: 'sync-info-value' }, [value]),
  ]);
}

/** Info-Dialog beim Tippen auf das Cloud-Icon. */
export function openSyncInfo(): void {
  const project = state.project;
  if (!project) return;

  const current = getSyncState();
  const server = project.server;
  const linked = server ? isLinkedServer(server) : false;

  const content = el('div', { class: 'sync-info' }, [
    el('div', { class: 'sync-info-head' }, [
      el('span', { class: `sync-info-icon ${current.status}` }, [
        icon(STATUS_ICON[current.status]),
      ]),
      el('div', { class: 'sync-info-text' }, [
        el('strong', {}, [STATUS_LABEL[current.status]]),
        el('p', {}, [current.detail]),
      ]),
    ]),
  ]);

  if (server) {
    content.appendChild(infoRow('Server', serverLink(server)));
    content.appendChild(infoRow('Zielordner', server.path));
    content.appendChild(
      infoRow(
        'Zuletzt synchronisiert',
        current.lastSyncAt ? formatDateTime(current.lastSyncAt) : 'noch nicht',
      ),
    );
    content.appendChild(infoRow('Bearbeitungssperren', `${activeLockCount()} aktiv`));
  } else {
    content.appendChild(
      el('p', { class: 'export-hint' }, [
        'Verknüpfen Sie dieses Projekt mit einer Seafile-Bibliothek, um es online zu sichern und die Bearbeitungssperren zu nutzen.',
      ]),
    );
  }

  content.appendChild(
    el('p', { class: 'field-hint sync-legend' }, [
      'Grau: kein Server · Grün: online · Blau: Sync läuft · Gelb: Server offline · Rot: nicht verbunden.',
    ]),
  );

  const actions: {
    label: string;
    kind: 'primary' | 'secondary';
    onClick: () => void | Promise<void>;
  }[] = [
    {
      label: 'Schließen',
      kind: 'secondary',
      onClick: () => handle.close(),
    },
    {
      label: 'Server',
      kind: 'secondary',
      onClick: () => {
        handle.close();
        setTimeout(() => openServerModal(), 230);
      },
    },
  ];

  if (linked) {
    actions.push({
      label: 'Jetzt synchronisieren',
      kind: 'primary',
      onClick: async () => {
        await syncNow();
        handle.close();
      },
    });
  } else {
    actions.push({
      label: 'Server einrichten',
      kind: 'primary',
      onClick: () => {
        handle.close();
        setTimeout(() => openServerModal(), 230);
      },
    });
  }

  const handle = openModal({
    title: 'Serverstatus',
    content,
    actions,
  });
}
