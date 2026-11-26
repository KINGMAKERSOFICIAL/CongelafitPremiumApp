import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CATEGORIES, RECIPES, SECTIONS, getCategory, getRecipe, search } from '../data';
import { Icon } from '../components/Icon';
import { PasswordInput } from '../components/PasswordInput';
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
  officialSiteUrl?: string;
  appBaseUrl?: string;
  kiwifyWebhookToken: string;
  kiwifyCheckoutUrl: string;
  kiwifyAffiliateInviteUrl: string;
  kiwifyClientId?: string;
  kiwifyAccountId?: string;
  kiwifyProductId?: string;
  kiwifyLastSyncAt?: string | null;
  hasKiwifyClientSecret?: boolean;
  emailProvider?: 'auto' | 'smtp' | 'resend' | 'outbox';
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUser?: string;
  hasSmtpPass?: boolean;
  hasResendKey?: boolean;
  emailFromName?: string;
  emailFromAddress?: string;
  sendSuspensionEmail?: boolean;
  activeEmailProvider?: 'smtp' | 'resend' | 'outbox';
  envEmailConfigured?: boolean;
  envKiwifyApiConfigured?: boolean;
  kiwifyApiConfigured?: boolean;
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

interface EmailLogItem {
  id: string;
  sentAt: string;
  to: string;
  name: string;
  type: 'welcome' | 'reactivated' | 'reset' | 'suspended' | 'test';
  subject: string;
  provider: 'smtp' | 'resend' | 'outbox';
  status: 'sent' | 'failed' | 'outbox';
  error?: string;
}

type EmailTemplateType = 'welcome' | 'reset' | 'reactivated' | 'suspended' | 'test';

interface EmailTemplateItem {
  type: EmailTemplateType;
  label: string;
  description: string;
  variables: Array<{ key: string; label: string }>;
  isCustom: boolean;
  updatedAt: string | null;
  subject: string;
  html: string;
  defaultSubject: string;
  defaultHtml: string;
  previewSubject: string;
  previewHtml: string;
}

interface AdminMember {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'member';
  status: 'active' | 'pending' | 'suspended' | 'refunded' | 'canceled';
  needsPasswordSetup: boolean;
  mustChangePassword?: boolean;
  loginCount: number;
  kiwifyOrderId: string;
  kiwifyProduct: string;
  suspendedReason?: string;
  accessEmailSentAt?: string | null;
  accessEmailStatus?: 'sent' | 'failed' | 'outbox' | null;
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
  pending: 'Aguardando pgto',
  suspended: 'Suspenso (não pago)',
  refunded: 'Reembolsado',
  canceled: 'Cancelado',
};

