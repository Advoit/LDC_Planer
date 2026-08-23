/* ── Mängelsreport-Vorlage in ein TS-Modul einbetten ──
 *
 * Liest die Vorlage „Mängelsreport.pptx“ (Projektwurzel) und erzeugt
 * src/io/mangelsreport-template.ts mit der Base64-kodierten Datei.
 * Nach Änderungen an der Vorlage:  node scripts/embed-mangels-template.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'Mängelsreport.pptx');
const target = resolve(root, 'src/io/mangelsreport-template.ts');

const bytes = readFileSync(source);
const base64 = bytes.toString('base64');

const content =
  `/* ════════════════════════════════════════════════════════════════
 * Generiert aus „Mängelsreport.pptx“ (Projektwurzel) – NICHT von Hand
 * bearbeiten. Nach Änderungen an der Vorlage ausführen:
 *   node scripts/embed-mangels-template.mjs
 * ════════════════════════════════════════════════════════════════ */
/* eslint-disable */
export const MANGELSREPORT_TEMPLATE_BASE64 = '${base64}';
`;

writeFileSync(target, content);
console.log(`OK: ${bytes.length} Bytes → ${target}`);
