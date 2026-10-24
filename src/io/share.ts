/* ── Projekt teilen: Freigabe-ZIP mit Zugangsdatei und optionalem Passwort ── */

import { strToU8, zipSync } from 'fflate';
import { exportBaseName } from '../core/file-name';
import { saveServerToken } from '../core/seafile';
import { normalizeServerPath, safeNamePart } from '../domain/server';
import type { Project, ProjectServer } from '../domain/types';

/** Inhalt der Zugangsdatei – enthält bewusst den API-Token. */
export interface ServerAccess {
  type: 'ldc-server-access';
  version: 1;
  projectId: string;
  url: string;
  repoId: string;
  path: string;
  linkStyle?: 'lib' | 'library';
  token: string;
  createdAt: string;
}

/** Verschlüsselte Hülle der Zugangsdatei innerhalb der Freigabe-ZIP. */
export interface EncryptedServerAccess {
  type: 'ldc-server-access-encrypted';
  version: 1;
  projectId: string;
  /** PBKDF2-Iterationen – beim Entschlüsseln auf einen sicheren Bereich begrenzt. */
  iterations: number;
  salt: string;
  iv: string;
  data: string;
}

export const SHARE_PASSWORD_MIN_LENGTH = 8;

const PBKDF2_ITERATIONS = 600_000;
const PBKDF2_MIN_ITERATIONS = 100_000;
const PBKDF2_MAX_ITERATIONS = 1_000_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const MAX_DATA_BASE64_LENGTH = 5_000_000;

/** Dateiname der Zugangsdatei innerhalb der Freigabe-ZIP. */
export function accessFileName(projectId: string): string {
  return `LDC-Zugang-${safeNamePart(projectId)}.json`;
}

/** Dateiname der verschlüsselten Zugangsdatei innerhalb der Freigabe-ZIP. */
export function encryptedAccessFileName(projectId: string): string {
  return `${accessFileName(projectId)}.enc`;
}

/** Dateiname für den lokalen Download der Freigabe-ZIP. */
export function shareZipDownloadName(project: Project): string {
  return `${exportBaseName(project.name, project.id)}-Freigabe.zip`;
}

/** Baut die Zugangsdaten aus der Verknüpfung und dem lokalen Token. */
export function createServerAccess(
  project: Project,
  server: ProjectServer,
  token: string,
): ServerAccess | null {
  const cleanToken = token.trim();
  if (!cleanToken) return null;
  if (!/^https?:\/\//i.test(server.url) || !server.repoId.trim()) return null;
  const normalizedPath = normalizeServerPath(server.path);
  if (normalizedPath.error) return null;
  return {
    type: 'ldc-server-access',
    version: 1,
    projectId: project.id,
    url: server.url.replace(/\/+$/, ''),
    repoId: server.repoId,
    path: normalizedPath.path,
    ...(server.linkStyle ? { linkStyle: server.linkStyle } : {}),
    token: cleanToken,
    createdAt: new Date().toISOString(),
  };
}

/* ── Verschlüsselung ── */

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + chunkSize)));
  }
  return btoa(chunks.join(''));
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function bufferOf(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function shareAad(projectId: string): ArrayBuffer {
  return bufferOf(
    new TextEncoder().encode(`ldc-share-access|1|${projectId}`),
  );
}

async function deriveShareKey(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: bufferOf(salt),
      iterations,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Verschlüsselt die Zugangsdaten mit AES-256-GCM. Der Schlüssel wird per
 * PBKDF2-SHA-256 aus dem Passwort abgeleitet; Salt und IV sind zufällig.
 */
export async function encryptServerAccess(
  access: ServerAccess,
  password: string,
): Promise<EncryptedServerAccess> {
  if (password.length < SHARE_PASSWORD_MIN_LENGTH) {
    throw new Error(
      `Das Passwort muss mindestens ${SHARE_PASSWORD_MIN_LENGTH} Zeichen haben.`,
    );
  }
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveShareKey(password, salt, PBKDF2_ITERATIONS);
  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: bufferOf(iv),
      additionalData: shareAad(access.projectId),
    },
    key,
    bufferOf(new TextEncoder().encode(JSON.stringify(access))),
  );

  return {
    type: 'ldc-server-access-encrypted',
    version: 1,
    projectId: access.projectId,
    iterations: PBKDF2_ITERATIONS,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(encrypted)),
  };
}

/** Prüft die Form einer verschlüsselten Zugangsdatei (ohne Entschlüsselung). */
export function isEncryptedServerAccess(
  value: unknown,
): value is EncryptedServerAccess {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Partial<EncryptedServerAccess>;
  return (
    entry.type === 'ldc-server-access-encrypted' &&
    entry.version === 1 &&
    typeof entry.projectId === 'string' &&
    entry.projectId.length > 0 &&
    typeof entry.iterations === 'number' &&
    Number.isInteger(entry.iterations) &&
    entry.iterations >= PBKDF2_MIN_ITERATIONS &&
    entry.iterations <= PBKDF2_MAX_ITERATIONS &&
    typeof entry.salt === 'string' &&
    entry.salt.length > 0 &&
    entry.salt.length <= 64 &&
    typeof entry.iv === 'string' &&
    entry.iv.length > 0 &&
    entry.iv.length <= 64 &&
    typeof entry.data === 'string' &&
    entry.data.length > 0 &&
    entry.data.length <= MAX_DATA_BASE64_LENGTH
  );
}

