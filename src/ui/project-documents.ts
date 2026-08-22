/* ── Projektbezogene Unterlagen: Modal zum Verwalten (Upload/Download/Löschen) ── */

import { openModal } from './modal';
import { createDocumentUploader } from './document-upload';
import type { Project, ProjectDocument } from '../domain/types';

/**
 * Öffnet das Unterlagen-Modal. Löst mit dem neuen Dokumenten-Array auf
 * oder mit null, wenn abgebrochen wurde.
 */
export function openProjectDocumentsModal(
  project: Project,
): Promise<ProjectDocument[] | null> {
  const uploader = createDocumentUploader({
    documents: project.documents ?? [],
    label: 'Projektbezogene Unterlagen',
    hint: 'Pläne, Skizzen, Genehmigungen und weitere allgemeine Dateien zum Projekt.',
  });

  return new Promise((resolve) => {
    const handle = openModal({
      title: 'Unterlagen',
      content: uploader.element,
      actions: [
        {
          label: 'Abbrechen',
          kind: 'secondary',
          onClick: () => {
            handle.close();
            resolve(null);
          },
        },
        {
          label: 'Speichern',
          kind: 'primary',
          onClick: () => {
            handle.close();
            resolve(uploader.getDocuments());
          },
        },
      ],
      onClose: () => resolve(null),
    });
  });
}
