/* ── Material: Intellisense-Vorschläge (Name + zuletzt verwendete Einheit) ── */

import type { MaterialItem, Task } from './types';

export interface MaterialSuggestion {
  name: string;
  unit: string;
}

/**
 * Sammelt aus allen Aufgaben die (Name, Einheit)-Tupel.
 * Es wird jeweils die zuletzt verwendete Einheit eines Namens übernommen.
 */
export function collectMaterialSuggestions(
  tasks: Task[],
  exceptTaskId?: string,
): MaterialSuggestion[] {
  const lastUnit = new Map<string, string>();
  for (const task of tasks) {
    if (task.id === exceptTaskId) continue;
    for (const item of task.material) {
      const name = item.name.trim();
      if (!name) continue;
      lastUnit.set(name, item.unit.trim());
    }
  }
  return [...lastUnit.entries()].map(([name, unit]) => ({ name, unit }));
}

export function searchSuggestions(
  suggestions: MaterialSuggestion[],
  query: string,
  limit = 8,
): MaterialSuggestion[] {
  const q = query.trim().toLowerCase();
  if (!q) return suggestions.slice(0, limit);
  return suggestions
    .filter(
      (s) =>
        s.name.toLowerCase().includes(q) || s.unit.toLowerCase().includes(q),
    )
    .slice(0, limit);
}

/** Sortiert Material-Items für Listen (nach Name). */
export function sortMaterial(items: MaterialItem[]): MaterialItem[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

export function materialTotalQuantity(items: MaterialItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}