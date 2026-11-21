import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CATEGORIES, RECIPES, SECTIONS, getCategory, getRecipe, search } from '../data';
import { Icon } from '../components/Icon';
import { defaultImgUrl } from '../components/Photo';
import { Sheet } from '../components/Sheet';
import { apiFetch, readImageAsDataUrl } from '../lib/api';
import { useAuth } from '../lib/auth';
import { updateRecipeImageOverride, useRecipeImageOverrides } from '../lib/recipeImages';
import { toast } from '../lib/toast';

type AdminTab = 'analytics' | 'kiwify' | 'images' | 'products';

interface AnalyticsPayload {
  summary: {
    totalMembers: number;
    activeMembers: number;
    pendingMembers: number;
    inactiveMembers: number;
    totalLogins: number;
    totalRecipeViews: number;
    totalProductClicks: number;
    whatsappReferralShares: number;
    customRecipeImages: number;
    activeProducts: number;
  };
  topRecipes: Array<{ id: string; views: number }>;
  products: Array<{ id: string; title: string; category: string; clicks: number; active: boolean }>;
  daily: Array<{
    date: string;
    logins: number;
    recipeViews: number;
    productClicks: number;
    referralShares: number;
  }>;
}

interface KiwifySettings {
  appBaseUrl?: string;
  kiwifyWebhookToken: string;
  kiwifyCheckoutUrl: string;
  kiwifyAffiliateInviteUrl: string;
  updatedAt: string;
}

interface KiwifyHosting {
  requestOrigin: string;
  publicOrigin: string;
  defaultSiteUrl: string;
  kiwifySiteUrl: string;
}

interface WebhookLog {
  id: string;
  receivedAt: string;
  event: string;
  orderId: string;
  email: string;
  status: string;
  accepted: boolean;
  detail: string;
}

interface AdminMember {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'member';
  status: 'active' | 'pending' | 'refunded' | 'canceled';
  needsPasswordSetup: boolean;
  loginCount: number;
  kiwifyOrderId: string;
  kiwifyProduct: string;
  lastLoginAt: string | null;
  createdAt: string;
}

interface AdminProduct {
  id: string;
  title: string;
  description: string;
  category: string;
  priceLabel: string;
  imageUrl: string;
  affiliateUrl: string;
  badge?: string;
  active: boolean;
  clicks: number;
  createdAt: string;
}

const STATUS_LABEL: Record<string, string> = {
  active: 'Ativo',
  pending: 'Pendente',
  refunded: 'Reembolsado',
  canceled: 'Cancelado',
};

export function Admin() {
  const { user, refresh: refreshAuth } = useAuth();
  const [params, setParams] = useSearchParams();
  const rawTab = params.get('tab');
  const tab: AdminTab =
    rawTab === 'kiwify' || rawTab === 'images' || rawTab === 'products' ? rawTab : 'analytics';

  const setTab = (next: AdminTab) => setParams(next === 'analytics' ? {} : { tab: next }, { replace: true });

  if (!user || user.role !== 'admin') {
    return (
      <div className="page narrow">
        <div className="empty-state">
          <Icon name="lock" size={34} />
          <h1>Acesso restrito ao Administrador</h1>
          <p>Esta área é exclusiva da conta administradora do CongelaFit Premium.</p>
          <div className="empty-actions">
            <Link to="/" className="btn">
              Voltar ao início
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="crumbs">
        <Link to="/mais">Mais</Link> <Icon name="arrow" size={12} /> <span>Painel Admin</span>
      </div>

      <header className="page-head">
        <p className="eyebrow">Administração</p>
        <h1>Painel de Controle</h1>
        <p>Gerencie análises, webhook da Kiwify, imagens das receitas e links de produtos afiliados.</p>
      </header>

      <div className="tabs admin-tabs" role="tablist" aria-label="Ferramentas de administrador">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'analytics'}
          className={`tab ${tab === 'analytics' ? 'on' : ''}`}
          onClick={() => setTab('analytics')}
        >
          <Icon name="chart" size={16} /> Análises
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'kiwify'}
          className={`tab ${tab === 'kiwify' ? 'on' : ''}`}
          onClick={() => setTab('kiwify')}
        >
          <Icon name="link" size={16} /> Webhook Kiwify
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'images'}
          className={`tab ${tab === 'images' ? 'on' : ''}`}
          onClick={() => setTab('images')}
        >
          <Icon name="image" size={16} /> Imagens das receitas
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'products'}
          className={`tab ${tab === 'products' ? 'on' : ''}`}
          onClick={() => setTab('products')}
        >
          <Icon name="bag" size={16} /> Itens afiliados
        </button>
      </div>

      {tab === 'analytics' && <AnalyticsTab />}
      {tab === 'kiwify' && <KiwifyTab onConfigChanged={refreshAuth} />}
      {tab === 'images' && <RecipeImagesTab />}
      {tab === 'products' && <ProductsTab />}
    </div>
  );
}

