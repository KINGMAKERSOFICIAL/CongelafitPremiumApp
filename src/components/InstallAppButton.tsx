import { useState } from 'react';
import { usePWAInstall } from '../lib/pwa';
import { toast } from '../lib/toast';
import { Icon } from './Icon';

type Variant = 'topbar' | 'home' | 'login';
const DISMISS_KEY = 'cf_install_prompt_dismissed';

async function triggerDirectInstall(
  canNativeInstall: boolean,
  installNative: () => Promise<'accepted' | 'dismissed' | 'unavailable'>,
): Promise<void> {
  if (canNativeInstall) {
    const outcome = await installNative();
    if (outcome === 'accepted') {
      toast('Aplicativo CongelaFit adicionado à tela inicial!');
    }
    return;
  }

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({
        title: 'CongelaFit Premium',
        url: window.location.origin,
      });
      return;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
    }
  }

  toast('Instalação direta indisponível neste navegador ou janela.');
}

export function InstallAppButton({ variant = 'topbar' }: { variant?: Variant }) {
  const { isInstalled, canNativeInstall, installNative } = usePWAInstall();

  if (isInstalled) return null;

  const onTrigger = () => void triggerDirectInstall(canNativeInstall, installNative);

  if (variant === 'topbar') {
    return (
      <button
        type="button"
        className="icon-btn install-icon-btn"
        onClick={onTrigger}
        aria-label="Instalar aplicativo"
        title="Instalar aplicativo"
      >
        <Icon name="download" size={19} />
        <span className="install-topbar-lbl">Instalar app</span>
      </button>
    );
  }

  if (variant === 'home') {
    return (
      <button
        type="button"
        className="dash-install-btn"
        onClick={onTrigger}
        title="Instalar aplicativo"
      >
        <Icon name="download" size={16} />
        <span>Instalar app</span>
      </button>
    );
  }

  return (
    <button type="button" className="install-banner" onClick={onTrigger}>
      <Icon name="download" size={16} />
      <span>Instalar aplicativo</span>
    </button>
  );
}

/** Barra automática na tela quando o app ainda não está instalado (Android/iOS/Desktop). */
export function InstallAutoPrompt() {
  const { platform, isInstalled, canNativeInstall, installNative } = usePWAInstall();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });

  const canUseShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const shouldShow = !isInstalled && !dismissed && (canNativeInstall || (platform !== 'desktop' && canUseShare));

  if (!shouldShow) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* noop */
    }
  };

  return (
    <aside className="install-auto-bar noprint" aria-label="Instalar aplicativo">
      <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" width={38} height={38} />
      <div className="install-auto-txt">
        <b>CongelaFit Premium</b>
        <span>Adicionar à tela inicial</span>
      </div>
      <button
        type="button"
        className="btn sm"
        onClick={() => void triggerDirectInstall(canNativeInstall, installNative)}
      >
        <Icon name="download" size={15} /> Instalar
      </button>
      <button type="button" className="icon-btn sm" onClick={dismiss} aria-label="Fechar aviso de instalação">
        <Icon name="close" size={16} />
      </button>
    </aside>
  );
}
