/* ── Lightbox: Bild vergrößern, zoomen und verschieben ──
 * Zoom per Mausrad (Desktop), Doppelklick, Tastatur oder Schaltflächen;
 * Verschieben durch Ziehen, wenn hineingezoomt wurde. */

import { icon } from './dom';

const MIN_SCALE = 1;
const MAX_SCALE = 6;
/** Schrittweite der Zoom-Schaltflächen/Tastatur. */
const ZOOM_STEP = 1.25;
/** Schrittweite des Mausrads. */
const WHEEL_STEP = 1.12;

export function openImageViewer(dataUrl: string, caption?: string): void {
  let scale = 1;
  let tx = 0;
  let ty = 0;
  let dragging = false;
  let moved = false;
  let startX = 0;
  let startY = 0;
  let originX = 0;
  let originY = 0;

  const img = document.createElement('img');
  img.src = dataUrl;
  img.alt = caption ?? 'Bild';
  img.className = 'lightbox-img';
  img.draggable = false;

  const stage = document.createElement('div');
  stage.className = 'lightbox-stage';
  stage.appendChild(img);

  const percent = document.createElement('span');
  percent.className = 'lightbox-zoom-value';
  percent.textContent = '100 %';

  const toolbar = document.createElement('div');
  toolbar.className = 'lightbox-toolbar';

  const overlay = document.createElement('div');
  overlay.className = 'lightbox-overlay';

  /* ── Darstellung ── */

  function applyTransform(): void {
    img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    percent.textContent = `${Math.round(scale * 100)} %`;
    img.style.cursor = scale > 1 ? (dragging ? 'grabbing' : 'grab') : 'zoom-in';
  }

  /** Hält das Bild im Blick, damit es nicht aus dem Fenster rutscht. */
  function clampPan(): void {
    const rect = img.getBoundingClientRect();
    const width = rect.width / scale;
    const height = rect.height / scale;
    const maxX = Math.max(0, (width * scale - window.innerWidth) / 2);
    const maxY = Math.max(0, (height * scale - window.innerHeight) / 2);
    tx = Math.min(maxX, Math.max(-maxX, tx));
    ty = Math.min(maxY, Math.max(-maxY, ty));
  }

  /** Zoomt um einen Bildpunkt (Viewport-Koordinaten), der stehen bleibt. */
  function zoomAt(clientX: number, clientY: number, factor: number): void {
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor));
    if (next === scale) return;
    /* Unverschobenes Zentrum aus dem transformierten Rechteck zurückrechnen */
    const rect = img.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2 - tx;
    const centerY = rect.top + rect.height / 2 - ty;
    const ratio = next / scale;
    tx = clientX - centerX - ratio * (clientX - centerX - tx);
    ty = clientY - centerY - ratio * (clientY - centerY - ty);
    scale = next;
    if (scale === MIN_SCALE) {
      tx = 0;
      ty = 0;
    } else {
      clampPan();
    }
    applyTransform();
  }

  function zoomCenter(factor: number): void {
    zoomAt(window.innerWidth / 2, window.innerHeight / 2, factor);
  }

  function reset(): void {
    scale = 1;
    tx = 0;
    ty = 0;
    applyTransform();
  }

  function close(): void {
    overlay.classList.remove('open');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => overlay.remove(), 250);
  }

  function button(iconName: string, label: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'icon-btn lightbox-btn';
    btn.title = label;
    btn.setAttribute('aria-label', label);
    btn.appendChild(icon(iconName));
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      onClick();
    });
    return btn;
  }

  toolbar.appendChild(button('zoom-out', 'Verkleinern', () => zoomCenter(1 / ZOOM_STEP)));
  toolbar.appendChild(percent);
  toolbar.appendChild(button('zoom-in', 'Vergrößern', () => zoomCenter(ZOOM_STEP)));
  toolbar.appendChild(button('zoom-reset', 'Ansicht zurücksetzen', reset));
  toolbar.appendChild(button('x', 'Schließen', close));

  overlay.appendChild(toolbar);
  overlay.appendChild(stage);
  document.body.appendChild(overlay);
  applyTransform();
  requestAnimationFrame(() => overlay.classList.add('open'));

  /* ── Mausrad-Zoom (Desktop) ── */
  overlay.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP);
    },
    { passive: false },
  );

  /* ── Ziehen zum Verschieben (nur im gezoomten Zustand) ── */
  img.addEventListener('pointerdown', (event) => {
    if (scale <= MIN_SCALE) return;
    dragging = true;
    moved = false;
    startX = event.clientX;
    startY = event.clientY;
    originX = tx;
    originY = ty;
    img.setPointerCapture(event.pointerId);
    applyTransform();
  });
  img.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    tx = originX + (event.clientX - startX);
    ty = originY + (event.clientY - startY);
    if (Math.abs(event.clientX - startX) > 3 || Math.abs(event.clientY - startY) > 3) {
      moved = true;
    }
    clampPan();
    applyTransform();
  });
  function endDrag(event: PointerEvent): void {
    if (!dragging) return;
    dragging = false;
    try {
      img.releasePointerCapture(event.pointerId);
    } catch {
      /* Aufnahme war bereits beendet */
    }
    applyTransform();
  }
  img.addEventListener('pointerup', endDrag);
  img.addEventListener('pointercancel', endDrag);

  /* ── Doppelklick: hineinzoomen bzw. zurück zur Vollansicht ── */
  img.addEventListener('dblclick', (event) => {
    event.stopPropagation();
    if (scale > MIN_SCALE) reset();
    else zoomAt(event.clientX, event.clientY, 2);
  });

  /* ── Klick auf den Hintergrund schließt (nicht nach dem Ziehen) ── */
  overlay.addEventListener('click', (event) => {
    if (event.target !== overlay && event.target !== stage) return;
    if (!moved) close();
  });

  /* ── Tastatur ── */
  function onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') close();
    else if (event.key === '+' || event.key === '=') zoomCenter(ZOOM_STEP);
    else if (event.key === '-' || event.key === '_') zoomCenter(1 / ZOOM_STEP);
    else if (event.key === '0') reset();
  }
  document.addEventListener('keydown', onKey);
}
