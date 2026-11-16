/** Compartilha pelo menu do celular; sem ele, abre o WhatsApp com o texto pronto. */
export async function shareOrWhatsApp(title: string, text: string): Promise<void> {
  if (navigator.share) {
    try {
      await navigator.share({ title, text });
      return;
    } catch {
      /* cancelado: cai para o WhatsApp */
    }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
}
