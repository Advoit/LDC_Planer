/* ── Thumbnails: 60×60, quadratisch, mittig zugeschnitten (Canvas) ── */

const THUMB_SIZE = 60;

export async function generateThumbnail(dataUrl: string): Promise<string> {
  const img = await loadImage(dataUrl);
  const size = THUMB_SIZE;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;

  /* Mittig zuschneiden */
  const scale = Math.max(size / img.width, size / img.height);
  const w = size / scale;
  const h = size / scale;
  const sx = (img.width - w) / 2;
  const sy = (img.height - h) / 2;

  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, w, h, 0, 0, size, size);
  return canvas.toDataURL('image/png');
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Bild konnte nicht geladen werden.'));
    img.src = src;
  });
}