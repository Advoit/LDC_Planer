import { describe, expect, it } from 'vitest';
import {
  LOCK_TTL_MS,
  countActiveLocks,
  emptyLockFile,
  isLinkedServer,
  isLockActive,
  joinServerPath,
  normalizeLockFile,
  otherLockHolder,
  parseSeafileLink,
  projectArchiveName,
  projectLockFileName,
  pruneLocks,
  safeNamePart,
  serverDirPath,
  serverLink,
} from './server';
import type { TaskLockEntry } from './server';

const NOW = Date.parse('2026-10-24T12:00:00.000Z');
const iso = (offsetMs: number): string => new Date(NOW + offsetMs).toISOString();

function entry(overrides: Partial<TaskLockEntry> = {}): TaskLockEntry {
  return {
    user: 'Anna',
    deviceId: 'device-a',
    since: iso(-60_000),
    heartbeat: iso(-10_000),
    ...overrides,
  };
}

describe('parseSeafileLink', () => {
  it('liest Server, Bibliothek und Ordner aus einem Bibliothekslink', () => {
    const result = parseSeafileLink('https://cloud.example.com/lib/abc-123/Baustellen/Haus%201/');
    expect(result.error).toBeNull();
    expect(result.connection).toEqual({
      url: 'https://cloud.example.com',
      repoId: 'abc-123',
      path: '/Baustellen/Haus 1',
    });
  });

  it('behält einen Unterpfad der Seafile-Instanz bei', () => {
    const result = parseSeafileLink('https://example.com/seafile/lib/repo-id/');
    expect(result.connection?.url).toBe('https://example.com/seafile');
    expect(result.connection?.path).toBe('/');
  });

  it('kommt mit Link ohne Abschluss-Schrägstrich und mit Query zurecht', () => {
    const result = parseSeafileLink('https://host.tld/lib/r1/Aufgaben?foo=bar#x');
    expect(result.connection).toEqual({
      url: 'https://host.tld',
      repoId: 'r1',
      path: '/Aufgaben',
    });
  });

  it('lehnt Freigabe-Links ab', () => {
    const result = parseSeafileLink('https://host.tld/f/abc123/');
    expect(result.connection).toBeNull();
    expect(result.error).toContain('Freigabe-Link');
  });

  it('lehnt Upload-Links ab', () => {
    const result = parseSeafileLink('https://host.tld/u/d/abc123/');
    expect(result.connection).toBeNull();
    expect(result.error).toContain('Upload-Link');
  });

  it('lehnt unvollständige oder ungültige Eingaben ab', () => {
    expect(parseSeafileLink('').error).not.toBeNull();
    expect(parseSeafileLink('kein link').error).not.toBeNull();
    expect(parseSeafileLink('https://host.tld/lib/').error).not.toBeNull();
    expect(parseSeafileLink('ftp://host.tld/lib/r1/').error).not.toBeNull();
  });

  it('baut aus gespeicherten Daten wieder einen Bibliothekslink', () => {
    expect(
      serverLink({ url: 'https://host.tld', repoId: 'r1', path: '/Haus 1/Aufgaben' }),
    ).toBe('https://host.tld/lib/r1/Haus%201/Aufgaben');
    expect(serverLink({ url: 'https://host.tld/', repoId: 'r1', path: '/' })).toBe(
      'https://host.tld/lib/r1/',
    );
  });
});

describe('Dateinamen und Pfade', () => {
  it('erzeugt stabile Namen und entschärft Projekt-IDs', () => {
    expect(projectArchiveName('ABCD2345')).toBe('LDC-Projekt-ABCD2345.zip');
    expect(projectLockFileName('ABCD2345')).toBe('LDC-Projekt-ABCD2345.locks.json');
    expect(safeNamePart('../böse/id')).toBe('___b_se_id');
  });

  it('verbindet Ordner und Datei ohne doppelte Schrägstriche', () => {
    expect(joinServerPath('/', 'a.txt')).toBe('/a.txt');
    expect(joinServerPath('/Haus', 'a.txt')).toBe('/Haus/a.txt');
    expect(joinServerPath('/Haus/', 'a.txt')).toBe('/Haus/a.txt');
    expect(serverDirPath('/')).toBe('/');
    expect(serverDirPath('/Haus')).toBe('/Haus/');
    expect(serverDirPath('/Haus/')).toBe('/Haus/');
  });
});

describe('Bearbeitungssperren', () => {
  it('hält frische Sperren aktiv und lässt alte ablaufen', () => {
    expect(isLockActive(entry(), NOW)).toBe(true);
    expect(isLockActive(entry({ heartbeat: iso(-LOCK_TTL_MS - 1) }), NOW)).toBe(false);
    expect(isLockActive(entry({ heartbeat: 'kaputt' }), NOW)).toBe(false);
  });

  it('erkennt Sperren anderer Geräte, nicht die eigene', () => {
    const file = { version: 1 as const, locks: { t1: entry() } };
    expect(otherLockHolder(file, 't1', 'device-b', NOW)?.user).toBe('Anna');
    expect(otherLockHolder(file, 't1', 'device-a', NOW)).toBeNull();
    expect(
      otherLockHolder(
        { version: 1, locks: { t1: entry({ heartbeat: iso(-LOCK_TTL_MS - 1) }) } },
        't1',
        'device-b',
        NOW,
      ),
    ).toBeNull();
  });

  it('räumt abgelaufene Einträge auf und zählt aktive', () => {
    const file = {
      version: 1 as const,
      locks: { t1: entry(), t2: entry({ heartbeat: iso(-LOCK_TTL_MS - 1) }) },
    };
    expect(countActiveLocks(file, NOW)).toBe(1);
    expect(Object.keys(pruneLocks(file, NOW).locks)).toEqual(['t1']);
  });

  it('normalisiert kaputte Sperrdateien ohne Absturz', () => {
    expect(normalizeLockFile(null)).toEqual(emptyLockFile());
    expect(normalizeLockFile({ locks: { t1: { user: 1 } } }).locks).toEqual({});
    expect(
      normalizeLockFile({ locks: { t1: entry({ user: '  ' }) } }).locks['t1']?.user,
    ).toBe('  ');
  });

  it('erkennt nur vollständig verknüpfte Server', () => {
    expect(isLinkedServer(undefined)).toBe(false);
    expect(
      isLinkedServer({ url: 'https://h', repoId: 'r', path: '/', linkedAt: '' }),
    ).toBe(false);
    expect(
      isLinkedServer({
        url: 'https://h',
        repoId: 'r',
        path: '/',
        linkedAt: iso(-1000),
      }),
    ).toBe(true);
  });
});