const EMAIL_TYPE_LABEL: Record<string, string> = {
  welcome: 'Boas-vindas + Senha',
  reactivated: 'Reativação',
  reset: 'Nova senha',
  suspended: 'Aviso suspensão',
  test: 'Teste',
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
          <Icon name="link" size={16} /> Kiwify, E-mail e Usuários
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

/* ═════════ ABA 2: KIWIFY, E-MAIL AUTOMÁTICO & USUÁRIOS ═════════ */
function KiwifyTab({ onConfigChanged }: { onConfigChanged: () => Promise<void> }) {
  const [settings, setSettings] = useState<KiwifySettings | null>(null);
  const [hosting, setHosting] = useState<KiwifyHosting | null>(null);
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [emailLogs, setEmailLogs] = useState<EmailLogItem[]>([]);
  const [members, setMembers] = useState<AdminMember[]>([]);

  // Domínio oficial, Webhook e Links
  const [officialSiteUrl, setOfficialSiteUrl] = useState('https://www.congelafit.com.br');
  const [appBaseUrl, setAppBaseUrl] = useState('');
  const [token, setToken] = useState('');
  const [checkoutUrl, setCheckoutUrl] = useState('');
  const [affiliateInviteUrl, setAffiliateInviteUrl] = useState('');

  // API Direta Kiwify (OAuth)
  const [kiwifyClientId, setKiwifyClientId] = useState('');
  const [kiwifyClientSecret, setKiwifyClientSecret] = useState('');
  const [kiwifyAccountId, setKiwifyAccountId] = useState('');
  const [kiwifyProductId, setKiwifyProductId] = useState('');

  // Configuração de E-mail (SMTP / Resend)
  const [emailProvider, setEmailProvider] = useState<'auto' | 'smtp' | 'resend' | 'outbox'>('auto');
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [resendApiKey, setResendApiKey] = useState('');
  const [emailFromName, setEmailFromName] = useState('CongelaFit Premium');
  const [emailFromAddress, setEmailFromAddress] = useState('');
  const [sendSuspensionEmail, setSendSuspensionEmail] = useState(true);

  const [saving, setSaving] = useState(false);
  const [probing, setProbing] = useState(false);
  const [testingApi, setTestingApi] = useState(false);
  const [syncingSales, setSyncingSales] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [testEmailDest, setTestEmailDest] = useState('');
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplateItem[]>([]);
  const [selectedTplType, setSelectedTplType] = useState<EmailTemplateType>('welcome');
  const [draftSubject, setDraftSubject] = useState('');
  const [draftHtml, setDraftHtml] = useState('');
  const [livePreview, setLivePreview] = useState<{ subject: string; html: string } | null>(null);
  const [previewViewport, setPreviewViewport] = useState<'desktop' | 'mobile'>('desktop');
  const [savingTpl, setSavingTpl] = useState(false);
  const [resettingTpl, setResettingTpl] = useState(false);
  const editorSectionRef = useRef<HTMLElement>(null);
  const htmlTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [err, setErr] = useState('');

  // Simular webhook
  const [testEmail, setTestEmail] = useState('');
  const [testName, setTestName] = useState('Cliente Teste');
  const [testEvent, setTestEvent] = useState('order_approved');

  // Novo membro manual
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newPass, setNewPass] = useState('');
  const [autoGenPass, setAutoGenPass] = useState(true);
  const [sendWelcomeEmail, setSendWelcomeEmail] = useState(true);

  // Filtro de usuários e senha gerada exibida uma única vez ao Admin
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'pending' | 'suspended' | 'inactive'>('all');
  const [issuedAccess, setIssuedAccess] = useState<{
    email: string;
    password: string;
    emailStatus?: string;
    emailError?: string;
  } | null>(null);

  const loadAll = useCallback(async () => {
    const [kiwify, mem, tplRes] = await Promise.all([
      apiFetch<{
        settings: KiwifySettings;
        webhookLogs: WebhookLog[];
        emailLogs: EmailLogItem[];
        hosting?: KiwifyHosting;
      }>('/api/admin/kiwify'),
      apiFetch<{ members: AdminMember[] }>('/api/admin/members'),
      apiFetch<{ templates: EmailTemplateItem[] }>('/api/admin/email/templates'),
    ]);
    setSettings(kiwify.settings);
    setHosting(kiwify.hosting ?? null);
    setLogs(kiwify.webhookLogs);
    setEmailLogs(kiwify.emailLogs ?? []);
    setOfficialSiteUrl(kiwify.settings.officialSiteUrl ?? 'https://www.congelafit.com.br');
    setAppBaseUrl(kiwify.settings.appBaseUrl ?? '');
    setToken(kiwify.settings.kiwifyWebhookToken);
    setCheckoutUrl(kiwify.settings.kiwifyCheckoutUrl);
    setAffiliateInviteUrl(kiwify.settings.kiwifyAffiliateInviteUrl);
    setKiwifyClientId(kiwify.settings.kiwifyClientId ?? '');
    setKiwifyAccountId(kiwify.settings.kiwifyAccountId ?? '');
    setKiwifyProductId(kiwify.settings.kiwifyProductId ?? '');
    setEmailProvider(kiwify.settings.emailProvider ?? 'auto');
    setSmtpHost(kiwify.settings.smtpHost ?? '');
    setSmtpPort(String(kiwify.settings.smtpPort ?? 587));
    setSmtpSecure(Boolean(kiwify.settings.smtpSecure));
    setSmtpUser(kiwify.settings.smtpUser ?? '');
    setEmailFromName(kiwify.settings.emailFromName ?? 'CongelaFit Premium');
    setEmailFromAddress(kiwify.settings.emailFromAddress ?? '');
    setSendSuspensionEmail(kiwify.settings.sendSuspensionEmail !== false);
    setMembers(mem.members);
    setEmailTemplates(tplRes.templates);
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const activeTemplate = useMemo(
    () => emailTemplates.find((t) => t.type === selectedTplType) ?? null,
    [emailTemplates, selectedTplType],
  );

  // Sincroniza rascunho ao trocar o tipo selecionado ou ao carregar pela primeira vez
  useEffect(() => {
    if (!activeTemplate) return;
    setDraftSubject(activeTemplate.subject);
    setDraftHtml(activeTemplate.html);
    setLivePreview({
      subject: activeTemplate.previewSubject,
      html: activeTemplate.previewHtml,
    });
  }, [activeTemplate]);

  // Atualiza a prévia visual automaticamente conforme o admin edita o HTML ou Assunto
  useEffect(() => {
    if (!activeTemplate) return;
    const timer = window.setTimeout(() => {
      void apiFetch<{ subject: string; html: string }>('/api/admin/email/preview', {
        method: 'POST',
        body: JSON.stringify({
          type: selectedTplType,
          subject: draftSubject,
          html: draftHtml,
        }),
      })
        .then((res) => setLivePreview({ subject: res.subject, html: res.html }))
        .catch(() => {
          /* mantém última prévia válida */
        });
    }, 240);
    return () => window.clearTimeout(timer);
  }, [activeTemplate, selectedTplType, draftSubject, draftHtml]);

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
          officialSiteUrl: officialSiteUrl.trim().replace(/\/+$/, ''),
          appBaseUrl: appBaseUrl.trim().replace(/\/+$/, ''),
          kiwifyWebhookToken: token.trim(),
          kiwifyCheckoutUrl: checkoutUrl.trim(),
          kiwifyAffiliateInviteUrl: affiliateInviteUrl.trim(),
          kiwifyClientId: kiwifyClientId.trim(),
          kiwifyClientSecret: kiwifyClientSecret.trim() || undefined,
          kiwifyAccountId: kiwifyAccountId.trim(),
          kiwifyProductId: kiwifyProductId.trim(),
          emailProvider,
          smtpHost: smtpHost.trim(),
          smtpPort: Number(smtpPort) || 587,
          smtpSecure,
          smtpUser: smtpUser.trim(),
          smtpPass: smtpPass.trim() || undefined,
          resendApiKey: resendApiKey.trim() || undefined,
          emailFromName: emailFromName.trim() || 'CongelaFit Premium',
          emailFromAddress: emailFromAddress.trim(),
          sendSuspensionEmail,
        }),
      });
      setKiwifyClientSecret('');
      setSmtpPass('');
      setResendApiKey('');
      await loadAll();
      await onConfigChanged();
      toast('Configurações salvas com sucesso.');
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

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${label} copiado.`);
    } catch {
      toast('Copie o valor exibido no campo.');
    }
  };

  const testEndpointLive = async () => {
    setProbing(true);
    try {
      const res = await fetch('/api/webhooks/kiwify');
      const data = (await res.json()) as { ok?: boolean };
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

  const testKiwifyApi = async () => {
    setTestingApi(true);
    try {
      const res = await apiFetch<{ message: string }>('/api/admin/kiwify/test-connection', { method: 'POST' });
      toast(res.message);
    } catch (e2) {
      toast(e2 instanceof Error ? e2.message : 'Falha ao conectar na API da Kiwify.');
    } finally {
      setTestingApi(false);
    }
  };

  const syncKiwifySales = async () => {
    setSyncingSales(true);
    try {
      const res = await apiFetch<{ message: string }>('/api/admin/kiwify/sync', { method: 'POST' });
      toast(res.message);
      await loadAll();
    } catch (e2) {
      toast(e2 instanceof Error ? e2.message : 'Falha ao sincronizar vendas.');
    } finally {
      setSyncingSales(false);
    }
  };

  const sendTestMail = async () => {
    setTestingEmail(true);
    try {
      const res = await apiFetch<{ ok: boolean; status: string; provider: string; error?: string }>(
        '/api/admin/email/test',
        {
          method: 'POST',
          body: JSON.stringify({ to: testEmailDest.trim() }),
        },
      );
      if (res.status === 'sent') {
        toast(`E-mail de teste enviado via ${res.provider.toUpperCase()}!`);
      } else if (res.status === 'outbox') {
        toast('Modo teste local ativo: configure SMTP ou Resend para envio real.');
      } else {
        toast(res.error || 'Falha no envio do e-mail de teste.');
      }
      await loadAll();
    } catch (e2) {
      toast(e2 instanceof Error ? e2.message : 'Erro ao enviar e-mail de teste.');
    } finally {
      setTestingEmail(false);
    }
  };

  const scrollToEmailEditor = () => {
    editorSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const insertVariable = (varKey: string) => {
    const tokenText = `{{${varKey}}}`;
    const el = htmlTextareaRef.current;
    if (!el) {
      setDraftHtml((prev) => `${prev}${tokenText}`);
      return;
    }
    const start = el.selectionStart ?? draftHtml.length;
    const end = el.selectionEnd ?? draftHtml.length;
    const next = `${draftHtml.slice(0, start)}${tokenText}${draftHtml.slice(end)}`;
    setDraftHtml(next);
    window.requestAnimationFrame(() => {
      el.focus();
      const pos = start + tokenText.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const saveEmailTemplate = async () => {
    setSavingTpl(true);
    try {
      const res = await apiFetch<{ template?: EmailTemplateItem; templates: EmailTemplateItem[] }>(
        `/api/admin/email/templates/${selectedTplType}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            subject: draftSubject,
            html: draftHtml,
          }),
        },
      );
      setEmailTemplates(res.templates);
      if (res.template) {
        setDraftSubject(res.template.subject);
        setDraftHtml(res.template.html);
        setLivePreview({ subject: res.template.previewSubject, html: res.template.previewHtml });
      }
      toast('Modelo HTML do e-mail salvo!');
    } catch (e2) {
      toast(e2 instanceof Error ? e2.message : 'Erro ao salvar modelo HTML.');
    } finally {
      setSavingTpl(false);
    }
  };

  const resetEmailTemplate = async () => {
    setResettingTpl(true);
    try {
      const res = await apiFetch<{ template?: EmailTemplateItem; templates: EmailTemplateItem[] }>(
        `/api/admin/email/templates/${selectedTplType}`,
        { method: 'DELETE' },
      );
      setEmailTemplates(res.templates);
      if (res.template) {
        setDraftSubject(res.template.subject);
        setDraftHtml(res.template.html);
        setLivePreview({ subject: res.template.previewSubject, html: res.template.previewHtml });
      }
      toast('Modelo restaurado para o padrão CongelaFit.');
    } catch (e2) {
      toast(e2 instanceof Error ? e2.message : 'Erro ao restaurar modelo padrão.');
    } finally {
      setResettingTpl(false);
    }
  };

  const simulateWebhook = async (e: FormEvent) => {
    e.preventDefault();
    if (!testEmail.trim()) return;
    try {
      const targetEmail = testEmail.trim().toLowerCase();
      const res = await apiFetch<{
        message: string;
        generatedPassword?: string;
        emailStatus?: string;
      }>('/api/admin/kiwify/test', {
        method: 'POST',
        body: JSON.stringify({ email: targetEmail, name: testName.trim(), event: testEvent }),
      });
      toast(res.message);
      if (res.generatedPassword) {
        setIssuedAccess({
          email: targetEmail,
          password: res.generatedPassword,
          emailStatus: res.emailStatus,
        });
      }
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
      const targetEmail = newEmail.trim().toLowerCase();
      const res = await apiFetch<{
        generatedPassword?: string;
        emailResult?: { status: string; error?: string };
      }>('/api/admin/members', {
        method: 'POST',
        body: JSON.stringify({
          email: targetEmail,
          name: newName.trim(),
          password: autoGenPass ? '' : newPass,
          autoGeneratePassword: autoGenPass,
          sendEmail: sendWelcomeEmail,
        }),
      });
      toast('Membro adicionado!');
      if (res.generatedPassword) {
        setIssuedAccess({
          email: targetEmail,
          password: res.generatedPassword,
          emailStatus: res.emailResult?.status,
          emailError: res.emailResult?.error,
        });
      }
      setNewEmail('');
      setNewName('');
      setNewPass('');
      await loadAll();
    } catch (e2) {
      toast(e2 instanceof Error ? e2.message : 'Erro ao adicionar membro.');
    }
  };

  const sendMemberAccess = async (member: AdminMember) => {
    try {
      const res = await apiFetch<{
        generatedPassword?: string;
        emailStatus?: string;
        emailError?: string;
      }>(`/api/admin/members/${member.id}/send-access`, {
        method: 'POST',
        body: JSON.stringify({ activate: true }),
      });
      if (res.generatedPassword) {
        setIssuedAccess({
          email: member.email,
          password: res.generatedPassword,
          emailStatus: res.emailStatus,
          emailError: res.emailError,
        });
      }
      toast(
        res.emailStatus === 'sent'
          ? `Nova senha gerada e enviada para ${member.email}!`
          : `Nova senha gerada para ${member.email}.`,
      );
      await loadAll();
    } catch (e2) {
      toast(e2 instanceof Error ? e2.message : 'Erro ao gerar e enviar acesso.');
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

  const filteredMembers = useMemo(() => {
    if (statusFilter === 'all') return members;
    if (statusFilter === 'inactive') {
      return members.filter((m) => m.status === 'refunded' || m.status === 'canceled');
    }
    return members.filter((m) => m.status === statusFilter);
  }, [members, statusFilter]);

  if (!settings) {
    return (
      <div className="card pad-card">
        <p className="small">Carregando integração Kiwify e E-mails…</p>
      </div>
    );
  }

  return (
    <div className="stack">
      {issuedAccess && (
        <div className="callout ok" role="status">
          <Icon name="check" size={18} />
          <div style={{ flex: 1 }}>
            <b>Acesso gerado para {issuedAccess.email}</b>
            <p>
              Senha temporária: <code>{issuedAccess.password}</code> · Envio de e-mail:{' '}
              <b>
                {issuedAccess.emailStatus === 'sent'
                  ? 'Enviado para a caixa de entrada!'
                  : issuedAccess.emailStatus === 'failed'
                    ? `Falhou (${issuedAccess.emailError ?? 'erro SMTP'})`
                    : 'Caixa de saída (configure SMTP/Resend abaixo para envio automático)'}
              </b>
            </p>
          </div>
          <div className="table-actions">
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => void copyText(`E-mail: ${issuedAccess.email}\nSenha: ${issuedAccess.password}`, 'Credenciais')}
            >
              <Icon name="copy" size={14} /> Copiar dados
            </button>
            <button type="button" className="btn ghost sm" onClick={() => setIssuedAccess(null)}>
              Fechar
            </button>
          </div>
        </div>
      )}

      <form className="stack" onSubmit={saveSettings}>
        {/* BLOCO 1: WEBHOOK KIWIFY */}
        <section className="card pad-card stack">
          <div className="dash-head">
            <h2>1. Comunicação em Tempo Real — Webhook Kiwify</h2>
            <div className="table-actions">
              <a href="https://kiwify.com.br/" target="_blank" rel="noopener noreferrer" className="btn ghost sm">
                <Icon name="external" size={14} /> Abrir Kiwify
              </a>
              <a
                href={officialSiteUrl.trim() || 'https://www.congelafit.com.br'}
                target="_blank"
                rel="noopener noreferrer"
                className="btn ghost sm"
              >
                <Icon name="external" size={14} /> Site CongelaFit
              </a>
            </div>
          </div>
          <p className="small">
            Quando o cliente compra, a Kiwify avisa este servidor automaticamente: o app <b>gera e-mail + senha</b> e
            envia para o aluno. Se o pagamento atrasar, for recusado, cancelado ou reembolsado, a plataforma{' '}
            <b>suspende o acesso na hora</b>.
          </p>

          <div className="field">
            <label htmlFor="kw-url">URL do Webhook pronta para colar na Kiwify</label>
            <div className="field-row">
              <input id="kw-url" type="text" readOnly value={webhookUrl} />
              <button type="button" className="btn ghost" onClick={() => void copyText(webhookUrl, 'URL do Webhook')}>
                <Icon name="copy" size={16} /> Copiar URL
              </button>
              <button type="button" className="btn ghost" onClick={() => void testEndpointLive()} disabled={probing}>
                <Icon name="check" size={16} /> {probing ? 'Testando…' : 'Verificar status'}
              </button>
            </div>
            <p className="hint">
              Se preferir validar pela assinatura HMAC-SHA1 da Kiwify, use <code>{webhookBaseUrl}</code> e cole o
              Token gerado pela Kiwify no campo &ldquo;Token / Segredo&rdquo; abaixo.
            </p>
          </div>

          <div className="field">
            <label htmlFor="kw-official-site">Domínio oficial do aplicativo e site (editável a qualquer momento)</label>
            <div className="field-row">
              <input
                id="kw-official-site"
                type="url"
                placeholder="https://www.congelafit.com.br"
                value={officialSiteUrl}
                onChange={(e) => setOfficialSiteUrl(e.target.value)}
                required
              />
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => setOfficialSiteUrl('https://www.congelafit.com.br')}
              >
                Usar www.congelafit.com.br
              </button>
            </div>
            <p className="hint">
              Alterar este domínio atualiza automaticamente os links do rodapé, tela Sobre, etiquetas, mensagens de
              convite e rodapé dos e-mails enviados aos alunos.
            </p>
          </div>

          <div className="field">
            <label htmlFor="kw-host">Domínio onde o app está hospedado (usado no link de login do e-mail)</label>
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
                Usar servidor atual ({detectedPublicOrigin.replace(/^https?:\/\//, '').slice(0, 30)}
                {detectedPublicOrigin.replace(/^https?:\/\//, '').length > 30 ? '…' : ''})
              </button>
              <button
                type="button"
                className={`chip ${appBaseUrl.trim() === 'https://www.congelafit.com.br' ? 'on' : ''}`}
                onClick={() => setAppBaseUrl('https://www.congelafit.com.br')}
              >
                https://www.congelafit.com.br
              </button>
              <button
                type="button"
                className={`chip ${appBaseUrl.trim() === 'https://app.congelafit.com.br' ? 'on' : ''}`}
                onClick={() => setAppBaseUrl('https://app.congelafit.com.br')}
              >
                https://app.congelafit.com.br
              </button>
            </div>
          </div>

          <div className="field-grid">
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
                  <Icon name="reset" size={16} /> Gerar
                </button>
              </div>
            </div>
            <div className="field">
              <label htmlFor="kw-checkout">Site / Checkout do CongelaFit</label>
              <input
                id="kw-checkout"
                type="url"
                placeholder="https://www.congelafit.com.br"
                value={checkoutUrl}
                onChange={(e) => setCheckoutUrl(e.target.value)}
              />
            </div>
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

          <div className="callout ok">
            <Icon name="info" size={18} />
            <div>
              <b>Passo a passo na Kiwify (Webhook)</b>
              <p>
                1. Entre em <b>https://dashboard.kiwify.com.br</b> → <b>Apps → Webhooks → Criar Webhook</b>.
                <br />
                2. Cole a URL acima e selecione o produto <b>CongelaFit</b>.
                <br />
                3. Marque os eventos de <b>liberação</b> (<i>Compra aprovada</i>, <i>Assinatura renovada</i>) e os de{' '}
                <b>suspensão automática</b> (<i>Compra recusada</i>, <i>Boleto/Pix gerado</i>, <i>Assinatura atrasada</i>,{' '}
                <i>Assinatura cancelada</i>, <i>Compra reembolsada</i>, <i>Chargeback</i>).
              </p>
            </div>
          </div>
        </section>

        {/* BLOCO 2: API DIRETA DA KIWIFY (OAUTH 2.0) */}
        <section className="card pad-card stack">
          <div className="dash-head">
            <h2>2. API Direta da Kiwify (Sincronização de Vendas OAuth)</h2>
            <span className={`pill ${settings.kiwifyApiConfigured ? 'ok' : 'soon'}`}>
              {settings.kiwifyApiConfigured ? 'API configurada' : 'Opcional / Não configurada'}
            </span>
          </div>
          <p className="small">
            Além do Webhook em tempo real, conecte a <b>API Pública da Kiwify</b> para consultar vendas antigas ou
            conferir inadimplências diretamente na Kiwify com um clique.
          </p>

          <div className="field-grid">
            <div className="field">
              <label htmlFor="kw-account">Account ID (x-kiwify-account-id)</label>
              <input
                id="kw-account"
                type="text"
                placeholder="Ex: acc_xxxxxxxx"
                value={kiwifyAccountId}
                onChange={(e) => setKiwifyAccountId(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="kw-client-id">Client ID</label>
              <input
                id="kw-client-id"
                type="text"
                placeholder="Ex: client_xxxxxxxx"
                value={kiwifyClientId}
                onChange={(e) => setKiwifyClientId(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="kw-client-secret">
                Client Secret {settings.hasKiwifyClientSecret && <small>(já salvo — deixe vazio para manter)</small>}
              </label>
              <PasswordInput
                id="kw-client-secret"
                placeholder={settings.hasKiwifyClientSecret ? '••••••••••••' : 'Cole o Client Secret da Kiwify'}
                value={kiwifyClientSecret}
                onChange={(e) => setKiwifyClientSecret(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="kw-product-id">ID do Produto na Kiwify (opcional — filtra só CongelaFit)</label>
              <input
                id="kw-product-id"
                type="text"
                placeholder="Deixe vazio para todos os produtos"
                value={kiwifyProductId}
                onChange={(e) => setKiwifyProductId(e.target.value)}
              />
            </div>
          </div>

          <div className="table-actions">
            <button type="button" className="btn ghost" onClick={() => void testKiwifyApi()} disabled={testingApi}>
              <Icon name="check" size={16} /> {testingApi ? 'Conectando…' : 'Testar API Kiwify'}
            </button>
            <button type="button" className="btn ghost" onClick={() => void syncKiwifySales()} disabled={syncingSales}>
              <Icon name="reset" size={16} /> {syncingSales ? 'Sincronizando…' : 'Sincronizar vendas agora'}
            </button>
            {settings.kiwifyLastSyncAt && (
              <span className="small">
                Última sincronização: {new Date(settings.kiwifyLastSyncAt).toLocaleString('pt-BR')}
              </span>
            )}
          </div>
          <p className="hint">
            Onde pegar na Kiwify: <b>Apps → API → Criar API Key</b>. Copie <b>Client ID</b>, <b>Client Secret</b> e{' '}
            <b>Account ID</b>.
          </p>
        </section>

        {/* BLOCO 3: ENVIO AUTOMÁTICO DE E-MAIL AOS ALUNOS */}
        <section className="card pad-card stack">
          <div className="dash-head">
            <h2>3. Envio Automático de E-mail (Login e Senha ao Aluno)</h2>
            <span className={`pill ${settings.activeEmailProvider === 'outbox' ? 'soon' : 'ok'}`}>
              {settings.activeEmailProvider === 'smtp'
                ? 'SMTP ativo'
                : settings.activeEmailProvider === 'resend'
                  ? 'Resend ativo'
                  : 'Modo teste (Caixa de saída)'}
            </span>
          </div>
          <p className="small">
            Configure o servidor de e-mail para que cada aluno receba automaticamente na caixa de entrada seu{' '}
            <b>e-mail</b> e <b>senha gerada</b> assim que o pagamento for confirmado.
          </p>

          <div className="field-grid">
            <div className="field">
              <label htmlFor="mail-prov">Provedor de disparo</label>
              <select
                id="mail-prov"
                value={emailProvider}
                onChange={(e) => setEmailProvider(e.target.value as 'auto' | 'smtp' | 'resend' | 'outbox')}
              >
                <option value="auto">Automático (usa Resend ou SMTP se configurados)</option>
                <option value="smtp">SMTP (Gmail, Brevo, Hostinger, Zoho)</option>
                <option value="resend">Resend API (recomendado para produção)</option>
                <option value="outbox">Apenas caixa de saída local (teste)</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="mail-from-name">Nome do remetente</label>
              <input
                id="mail-from-name"
                type="text"
                value={emailFromName}
                onChange={(e) => setEmailFromName(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="mail-from-addr">E-mail remetente (From)</label>
              <input
                id="mail-from-addr"
                type="email"
                placeholder="acesso@congelafit.com.br ou seu@gmail.com"
                value={emailFromAddress}
                onChange={(e) => setEmailFromAddress(e.target.value)}
              />
            </div>
          </div>

          <div className="field-grid">
            <div className="field">
              <label htmlFor="smtp-host">Servidor SMTP (Host)</label>
              <input
                id="smtp-host"
                type="text"
                placeholder="Ex: smtp.gmail.com ou smtp-relay.brevo.com"
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="smtp-port">Porta SMTP</label>
              <input
                id="smtp-port"
                type="number"
                placeholder="587"
                value={smtpPort}
                onChange={(e) => setSmtpPort(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="smtp-user">Usuário SMTP</label>
              <input
                id="smtp-user"
                type="text"
                placeholder="seuemail@gmail.com"
                value={smtpUser}
                onChange={(e) => setSmtpUser(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="smtp-pass">
                Senha SMTP / App Password {settings.hasSmtpPass && <small>(já salva — vazio mantém)</small>}
              </label>
              <PasswordInput
                id="smtp-pass"
                placeholder={settings.hasSmtpPass ? '••••••••••••' : 'Senha de aplicativo SMTP'}
                value={smtpPass}
                onChange={(e) => setSmtpPass(e.target.value)}
              />
            </div>
          </div>

          <div className="field-grid">
            <div className="field">
              <label htmlFor="resend-key">
                Resend API Key (alternativa ao SMTP){' '}
                {settings.hasResendKey && <small>(já salva — vazio mantém)</small>}
              </label>
              <PasswordInput
                id="resend-key"
                placeholder={settings.hasResendKey ? '••••••••••••' : 're_xxxxxxxx...'}
                value={resendApiKey}
                onChange={(e) => setResendApiKey(e.target.value)}
              />
            </div>
            <div className="field" style={{ justifyContent: 'flex-end' }}>
              <label className="check-inline">
                <input
                  type="checkbox"
                  checked={smtpSecure}
                  onChange={(e) => setSmtpSecure(e.target.checked)}
                />
                <span>Usar SSL/TLS direto (porta 465)</span>
              </label>
              <label className="check-inline" style={{ marginTop: 6 }}>
                <input
                  type="checkbox"
                  checked={sendSuspensionEmail}
                  onChange={(e) => setSendSuspensionEmail(e.target.checked)}
                />
                <span>Avisar o aluno por e-mail quando o acesso for suspenso</span>
              </label>
            </div>
          </div>

          <div className="field-row">
            <input
              type="email"
              placeholder="E-mail para receber um teste agora (ex: seuemail@gmail.com)"
              value={testEmailDest}
              onChange={(e) => setTestEmailDest(e.target.value)}
            />
            <button type="button" className="btn ghost" onClick={() => void sendTestMail()} disabled={testingEmail}>
              <Icon name="send" size={16} /> {testingEmail ? 'Enviando…' : 'Enviar e-mail de teste'}
            </button>
            <button type="button" className="btn ghost" onClick={scrollToEmailEditor}>
              <Icon name="edit" size={16} /> Editar e visualizar HTML
            </button>
          </div>

          {err && (
            <p className="form-err" role="alert">
              {err}
            </p>
          )}

          <div className="form-actions">
            <button type="submit" className="btn" disabled={saving}>
              <Icon name="check" size={17} /> {saving ? 'Salvando…' : 'Salvar todas as configurações'}
            </button>
          </div>
        </section>
      </form>

      {/* BLOCO 3B: EDITOR E PRÉVIA DO HTML DOS E-MAILS */}
      <section ref={editorSectionRef} className="card pad-card stack">
        <div className="dash-head">
          <div>
            <h2>Editor do HTML dos E-mails + Prévia ao Vivo</h2>
            <p className="small">
              Edite o código HTML e o assunto de cada e-mail enviado aos alunos e veja na hora como ele aparece na caixa de entrada.
            </p>
          </div>
          {activeTemplate && (
            <span className={`pill ${activeTemplate.isCustom ? 'soon' : 'ok'}`}>
              {activeTemplate.isCustom ? 'HTML personalizado ativo' : 'Padrão CongelaFit'}
            </span>
          )}
        </div>

        <div className="chips compact">
          {emailTemplates.map((tpl) => (
            <button
              key={tpl.type}
              type="button"
              className={`chip ${selectedTplType === tpl.type ? 'on' : ''}`}
              onClick={() => setSelectedTplType(tpl.type)}
            >
              {tpl.label} {tpl.isCustom ? '•' : ''}
            </button>
          ))}
        </div>

        {activeTemplate && (
          <>
            <p className="small">{activeTemplate.description}</p>
            <div className="email-editor-grid">
              <div className="stack">
                <div className="field">
                  <label htmlFor="tpl-subject">Assunto do e-mail</label>
                  <input
                    id="tpl-subject"
                    type="text"
                    value={draftSubject}
                    onChange={(e) => setDraftSubject(e.target.value)}
                    placeholder={activeTemplate.defaultSubject}
                  />
                </div>

                <div className="stack" style={{ gap: 6 }}>
                  <span className="small">
                    <b>Variáveis automáticas</b> (clique para inserir no HTML):
                  </span>
                  <div className="var-chips">
                    {activeTemplate.variables.map((v) => (
                      <button
                        key={v.key}
                        type="button"
                        className="var-chip"
                        onClick={() => insertVariable(v.key)}
                        title={`Inserir {{${v.key}}} (${v.label})`}
                      >
                        {`{{${v.key}}}`} · {v.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="tpl-html">Código HTML do e-mail</label>
                  <textarea
                    ref={htmlTextareaRef}
                    id="tpl-html"
                    className="email-code-input"
                    value={draftHtml}
                    onChange={(e) => setDraftHtml(e.target.value)}
                    spellCheck={false}
                  />
                </div>

                <div className="form-actions">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => void saveEmailTemplate()}
                    disabled={savingTpl}
                  >
                    <Icon name="check" size={16} /> {savingTpl ? 'Salvando…' : 'Salvar modelo HTML'}
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => void resetEmailTemplate()}
                    disabled={resettingTpl}
                    title="Restaura o HTML oficial com a logo e as cores do CongelaFit"
                  >
                    <Icon name="reset" size={16} />{' '}
                    {resettingTpl ? 'Restaurando…' : 'Restaurar padrão CongelaFit'}
                  </button>
                </div>
              </div>

              <div className="email-preview-shell">
                <div className="email-preview-bar">
                  <div>
                    <strong className="small" style={{ color: 'var(--ink)' }}>
                      Como o e-mail fica para o aluno
                    </strong>
                    {livePreview?.subject && (
                      <div className="small">
                        <b>Assunto:</b> {livePreview.subject}
                      </div>
                    )}
                  </div>
                  <div className="chips compact">
                    <button
                      type="button"
                      className={`chip ${previewViewport === 'desktop' ? 'on' : ''}`}
                      onClick={() => setPreviewViewport('desktop')}
                    >
                      Desktop
                    </button>
                    <button
                      type="button"
                      className={`chip ${previewViewport === 'mobile' ? 'on' : ''}`}
                      onClick={() => setPreviewViewport('mobile')}
                    >
                      Celular
                    </button>
                  </div>
                </div>

                {livePreview && (
                  <iframe
                    title="Prévia ao vivo do e-mail HTML CongelaFit"
                    sandbox=""
                    srcDoc={livePreview.html}
                    className={`email-preview-frame ${previewViewport === 'mobile' ? 'mobile' : ''}`}
                  />
                )}
              </div>
            </div>
          </>
        )}
      </section>

      {/* BLOCO 4: SIMULADOR + CRIAÇÃO MANUAL */}
      <div className="admin-two">
        <section className="card pad-card stack">
          <h2>Testar evento Webhook</h2>
          <p className="small">
            Simule uma compra aprovada (gera senha + dispara e-mail) ou um atraso/cancelamento (suspende na hora).
          </p>
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
                  <option value="order_approved">Compra aprovada (gera senha + e-mail)</option>
                  <option value="subscription_renewed">Renovação paga (reativa acesso)</option>
                  <option value="waiting_payment">Aguardando pagamento (bloqueado)</option>
                  <option value="subscription_late">Pagamento em atraso (suspende)</option>
                  <option value="order_rejected">Pagamento recusado (suspende)</option>
                  <option value="order_refunded">Reembolso (bloqueia)</option>
                  <option value="subscription_canceled">Assinatura cancelada (bloqueia)</option>
                </select>
              </div>
            </div>
            <button type="submit" className="btn ghost">
              <Icon name="send" size={16} /> Disparar simulação
            </button>
          </form>
        </section>

        <section className="card pad-card stack">
          <h2>Liberar usuário manualmente</h2>
          <p className="small">
            Cadastre o aluno manualmente com geração automática de senha e envio imediato de e-mail de boas-vindas.
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
              {!autoGenPass && (
                <div className="field">
                  <label htmlFor="mem-pass">Senha inicial</label>
                  <input
                    id="mem-pass"
                    type="text"
                    placeholder="Mín. 6 caracteres"
                    value={newPass}
                    onChange={(e) => setNewPass(e.target.value)}
                  />
                </div>
              )}
            </div>
            <label className="check-inline">
              <input type="checkbox" checked={autoGenPass} onChange={(e) => setAutoGenPass(e.target.checked)} />
              <span>Gerar senha segura automaticamente</span>
            </label>
            <label className="check-inline">
              <input
                type="checkbox"
                checked={sendWelcomeEmail}
                onChange={(e) => setSendWelcomeEmail(e.target.checked)}
              />
              <span>Enviar e-mail com login e senha para o aluno</span>
            </label>
            <button type="submit" className="btn">
              <Icon name="plus" size={16} /> Liberar acesso
            </button>
          </form>
        </section>
      </div>

      {/* BLOCO 5: MÓDULO DE USUÁRIOS E AUTENTICAÇÃO */}
      <section className="card pad-card stack">
        <div className="dash-head">
          <h2>Módulo de Usuários e Acessos ({filteredMembers.length})</h2>
          <div className="chips compact">
            {(
              [
                ['all', 'Todos'],
                ['active', 'Ativos'],
                ['pending', 'Pendentes'],
                ['suspended', 'Suspensos'],
                ['inactive', 'Cancel./Reemb.'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`chip ${statusFilter === key ? 'on' : ''}`}
                onClick={() => setStatusFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Usuário</th>
                <th>Status</th>
                <th>E-mail acesso</th>
                <th>Logins</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredMembers.map((m) => (
                <tr key={m.id}>
                  <td>
                    <b>{m.name}</b>
                    <div className="small">{m.email}</div>
                    {m.role === 'admin' && <span className="pill ok">Admin</span>}
                    {m.needsPasswordSetup && <span className="pill soon">Sem senha</span>}
                    {m.mustChangePassword && <span className="pill soon">Senha temporária</span>}
                    {m.suspendedReason && m.status !== 'active' && (
                      <div className="small" style={{ opacity: 0.85 }}>
                        {m.suspendedReason}
                      </div>
                    )}
                  </td>
                  <td>
                    <span
                      className={`pill ${m.status === 'active' ? 'ok' : m.status === 'pending' ? 'soon' : 'expired'}`}
                    >
                      {STATUS_LABEL[m.status] ?? m.status}
                    </span>
                  </td>
                  <td className="small">
                    {m.accessEmailStatus === 'sent' ? (
                      <span className="pill ok">Enviado</span>
                    ) : m.accessEmailStatus === 'failed' ? (
                      <span className="pill expired">Falhou</span>
                    ) : m.accessEmailStatus === 'outbox' ? (
                      <span className="pill soon">Gerado (teste)</span>
                    ) : (
                      '—'
                    )}
                    {m.accessEmailSentAt && (
                      <div>{new Date(m.accessEmailSentAt).toLocaleDateString('pt-BR')}</div>
                    )}
                  </td>
                  <td>{m.loginCount}</td>
                  <td>
                    {m.role !== 'admin' ? (
                      <div className="table-actions">
                        <button
                          type="button"
                          className="btn ghost sm"
                          onClick={() => void sendMemberAccess(m)}
                          title="Gera uma nova senha e envia por e-mail para o aluno"
                        >
                          <Icon name="send" size={14} /> Enviar senha
                        </button>
                        <button
                          type="button"
                          className="btn ghost sm"
                          onClick={() =>
                            void updateMember(m.id, { status: m.status === 'active' ? 'suspended' : 'active' })
                          }
                        >
                          {m.status === 'active' ? 'Suspender' : 'Reativar'}
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

      {/* BLOCO 6: LOG DE E-MAILS E WEBHOOKS */}
      <div className="admin-two">
        <section className="card pad-card stack">
          <h2>E-mails de Acesso Disparados</h2>
          {emailLogs.length === 0 ? (
            <p className="small">Nenhum disparo de e-mail registrado ainda.</p>
          ) : (
            <div className="table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Data/Hora</th>
                    <th>Destinatário</th>
                    <th>Tipo</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {emailLogs.slice(0, 20).map((e) => (
                    <tr key={e.id}>
                      <td className="small">{new Date(e.sentAt).toLocaleString('pt-BR')}</td>
                      <td>
                        <div>{e.to}</div>
                        <div className="small">{e.provider.toUpperCase()}</div>
                      </td>
                      <td className="small">{EMAIL_TYPE_LABEL[e.type] ?? e.type}</td>
                      <td>
                        <span
                          className={`pill ${e.status === 'sent' ? 'ok' : e.status === 'outbox' ? 'soon' : 'expired'}`}
                        >
                          {e.status === 'sent' ? 'Enviado' : e.status === 'outbox' ? 'Caixa de saída' : 'Falha'}
                        </span>
                        {e.error && <div className="small">{e.error}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card pad-card stack">
          <h2>Histórico de Webhooks Kiwify</h2>
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
                    <th>Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.slice(0, 20).map((l) => (
                    <tr key={l.id}>
                      <td className="small">{new Date(l.receivedAt).toLocaleString('pt-BR')}</td>
                      <td>
                        <code>{l.event}</code>
                        <div className="small">{l.orderId}</div>
                      </td>
                      <td>{l.email}</td>
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
