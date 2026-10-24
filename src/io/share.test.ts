import { describe, expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import {
  accessFileName,
  applyServerAccess,
  buildShareZip,
  createServerAccess,
  decryptServerAccess,
  encryptedAccessFileName,
  isEncryptedServerAccess,
  normalizeServerAccess,
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
  it('baut eine Freigabe-ZIP nur mit Zugangsdatei und liest sie wieder ein', async () => {
    const project = makeProject();
    const access = createServerAccess(project, project.server!, ' secret ');
    expect(access).not.toBeNull();
    expect(access!.token).toBe('secret');

    const zip = await buildShareZip(project.id, access!);
    /* Keine Projektdateien – nur der Server-Zugang. */
    expect(Object.keys(unzipSync(zip))).toEqual([accessFileName(project.id)]);

    const parsed = await parseProjectZipDetailed(toArrayBuffer(zip));

    expect(parsed.project).toBeNull();
    expect(parsed.access).toEqual(access);
    expect(parsed.encryptedAccess).toBeNull();
    expect(parsed.access!.path).toBe('/Bauprojekte/Haus 1');
    expect(parsed.access!.url).toBe('https://cloud.example.com');
  });

  it('verschlüsselt die Zugangsdatei optional mit einem Passwort', async () => {
    const project = makeProject();
    const access = createServerAccess(project, project.server!, 'secret')!;

    const zip = await buildShareZip(project.id, access, 'sicheres-passwort');
    const files = unzipSync(zip);
    expect(Object.keys(files)).toEqual([encryptedAccessFileName(project.id)]);

    const raw = new TextDecoder().decode(
      files[encryptedAccessFileName(project.id)],
    );
    expect(raw).not.toContain('secret');
    const envelope = JSON.parse(raw) as unknown;
    expect(isEncryptedServerAccess(envelope)).toBe(true);

    const parsed = await parseProjectZipDetailed(toArrayBuffer(zip));
    expect(parsed.project).toBeNull();
    expect(parsed.access).toBeNull();
    expect(parsed.encryptedAccess).not.toBeNull();

    const decrypted = await decryptServerAccess(
      parsed.encryptedAccess!,
      'sicheres-passwort',
    );
    expect(decrypted).toEqual(access);
    expect(
      await decryptServerAccess(parsed.encryptedAccess!, 'falsches-passwort'),
    ).toBeNull();

    /* Manipulierte Nutzdaten dürfen nicht entschlüsselt werden. */
    const tampered = {
      ...parsed.encryptedAccess!,
      data: `${parsed.encryptedAccess!.data.slice(0, -4)}AAAA`,
    };
    expect(
      await decryptServerAccess(tampered, 'sicheres-passwort'),
    ).toBeNull();
  });

  it('lehnt zu kurze Passwörter ab', async () => {
    const project = makeProject();
    const access = createServerAccess(project, project.server!, 'secret')!;

    await expect(buildShareZip(project.id, access, 'kurz')).rejects.toThrow(
      'mindestens',
    );
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
    expect(encryptedAccessFileName('PROJ/5678')).toBe(
      'LDC-Zugang-PROJ_5678.json.enc',
    );
  });
});
