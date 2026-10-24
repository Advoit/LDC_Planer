import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSharedProject, pollOnce, syncNow } from './server-sync';
import { state } from './app-state';
import { readServerToken, saveServerToken } from '../core/seafile';
import { sha256Hex } from '../core/hash';
import { buildProjectFiles } from '../io/export';
import type { ServerAccess } from '../io/share';
import type { Project, ProjectDocument, Task } from '../domain/types';

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

function makeTask(id = 'T1', name = 'Vom anderen Gerät'): Task {
  return {
    id,
    projectId: 'ABCD1234',
    createdAt: '2026-02-02T10:00:00.000Z',
    updatedAt: '2026-02-02T10:00:00.000Z',
    name,
    description: '',
    images: [],
    thumbnail: null,
    thumbnailSourceId: null,
    material: [],
    plannedWork: '',
    personnel: 1,
    typ: 'maengel',
    art: '',
    pruefung: '',
    fehlerbeschreibung: '',
    position: '',
    documents: [],
    status: 'offen',
    editedBy: '',
    editedAt: '',
    hintText: '',
    afterImages: [],
    afterDocuments: [],
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  state.project = null;
});

function repoPathFromUrl(url: string): string {
  const index = url.indexOf('p=');
  return decodeURIComponent(url.slice(index + 2));
}

