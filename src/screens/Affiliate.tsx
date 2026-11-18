import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { trackEvent } from '../lib/api';
import { useAuth } from '../lib/auth';
import { toast } from '../lib/toast';

interface Template {
  id: string;
  label: string;
  build: (link: string) => string;
}

const TEMPLATES: Template[] = [
  {
    id: 'amigas',
    label: 'Para amigas / família',
    build: (link) =>
      `Oi! Tudo bem? Lembrei de você porque comecei a usar o *CongelaFit Premium* para organizar minhas marmitas da semana e estou economizando muito tempo.\n\nEle tem 506 receitas (com foto e passo a passo), controle de validade do freezer e lista de compras automática!\n\nDá uma olhada aqui se quiser conhecer: ${link}`,
  },
  {
    id: 'fitness',
    label: 'Grupos fitness / low carb',
    build: (link) =>
      `Pessoal, para quem está na rotina de marmitas saudáveis e low carb: estou usando o app *CongelaFit Premium* e ajuda demais!\n\nTem planner da semana, validade do que está no freezer e mais de 440 receitas de almoço, café da manhã, lanches e doces fit.\n\nLink para acessar: ${link}`,
  },
  {
    id: 'status',
    label: 'Status do WhatsApp',
    build: (link) =>
      `Organizei minha semana inteira de marmitas em minutos com o *CongelaFit Premium*! ❄️🥗\n506 receitas + controle do freezer + lista de compras.\nQuem quiser o acesso ao app, está aqui: ${link}`,
  },
  {
    id: 'economia',
    label: 'Foco em economia',
    build: (link) =>
      `Parei de gastar com delivery na correria usando o *CongelaFit Premium* para montar e congelar minhas marmitas.\n\nAlém das receitas low carb e lanches para congelar, o app monta a lista do mercado certinha para não desperdiçar nada.\n\nRecomendo muito: ${link}`,
  },
];

export function Affiliate() {
  const { user, config, saveAffiliateLink } = useAuth();
  const [linkInput, setLinkInput] = useState(user?.affiliateLink ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [templateId, setTemplateId] = useState(TEMPLATES[0].id);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setLinkInput(user?.affiliateLink ?? '');
  }, [user?.affiliateLink]);

  const activeLink = useMemo(() => {
    const saved = user?.affiliateLink?.trim();
    if (saved) return saved;
    if (linkInput.trim()) return linkInput.trim();
    return config.kiwifyCheckoutUrl || window.location.origin;
  }, [user?.affiliateLink, linkInput, config.kiwifyCheckoutUrl]);

  useEffect(() => {
    const tpl = TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATES[0];
    setMessage(tpl.build(activeLink));
  }, [templateId, activeLink]);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await saveAffiliateLink(linkInput.trim());
      toast('Link de afiliado Kiwify salvo!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar o link.');
    } finally {
      setSaving(false);
    }
  };

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message);
      trackEvent('referral_share');
      toast('Mensagem copiada! Agora é só colar no WhatsApp.');
    } catch {
      toast('Selecione e copie a mensagem abaixo.');
    }
  };

  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(message)}`;
  const hasSavedLink = Boolean(user?.affiliateLink?.trim());

  return (
    <div className="page narrow">
      <div className="crumbs">
        <Link to="/mais">Mais</Link> <Icon name="arrow" size={12} /> <span>Indique e Ganhe</span>
      </div>

      <header className="page-head">
        <p className="eyebrow">Afiliados Kiwify</p>
        <h1>Indique o CongelaFit e ganhe comissão</h1>
        <p>
          Torne-se afiliado oficial na Kiwify e indique o aplicativo de forma orgânica para amigos, família e
          grupos no WhatsApp.
        </p>
      </header>

      <section className="card pad-card stack">
        <div className="step-badge">Passo 1</div>
        <h2>Ative sua afiliação na Kiwify</h2>
        <p className="small">
          Acesse a página de afiliação do CongelaFit Premium na Kiwify, solicite sua afiliação e copie o seu
          link exclusivo de divulgação.
        </p>
        <div>
          {config.kiwifyAffiliateInviteUrl ? (
            <a
              href={config.kiwifyAffiliateInviteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn"
            >
              <Icon name="external" size={18} /> Afiliar-se na Kiwify
            </a>
          ) : (
            <p className="hint">
              O administrador ainda não definiu o link de convite de afiliação da Kiwify.
            </p>
          )}
        </div>
      </section>

      <section className="card pad-card stack">
        <div className="step-badge">Passo 2</div>
        <h2>Salve seu link de afiliado</h2>
        <p className="small">
          Cole aqui o link gerado pela Kiwify para que todas as suas indicações no WhatsApp já levem sua
          comissão automaticamente.
        </p>
        <form className="form" onSubmit={handleSave}>
          <div className="field">
            <label htmlFor="aff-link">Seu link de afiliado Kiwify</label>
            <div className="field-row">
              <input
                id="aff-link"
                type="url"
                placeholder="https://pay.kiwify.com.br/... ou https://kiwify.app/..."
                value={linkInput}
                onChange={(e) => setLinkInput(e.target.value)}
              />
              <button type="submit" className="btn" disabled={saving}>
                <Icon name="check" size={17} /> {saving ? 'Salvando…' : 'Salvar link'}
              </button>
            </div>
          </div>
          {error && (
            <p className="form-err" role="alert">
              {error}
            </p>
          )}
        </form>
        {hasSavedLink ? (
          <p className="small ok-text">
            <Icon name="check" size={14} /> Link pessoal ativo nas mensagens abaixo.
          </p>
        ) : (
          <p className="hint">
            Enquanto você não salva seu link próprio, a prévia usa o link padrão do produto.
          </p>
        )}
      </section>

      <section className="card pad-card stack">
        <div className="step-badge">Passo 3</div>
        <h2>Indique de forma orgânica no WhatsApp</h2>
        <p className="small">
          Escolha um estilo de mensagem natural (sem cara de propaganda), personalize se quiser e envie direto
          pelo WhatsApp.
        </p>

        <div className="chips filters" role="group" aria-label="Modelos de mensagem">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`chip ${templateId === t.id ? 'on' : ''}`}
              aria-pressed={templateId === t.id}
              onClick={() => setTemplateId(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="field">
          <label htmlFor="aff-msg">Mensagem pronta (editável)</label>
          <textarea
            id="aff-msg"
            rows={7}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>

        <div className="form-actions">
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className="btn whatsapp-btn"
            onClick={() => trackEvent('referral_share')}
          >
            <Icon name="send" size={18} /> Enviar no WhatsApp
          </a>
          <button type="button" className="btn ghost" onClick={() => void copyMessage()}>
            <Icon name="copy" size={18} /> Copiar mensagem
          </button>
        </div>
      </section>
    </div>
  );
}
