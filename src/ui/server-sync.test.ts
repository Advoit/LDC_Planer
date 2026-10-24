import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  filesToRemove,
  filesToUpload,
  parentDirsWithin,
  pollOnce,
  testServerConnection,
} from './server-sync';
import { state } from './app-state';
import { saveServerToken } from '../core/seafile';
import type { SeafileConnection } from '../domain/server';
import type { Project } from '../domain/types';

const CONN: SeafileConnection = {
  url: 'https://host.tld',
  repoId: 'repo-1',
  path: '/Baustelle',
};

const BASE = 'https://host.tld/api2/repos/repo-1';
const UPLOAD = 'https://host.tld:8082/upload-api/token-1';
const DOWNLOAD = 'https://files.tld/seafhttp/files/token-1/LDC-Test-ABCD1234.txt';

interface Call {
  url: string;
  method: string;
  init: RequestInit;
}

function json(value: unknown): Response {
  return new Response(JSON.stringify(value));
}

function mockFetch(
  handler: (url: string, method: string, init: RequestInit) => Response | Promise<Response>,
): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const options = init ?? {};
      calls.push({ url, method: options.method ?? 'GET', init: options });
      return handler(url, options.method ?? 'GET', options);
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('filesToUpload', () => {
  it('lädt nur neue oder geänderte Dateien hoch', () => {
    expect(
      filesToUpload(
        { a: '1', b: '2', alt: '9' },
        { a: '1', b: '3', c: '4' },
      ),
    ).toEqual(['b', 'c']);
  });

  it('lädt alles hoch, wenn noch keine Hashes bekannt sind', () => {
    expect(filesToUpload({}, { a: '1', b: '2' })).toEqual(['a', 'b']);
  });
});

describe('pollOnce', () => {
  it('fragt eine fehlende Sperrdatei nicht per GET an', async () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => store.clear(),
      key: (index: number) => [...store.keys()][index] ?? null,
      get length() {
        return store.size;
      },
    });
    vi.stubGlobal('document', { hidden: false });

    const project: Project = {
      schemaVersion: 1,
      id: 'ABCD1234',
      name: 'Testprojekt',
      location: 'Ort',
      description: '',
      createdAt: '2026-02-01T10:00:00.000Z',
      updatedAt: '2026-02-01T10:00:00.000Z',
      tasks: [],
      documents: [],
      server: {
        url: 'https://host.tld',
        repoId: 'repo-1',
        path: '/Baustelle',
        linkedAt: '2026-02-01T10:00:00.000Z',
      },
    };
    saveServerToken(project.server!, 'secret');
    state.project = project;

    const calls = mockFetch((url) => {
      if (url === `${BASE}/`) return json({ name: 'Bibliothek' });
      if (url === `${BASE}/dir/?p=%2FBaustelle`) return json([]);
      throw new Error(`Unerwartete Anfrage: ${url}`);
    });

    await pollOnce();

    expect(calls.some((call) => call.url.includes('locks.json'))).toBe(false);
    expect(calls.some((call) => call.url.includes('/dir/'))).toBe(true);
    state.project = null;
  });
});

describe('filesToRemove', () => {
  it('findet nur die nicht mehr verwendeten Dateien', () => {
    expect(
      filesToRemove(
        ['/P/LDC-Projekt-A/a.txt', '/P/LDC-Projekt-A/b.txt'],
        ['/P/LDC-Projekt-A/b.txt', '/P/LDC-Projekt-A/c.txt'],
      ),
    ).toEqual(['/P/LDC-Projekt-A/a.txt']);
  });
});

describe('parentDirsWithin', () => {
  it('liefert die Unterordner bis zum Projektordner', () => {
    expect(
      parentDirsWithin('/P/LDC-Projekt-A', '/P/LDC-Projekt-A/tasks/T1/images/x.png'),
    ).toEqual([
      '/P/LDC-Projekt-A/tasks/T1/images/',
      '/P/LDC-Projekt-A/tasks/T1/',
      '/P/LDC-Projekt-A/tasks/',
    ]);
  });

  it('liefert nichts für Dateien im Projektstamm oder außerhalb', () => {
    expect(parentDirsWithin('/P/LDC-Projekt-A', '/P/LDC-Projekt-A/project.json')).toEqual(
      [],
    );
    expect(parentDirsWithin('/P/LDC-Projekt-A', '/P/Anderes/x.txt')).toEqual([]);
  });
});

