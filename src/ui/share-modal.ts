/* ── Projekt teilen: Freigabe-ZIP mit optionalem Passwort ── */

import { el, downloadBlob } from './dom';
import { openModal } from './modal';
import { showToast } from './toast';
import { state } from './app-state';
import { readServerToken } from '../core/seafile';
import { isLinkedServer } from '../domain/server';
import {
  SHARE_PASSWORD_MIN_LENGTH,
  accessFileName,
  buildShareZip,
  createServerAccess,
  shareZipDownloadName,
} from '../io/share';

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

  const initialProjectId = project.id;

  let closed = false;
  let building = false;
  let accessText = '';

  const status = el('p', { class: 'server-feedback info' }, [
    'Freigabe wird vorbereitet …',
  ]);

  const passwordInput = el('input', {
    type: 'password',
    class: 'input',
    placeholder: `Passwort (mind. ${SHARE_PASSWORD_MIN_LENGTH} Zeichen)`,
    autocomplete: 'new-password',
    spellcheck: 'false',
  }) as HTMLInputElement;

  const downloadZipBtn = el('button', {
    class: 'btn btn-primary',
    type: 'button',
    disabled: 'disabled',
  }, ['Freigabe-ZIP speichern']) as HTMLButtonElement;

  const downloadAccessBtn = el('button', {
    class: 'btn btn-secondary',
    type: 'button',
    disabled: 'disabled',
  }, ['Zugangsdatei (ohne Passwort) speichern']) as HTMLButtonElement;

  const content = el('div', { class: 'server-form' }, [
    el('p', { class: 'export-hint' }, [
      'Die Freigabe enthält ausschließlich die Server-Zugangsdaten – keine Projektdateien. Beim Öffnen lädt die App den Projektstand automatisch vom Server.',
    ]),
    status,
    el('label', { class: 'field-label' }, ['Passwort (optional)']),
    passwordInput,
    el('p', { class: 'field-hint' }, [
      'Leer lassen für eine unverschlüsselte ZIP. Mit Passwort werden die Zugangsdaten in der ZIP verschlüsselt; das Passwort wird nicht gespeichert und kann nicht wiederhergestellt werden.',
    ]),
    el('div', { class: 'share-actions' }, [downloadZipBtn, downloadAccessBtn]),
    el('p', { class: 'field-hint share-warning' }, [
      'Achtung: Die ZIP enthält den API-Token. Ohne Passwort liegt er im Klartext. Nur an berechtigte Personen weitergeben und das Passwort getrennt übermitteln.',
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

  function updateAccessButton(): void {
    downloadAccessBtn.disabled =
      building || !accessText || passwordInput.value.length > 0;
  }

  passwordInput.addEventListener('input', updateAccessButton);

  downloadAccessBtn.addEventListener('click', () => {
    if (!accessText || passwordInput.value) return;
    downloadBlob(
      new Blob([accessText], { type: 'application/json' }),
      accessFileName(initialProjectId),
    );
  });

  downloadZipBtn.addEventListener('click', () => {
    void downloadZip();
  });

  prepare();

  function prepare(): void {
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

    accessText = JSON.stringify(access, null, 2);
    downloadZipBtn.disabled = false;
    updateAccessButton();
    setStatus(
      'Bereit. Passwort optional setzen und die Freigabe-ZIP speichern.',
      'info',
    );
  }

  async function downloadZip(): Promise<void> {
    if (building) return;

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

    const password = passwordInput.value;
    if (password && password.length < SHARE_PASSWORD_MIN_LENGTH) {
      setStatus(
        `Das Passwort muss mindestens ${SHARE_PASSWORD_MIN_LENGTH} Zeichen haben.`,
        'error',
      );
      passwordInput.focus();
      return;
    }

    building = true;
    downloadZipBtn.disabled = true;
    updateAccessButton();
    setStatus(
      password
        ? 'Verschlüsselte Freigabe-ZIP wird erstellt …'
        : 'Freigabe-ZIP wird erstellt …',
      'info',
    );

    try {
      const bytes = await buildShareZip(
        current.id,
        access,
        password || undefined,
      );
      if (closed) return;

      const blob = new Blob(
        [
          bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ) as ArrayBuffer,
        ],
        { type: 'application/zip' },
      );
      downloadBlob(blob, shareZipDownloadName(current));
      setStatus(
        password
          ? 'Verschlüsselte Freigabe-ZIP gespeichert. Passwort getrennt weitergeben.'
          : 'Freigabe-ZIP gespeichert. Achtung: ohne Passwort im Klartext.',
        'success',
      );
    } catch (err) {
      if (closed) return;
      setStatus(
        `Die Freigabe-ZIP konnte nicht erstellt werden: ${
          err instanceof Error ? err.message : 'Unbekannter Fehler.'
        }`,
        'error',
      );
    } finally {
      building = false;
      if (!closed) {
        downloadZipBtn.disabled = false;
        updateAccessButton();
      }
    }
  }
}
