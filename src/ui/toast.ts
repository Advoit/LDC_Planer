/* ── Toast-Benachrichtigungen (optional mit Aktions-Button, z. B. „Rückgängig“) ── */

import { el } from './dom';

export type ToastKind = 'info' | 'success' | 'error';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export function showToast(
  message: string,
  kind: ToastKind = 'info',
  action?: ToastAction,
): void {
  const toast = el('div', { class: `toast toast-${kind}` }, [message]);

  let timer: ReturnType<typeof setTimeout>;
  const dismiss = (): void => {
    clearTimeout(timer);
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  };

  if (action) {
    const btn = el('button', { class: 'toast-action', type: 'button' }, [
      action.label,
    ]);
    btn.addEventListener('click', () => {
      dismiss();
      action.onClick();
    });
    toast.appendChild(btn);
  }

  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  /* Mit Aktion bleibt der Toast länger stehen */
  timer = setTimeout(dismiss, action ? 6000 : 3200);
}