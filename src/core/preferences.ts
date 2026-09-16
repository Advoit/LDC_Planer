/* ── Lokale Einstellungen („Letzte Wahl bleibt erhalten“) ── */

const PREFIX = 'ldc.';

/** Liest einen gespeicherten Wert (JSON) oder den Fallback. */
export function getPreference<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Speichert einen Wert (JSON). Fehler (z. B. voller Speicher) werden ignoriert. */
export function setPreference<T>(key: string, value: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* Speicher nicht verfügbar – still ignorieren */
  }
}
