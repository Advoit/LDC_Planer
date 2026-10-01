/* ── Einwilligung / Cookie-Hinweis ──
 *
 * Der Planer nutzt ausschließlich unbedingt erforderliche lokale Speicherung
 * (IndexedDB, localStorage, Service-Worker-Cache). Es gibt keine Cookies von
 * Drittanbietern, kein Tracking und keine Übertragung an einen Server. Nach
 * § 25 Abs. 2 TDDDG ist für rein notwendige Speicherung keine Einwilligung
 * nötig – der Hinweis informiert darüber und hält die Entscheidung nachweisbar
 * fest (Art. 7 DSGVO).
 *
 * Sobald optionale Kategorien (z. B. Statistik) hinzukommen, genügt hier ein
 * weiterer Eintrag ohne `required` – der Banner zeigt dann automatisch
 * Zustimmungs-Schalter sowie „Alle akzeptieren“/„Nur notwendige“.
 */

import { getPreference, setPreference } from './preferences';

export interface ConsentCategory {
  id: string;
  label: string;
  description: string;
  /** Unbedingt erforderlich → nicht abwählbar. */
  required: boolean;
}

export const CONSENT_CATEGORIES: readonly ConsentCategory[] = [
  {
    id: 'necessary',
    label: 'Unbedingt erforderlich',
    required: true,
    description:
      'Projekte, Bilder und Dokumente liegen ausschließlich auf diesem Gerät (IndexedDB). Einstellungen wie Tag-/Nachtmodus, Ansicht und Filter werden im localStorage gespeichert. Ein Service Worker legt die App für die Offline-Nutzung ab.',
  },
];

export const OPTIONAL_CATEGORIES: readonly ConsentCategory[] =
  CONSENT_CATEGORIES.filter((category) => !category.required);

/** Bei Änderungen an Kategorien/Zwecken erhöhen → Hinweis erscheint erneut. */
export const CONSENT_VERSION = 1;

const KEY = 'consent';

export interface ConsentState {
  version: number;
  choices: Record<string, boolean>;
  /** Zeitpunkt der Entscheidung (ISO) – dient als Nachweis. */
  decidedAt: string;
}

/** Gespeicherte Entscheidung oder null, wenn (noch) keine vorliegt. */
export function getConsent(): ConsentState | null {
  const stored = getPreference<ConsentState | null>(KEY, null);
  if (!stored || stored.version !== CONSENT_VERSION) return null;
  return stored;
}

export function saveConsent(choices: Record<string, boolean>): ConsentState {
  const state: ConsentState = {
    version: CONSENT_VERSION,
    choices,
    decidedAt: new Date().toISOString(),
  };
  setPreference(KEY, state);
  return state;
}
