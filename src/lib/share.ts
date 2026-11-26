import { trackEvent } from './api';
import { toast } from './toast';

export const PDF_FILE_NAME = 'lista-de-compras-congelafit.pdf';

function download(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = PDF_FILE_NAME;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function openWhatsApp(text: string): void {
  const a = document.createElement('a');
  a.href = `https://wa.me/?text=${encodeURIComponent(text)}`;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Único compartilhamento do app: a lista de compras, em texto + PDF (com a logo e o QR code do site).
 * No celular abre o menu de compartilhar com o PDF e o texto; sem isso (computador), baixa o PDF
 * e abre o WhatsApp com o texto pronto.
 */
export async function shareShoppingList(text: string, pdf: Promise<Blob>): Promise<void> {
  const blob = await pdf;
  const file = new File([blob], PDF_FILE_NAME, { type: 'application/pdf' });
  const data: ShareData = { title: 'Lista de compras · CongelaFit', text, files: [file] };
  if (typeof navigator.canShare === 'function' && navigator.canShare(data)) {
    try {
      await navigator.share(data);
      trackEvent('shopping_share', 'shopping_list', 'Lista de compras (Compartilhar/PDF)');
      return;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return; // a pessoa cancelou
      /* outro erro: cai para o plano B */
    }
  }
  download(blob);
  openWhatsApp(text);
  trackEvent('shopping_share', 'shopping_list', 'Lista de compras (WhatsApp + PDF)');
  toast('PDF baixado. No WhatsApp, anexe o arquivo à mensagem.');
}
