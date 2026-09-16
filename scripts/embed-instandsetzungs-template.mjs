/* ── Instandsetzungsreport-Vorlage in ein TS-Modul einbetten ──
 *
 * Liest die Vorlage „Instandsetzungsreport.pptx“ (Projektwurzel) und erzeugt
 * src/io/instandsetzungsreport-template.ts mit der Base64-kodierten Datei.
 * Nach Änderungen an der Vorlage:  node scripts/embed-instandsetzungs-template.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'Instandsetzungsreport.pptx');
const target = resolve(root, 'src/io/instandsetzungsreport-template.ts');

const bytes = readFileSync(source);
const base64 = bytes.toString('base64');

const content =
  `/* ════════════════════════════════════════════════════════════════
 * Generiert aus „Instandsetzungsreport.pptx“ (Projektwurzel) – NICHT von
 * Hand bearbeiten. Nach Änderungen an der Vorlage ausführen:
 *   node scripts/embed-instandsetzungs-template.mjs
 * ════════════════════════════════════════════════════════════════ */
/* eslint-disable */
export const INSTANDSETZUNGSREPORT_TEMPLATE_BASE64 = '${base64}';
`;

writeFileSync(target, content);
console.log(`OK: ${bytes.length} Bytes → ${target}`);
