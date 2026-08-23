/* ── PDF-Helfer: A4-Layout mit pdf-lib (offline, lokal) ── */

import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import { dataUrlToBytes } from './export';

export const PAGE_WIDTH = 595.28; // A4 hoch (pt)
export const PAGE_HEIGHT = 841.89;
export const MARGIN = 48;
export const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;

export interface PdfContext {
  doc: PDFDocument;
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
  y: number; // aktuelle Schreibposition von oben (PDF-Koordinaten)
  footer: string;
}

export const COLORS = {
  text: rgb(0.11, 0.11, 0.12),
  secondary: rgb(0.32, 0.32, 0.33),
  tertiary: rgb(0.53, 0.53, 0.55),
  border: rgb(0.9, 0.9, 0.92),
  headerBg: rgb(0.96, 0.96, 0.97),
  blue: rgb(0, 0.48, 1),
  orange: rgb(1, 0.58, 0),
  green: rgb(0.2, 0.78, 0.35),
};

export function statusColor(status: string): ReturnType<typeof rgb> {
  switch (status) {
    case 'offen':
      return COLORS.blue;
    case 'hinweis':
      return COLORS.orange;
    case 'behoben':
      return COLORS.green;
    default:
      return COLORS.secondary;
  }
}

/** Ersetzt Zeichen, die Helvetica/WinAnsi nicht darstellen kann. */
function sanitize(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code <= 0xff || ch === '€') out += ch;
    else out += ' ';
  }
  return out.replace(/\s+/g, ' ').trim();
}

export async function createPdfContext(footer: string): Promise<PdfContext> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  return { doc, page, font, bold, y: PAGE_HEIGHT - MARGIN, footer };
}

/** Wechselt auf eine neue Seite, wenn der Platz nicht mehr reicht. */
export function ensureSpace(ctx: PdfContext, needed: number): void {
  if (ctx.y - needed < MARGIN) {
    ctx.page = ctx.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    ctx.y = PAGE_HEIGHT - MARGIN;
  }
}

function lineHeight(size: number): number {
  return size * 1.35;
}

export function drawText(
  ctx: PdfContext,
  text: string,
  opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; x?: number } = {},
): number {
  const size = opts.size ?? 11;
  const font = opts.font ?? ctx.font;
  const color = opts.color ?? COLORS.text;
  const x = opts.x ?? MARGIN;
  ensureSpace(ctx, lineHeight(size));
  ctx.page.drawText(sanitize(text), { x, y: ctx.y, size, font, color });
  const width = font.widthOfTextAtSize(sanitize(text), size);
  ctx.y -= lineHeight(size);
  return width;
}

/** Bricht Text an Wortgrenzen auf und zeichnet ihn als Absatz. */
export function drawParagraph(
  ctx: PdfContext,
  text: string,
  opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; spacingAfter?: number } = {},
): void {
  const size = opts.size ?? 11;
  const font = opts.font ?? ctx.font;
  const words = sanitize(text).split(/\s+/).filter(Boolean);
  if (words.length === 0) return;

  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= CONTENT_WIDTH) {
      line = candidate;
    } else {
      ensureSpace(ctx, lineHeight(size));
      ctx.page.drawText(line, {
        x: MARGIN,
        y: ctx.y,
        size,
        font,
        color: opts.color ?? COLORS.text,
      });
      ctx.y -= lineHeight(size);
      line = word;
    }
  }
  if (line) {
    ensureSpace(ctx, lineHeight(size));
    ctx.page.drawText(line, {
      x: MARGIN,
      y: ctx.y,
      size,
      font,
      color: opts.color ?? COLORS.text,
    });
    ctx.y -= lineHeight(size);
  }
  ctx.y -= opts.spacingAfter ?? 0;
}

export function drawHLine(ctx: PdfContext, thickness = 0.7): void {
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: MARGIN + CONTENT_WIDTH, y: ctx.y },
    thickness,
    color: COLORS.border,
  });
  ctx.y -= 12;
}

export interface PdfTableCol {
  header: string;
  width: number; // Anteil an CONTENT_WIDTH (0..1)
  align?: 'left' | 'right';
}

export interface PdfTableRow {
  cells: string[];
}

