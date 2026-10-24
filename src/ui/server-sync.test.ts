import { afterEach, describe, expect, it, vi } from 'vitest';
import { testServerConnection } from './server-sync';
import type { SeafileConnection } from '../domain/server';

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

describe('testServerConnection', () => {
  it('schreibt, liest und löscht eine Testdatei', async () => {
    let uploaded = '';
    const calls = mockFetch(async (url, method, init) => {
      if (url === `${BASE}/`) return json({ name: 'Bibliothek' });
      if (url.startsWith(`${BASE}/upload-link/`)) return json(UPLOAD);
      if (url.startsWith(UPLOAD)) {
        const form = init.body as FormData;
        const file = form.get('file') as File;
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
});
