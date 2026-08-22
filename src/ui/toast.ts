/* ── Toast-Benachrichtigungen ── */

import { el } from './dom';

export type ToastKind = 'info' | 'success' | 'error';

export function showToast(message: string, kind: ToastKind = 'info'): void {
  const toast = el('div', { class: `toast toast-${kind}` }, [message]);
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}