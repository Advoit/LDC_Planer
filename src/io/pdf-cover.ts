/* ── PDF-Deckblatt des Projektberichts ── */

import {
  embedTransparentImage,
  drawCentered,
  drawCenteredParagraph,
  ensureSpace,
  formatDate,
  COLORS,
  CONTENT_WIDTH,
  MARGIN,
  PAGE_HEIGHT,
  PAGE_WIDTH,
} from './pdf';
import type { PdfContext } from './pdf';
import type { Project } from '../domain/types';

/** Lädt das aktuelle App-Logo (favicon.svg) als dataURL. */
async function fetchLogoDataUrl(): Promise<string | null> {
  try {
    const res = await fetch('favicon.svg');
    if (!res.ok) return null;
    const text = await res.text();
    const bytes = new TextEncoder().encode(text);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return `data:image/svg+xml;base64,${btoa(bin)}`;
  } catch {
    return null;
  }
}

export async function drawCover(
  ctx: PdfContext,
  project: Project,
  now: string,
): Promise<void> {
  /* Blauer Briefkopf über die volle Breite */
  const bandH = 110;
  ctx.page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - bandH,
    width: PAGE_WIDTH,
    height: bandH,
    color: COLORS.blue,
  });

  /* Logo oben rechts – ohne Umrandung, direkt auf dem Briefkopf */
  const logoDataUrl = await fetchLogoDataUrl();
  const logo = logoDataUrl
    ? await embedTransparentImage(ctx, logoDataUrl, 84, 84)
    : null;
  if (logo) {
    ctx.page.drawImage(logo.image, {
      x: PAGE_WIDTH - MARGIN - logo.width,
      y: PAGE_HEIGHT - bandH + (bandH - logo.height) / 2,
      width: logo.width,
      height: logo.height,
    });
  }

  /* Wortmarke links im Briefkopf */
  ctx.page.drawText('LDC Planer', {
    x: MARGIN,
    y: PAGE_HEIGHT - bandH + (bandH - 16) / 2 + 4,
    size: 16,
    font: ctx.bold,
    color: COLORS.white,
  });

  /* Inhalt unterhalb des Briefkopfs */
  ctx.y = PAGE_HEIGHT - bandH - 44;

  /* Projektname */
  drawCenteredParagraph(ctx, project.name, {
    size: 30,
    font: ctx.bold,
    maxWidth: CONTENT_WIDTH - 40,
    spacingAfter: 18,
  });

  /* Akzentlinie */
  const ruleW = 48;
  ctx.page.drawRectangle({
    x: MARGIN + (CONTENT_WIDTH - ruleW) / 2,
    y: ctx.y + 8,
    width: ruleW,
    height: 2.5,
    color: COLORS.blue,
  });
  ctx.y -= 24;

  /* Ort */
  if (project.location) {
    drawCentered(ctx, project.location, { size: 14, color: COLORS.secondary });
  }
  ctx.y -= 8;

  /* Beschreibung */
  if (project.description) {
    drawCenteredParagraph(ctx, project.description, {
      size: 11.5,
      color: COLORS.secondary,
      maxWidth: 430,
      spacingAfter: 28,
    });
  } else {
    ctx.y -= 28;
  }

  /* Zusammenfassungs-Kasten (zentriert, schlicht) */
  const docCount = (project.documents ?? []).length;
  const boxLines = [
    `Projekt-ID: ${project.id}`,
    `Erstellt: ${formatDate(project.createdAt)}`,
    `Zuletzt geändert: ${formatDate(project.updatedAt)}`,
    `${project.tasks.length} ${project.tasks.length === 1 ? 'Aufgabe' : 'Aufgaben'} · ${docCount} ${docCount === 1 ? 'Unterlage' : 'Unterlagen'}`,
  ];
  const lineH = 17;
  const padY = 12;
  const boxW = Math.min(440, CONTENT_WIDTH);
  const boxX = MARGIN + (CONTENT_WIDTH - boxW) / 2;
  const boxH = boxLines.length * lineH + padY * 2;
  ensureSpace(ctx, boxH + 30);
  const boxBottom = ctx.y - boxH;

  ctx.page.drawRectangle({
    x: boxX,
    y: boxBottom,
    width: boxW,
    height: boxH,
    color: COLORS.headerBg,
  });
  ctx.page.drawRectangle({
    x: boxX,
    y: boxBottom,
    width: 3.5,
    height: boxH,
    color: COLORS.blue,
  });

  let ly = ctx.y - padY - lineH + 5;
  for (const line of boxLines) {
    ctx.page.drawText(line, {
      x: boxX + 16,
      y: ly,
      size: 10.5,
      font: ctx.font,
      color: COLORS.text,
    });
    ly -= lineH;
  }

  /* Fußbereich des Deckblatts */
  const foot = `Exportiert am ${now}  ·  LDC Planer`;
  ctx.page.drawText(foot, {
    x: MARGIN + (CONTENT_WIDTH - ctx.font.widthOfTextAtSize(foot, 9)) / 2,
    y: 36,
    size: 9,
    font: ctx.font,
    color: COLORS.tertiary,
  });
}
