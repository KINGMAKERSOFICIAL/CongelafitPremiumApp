import { copyNotice } from './invite';
import { toast } from './toast';

/**
 * Proteção do conteúdo no navegador.
 *
 * O que ela faz: desativa seleção, cópia, arrastar, menu de contexto e impressão (o CSS esconde a página
 * no papel), cobre a tela quando o app vai para o segundo plano e põe a identificação do membro como
 * marca d'água. O que NENHUM site consegue: impedir o print do sistema (botão de screenshot do celular,
 * gravação de tela, foto da tela com outro aparelho). Por isso a marca d'água é a peça principal: ela
 * deixa o vazamento rastreável até a conta.
 */

const EDITABLE = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';

export const isEditable = (t: EventTarget | null): boolean => t instanceof Element && !!t.closest(EDITABLE);

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** Imagem (data URI de SVG) de uma peça da marca d'água, que se repete na tela toda. */
export function watermarkImage(email: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="340" height="210" viewBox="0 0 340 210">` +
    `<g transform="rotate(-24 170 105)" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="700" ` +
    `fill="rgba(17,29,36,0.17)" stroke="rgba(255,255,255,0.45)" stroke-width="2.4" paint-order="stroke">` +
    `<text x="170" y="100" font-size="13">${esc(email)}</text>` +
    `<text x="170" y="118" font-size="10.5">CongelaFit Premium · acesso pessoal</text>` +
    `</g></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export interface ProtectionHooks {
  /** Liga/desliga a cobertura da tela. */
  veil: (on: boolean) => void;
  /** A rota atual é uma página feita para imprimir (etiqueta do freezer)? */
  printable: () => boolean;
}

/** Liga os bloqueios; devolve a função que desliga. */
export function installProtection({ veil, printable }: ProtectionHooks): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flash = (ms = 2200) => {
    veil(true);
    clearTimeout(timer);
    timer = setTimeout(() => veil(false), ms);
  };
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;

  const onCopy = (e: ClipboardEvent) => {
    if (isEditable(e.target) || isEditable(document.activeElement)) return;
    e.preventDefault();
    e.clipboardData?.setData('text/plain', copyNotice());
    toast('Cópia desativada. Para enviar algo a alguém, use o botão de compartilhar da Lista de compras.');
  };
  const block = (e: Event) => {
    if (!isEditable(e.target)) e.preventDefault();
  };
  const onDrag = (e: Event) => e.preventDefault();

  const onKey = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    const mod = e.ctrlKey || e.metaKey;
    if (mod && k === 's') e.preventDefault(); // "Salvar página"
    if (mod && k === 'p' && !printable()) {
      e.preventDefault();
      flash(1200);
      toast('Impressão desativada. A etiqueta do freezer pode ser impressa normalmente.');
    }
    if (e.metaKey && e.shiftKey && ['3', '4', '5'].includes(k)) flash(); // atalhos de print do macOS
    if (e.key === 'PrintScreen') {
      flash();
      void navigator.clipboard?.writeText(copyNotice()).catch(() => undefined);
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key === 'PrintScreen') {
      flash();
      void navigator.clipboard?.writeText(copyNotice()).catch(() => undefined);
    }
  };

  const onVisibility = () => (document.visibilityState === 'hidden' ? veil(true) : veil(false));
  const hide = () => veil(true);
  const show = () => veil(false);
  const onBlur = () => {
    // No celular, perder o foco é gaveta de notificações, gravador de tela ou troca de app.
    // No computador seria só clicar em outra janela, então não cobre a tela.
    if (coarse) veil(true);
  };
  const onTapReveal = () => veil(false); // saída de emergência: um toque descobre a tela

  const printMq = window.matchMedia?.('print');
  const onPrintMq = (e: MediaQueryListEvent) => {
    if (e.matches && !printable()) veil(true);
    else veil(false);
  };

  document.addEventListener('copy', onCopy, true);
  document.addEventListener('cut', onCopy, true);
  document.addEventListener('contextmenu', block, true);
  document.addEventListener('selectstart', block, true);
  document.addEventListener('dragstart', onDrag, true);
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('keyup', onKeyUp, true);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', hide);
  window.addEventListener('pageshow', show);
  window.addEventListener('blur', onBlur);
  window.addEventListener('focus', show);
  window.addEventListener('pointerdown', onTapReveal, true);
  printMq?.addEventListener?.('change', onPrintMq);

  return () => {
    clearTimeout(timer);
    document.removeEventListener('copy', onCopy, true);
    document.removeEventListener('cut', onCopy, true);
    document.removeEventListener('contextmenu', block, true);
    document.removeEventListener('selectstart', block, true);
    document.removeEventListener('dragstart', onDrag, true);
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('keyup', onKeyUp, true);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', hide);
    window.removeEventListener('pageshow', show);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('focus', show);
    window.removeEventListener('pointerdown', onTapReveal, true);
    printMq?.removeEventListener?.('change', onPrintMq);
    veil(false);
  };
}