describe('testServerConnection', () => {
  it('schreibt, liest und löscht eine Testdatei', async () => {
    let uploaded = '';
    const calls = mockFetch(async (url, method, init) => {
      if (url === `${BASE}/`) return json({ name: 'Bibliothek' });
      if (url.startsWith(`${BASE}/upload-link/`)) return json(UPLOAD);
      if (url.startsWith(UPLOAD)) {
        const form = init.body as FormData;
        expect(form.get('parent_dir')).toBe('/');
        expect(form.get('relative_path')).toBe('Baustelle/');
        const file = form.get('file') as File;
        expect(file.name).toBe('LDC-Test-ABCD1234.txt');
        uploaded = await file.text();
        return new Response('ok');
      }
      if (url.startsWith(`${BASE}/file/`) && method === 'GET') {
        return json(DOWNLOAD);
      }
      if (url === DOWNLOAD) return new Response(uploaded);
      if (url.startsWith(`${BASE}/file/`) && method === 'DELETE') {
        return new Response(null, { status: 200 });
      }
      throw new Error(`Unerwartete Anfrage: ${method} ${url}`);
    });

    const result = await testServerConnection(CONN, 'secret', 'ABCD1234');

    expect(result.error).toBeNull();
    expect(result.ok).toBe(true);
    expect(result.steps.map((step) => step.label)).toEqual([
      'Server und Bibliothek erreichbar',
      'Testdatei geschrieben',
      'Testdatei gelesen',
      'Testdatei gelöscht',
    ]);
    expect(uploaded).toContain('LDC Planer Test');
    expect(calls.some((call) => call.method === 'DELETE')).toBe(true);
  });

  it('löscht die Testdatei auch, wenn das Lesen scheitert', async () => {
    const calls = mockFetch((url, method) => {
      if (url === `${BASE}/`) return json({ name: 'Bibliothek' });
      if (url.startsWith(`${BASE}/upload-link/`)) return json(UPLOAD);
      if (url.startsWith(UPLOAD)) return new Response('ok');
      if (url.startsWith(`${BASE}/file/`) && method === 'GET') {
        return json(DOWNLOAD);
      }
      if (url === DOWNLOAD) return new Response('', { status: 500 });
      if (url.startsWith(`${BASE}/file/`) && method === 'DELETE') {
        return new Response(null, { status: 200 });
      }
      throw new Error(`Unerwartete Anfrage: ${method} ${url}`);
    });

    const result = await testServerConnection(CONN, 'secret', 'ABCD1234');

    expect(result.ok).toBe(false);
    expect(result.steps.at(-1)).toEqual({ label: 'Testdatei gelöscht', ok: true });
    expect(calls.some((call) => call.method === 'DELETE')).toBe(true);
  });

  it('meldet einen ungültigen Token verständlich', async () => {
    mockFetch(() => new Response('', { status: 403 }));

    const result = await testServerConnection(CONN, 'falsch', 'ABCD1234');

    expect(result.ok).toBe(false);
    expect(result.error).toContain('Zugang verweigert');
  });

  it('funktioniert auch mit einem Bibliotheks-Token (via-repo-token)', async () => {
    let uploaded = '';
    const repoBase = 'https://host.tld/api/v2.1/via-repo-token';
    const repoUpload = 'https://host.tld:8082/upload-api/token-repo';
    const repoDownload =
      'https://files.tld/seafhttp/files/token-repo/LDC-Test-ABCD1234.txt';

    const calls = mockFetch(async (url, method, init) => {
      if (url === `${BASE}/`) return new Response('', { status: 403 });
      if (url === `${repoBase}/repo-info/`) return json({ repo_id: 'repo-1' });
      if (url === `${repoBase}/upload-link/?path=%2F`) {
        return json(repoUpload);
      }
      if (url.startsWith(repoUpload)) {
        const form = init.body as FormData;
        expect(form.get('parent_dir')).toBe('/');
        expect(form.get('relative_path')).toBe('Baustelle/');
        uploaded = await (form.get('file') as File).text();
        return new Response('ok');
      }
      if (
        url ===
        `${repoBase}/download-link/?path=%2FBaustelle%2FLDC-Test-ABCD1234.txt`
      ) {
        return json(repoDownload);
      }
      if (url === repoDownload) return new Response(uploaded);
      if (
        url === `${repoBase}/file/?path=%2FBaustelle%2FLDC-Test-ABCD1234.txt` &&
        method === 'DELETE'
      ) {
        return new Response(null, { status: 200 });
      }
      throw new Error(`Unerwartete Anfrage: ${method} ${url}`);
    });

    const result = await testServerConnection(CONN, 'repo-secret', 'ABCD1234');

    expect(result.error).toBeNull();
    expect(result.ok).toBe(true);
    expect(result.steps.map((step) => step.label)).toEqual([
      'Server und Bibliothek erreichbar',
      'Testdatei geschrieben',
      'Testdatei gelesen',
      'Testdatei gelöscht',
    ]);
    expect(uploaded).toContain('LDC Planer Test');
    expect(calls.some((call) => call.method === 'DELETE')).toBe(true);
  });
});
