/* ── Umschalter für Tag-/Nachtmodus (oben rechts in der Kopfleiste) ── */

import { el, icon } from './dom';
import { onThemeChange, resolvedTheme, toggleTheme } from '../core/theme';

let toggleEl: HTMLButtonElement | null = null;

function renderToggle(): void {
  if (!toggleEl) return;
  const dark = resolvedTheme() === 'dark';
  const label = dark ? 'Zum Tagmodus wechseln' : 'Zum Nachtmodus wechseln';
  toggleEl.replaceChildren(icon(dark ? 'sun' : 'moon'));
  toggleEl.title = label;
  toggleEl.setAttribute('aria-label', label);
}

/**
 * Baut den Umschalter. Die Schaltfläche wird nur einmal erzeugt und bei jedem
 * Neutzeichnen der App wiederverwendet – so sammeln sich keine Beobachter an.
 */
export function buildThemeToggle(): HTMLElement {
  if (!toggleEl) {
    toggleEl = el('button', {
      class: 'icon-btn theme-toggle',
      type: 'button',
    }) as HTMLButtonElement;
    toggleEl.addEventListener('click', () => toggleTheme());
    onThemeChange(renderToggle);
    renderToggle();
  }
  return toggleEl;
}
