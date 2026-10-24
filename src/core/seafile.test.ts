import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SeafileError,
  checkServer,
  createShareLink,
  deleteDirectoryAtPath,
  deleteFile,
  deleteFileAtPath,
  downloadFileAtPath,
  downloadText,
  listDirectory,
  listFilesRecursive,
  uploadFiles,
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

describe('Bibliotheks-Token (via-repo-token)', () => {
  it('erkennt einen Bibliotheks-Token und prüft die Bibliothek', async () => {
    const calls = mockFetch((url) => {
      if (url === 'https://host.tld/api2/repos/repo-1/') {
        return new Response('', { status: 403 });
      }
      if (url === 'https://host.tld/api/v2.1/via-repo-token/repo-info/') {
        return json({ repo_id: 'repo-1', repo_name: 'Bibliothek' });
      }
      throw new Error(`Unerwartete URL: ${url}`);
    });

    await checkServer(CONN, 'repo-token-check');

    expect(calls.map((call) => call.url)).toEqual([
      'https://host.tld/api2/repos/repo-1/',
      'https://host.tld/api/v2.1/via-repo-token/repo-info/',
    ]);
  });

  it('lehnt einen Bibliotheks-Token für eine andere Bibliothek ab', async () => {
    mockFetch((url) => {
      if (url === 'https://host.tld/api2/repos/repo-1/') {
        return new Response('', { status: 403 });
      }
      return json({ repo_id: 'repo-2', repo_name: 'Andere Bibliothek' });
    });

    await expect(checkServer(CONN, 'repo-token-other')).rejects.toMatchObject({
      name: 'SeafileError',
      kind: 'auth',
      message: expect.stringContaining('anderen Bibliothek'),
    });
  });

  it('nutzt den Upload-Link der Token-API', async () => {
    const calls = mockFetch((url) => {
      if (url === 'https://host.tld/api2/repos/repo-1/') {
        return new Response('', { status: 403 });
      }
      if (url === 'https://host.tld/api/v2.1/via-repo-token/repo-info/') {
        return json({ repo_id: 'repo-1' });
      }
      if (
        url ===
        'https://host.tld/api/v2.1/via-repo-token/upload-link/?path=%2FHaus%201'
      ) {
        return json('https://host.tld:8082/upload-api/token-repo');
      }
      if (url.startsWith('https://host.tld:8082/upload-api/token-repo')) {
        return new Response('ok');
      }
      throw new Error(`Unerwartete URL: ${url}`);
    });

    await checkServer(CONN, 'repo-token-upload');
    await uploadText(CONN, 'repo-token-upload', 'LDC-Projekt-ABCD.zip', 'hallo');

    const post = calls.find((call) => call.url.includes('/upload-api/token-repo'));
    expect(post).toBeDefined();
    expect(post!.init.method).toBe('POST');
    expect(header(post!, 'Authorization')).toBeNull();
    const form = post!.init.body as FormData;
    /* Muss exakt dem path-Parameter des Upload-Links entsprechen. */
    expect(form.get('parent_dir')).toBe('/Haus 1');
    expect(form.get('replace')).toBe('1');
  });

  it('nutzt den Download-Link der Token-API', async () => {
    const calls = mockFetch((url) => {
      if (url === 'https://host.tld/api2/repos/repo-1/') {
        return new Response('', { status: 403 });
      }
      if (url === 'https://host.tld/api/v2.1/via-repo-token/repo-info/') {
        return json({ repo_id: 'repo-1' });
      }
      if (
        url ===
        'https://host.tld/api/v2.1/via-repo-token/download-link/?path=%2FHaus%201%2FLDC-Test.txt'
      ) {
        return json('https://files.tld/seafhttp/files/token/LDC-Test.txt');
      }
      if (url === 'https://files.tld/seafhttp/files/token/LDC-Test.txt') {
        return new Response('Testinhalt');
      }
      throw new Error(`Unerwartete URL: ${url}`);
    });

    await checkServer(CONN, 'repo-token-download');
    const text = await downloadText(CONN, 'repo-token-download', 'LDC-Test.txt');

    expect(text).toBe('Testinhalt');
    expect(calls.some((call) => call.url.includes('/api2/repos/repo-1/file/'))).toBe(
      false,
    );
  });

  it('löscht über den Dateiendpunkt der Token-API', async () => {
    const calls = mockFetch((url) => {
      if (url === 'https://host.tld/api2/repos/repo-1/') {
        return new Response('', { status: 403 });
      }
      if (url === 'https://host.tld/api/v2.1/via-repo-token/repo-info/') {
        return json({ repo_id: 'repo-1' });
      }
      return new Response(null, { status: 200 });
    });

    await checkServer(CONN, 'repo-token-delete');
    await expect(deleteFile(CONN, 'repo-token-delete', 'LDC-Test.txt')).resolves.toBe(
      true,
    );

    const del = calls.find((call) => call.init.method === 'DELETE');
    expect(del).toBeDefined();
    expect(decodeURIComponent(del!.url)).toContain(
      '/api/v2.1/via-repo-token/file/?path=/Haus 1/LDC-Test.txt',
    );
  });
});

