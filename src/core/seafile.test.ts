import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SeafileError,
  checkServer,
  deleteFile,
  downloadText,
  uploadText,
} from './seafile';
import type { SeafileConnection } from '../domain/server';

const CONN: SeafileConnection = {
  url: 'https://host.tld',
  repoId: 'repo-1',
  path: '/Haus 1',
};

interface RecordedCall {
  url: string;
  init: RequestInit;
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockFetch(
  handler: (url: string, init: RequestInit) => Response | Promise<Response>,
): RecordedCall[] {
  const calls: RecordedCall[] = [];
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
      calls.push({ url, init: options });
      return handler(url, options);
    }),
  );
  return calls;
}

function header(call: RecordedCall, name: string): string | null {
  return new Headers(call.init.headers).get(name);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('checkServer', () => {
  it('prüft die Bibliothek mit Token im Authorization-Header', async () => {
    const calls = mockFetch(() => json({ name: 'Bibliothek' }));

    await checkServer(CONN, 'secret-token');

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://host.tld/api2/repos/repo-1/');
    expect(header(calls[0], 'Authorization')).toBe('Token secret-token');
  });

  it('meldet einen ungültigen Token als auth-Fehler', async () => {
    mockFetch(() => new Response('', { status: 401 }));

    await expect(checkServer(CONN, 'falsch')).rejects.toMatchObject({
      name: 'SeafileError',
      kind: 'auth',
      status: 401,
    });
  });

  it('meldet Netzwerk-/CORS-Fehler als network', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );

    await expect(checkServer(CONN, 'secret')).rejects.toBeInstanceOf(SeafileError);
    await expect(checkServer(CONN, 'secret')).rejects.toMatchObject({
      kind: 'network',
    });
  });
});

describe('uploadText', () => {
  it('holt einen Upload-Link und schreibt in den verknüpften Ordner', async () => {
    const calls = mockFetch((url) => {
      if (url === 'https://host.tld/api2/repos/repo-1/upload-link/?p=%2FHaus%201%2F') {
        return json('https://host.tld:8082/upload-api/token-1');
      }
      if (url.startsWith('https://host.tld:8082/upload-api/token-1')) {
        return new Response('ok');
      }
      throw new Error(`Unerwartete URL: ${url}`);
    });

    await uploadText(CONN, 'secret', 'LDC-Projekt-ABCD.zip', 'hallo');

    expect(calls).toHaveLength(2);
    expect(header(calls[0], 'Authorization')).toBe('Token secret');

    const post = calls[1];
    expect(post.url).toBe('https://host.tld:8082/upload-api/token-1?ret-json=1');
    expect(post.init.method).toBe('POST');
    expect(header(post, 'Authorization')).toBeNull();

    const form = post.init.body as FormData;
    expect(form.get('parent_dir')).toBe('/Haus 1/');
    expect(form.get('replace')).toBe('1');
    const file = form.get('file');
    expect(file).not.toBeNull();
    expect((file as File).name).toBe('LDC-Projekt-ABCD.zip');
  });
});

describe('downloadText', () => {
  it('holt den Download-Link und liest die Datei ohne Token-Header', async () => {
    const calls = mockFetch((url) => {
      if (url === 'https://host.tld/api2/repos/repo-1/file/?p=%2FHaus%201%2FLDC-Test.txt') {
        return json('https://files.tld/seafhttp/files/token/LDC-Test.txt');
      }
      if (url === 'https://files.tld/seafhttp/files/token/LDC-Test.txt') {
        return new Response('Testinhalt');
      }
      throw new Error(`Unerwartete URL: ${url}`);
    });

    const text = await downloadText(CONN, 'secret', 'LDC-Test.txt');

    expect(text).toBe('Testinhalt');
    expect(calls).toHaveLength(2);
    expect(header(calls[0], 'Authorization')).toBe('Token secret');
    expect(header(calls[1], 'Authorization')).toBeNull();
  });

  it('liefert null, wenn die Datei noch nicht existiert', async () => {
    mockFetch(() => new Response('', { status: 404 }));

    await expect(downloadText(CONN, 'secret', 'fehlt.txt')).resolves.toBeNull();
  });
});

describe('deleteFile', () => {
  it('löscht über die Datei-API', async () => {
    const calls = mockFetch(() => new Response(null, { status: 200 }));

    await expect(deleteFile(CONN, 'secret', 'LDC-Test.txt')).resolves.toBe(true);
    expect(calls[0].init.method).toBe('DELETE');
    expect(decodeURIComponent(calls[0].url)).toContain('/file/?p=/Haus 1/LDC-Test.txt');
  });

  it('meldet eine bereits gelöschte Datei als false', async () => {
    mockFetch(() => new Response('', { status: 404 }));

    await expect(deleteFile(CONN, 'secret', 'LDC-Test.txt')).resolves.toBe(false);
  });
});
