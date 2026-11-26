import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { installProtection } from '../lib/protect';

/** Rotas feitas para imprimir (a etiqueta do pote). */
const PRINTABLE = /^\/freezer\/etiqueta\//;

/**
 * Proteção do conteúdo para membros (sem marca d'água):
 * - Bloqueia cópia, seleção, menu de contexto, salvamento e impressão (exceto etiquetas do freezer).
 * - Oculta imediatamente o conteúdo quando a janela perde foco, o app vai para segundo plano ou há
 *   tentativa de captura/print. O administrador fica de fora para editar e gerenciar o app.
 */
export function Shield() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const active = !!user && user.role !== 'admin';
  const printable = PRINTABLE.test(pathname);
  const printableRef = useRef(printable);
  printableRef.current = printable;
  const [veil, setVeil] = useState(false);
  const veilRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!active) return;
    document.body.classList.add('cf-protect');
    const off = installProtection({ veil: setVeil, printable: () => printableRef.current });
    return () => {
      off();
      document.body.classList.remove('cf-protect');
    };
  }, [active]);

  useEffect(() => {
    document.body.toggleAttribute('data-printable', printable);
    return () => document.body.removeAttribute('data-printable');
  }, [printable]);

  useEffect(() => {
    document.body.classList.toggle('cf-veil', veil);
    return () => document.body.classList.remove('cf-veil');
  }, [veil]);

  // Protege contra remoção/alteração manual das classes ou do véu via inspetor do navegador.
  useEffect(() => {
    if (!active) return;
    const ensure = () => {
      if (!document.body.classList.contains('cf-protect')) {
        document.body.classList.add('cf-protect');
      }
      const el = veilRef.current;
      if (!el) return;
      if (!el.isConnected) {
        document.body.appendChild(el);
        return;
      }
      if (el.className !== 'veil') {
        el.className = 'veil';
      }
      if (el.hasAttribute('hidden')) {
        el.removeAttribute('hidden');
      }
    };
    const mo = new MutationObserver(ensure);
    mo.observe(document.body, { childList: true, attributes: true, attributeFilter: ['class', 'data-printable'] });
    if (veilRef.current) mo.observe(veilRef.current, { attributes: true });
    return () => mo.disconnect();
  }, [active]);

  if (!active) return null;
  return createPortal(
    <div ref={veilRef} className="veil" aria-hidden={!veil} role="presentation">
      <div>
        <b>Conteúdo protegido</b>
        <span>Impressão e print desativados · toque para continuar</span>
      </div>
    </div>,
    document.body,
  );
}
