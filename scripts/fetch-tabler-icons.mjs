/*
 * Lädt die in der App verwendeten Icons von Tabler Icons (https://tabler.io/icons)
 * herunter und schreibt sie als Inline-SVG-Pfade nach `src/ui/icons.ts`.
 *
 * Quelle:  https://github.com/tabler/tabler-icons
 * Lizenz:  MIT
 *
 * Aufruf:  npm run icons:tabler
 */
import { writeFileSync } from 'node:fs';

const VERSION = '3.31.0';
const BASE = `https://unpkg.com/@tabler/icons@${VERSION}/icons/outline`;
const OUT = 'src/ui/icons.ts';

/* Interner Name (wie im Code verwendet) → Tabler-Icon-Slug */
const ICONS = {
  plus: 'plus',
  pencil: 'pencil',
  trash: 'trash',
  folder: 'folder',
  download: 'download',
  upload: 'upload',
  list: 'list',
  x: 'x',
  search: 'search',
  chevron: 'chevron-right',
  check: 'check',
  image: 'photo',
  camera: 'camera',
  info: 'info-circle',
  clipboard: 'clipboard',
  file: 'file',
  paperclip: 'paperclip',
  'folder-plus': 'folder-plus',
  'file-text': 'file-text',
  eye: 'eye',
  presentation: 'presentation',
  copy: 'copy',
  history: 'history',
  'rotate-ccw': 'restore',
  'check-square': 'checkbox',
  'file-down': 'file-download',
  tag: 'tag',
  'map-pin': 'map-pin',
  stopwatch: 'stopwatch',
  user: 'user',
  sun: 'sun',
  moon: 'moon',
  cookie: 'cookie',
  'shield-check': 'shield-check',
  bulb: 'bulb',
  'zoom-in': 'zoom-in',
  'zoom-out': 'zoom-out',
  'zoom-reset': 'zoom-reset',
};

/** Holt ein Icon-SVG und reduziert es auf den Inhalt zwischen <svg> und </svg>. */
function extractInner(svg) {
  return svg
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>[\s\S]*$/, '')
    /* Transparenten Hintergrund-Pfad entfernen (original: <path stroke="none" d="M0 0h24v24H0z" fill="none"/>) */
    .replace(/<path stroke="none" d="M0 0h24v24H0z" fill="none"\s*\/>/g, '')
    .replace(/\s*\n\s*/g, '')
    .trim();
}

const entries = [];
for (const [name, slug] of Object.entries(ICONS)) {
  const res = await fetch(`${BASE}/${slug}.svg`);
  if (!res.ok) throw new Error(`Tabler-Icon „${slug}“ nicht gefunden (HTTP ${res.status})`);
  const inner = extractInner(await res.text());
  if (!inner) throw new Error(`Tabler-Icon „${slug}“ konnte nicht gelesen werden`);
  entries.push({ name, slug, inner });
  console.log(`✓ ${name} ← ${slug}`);
}

const lines = [
  '/* ── Icons ──',
  ' * Automatisch erzeugt von `npm run icons:tabler` – nicht von Hand bearbeiten.',
  ' * Alle Icons stammen von Tabler Icons (https://tabler.io/icons), MIT-Lizenz.',
  ' * Quelle: https://github.com/tabler/tabler-icons',
  ' */',
  '',
  'export const TABLER_ICON_PATHS: Readonly<Record<string, string>> = {',
];
for (const { name, slug, inner } of entries) {
  lines.push(`  /* Tabler: ${slug} */`);
  lines.push(`  '${name}': '${inner.replace(/'/g, "\\'")}',`);
}
lines.push('};', '');

writeFileSync(OUT, lines.join('\n'), 'utf8');
console.log(`\n${entries.length} Icons → ${OUT}`);
