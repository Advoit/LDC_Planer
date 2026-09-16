/* ── Export-Dialog: Instandsetzungsreport (PPTX) inkl. Deckblatt-Einstellungen ── */

import { el, downloadBlob } from './dom';
import { openModal } from './modal';
import { showToast } from './toast';
import { getPreference, setPreference } from '../core/preferences';
import type { Project, ReportCover } from '../domain/types';

function coverField(label: string, input: HTMLInputElement): HTMLElement {
  const wrap = el('div', { class: 'cover-field' });
  wrap.appendChild(el('label', { class: 'field-label' }, [label]));
  wrap.appendChild(input);
  return wrap;
}

/**
 * „Deckblatt Einstellungen“ – erstellt den Instandsetzungsreport als PPTX.
 * Liefert die gewählten Einstellungen zurück (null bei Abbruch), damit sie im
 * Projekt gespeichert und mit der Sicherung exportiert werden können.
 */
export function openInstandsetzungsreportModal(
  project: Project,
): Promise<ReportCover | null> {
  /* Gespeicherte Einstellungen: zuerst aus dem Projekt (gehen in die Sicherung),
     sonst aus den lokalen Geräte-Vorgaben (alte „mangelsreport.cover“-Einstellung
     bleibt aus Abwärtskompatibilität lesbar). */
  const local =
    getPreference<Partial<ReportCover>>('instandsetzungsreport.cover', {}) ||
    getPreference<Partial<ReportCover>>('mangelsreport.cover', {});
  const saved = project.reportCover ?? local;
  const today = new Date().toISOString().slice(0, 10);

  const maengelCount = project.tasks.filter(
    (t) => (t.typ ?? 'maengel') === 'maengel',
  ).length;

  const kennung = el('input', {
    type: 'text',
    class: 'input',
    name: 'kennung',
    placeholder: 'z. B. Objekt-/Auftragsnummer',
    value: saved.kennung ?? project.id,
  }) as HTMLInputElement;
  const saal = el('input', {
    type: 'text',
    class: 'input',
    name: 'saal',
    placeholder: 'z. B. EG / Saal 2',
    value: saved.saal ?? '',
  }) as HTMLInputElement;
  const strasse = el('input', {
    type: 'text',
    class: 'input',
    name: 'strasse',
    placeholder: 'z. B. Musterstraße 12',
    value: saved.strasse ?? '',
  }) as HTMLInputElement;
  const plzOrt = el('input', {
    type: 'text',
    class: 'input',
    name: 'plzOrt',
    placeholder: 'z. B. 12345 Musterstadt',
    value: saved.plzOrt ?? project.location,
  }) as HTMLInputElement;
  const efkName = el('input', {
    type: 'text',
    class: 'input',
    name: 'efkName',
    placeholder: 'Name der leitenden EFK',
    value: saved.efkName ?? '',
  }) as HTMLInputElement;
  const termin = el('input', {
    type: 'date',
    class: 'input',
    name: 'termin',
    value: saved.termin ?? today,
  }) as HTMLInputElement;
  /* „Unbekannt“: kein Datum – im Report erscheint „XX.XX.<aktuelles Jahr>“ */
  const terminUnknown = el('input', {
    type: 'checkbox',
    name: 'terminUnbekannt',
    checked: saved.termin === '' ? 'true' : null,
  }) as HTMLInputElement;
  function updateTerminField(): void {
    if (terminUnknown.checked) {
      termin.value = '';
      termin.disabled = true;
    } else {
      termin.disabled = false;
      if (!termin.value) termin.value = today;
    }
  }
  terminUnknown.addEventListener('change', updateTerminField);
  updateTerminField();

  const terminField = el('div', { class: 'cover-field' });
  terminField.appendChild(el('label', { class: 'field-label' }, ['Ausführungstermin']));
  const terminRow = el('div', { class: 'cover-termin-row' });
  terminRow.appendChild(termin);
  terminRow.appendChild(
    el('label', { class: 'checkbox-row' }, [terminUnknown, ' Unbekannt']),
  );
  terminField.appendChild(terminRow);

  const content = el('div', { class: 'export-form' }, [
    el('p', { class: 'export-hint' }, [
      `Der Report enthält ${maengelCount} ${maengelCount === 1 ? 'Mängel-Aufgabe' : 'Mängel-Aufgaben'} (nach Position sortiert). Bitte die Angaben für das Deckblatt angeben:`,
    ]),
    coverField('Kennung', kennung),
    coverField('Saal / Bereich', saal),
    coverField('Straße + Hausnummer', strasse),
    coverField('PLZ + Ort', plzOrt),
    coverField('Leitende EFK (Name)', efkName),
    terminField,
  ]);

  return new Promise<ReportCover | null>((resolve) => {
    const handle = openModal({
      title: 'Deckblatt Einstellungen',
      content,
      actions: [
        {
          label: 'Abbrechen',
          kind: 'secondary',
          onClick: () => {
            handle.close();
            resolve(null);
          },
        },
        {
          label: 'Instandsetzungsreport erstellen',
          kind: 'primary',
          onClick: async () => {
            if (maengelCount === 0) {
              showToast('Keine Mängel-Aufgaben vorhanden.', 'error');
              return;
            }
            const cover: ReportCover = {
              kennung: kennung.value.trim(),
              saal: saal.value.trim(),
              strasse: strasse.value.trim(),
              plzOrt: plzOrt.value.trim(),
              efkName: efkName.value.trim(),
              /* Unbekannt → leeres Datum (Report zeigt „XX.XX.<Jahr>“) */
              termin: terminUnknown.checked ? '' : termin.value,
            };
            /* Lokale Vorgabe weiterhin merken (Fallback für Projekte ohne eigene
               Einstellungen) – die Einstellungen liegen jetzt im Projekt. */
            setPreference('instandsetzungsreport.cover', cover);
            handle.close();
            showToast('Instandsetzungsreport wird erstellt…', 'info');
            try {
              const { buildInstandsetzungsreportPptx, instandsetzungsreportFileName } =
                await import('../io/instandsetzungsreport');
              const bytes = await buildInstandsetzungsreportPptx(project, { cover });
              downloadBlob(
                new Blob([bytes.slice()], {
                  type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                }),
                instandsetzungsreportFileName(project),
              );
              showToast('Instandsetzungsreport als PPTX exportiert.', 'success');
            } catch {
              showToast('Instandsetzungsreport konnte nicht erstellt werden.', 'error');
            }
            resolve(cover);
          },
        },
      ],
      onClose: () => resolve(null),
    });
  });
}
