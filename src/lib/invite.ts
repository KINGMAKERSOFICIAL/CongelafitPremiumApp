import { RECIPES } from '../data';

/** Página de vendas / domínio oficial padrão do CongelaFit. */
export const SALES_URL = 'https://www.congelafit.com.br';
export const SALES_HOST = 'www.congelafit.com.br';

let currentSiteUrl = SALES_URL;

export function setOfficialSiteUrl(url: string | undefined): void {
  const clean = (url || '').trim().replace(/\/+$/, '');
  if (!clean) {
    currentSiteUrl = SALES_URL;
    return;
  }
  try {
    const parsed = new URL(clean);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      currentSiteUrl = clean;
    }
  } catch {
    /* mantém padrão */
  }
}

export function getOfficialSiteUrl(): string {
  return currentSiteUrl;
}

export function getOfficialSiteHost(): string {
  return currentSiteUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

export const PURCHASE_URL = 'https://congelafit.store/';
export const PURCHASE_HOST = 'congelafit.store';

/** Link da página de vendas com UTMs (a Utmify da página de vendas lê esses parâmetros). */
export function salesLink(medium: string, campaign = 'app'): string {
  const q = new URLSearchParams({ utm_source: 'app', utm_medium: medium, utm_campaign: campaign });
  return `${currentSiteUrl}/?${q.toString()}`;
}

/** "mais de 500": arredonda para baixo para a centena, sem inventar número. */
export function recipesCountLabel(total = RECIPES.length): string {
  return `mais de ${Math.floor(total / 100) * 100}`;
}

/** Rodapé da mensagem de WhatsApp da lista de compras: convida quem recebe a conhecer o app. */
export function shoppingInviteFooter(): string[] {
  return [
    '———',
    '🛒 Lista montada no *CongelaFit Premium*: você escolhe as receitas da semana e o app soma os ingredientes e separa por seção do mercado.',
    `❄️ São ${recipesCountLabel()} receitas para congelar, com planner da semana e controle de validade do freezer.`,
    `👉 Conheça o app: ${PURCHASE_URL}`,
  ];
}

/** Texto que vai para a área de transferência quando alguém tenta copiar o conteúdo do app. */
export function copyNotice(): string {
  return `🔒 Conteúdo exclusivo dos membros do CongelaFit Premium.\n👉 Conheça o app: ${salesLink('copia', 'protecao')}`;
}
