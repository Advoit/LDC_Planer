/* ── Bilder: Verkleinern und Komprimieren vor dem Speichern ── */

/** Ab dieser Dateigröße werden Bilder vor dem Speichern verkleinert. */
const MAX_DIRECT_BYTES = 350 * 1024;
/** Längste Bildkante nach dem Verkleinern. */
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;

/** Skaliert Breite/Höhe proportional, sodass die längste Kante `maxDimension` hat. */
export function fitDimensions(
  width: number,
  height: number,
  maxDimension: number = MAX_DIMENSION,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxDimension || longest === 0) {
    return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
  }
  const scale = maxDimension / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Bild konnte nicht geladen werden.'));
    img.src = src;
  });
}

/**
 * Liest ein Bild ein und verkleinert es bei Bedarf (längste Kante 1600 px).
 * PNG/GIF bleiben PNG (Transparenz), alles andere wird als JPEG gespeichert.
 * Schlägt die Komprimierung fehl, wird das Original zurückgegeben.
 */
export async function compressImageFile(file: File): Promise<string> {
  const original = await readFileAsDataUrl(file);
  if (file.size <= MAX_DIRECT_BYTES) return original;

  try {
    const img = await loadImage(original);
    const size = fitDimensions(img.naturalWidth, img.naturalHeight);

    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return original;

    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, size.width, size.height);

    const keepPng = file.type === 'image/png' || file.type === 'image/gif';
    const compressed = keepPng
      ? canvas.toDataURL('image/png')
      : canvas.toDataURL('image/jpeg', JPEG_QUALITY);

    /* Nur übernehmen, wenn es tatsächlich kleiner wird */
    return compressed.length < original.length ? compressed : original;
  } catch {
    return original;
  }
}

/**
 * Komprimiert eine bereits vorliegende dataURL (z. B. Fotos aus der Kamera),
 * sofern sie größer als die direkte Grenze ist.
 */
export async function compressDataUrl(dataUrl: string): Promise<string> {
  if (dataUrl.length <= MAX_DIRECT_BYTES) return dataUrl;
  try {
    const img = await loadImage(dataUrl);
    const size = fitDimensions(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, size.width, size.height);
    const jpeg = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    return jpeg.length < dataUrl.length ? jpeg : dataUrl;
  } catch {
    return dataUrl;
  }
}
