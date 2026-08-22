/* ── SHA-256-Hashing via Web Crypto API ── */

export async function sha256Hex(data: ArrayBuffer | string): Promise<string> {
  const buf =
    typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest('SHA-256', buf);
  const bytes = new Uint8Array(digest);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashDataUrl(dataUrl: string): Promise<string> {
  const arrayBuffer = dataUrlToArrayBuffer(dataUrl);
  return sha256Hex(arrayBuffer);
}

function dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer {
  const commaIdx = dataUrl.indexOf(',');
  const b64 = dataUrl.slice(commaIdx + 1);
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}