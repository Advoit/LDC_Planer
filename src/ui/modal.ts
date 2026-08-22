/* ── Modal / Bottom-Sheet (mobil) ── */

import { el } from './dom';

export interface ModalAction {
  label: string;
  kind: 'primary' | 'secondary' | 'danger';
  onClick: () => void | Promise<void>;
}

export interface ModalOptions {
  title: string;
  content: HTMLElement;
  actions?: ModalAction[];
  dismissible?: boolean; // Klick auf Hintergrund schließt (Standard: true)
  onClose?: () => void;
  wide?: boolean;
}

export interface ModalHandle {
  close: () => void;
  element: HTMLElement;
}

export function openModal(opts: ModalOptions): ModalHandle {
  const overlay = el('div', { class: 'modal-overlay' });
  const sheet = el(
    'div',
    { class: `modal-sheet${opts.wide ? ' wide' : ''}` },
    [
      el('div', { class: 'modal-handle' }),
      el('div', { class: 'modal-header' }, [
        el('h2', { class: 'modal-title' }, [opts.title]),
        el('button', { class: 'icon-btn modal-close', 'aria-label': 'Schließen' }, [iconX()]),
      ]),
      el('div', { class: 'modal-body' }, [opts.content]),
    ],
  );

  if (opts.actions && opts.actions.length > 0) {
    const actionsRow = el('div', { class: 'modal-actions' });
    for (const action of opts.actions) {
      const btn = el(
        'button',
        { class: `btn btn-${action.kind}`, type: 'button' },
        [action.label],
      );
      btn.addEventListener('click', () => {
        void action.onClick();
      });
      actionsRow.appendChild(btn);
    }
    sheet.appendChild(actionsRow);
  }

  overlay.appendChild(sheet);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));

  const closeBtn = sheet.querySelector<HTMLButtonElement>('.modal-close');
  closeBtn?.addEventListener('click', () => close());

  let closed = false;
  function close(): void {
    if (closed) return;
    closed = true;
    overlay.classList.remove('open');
    setTimeout(() => {
      overlay.remove();
      opts.onClose?.();
    }, 220);
  }

  if (opts.dismissible !== false) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
  }

  /* Fokus in das Modal setzen */
  const firstInput = sheet.querySelector<HTMLElement>('input, textarea, select, button');
  firstInput?.focus();

  return { close, element: sheet };
}

function iconX(): SVGElement {
  return svgIcon('<path d="M18 6 6 18M6 6l12 12"/>');
}

function svgIcon(inner: string): SVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.innerHTML = inner;
  return svg;
}

/** Bestätigungsdialog. Löst mit true/false auf. */
export function confirmDialog(opts: {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    const content = el('div', { class: 'confirm-content' }, [
      el('p', {}, [opts.message]),
    ]);
    let done = false;
    const finish = (value: boolean) => {
      if (done) return;
      done = true;
      resolve(value);
    };
    const handle = openModal({
      title: opts.title,
      content,
      dismissible: true,
      actions: [
        {
          label: opts.cancelLabel ?? 'Abbrechen',
          kind: 'secondary',
          onClick: () => {
            handle.close();
            finish(false);
          },
        },
        {
          label: opts.confirmLabel ?? 'OK',
          kind: opts.danger ? 'danger' : 'primary',
          onClick: () => {
            handle.close();
            finish(true);
          },
        },
      ],
      onClose: () => finish(false),
    });
  });
}