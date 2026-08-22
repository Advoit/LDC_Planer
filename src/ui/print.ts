/* ── Druck: Neues Fenster mit HTML und auto-print ── */

export function openPrintWindow(html: string): void {
  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  /* Kurze Verzögerung, damit Styles geladen sind */
  setTimeout(() => w.print(), 300);
}