/**
 * Entschlüsselt eine Zugangsdatei. Gibt bei falschem Passwort oder
 * beschädigten Daten `null` zurück (kein Unterschied nach außen).
 */
export async function decryptServerAccess(
  envelope: EncryptedServerAccess,
  password: string,
): Promise<ServerAccess | null> {
  if (!isEncryptedServerAccess(envelope)) return null;
  try {
    const salt = base64ToBytes(envelope.salt);
    const iv = base64ToBytes(envelope.iv);
    const data = base64ToBytes(envelope.data);
    if (salt.length < SALT_BYTES || iv.length !== IV_BYTES || data.length === 0) {
      return null;
    }

    const key = await deriveShareKey(password, salt, envelope.iterations);
    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: bufferOf(iv),
        additionalData: shareAad(envelope.projectId),
      },
      key,
      bufferOf(data),
    );
    const parsed = JSON.parse(new TextDecoder().decode(decrypted)) as unknown;
    const access = normalizeServerAccess(parsed);
    if (!access || access.projectId !== envelope.projectId) return null;
    return access;
  } catch {
    return null;
  }
}

/* ── ZIP bauen und lesen ── */

/**
 * Baut die Freigabe-ZIP: ausschließlich die Zugangsdatei. Mit Passwort wird
 * sie verschlüsselt abgelegt; Projektdateien werden nie mitgegeben.
 */
export async function buildShareZip(
  projectId: string,
  access: ServerAccess,
  password?: string,
): Promise<Uint8Array> {
  if (password) {
    const envelope = await encryptServerAccess(access, password);
    return zipSync(
      {
        [encryptedAccessFileName(projectId)]: strToU8(
          JSON.stringify(envelope, null, 2),
        ),
      },
      { level: 6 },
    );
  }

  return zipSync(
    {
      [accessFileName(projectId)]: strToU8(JSON.stringify(access, null, 2)),
    },
    { level: 6 },
  );
}

/** Prüft und normalisiert eine gelesene Zugangsdatei. */
export function normalizeServerAccess(raw: unknown): ServerAccess | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const value = raw as Partial<ServerAccess> & { type?: unknown; version?: unknown };
  if (value.type !== 'ldc-server-access' || value.version !== 1) return null;
  if (
    typeof value.projectId !== 'string' ||
    !value.projectId ||
    typeof value.url !== 'string' ||
    !/^https?:\/\//i.test(value.url) ||
    typeof value.repoId !== 'string' ||
    !value.repoId.trim() ||
    typeof value.path !== 'string' ||
    typeof value.token !== 'string' ||
    !value.token.trim()
  ) {
    return null;
  }
  const normalizedPath = normalizeServerPath(value.path);
  if (normalizedPath.error) return null;
  const linkStyle =
    value.linkStyle === 'lib' || value.linkStyle === 'library'
      ? value.linkStyle
      : undefined;
  return {
    type: 'ldc-server-access',
    version: 1,
    projectId: value.projectId,
    url: value.url.replace(/\/+$/, ''),
    repoId: value.repoId,
    path: normalizedPath.path,
    ...(linkStyle ? { linkStyle } : {}),
    token: value.token.trim(),
    createdAt:
      typeof value.createdAt === 'string' ? value.createdAt : new Date().toISOString(),
  };
}

export interface ShareAccessFiles {
  access: ServerAccess | null;
  encrypted: EncryptedServerAccess | null;
}

/** Sucht die (verschlüsselte oder offene) Zugangsdatei in einer entpackten ZIP. */
export function readShareAccessFromFiles(
  files: Map<string, Uint8Array>,
): ShareAccessFiles {
  let access: ServerAccess | null = null;
  let encrypted: EncryptedServerAccess | null = null;

  for (const [path, bytes] of files) {
    if (/(^|\/)LDC-Zugang[^/]*\.json\.enc$/i.test(path) && !encrypted) {
      try {
        const parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
        if (isEncryptedServerAccess(parsed)) encrypted = parsed;
      } catch {
        /* Ungültige verschlüsselte Zugangsdatei ignorieren. */
      }
      continue;
    }

    if (/(^|\/)LDC-Zugang[^/]*\.json$/i.test(path) && !access) {
      try {
        const parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
        const normalized = normalizeServerAccess(parsed);
        if (normalized) access = normalized;
      } catch {
        /* Ungültige Zugangsdatei ignorieren. */
      }
    }
  }

  return { access, encrypted };
}

/** Sucht ausschließlich eine offene Zugangsdatei (Abwärtskompatibilität). */
export function readServerAccessFromFiles(
  files: Map<string, Uint8Array>,
): ServerAccess | null {
  return readShareAccessFromFiles(files).access;
}

/**
 * Übernimmt die Zugangsdaten in ein geladenes Projekt und speichert den Token
 * lokal. Die Zugangsdatei gilt nur für das Projekt, aus dem sie stammt.
 */
export function applyServerAccess(
  project: Project,
  access: ServerAccess,
): { project: Project; applied: boolean } {
  if (access.projectId !== project.id) {
    return { project, applied: false };
  }
  saveServerToken(access, access.token);
  return {
    project: {
      ...project,
      server: {
        url: access.url,
        repoId: access.repoId,
        path: access.path,
        linkedAt: new Date().toISOString(),
        ...(access.linkStyle ? { linkStyle: access.linkStyle } : {}),
      },
    },
    applied: true,
  };
}
