import { copyNotice } from './invite';
import { toast } from './toast';

/**
 * Proteção avançada do conteúdo no navegador (sem marca d'água).
 *
 * Camadas aplicadas:
 * - Bloqueio total de impressão (@media print, beforeprint, Ctrl/Cmd+P e override de window.print)
 *   exceto na rota de etiqueta do freezer.
 * - Ocultação imediata da tela (véu de privacidade + desfoque/ocultação do conteúdo) ao perder foco
 *   (desktop e celular), trocar de aba, minimizar, abrir ferramentas de captura ou pressionar atalhos
 *   de print/screenshot/DevTools.
 * - Bloqueio de cópia, recorte, seleção de texto, arrastar imagens/textos e menu de contexto,
 *   além de sobrescrever a área de transferência ao detectar PrintScreen.
 */

const EDITABLE = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';

export const isEditable = (t: EventTarget | null): boolean => t instanceof Element && !!t.closest(EDITABLE);

export interface ProtectionHooks {
  /** Liga/desliga a cobertura da tela. */
  veil: (on: boolean) => void;
  /** A rota atual é uma página feita para imprimir (etiqueta do freezer)? */
  printable: () => boolean;
}

/** Verifica se um atalho de teclado corresponde a print, captura de tela, cópia, salvar ou DevTools. */
export function classifyBlockedShortcut(
  e: Pick<KeyboardEvent, 'key' | 'code' | 'keyCode' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>,
  printable: boolean,
): 'print' | 'screenshot' | 'copy' | 'save' | 'devtools' | null {
  const k = (e.key || '').toLowerCase();
  const code = (e.code || '').toLowerCase();
  const mod = e.ctrlKey || e.metaKey;

  if (k === 'printscreen' || code === 'printscreen' || e.keyCode === 44) {
    return 'screenshot';
  }
  // Atalhos de print do macOS / iPadOS teclado externo (Cmd+Shift+3/4/5/6) e captura nativa (Ctrl/Cmd+Shift+S / Win+Shift+S)
  if (e.metaKey && e.shiftKey && ['3', '4', '5', '6', 's'].includes(k)) {
    return 'screenshot';
  }
  if (e.ctrlKey && e.shiftKey && k === 's') {
    return 'screenshot';
  }
  // Impressão (Ctrl/Cmd+P)
  if (mod && k === 'p' && !printable) {
    return 'print';
  }
  // Seleção total / cópia via teclado (Ctrl/Cmd + A / C / X)
  if (mod && !e.shiftKey && !e.altKey && ['a', 'c', 'x'].includes(k)) {
    return 'copy';
  }
  // Salvar página / exibir código-fonte
  if (mod && (k === 's' || k === 'u')) {
    return 'save';
  }
  // DevTools (F12, Ctrl/Cmd+Shift+I/J/C, Cmd+Opt+I/J/C)
  if (k === 'f12' || code === 'f12') {
    return 'devtools';
  }
  if ((mod && e.shiftKey && ['i', 'j', 'c'].includes(k)) || (e.metaKey && e.altKey && ['i', 'j', 'c'].includes(k))) {
    return 'devtools';
  }
  return null;
}

