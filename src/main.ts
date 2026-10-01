/* ── Einstiegspunkt: PWA Service Worker registrieren → App starten ── */

import { registerSW } from 'virtual:pwa-register';
import { initApp } from './app';
import { initTheme } from './core/theme';

import './styles/base.css';
import './styles/components.css';
import './styles/layout.css';

/* Theme sofort anwenden und Systemwechsel verfolgen (Tag-/Nachtmodus). */
initTheme();

try {
  registerSW({ immediate: true });
} catch {
  // SW-Registrierung fehlgeschlagen – App läuft trotzdem.
}

void initApp();