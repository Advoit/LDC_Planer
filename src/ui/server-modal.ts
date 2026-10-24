/* ── Dialog „Server“: Seafile-Link, Test und Verknüpfen ── */

import { el } from './dom';
import { openModal } from './modal';
import { showToast } from './toast';
import { persist, render, state } from './app-state';
import {
  connectProject,
  getSyncState,
  noteServerDraft,
  pollOnce,
  subscribeSync,
  syncNow,
  testServerConnection,
} from './server-sync';
import {
  isLinkedServer,
  parseSeafileLink,
  serverLink,
} from '../domain/server';
import { touchProject } from '../domain/project';
import { readServerToken, saveServerToken } from '../core/seafile';
import type { ServerTestStep } from './server-sync';
import type { SeafileConnection } from '../domain/server';
import type { ProjectServer } from '../domain/types';

type FeedbackKind = 'info' | 'success' | 'error';

export function openServerModal(): void {
  const project = state.project;
  if (!project) return;

  const existing = project.server;
  const linkInput = el('input', {
    type: 'url',
    class: 'input',
    placeholder: 'https://server/lib/<Bibliothek>/<Ordner>',
    value: existing ? serverLink(existing) : '',
    spellcheck: 'false',
    autocomplete: 'off',
    inputmode: 'url',
  }) as HTMLInputElement;

  const tokenInput = el('input', {
    type: 'password',
    class: 'input',
    placeholder: 'API-Token',
    value: existing ? readServerToken(existing) : '',
    autocomplete: 'off',
  }) as HTMLInputElement;

  const statusText = el('p', { class: 'field-hint server-status-line' }, [
    getSyncState().detail,
  ]);
  const feedback = el('div', { class: 'server-feedback' });

  const addBtn = el('button', { class: 'btn btn-secondary', type: 'button' }, [
    'Hinzufügen',
  ]) as HTMLButtonElement;
  const testBtn = el('button', { class: 'btn btn-secondary', type: 'button' }, [
    'Testen',
  ]) as HTMLButtonElement;
  const connectBtn = el('button', { class: 'btn btn-primary', type: 'button' }, [
    'Verknüpfen',
  ]) as HTMLButtonElement;

  const linked = existing ? isLinkedServer(existing) : false;
  const syncBtn = linked
    ? (el('button', { class: 'btn btn-secondary', type: 'button' }, [
        'Jetzt synchronisieren',
      ]) as HTMLButtonElement)
    : null;

  let testPassed = false;
  let running = false;
  let handle: ReturnType<typeof openModal>;

  function setFeedback(message: string, kind: FeedbackKind): void {
    feedback.className = `server-feedback ${kind}`;
    feedback.textContent = message;
  }

  function renderSteps(steps: ServerTestStep[]): void {
    feedback.className = 'server-feedback';
    feedback.replaceChildren();
    const list = el('ul', { class: 'server-check-list' });
    for (const step of steps) {
      list.appendChild(
        el('li', { class: `server-step ${step.ok ? 'ok' : 'fail'}` }, [
          el('span', { class: 'server-step-mark' }, [step.ok ? '✓' : '✕']),
          el('span', {}, [step.label]),
        ]),
      );
    }
    feedback.appendChild(list);
  }

  function refreshButtons(): void {
    addBtn.disabled = running;
    testBtn.disabled = running;
    testBtn.textContent = running ? 'Teste …' : 'Testen';
    connectBtn.disabled = running || !testPassed;
    if (syncBtn) syncBtn.disabled = running;
  }

  function markChanged(): void {
    testPassed = false;
    linkInput.classList.remove('input-error');
    tokenInput.classList.remove('input-error');
    feedback.className = 'server-feedback';
    feedback.textContent = '';
    refreshButtons();
  }

  linkInput.addEventListener('input', markChanged);
  tokenInput.addEventListener('input', markChanged);

  /** Speichert Link und Token lokal (noch ohne Verknüpfung). */
  async function saveDraft(): Promise<{ conn: SeafileConnection; token: string } | null> {
    const parsed = parseSeafileLink(linkInput.value);
    if (!parsed.connection) {
      linkInput.classList.add('input-error');
      setFeedback(parsed.error ?? 'Der Seafile-Link ist ungültig.', 'error');
      return null;
    }
    linkInput.classList.remove('input-error');

    const token = tokenInput.value.trim();
    if (!token) {
      tokenInput.classList.add('input-error');
      setFeedback('Bitte den API-Token der Seafile-Bibliothek einfügen.', 'error');
      tokenInput.focus();
      return null;
    }
    tokenInput.classList.remove('input-error');

    const current = state.project;
    if (!current) return null;

    const previous = current.server;
    const linkedAt =
      previous &&
      previous.url === parsed.connection.url &&
      previous.repoId === parsed.connection.repoId
        ? previous.linkedAt
        : '';

    const server: ProjectServer = {
      ...parsed.connection,
      linkedAt,
    };

    saveServerToken(parsed.connection, token);
    state.project = touchProject({ ...current, server });
    await persist();
    render();
    noteServerDraft();
    if (linkedAt) void pollOnce();
    return { conn: parsed.connection, token };
  }

  async function doAdd(): Promise<void> {
    const saved = await saveDraft();
    if (!saved) return;
    setFeedback('Server hinzugefügt. Bitte jetzt „Testen“ antippen.', 'success');
    testBtn.focus();
  }

  async function doTest(): Promise<void> {
    if (running) return;
    const saved = await saveDraft();
    if (!saved) return;

    running = true;
    refreshButtons();
    feedback.className = 'server-feedback info';
    feedback.textContent = 'Test läuft: schreiben, lesen, löschen …';

    const current = state.project;
    const result = await testServerConnection(
      saved.conn,
      saved.token,
      current?.id ?? '',
    );

    running = false;
    testPassed = result.ok;
    refreshButtons();
    renderSteps(result.steps);

    if (result.ok) {
      feedback.classList.add('success');
      feedback.prepend(
        el('p', {}, [
          'Alles geklappt: Testdatei geschrieben, gelesen und wieder gelöscht.',
        ]),
      );
      statusText.textContent = 'Server erreichbar – jetzt verknüpfen.';
      connectBtn.focus();
    } else {
      feedback.classList.add('error');
      feedback.prepend(
        el('p', {}, [
          `Test fehlgeschlagen: ${result.error ?? 'Unbekannter Fehler.'}`,
        ]),
      );
    }
  }

  async function doConnect(): Promise<void> {
    if (running) return;
    if (!testPassed) {
      setFeedback('Bitte zuerst den Test erfolgreich abschließen.', 'error');
      return;
    }
    const saved = await saveDraft();
    if (!saved) return;

    running = true;
    refreshButtons();
    const result = await connectProject(saved.conn, saved.token);
    running = false;
    refreshButtons();

    if (result.ok) {
      setFeedback(
        'Projekt ist verknüpft und wurde auf den Server hochgeladen.',
        'success',
      );
      showToast('Projekt verknüpft und hochgeladen.', 'success');
      handle.close();
    } else {
      setFeedback(
        `Verknüpfen fehlgeschlagen: ${result.error ?? 'Unbekannter Fehler.'}`,
        'error',
      );
    }
  }

  async function doSync(): Promise<void> {
    if (running) return;
    running = true;
    refreshButtons();
    const result = await syncNow();
    running = false;
    refreshButtons();
    if (result.ok) {
      setFeedback('Abgleich abgeschlossen.', 'success');
    } else {
      setFeedback(result.error ?? 'Abgleich fehlgeschlagen.', 'error');
    }
  }

  addBtn.addEventListener('click', () => void doAdd());
  testBtn.addEventListener('click', () => void doTest());
  connectBtn.addEventListener('click', () => void doConnect());
  syncBtn?.addEventListener('click', () => void doSync());

  const actions = el('div', { class: 'server-actions' }, [addBtn, testBtn, connectBtn]);
  if (syncBtn) actions.appendChild(syncBtn);

  const content = el('div', { class: 'server-form' }, [
    el('p', { class: 'export-hint' }, [
      'Fügen Sie den Link der Seafile-Bibliothek oder eines Ordners darin ein und tragen Sie den API-Token ein. Beides bleibt auf diesem Gerät gespeichert – der Token wird nicht in die Projekt-ZIP geschrieben.',
    ]),
    el('label', { class: 'field-label' }, ['Seafile-Link']),
    linkInput,
    el('p', { class: 'field-hint' }, [
      'Form: https://server/lib/<Bibliothek>/<Ordner>. Freigabe- und Upload-Links reichen für den Abgleich nicht aus.',
    ]),
    el('label', { class: 'field-label' }, ['API-Token']),
    tokenInput,
    el('p', { class: 'field-hint' }, [
      'Den Token finden Sie in Seafile in der Bibliothek unter „Erweitert → API-Token“ (oder erhalten ihn von der Administration). Der Token bleibt lokal – jede Person trägt ihn auf ihrem Gerät einmalig ein.',
    ]),
    el('p', { class: 'field-hint' }, [
      'Der Seafile-Server muss Anfragen dieser App erlauben (CORS für /api2, /api/v2.1, /upload-api und /seafhttp).',
    ]),
    statusText,
    feedback,
    actions,
  ]);

  if (linked) {
    setFeedback(
      'Bereits verknüpft. „Testen“ prüft die Verbindung, „Verknüpfen“ lädt das Projekt erneut hoch.',
      'info',
    );
  }

  handle = openModal({
    title: 'Server',
    content,
    wide: true,
    actions: [
      {
        label: 'Schließen',
        kind: 'secondary',
        onClick: () => handle.close(),
      },
    ],
    onClose: () => unsubscribe(),
  });

  const unsubscribe = subscribeSync(() => {
    statusText.textContent = getSyncState().detail;
  });

  refreshButtons();
  if (linked) linkInput.focus();
  else tokenInput.focus();
}
