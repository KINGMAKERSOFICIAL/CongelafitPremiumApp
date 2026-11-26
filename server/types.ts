export type UserRole = 'admin' | 'member';
export type MemberStatus = 'active' | 'pending' | 'suspended' | 'refunded' | 'canceled';

export interface StoredUser {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  passwordSalt: string;
  role: UserRole;
  status: MemberStatus;
  needsPasswordSetup: boolean;
  mustChangePassword?: boolean;
  kiwifyOrderId?: string;
  kiwifySubscriptionId?: string;
  kiwifyProduct?: string;
  nextPaymentAt?: string;
  suspendedReason?: string;
  accessEmailSentAt?: string;
  accessEmailStatus?: 'sent' | 'failed' | 'outbox';
  accessEmailError?: string;
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

export type EmailTemplateType = 'welcome' | 'reactivated' | 'reset' | 'suspended' | 'test';

export interface EmailTemplateOverride {
  subject: string;
  html: string;
  updatedAt: string;
}

export interface EmailLog {
  id: string;
  sentAt: string;
  to: string;
  name: string;
  type: EmailTemplateType;
  subject: string;
  provider: 'smtp' | 'resend' | 'outbox';
  status: 'sent' | 'failed' | 'outbox';
  error?: string;
}

export interface DailyMetric {
  logins: number;
  recipeViews: number;
  productClicks: number;
  referralShares: number;
}

export type EmailProviderMode = 'auto' | 'smtp' | 'resend' | 'outbox';

export interface AppSettings {
  officialSiteUrl?: string;
  appBaseUrl?: string;
  kiwifyWebhookToken: string;
  kiwifyCheckoutUrl: string;
  kiwifyAffiliateInviteUrl: string;
  // Comunicação direta com API Pública da Kiwify (OAuth 2.0)
  kiwifyClientId?: string;
  kiwifyClientSecretEnc?: string;
  kiwifyAccountId?: string;
  kiwifyProductId?: string;
  kiwifyLastSyncAt?: string;
  // Envio de e-mail com credenciais aos alunos
  emailProvider?: EmailProviderMode;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUser?: string;
  smtpPassEnc?: string;
  resendApiKeyEnc?: string;
  emailFromName?: string;
  emailFromAddress?: string;
  sendSuspensionEmail?: boolean;
  emailTemplates?: Partial<Record<EmailTemplateType, EmailTemplateOverride>>;
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
  emailLogs: EmailLog[];
  analytics: AnalyticsData;
}
