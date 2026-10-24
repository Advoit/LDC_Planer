/* ── Projekt teilen: Freigabe-ZIP mit Zugangsdatei und Seafile-Link ── */

import { el, downloadBlob } from './dom';
import { openModal } from './modal';
import { showToast } from './toast';
import { state } from './app-state';
import { syncNow } from './server-sync';
import {
  SeafileError,
  createShareLink,
  readServerToken,
  uploadFileAtPath,
} from '../core/seafile';
import { isLinkedServer, joinServerPath } from '../domain/server';
import {
  accessFileName,
  buildShareZip,
  createServerAccess,
  serverShareName,
  shareZipDownloadName,
} from '../io/share';

function errorText(err: unknown): string {
  if (err instanceof SeafileError) return err.message;
  return err instanceof Error ? err.message : 'Unbekannter Fehler.';
}

/**
 * Öffnet den Freigabe-Dialog. Voraussetzung ist eine verknüpfte
 * Seafile-Bibliothek mit lokal gespeichertem Token.
 */
export function openShareModal(): void {
  const project = state.project;
  if (!project) return;
  if (!project.server || !isLinkedServer(project.server)) {
    showToast('Bitte das Projekt zuerst mit einem Server verknüpfen.', 'info');
    return;
  }
  if (!readServerToken(project.server)) {
    showToast('Der API-Token fehlt auf diesem Gerät.', 'error');
    return;
  }

  const initialProject = project;
  const initialProjectId = project.id;

  let closed = false;
  let shareBlob: Blob | null = null;
  let accessText = '';

  const status = el('p', { class: 'server-feedback info' }, [
    'Freigabe wird vorbereitet …',
  ]);

  const linkInput = el('input', {
    type: 'url',
    class: 'input',
    readonly: 'readonly',
    spellcheck: 'false',
    autocomplete: 'off',
    placeholder: 'Freigabe-Link',
  }) as HTMLInputElement;
  const copyBtn = el('button', {
    class: 'btn btn-secondary',
    type: 'button',
    disabled: 'disabled',
  }, ['Kopieren']) as HTMLButtonElement;
  const linkRow = el('div', { class: 'share-link-row' }, [linkInput, copyBtn]);
  linkRow.hidden = true;

  const downloadZipBtn = el('button', {
    class: 'btn btn-secondary',
    type: 'button',
    disabled: 'disabled',
  }, ['Freigabe-ZIP speichern']) as HTMLButtonElement;
  const downloadAccessBtn = el('button', {
    class: 'btn btn-secondary',
    type: 'button',
    disabled: 'disabled',
  }, ['Zugangsdatei speichern']) as HTMLButtonElement;

  const content = el('div', { class: 'server-form' }, [
    el('p', { class: 'export-hint' }, [
      'Die Freigabe enthält das Projekt und eine Zugangsdatei mit Serveradresse, Bibliothek, Zielordner und API-Token. Wer die ZIP in der App lädt, übernimmt den Server-Zugang automatisch.',
    ]),
    status,
    el('p', { class: 'field-label' }, ['Freigabe-Link']),
    linkRow,
    el('p', { class: 'field-hint' }, [
      'Der Link lädt die Freigabe-ZIP von der Seafile-Bibliothek herunter. Empfänger öffnen die ZIP über Projekt → Laden; der Server-Zugang wird dabei hinterlegt.',
    ]),
    el('div', { class: 'share-actions' }, [downloadZipBtn, downloadAccessBtn]),
    el('p', { class: 'field-hint share-warning' }, [
      'Achtung: Die Freigabe-ZIP enthält den API-Token. Nur an Personen weitergeben, die Zugriff auf die Bibliothek haben sollen. Beim erneuten Teilen wird die ZIP auf dem Server ersetzt; zum Beenden den Freigabe-Link in Seafile löschen.',
    ]),
  ]);

  let handle: ReturnType<typeof openModal>;
  handle = openModal({
    title: 'Projekt teilen',
    content,
    wide: true,
    actions: [
      {
        label: 'Schließen',
        kind: 'secondary',
        onClick: () => handle.close(),
      },
    ],
    onClose: () => {
      closed = true;
    },
  });

  function setStatus(message: string, kind: 'info' | 'success' | 'error'): void {
    if (closed) return;
    status.className = `server-feedback ${kind}`;
    status.textContent = message;
  }

  copyBtn.addEventListener('click', () => {
    const value = linkInput.value.trim();
    if (!value) return;
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(value).then(
        () => showToast('Link kopiert.', 'success'),
        () => {
          linkInput.focus();
          linkInput.select();
          showToast('Link markiert – bitte manuell kopieren.', 'info');
        },
      );
    } else {
      linkInput.focus();
      linkInput.select();
      showToast('Link markiert – bitte manuell kopieren.', 'info');
    }
  });

  downloadZipBtn.addEventListener('click', () => {
    if (!shareBlob) return;
    downloadBlob(shareBlob, shareZipDownloadName(initialProject));
  });

  downloadAccessBtn.addEventListener('click', () => {
    if (!accessText) return;
    downloadBlob(
      new Blob([accessText], { type: 'application/json' }),
      accessFileName(initialProjectId),
    );
  });

  void prepare();

  async function prepare(): Promise<void> {
    let syncError: string | null = null;
    let synced = false;
    setStatus('Projekt wird mit dem Server abgeglichen …', 'info');

    try {
      const result = await syncNow();
      synced = result.ok;
      syncError = result.error;
    } catch (err) {
      syncError = errorText(err);
    }
    if (closed) return;

    const current = state.project;
    if (!current || current.id !== initialProjectId) {
      setStatus('Das Projekt wurde zwischenzeitlich gewechselt.', 'error');
      return;
    }
    if (!current.server || !isLinkedServer(current.server)) {
      setStatus('Die Server-Verknüpfung ist nicht mehr vorhanden.', 'error');
      return;
    }
    const token = readServerToken(current.server);
    if (!token) {
      setStatus('Der API-Token fehlt auf diesem Gerät.', 'error');
      return;
    }

    const access = createServerAccess(current, current.server, token);
    if (!access) {
      setStatus('Die Server-Zugangsdaten sind unvollständig.', 'error');
      return;
    }

    setStatus('Freigabe-ZIP wird erstellt …', 'info');
    /* Kurz zeichnen lassen, bevor das ZIP-Packen den Main-Thread belegt. */
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (closed) return;

    const bytes = buildShareZip(current, access);
    const blob = new Blob(
      [
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer,
      ],
      { type: 'application/zip' },
    );
    shareBlob = blob;
    accessText = JSON.stringify(access, null, 2);
    downloadZipBtn.disabled = false;
    downloadAccessBtn.disabled = false;

    if (!synced) {
      setStatus(
        `Der Serverabgleich ist fehlgeschlagen: ${syncError ?? 'Unbekannter Fehler.'} Die Freigabe-ZIP kann lokal gespeichert und manuell weitergegeben werden.`,
        'error',
      );
      return;
    }

    const path = joinServerPath(current.server.path, serverShareName(current.id));
    try {
      setStatus('Freigabe wird auf den Server geladen …', 'info');
      await uploadFileAtPath(current.server, token, path, blob);
      if (closed) return;

      setStatus('Freigabe-Link wird erstellt …', 'info');
      const share = await createShareLink(current.server, token, path);
      if (closed) return;

      linkInput.value = share.link;
      linkRow.hidden = false;
      copyBtn.disabled = false;
      setStatus(
        'Freigabe ist bereit. Link weitergeben – die Zugangsdatei ist in der ZIP enthalten.',
        'success',
      );
    } catch (err) {
      if (closed) return;
      setStatus(
        `Die Freigabe konnte nicht als Link bereitgestellt werden: ${errorText(err)} Die ZIP und die Zugangsdatei stehen unten zum Herunterladen bereit.`,
        'error',
      );
    }
  }
}