/* ═════════ ABA 1: ANÁLISES ═════════ */
function AnalyticsTab() {
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch<AnalyticsPayload>('/api/admin/analytics')
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="card pad-card">
        <p className="small">Carregando métricas…</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="card pad-card">
        <p className="form-err">Não foi possível carregar as análises.</p>
      </div>
    );
  }

  const s = data.summary;

  return (
    <div className="stack">
      <div className="sec-head">
        <h2>Resumo geral</h2>
        <button type="button" className="btn ghost sm" onClick={load}>
          <Icon name="reset" size={15} /> Atualizar
        </button>
      </div>

      <div className="kpi-grid">
        <div className="card kpi-card">
          <span>Membros ativos</span>
          <strong>{s.activeMembers}</strong>
          <small>{s.totalMembers} cadastrados</small>
        </div>
        <div className="card kpi-card">
          <span>Pendentes / Inativos</span>
          <strong>{s.pendingMembers + s.inactiveMembers}</strong>
          <small>
            {s.pendingMembers} pend. · {s.inactiveMembers} canc./reemb.
          </small>
        </div>
        <div className="card kpi-card">
          <span>Acessos (logins)</span>
          <strong>{s.totalLogins}</strong>
          <small>entradas na área de membros</small>
        </div>
        <div className="card kpi-card">
          <span>Receitas abertas</span>
          <strong>{s.totalRecipeViews}</strong>
          <small>{s.customRecipeImages} fotos personalizadas</small>
        </div>
        <div className="card kpi-card">
          <span>Cliques em itens</span>
          <strong>{s.totalProductClicks}</strong>
          <small>{s.activeProducts} produtos ativos</small>
        </div>
        <div className="card kpi-card">
          <span>Indicações WhatsApp</span>
          <strong>{s.whatsappReferralShares}</strong>
          <small>compartilhamentos orgânicos</small>
        </div>
      </div>

      <div className="admin-two">
        <section className="card pad-card">
          <h2>Receitas mais visualizadas</h2>
          {data.topRecipes.length === 0 ? (
            <p className="small">Nenhuma visualização registrada ainda.</p>
          ) : (
            <ul className="dash-list">
              {data.topRecipes.map((item) => {
                const rec = getRecipe(item.id);
                return (
                  <li key={item.id}>
                    <div>
                      <Link to={`/receita/${item.id}`} className="dash-recipe">
                        {rec ? rec.title : item.id}
                      </Link>
                      {rec && <small>{getCategory(rec.cat)?.name}</small>}
                    </div>
                    <span className="pill ok">{item.views} views</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card pad-card">
          <h2>Cliques em itens afiliados</h2>
          {data.products.length === 0 ? (
            <p className="small">Nenhum item afiliado cadastrado.</p>
          ) : (
            <ul className="dash-list">
              {data.products.map((p) => (
                <li key={p.id}>
                  <div>
                    <b>{p.title}</b>
                    <small>
                      {p.category} · {p.active ? 'Ativo' : 'Oculto'}
                    </small>
                  </div>
                  <span className="pill soon">{p.clicks} cliques</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card pad-card">
        <h2>Atividade dos últimos 14 dias</h2>
        {data.daily.length === 0 ? (
          <p className="small">Sem eventos diários registrados ainda.</p>
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Logins</th>
                  <th>Receitas</th>
                  <th>Cliques itens</th>
                  <th>Indicações WA</th>
                </tr>
              </thead>
              <tbody>
                {data.daily.map((d) => (
                  <tr key={d.date}>
                    <td>{d.date}</td>
                    <td>{d.logins}</td>
                    <td>{d.recipeViews}</td>
                    <td>{d.productClicks}</td>
                    <td>{d.referralShares}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/* ═════════ ABA 2: WEBHOOK KIWIFY & MEMBROS ═════════ */
function KiwifyTab({ onConfigChanged }: { onConfigChanged: () => Promise<void> }) {
  const [settings, setSettings] = useState<KiwifySettings | null>(null);
  const [hosting, setHosting] = useState<KiwifyHosting | null>(null);
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [members, setMembers] = useState<AdminMember[]>([]);
  const [appBaseUrl, setAppBaseUrl] = useState('');
  const [token, setToken] = useState('');
  const [checkoutUrl, setCheckoutUrl] = useState('');
  const [affiliateInviteUrl, setAffiliateInviteUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [probing, setProbing] = useState(false);
  const [err, setErr] = useState('');

  // Simular webhook
  const [testEmail, setTestEmail] = useState('');
  const [testName, setTestName] = useState('Cliente Teste');
  const [testEvent, setTestEvent] = useState('order_approved');

  // Novo membro manual
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newPass, setNewPass] = useState('');

  const loadAll = useCallback(async () => {
    const [kiwify, mem] = await Promise.all([
      apiFetch<{ settings: KiwifySettings; webhookLogs: WebhookLog[]; hosting?: KiwifyHosting }>('/api/admin/kiwify'),
      apiFetch<{ members: AdminMember[] }>('/api/admin/members'),
    ]);
    setSettings(kiwify.settings);
    setHosting(kiwify.hosting ?? null);
    setLogs(kiwify.webhookLogs);
    setAppBaseUrl(kiwify.settings.appBaseUrl ?? '');
    setToken(kiwify.settings.kiwifyWebhookToken);
    setCheckoutUrl(kiwify.settings.kiwifyCheckoutUrl);
    setAffiliateInviteUrl(kiwify.settings.kiwifyAffiliateInviteUrl);
    setMembers(mem.members);
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const detectedPublicOrigin = hosting?.publicOrigin || window.location.origin;
  const effectiveBaseUrl = (appBaseUrl.trim() || detectedPublicOrigin).replace(/\/+$/, '');
  const webhookUrl = `${effectiveBaseUrl}/api/webhooks/kiwify/${token}`;
  const webhookBaseUrl = `${effectiveBaseUrl}/api/webhooks/kiwify`;

  const saveSettings = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    setSaving(true);
    try {
      await apiFetch('/api/admin/kiwify', {
        method: 'PUT',
        body: JSON.stringify({
          appBaseUrl: appBaseUrl.trim().replace(/\/+$/, ''),
          kiwifyWebhookToken: token.trim(),
          kiwifyCheckoutUrl: checkoutUrl.trim(),
          kiwifyAffiliateInviteUrl: affiliateInviteUrl.trim(),
        }),
      });
      await loadAll();
      await onConfigChanged();
      toast('Configurações da Kiwify salvas.');
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Erro ao salvar configurações.');
    } finally {
      setSaving(false);
    }
  };

  const regenerateToken = () => {
    const arr = new Uint8Array(12);
    crypto.getRandomValues(arr);
    const hex = Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
    setToken(hex);
  };

  const copyUrl = async (url: string, label: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast(`${label} copiada.`);
    } catch {
      toast('Copie a URL exibida no campo.');
    }
  };

  const testEndpointLive = async () => {
    setProbing(true);
    try {
      const res = await fetch('/api/webhooks/kiwify');
      const data = (await res.json()) as { ok?: boolean; service?: string };
      if (res.ok && data.ok) {
        toast('Endpoint do Webhook ativo e respondendo (200 OK).');
      } else {
        toast('O endpoint respondeu, mas sem confirmação padrão.');
      }
    } catch {
      toast('Não foi possível alcançar o endpoint do Webhook.');
    } finally {
      setProbing(false);
    }
  };

  const simulateWebhook = async (e: FormEvent) => {
    e.preventDefault();
    if (!testEmail.trim()) return;
    try {
      const res = await apiFetch<{ message: string }>('/api/admin/kiwify/test', {
        method: 'POST',
        body: JSON.stringify({ email: testEmail.trim(), name: testName.trim(), event: testEvent }),
      });
      toast(res.message);
      setTestEmail('');
      await loadAll();
    } catch (e2) {
      toast(e2 instanceof Error ? e2.message : 'Falha na simulação.');
    }
  };

  const addMember = async (e: FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) return;
    try {
      await apiFetch('/api/admin/members', {
        method: 'POST',
        body: JSON.stringify({ email: newEmail.trim(), name: newName.trim(), password: newPass }),
      });
      toast('Membro adicionado!');
      setNewEmail('');
      setNewName('');
      setNewPass('');
      await loadAll();
    } catch (e2) {
      toast(e2 instanceof Error ? e2.message : 'Erro ao adicionar membro.');
    }
  };

  const updateMember = async (id: string, patch: { status?: string; resetPassword?: boolean }) => {
    try {
      await apiFetch(`/api/admin/members/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      toast('Membro atualizado.');
      await loadAll();
    } catch (e2) {
      toast(e2 instanceof Error ? e2.message : 'Erro ao atualizar.');
    }
  };

  const removeMember = async (id: string) => {
    try {
      await apiFetch(`/api/admin/members/${id}`, { method: 'DELETE' });
      toast('Membro removido.');
      await loadAll();
    } catch (e2) {
      toast(e2 instanceof Error ? e2.message : 'Erro ao remover.');
    }
  };

  if (!settings) {
    return (
      <div className="card pad-card">
        <p className="small">Carregando integração Kiwify…</p>
      </div>
    );
  }

  return (
    <div className="stack">
      <section className="card pad-card stack">
        <div className="dash-head">
          <h2>Configuração do Webhook da Kiwify</h2>
          <div className="table-actions">
            <a href="https://kiwify.com.br/" target="_blank" rel="noopener noreferrer" className="btn ghost sm">
              <Icon name="external" size={14} /> Abrir Kiwify
            </a>
            <a href="https://congelafit.com.br" target="_blank" rel="noopener noreferrer" className="btn ghost sm">
              <Icon name="external" size={14} /> Site CongelaFit
            </a>
          </div>
        </div>
        <p className="small">
          O Webhook recebe automaticamente os eventos da <b>Kiwify</b> (<code>https://kiwify.com.br/</code>) no
          servidor onde o <b>CongelaFit</b> está hospedado para liberar e bloquear o acesso dos compradores em tempo
          real.
        </p>

        <div className="field">
          <label htmlFor="kw-url">URL do Webhook pronta para colar na Kiwify (com token)</label>
          <div className="field-row">
            <input id="kw-url" type="text" readOnly value={webhookUrl} />
            <button type="button" className="btn ghost" onClick={() => void copyUrl(webhookUrl, 'URL do Webhook')}>
              <Icon name="copy" size={16} /> Copiar URL
            </button>
            <button type="button" className="btn ghost" onClick={() => void testEndpointLive()} disabled={probing}>
              <Icon name="check" size={16} /> {probing ? 'Testando…' : 'Verificar status'}
            </button>
          </div>
          <p className="hint">
            Se preferir validar usando o token gerado pela própria Kiwify (assinatura HMAC-SHA1), cole{' '}
            <code>{webhookBaseUrl}</code> na Kiwify e cole o token da Kiwify no campo abaixo.
          </p>
        </div>

        <form className="form" onSubmit={saveSettings}>
          <div className="field">
            <label htmlFor="kw-host">Domínio onde o app CongelaFit está hospedado</label>
            <input
              id="kw-host"
              type="url"
              placeholder={detectedPublicOrigin}
              value={appBaseUrl}
              onChange={(e) => setAppBaseUrl(e.target.value)}
            />
            <div className="chips compact">
              <button
                type="button"
                className={`chip ${!appBaseUrl.trim() || appBaseUrl.trim() === detectedPublicOrigin ? 'on' : ''}`}
                onClick={() => setAppBaseUrl(detectedPublicOrigin)}
              >
                Usar servidor atual ({detectedPublicOrigin.replace(/^https?:\/\//, '').slice(0, 32)}
                {detectedPublicOrigin.replace(/^https?:\/\//, '').length > 32 ? '…' : ''})
              </button>
              <button
                type="button"
                className={`chip ${appBaseUrl.trim() === 'https://congelafit.com.br' ? 'on' : ''}`}
                onClick={() => setAppBaseUrl('https://congelafit.com.br')}
              >
                https://congelafit.com.br
              </button>
              <button
                type="button"
                className={`chip ${appBaseUrl.trim() === 'https://app.congelafit.com.br' ? 'on' : ''}`}
                onClick={() => setAppBaseUrl('https://app.congelafit.com.br')}
              >
                https://app.congelafit.com.br
              </button>
            </div>
            <p className="hint">
              Deixe no servidor atual enquanto usar este endereço hospedado ou escolha o domínio oficial quando publicar.
            </p>
          </div>

          <div className="field">
            <label htmlFor="kw-token">Token / Segredo do Webhook</label>
            <div className="field-row">
              <input
                id="kw-token"
                type="text"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                required
              />
              <button type="button" className="btn ghost" onClick={regenerateToken}>
                <Icon name="reset" size={16} /> Gerar novo token
              </button>
            </div>
          </div>

          <div className="field">
            <label htmlFor="kw-checkout">Site / Checkout do CongelaFit na Kiwify</label>
            <input
              id="kw-checkout"
              type="url"
              placeholder="https://congelafit.com.br"
              value={checkoutUrl}
              onChange={(e) => setCheckoutUrl(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="kw-aff">Link oficial para membros se afiliarem na Kiwify</label>
            <input
              id="kw-aff"
              type="url"
              placeholder="https://kiwify.com.br/"
              value={affiliateInviteUrl}
              onChange={(e) => setAffiliateInviteUrl(e.target.value)}
            />
          </div>

          {err && (
            <p className="form-err" role="alert">
              {err}
            </p>
          )}

          <div className="form-actions">
            <button type="submit" className="btn" disabled={saving}>
              <Icon name="check" size={17} /> {saving ? 'Salvando…' : 'Salvar configurações Kiwify'}
            </button>
          </div>
        </form>

        <div className="callout ok">
          <Icon name="info" size={18} />
          <div>
            <b>Como ativar na Kiwify (https://kiwify.com.br/)</b>
            <p>
              No painel da Kiwify, vá em <b>Apps → Webhooks → Criar Webhook</b>, cole a URL acima, selecione o produto{' '}
              <b>CongelaFit</b> e marque os eventos: <b>Compra aprovada</b>, <b>Compra reembolsada</b>,{' '}
              <b>Chargeback</b>, <b>Assinatura cancelada</b>, <b>Assinatura atrasada</b> e <b>Assinatura renovada</b>.
            </p>
          </div>
        </div>
      </section>

      <div className="admin-two">
        <section className="card pad-card stack">
          <h2>Testar evento Webhook</h2>
          <p className="small">Simule uma notificação da Kiwify para testar o fluxo completo de liberação.</p>
          <form className="form" onSubmit={simulateWebhook}>
            <div className="field">
              <label htmlFor="sim-email">E-mail do comprador</label>
              <input
                id="sim-email"
                type="email"
                placeholder="comprador@email.com"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                required
              />
            </div>
            <div className="field-grid">
              <div className="field">
                <label htmlFor="sim-name">Nome</label>
                <input
                  id="sim-name"
                  type="text"
                  value={testName}
                  onChange={(e) => setTestName(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="sim-ev">Evento Kiwify</label>
                <select id="sim-ev" value={testEvent} onChange={(e) => setTestEvent(e.target.value)}>
                  <option value="order_approved">Compra aprovada (order_approved)</option>
                  <option value="subscription_renewed">Renovação (subscription_renewed)</option>
                  <option value="order_refunded">Reembolso (order_refunded)</option>
                  <option value="subscription_canceled">Cancelada (subscription_canceled)</option>
                </select>
              </div>
            </div>
            <button type="submit" className="btn ghost">
              <Icon name="send" size={16} /> Disparar teste
            </button>
          </form>
        </section>

        <section className="card pad-card stack">
          <h2>Liberar membro manualmente</h2>
          <p className="small">
            Adicione um e-mail manualmente. Se deixar a senha vazia, o membro cria a própria senha em
            &ldquo;Primeiro acesso&rdquo;.
          </p>
          <form className="form" onSubmit={addMember}>
            <div className="field">
              <label htmlFor="mem-email">E-mail</label>
              <input
                id="mem-email"
                type="email"
                placeholder="membro@email.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                required
              />
            </div>
            <div className="field-grid">
              <div className="field">
                <label htmlFor="mem-name">Nome</label>
                <input
                  id="mem-name"
                  type="text"
                  placeholder="Nome completo"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="mem-pass">Senha inicial (opcional)</label>
                <input
                  id="mem-pass"
                  type="text"
                  placeholder="Mín. 6 chars ou vazio"
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                />
              </div>
            </div>
            <button type="submit" className="btn">
              <Icon name="plus" size={16} /> Liberar acesso
            </button>
          </form>
        </section>
      </div>

      <section className="card pad-card stack">
        <h2>Membros cadastrados ({members.length})</h2>
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Usuário</th>
                <th>Status</th>
                <th>Logins</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td>
                    <b>{m.name}</b>
                    <div className="small">{m.email}</div>
                    {m.role === 'admin' && <span className="pill ok">Admin</span>}
                    {m.needsPasswordSetup && <span className="pill soon">Aguardando senha</span>}
                  </td>
                  <td>
                    <span className={`pill ${m.status === 'active' ? 'ok' : m.status === 'pending' ? 'soon' : 'expired'}`}>
                      {STATUS_LABEL[m.status] ?? m.status}
                    </span>
                  </td>
                  <td>{m.loginCount}</td>
                  <td>
                    {m.role !== 'admin' ? (
                      <div className="table-actions">
                        <button
                          type="button"
                          className="btn ghost sm"
                          onClick={() =>
                            void updateMember(m.id, { status: m.status === 'active' ? 'canceled' : 'active' })
                          }
                        >
                          {m.status === 'active' ? 'Suspender' : 'Ativar'}
                        </button>
                        <button
                          type="button"
                          className="btn ghost sm"
                          onClick={() => void updateMember(m.id, { resetPassword: true })}
                        >
                          Resetar senha
                        </button>
                        <button
                          type="button"
                          className="btn ghost danger sm"
                          onClick={() => void removeMember(m.id)}
                          aria-label={`Remover ${m.email}`}
                        >
                          <Icon name="trash" size={15} />
                        </button>
                      </div>
                    ) : (
                      <span className="small">Conta principal</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card pad-card stack">
        <h2>Histórico de Webhooks recebidos</h2>
        {logs.length === 0 ? (
          <p className="small">Nenhum webhook recebido ainda.</p>
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Data/Hora</th>
                  <th>Evento</th>
                  <th>E-mail</th>
                  <th>Pedido</th>
                  <th>Resultado</th>
                </tr>
              </thead>
              <tbody>
                {logs.slice(0, 25).map((l) => (
                  <tr key={l.id}>
                    <td className="small">{new Date(l.receivedAt).toLocaleString('pt-BR')}</td>
                    <td>
                      <code>{l.event}</code>
                    </td>
                    <td>{l.email}</td>
                    <td className="small">{l.orderId}</td>
                    <td>
                      <span className={`pill ${l.accepted ? 'ok' : 'expired'}`}>
                        {l.accepted ? 'Aceito' : 'Rejeitado'}
                      </span>
                      <div className="small">{l.detail}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/* ═════════ ABA 3: TROCAR IMAGENS DAS RECEITAS ═════════ */
function RecipeImagesTab() {
  const overrides = useRecipeImageOverrides();
  const [q, setQ] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [onlyCustom, setOnlyCustom] = useState(false);
  const [openCats, setOpenCats] = useState<string[]>(() => (CATEGORIES[0] ? [CATEGORIES[0].id] : []));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [mode, setMode] = useState<'link' | 'upload'>('link');
  const [urlInput, setUrlInput] = useState('');
  const [fileDataUrl, setFileDataUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const availableCats = useMemo(
    () => (sectionFilter ? CATEGORIES.filter((c) => c.section === sectionFilter) : CATEGORIES),
    [sectionFilter],
  );

  const filteredRecipes = useMemo(() => {
    const trimmed = q.trim();
    let items = trimmed ? search(trimmed) : RECIPES;
    if (trimmed && /^\d+$/.test(trimmed)) {
      const num = Number(trimmed);
      const byNum = RECIPES.filter((r) => r.n === num);
      if (byNum.length) {
        const seen = new Set(byNum.map((r) => r.id));
        items = [...byNum, ...items.filter((r) => !seen.has(r.id))];
      }
    }
    if (sectionFilter) {
      const allowed = new Set(CATEGORIES.filter((c) => c.section === sectionFilter).map((c) => c.id));
      items = items.filter((r) => allowed.has(r.cat));
    }
    if (catFilter) {
      items = items.filter((r) => r.cat === catFilter);
    }
    if (onlyCustom) {
      items = items.filter((r) => Boolean(overrides[r.id]));
    }
    return items;
  }, [q, sectionFilter, catFilter, onlyCustom, overrides]);

  const groupedSections = useMemo(() => {
    const byCat = new Map<string, typeof RECIPES>();
    for (const r of filteredRecipes) {
      const arr = byCat.get(r.cat);
      if (arr) arr.push(r);
      else byCat.set(r.cat, [r]);
    }
    return SECTIONS.filter((sec) => !sectionFilter || sec === sectionFilter)
      .map((sec) => {
        const cats = CATEGORIES.filter((c) => c.section === sec && byCat.has(c.id)).map((c) => ({
          cat: c,
          recipes: byCat.get(c.id)!,
        }));
        const total = cats.reduce((sum, entry) => sum + entry.recipes.length, 0);
        return { section: sec, cats, total };
      })
      .filter((g) => g.cats.length > 0);
  }, [filteredRecipes, sectionFilter]);

  const forceOpen = Boolean(q.trim() || catFilter || onlyCustom);

  const toggleCat = (id: string) => {
    setOpenCats((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  };

  const selectSection = (sec: string) => {
    setSectionFilter(sec);
    setCatFilter('');
    if (sec) {
      const firstCat = CATEGORIES.find((c) => c.section === sec);
      if (firstCat) setOpenCats((cur) => (cur.includes(firstCat.id) ? cur : [...cur, firstCat.id]));
    }
  };

  const editingRecipe = editingId ? getRecipe(editingId) : undefined;

  const openEditor = (id: string) => {
    setEditingId(id);
    setErr('');
    const cur = overrides[id];
    if (cur && !cur.startsWith('/uploads/')) {
      setMode('link');
      setUrlInput(cur);
      setFileDataUrl('');
    } else {
      setMode('link');
      setUrlInput('');
      setFileDataUrl('');
    }
  };

  const onChooseFile = async (file: File | undefined) => {
    if (!file) return;
    setErr('');
    try {
      const dataUrl = await readImageAsDataUrl(file);
      setFileDataUrl(dataUrl);
      setMode('upload');
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Erro ao carregar arquivo.');
    }
  };

  const saveImage = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingRecipe) return;
    setErr('');
    setSaving(true);
    try {
      const payload =
        mode === 'upload'
          ? { mode: 'upload', dataUrl: fileDataUrl }
          : { mode: 'link', url: urlInput.trim() };
      const res = await apiFetch<{ override: { url: string } }>(
        `/api/admin/recipes/${editingRecipe.id}/image`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      );
      updateRecipeImageOverride(editingRecipe.id, res.override.url);
      toast(`Imagem de "${editingRecipe.title}" atualizada!`);
      setEditingId(null);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Erro ao atualizar imagem.');
    } finally {
      setSaving(false);
    }
  };

  const restoreOriginal = async (id: string, title: string) => {
    try {
      await apiFetch(`/api/admin/recipes/${id}/image`, { method: 'DELETE' });
      updateRecipeImageOverride(id, null);
      toast(`Imagem original de "${title}" restaurada.`);
      if (editingId === id) setEditingId(null);
    } catch (e2) {
      toast(e2 instanceof Error ? e2.message : 'Erro ao restaurar.');
    }
  };

  return (
    <div className="stack">
      <div className="card pad-card stack">
        <h2>Trocar imagens das receitas</h2>
        <p className="small">
          Navegue pelas seções e categorias abaixo ou busque uma receita para substituir a foto por um{' '}
          <b>link hospedado</b> ou <b>imagem normal</b> do seu aparelho.
        </p>

        <div className="searchbox">
          <Icon name="search" size={20} />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar receita por nome, número ou ingrediente…"
            aria-label="Buscar receita para editar foto"
          />
        </div>

        <div className="chips filters" role="group" aria-label="Filtrar por seção">
          <button
            type="button"
            className={`chip ${sectionFilter === '' ? 'on' : ''}`}
            aria-pressed={sectionFilter === ''}
            onClick={() => selectSection('')}
          >
            Todas as seções ({RECIPES.length})
          </button>
          {SECTIONS.map((sec) => {
            const secCatIds = new Set(CATEGORIES.filter((c) => c.section === sec).map((c) => c.id));
            const count = RECIPES.filter((r) => secCatIds.has(r.cat)).length;
            return (
              <button
                key={sec}
                type="button"
                className={`chip ${sectionFilter === sec ? 'on' : ''}`}
                aria-pressed={sectionFilter === sec}
                onClick={() => selectSection(sec)}
              >
                {sec} ({count})
              </button>
            );
          })}
        </div>

        <div className="picker-filters">
          <label className="select">
            <span className="sr">Categoria</span>
            <select
              value={catFilter}
              onChange={(e) => setCatFilter(e.target.value)}
              aria-label="Filtrar por categoria"
            >
              <option value="">Todas as categorias ({availableCats.length})</option>
              {availableCats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={`chip ${onlyCustom ? 'on' : ''}`}
            aria-pressed={onlyCustom}
            onClick={() => setOnlyCustom((v) => !v)}
          >
            Somente personalizadas ({Object.keys(overrides).length})
          </button>
          <span className="small">
            {filteredRecipes.length} {filteredRecipes.length === 1 ? 'receita' : 'receitas'} em{' '}
            {groupedSections.reduce((s, g) => s + g.cats.length, 0)} categorias
          </span>
        </div>
      </div>

      {groupedSections.length === 0 ? (
        <div className="empty-state">
          <Icon name="image" size={32} />
          <h3>Nenhuma receita encontrada</h3>
          <p>Ajuste a busca ou limpe os filtros de seção e categoria.</p>
        </div>
      ) : (
        groupedSections.map((group) => (
          <section key={group.section} className="admin-sec-block stack">
            <div className="admin-sec-head">
              <h3>{group.section}</h3>
              <span className="small">
                {group.cats.length} {group.cats.length === 1 ? 'categoria' : 'categorias'} · {group.total}{' '}
                {group.total === 1 ? 'receita' : 'receitas'}
              </span>
            </div>

            {group.cats.map(({ cat, recipes }) => {
              const isOpen = forceOpen || openCats.includes(cat.id);
              const customInCat = recipes.filter((r) => Boolean(overrides[r.id])).length;
              return (
                <div key={cat.id} className="card admin-cat-card">
                  <button
                    type="button"
                    className="admin-cat-toggle"
                    aria-expanded={isOpen}
                    onClick={() => toggleCat(cat.id)}
                  >
                    <div className="admin-cat-title">
                      <strong>{cat.name}</strong>
                      <span className="small">
                        {recipes.length} {recipes.length === 1 ? 'receita' : 'receitas'}
                      </span>
                      {customInCat > 0 && <span className="pill ok">{customInCat} alt.</span>}
                    </div>
                    <Icon name="down" size={18} className={`cat-chev ${isOpen ? 'open' : ''}`} />
                  </button>

                  {isOpen && (
                    <div className="admin-cat-body">
                      <div className="img-admin-grid">
                        {recipes.map((r) => {
                          const custom = overrides[r.id];
                          const src = custom || (r.img ? defaultImgUrl(r.img, true) : '');
                          return (
                            <div key={r.id} className="card img-admin-card">
                              <img
                                src={src}
                                alt=""
                                className="img-admin-thumb"
                                loading="lazy"
                                decoding="async"
                              />
                              <div className="img-admin-info">
                                <span className="small">Nº {String(r.n).padStart(3, '0')}</span>
                                <b>{r.title}</b>
                                {custom && <span className="pill ok">Personalizada</span>}
                                <div className="table-actions">
                                  <button type="button" className="btn sm ghost" onClick={() => openEditor(r.id)}>
                                    <Icon name="edit" size={14} /> Trocar
                                  </button>
                                  {custom && (
                                    <button
                                      type="button"
                                      className="btn sm ghost danger"
                                      onClick={() => void restoreOriginal(r.id, r.title)}
                                    >
                                      Restaurar
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        ))
      )}

      <Sheet
        open={Boolean(editingRecipe)}
        onClose={() => setEditingId(null)}
        title={editingRecipe ? `Trocar foto: ${editingRecipe.title}` : 'Trocar foto'}
        wide
      >
        {editingRecipe && (
          <div className="stack">
            <div className="chips filters">
              <button
                type="button"
                className={`chip ${mode === 'link' ? 'on' : ''}`}
                onClick={() => setMode('link')}
              >
                <Icon name="link" size={15} /> Link hospedado (URL)
              </button>
              <button
                type="button"
                className={`chip ${mode === 'upload' ? 'on' : ''}`}
                onClick={() => setMode('upload')}
              >
                <Icon name="upload" size={15} /> Imagem normal (arquivo)
              </button>
            </div>

            <form className="form" onSubmit={saveImage}>
              {mode === 'link' ? (
                <div className="field">
                  <label htmlFor="rec-img-url">Link da imagem hospedada</label>
                  <input
                    id="rec-img-url"
                    type="url"
                    placeholder="https://exemplo.com/minha-foto.webp"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    required
                  />
                </div>
              ) : (
                <div className="field">
                  <label>Selecionar imagem do aparelho (máx. 5 MB)</label>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="sr"
                    onChange={(e) => {
                      void onChooseFile(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                  <div className="form-actions">
                    <button type="button" className="btn ghost" onClick={() => fileRef.current?.click()}>
                      <Icon name="upload" size={17} /> Escolher imagem
                    </button>
                    {fileDataUrl && <span className="pill ok">Imagem carregada para prévia</span>}
                  </div>
                </div>
              )}

              <div className="preview-pair">
                <div>
                  <span className="small">Atual no app</span>
                  <img
                    src={overrides[editingRecipe.id] ?? defaultImgUrl(editingRecipe.img ?? editingRecipe.id, true)}
                    alt=""
                    className="preview-thumb"
                  />
                </div>
                {(mode === 'link' ? urlInput : fileDataUrl) && (
                  <div>
                    <span className="small">Nova imagem</span>
                    <img
                      src={mode === 'link' ? urlInput : fileDataUrl}
                      alt=""
                      className="preview-thumb"
                    />
                  </div>
                )}
              </div>

              {err && (
                <p className="form-err" role="alert">
                  {err}
                </p>
              )}

              <div className="sheet-actions">
                <button type="button" className="btn ghost" onClick={() => setEditingId(null)}>
                  Cancelar
                </button>
                {overrides[editingRecipe.id] && (
                  <button
                    type="button"
                    className="btn ghost danger"
                    onClick={() => void restoreOriginal(editingRecipe.id, editingRecipe.title)}
                  >
                    <Icon name="reset" size={16} /> Restaurar original
                  </button>
                )}
                <button
                  type="submit"
                  className="btn"
                  disabled={saving || (mode === 'upload' ? !fileDataUrl : !urlInput.trim())}
                >
                  <Icon name="check" size={17} /> {saving ? 'Salvando…' : 'Salvar nova imagem'}
                </button>
              </div>
            </form>
          </div>
        )}
      </Sheet>
    </div>
  );
}

/* ═════════ ABA 4: ITENS AFILIADOS (DIA A DIA) ═════════ */
function ProductsTab() {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Potes e Embalagens');
  const [priceLabel, setPriceLabel] = useState('');
  const [badge, setBadge] = useState('');
  const [description, setDescription] = useState('');
  const [affiliateUrl, setAffiliateUrl] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await apiFetch<{ products: AdminProduct[] }>('/api/admin/products');
    setProducts(res.products ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => {
    setEditingId(null);
    setTitle('');
    setCategory('Potes e Embalagens');
    setPriceLabel('');
    setBadge('');
    setDescription('');
    setAffiliateUrl('');
    setImageUrl('');
    setImageDataUrl('');
    setActive(true);
    setErr('');
  };

  const startEdit = (p: AdminProduct) => {
    setEditingId(p.id);
    setTitle(p.title);
    setCategory(p.category);
    setPriceLabel(p.priceLabel);
    setBadge(p.badge ?? '');
    setDescription(p.description);
    setAffiliateUrl(p.affiliateUrl);
    setImageUrl(p.imageUrl);
    setImageDataUrl('');
    setActive(p.active);
    setErr('');
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setErr('');
    try {
      const dataUrl = await readImageAsDataUrl(file);
      setImageDataUrl(dataUrl);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Imagem inválida.');
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    setSaving(true);
    try {
      const body = {
        title: title.trim(),
        category: category.trim(),
        priceLabel: priceLabel.trim(),
        badge: badge.trim(),
        description: description.trim(),
        affiliateUrl: affiliateUrl.trim(),
        imageUrl: imageUrl.trim(),
        imageDataUrl: imageDataUrl || undefined,
        active,
      };
      if (editingId) {
        await apiFetch(`/api/admin/products/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
        toast('Item afiliado atualizado!');
      } else {
        await apiFetch('/api/admin/products', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        toast('Item afiliado adicionado!');
      }
      resetForm();
      await load();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Erro ao salvar item.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await apiFetch(`/api/admin/products/${id}`, { method: 'DELETE' });
      toast('Item removido.');
      if (editingId === id) resetForm();
      await load();
    } catch (e2) {
      toast(e2 instanceof Error ? e2.message : 'Erro ao excluir.');
    }
  };

  return (
    <div className="stack">
      <section className="card pad-card stack">
        <h2>{editingId ? 'Editar item para o dia a dia' : 'Adicionar item afiliado para o dia a dia'}</h2>
        <p className="small">
          Estes itens aparecem para todos os membros na aba <b>Mais → Itens para o dia a dia</b> com o seu
          link de afiliado.
        </p>

        <form className="form" onSubmit={submit}>
          <div className="field-grid">
            <div className="field">
              <label htmlFor="prd-title">Nome do produto</label>
              <input
                id="prd-title"
                type="text"
                placeholder="Ex.: Kit 10 Potes Herméticos Freezer"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="prd-cat">Categoria</label>
              <input
                id="prd-cat"
                type="text"
                placeholder="Ex.: Potes e Embalagens"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="prd-url">Link de afiliado (Amazon, Shopee, Mercado Livre, Kiwify…)</label>
            <input
              id="prd-url"
              type="url"
              placeholder="https://..."
              value={affiliateUrl}
              onChange={(e) => setAffiliateUrl(e.target.value)}
              required
            />
          </div>

          <div className="field-grid">
            <div className="field">
              <label htmlFor="prd-price">Preço ou texto de destaque (opcional)</label>
              <input
                id="prd-price"
                type="text"
                placeholder="Ex.: R$ 89,90 ou Ver oferta"
                value={priceLabel}
                onChange={(e) => setPriceLabel(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="prd-badge">Selo / Destaque (opcional)</label>
              <input
                id="prd-badge"
                type="text"
                placeholder="Ex.: Recomendado"
                value={badge}
                onChange={(e) => setBadge(e.target.value)}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="prd-desc">Descrição curta</label>
            <textarea
              id="prd-desc"
              rows={2}
              placeholder="Por que esse item ajuda na rotina de marmitas…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="prd-img">Imagem do produto (cole um link ou envie do aparelho)</label>
            <div className="field-row">
              <input
                id="prd-img"
                type="text"
                placeholder="https://... (opcional)"
                value={imageUrl}
                onChange={(e) => {
                  setImageUrl(e.target.value);
                  setImageDataUrl('');
                }}
              />
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="sr"
                onChange={(e) => {
                  void onFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              <button type="button" className="btn ghost" onClick={() => fileRef.current?.click()}>
                <Icon name="upload" size={16} /> Enviar foto
              </button>
            </div>
            {(imageDataUrl || imageUrl) && (
              <img src={imageDataUrl || imageUrl} alt="" className="preview-thumb" />
            )}
          </div>

          <label className="check-inline">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            <span>Visível para os membros na aba Itens para o dia a dia</span>
          </label>

          {err && (
            <p className="form-err" role="alert">
              {err}
            </p>
          )}

          <div className="form-actions">
            <button type="submit" className="btn" disabled={saving}>
              <Icon name="check" size={17} /> {saving ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Adicionar item'}
            </button>
            {editingId && (
              <button type="button" className="btn ghost" onClick={resetForm}>
                Cancelar edição
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="card pad-card stack">
        <h2>Itens cadastrados ({products.length})</h2>
        {products.length === 0 ? (
          <p className="small">Nenhum item adicionado ainda.</p>
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Status</th>
                  <th>Cliques</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="prd-row-cell">
                        {p.imageUrl && <img src={p.imageUrl} alt="" className="prd-mini" />}
                        <div>
                          <b>{p.title}</b>
                          <div className="small">
                            {p.category}
                            {p.priceLabel ? ` · ${p.priceLabel}` : ''}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`pill ${p.active ? 'ok' : 'soon'}`}>
                        {p.active ? 'Ativo' : 'Oculto'}
                      </span>
                    </td>
                    <td>{p.clicks}</td>
                    <td>
                      <div className="table-actions">
                        <button type="button" className="btn sm ghost" onClick={() => startEdit(p)}>
                          Editar
                        </button>
                        <button
                          type="button"
                          className="btn sm ghost danger"
                          onClick={() => void remove(p.id)}
                          aria-label={`Excluir ${p.title}`}
                        >
                          <Icon name="trash" size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
