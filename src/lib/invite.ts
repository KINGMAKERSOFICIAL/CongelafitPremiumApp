import { RECIPES } from '../data';

/** Página de vendas do CongelaFit. */
export const SALES_URL = 'https://congelafit.store';
export const SALES_HOST = 'congelafit.store';

/** Link da página de vendas com UTMs (a Utmify da página de vendas lê esses parâmetros). */
export function salesLink(medium: string, campaign = 'app'): string {
  const q = new URLSearchParams({ utm_source: 'app', utm_medium: medium, utm_campaign: campaign });
  return `${SALES_URL}/?${q.toString()}`;
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
    `👉 Conheça o app: ${salesLink('lista', 'compartilhar')}`,
  ];
}

/** Texto que vai para a área de transferência quando alguém tenta copiar o conteúdo do app. */
export function copyNotice(): string {
  return `🔒 Conteúdo exclusivo dos membros do CongelaFit Premium.\n👉 Conheça o app: ${salesLink('copia', 'protecao')}`;
}
