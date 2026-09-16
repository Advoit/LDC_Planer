/* ── Fortschritt für lange Vorgänge (Projekt laden, Exporte) ── */

/** Eine Fortschrittsmeldung: Text und – sofern bekannt – Anteil (0…1). */
export interface ProgressUpdate {
  label: string;
  /** 0…1; ohne Angabe ist der Fortschritt unbekannt (wandernder Balken). */
  ratio?: number;
}

export type ProgressReporter = (update: ProgressUpdate) => void;

/** Begrenzt einen Anteil auf 0…1 (fängt NaN/Unendlich ab). */
export function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Anteil als Prozentzahl für die Anzeige (gerundet, 0…100). */
export function progressPercent(ratio: number): number {
  return Math.round(clampRatio(ratio) * 100);
}

/** Meldet einen Fortschritt, sofern ein Empfänger registriert ist. */
export function reportProgress(
  onProgress: ProgressReporter | undefined,
  label: string,
  done?: number,
  total?: number,
): void {
  if (!onProgress) return;
  const ratio =
    done !== undefined && total !== undefined && total > 0
      ? clampRatio(done / total)
      : undefined;
  onProgress({ label, ratio });
}

/**
 * Erzeugt eine Funktion, die den Main-Thread freigibt, damit die Anzeige
 * während langer Schleifen sichtbar weiterläuft. Sie gibt höchstens alle
 * `intervalMs` (Standard 32 ms ≈ 30 Bilder/s) tatsächlich frei – so kostet
 * das Yielding über eine Schleife hinweg kaum Zeit.
 */
export function createUiYielder(intervalMs = 32): () => Promise<void> {
  let last = 0;
  return () => {
    const now = Date.now();
    if (now - last < intervalMs) return Promise.resolve();
    last = now;
    return new Promise((resolve) => setTimeout(resolve, 0));
  };
}
