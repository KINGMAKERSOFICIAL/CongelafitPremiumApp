import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { installProtection, watermarkImage } from '../lib/protect';

/** Rotas feitas para imprimir (a etiqueta do pote). */
const PRINTABLE = /^\/freezer\/etiqueta\//;

/**
 * Proteção do conteúdo para membros: marca d'água com o e-mail, bloqueio de cópia/seleção/impressão e
 * cobertura da tela quando o app sai de cena. O administrador fica de fora (precisa copiar e editar).
 */
export function Shield() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const active = !!user && user.role !== 'admin';
  const printable = PRINTABLE.test(pathname);
  const printableRef = useRef(printable);
  printableRef.current = printable;
  const [veil, setVeil] = useState(false);
  const wmRef = useRef<HTMLDivElement | null>(null);

  const image = useMemo(() => (user ? watermarkImage(user.email) : ''), [user]);

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
  }, [veil]);

  // Se alguém apagar ou esconder a marca d'água pelo inspetor do navegador, ela volta.
  useEffect(() => {
    if (!active) return;
    const mo = new MutationObserver(() => {
      const el = wmRef.current;
      if (!el) return;
      if (!el.isConnected) {
        // Recoloca o mesmo elemento (o React continua dono dele) em vez de remontar.
        document.body.appendChild(el);
        return;
      }
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.5 || el.className !== 'wm') {
        el.className = 'wm';
        el.removeAttribute('hidden');
        el.style.cssText = '';
        el.style.backgroundImage = `url("${image}")`;
      }
    });
    mo.observe(document.body, { childList: true });
    if (wmRef.current) mo.observe(wmRef.current, { attributes: true });
    return () => mo.disconnect();
  }, [active, image]);

  if (!active) return null;
  return createPortal(
    <>
      <div
        ref={wmRef}
        className="wm"
        aria-hidden="true"
        style={{ backgroundImage: `url("${image}")` }}
      />
      <div className="veil" aria-hidden={!veil} role="presentation">
        <div>
          <b>Conteúdo protegido</b>
          <span>Toque para continuar</span>
        </div>
      </div>
    </>,
    document.body,
  );
}
