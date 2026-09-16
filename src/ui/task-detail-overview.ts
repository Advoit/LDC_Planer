/* ── Aufgaben-Detail: read-only Übersicht der Erstellungsfelder ── */

import { el, formatDateTime, formatFileSize } from './dom';
import { openImageViewer } from './image-viewer';
import { openDocumentPreview } from './document-preview';
import { TASK_TYP_LABELS } from '../domain/types';
import type { Task } from '../domain/types';

/** Beschreibung, Klassifizierung, Material, Dokumente und Vorher-Bilder. */
export function buildTaskOverview(task: Task): HTMLElement {
  const wrap = el('div', {});

  const mangelMeta: string[] = [];
  if (task.typ) mangelMeta.push(`Typ: ${TASK_TYP_LABELS[task.typ]}`);
  if (task.art) mangelMeta.push(`Art: ${task.art}`);
  if (task.position) mangelMeta.push(`Position: ${task.position}`);
  if (task.pruefung) mangelMeta.push(`Prüfung: ${task.pruefung}`);

  wrap.appendChild(
    el('div', { class: 'detail-section' }, [
      el('h3', { class: 'detail-task-name' }, [task.name]),
      el('p', { class: 'detail-meta' }, [formatDateTime(task.createdAt)]),
      el('h4', { class: 'detail-label' }, ['Aufgabenbeschreibung']),
      /* Genauso lesbar wie die Aufgabenbeschreibung (nicht mehr als Kleintext) */
      task.description
        ? el('p', { class: 'detail-desc' }, [task.description])
        : el('p', { class: 'detail-desc detail-desc-empty' }, ['–']),
      mangelMeta.length > 0
        ? el('p', { class: 'detail-meta' }, [mangelMeta.join('  ·  ')])
        : el('div'),
      task.fehlerbeschreibung
        ? el('div', {}, [
            el('h4', { class: 'detail-label' }, ['Fehlerbeschreibung']),
            el('p', { class: 'detail-desc' }, [task.fehlerbeschreibung]),
          ])
        : el('div'),
      task.plannedWork
        ? el('p', { class: 'detail-meta' }, [`Geplanter Aufwand: ${task.plannedWork}`])
        : el('div'),
      el('p', { class: 'detail-meta' }, [
        `Personalbedarf: ${task.personnel ?? 1} ${(task.personnel ?? 1) === 1 ? 'Person' : 'Personen'}`,
      ]),
    ]),
  );

  /* Material (read-only) */
  if (task.material.length > 0) {
    const matList = el('ul', { class: 'detail-material' });
    for (const item of task.material) {
      matList.appendChild(el('li', {}, [`${item.name} – ${item.quantity} ${item.unit}`]));
    }
    wrap.appendChild(
      el('div', { class: 'detail-section' }, [el('h4', {}, ['Material']), matList]),
    );
  }

  /* Dokumente (read-only) */
  const documents = task.documents ?? [];
  if (documents.length > 0) {
    const docList = el('div', { class: 'detail-doc-list' });
    for (const doc of documents) {
      const row = el('div', { class: 'detail-doc-row' }, [
        el('span', { class: 'detail-doc-name' }, [doc.name]),
        el('span', { class: 'detail-doc-size' }, [formatFileSize(doc.size)]),
        el('button', { class: 'btn btn-secondary btn-sm', type: 'button' }, ['Öffnen']),
      ]);
      row.querySelector('button')!.addEventListener('click', () => {
        openDocumentPreview(doc);
      });
      docList.appendChild(row);
    }
    wrap.appendChild(
      el('div', { class: 'detail-section' }, [el('h4', {}, ['Dokumente']), docList]),
    );
  }

  /* Vorher-Bilder */
  if (task.images.length > 0) {
    const imgGrid = el('div', { class: 'detail-image-grid' });
    for (const img of task.images) {
      const thumb = el('img', { src: img.dataUrl, class: 'detail-img' });
      thumb.addEventListener('click', () => openImageViewer(img.dataUrl));
      imgGrid.appendChild(thumb);
    }
    wrap.appendChild(
      el('div', { class: 'detail-section' }, [el('h4', {}, ['Vorher-Bilder']), imgGrid]),
    );
  }

  return wrap;
}
