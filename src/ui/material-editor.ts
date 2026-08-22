/* ── Material-Editor mit Intellisense (Name + Einheit) ── */

import { el, icon } from './dom';
import { randomId } from '../core/id';
import { MATERIAL_UNITS } from '../domain/types';
import type { MaterialItem, Task } from '../domain/types';
import {
  collectMaterialSuggestions,
  searchSuggestions,
} from '../domain/material';

interface MaterialRow {
  id: string;
  nameInput: HTMLInputElement;
  qtyInput: HTMLInputElement;
  unitInput: HTMLInputElement;
  removeBtn: HTMLButtonElement;
  rowEl: HTMLElement;
  dropdownEl: HTMLElement | null;
}

export interface MaterialEditorHandle {
  element: HTMLElement;
  getItems(): MaterialItem[];
}

export function createMaterialEditor(opts: {
  tasks: Task[];
  initial: MaterialItem[];
  exceptTaskId?: string;
}): MaterialEditorHandle {
  const rows: MaterialRow[] = [];
  const suggestions = collectMaterialSuggestions(opts.tasks, opts.exceptTaskId);

  const container = el('div', { class: 'material-editor' });
  const table = el('table', { class: 'material-table' });
  const tbody = el('tbody');
  table.appendChild(
    el('thead', {}, [
      el('tr', {}, [
        el('th', {}, ['Material']),
        el('th', { class: 'col-qty' }, ['Menge']),
        el('th', { class: 'col-unit' }, ['Einheit']),
        el('th', { class: 'col-del' }),
      ]),
    ]),
  );
  table.appendChild(tbody);
  container.appendChild(table);

  const addBtn = el(
    'button',
    { class: 'btn btn-secondary btn-sm', type: 'button' },
    [icon('plus'), ' Material'],
  );
  addBtn.addEventListener('click', () => addRow({ name: '', quantity: 0, unit: 'Stück', id: '' }));
  container.appendChild(addBtn);

  /* Bestand laden */
  for (const item of opts.initial) {
    addRow(item);
  }

  function addRow(initial: MaterialItem): MaterialRow {
    const id = initial.id || randomId();

    const nameInput = el('input', {
      type: 'text',
      class: 'material-name',
      placeholder: 'Bezeichnung',
      value: initial.name,
    }) as HTMLInputElement;

    const qtyInput = el('input', {
      type: 'number',
      class: 'material-qty',
      min: '0',
      step: 'any',
      value: String(initial.quantity),
    }) as HTMLInputElement;

    /* Einheit-Input mit Datalist */
    const unitId = `mat-unit-${id}`;
    const datalist = el('datalist', { id: unitId });
    for (const u of MATERIAL_UNITS) {
      datalist.appendChild(el('option', { value: u }));
    }

    const unitInput = el('input', {
      type: 'text',
      class: 'material-unit',
      list: unitId,
      placeholder: 'Einheit',
      value: initial.unit,
    }) as HTMLInputElement;

    const removeBtn = el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Entfernen' }, [icon('trash')]) as HTMLButtonElement;

    const rowEl = el('tr', { class: 'material-row' }, [
      el('td', {}, [nameInput]),
      el('td', { class: 'col-qty' }, [qtyInput]),
      el('td', { class: 'col-unit' }, [unitInput, datalist]),
      el('td', { class: 'col-del' }, [removeBtn]),
    ]);

    const row: MaterialRow = {
      id,
      nameInput,
      qtyInput,
      unitInput,
      removeBtn,
      rowEl,
      dropdownEl: null,
    };

    /* Intellisense-Dropdown */
    let dropdown: HTMLElement | null = null;

    function showSuggestions(query: string): void {
      hideDropdown();
      const results = searchSuggestions(suggestions, query);
      if (results.length === 0) return;

      dropdown = el('div', { class: 'material-suggestions' });
      for (const r of results) {
        const item = el('div', { class: 'suggestion-item' }, [
          el('span', { class: 'sug-name' }, [r.name]),
          el('span', { class: 'sug-unit' }, [r.unit]),
        ]);
        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          nameInput.value = r.name;
          unitInput.value = r.unit;
          hideDropdown();
          qtyInput.focus();
        });
        dropdown.appendChild(item);
      }
      nameInput.parentElement?.appendChild(dropdown);
      row.dropdownEl = dropdown;
    }

    function hideDropdown(): void {
      if (dropdown) {
        dropdown.remove();
        dropdown = null;
        row.dropdownEl = null;
      }
    }

    nameInput.addEventListener('input', () => {
      showSuggestions(nameInput.value);
    });
    nameInput.addEventListener('blur', () => {
      setTimeout(hideDropdown, 150);
    });

    removeBtn.addEventListener('click', () => {
      hideDropdown();
      rowEl.remove();
      const idx = rows.indexOf(row);
      if (idx >= 0) rows.splice(idx, 1);
    });

    tbody.appendChild(rowEl);
    rows.push(row);
    return row;
  }

  return {
    element: container,
    getItems: (): MaterialItem[] =>
      rows.map((r) => ({
        id: r.id,
        name: r.nameInput.value.trim(),
        quantity: parseFloat(r.qtyInput.value) || 0,
        unit: r.unitInput.value.trim() || 'Stück',
      })),
  };
}