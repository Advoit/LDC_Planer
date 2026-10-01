/* ── Cookie-/Speicher-Hinweis ──
 * Informiert über die lokal gespeicherten Daten. Sind (künftig) optionale
 * Kategorien vorhanden, erscheinen Schalter und „Alle akzeptieren“ /
 * „Nur notwendige“ mit gleicher Gewichtung; ansonsten genügt ein „Verstanden“.
 */

import { el, icon } from './dom';
import {
  CONSENT_CATEGORIES,
  OPTIONAL_CATEGORIES,
  getConsent,
  saveConsent,
} from '../core/consent';

/** Zeigt den Hinweis nur, solange keine aktuelle Entscheidung gespeichert ist. */
export function maybeShowConsentNotice(): void {
  if (getConsent()) return;
  showConsentNotice();
}

/** Öffnet den Hinweis (auch zum späteren Ändern über „Info → Datenschutz“). */
export function showConsentNotice(): void {
  document.querySelector('.consent-banner')?.remove();

  const hasOptional = OPTIONAL_CATEGORIES.length > 0;
  const choices: Record<string, boolean> = {};
  for (const category of CONSENT_CATEGORIES) {
    choices[category.id] = category.required;
  }

  /* ── Kategorien ── */
  const categories = el('div', { class: 'consent-categories' });
  for (const category of CONSENT_CATEGORIES) {
    const input = el('input', {
      type: 'checkbox',
      name: `consent-${category.id}`,
    }) as HTMLInputElement;
    input.checked = category.required;
    input.disabled = category.required;
    if (!category.required) {
      input.addEventListener('change', () => {
        choices[category.id] = input.checked;
      });
    }
    categories.appendChild(
      el('label', { class: 'consent-cat' }, [
        input,
        el('span', { class: 'consent-cat-text' }, [
          el('span', { class: 'consent-cat-label' }, [
            category.label,
            category.required
              ? el('span', { class: 'consent-cat-req' }, ['Immer aktiv'])
              : '',
          ]),
          el('span', { class: 'consent-cat-desc' }, [category.description]),
        ]),
      ]),
    );
  }

  /* ── Aktionen ── */
  const actions = el('div', { class: 'consent-actions' });
  const banner = el(
    'div',
    {
      class: 'consent-banner',
      role: 'dialog',
      'aria-modal': 'false',
      'aria-label': 'Hinweis zu Cookies und lokaler Speicherung',
    },
    [
      el('div', { class: 'consent-head' }, [
        el('span', { class: 'consent-icon' }, [icon('cookie')]),
        el('h2', { class: 'consent-title' }, ['Cookies & lokale Speicherung']),
      ]),
      el('p', { class: 'consent-intro' }, [
        'Dieser Planer arbeitet vollständig offline. Es werden keine Cookies von Drittanbietern gesetzt, Sie werden nicht verfolgt und es werden keine Daten an einen Server übertragen. Gespeichert wird nur, was die App zum Funktionieren braucht – lokal auf Ihrem Gerät.',
      ]),
      categories,
      actions,
      el('p', { class: 'consent-foot' }, [
        'Jederzeit änderbar über „Datenschutz & Cookies“ im Menü „Info“.',
      ]),
    ],
  );

  function finish(): void {
    saveConsent(choices);
    banner.classList.remove('open');
    setTimeout(() => banner.remove(), 250);
  }

  if (hasOptional) {
    /* Gleichwertige Wahlmöglichkeit (keine Vorauswahl, kein Dark Pattern) */
    const onlyNecessary = actionButton('Nur notwendige', 'secondary', () => {
      for (const category of OPTIONAL_CATEGORIES) choices[category.id] = false;
      finish();
    });
    const acceptAll = actionButton('Alle akzeptieren', 'primary', () => {
      for (const category of OPTIONAL_CATEGORIES) choices[category.id] = true;
      finish();
    });
    actions.appendChild(onlyNecessary);
    actions.appendChild(acceptAll);
  } else {
    actions.appendChild(actionButton('Verstanden', 'primary', finish));
  }

  document.body.appendChild(banner);
  requestAnimationFrame(() => banner.classList.add('open'));
}

function actionButton(
  label: string,
  kind: 'primary' | 'secondary',
  onClick: () => void,
): HTMLButtonElement {
  const button = el('button', {
    class: `btn btn-${kind} btn-sm`,
    type: 'button',
  }, [label]) as HTMLButtonElement;
  button.addEventListener('click', onClick);
  return button;
}