/** Liga os bloqueios; devolve a função que desliga. */
export function installProtection({ veil, printable }: ProtectionHooks): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const clearSelection = () => {
    try {
      window.getSelection?.()?.removeAllRanges();
    } catch {
      /* noop */
    }
  };

  const flash = (ms = 2600) => {
    clearSelection();
    veil(true);
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (document.visibilityState === 'visible' && document.hasFocus()) {
        veil(false);
      }
    }, ms);
  };

  const scrubClipboard = () => {
    void navigator.clipboard?.writeText(copyNotice()).catch(() => undefined);
  };

  const onCopy = (e: ClipboardEvent) => {
    if (isEditable(e.target) || isEditable(document.activeElement)) return;
    e.preventDefault();
    e.clipboardData?.setData('text/plain', copyNotice());
    clearSelection();
    toast('Cópia desativada. Para enviar algo a alguém, use o botão de compartilhar da Lista de compras.');
  };

  const block = (e: Event) => {
    if (!isEditable(e.target)) e.preventDefault();
  };

  const onDrag = (e: Event) => e.preventDefault();

  const handleShortcut = (e: KeyboardEvent) => {
    // Win+Shift ou Cmd+Shift pressionados juntos costumam preceder ferramentas de recorte do sistema.
    if (e.metaKey && e.shiftKey) {
      flash(2800);
    }
    const kind = classifyBlockedShortcut(e, printable());
    if (!kind) return;

    if (kind === 'copy') {
      if (isEditable(e.target) || isEditable(document.activeElement)) return;
      e.preventDefault();
      e.stopPropagation();
      clearSelection();
      scrubClipboard();
      toast('Cópia desativada. Para enviar algo a alguém, use o botão de compartilhar da Lista de compras.');
      return;
    }
    if (kind === 'screenshot') {
      e.preventDefault();
      e.stopPropagation();
      flash(3200);
      scrubClipboard();
      toast('Print de tela bloqueado nesta área.');
      return;
    }
    if (kind === 'print') {
      e.preventDefault();
      e.stopPropagation();
      flash(2200);
      toast('Impressão de receitas desativada. Apenas a etiqueta do freezer pode ser impressa.');
      return;
    }
    if (kind === 'save' || kind === 'devtools') {
      e.preventDefault();
      e.stopPropagation();
      flash(1800);
    }
  };

  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key === 'PrintScreen' || e.code === 'PrintScreen' || e.keyCode === 44) {
      flash(3200);
      scrubClipboard();
      toast('Print de tela bloqueado nesta área.');
    }
  };

  const onVisibility = () => {
    if (document.visibilityState !== 'visible') {
      clearSelection();
      veil(true);
    } else if (document.hasFocus()) {
      veil(false);
    }
  };

  const hide = () => {
    clearSelection();
    veil(true);
  };

  const show = () => {
    if (document.visibilityState === 'visible') veil(false);
  };

  const onTapReveal = () => {
    if (document.visibilityState === 'visible' && document.hasFocus()) {
      clearTimeout(timer);
      veil(false);
    }
  };

  const onBeforePrint = (e: Event) => {
    if (printable()) return;
    e.preventDefault?.();
    veil(true);
    toast('Impressão de receitas desativada. Apenas a etiqueta do freezer pode ser impressa.');
  };

  const onAfterPrint = () => {
    if (document.visibilityState === 'visible' && document.hasFocus()) {
      veil(false);
    }
  };

  const printMq = window.matchMedia?.('print');
  const onPrintMq = (e: MediaQueryListEvent) => {
    if (e.matches && !printable()) veil(true);
    else if (document.visibilityState === 'visible' && document.hasFocus()) veil(false);
  };

  // Intercepta chamadas diretas a window.print() fora da página de etiqueta do freezer.
  const originalPrint = window.print?.bind(window);
  let printPatched = false;
  try {
    Object.defineProperty(window, 'print', {
      configurable: true,
      writable: true,
      value: () => {
        if (printable()) {
          originalPrint?.();
          return;
        }
        flash(2200);
        toast('Impressão de receitas desativada. Apenas a etiqueta do freezer pode ser impressa.');
      },
    });
    printPatched = true;
  } catch {
    /* ambiente sem permissão para redefinir window.print */
  }

  document.addEventListener('copy', onCopy, true);
  document.addEventListener('cut', onCopy, true);
  document.addEventListener('contextmenu', block, true);
  document.addEventListener('selectstart', block, true);
  document.addEventListener('dragstart', onDrag, true);
  document.addEventListener('keydown', handleShortcut, true);
  document.addEventListener('keyup', onKeyUp, true);
  document.addEventListener('visibilitychange', onVisibility);
  document.addEventListener('freeze', hide);
  window.addEventListener('pagehide', hide);
  window.addEventListener('pageshow', show);
  window.addEventListener('blur', hide);
  window.addEventListener('focus', show);
  window.addEventListener('beforeprint', onBeforePrint);
  window.addEventListener('afterprint', onAfterPrint);
  window.addEventListener('pointerdown', onTapReveal, true);
  printMq?.addEventListener?.('change', onPrintMq);

  return () => {
    clearTimeout(timer);
    if (printPatched && originalPrint) {
      try {
        Object.defineProperty(window, 'print', {
          configurable: true,
          writable: true,
          value: originalPrint,
        });
      } catch {
        /* noop */
      }
    }
    document.removeEventListener('copy', onCopy, true);
    document.removeEventListener('cut', onCopy, true);
    document.removeEventListener('contextmenu', block, true);
    document.removeEventListener('selectstart', block, true);
    document.removeEventListener('dragstart', onDrag, true);
    document.removeEventListener('keydown', handleShortcut, true);
    document.removeEventListener('keyup', onKeyUp, true);
    document.removeEventListener('visibilitychange', onVisibility);
    document.removeEventListener('freeze', hide);
    window.removeEventListener('pagehide', hide);
    window.removeEventListener('pageshow', show);
    window.removeEventListener('blur', hide);
    window.removeEventListener('focus', show);
    window.removeEventListener('beforeprint', onBeforePrint);
    window.removeEventListener('afterprint', onAfterPrint);
    window.removeEventListener('pointerdown', onTapReveal, true);
    printMq?.removeEventListener?.('change', onPrintMq);
    veil(false);
  };
}
