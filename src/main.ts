/* ── Einstiegspunkt: PWA Service Worker registrieren → App starten ── */

import { registerSW } from 'virtual:pwa-register';
import { initApp } from './app';

import './styles/base.css';
import './styles/components.css';
import './styles/layout.css';

try {
  registerSW({ immediate: true });
} catch {
  // SW-Registrierung fehlgeschlagen – App läuft trotzdem.
}

void initApp();