/* ── Dokument-Upload: Liste mit Upload, Download & Löschen ── */

import { el, icon, downloadDataUrl, formatFileSize } from './dom';
import { sha256Hex } from '../core/hash';
import { randomId } from '../core/id';
import type { ProjectDocument } from '../domain/types';

interface DocEntry {
  doc: ProjectDocument;
  element: HTMLElement;
}

export interface DocumentUploadOptions {
  documents: ProjectDocument[];
  label: string;
  hint?: string;
}

export interface DocumentUploadHandle {
  element: HTMLElement;
  getDocuments(): ProjectDocument[];
}

export function createDocumentUploader(
  opts: DocumentUploadOptions,
): DocumentUploadHandle {
  const entries: DocEntry[] = [];

  const container = el('div', { class: 'document-upload' });
  if (opts.label) {
    container.appendChild(el('label', { class: 'field-label' }, [opts.label]));
  }

  const list = el('div', { class: 'document-list' });
  container.appendChild(list);

  const addBtn = el('button', { class: 'btn btn-secondary btn-sm', type: 'button' }, [
    icon('paperclip'),
    ' Dokument',
    opts.documents.length > 0 ? 'er' : '',
    ' hinzufügen',
  ]);
  addBtn.addEventListener('click', () => pickAndAddDocuments());
  container.appendChild(addBtn);

  if (opts.hint) {
    container.appendChild(
      el('p', { class: 'field-hint' }, [opts.hint]),
    );
  }

  /* Bestand laden */
  for (const doc of opts.documents) {
    addRow(doc);
  }

  function pickAndAddDocuments(): void {
    const input = el('input', { type: 'file', multiple: 'true' });
    input.addEventListener('change', async () => {
      const files = input.files;
      if (!files) return;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const dataUrl = await fileToDataUrl(file);
        const hash = await sha256Hex(await file.arrayBuffer());
        addRow({
          id: randomId(),
          name: file.name,
          mime: file.type || 'application/octet-stream',
          size: file.size,
          dataUrl,
          hash,
        });
      }
    });
    input.click();
  }

  function addRow(doc: ProjectDocument): void {
    const row = el('div', { class: 'document-row' }, [
      el('span', { class: 'document-icon' }, [icon('file')]),
      el('span', { class: 'document-name', title: doc.name }, [doc.name]),
      el('span', { class: 'document-size' }, [formatFileSize(doc.size)]),
    ]);

    const downloadBtn = el('button', {
      class: 'icon-btn document-action',
      type: 'button',
      title: 'Herunterladen',
      'aria-label': `Herunterladen: ${doc.name}`,
    }, [icon('download')]);
    downloadBtn.addEventListener('click', () => {
      downloadDataUrl(doc.dataUrl, doc.name);
    });

    const delBtn = el('button', {
      class: 'icon-btn document-action document-del',
      type: 'button',
      title: 'Entfernen',
      'aria-label': `Entfernen: ${doc.name}`,
    }, [icon('trash')]);
    delBtn.addEventListener('click', () => {
      const idx = entries.findIndex((e) => e.element === row);
      if (idx >= 0) entries.splice(idx, 1);
      row.remove();
    });

    row.appendChild(downloadBtn);
    row.appendChild(delBtn);
    list.appendChild(row);
    entries.push({ doc, element: row });
  }

  return {
    element: container,
    getDocuments: () => entries.map((e) => e.doc),
  };
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden.'));
    reader.readAsDataURL(file);
  });
}
