/* ── Ladeanzeige: Fortschrittsbalken für lange Vorgänge (Laden, Exporte) ── */

import { el } from './dom';
import { progressPercent } from '../core/progress';
import type { ProgressReporter } from '../core/progress';

export interface ProgressHandle {
  /** Aktualisiert den Text und – sofern bekannt – den Anteil (0…1). */
  update(update: { label?: string; ratio?: number }): void;
  /** Beendet die Anzeige (mit kurzer Ausblendung). */
  close(): void;
}

/** Anzeige erst nach kurzer Verzögerung – schnelle Vorgänge blitzen nicht auf. */
const SHOW_DELAY_MS = 200;
const FADE_MS = 180;

function appendToBody(node: HTMLElement): void {
  document.body.appendChild(node);
}

/** Wartet, bis die Anzeige tatsächlich gezeichnet wurde (vor blockierender Arbeit). */
function nextPaint(): Promise<void> {
  if (typeof requestAnimationFrame !== 'function') {
    /* Ohne Animation-Frames genügt ein Task */
    return new Promise((resolve) => setTimeout(resolve, 0));
  }
  return new Promise((resolve) => {
    let settled = false;
    const done = (): void => {
      if (settled) return;
      settled = true;
      resolve();
    };
    /* Fallback: zeichnet das Fenster nicht (Tab im Hintergrund), später starten */
    setTimeout(done, 120);
    requestAnimationFrame(() => requestAnimationFrame(done));
  });
}

/**
 * Zeigt eine Ladeanzeige mit Balken. `delayMs = 0` blendet sofort ein – nötig
 * für blockierende Vorgänge, bei denen kein Timer mehr dazwischen passt.
 */
export function showProgress(label: string, delayMs = SHOW_DELAY_MS): ProgressHandle {
  const labelEl = el('p', { class: 'progress-label' }, [label]);
  const detailEl = el('p', { class: 'progress-detail' }, ['Bitte warten …']);
  const fill = el('div', { class: 'progress-fill' });
  const track = el('div', { class: 'progress-track indeterminate' }, [fill]);
  const card = el(
    'div',
    { class: 'progress-card', role: 'status', 'aria-live': 'polite' },
    [labelEl, track, detailEl],
  );
  const overlay = el('div', { class: 'progress-overlay', 'aria-busy': 'true' }, [card]);

  let closed = false;
  const showTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
    if (closed) return;
    appendToBody(overlay);
    requestAnimationFrame(() => overlay.classList.add('open'));
  }, delayMs);

  function close(): void {
    if (closed) return;
    closed = true;
    if (showTimer) clearTimeout(showTimer);
    /* Nie eingeblendet → nichts aufzuräumen */
    if (!overlay.isConnected) return;
    overlay.classList.remove('open');
    setTimeout(() => overlay.remove(), FADE_MS);
  }

  function update(update: { label?: string; ratio?: number }): void {
    if (closed) return;
    if (update.label) labelEl.textContent = update.label;
    if (update.ratio === undefined) {
      track.classList.add('indeterminate');
      fill.style.width = '';
      detailEl.textContent = 'Bitte warten …';
      return;
    }
    const percent = progressPercent(update.ratio);
    track.classList.remove('indeterminate');
    fill.style.width = `${percent}%`;
    detailEl.textContent = `${percent} %`;
  }

  return { update, close };
}

/**
 * Führt eine lange Aktion mit Ladeanzeige aus. Die Anzeige wird garantiert
 * wieder geschlossen – auch wenn die Aktion einen Fehler wirft.
 *
 * `immediate: true` blendet sofort ein und wartet auf das Zeichnen: nötig für
 * Aktionen, die direkt danach den Main-Thread blockieren (z. B. ZIP-Packen).
 */
export async function withProgress<T>(
  label: string,
  task: (report: ProgressReporter) => Promise<T>,
  opts: { immediate?: boolean } = {},
): Promise<T> {
  const immediate = opts.immediate ?? false;
  const handle = showProgress(label, immediate ? 0 : SHOW_DELAY_MS);
  if (immediate) await nextPaint();
  try {
    return await task((update) => handle.update(update));
  } finally {
    handle.close();
  }
}
