/* ── Hell-/Dunkelmodus: Wahl bleibt im localStorage erhalten ── */

import { getPreference, setPreference } from './preferences';

export type ThemeChoice = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const KEY = 'theme';

/* Passt zur Kopfleiste (--card-bg) – färbt die Statusleiste auf Mobilgeräten. */
const THEME_COLOR: Record<ResolvedTheme, string> = {
  light: '#FFFFFF',
  dark: '#2C2C2E',
};

/** Gespeicherte Wahl – „system“ ist der Standard (folgt der Geräteeinstellung). */
export function getThemeChoice(): ThemeChoice {
  const value = getPreference<ThemeChoice>(KEY, 'system');
  return value === 'light' || value === 'dark' ? value : 'system';
}

function systemTheme(): ResolvedTheme {
  return typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

/** Tatsächlich wirksames Theme (löst „system“ auf). */
export function resolvedTheme(choice: ThemeChoice = getThemeChoice()): ResolvedTheme {
  return choice === 'system' ? systemTheme() : choice;
}

/** Setzt das Theme am <html>-Element und aktualisiert die Statusleisten-Farbe. */
export function applyTheme(): void {
  const theme = resolvedTheme();
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLOR[theme]);
}

export function setThemeChoice(choice: ThemeChoice): void {
  setPreference(KEY, choice);
  applyTheme();
}

/** Wechselt zwischen Tag und Nacht (verlässt dabei den System-Modus). */
export function toggleTheme(): void {
  setThemeChoice(resolvedTheme() === 'dark' ? 'light' : 'dark');
}

/** Beim Start aufrufen: Theme anwenden und Systemwechsel verfolgen. */
export function initTheme(): void {
  applyTheme();
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return;
  }
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener?.('change', () => {
    if (getThemeChoice() === 'system') applyTheme();
  });
}
