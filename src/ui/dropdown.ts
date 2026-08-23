/* ── Dropdown-Menü (Desktop): Gruppe öffnet ihre Optionen ── */

import { el, icon } from './dom';

export interface DropdownItem {
  label: string;
  icon: string;
  onClick: () => void;
  kind?: 'primary' | 'danger';
  disabled?: boolean;
}

export interface DropdownOptions {
  label: string;
  icon: string;
  items: DropdownItem[];
}

const openMenus = new Set<HTMLElement>();

function closeAllMenus(): void {
  for (const menu of openMenus) menu.classList.remove('open');
  openMenus.clear();
}

/* Klick außerhalb bzw. Escape schließt alle offenen Menüs. */
document.addEventListener('click', closeAllMenus);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeAllMenus();
});

/** Baut eine Dropdown-Gruppe für die Toolbar (Trigger + Menü). */
export function createDropdown(opts: DropdownOptions): HTMLElement {
  const wrapper = el('div', { class: 'dropdown' });

  const trigger = el('button', {
    class: 'toolbar-btn dropdown-trigger',
    type: 'button',
    'aria-haspopup': 'menu',
  }, [
    icon(opts.icon),
    el('span', { class: 'btn-label' }, [opts.label]),
    icon('chevron'),
  ]) as HTMLButtonElement;

  const menu = el('div', { class: 'dropdown-menu', role: 'menu' });
  for (const item of opts.items) {
    const kindClass =
      item.kind === 'primary' ? ' primary' : item.kind === 'danger' ? ' danger' : '';
    const btn = el('button', {
      class: `dropdown-item${kindClass}${item.disabled ? ' disabled' : ''}`,
      type: 'button',
      role: 'menuitem',
    }, [icon(item.icon), el('span', {}, [item.label])]) as HTMLButtonElement;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllMenus();
      if (!item.disabled) item.onClick();
    });
    menu.appendChild(btn);
  }

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    if (wrapper.classList.contains('open')) {
      wrapper.classList.remove('open');
      openMenus.delete(wrapper);
    } else {
      closeAllMenus();
      wrapper.classList.add('open');
      openMenus.add(wrapper);
    }
  });

  wrapper.appendChild(trigger);
  wrapper.appendChild(menu);
  return wrapper;
}