/** Zeichnet eine Tabelle (Material etc.) mit Umbruch im ersten Feld. */
export function drawTable(
  ctx: PdfContext,
  cols: PdfTableCol[],
  rows: PdfTableRow[],
  opts: { nameFont?: PDFFont } = {},
): void {
  const rowH = 17;
  const nameFont = opts.nameFont ?? ctx.font;
  const widths = cols.map((c) => c.width * CONTENT_WIDTH);

  /* Kopfzeile */
  ensureSpace(ctx, rowH);
  ctx.page.drawRectangle({
    x: MARGIN,
    y: ctx.y - 2,
    width: CONTENT_WIDTH,
    height: rowH,
    color: COLORS.headerBg,
  });
  let x = MARGIN;
  cols.forEach((col, i) => {
    const w = widths[i];
    const text = sanitize(col.header);
    const textW = ctx.bold.widthOfTextAtSize(text, 9.5);
    const drawX =
      col.align === 'right' ? x + w - textW : x + 4;
    ctx.page.drawText(text, {
      x: drawX,
      y: ctx.y + 4,
      size: 9.5,
      font: ctx.bold,
      color: COLORS.secondary,
    });
    x += w;
  });
  ctx.y -= rowH;

  for (const row of rows) {
    ensureSpace(ctx, rowH);
    ctx.page.drawLine({
      start: { x: MARGIN, y: ctx.y },
      end: { x: MARGIN + CONTENT_WIDTH, y: ctx.y },
      thickness: 0.5,
      color: COLORS.border,
    });
    x = MARGIN;
    row.cells.forEach((cell, i) => {
      const w = widths[i];
      const col = cols[i];
      const text = sanitize(cell);
      if (col.align === 'right') {
        const textW = nameFont.widthOfTextAtSize(text, 10);
        ctx.page.drawText(text, { x: x + w - textW, y: ctx.y + 3, size: 10, font: nameFont });
      } else {
        /* Erste Spalte: bei Überlänge abschneiden, damit die Tabelle nicht bricht */
        const maxW = w - 8;
        const textW = nameFont.widthOfTextAtSize(text, 10);
        const shown = textW <= maxW ? text : truncateToWidth(nameFont, text, 10, maxW);
        ctx.page.drawText(shown, { x: x + 4, y: ctx.y + 3, size: 10, font: nameFont });
      }
      x += w;
    });
    ctx.y -= rowH;
  }
  ctx.y -= 4;
}

export function truncateToWidth(
  font: PDFFont,
  text: string,
  size: number,
  maxW: number,
): string {
  if (font.widthOfTextAtSize(text, size) <= maxW) return text;
  let cut = text;
  while (cut.length > 1 && font.widthOfTextAtSize(`${cut}…`, size) > maxW) {
    cut = cut.slice(0, -1);
  }
  return `${cut}…`;
}

/** Wandelt eine Bild-dataURL in JPEG-Bytes um (Canvas-Re-Encoding, max. 1000 px). */
async function dataUrlToJpegBytes(dataUrl: string): Promise<Uint8Array | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const maxDim = 1000;
        const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const g = canvas.getContext('2d');
        if (!g) return resolve(null);
        g.drawImage(img, 0, 0, w, h);
        resolve(dataUrlToBytes(canvas.toDataURL('image/jpeg', 0.85)));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

/** Bettet ein Bild ein, skaliert auf maxWidth (pt), Höhe gedeckelt. */
export async function embedImage(
  ctx: PdfContext,
  dataUrl: string,
  maxWidth: number,
  maxHeight = 180,
): Promise<{ image: PDFImage; width: number; height: number } | null> {
  const jpeg = await dataUrlToJpegBytes(dataUrl);
  if (!jpeg) return null;
  try {
    const image = await ctx.doc.embedJpg(jpeg);
    const size = image.scaleToFit(maxWidth, maxHeight);
    return { image, width: size.width, height: size.height };
  } catch {
    return null;
  }
}

/** Zeichnet ein Bild zentriert auf die aktuelle Position. */
export function drawImage(
  ctx: PdfContext,
  entry: { image: PDFImage; width: number; height: number },
  gap = 6,
): void {
  ensureSpace(ctx, entry.height + 6);
  const x = MARGIN + (CONTENT_WIDTH - entry.width) / 2;
  ctx.page.drawImage(entry.image, { x, y: ctx.y - entry.height, width: entry.width, height: entry.height });
  ctx.y -= entry.height + gap;
}

