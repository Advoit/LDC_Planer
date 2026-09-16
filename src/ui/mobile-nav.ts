/* ── Mobile Bottom-Navbar: Gruppen öffnen ihre Aktionen als Bottom-Sheet ── */

import { el, icon } from './dom';
import { openModal } from './modal';

export interface MobileNavItem {
  label: string;
  icon: string;
  onClick: () => void;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
}

export interface MobileNavGroup {
  label: string;
  icon: string;
  items: MobileNavItem[];
}

/** Baut die feste Bottom-Navbar (nur mobil sichtbar, CSS blendet sie am Desktop aus). */
export function buildMobileNav(groups: MobileNavGroup[]): HTMLElement {
  const nav = el('nav', { class: 'mobile-nav' });
  for (const group of groups) {
    const btn = el('button', { class: 'mobile-nav-btn', type: 'button' }, [
      icon(group.icon),
      el('span', { class: 'mobile-nav-btn-label' }, [group.label]),
    ]) as HTMLButtonElement;
    btn.addEventListener('click', () => openGroupSheet(group));
    nav.appendChild(btn);
  }
  return nav;
}

/** Öffnet die Aktionen einer Gruppe als Bottom-Sheet (Zurück = schließen). */
function openGroupSheet(group: MobileNavGroup): void {
  const list = el('div', { class: 'mobile-nav-sheet' });
  for (const item of group.items) {
    const kindClass = item.primary ? ' primary' : item.danger ? ' danger' : '';
    const row = el('button', {
      class: `mobile-nav-sheet-item${kindClass}${item.disabled ? ' disabled' : ''}`,
      type: 'button',
    }, [icon(item.icon), el('span', { class: 'sheet-item-label' }, [item.label])]) as HTMLButtonElement;
    row.addEventListener('click', () => {
      if (item.disabled) return;
      handle.close();
      item.onClick();
    });
    list.appendChild(row);
  }
  const handle = openModal({
    title: group.label,
    content: list,
    dismissible: true,
  });
}
