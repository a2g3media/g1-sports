// Escrow Gateway Types - No fund holding, eligibility tracking only

export type EscrowProvider = "stripe" | "paypal" | "venmo" | "manual";

export type TransactionStatus = 
  | "pending"       // Created, awaiting payment
  | "processing"    // Payment initiated with provider
  | "completed"     // Payment confirmed
  | "failed"        // Payment failed
  | "refunded"      // Payment returned
  | "disputed";     // Under review

export type TransactionIntent = 
  | "entry_fee"     // League entry fee
  | "buyback"       // Survivor pool buyback
  | "side_bet"      // Optional side pot
  | "refund";       // Return of funds

export interface EscrowTransaction {
  id: number;
  leagueId: number;
  userId: number;
  provider: EscrowProvider;
  providerTxnId: string | null;
  intentType: TransactionIntent;
  amountCents: number;
  feeCents: number;
  currency: string;
  status: TransactionStatus;
  webhookPayloadHash: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentIntent {
  leagueId: number;
  userId: number;
  intentType: TransactionIntent;
  amountCents: number;
  provider: EscrowProvider;
  returnUrl?: string;
}

export interface PaymentEligibility {
  userId: number;
  leagueId: number;
  isEligible: boolean;
  requiredAmountCents: number;
  paidAmountCents: number;
  pendingAmountCents: number;
  transactions: EscrowTransaction[];
}

export interface WebhookPayload {
  provider: EscrowProvider;
  eventType: string;
  transactionId: string;
  status: TransactionStatus;
  amountCents: number;
  timestamp: string;
  signature: string;
  rawPayload: string;
}

// Supported provider configurations
export const ESCROW_PROVIDERS: Record<EscrowProvider, {
  name: string;
  description: string;
  supportedCurrencies: string[];
  icon: string;
  isExternal: boolean;
}> = {
  stripe: {
    name: "Stripe",
    description: "Credit/debit cards via Stripe",
    supportedCurrencies: ["USD", "EUR", "GBP"],
    icon: "💳",
    isExternal: true,
  },
  paypal: {
    name: "PayPal",
    description: "PayPal account or guest checkout",
    supportedCurrencies: ["USD", "EUR", "GBP"],
    icon: "🅿️",
    isExternal: true,
  },
  venmo: {
    name: "Venmo",
    description: "Venmo mobile payments",
    supportedCurrencies: ["USD"],
    icon: "📱",
    isExternal: true,
  },
  manual: {
    name: "Manual Verification",
    description: "Cash, check, or admin-verified payment",
    supportedCurrencies: ["USD"],
    icon: "✅",
    isExternal: false,
  },
};

// Format currency for display
export function formatCurrency(amountCents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amountCents / 100);
}

// Generate a mock provider transaction ID
export function generateMockTxnId(provider: EscrowProvider): string {
  const prefix = {
    stripe: "pi_",
    paypal: "PAY-",
    venmo: "VNM",
    manual: "MAN-",
  }[provider];
  
  const random = Math.random().toString(36).substring(2, 12).toUpperCase();
  return `${prefix}${random}`;
}
