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
  const a = document.createElement('a');
  a.href = `https://wa.me/?text=${encodeURIComponent(text)}`;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
