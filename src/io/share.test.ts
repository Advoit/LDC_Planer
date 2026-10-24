import { describe, expect, it } from 'vitest';
import {
  accessFileName,
  applyServerAccess,
  buildShareZip,
  createServerAccess,
  normalizeServerAccess,
  serverShareName,
} from './share';
import { parseProjectZipDetailed } from './import';
import type { Project } from '../domain/types';

function makeProject(): Project {
  return {
    schemaVersion: 1,
    id: 'PROJ5678',
    name: 'Bauprojekt',
    location: 'München',
    description: 'Sanierung',
    createdAt: '2026-02-01T09:00:00.000Z',
    updatedAt: '2026-02-01T10:00:00.000Z',
    tasks: [],
    documents: [],
    server: {
      url: 'https://cloud.example.com/',
      repoId: 'repo-1',
      path: '//Bauprojekte/Haus 1/',
      linkedAt: '2026-02-01T11:00:00.000Z',
      linkStyle: 'library',
    },
  };
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

describe('Projekt teilen', () => {
  it('baut eine Freigabe-ZIP mit Zugangsdatei und liest sie wieder ein', async () => {
    const project = makeProject();
    const access = createServerAccess(project, project.server!, ' secret ');
    expect(access).not.toBeNull();
    expect(access!.token).toBe('secret');

    const parsed = await parseProjectZipDetailed(
      toArrayBuffer(buildShareZip(project, access!)),
    );

    expect(parsed.project).not.toBeNull();
    expect(parsed.project!.id).toBe('PROJ5678');
    expect(parsed.access).toEqual(access);
    expect(parsed.access!.path).toBe('/Bauprojekte/Haus 1');
    expect(parsed.access!.url).toBe('https://cloud.example.com');
  });

  it('übernimmt den Server-Zugang in ein geladenes Projekt', () => {
    const project = makeProject();
    const access = createServerAccess(project, project.server!, 'secret')!;
    const loaded: Project = { ...project, server: undefined };

    const applied = applyServerAccess(loaded, access);

    expect(applied.applied).toBe(true);
    expect(applied.project.server).toMatchObject({
      url: 'https://cloud.example.com',
      repoId: 'repo-1',
      path: '/Bauprojekte/Haus 1',
      linkStyle: 'library',
    });
    expect(applied.project.server!.linkedAt).toBeTruthy();
  });

  it('ignoriert eine Zugangsdatei für ein anderes Projekt', () => {
    const project = makeProject();
    const access = createServerAccess(project, project.server!, 'secret')!;

    const applied = applyServerAccess(
      { ...project, id: 'ANDERES1', server: undefined },
      access,
    );

    expect(applied.applied).toBe(false);
    expect(applied.project.server).toBeUndefined();
  });

  it('lehnt unvollständige oder unsichere Zugangsdaten ab', () => {
    expect(normalizeServerAccess({ type: 'ldc-server-access', version: 1 })).toBeNull();
    expect(
      normalizeServerAccess({
        type: 'ldc-server-access',
        version: 1,
        projectId: 'P1',
        url: 'https://cloud.example.com',
        repoId: 'repo-1',
        path: '/../../',
        token: 'secret',
      }),
    ).toBeNull();
    expect(createServerAccess(makeProject(), makeProject().server!, '   ')).toBeNull();
  });

  it('vergibt feste, sichere Dateinamen', () => {
    expect(accessFileName('PROJ/5678')).toBe('LDC-Zugang-PROJ_5678.json');
    expect(serverShareName('PROJ/5678')).toBe('LDC-Freigabe-PROJ_5678.zip');
  });
});
