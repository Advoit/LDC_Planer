/* ── Dateinamen: einheitliche, sichere Namen für alle Exporte ── */

/** Bereinigt einen Text für die Verwendung in Dateinamen (z. B. Projektname). */
export function safeFileNamePart(value: string): string {
  const cleaned = value
    .replace(/[^a-zA-Z0-9äöüÄÖÜß _-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  return cleaned || 'Projekt';
}

/** Basisname aller Exporte: LDC-<Projektname>-<Projekt-ID>. */
export function exportBaseName(name: string, id: string): string {
  return `LDC-${safeFileNamePart(name)}-${id}`;
}

/** Vollständiger Dateiname eines Exports (z. B. „…-Materialliste.pdf“). */
export function exportFileName(
  name: string,
  id: string,
  suffix: string,
  extension: string,
): string {
  return `${exportBaseName(name, id)}${suffix}.${extension}`;
}