/** Ergänzt Fußzeilen (Export-Datum + Seitenzahl) und liefert die PDF-Bytes. */
export async function finalizePdf(
  ctx: PdfContext,
  opts?: { skipFirstPage?: boolean },
): Promise<Uint8Array> {
  const pages = ctx.doc.getPages();
  pages.forEach((page, i) => {
    if (opts?.skipFirstPage && i === 0) return;
    page.drawText(`${ctx.footer}  ·  Seite ${i + 1}`, {
      x: MARGIN,
      y: 28,
      size: 8,
      font: ctx.font,
      color: COLORS.tertiary,
    });
  });
  return ctx.doc.save();
}

/** Zeichnet eine einzelne zentrierte Zeile. */
export function drawCentered(
  ctx: PdfContext,
  text: string,
  opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb> } = {},
): number {
  const size = opts.size ?? 11;
  const font = opts.font ?? ctx.font;
  ensureSpace(ctx, lineHeight(size));
  const clean = sanitize(text);
  const w = font.widthOfTextAtSize(clean, size);
  ctx.page.drawText(clean, {
    x: MARGIN + (CONTENT_WIDTH - w) / 2,
    y: ctx.y,
    size,
    font,
    color: opts.color ?? COLORS.text,
  });
  ctx.y -= lineHeight(size);
  return w;
}

/** Zeichnet einen zentrierten Absatz mit automatischem Umbruch. */
export function drawCenteredParagraph(
  ctx: PdfContext,
  text: string,
  opts: {
    size?: number;
    font?: PDFFont;
    color?: ReturnType<typeof rgb>;
    maxWidth?: number;
    spacingAfter?: number;
  } = {},
): void {
  const size = opts.size ?? 11;
  const font = opts.font ?? ctx.font;
  const maxWidth = opts.maxWidth ?? CONTENT_WIDTH;
  const words = sanitize(text).split(/\s+/).filter(Boolean);
  if (words.length === 0) return;

  let line = '';
  const flush = () => {
    ensureSpace(ctx, lineHeight(size));
    const w = font.widthOfTextAtSize(line, size);
    ctx.page.drawText(line, {
      x: MARGIN + (CONTENT_WIDTH - w) / 2,
      y: ctx.y,
      size,
      font,
      color: opts.color ?? COLORS.text,
    });
    ctx.y -= lineHeight(size);
  };
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
    } else {
      flush();
      line = word;
    }
  }
  if (line) flush();
  ctx.y -= opts.spacingAfter ?? 0;
}

function loadImageElement(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Bild konnte nicht geladen werden.'));
    img.src = dataUrl;
  });
}

function roundRectPath(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/**
 * Bettet das App-Logo (dataURL) als „App-Icon“ ein: helles Logo auf
 * blauem, abgerundetem Quadrat (wie das PWA-Icon). Nur im Browser möglich.
 */
export async function embedBrandImage(
  ctx: PdfContext,
  dataUrl: string,
  maxWidth: number,
  maxHeight = 96,
): Promise<{ image: PDFImage; width: number; height: number } | null> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return null;
  }
  try {
    const img = await loadImageElement(dataUrl);
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const g = canvas.getContext('2d');
    if (!g) return null;

    /* Blauer, abgerundeter Hintergrund + Logo mittig */
    roundRectPath(g, 0, 0, size, size, 56);
    g.fillStyle = '#007AFF';
    g.fill();
    const pad = 40;
    g.drawImage(img, pad, pad, size - pad * 2, size - pad * 2);

    const jpeg = canvas.toDataURL('image/jpeg', 0.9);
    const image = await ctx.doc.embedJpg(dataUrlToBytes(jpeg));
    const scaled = image.scaleToFit(maxWidth, maxHeight);
    return { image, width: scaled.width, height: scaled.height };
  } catch {
    return null;
  }
}

/** Formatiert ein ISO-Datum (de-DE, TT.MM.JJJJ). */
export function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** Formatiert eine Byte-Größe (B / KB / MB). */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
