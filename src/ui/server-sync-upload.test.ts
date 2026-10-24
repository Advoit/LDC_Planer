import { afterEach, describe, expect, it, vi } from 'vitest';
import { syncNow } from './server-sync';
import { state } from './app-state';
import { saveServerToken } from '../core/seafile';
import { buildProjectFiles } from '../io/export';
import type { Project } from '../domain/types';

vi.mock('./toast', () => ({ showToast: () => undefined }));

const CONN = {
  url: 'https://host.tld',
  repoId: 'repo-1',
  path: '/Baustelle',
};
const BASE = 'https://host.tld/api2/repos/repo-1';

interface Call {
  url: string;
  method: string;
}

function json(value: unknown): Response {
  return new Response(JSON.stringify(value));
}

function mockFetch(
  handler: (url: string, method: string) => Response | Promise<Response>,
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
      const method = init?.method ?? 'GET';
      calls.push({ url, method });
      return handler(url, method);
    }),
  );
  return calls;
}

function stubLocalStorage(): Map<string, string> {
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
  return store;
}

function makeProject(): Project {
  return {
    schemaVersion: 1,
    id: 'ABCD1234',
    name: 'Testprojekt',
    location: 'Ort',
    description: '',
    createdAt: '2026-02-01T09:00:00.000Z',
    updatedAt: '2026-02-01T10:00:00.000Z',
    tasks: [],
    documents: [],
    server: {
      ...CONN,
      linkedAt: '2026-02-01T10:00:00.000Z',
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  state.project = null;
});

describe('Abgleich ohne Änderungen', () => {
  it('lädt eine unveränderte Serverdatei nicht erneut hoch', async () => {
    const store = stubLocalStorage();
    const project = makeProject();
    saveServerToken(project.server!, 'secret');
    /* Der Serverstand gilt als bereits eingemischt; der lokale Stand bleibt. */
    store.set(
      'ldc.seafile.lastSync',
      JSON.stringify({ ABCD1234: '2099-01-01T00:00:00.000Z' }),
    );
    state.project = project;

    const remoteFiles = buildProjectFiles(project, { includeServer: false });
    const remoteRelative = 'LDC-Projekt-ABCD1234/project.json';
    const remoteBytes = remoteFiles[remoteRelative];
    const remotePath = `${CONN.path}/${remoteRelative}`;
    const downloadUrl = 'https://files.tld/seafhttp/files/token/project.json';
    let uploads = 0;

    mockFetch((url, method) => {
      if (url === `${BASE}/`) return json({ name: 'Bibliothek' });
      if (
        url ===
        `${BASE}/dir/?p=${encodeURIComponent(`${CONN.path}/LDC-Projekt-ABCD1234`)}`
      ) {
        return json([{ type: 'file', name: 'project.json' }]);
      }
      if (
        url === `${BASE}/file/?p=${encodeURIComponent(remotePath)}` &&
        method === 'GET'
      ) {
        return json(downloadUrl);
      }
      if (url === downloadUrl) {
        return new Response(
          remoteBytes.buffer.slice(
            remoteBytes.byteOffset,
            remoteBytes.byteOffset + remoteBytes.byteLength,
          ) as ArrayBuffer,
        );
      }
      if (url.startsWith(`${BASE}/upload-link/`)) {
        return json('https://host.tld:8082/upload-api/token');
      }
      if (url.includes('/upload-api')) {
        uploads++;
        return new Response('ok');
      }
      throw new Error(`Unerwartete Anfrage: ${method} ${url}`);
    });

    const result = await syncNow();

    expect(result.ok).toBe(true);
    expect(uploads).toBe(0);

    /* Nur die geänderte project.json wird hochgeladen. */
    state.project = { ...project, name: 'Geändertes Projekt' };
    const second = await syncNow();

    expect(second.ok).toBe(true);
    expect(uploads).toBe(1);
  });
});
