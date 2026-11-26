import { useEffect, useState } from 'react';
import { usePWAInstall, type InstallPlatform } from '../lib/pwa';
import { toast } from '../lib/toast';
import { Icon } from './Icon';
import { Sheet } from './Sheet';

type Variant = 'topbar' | 'home' | 'login';
type GuideTab = 'desktop' | 'ios' | 'android';

export function InstallAppButton({ variant = 'topbar' }: { variant?: Variant }) {
  const { platform, isMac, isTablet, isInstalled, canNativeInstall, installNative } = usePWAInstall();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<GuideTab>(platform);

  useEffect(() => {
    setTab(platform);
  }, [platform]);

  if (isInstalled) return null;

  const onTrigger = async () => {
    if (canNativeInstall) {
      const outcome = await installNative();
      if (outcome === 'accepted') {
        toast('Aplicativo CongelaFit adicionado ao seu dispositivo!');
        return;
      }
      if (outcome === 'dismissed') return;
    }
    setOpen(true);
  };

  return (
    <>
      {variant === 'topbar' && (
        <button
          type="button"
          className="icon-btn install-icon-btn"
          onClick={() => void onTrigger()}
          aria-label="Instalar aplicativo no celular, tablet ou computador"
          title="Instalar app no celular, tablet ou computador"
        >
          <Icon name="download" size={19} />
          <span className="install-topbar-lbl">Instalar app</span>
        </button>
      )}

      {variant === 'home' && (
        <button
          type="button"
          className="dash-install-btn"
          onClick={() => void onTrigger()}
          title="Instalar aplicativo no celular, tablet ou computador"
        >
          <Icon name="download" size={16} />
          <span>Instalar app</span>
        </button>
      )}

      {variant === 'login' && (
        <button
          type="button"
          className="install-banner"
          onClick={() => void onTrigger()}
        >
          <span className="install-banner-ico" aria-hidden="true">
            <Icon name={platform === 'desktop' ? 'monitor' : 'smartphone'} size={20} />
          </span>
          <span className="install-banner-txt">
            <b>Instalar aplicativo</b>
            <small>Celular, tablet e computador (iPhone, iPad, Android, Windows e Mac)</small>
          </span>
          <Icon name="download" size={18} />
        </button>
      )}

      <Sheet open={open} onClose={() => setOpen(false)} title="Instalar aplicativo">
        <div className="install-sheet">
          <div className="install-hero">
            <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" width={52} height={52} />
            <div>
              <b>CongelaFit Premium</b>
              <p className="small">
                Tenha o ícone do aplicativo na área de trabalho do computador, no tablet ou na tela inicial do celular.
              </p>
            </div>
          </div>

          <div className="install-tabs" role="tablist" aria-label="Escolha o seu dispositivo">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'desktop'}
              className={`install-tab ${tab === 'desktop' ? 'on' : ''}`}
              onClick={() => setTab('desktop')}
            >
              Computador
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'ios'}
              className={`install-tab ${tab === 'ios' ? 'on' : ''}`}
              onClick={() => setTab('ios')}
            >
              iPhone / iPad
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'android'}
              className={`install-tab ${tab === 'android' ? 'on' : ''}`}
              onClick={() => setTab('android')}
            >
              Android
            </button>
          </div>

          {tab === 'desktop' && (
            <ol className="install-steps">
              <li>
                <span className="install-step-num">1</span>
                <div>
                  <b>Chrome ou Edge (Windows, Mac e Linux)</b>
                  <p>
                    Clique no ícone de instalação <Icon name="download" size={14} className="inline-ico" /> no canto direito da barra de endereços, ou abra o menu <b>⋮ → Instalar CongelaFit Premium</b>.
                  </p>
                </div>
              </li>
              <li>
                <span className="install-step-num">2</span>
                <div>
                  <b>Safari no Mac</b>
                  <p>
                    No menu superior do Mac, clique em <b>Arquivo → Adicionar ao Dock</b> (ou use o botão Compartilhar → <b>Adicionar ao Dock</b>).
                  </p>
                </div>
              </li>
              <li>
                <span className="install-step-num">3</span>
                <div>
                  <b>Acesso direto em janela própria</b>
                  <p>
                    O ícone do CongelaFit ficará na sua área de trabalho, Menu Iniciar ou Dock do computador.
                  </p>
                </div>
              </li>
            </ol>
          )}

          {tab === 'ios' && (
            <ol className="install-steps">
              <li>
                <span className="install-step-num">1</span>
                <div>
                  <b>Abra no Safari e toque em Compartilhar</b>
                  <p>
                    Toque no ícone <Icon name="share" size={15} className="inline-ico" /> (quadrado com seta para cima) — na barra inferior do iPhone ou na barra superior do iPad.
                  </p>
                </div>
              </li>
              <li>
                <span className="install-step-num">2</span>
                <div>
                  <b>Escolha “Adicionar à Tela de Início”</b>
                  <p>Role as opções e toque em <b>Adicionar à Tela de Início</b>.</p>
                </div>
              </li>
              <li>
                <span className="install-step-num">3</span>
                <div>
                  <b>Confirme tocando em “Adicionar”</b>
                  <p>O ícone do CongelaFit Premium aparecerá na tela inicial do seu iPhone ou iPad.</p>
                </div>
              </li>
            </ol>
          )}

          {tab === 'android' && (
            <ol className="install-steps">
              <li>
                <span className="install-step-num">1</span>
                <div>
                  <b>Abra o menu do navegador (Chrome)</b>
                  <p>
                    No celular ou tablet Android, toque nos três pontinhos <Icon name="moreVertical" size={15} className="inline-ico" /> no canto superior direito.
                  </p>
                </div>
              </li>
              <li>
                <span className="install-step-num">2</span>
                <div>
                  <b>Toque em “Instalar aplicativo”</b>
                  <p>Ou selecione <b>Adicionar à tela inicial</b> no menu do navegador.</p>
                </div>
              </li>
              <li>
                <span className="install-step-num">3</span>
                <div>
                  <b>Confirme em “Instalar”</b>
                  <p>O atalho com a logo do CongelaFit será salvo na tela inicial do seu celular ou tablet Android.</p>
                </div>
              </li>
            </ol>
          )}

          {canNativeInstall && (
            <button
              type="button"
              className="btn auth-submit"
              onClick={() => {
                setOpen(false);
                void installNative();
              }}
            >
              <Icon name="download" size={18} /> Instalar agora
            </button>
          )}

          <p className="small install-note">
            {platformHint(platform, isMac, isTablet)}
          </p>
        </div>
      </Sheet>
    </>
  );
}

function platformHint(platform: InstallPlatform, isMac: boolean, isTablet: boolean): string {
  if (platform === 'ios') {
    return isTablet
      ? 'Dica para iPad: use o navegador Safari e toque no ícone Compartilhar na barra superior.'
      : 'Dica para iPhone: use o navegador Safari para liberar a opção “Adicionar à Tela de Início”.';
  }
  if (platform === 'android') {
    return isTablet
      ? 'Dica para tablet Android: use o Google Chrome para instalar o app em tela cheia.'
      : 'Dica para Android: use o Google Chrome para instalar com ícone oficial na tela inicial.';
  }
  return isMac
    ? 'No Mac, você pode instalar pelo Chrome/Edge ou adicionar ao Dock pelo Safari.'
    : 'No computador (Windows/Linux), abra pelo Chrome ou Edge para instalar com 1 clique.';
}
