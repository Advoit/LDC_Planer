/* ── Lightbox: Bild antippen zum Vergrößern (mobile optimiert) ── */

export function openImageViewer(dataUrl: string, caption?: string): void {
  const overlay = document.createElement('div');
  overlay.className = 'lightbox-overlay';

  const img = document.createElement('img');
  img.src = dataUrl;
  img.alt = caption ?? 'Bild';

  overlay.appendChild(img);
  document.body.appendChild(overlay);

  requestAnimationFrame(() => overlay.classList.add('open'));

  const close = () => {
    overlay.classList.remove('open');
    setTimeout(() => overlay.remove(), 250);
  };
  overlay.addEventListener('click', close);
  document.addEventListener('keydown', function onKey(e) {
    if (e.key === 'Escape') {
      document.removeEventListener('keydown', onKey);
      close();
    }
  });
}