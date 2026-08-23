/* ── Bilder-Upload mit Vorschau-Grid & Thumbnail-Picker ── */

import { el, icon } from './dom';
import { openImageViewer } from './image-viewer';
import { generateThumbnail } from './thumbnail';
import { sha256Hex } from '../core/hash';
import { randomId } from '../core/id';
import type { TaskImage } from '../domain/types';

interface ImageEntry {
  image: TaskImage;
  element: HTMLElement;
}

export interface ImageUploadOptions {
  images: TaskImage[];
  thumbnailSourceId: string | null;
  /** Bei true wird der Thumbnail-Picker eingeblendet (für Aufgabenerstellung/-bearb.) */
  showThumbnailPicker?: boolean;
  /** Bei false wird kein Thumbnail-Picker angezeigt (Status-Bearb.) */
  label?: string;
}

export interface ImageUploadHandle {
  element: HTMLElement;
  getImages(): TaskImage[];
  getThumbnail(): string | null;
  getThumbnailSourceId(): string | null;
}

export function createImageUploader(opts: ImageUploadOptions): ImageUploadHandle {
  const entries: ImageEntry[] = [];
  let thumbnailSourceId = opts.thumbnailSourceId;
  let thumbnailDataUrl: string | null = null;

  const container = el('div', { class: 'image-upload' });

  /* Label */
  if (opts.label) {
    container.appendChild(el('label', { class: 'field-label' }, [opts.label]));
  }

  /* Grid */
  const grid = el('div', { class: 'image-grid' });
  container.appendChild(grid);

  /* Add Button */
  const addBtn = el('button', { class: 'btn btn-secondary btn-sm', type: 'button' }, [
    icon('image'), ' Bild', opts.images.length > 0 ? 'er' : '', ' hinzufügen',
  ]);
  addBtn.addEventListener('click', () => pickAndAddImages());
  container.appendChild(addBtn);

  container.appendChild(
    el('span', { class: 'drop-hint' }, ['… oder Bilder hierher ziehen']),
  );

  /* Bestand laden */
  for (const img of opts.images) {
    addImageToList(img);
  }
  if (!thumbnailSourceId && opts.images.length > 0 && opts.showThumbnailPicker !== false) {
    thumbnailSourceId = opts.images[0].id;
    const firstRadio = entries[0]?.element.querySelector<HTMLInputElement>('.thumb-radio');
    if (firstRadio) firstRadio.checked = true;
  }

  void regenerateOnBoot();

  /* ── Drag & Drop ── */
  let dragDepth = 0;
  container.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragDepth++;
    container.classList.add('drag-over');
  });
  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  });
  container.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) container.classList.remove('drag-over');
  });
  container.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    container.classList.remove('drag-over');
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) void addFiles(files);
  });
  container.addEventListener('dragend', () => {
    dragDepth = 0;
    container.classList.remove('drag-over');
  });

  /* ── Helpers ── */

  function pickAndAddImages(): void {
    const input = el('input', { type: 'file', accept: 'image/*', multiple: 'true' });
    input.addEventListener('change', () => {
      const files = input.files;
      if (files) void addFiles(files);
    });
    input.click();
  }

  async function addFiles(files: FileList | File[]): Promise<void> {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith('image/')) continue;
      const dataUrl = await fileToDataUrl(file);
      const arrayBuffer = await file.arrayBuffer();
      const hash = await sha256Hex(arrayBuffer);
      const img: TaskImage = { id: randomId(), dataUrl, hash };
      await addImageToList(img);
    }
    /* Auto-select first as thumbnail if none selected */
    if (opts.showThumbnailPicker !== false && !thumbnailSourceId && entries.length > 0) {
      const first = entries[0];
      thumbnailSourceId = first.image.id;
      first.element.querySelector<HTMLInputElement>('.thumb-radio')!.checked = true;
      thumbnailDataUrl = await generateThumbnail(first.image.dataUrl);
    }
  }

  async function addImageToList(img: TaskImage): Promise<void> {
    const showPicker = opts.showThumbnailPicker !== false;

    const preview = el('img', { src: img.dataUrl, class: 'image-preview' });
    preview.addEventListener('click', () => {
      openImageViewer(img.dataUrl);
    });

    const card = el('div', { class: 'image-card' }, [preview]);

    if (showPicker) {
      const radio = el('input', {
        type: 'radio',
        name: 'thumbnail-picker',
        class: 'thumb-radio',
      }) as HTMLInputElement;
      radio.value = img.id;
      /* Beim Bearbeiten gespeicherte Vorschau-Auswahl wiederherstellen */
      if (thumbnailSourceId === img.id) radio.checked = true;
      radio.addEventListener('change', async () => {
        thumbnailSourceId = img.id;
        thumbnailDataUrl = await generateThumbnail(img.dataUrl);
      });
      const label = el('label', { class: 'thumb-label' }, [radio, ' Vorschau']);
      card.appendChild(label);
    }

    const delBtn = el('button', {
      class: 'icon-btn image-del-btn',
      type: 'button',
      'aria-label': 'Bild entfernen',
      title: 'Bild entfernen',
    }, [icon('x')]);
    delBtn.addEventListener('click', () => {
      const idx = entries.findIndex((e) => e.element === card);
      if (idx >= 0) {
        const removed = entries.splice(idx, 1)[0];
        /* Wenn thumbnailSource dieser war → nächsten oder keinen wählen */
        if (thumbnailSourceId === removed.image.id) {
          if (entries.length > 0) {
            thumbnailSourceId = entries[0].image.id;
            entries[0].element.querySelector<HTMLInputElement>('.thumb-radio')!.checked = true;
            generateThumbnail(entries[0].image.dataUrl).then((t) => (thumbnailDataUrl = t));
          } else {
            thumbnailSourceId = null;
            thumbnailDataUrl = null;
          }
        }
        card.remove();
      }
    });
    card.appendChild(delBtn);
    grid.appendChild(card);
    entries.push({ image: img, element: card });
  }

  async function regenerateOnBoot(): Promise<void> {
    /* Vorschaubild beim Bearbeiten aus dem gespeicherten Quellbild neu erzeugen */
    if (!thumbnailSourceId || opts.showThumbnailPicker === false) return;
    const entry = entries.find((e) => e.image.id === thumbnailSourceId);
    if (entry) {
      thumbnailDataUrl = await generateThumbnail(entry.image.dataUrl);
    }
  }

  return {
    element: container,
    getImages: () => entries.map((e) => e.image),
    getThumbnail: () => thumbnailDataUrl,
    getThumbnailSourceId: () => thumbnailSourceId,
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