describe('uploadText', () => {
  it('meldet einen fehlenden Zielordner verständlich', async () => {
    mockFetch(() => new Response('', { status: 404 }));

    await expect(
      uploadText(CONN, 'secret-missing', 'LDC-Test.txt', 'hallo'),
    ).rejects.toMatchObject({
      kind: 'notfound',
      message: expect.stringContaining('Zielordner'),
    });
  });

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

describe('Einzeldateien an Pfaden', () => {
  it('lädt mehrere Dateien mit relative_path in Unterordner', async () => {
    const calls = mockFetch((url) => {
      if (url === 'https://host.tld/api2/repos/repo-1/upload-link/?p=%2F') {
        return json('https://host.tld:8082/upload-api/batch');
      }
      if (url.startsWith('https://host.tld:8082/upload-api/batch')) {
        return new Response('ok');
      }
      throw new Error(`Unerwartete URL: ${url}`);
    });
    const progress: number[] = [];

    await uploadFiles(
      CONN,
      'secret-batch',
      [
        { path: 'LDC-Projekt-ABCD/project.json', content: new Blob(['{}']) },
        {
          path: 'LDC-Projekt-ABCD/tasks/T1/task.json',
          content: new Blob(['{}']),
        },
      ],
      (done) => progress.push(done),
    );

    expect(calls[0].url).toBe('https://host.tld/api2/repos/repo-1/upload-link/?p=%2F');
    const first = calls[1].init.body as FormData;
    expect(first.get('parent_dir')).toBe('/');
    expect(first.get('relative_path')).toBe('Haus 1/LDC-Projekt-ABCD/');
    expect((first.get('file') as File).name).toBe('project.json');
    const second = calls[2].init.body as FormData;
    expect(second.get('relative_path')).toBe('Haus 1/LDC-Projekt-ABCD/tasks/T1/');
    expect(progress).toEqual([1, 2]);
  });

  it('liest und löscht eine Datei an einem absoluten Pfad', async () => {
    const filePath = '/Haus 1/LDC-Projekt-ABCD/project.json';
    const download = 'https://files.tld/seafhttp/files/token/project.json';
    const calls = mockFetch((url, init) => {
      if (
        url ===
        'https://host.tld/api2/repos/repo-1/file/?p=%2FHaus%201%2FLDC-Projekt-ABCD%2Fproject.json'
      ) {
        return init.method === 'DELETE' ? new Response(null, { status: 200 }) : json(download);
      }
      if (url === download) return new Response('{"id":"PROJ"}');
      throw new Error(`Unerwartete URL: ${url}`);
    });

    const bytes = await downloadFileAtPath(CONN, 'secret-path', filePath);
    expect(new TextDecoder().decode(bytes!)).toBe('{"id":"PROJ"}');
    await expect(deleteFileAtPath(CONN, 'secret-path', filePath)).resolves.toBe(true);
    expect(calls.some((call) => call.init.method === 'DELETE')).toBe(true);
  });

  it('liest ein Verzeichnis über die persönliche API', async () => {
    mockFetch(() =>
      json([
        { type: 'file', name: 'a.txt' },
        { type: 'dir', name: 'Unterordner' },
      ]),
    );

    await expect(
      listDirectory(CONN, 'secret-list', '/Haus 1'),
    ).resolves.toEqual([
      { type: 'file', name: 'a.txt' },
      { type: 'dir', name: 'Unterordner' },
    ]);
  });

  it('liest ein Verzeichnis über die Bibliotheks-Token-API', async () => {
    const calls = mockFetch((url) => {
      if (url === 'https://host.tld/api2/repos/repo-1/') {
        return new Response('', { status: 403 });
      }
      if (url === 'https://host.tld/api/v2.1/via-repo-token/repo-info/') {
        return json({ repo_id: 'repo-1' });
      }
      if (
        url ===
        'https://host.tld/api/v2.1/via-repo-token/dir/?path=%2FHaus%201'
      ) {
        return json({ dirent_list: [{ type: 'file', name: 'b.txt' }] });
      }
      throw new Error(`Unerwartete URL: ${url}`);
    });

    await checkServer(CONN, 'repo-token-list');
    await expect(
      listDirectory(CONN, 'repo-token-list', '/Haus 1'),
    ).resolves.toEqual([{ type: 'file', name: 'b.txt' }]);
    expect(calls.some((call) => call.url.includes('via-repo-token/dir/'))).toBe(true);
  });

  it('löscht leere Ordner und lässt nicht leere stehen', async () => {
    const calls = mockFetch((url) => {
      if (
        url ===
        'https://host.tld/api2/repos/repo-1/dir/?p=%2FHaus%201%2FLeer'
      ) {
        return new Response(null, { status: 200 });
      }
      return new Response('', { status: 400 });
    });

    await expect(
      deleteDirectoryAtPath(CONN, 'secret-dir', '/Haus 1/Leer'),
    ).resolves.toBe(true);
    await expect(
      deleteDirectoryAtPath(CONN, 'secret-dir', '/Haus 1/Voll'),
    ).resolves.toBe(false);
    expect(calls.every((call) => call.init.method === 'DELETE')).toBe(true);
  });

  it('liest alle Dateien rekursiv', async () => {
    mockFetch((url) => {
      if (url === 'https://host.tld/api2/repos/repo-1/dir/?p=%2FHaus%201') {
        return json([
          { type: 'dir', name: 'Projekt' },
          { type: 'file', name: 'a.txt' },
        ]);
      }
      if (
        url ===
        'https://host.tld/api2/repos/repo-1/dir/?p=%2FHaus%201%2FProjekt'
      ) {
        return json([{ type: 'file', name: 'b.txt' }]);
      }
      throw new Error(`Unerwartete URL: ${url}`);
    });

    await expect(
      listFilesRecursive(CONN, 'secret-tree', '/Haus 1'),
    ).resolves.toEqual(['/Haus 1/Projekt/b.txt', '/Haus 1/a.txt']);
  });
});

describe('createShareLink', () => {
  it('erstellt einen Leselink für die Freigabe-ZIP', async () => {
    mockFetch((url, init) => {
      if (url === 'https://host.tld/api/v2.1/share-links/') {
        expect(init.method).toBe('POST');
        expect(new Headers(init.headers).get('Authorization')).toBe(
          'Token secret',
        );
        expect(JSON.parse(init.body as string)).toEqual({
          repo_id: 'repo-1',
          path: '/Haus 1/LDC-Freigabe-ABCD.zip',
          permissions: { can_edit: false, can_download: true },
        });
        return json({ link: '/f/abc123/', token: 'abc123' });
      }
      throw new Error(`Unerwartete URL: ${url}`);
    });

    const share = await createShareLink(
      CONN,
      'secret',
      '/Haus 1/LDC-Freigabe-ABCD.zip',
    );

    expect(share).toEqual({ link: 'https://host.tld/f/abc123/', token: 'abc123' });
  });

  it('meldet eine unbrauchbare Antwort verständlich', async () => {
    mockFetch(() => json({}));

    await expect(
      createShareLink(CONN, 'secret', '/Haus 1/Datei.zip'),
    ).rejects.toMatchObject({
      name: 'SeafileError',
      message: expect.stringContaining('Freigabe-Link'),
    });
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
