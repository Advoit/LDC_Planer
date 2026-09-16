/* ── IndexedDB-Primitive (Key-Value) inkl. Speicherplatz-Helfern ── */

const DB_NAME = 'ldc-projekt-planer';
const DB_VERSION = 2;
const STORE_NAME = 'app';

/** Wird geworfen, wenn der lokale Speicher voll ist. */
export class StorageQuotaError extends Error {
  constructor(message = 'Der lokale Speicher ist voll.') {
    super(message);
    this.name = 'StorageQuotaError';
  }
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function isQuotaError(err: unknown): boolean {
  if (!err) return false;
  const name = (err as { name?: string }).name ?? '';
  if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') {
    return true;
  }
  const message = (err as { message?: string }).message ?? '';
  return /quota|speicher voll/i.test(message);
}

export async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openDb();
  return new Promise<T | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve((req.result ?? null) as T | null);
    req.onerror = () => reject(req.error);
  });
}

/** Schreibt einen Wert; bei vollem Speicher wird `StorageQuotaError` geworfen. */
export async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('Schreiben fehlgeschlagen.'));
    tx.onerror = () => reject(tx.error ?? new Error('Schreiben fehlgeschlagen.'));
  });
}

export async function idbDelete(key: string): Promise<void> {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('Löschen fehlgeschlagen.'));
    tx.onerror = () => reject(tx.error ?? new Error('Löschen fehlgeschlagen.'));
  });
}

/* ── Speicherplatz ── */

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    if (!navigator.storage?.estimate) return null;
    const est = await navigator.storage.estimate();
    if (typeof est.usage !== 'number' || typeof est.quota !== 'number') return null;
    return { usage: est.usage, quota: est.quota };
  } catch {
    return null;
  }
}

/**
 * Bittet den Browser um dauerhaften Speicher („persistent“), damit die Daten
 * bei Platznot nicht verworfen werden. Gibt den Status zurück.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist || !navigator.storage.persisted) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/** Ungefähre Größe eines Werts in Byte (für Platzprüfungen). */
export function approximateSize(value: unknown): number {
  try {
    const json = JSON.stringify(value);
    return json ? json.length : 0;
  } catch {
    return 0;
  }
}

/**
 * Prüft, ob noch genug Platz für `neededBytes` ist (mit Sicherheitsreserve).
 * Ohne Schätzung (z. B. ältere Browser) gilt „genug Platz“.
 */
export async function hasSpaceFor(neededBytes: number): Promise<boolean> {
  const est = await storageEstimate();
  if (!est) return true;
  return est.quota - est.usage > neededBytes * 1.5;
}

export { isQuotaError };
