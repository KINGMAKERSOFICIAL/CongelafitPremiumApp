export type UserRole = 'admin' | 'member';
export type MemberStatus = 'active' | 'pending' | 'refunded' | 'canceled';

export interface StoredUser {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  passwordSalt: string;
  role: UserRole;
  status: MemberStatus;
  needsPasswordSetup: boolean;
  kiwifyOrderId?: string;
  kiwifySubscriptionId?: string;
  kiwifyProduct?: string;
  /** Último evento da Kiwify aplicado a este membro (ex.: order_approved). */
  lastKiwifyEvent?: string;
  /** Fim do acesso (ISO). Vazio = sem prazo (contas antigas). Admin ignora. */
  accessUntil?: string;
  affiliateLink?: string;
  loginCount: number;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RecipeImageOverride {
  url: string;
  mode: 'link' | 'upload';
  updatedAt: string;
}

export interface AffiliateProduct {
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
  updatedAt: string;
}

export interface WebhookLog {
  id: string;
  receivedAt: string;
  event: string;
  orderId: string;
  email: string;
  status: string;
  accepted: boolean;
  detail: string;
}

export interface DailyMetric {
  logins: number;
  recipeViews: number;
  productClicks: number;
  referralShares: number;
}

export interface AppSettings {
  appBaseUrl?: string;
  kiwifyWebhookToken: string;
  kiwifyCheckoutUrl: string;
  kiwifyAffiliateInviteUrl: string;
  updatedAt: string;
}

export interface AnalyticsData {
  totalLogins: number;
  recipeViews: Record<string, number>;
  whatsappReferralShares: number;
  daily: Record<string, DailyMetric>;
}

export interface Database {
  users: StoredUser[];
  settings: AppSettings;
  recipeImages: Record<string, RecipeImageOverride>;
  affiliateProducts: AffiliateProduct[];
  webhookLogs: WebhookLog[];
  /** Eventos da Kiwify já processados (`order_id:evento` → data ISO), para ignorar reenvios. */
  processedEvents: Record<string, string>;
  analytics: AnalyticsData;
}
