/* ── Dokument-Vorschau: PDF, Bilder und Textdokumente im Modal ── */

import { el, icon, downloadDataUrl } from './dom';
import { openModal } from './modal';
import type { ProjectDocument } from '../domain/types';

const MAX_TEXT_CHARS = 200_000;

/** Öffnet eine Vorschau für ein Dokument (PDF/Bild/Text – sonst Download-Hinweis). */
export function openDocumentPreview(doc: ProjectDocument): void {
  const content = el('div', { class: 'document-preview' });
  const mime = doc.mime.toLowerCase();

  if (mime.startsWith('image/')) {
    content.appendChild(
      el('img', {
        class: 'doc-preview-img',
        src: doc.dataUrl,
        alt: doc.name,
      }),
    );
  } else if (mime === 'application/pdf') {
    content.appendChild(
      el('iframe', {
        class: 'doc-preview-frame',
        src: doc.dataUrl,
        title: doc.name,
      }),
    );
  } else if (isTextMime(mime)) {
    const text = decodeTextDataUrl(doc.dataUrl);
    const shown = text.length > MAX_TEXT_CHARS ? `${text.slice(0, MAX_TEXT_CHARS)}\n… (gekürzt)` : text;
    content.appendChild(el('pre', { class: 'doc-preview-text' }, [shown]));
  } else {
    content.appendChild(
      el('div', { class: 'doc-preview-unavailable' }, [
        el('div', { class: 'doc-preview-icon' }, [icon('file')]),
        el('p', {}, ['Für dieses Format ist keine Vorschau verfügbar.']),
        el('p', { class: 'doc-preview-mime' }, [doc.mime]),
      ]),
    );
  }

  const handle = openModal({
    title: doc.name,
    content,
    wide: true,
    actions: [
      {
        label: 'Zurück',
        kind: 'secondary',
        onClick: () => handle.close(),
      },
      {
        label: 'Herunterladen',
        kind: 'primary',
        onClick: () => {
          downloadDataUrl(doc.dataUrl, doc.name);
        },
      },
    ],
  });
}

function isTextMime(mime: string): boolean {
  return (
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    mime === 'application/xml' ||
    mime === 'application/javascript' ||
    mime === 'application/x-javascript' ||
    mime.includes('csv')
  );
}

function decodeTextDataUrl(dataUrl: string): string {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx < 0) return '';
  const meta = dataUrl.slice(0, commaIdx);
  const payload = dataUrl.slice(commaIdx + 1);
  let bytes: Uint8Array;
  if (meta.includes(';base64')) {
    const bin = atob(payload);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } else {
    bytes = new TextEncoder().encode(decodeURIComponent(payload));
  }
  return new TextDecoder().decode(bytes);
}
