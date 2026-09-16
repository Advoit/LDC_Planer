/* ── PDF-Inhaltsverzeichnis (mehrseitig, mit klickbaren Einträgen) ── */

import {
  addInternalLink,
  drawHLine,
  drawText,
  lineHeight,
  truncateToWidth,
  COLORS,
  CONTENT_WIDTH,
  MARGIN,
  PAGE_HEIGHT,
  PAGE_WIDTH,
} from './pdf';
import type { PdfContext } from './pdf';

export interface TocEntry {
  prefix: string;
  label: string;
  /** Seitenzahl im finalen Dokument (1-basiert). */
  page: number;
  indent?: boolean;
}

/* Höhe des Überschrift-Blocks „Inhaltsverzeichnis“ (muss zu drawTocPages passen) */
const TOC_HEADING_HEIGHT = lineHeight(18) + lineHeight(11) + 12 + 6;
const TOC_LINE_STEP = 20;
/* Platz, der für eine Zeile mindestens frei sein muss (inkl. Abstand zum Fuß) */
const TOC_LINE_MIN_SPACE = 22;

/**
 * Verteilt die Einträge auf Seiten – die erste Seite trägt den Überschrift-Block.
 * So kann das Inhaltsverzeichnis vorab als Ganzes an der richtigen Stelle
 * eingefügt werden (statt ans Dokumentende zu rutschen).
 */
export function paginateToc(entries: TocEntry[]): TocEntry[][] {
  const pages: TocEntry[][] = [];
  let current: TocEntry[] = [];
  let y = PAGE_HEIGHT - MARGIN - TOC_HEADING_HEIGHT;
  for (const entry of entries) {
    if (y - TOC_LINE_MIN_SPACE < MARGIN) {
      pages.push(current);
      current = [];
      y = PAGE_HEIGHT - MARGIN;
    }
    current.push(entry);
    y -= TOC_LINE_STEP;
  }
  pages.push(current);
  return pages;
}

function tocLine(ctx: PdfContext, entry: TocEntry): void {
  const size = 11;
  const prefixW = ctx.bold.widthOfTextAtSize(entry.prefix, size);
  const pageStr = String(entry.page);
  const pageW = ctx.bold.widthOfTextAtSize(pageStr, size);
  const indentX = entry.indent ? 14 : 0;
  const titleX = MARGIN + prefixW + indentX + 10;
  const maxTitleW = CONTENT_WIDTH - prefixW - indentX - 20 - pageW - 36;
  const shown = truncateToWidth(ctx.font, entry.label, size, maxTitleW);

  ctx.page.drawText(entry.prefix, {
    x: MARGIN + indentX,
    y: ctx.y,
    size,
    font: ctx.bold,
    color: COLORS.text,
  });
  ctx.page.drawText(shown, { x: titleX, y: ctx.y, size, font: ctx.font });
  ctx.page.drawText(pageStr, {
    x: MARGIN + CONTENT_WIDTH - pageW,
    y: ctx.y,
    size,
    font: ctx.bold,
    color: COLORS.text,
  });

  /* Gepunktete Führungslinie zwischen Titel und Seitenzahl */
  const leaderStart = titleX + ctx.font.widthOfTextAtSize(shown, size) + 8;
  const leaderEnd = MARGIN + CONTENT_WIDTH - pageW - 12;
  if (leaderEnd > leaderStart) {
    ctx.page.drawLine({
      start: { x: leaderStart, y: ctx.y + 3.6 },
      end: { x: leaderEnd, y: ctx.y + 3.6 },
      thickness: 0.6,
      color: COLORS.border,
      dashArray: [1, 3],
    });
  }

  /* Ganze Zeile anklickbar → Sprung zur zugehörigen Seite */
  const targetIndex = entry.page - 1;
  if (targetIndex >= 0 && targetIndex < ctx.doc.getPageCount()) {
    addInternalLink(
      ctx.page,
      { x: MARGIN - 6, y: ctx.y - 4, width: CONTENT_WIDTH + 12, height: 16 },
      ctx.doc.getPage(targetIndex),
    );
  }

  ctx.y -= TOC_LINE_STEP;
}

/**
 * Fügt die (bereits auf Seiten verteilten) Verzeichnis-Seiten direkt hinter dem
 * Deckblatt ein und zeichnet sie. Die Seitenzahlen der Einträge müssen vorher um
 * die Anzahl dieser Seiten verschoben worden sein.
 */
export function insertTableOfContents(
  ctx: PdfContext,
  pages: TocEntry[][],
  projectName: string,
): void {
  for (let i = 0; i < pages.length; i++) {
    ctx.doc.insertPage(1 + i, [PAGE_WIDTH, PAGE_HEIGHT]);
  }

  for (let i = 0; i < pages.length; i++) {
    ctx.page = ctx.doc.getPage(1 + i);
    ctx.y = PAGE_HEIGHT - MARGIN;

    if (i === 0) {
      drawText(ctx, 'Inhaltsverzeichnis', { size: 18, font: ctx.bold });
      drawText(ctx, projectName, { size: 11, color: COLORS.secondary });
      drawHLine(ctx);
      ctx.y -= 6;
    }

    for (const entry of pages[i]) tocLine(ctx, entry);
  }
}