describe('Abgleich ohne Änderungen', () => {
  it('prüft bei unveränderter project.json nur diese eine Datei', async () => {
    const store = stubLocalStorage();
    const project = makeProject();
    saveServerToken(project.server!, 'secret');
    state.project = project;

    const remoteFiles = buildProjectFiles(project, { includeServer: false });
    const remoteRelative = 'LDC-Projekt-ABCD1234/project.json';
    const remotePath = `${CONN.path}/${remoteRelative}`;
    const remoteBytes = remoteFiles[remoteRelative];
    const hash = await sha256Hex(
      remoteBytes.buffer.slice(
        remoteBytes.byteOffset,
        remoteBytes.byteOffset + remoteBytes.byteLength,
      ) as ArrayBuffer,
    );
    store.set(
      'ldc.seafile.fileHashes',
      JSON.stringify({
        'https://host.tld|repo-1|/Baustelle|ABCD1234': {
          [remotePath]: hash,
        },
      }),
    );

    const downloadUrl = 'https://files.tld/seafhttp/files/token/project.json';
    const calls = mockFetch((url, method) => {
      if (url === `${BASE}/`) return json({ name: 'Bibliothek' });
      if (
        url ===
        `${BASE}/dir/?p=${encodeURIComponent(`${CONN.path}/LDC-Projekt-ABCD1234`)}`
      ) {
        return json([
          { type: 'file', name: 'project.json', size: 456, mtime: 1700000000 },
        ]);
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
      throw new Error(`Unerwartete Anfrage: ${method} ${url}`);
    });

    const result = await syncNow();

    expect(result.ok).toBe(true);
    /* Einmal die Metadaten merken; sonst nur project.json, keine weiteren Dateien. */
    expect(calls.filter((call) => call.url.includes('/dir/'))).toHaveLength(1);
    expect(calls.filter((call) => call.url.includes('/file/'))).toHaveLength(1);
  });

  it('überspringt Download und Upload bei unveränderten Datei-Metadaten', async () => {
    const store = stubLocalStorage();
    const project = makeProject();
    saveServerToken(project.server!, 'secret');
    state.project = project;

    const remoteFiles = buildProjectFiles(project, { includeServer: false });
    const remoteRelative = 'LDC-Projekt-ABCD1234/project.json';
    const remotePath = `${CONN.path}/${remoteRelative}`;
    const remoteBytes = remoteFiles[remoteRelative];
    const hash = await sha256Hex(
      remoteBytes.buffer.slice(
        remoteBytes.byteOffset,
        remoteBytes.byteOffset + remoteBytes.byteLength,
      ) as ArrayBuffer,
    );
    const key = 'https://host.tld|repo-1|/Baustelle|ABCD1234';
    store.set(
      'ldc.seafile.fileHashes',
      JSON.stringify({ [key]: { [remotePath]: hash } }),
    );
    store.set(
      'ldc.seafile.fileSignatures',
      JSON.stringify({ [key]: { [remotePath]: '1700000000:1234' } }),
    );

    const calls = mockFetch((url) => {
      if (url === `${BASE}/`) return json({ name: 'Bibliothek' });
      if (
        url ===
        `${BASE}/dir/?p=${encodeURIComponent(`${CONN.path}/LDC-Projekt-ABCD1234`)}`
      ) {
        return json([
          { type: 'file', name: 'project.json', size: 1234, mtime: 1700000000 },
        ]);
      }
      throw new Error(`Unerwartete Anfrage: ${url}`);
    });

    const result = await syncNow();

    expect(result.ok).toBe(true);
    expect(calls.some((call) => call.url.includes('/file/'))).toBe(false);
    expect(calls.some((call) => call.url.includes('/upload-link/'))).toBe(false);
  });

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

describe('Abgleich mit geänderter project.json', () => {
  it('lädt unveränderte Anhänge nicht erneut herunter', async () => {
    stubLocalStorage();
    const documentBytes = Uint8Array.from([1, 2, 3, 4]);
    const document: ProjectDocument = {
      id: 'DOC1',
      name: 'Plan.pdf',
      mime: 'application/pdf',
      size: documentBytes.length,
      dataUrl: 'data:application/pdf;base64,AQIDBA==',
      hash: await sha256Hex(documentBytes.buffer),
    };
    const local: Project = { ...makeProject(), documents: [document] };
    const remote: Project = {
      ...local,
      updatedAt: '2026-02-02T10:00:00.000Z',
    };
    saveServerToken(local.server!, 'secret');
    state.project = local;

    const root = `${CONN.path}/LDC-Projekt-ABCD1234`;
    const projectPath = `${root}/project.json`;
    const documentPath = `${root}/documents/DOC1.pdf`;
    const bytesByPath = new Map<string, Uint8Array>();
    for (const [relative, bytes] of Object.entries(
      buildProjectFiles(remote, { includeServer: false }),
    )) {
      bytesByPath.set(`${CONN.path}/${relative}`, bytes);
    }
    const dirs: Record<string, unknown[]> = {
      [root]: [
        { type: 'file', name: 'project.json' },
        { type: 'dir', name: 'documents' },
      ],
      [`${root}/documents`]: [{ type: 'file', name: 'DOC1.pdf' }],
    };
    const downloaded: string[] = [];

    mockFetch((url) => {
      if (url === `${BASE}/`) return json({ name: 'Bibliothek' });
      if (url.startsWith(`${BASE}/dir/?p=`)) {
        const path = repoPathFromUrl(url);
        const entries = dirs[path];
        if (!entries) return new Response('not found', { status: 404 });
        return json(entries);
      }
      if (url.startsWith(`${BASE}/file/?p=`)) {
        const path = repoPathFromUrl(url);
        downloaded.push(path);
        return json(
          `https://files.tld/seafhttp/files/${encodeURIComponent(path)}`,
        );
      }
      if (url.startsWith('https://files.tld/seafhttp/files/')) {
        const path = decodeURIComponent(
          url.slice('https://files.tld/seafhttp/files/'.length),
        );
        const bytes = bytesByPath.get(path);
        if (!bytes) return new Response('not found', { status: 404 });
        return new Response(
          bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ) as ArrayBuffer,
        );
      }
      if (url.startsWith(`${BASE}/upload-link/`)) {
        return json('https://host.tld:8082/upload-api/token');
      }
      if (url.includes('/upload-api')) return new Response('ok');
      throw new Error(`Unerwartete Anfrage: ${url}`);
    });

    const result = await syncNow();

    expect(result.ok).toBe(true);
    /* Nur die JSON-Datei wird geladen; das unveränderte PDF bleibt lokal. */
    expect(downloaded).toEqual([projectPath]);
    expect(downloaded).not.toContain(documentPath);
  });
});

describe('Upload mit Anhängen', () => {
  it('lädt neue Dokumente und die JSON-Dateien hoch', async () => {
    stubLocalStorage();
    const bytes = Uint8Array.from([1, 2, 3, 4]);
    const document: ProjectDocument = {
      id: 'DOC1',
      name: 'Plan.pdf',
      mime: 'application/pdf',
      size: bytes.length,
      dataUrl: 'data:application/pdf;base64,AQIDBA==',
      hash: await sha256Hex(bytes.buffer),
    };
    const project: Project = { ...makeProject(), documents: [document] };
    saveServerToken(project.server!, 'secret');
    state.project = project;

    let uploads = 0;
    mockFetch((url) => {
      if (url === `${BASE}/`) return json({ name: 'Bibliothek' });
      if (url === `${BASE}/dir/?p=%2FBaustelle`) return json([]);
      if (url.startsWith(`${BASE}/dir/?p=`)) {
        return new Response('not found', { status: 404 });
      }
      if (url.startsWith(`${BASE}/upload-link/`)) {
        return json('https://host.tld:8082/upload-api/token');
      }
      if (url.includes('/upload-api')) {
        uploads++;
        return new Response('ok');
      }
      throw new Error(`Unerwartete Anfrage: ${url}`);
    });

    const result = await syncNow();

    expect(result.ok).toBe(true);
    /* project.json + documents/DOC1.pdf */
    expect(uploads).toBe(2);
  });
});

describe('Automatischer Abgleich beim Polling', () => {
  it('übernimmt neue und gelöschte Aufgaben anderer Geräte ohne Neuladen', async () => {
    const store = stubLocalStorage();
    const local = makeProject();
    local.tasks = [makeTask('T0', 'Bereits vorhanden')];
    saveServerToken(local.server!, 'secret');
    state.project = local;

    const remoteDocBytes = Uint8Array.from([9, 8, 7]);
    const remoteDoc: ProjectDocument = {
      id: 'D1',
      name: 'Plan.pdf',
      mime: 'application/pdf',
      size: remoteDocBytes.length,
      dataUrl: 'data:application/pdf;base64,CQgH',
      hash: await sha256Hex(remoteDocBytes.buffer),
    };
    const remote: Project = {
      ...local,
      updatedAt: '2026-02-02T10:00:00.000Z',
      tasks: [
        makeTask('T0', 'Bereits vorhanden'),
        { ...makeTask(), documents: [remoteDoc] },
      ],
    };
    const rootName = 'LDC-Projekt-ABCD1234';
    const rootPath = `${CONN.path}/${rootName}`;
    const projectPath = `${rootPath}/project.json`;
    const unchangedTaskPath = `${rootPath}/tasks/T0/task.json`;
    const newTaskPath = `${rootPath}/tasks/T1/task.json`;
    const newDocPath = `${rootPath}/tasks/T1/documents/D1.pdf`;
    let remoteFiles = buildProjectFiles(remote, { includeServer: false });
    const oldFiles = buildProjectFiles(local, { includeServer: false });
    const hashOf = async (bytes: Uint8Array): Promise<string> =>
      sha256Hex(
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer,
      );
    const oldHash = await hashOf(oldFiles[`${rootName}/project.json`]);
    const oldTaskHash = await hashOf(
      oldFiles[`${rootName}/tasks/T0/task.json`],
    );
    const key = 'https://host.tld|repo-1|/Baustelle|ABCD1234';
    store.set(
      'ldc.seafile.fileHashes',
      JSON.stringify({
        [key]: { [projectPath]: oldHash, [unchangedTaskPath]: oldTaskHash },
      }),
    );
    store.set(
      'ldc.seafile.fileSignatures',
      JSON.stringify({
        [key]: {
          [projectPath]: '1700000000:100',
          [unchangedTaskPath]: '1700000000:700',
        },
      }),
    );
    store.set(
      'ldc.seafile.dirIds',
      JSON.stringify({
        [key]: { [`${rootPath}/tasks/T0`]: 'task-0' },
      }),
    );
    store.set(
      'ldc.seafile.lastSync',
      JSON.stringify({ ABCD1234: '2026-02-01T10:00:00.000Z' }),
    );

    const dirs: Record<string, unknown[]> = {
      [rootPath]: [
        { type: 'file', name: 'project.json', size: 456, mtime: 1800000000 },
        { type: 'dir', name: 'tasks', id: 'tasks-1' },
      ],
      [`${rootPath}/tasks`]: [
        { type: 'dir', name: 'T0', id: 'task-0' },
        { type: 'dir', name: 'T1', id: 'task-1' },
      ],
      [`${rootPath}/tasks/T0`]: [
        { type: 'file', name: 'task.json', size: 700, mtime: 1700000000 },
      ],
      [`${rootPath}/tasks/T1`]: [
        { type: 'file', name: 'task.json', size: 789, mtime: 1800000000 },
      ],
    };
    let uploads = 0;
    const downloads: string[] = [];
    vi.stubGlobal('document', { hidden: false });

    const calls = mockFetch((url) => {
      if (url === `${BASE}/`) return json({ name: 'Bibliothek' });
      if (url.startsWith(`${BASE}/dir/?p=`)) {
        const path = repoPathFromUrl(url);
        if (path === CONN.path) return json([]);
        return json(dirs[path] ?? []);
      }
      if (url.startsWith(`${BASE}/file/?p=`)) {
        const path = repoPathFromUrl(url);
        downloads.push(path);
        return json(
          `https://files.tld/seafhttp/files/${encodeURIComponent(path)}`,
        );
      }
      if (url.startsWith('https://files.tld/seafhttp/files/')) {
        const path = decodeURIComponent(
          url.slice('https://files.tld/seafhttp/files/'.length),
        );
        const relative = path.slice(`${CONN.path}/`.length);
        const bytes = remoteFiles[relative];
        if (!bytes) return new Response('not found', { status: 404 });
        return new Response(
          bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
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
      throw new Error(`Unerwartete Anfrage: ${url}`);
    });

    await pollOnce();

    expect(state.project?.tasks.map((task) => task.id)).toEqual(['T0', 'T1']);
    expect(state.project?.tasks[1]?.name).toBe('Vom anderen Gerät');
    /* Unveränderte task.json bleibt lokal, nur die neue wird geladen. */
    expect(downloads).toContain(newTaskPath);
    /* Anhänge einer geänderten Aufgabe werden über die task.json gefunden. */
    expect(downloads).toContain(newDocPath);
    expect(downloads).not.toContain(unchangedTaskPath);
    /* Aufgabenordner werden nicht mehr einzeln gelistet (kein 404-Lärm). */
    const taskDirCalls = calls.filter((call) => {
      if (!call.url.includes('/dir/?p=')) return false;
      const path = repoPathFromUrl(call.url);
      return /\/tasks\/[A-Za-z0-9]{8}$/.test(path);
    });
    expect(taskDirCalls).toEqual([]);
    /* Reiner Serverstand: lokal wurde nichts geändert, also nicht zurückschreiben. */
    expect(uploads).toBe(0);

    /* Ein weiterer Poll ohne Serveränderung darf ebenfalls nichts hochladen. */
    await pollOnce();
    expect(uploads).toBe(0);

    /* Nur project.json ändert sich: Der unveränderte Aufgabenordner wird über
       seine Objekt-ID erkannt und nicht erneut durchgelistet. */
    const touched: Project = {
      ...remote,
      updatedAt: '2026-02-03T10:00:00.000Z',
    };
    remoteFiles = buildProjectFiles(touched, { includeServer: false });
    dirs[rootPath] = [
      { type: 'file', name: 'project.json', size: 456, mtime: 1800000100 },
      { type: 'dir', name: 'tasks', id: 'tasks-1' },
    ];
    const beforeTouch = downloads.length;

    await pollOnce();

    expect(state.project?.updatedAt).toBe('2026-02-03T10:00:00.000Z');
    expect(downloads.slice(beforeTouch)).toEqual([projectPath]);
    expect(uploads).toBe(0);

    /* Löschung auf dem anderen Gerät: Tombstone kommt über project.json. */
    const deletion: Project = {
      ...touched,
      updatedAt: '2099-01-01T00:00:00.000Z',
      tasks: [],
      deletedTasks: [
        { id: 'T0', deletedAt: '2099-01-01T00:00:00.000Z' },
        { id: 'T1', deletedAt: '2099-01-01T00:00:00.000Z' },
      ],
    };
    remoteFiles = buildProjectFiles(deletion, { includeServer: false });
    dirs[rootPath] = [
      { type: 'file', name: 'project.json', size: 456, mtime: 1800000200 },
    ];
    delete dirs[`${rootPath}/tasks`];
    delete dirs[`${rootPath}/tasks/T0`];
    delete dirs[`${rootPath}/tasks/T1`];

    await pollOnce();

    expect(state.project?.tasks).toEqual([]);
    expect(state.project?.deletedTasks?.map((ref) => ref.id)).toEqual([
      'T0',
      'T1',
    ]);
    expect(uploads).toBe(0);
  });
});

describe('Freigabe ohne lokales Projekt', () => {
  it('lädt den Serverstand direkt vom Server', async () => {
    stubLocalStorage();
    const remote = makeProject();
    const access: ServerAccess = {
      type: 'ldc-server-access',
      version: 1,
      projectId: remote.id,
      url: CONN.url,
      repoId: CONN.repoId,
      path: CONN.path,
      token: 'secret',
      createdAt: '2026-02-01T10:00:00.000Z',
    };
    const projectPath = `${CONN.path}/LDC-Projekt-ABCD1234/project.json`;
    const remoteBytes = buildProjectFiles(remote, { includeServer: false })[
      'LDC-Projekt-ABCD1234/project.json'
    ];
    const downloadUrl = 'https://files.tld/seafhttp/files/project.json';

    mockFetch((url) => {
      if (url === `${BASE}/`) return json({ name: 'Bibliothek' });
      if (url.startsWith(`${BASE}/dir/?p=`)) {
        return json([{ type: 'file', name: 'project.json' }]);
      }
      if (url === `${BASE}/file/?p=${encodeURIComponent(projectPath)}`) {
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
      throw new Error(`Unerwartete Anfrage: ${url}`);
    });

    const result = await loadSharedProject(access);

    expect(result.ok).toBe(true);
    expect(result.project?.id).toBe(remote.id);
    expect(result.project?.name).toBe(remote.name);
    expect(result.project?.server).toMatchObject({
      url: CONN.url,
      repoId: CONN.repoId,
      path: CONN.path,
    });
    expect(readServerToken(access)).toBe('secret');
  });
});
